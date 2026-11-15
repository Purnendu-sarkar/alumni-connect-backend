import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { auditLogRepository } from '../../src/repositories/audit-log.repository.js';
import { adminService } from '../../src/services/admin/admin.service.js';

describe('Security Audit Log & Immutability Architecture Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces append-only semantics by not exposing update or delete methods on repository', () => {
    expect((auditLogRepository as any).update).toBeUndefined();
    expect((auditLogRepository as any).delete).toBeUndefined();
    expect((auditLogRepository as any).deleteMany).toBeUndefined();
    expect((auditLogRepository as any).updateMany).toBeUndefined();
  });

  it('records security audit log with standardized SCREAMING_SNAKE_CASE action and result', async () => {
    const createSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({
      id: 'log-1',
      universityId: 'uni-1',
      actorId: 'admin-1',
      actorRole: 'SUPER_ADMIN',
      action: 'USER_SUSPENDED',
      targetType: 'user',
      targetId: 'user-bad',
      result: 'SUCCESS',
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      requestId: 'req-abc-123',
      metadata: { reason: 'Policy violation' },
      createdAt: new Date(),
    });

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'admin-1' } as any);

    const log = await auditLogRepository.record({
      universityId: 'uni-1',
      actorId: 'admin-1',
      actorRole: 'SUPER_ADMIN',
      action: 'USER_SUSPENDED',
      result: 'SUCCESS',
      targetType: 'user',
      targetId: 'user-bad',
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      requestId: 'req-abc-123',
      metadata: { reason: 'Policy violation' },
    });

    expect(log).toBeDefined();
    expect(createSpy).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'USER_SUSPENDED',
        result: 'SUCCESS',
        actorRole: 'SUPER_ADMIN',
        requestId: 'req-abc-123',
      }),
    });
  });

  it('gracefully handles non-existent or deleted actors by setting actorId to null', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

    const createSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({
      id: 'log-2',
      universityId: 'uni-1',
      actorId: null,
      actorRole: 'ANONYMOUS',
      action: 'LOGIN_FAILED',
      targetType: 'user',
      targetId: 'unknown',
      result: 'FAILURE',
      ip: '192.168.1.1',
      userAgent: 'curl/7.68.0',
      requestId: 'req-401',
      metadata: null,
      createdAt: new Date(),
    });

    await auditLogRepository.record({
      universityId: 'uni-1',
      actorId: 'non-existent-user-id',
      actorRole: 'ANONYMOUS',
      action: 'LOGIN_FAILED',
      result: 'FAILURE',
      ip: '192.168.1.1',
    });

    expect(createSpy).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        action: 'LOGIN_FAILED',
        result: 'FAILURE',
      }),
    });
  });

  it('delegates listAuditLogs through auditLogRepository using strict MVP without direct Prisma calls', async () => {
    const mockLogs = [
      {
        id: 'log-10',
        action: 'FORBIDDEN_ACCESS',
        actorId: 'user-hacker',
        actorRole: 'STUDENT',
        targetType: 'endpoint',
        targetId: '/api/v1/admin/stats',
        result: 'FAILURE',
        ip: '10.0.0.1',
        userAgent: 'PostmanRuntime',
        requestId: 'req-hacker-1',
        metadata: { path: '/api/v1/admin/stats' },
        createdAt: new Date('2026-11-15T12:00:00Z'),
        actor: {
          id: 'user-hacker',
          name: 'Hacker Joe',
          email: 'hacker@uni.edu',
          role: { name: 'STUDENT' },
        },
      },
    ];

    vi.spyOn(auditLogRepository, 'findPaginated').mockResolvedValue({
      logs: mockLogs as any,
      total: 1,
    });

    const result = await adminService.listAuditLogs({
      page: 1,
      limit: 10,
      action: 'FORBIDDEN_ACCESS',
      result: 'FAILURE',
    });

    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]?.action).toBe('FORBIDDEN_ACCESS');
    expect(result.logs[0]?.result).toBe('FAILURE');
    expect(result.logs[0]?.actorName).toBe('Hacker Joe');
    expect(result.meta.total).toBe(1);
  });
});
