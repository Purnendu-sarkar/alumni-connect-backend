import { describe, expect, it, vi } from 'vitest';
import { DEMO_ROLES_INFO } from '../../src/dev/demo.service.js';
import { demoRoleSchema } from '../../src/dev/demo.controller.js';
import { authService } from '../../src/services/auth/auth.service.js';
import { userRepository } from '../../src/repositories/user.repository.js';
import { env } from '../../src/config/index.js';

describe('Demo Module & Production Safeguards', () => {
  it('defines fixtures for all 5 canonical demo roles', () => {
    const roles = DEMO_ROLES_INFO.map((acc) => acc.role);
    expect(roles).toContain('STUDENT');
    expect(roles).toContain('ALUMNI');
    expect(roles).toContain('MODERATOR');
    expect(roles).toContain('ADMIN');
    expect(roles).toContain('SUPER_ADMIN');
    expect(roles).toHaveLength(5);
  });

  it('rejects demo login schema for non-allowlisted roles', () => {
    expect(() => demoRoleSchema.parse({ role: 'ANONYMOUS' })).toThrow();
  });

  it('rejects regular email/password login for demo accounts when in production mode', async () => {
    // Mock user repo finding a demo user
    vi.spyOn(userRepository, 'findAuthenticatedByEmail').mockResolvedValue({
      id: 'demo-user-1',
      email: 'demo.student@sandbox.alumniconnect.internal',
      isActive: true,
      isDemo: true,
      passwordHash: 'dummy-hash',
      role: { name: 'STUDENT' },
      university: { id: 'uni-1', slug: 'demo-uni', isActive: true, domain: 'demo.edu' },
    } as any);

    // Set production environment temporarily
    const originalEnv = env.NODE_ENV;
    (env as any).NODE_ENV = 'production';

    try {
      await expect(
        authService.login('demo.student@sandbox.alumniconnect.internal', 'AnyPassword123!'),
      ).rejects.toThrow(/Demo accounts are deactivated in production/);
    } finally {
      (env as any).NODE_ENV = originalEnv;
    }
  });
});
