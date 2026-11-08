import { describe, expect, it, vi, beforeEach } from 'vitest';
import { bootstrapPlatform } from '../../src/services/bootstrap/bootstrap.service.js';
import { prisma } from '../../src/config/database.js';

describe('BootstrapService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('skips bootstrap when an active Super Admin already exists', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      id: 'super-admin-existing-id',
      email: 'superadmin@nwu.ac.bd',
      role: 'SUPER_ADMIN',
    } as any);

    const createSpy = vi.spyOn(prisma.user, 'create');

    await bootstrapPlatform();

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('creates PENDING_SETUP Super Admin and sends setup email when none exists', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

    const mockCreatedUser = { id: 'new-super-admin-id', email: 'superadmin@nwu.ac.bd' };
    const mockProfile = { fullName: 'Platform Super Admin' };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx = {
        user: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockCreatedUser),
        },
        profile: {
          create: vi.fn().mockResolvedValue(mockProfile),
        },
        privacySetting: {
          create: vi.fn().mockResolvedValue({}),
        },
        verificationToken: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(mockTx);
    });

    const { emailService } = await import('../../src/services/email/email.service.js');
    const sendEmailSpy = vi.spyOn(emailService, 'sendAccountSetupEmail').mockResolvedValue({
      success: true,
      deliveredViaSmtp: false,
      token: 'test-token',
      setupUrl: 'http://localhost:3000/setup-account?token=test-token',
    });

    await bootstrapPlatform();

    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.stringContaining('@'),
      expect.any(String),
      expect.any(String),
    );
  });
});
