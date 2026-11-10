import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { tokenService } from '../../src/services/auth/token.service.js';
import { userRepository } from '../../src/repositories/user.repository.js';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/alumni_connect?schema=public';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-for-validation';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-for-validation';

const { app } = await import('../../src/app.js');

describe('Admin Stats API Authorization (/api/v1/admin/stats)', () => {
  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const response = await request(app).get('/api/v1/admin/stats').expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/Provide an access token/i);
  });

  it('rejects student requests with 403 Forbidden', async () => {
    vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
      id: 'student-id-1',
      universityId: 'uni-1',
      isActive: true,
      verified: true,
      roleId: 'STUDENT',
      role: {
        id: 'role-stu',
        name: 'STUDENT',
        permissions: [],
      },
      university: {
        id: 'uni-1',
        name: 'Demo Uni',
        slug: 'demo',
        domain: 'demo.edu',
        isActive: true,
      },
    } as any);

    const studentToken = tokenService.createAccessToken({
      userId: 'student-id-1',
      universityId: 'uni-1',
      role: 'STUDENT',
    });

    const response = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/forbidden|permission/i);
  });
});
