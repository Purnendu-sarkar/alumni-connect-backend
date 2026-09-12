import request from 'supertest';
import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/alumni_connect?schema=public';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-for-validation';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-for-validation';

const { app } = await import('../../src/app.js');

describe('GET /api/v1/health', () => {
  it('returns the service health contract and a request id', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.body).toEqual({
      success: true,
      message: 'Success',
      data: { status: 'ok', service: 'alumni-connect-api' },
    });
    expect(response.headers['x-request-id']).toBeTruthy();
  });
});
