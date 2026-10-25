import { describe, expect, it, vi, beforeEach } from 'vitest';
import { bootstrapService } from '../../src/services/bootstrap/bootstrap.service.js';
import { prisma } from '../../src/config/database.js';

describe('BootstrapService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureRolesAndPermissions', () => {
    it('is idempotent and creates canonical roles without duplicating', async () => {
      vi.spyOn(prisma.permission, 'upsert').mockResolvedValue({ id: 'perm-1', key: 'perm:key' } as any);
      vi.spyOn(prisma.role, 'upsert').mockResolvedValue({ id: 'role-1' } as any);

      await expect(bootstrapService.ensureRolesAndPermissions()).resolves.toBeUndefined();
      expect(prisma.role.upsert).toHaveBeenCalledTimes(5); // STUDENT, ALUMNI, MODERATOR, ADMIN, SUPER_ADMIN
    });
  });

  describe('initialize', () => {
    it('returns existing status when an active non-demo Super Admin already exists', async () => {
      vi.spyOn(bootstrapService, 'ensureRolesAndPermissions').mockResolvedValue();

      const mockTx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        $queryRaw: vi.fn().mockResolvedValue([]),
        user: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'super-admin-existing-id',
            email: 'owner@example.edu',
            name: 'Original Platform Owner',
            isDemo: false,
          }),
          findUnique: vi.fn(),
          create: vi.fn(),
        },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await bootstrapService.initialize();

      expect(result).toEqual({
        status: 'existing',
        superAdminId: 'super-admin-existing-id',
      });
      // Should not create or overwrite existing credentials
      expect(mockTx.user.create).not.toHaveBeenCalled();
    });

    it('rejects with error if configured bootstrap email collides with an existing normal user', async () => {
      vi.spyOn(bootstrapService, 'ensureRolesAndPermissions').mockResolvedValue();

      const mockTx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        $queryRaw: vi.fn().mockResolvedValue([]),
        user: {
          findFirst: vi.fn().mockResolvedValue(null), // No existing super admin
          findUnique: vi.fn().mockResolvedValue({
            id: 'normal-user-id',
            email: 'admin@platform.internal',
            role: { name: 'STUDENT' },
          }),
        },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      await expect(bootstrapService.initialize()).rejects.toThrow(
        /Actionable Bootstrap Conflict/,
      );
    });
  });
});
