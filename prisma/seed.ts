import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, UserStatus, VerificationStatus } from '@prisma/client';

import { PERMISSIONS, rolePermissionMap } from '../src/constants/permissions.js';
import { passwordService } from '../src/services/auth/password.service.js';

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL or DIRECT_URL is required to run the seed script.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  console.log('[Seed] Starting database seeding for AlumniConnect (Single-University)...');

  // 1. Seed Permissions
  const permissionKeys = Object.values(PERMISSIONS);
  console.log(`[Seed] Upserting ${permissionKeys.length} permissions...`);

  const createdPermissions = await Promise.all(
    permissionKeys.map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: { name: key.replace(':', ' ').toUpperCase() },
        create: {
          key,
          name: key.replace(':', ' ').toUpperCase(),
          category: key.split(':')[0],
          description: `Permission allowing ${key} on AlumniConnect.`,
        },
      }),
    ),
  );

  const permissionMap = new Map(createdPermissions.map((p) => [p.key, p.id]));

  // 2. Seed RolePermission mappings
  console.log('[Seed] Linking RolePermissions for 4 core roles...');
  for (const [roleStr, keys] of Object.entries(rolePermissionMap)) {
    const role = roleStr as Role;
    for (const key of keys) {
      const permissionId = permissionMap.get(key);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            role_permissionId: {
              role,
              permissionId,
            },
          },
          update: {},
          create: {
            role,
            permissionId,
          },
        });
      }
    }
  }

  // 3. Seed System Settings
  console.log('[Seed] Configuring baseline SystemSettings...');
  const defaultSettings = [
    {
      key: 'university.name',
      value: 'North Western University',
    },
    {
      key: 'university.allowed_email_domains',
      value: ['nwu.ac.bd', 'alumni.nwu.ac.bd'],
    },
    {
      key: 'mentorship.max_active_mentees',
      value: 5,
    },
    {
      key: 'registration.require_admin_approval',
      value: true,
    },
    {
      key: 'security.session_timeout_minutes',
      value: 120,
    },
    {
      key: 'security.admin_reauth_window_minutes',
      value: 15,
    },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: {
        key: setting.key,
        value: setting.value,
      },
    });
  }

  // 4. Seed Super Admin
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || 'superadmin@nwu.ac.bd';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'SuperAdmin123!';
  const adminPasswordHash = await passwordService.hash(adminPassword);

  console.log(`[Seed] Ensuring Super Admin account (${adminEmail})...`);
  const superAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      verificationStatus: VerificationStatus.NOT_REQUIRED,
    },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      verificationStatus: VerificationStatus.NOT_REQUIRED,
    },
  });

  // Ensure Super Admin Profile
  await prisma.profile.upsert({
    where: { userId: superAdmin.id },
    update: {},
    create: {
      userId: superAdmin.id,
      fullName: 'Platform Super Admin',
      department: 'Central Administration',
      currentJob: 'System Administrator',
      bio: 'Institutional administration and security governance.',
      skills: ['System Administration', 'Security Governance'],
    },
  });

  // Ensure Super Admin Privacy Setting
  await prisma.privacySetting.upsert({
    where: { userId: superAdmin.id },
    update: {},
    create: {
      userId: superAdmin.id,
    },
  });

  console.log('[Seed] Seeding completed successfully!');
}

main()
  .catch((err) => {
    console.error('[Seed] Error seeding database:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
