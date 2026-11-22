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

describe('Public Detail Endpoints Defense-in-Depth Gates', () => {
  it('rejects unauthenticated requests to GET /api/v1/jobs/:id with 401 Unauthorized', async () => {
    const response = await request(app).get('/api/v1/jobs/cmw-job-test-123').expect(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/Provide an access token/i);
  });

  it('rejects unauthenticated requests to GET /api/v1/events/:id with 401 Unauthorized', async () => {
    const response = await request(app).get('/api/v1/events/cmw-event-test-123').expect(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/Provide an access token/i);
  });

  it('rejects unauthenticated requests to GET /api/v1/announcements/:id with 401 Unauthorized', async () => {
    const response = await request(app).get('/api/v1/announcements/cmw-ann-test-123').expect(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/Provide an access token/i);
  });

  it('rejects unauthenticated requests to GET /api/v1/stories/:id with 401 Unauthorized', async () => {
    const response = await request(app).get('/api/v1/stories/cmw-story-test-123').expect(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/Provide an access token/i);
  });
});
