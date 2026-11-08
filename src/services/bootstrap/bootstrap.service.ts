import crypto from 'node:crypto';
import { Role, TokenType, UserStatus, VerificationStatus } from '@prisma/client';

import { env, setupTokenExpiryHours } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/database.js';
import { passwordService } from '../auth/password.service.js';
import { emailService } from '../email/email.service.js';

export async function bootstrapPlatform(): Promise<void> {
  const superAdminEmail = (env.INITIAL_SUPER_ADMIN_EMAIL || env.BOOTSTRAP_SUPER_ADMIN_EMAIL)
    ?.toLowerCase()
    .trim();

  if (!superAdminEmail) {
    logger.warn(
      '[Bootstrap] INITIAL_SUPER_ADMIN_EMAIL is not configured in environment. Skipping automatic Super Admin creation.',
    );
    return;
  }

  // 1. Check whether a Super Admin already exists in the system
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
    include: {
      tokens: {
        where: { type: TokenType.ACCOUNT_SETUP, usedAt: null },
      },
    },
  });

  if (existingSuperAdmin) {
    logger.debug('Super Admin account already exists; bootstrap skipped.');
    return;
  }

  logger.info(
    `[Bootstrap] Initializing First Super Admin account for ${env.INSTITUTION_NAME} (${superAdminEmail})...`,
  );

  // 2. Generate a cryptographically secure, single-use account setup token
  const plainToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
  const expiresAt = new Date(Date.now() + setupTokenExpiryHours * 60 * 60 * 1000);

  // 3. Generate a secure random placeholder hash (user will set their own password during setup)
  const placeholderSecret = crypto.randomUUID() + crypto.randomBytes(16).toString('hex');
  const initialPasswordHash = await passwordService.hash(placeholderSecret);

  try {
    const { superAdmin, adminName } = await prisma.$transaction(async (tx) => {
      // Re-verify inside transaction to guard against concurrent instances
      const duplicateCheck = await tx.user.findFirst({
        where: { role: Role.SUPER_ADMIN },
      });
      if (duplicateCheck) {
        return { superAdmin: duplicateCheck, adminName: env.BOOTSTRAP_SUPER_ADMIN_NAME };
      }

      const created = await tx.user.create({
        data: {
          email: superAdminEmail,
          passwordHash: initialPasswordHash,
          role: Role.SUPER_ADMIN,
          status: UserStatus.PENDING_SETUP,
          verificationStatus: VerificationStatus.NOT_REQUIRED,
        },
      });

      const profile = await tx.profile.create({
        data: {
          userId: created.id,
          fullName: env.BOOTSTRAP_SUPER_ADMIN_NAME,
          department: 'Central Administration',
          currentJob: 'Platform Super Administrator',
          bio: `System root administrator for ${env.INSTITUTION_NAME} AlumniConnect.`,
          skills: ['System Administration', 'Governance', 'Security'],
        },
      });

      await tx.privacySetting.create({
        data: {
          userId: created.id,
        },
      });

      await tx.verificationToken.create({
        data: {
          userId: created.id,
          tokenHash,
          type: TokenType.ACCOUNT_SETUP,
          expiresAt,
        },
      });

      return { superAdmin: created, adminName: profile.fullName };
    });

    // 4. Dispatch the account setup invitation email with single-use setup link
    const emailResult = await emailService.sendAccountSetupEmail(
      superAdminEmail,
      adminName,
      plainToken,
    );

    if (emailResult.deliveredViaSmtp) {
      logger.info(
        `[Bootstrap] First Super Admin provisioned (${superAdmin.email}). Setup invitation email successfully delivered via SMTP.`,
      );
    } else {
      logger.warn(
        { email: superAdminEmail, error: emailResult.error },
        `[Bootstrap] First Super Admin provisioned (${superAdmin.email}). SMTP delivery was not completed (offline or unauthenticated). Token has been captured in-memory for testing.`,
      );
    }
  } catch (err: unknown) {
    const prismaErr = err as { code?: string };
    if (prismaErr?.code === 'P2002') {
      logger.info('Super Admin account already created by concurrent worker; bootstrap cleanly skipped.');
      return;
    }
    logger.error({ err }, '[Bootstrap] Failed to bootstrap initial Super Admin.');
    throw err;
  }
}
