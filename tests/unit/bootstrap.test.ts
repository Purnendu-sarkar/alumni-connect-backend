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
});
