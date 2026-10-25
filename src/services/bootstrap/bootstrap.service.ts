import { PERMISSIONS, rolePermissionMap } from '../../constants/permissions.js';
import { RoleName } from '../../generated/prisma/client.js';
import { prisma } from '../../config/database.js';
import { env } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { passwordService } from '../auth/password.service.js';

// Constant advisory lock key for concurrent startup synchronization
const BOOTSTRAP_ADVISORY_LOCK_ID = 98234123;

export class BootstrapService {
  /**
   * Initializes canonical permissions, roles, and verifies/creates the permanent Super Admin.
   * Completely idempotent and concurrency-safe via PostgreSQL transaction advisory lock.
   */
  async initialize(): Promise<{ status: 'existing' | 'created'; superAdminId: string }> {
    logger.info('Starting system initialization & role/permission verification...');

    // Step 1: Ensure canonical roles & permissions exist
    await this.ensureRolesAndPermissions();

    // Step 2: Ensure permanent Super Admin within an isolated transaction & advisory lock
    return await prisma.$transaction(async (tx) => {
      // Acquire PostgreSQL session/transaction advisory lock to prevent race conditions across multi-instance boots
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK_ID})`;

      // Find any existing non-demo Super Admin
      const existingSuperAdmin = await tx.user.findFirst({
        where: {
          role: { name: RoleName.SUPER_ADMIN },
          isDemo: false,
        },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
        },
      });

      if (existingSuperAdmin) {
        logger.info(
          { superAdminId: existingSuperAdmin.id },
          'Permanent platform Super Admin is verified. Existing credentials & profile preserved.',
        );
        return { status: 'existing', superAdminId: existingSuperAdmin.id };
      }

      // If no Super Admin exists, bootstrap credentials are required
      const bootstrapEmail = env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
      const bootstrapPassword = env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;

      if (!bootstrapEmail || !bootstrapPassword) {
        throw new Error(
          'Actionable Bootstrap Error: No permanent Super Admin was found in the database. ' +
            'You must configure BOOTSTRAP_SUPER_ADMIN_EMAIL and BOOTSTRAP_SUPER_ADMIN_PASSWORD ' +
            'in your environment to safely bootstrap the platform owner.',
        );
      }

      // Check for email collision with an existing non-Super Admin user
      const existingUserWithEmail = await tx.user.findUnique({
        where: { email: bootstrapEmail },
        include: { role: true },
      });

      if (existingUserWithEmail) {
        throw new Error(
          `Actionable Bootstrap Conflict: The configured BOOTSTRAP_SUPER_ADMIN_EMAIL '${bootstrapEmail}' ` +
            `is already registered to user '${existingUserWithEmail.name}' with role '${existingUserWithEmail.role.name}'. ` +
            'Automatic privilege escalation of normal users is strictly prohibited. ' +
            'Please specify a distinct BOOTSTRAP_SUPER_ADMIN_EMAIL in your environment.',
        );
      }

      // Ensure primary institutional/system tenant exists
      const university = await tx.university.upsert({
        where: { slug: env.BOOTSTRAP_UNIVERSITY_SLUG },
        update: {
          isActive: true,
          name: env.BOOTSTRAP_UNIVERSITY_NAME,
        },
        create: {
          name: env.BOOTSTRAP_UNIVERSITY_NAME,
          slug: env.BOOTSTRAP_UNIVERSITY_SLUG,
          domain: env.BOOTSTRAP_UNIVERSITY_DOMAIN,
          isActive: true,
          isDemo: false,
        },
      });

      const superAdminRole = await tx.role.findUniqueOrThrow({
        where: { name: RoleName.SUPER_ADMIN },
      });

      const passwordHash = await passwordService.hash(bootstrapPassword);

      const created = await tx.user.create({
        data: {
          email: bootstrapEmail,
          passwordHash,
          name: env.BOOTSTRAP_SUPER_ADMIN_NAME,
          universityId: university.id,
          roleId: superAdminRole.id,
          verified: true,
          verificationStatus: 'APPROVED',
          verifiedAt: new Date(),
          onboardingCompleted: true,
          isActive: true,
          isDemo: false,
        },
        select: {
          id: true,
          email: true,
        },
      });

      // Mask email for logging (e.g. su***in@domain.com)
      const [localPart = 'admin', domain = 'internal'] = bootstrapEmail.split('@');
      const maskedEmail = `${localPart.slice(0, 2)}***@${domain}`;

      logger.info(
        { superAdminId: created.id, maskedEmail },
        'Permanent Super Admin successfully bootstrapped and secured.',
      );

      return { status: 'created', superAdminId: created.id };
    });
  }

  /**
   * Idempotently seeds canonical permissions and roles without destroying any custom permissions.
   */
  async ensureRolesAndPermissions(): Promise<void> {
    const permissionKeys = Object.values(PERMISSIONS);

    // 1. Upsert all canonical permissions
    const permissions = await Promise.all(
      permissionKeys.map((key) =>
        prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, description: `Permission to ${key}` },
        }),
      ),
    );

    const permissionIdByKey = new Map(
      permissions.map((permission) => [permission.key, permission.id]),
    );

    // 2. Upsert all canonical roles and associate permissions
    await Promise.all(
      Object.values(RoleName).map(async (name) => {
        const mappedKeys = rolePermissionMap[name] ?? [];
        const permissionConnects = mappedKeys
          .map((key) => {
            const id = permissionIdByKey.get(key);
            return id ? { id } : null;
          })
          .filter(Boolean) as { id: string }[];

        return prisma.role.upsert({
          where: { name },
          update: {
            permissions: {
              connect: permissionConnects,
            },
          },
          create: {
            name,
            description: `Default system role for ${name}`,
            permissions: {
              connect: permissionConnects,
            },
          },
        });
      }),
    );
  }
}

export const bootstrapService = new BootstrapService();
