import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient, RoleName } from '../src/generated/prisma/client.js';
import { PERMISSIONS, rolePermissionMap } from '../src/constants/permissions.js';
import { passwordService } from '../src/services/auth/password.service.js';

const databaseUrl = process.env.DATABASE_URL;
const seedAdminEmail = (
  process.env.SEED_ADMIN_EMAIL ||
  process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL ||
  'admin@example.edu'
)
  .trim()
  .toLowerCase();
const seedAdminPassword =
  process.env.SEED_ADMIN_PASSWORD ||
  process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD ||
  'SuperAdminPass123!';

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const permissionKeys = Object.values(PERMISSIONS);

async function main() {
  const permissions = await Promise.all(
    permissionKeys.map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key },
      }),
    ),
  );

  const permissionIdByKey = new Map(
    permissions.map((permission) => [permission.key, permission.id]),
  );

  await Promise.all(
    Object.values(RoleName).map(async (name) => {
      const connections = rolePermissionMap[name].map((key) => {
        const permissionId = permissionIdByKey.get(key);
        if (!permissionId) throw new Error(`Missing permission ${key}.`);
        return { id: permissionId };
      });

      return prisma.role.upsert({
        where: { name },
        update: { permissions: { set: connections } },
        create: { name, permissions: { connect: connections } },
      });
    }),
  );

  const canonicalSlug =
    process.env.BOOTSTRAP_UNIVERSITY_SLUG || 'north-western-university';
  const canonicalName =
    process.env.BOOTSTRAP_UNIVERSITY_NAME || 'North Western University';
  const canonicalDomain =
    process.env.BOOTSTRAP_UNIVERSITY_DOMAIN || 'nwu.ac.bd';

  const university = await prisma.university.upsert({
    where: { slug: canonicalSlug },
    update: {
      name: canonicalName,
      domain: canonicalDomain,
      isActive: true,
      isDemo: false,
    },
    create: {
      name: canonicalName,
      slug: canonicalSlug,
      domain: canonicalDomain,
      isActive: true,
      isDemo: false,
    },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.SUPER_ADMIN } });
  const passwordHash = await passwordService.hash(seedAdminPassword!);

  await prisma.user.upsert({
    where: { email: seedAdminEmail! },
    update: {
      name: process.env.BOOTSTRAP_SUPER_ADMIN_NAME || 'Platform Super Admin',
      universityId: university.id,
      roleId: adminRole.id,
      passwordHash,
      verified: true,
      verificationStatus: 'APPROVED',
      isActive: true,
      isDemo: false,
    },
    create: {
      name: process.env.BOOTSTRAP_SUPER_ADMIN_NAME || 'Platform Super Admin',
      email: seedAdminEmail!,
      passwordHash,
      universityId: university.id,
      roleId: adminRole.id,
      verified: true,
      verificationStatus: 'APPROVED',
      isActive: true,
      isDemo: false,
    },
  });

  const CORE_DEPARTMENTS = [
    {
      name: 'Computer Science & Engineering',
      code: 'CSE',
      faculty: 'Faculty of Science & Engineering',
      displayOrder: 1,
      description: 'Department of Computer Science & Engineering',
    },
    {
      name: 'Electrical & Electronic Engineering',
      code: 'EEE',
      faculty: 'Faculty of Science & Engineering',
      displayOrder: 2,
      description: 'Department of Electrical & Electronic Engineering',
    },
    {
      name: 'Business Administration',
      code: 'BBA',
      faculty: 'Faculty of Business Studies',
      displayOrder: 3,
      description: 'School of Business & Entrepreneurship',
    },
    {
      name: 'Economics',
      code: 'ECON',
      faculty: 'Faculty of Social Sciences',
      displayOrder: 4,
      description: 'Department of Economics & Development Policy',
    },
    {
      name: 'English',
      code: 'ENG',
      faculty: 'Faculty of Arts & Humanities',
      displayOrder: 5,
      description: 'Department of English Language & Literature',
    },
    {
      name: 'Civil Engineering',
      code: 'CE',
      faculty: 'Faculty of Science & Engineering',
      displayOrder: 6,
      description: 'Department of Civil & Environmental Engineering',
    },
  ];

  const allUniversities = await prisma.university.findMany({ where: { isActive: true } });

  for (const uni of allUniversities) {
    const seededDepartments = await Promise.all(
      CORE_DEPARTMENTS.map((dept) =>
        prisma.department.upsert({
          where: {
            universityId_name: {
              universityId: uni.id,
              name: dept.name,
            },
          },
          update: {
            code: dept.code,
            faculty: dept.faculty,
            displayOrder: dept.displayOrder,
            description: dept.description,
            isActive: true,
          },
          create: {
            universityId: uni.id,
            name: dept.name,
            code: dept.code,
            faculty: dept.faculty,
            displayOrder: dept.displayOrder,
            description: dept.description,
            isActive: true,
          },
        }),
      ),
    );

    // Link any existing users whose department string matches seeded department name or code
    for (const dept of seededDepartments) {
      await prisma.user.updateMany({
        where: {
          universityId: uni.id,
          OR: [
            { department: { equals: dept.name, mode: 'insensitive' } },
            { department: { equals: dept.code, mode: 'insensitive' } },
          ],
        },
        data: {
          departmentId: dept.id,
          department: dept.name,
        },
      });
    }
  }

  // Ensure all users have default PrivacySetting
  const allUsers = await prisma.user.findMany({ select: { id: true, role: { select: { name: true } }, privacySetting: { select: { id: true } } } });
  for (const u of allUsers) {
    if (!u.privacySetting) {
      await prisma.privacySetting.create({
        data: {
          userId: u.id,
          profileVisibility: 'ALL_MEMBERS',
          emailVisibility: 'CONNECTIONS_ONLY',
          phoneVisibility: 'ONLY_ME',
          locationVisibility: 'ALL_MEMBERS',
          careerVisibility: 'ALL_MEMBERS',
          educationVisibility: 'ALL_MEMBERS',
          skillsVisibility: 'ALL_MEMBERS',
          connectionsVisibility: 'ALL_MEMBERS',
          mentorshipVisibility: 'ALL_MEMBERS',
          searchVisibility: 'ALL_MEMBERS',
          messagingPermission: 'ALL_MEMBERS',
        },
      });
    }

    if (u.role.name === RoleName.ALUMNI) {
      await prisma.user.update({
        where: { id: u.id },
        data: {
          isMentorshipAvailable: true,
          mentorshipStatus: 'OPEN',
          maxActiveMentees: 5,
          mentorshipTopics: ['Career Guidance', 'System Design', 'Resume Review'],
        },
      });
    }
  }

  console.log(`Seeded ${university.name}; admin: ${seedAdminEmail!}; departments seeded across ${allUniversities.length} universities; privacy settings ensured.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
