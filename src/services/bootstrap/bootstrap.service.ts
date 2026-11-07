import { Role, UserStatus, VerificationStatus } from '@prisma/client';

import { env } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/database.js';
import { passwordService } from '../auth/password.service.js';

export async function bootstrapPlatform(): Promise<void> {
  const superAdminEmail = (env.BOOTSTRAP_SUPER_ADMIN_EMAIL || 'superadmin@nwu.ac.bd').toLowerCase().trim();
  const superAdminPassword = env.BOOTSTRAP_SUPER_ADMIN_PASSWORD || 'SuperAdmin123!';

  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
  });

  if (existingSuperAdmin) {
    logger.debug('Super Admin account already exists; bootstrap skipped.');
    return;
  }

  logger.info(`Bootstrapping initial Super Admin account for ${env.INSTITUTION_NAME} (${superAdminEmail})...`);

  const passwordHash = await passwordService.hash(superAdminPassword);

  const superAdmin = await prisma.user.create({
    data: {
      email: superAdminEmail,
      passwordHash,
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      verificationStatus: VerificationStatus.NOT_REQUIRED,
    },
  });

  await prisma.profile.create({
    data: {
      userId: superAdmin.id,
      fullName: env.BOOTSTRAP_SUPER_ADMIN_NAME,
      department: 'Central Administration',
      currentJob: 'Platform Super Administrator',
      bio: `System root administrator for ${env.INSTITUTION_NAME} AlumniConnect.`,
      skills: ['System Administration', 'Governance', 'Security'],
    },
  });

  await prisma.privacySetting.create({
    data: {
      userId: superAdmin.id,
    },
  });

  logger.info('Platform Super Admin successfully bootstrapped.');
}
