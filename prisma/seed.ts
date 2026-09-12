import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient, RoleName } from '../src/generated/prisma/client.js';
import { PERMISSIONS, rolePermissionMap } from '../src/constants/permissions.js';
import { passwordService } from '../src/services/auth/password.service.js';

const databaseUrl = process.env.DATABASE_URL;
const seedAdminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;

if (!databaseUrl || !seedAdminEmail || !seedAdminPassword) {
  throw new Error('DATABASE_URL, SEED_ADMIN_EMAIL, and SEED_ADMIN_PASSWORD are required.');
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

  const university = await prisma.university.upsert({
    where: { domain: 'example.edu' },
    update: { name: 'Demo University', slug: 'demo-university', isActive: true },
    create: { name: 'Demo University', slug: 'demo-university', domain: 'example.edu' },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
  const passwordHash = await passwordService.hash(seedAdminPassword!);

  await prisma.user.upsert({
    where: { email: seedAdminEmail! },
    update: {
      name: 'Platform Admin',
      universityId: university.id,
      roleId: adminRole.id,
      passwordHash,
      verified: true,
      isActive: true,
    },
    create: {
      name: 'Platform Admin',
      email: seedAdminEmail!,
      passwordHash,
      universityId: university.id,
      roleId: adminRole.id,
      verified: true,
    },
  });

  console.log(`Seeded ${university.name}; admin: ${seedAdminEmail!}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
