import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { notificationRepository } from '../../src/repositories/notification.repository.js';
import { notificationService } from '../../src/services/notification/notification.service.js';
import { userRepository } from '../../src/repositories/user.repository.js';

describe('Notification Engine & Security Scoping Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes external and malformed redirect links to null', async () => {
    const createSpy = vi.spyOn(notificationRepository, 'create').mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      type: 'SECURITY_ALERT',
      title: 'Security Alert',
      body: 'Test body',
      link: null,
      metadata: null,
      readAt: null,
      createdAt: new Date(),
    });

    vi.spyOn(notificationRepository, 'getPreferences').mockResolvedValue([]);

    await notificationService.notifyUser({
      userId: 'user-1',
      type: 'SECURITY_ALERT',
      title: 'Security Alert',
      body: 'Test body',
      link: 'https://malicious-phishing.com/steal-creds',
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        link: null,
      }),
    );
  });

  it('allows safe relative internal links starting with /', async () => {
    const createSpy = vi.spyOn(notificationRepository, 'create').mockResolvedValue({
      id: 'notif-2',
      userId: 'user-1',
      type: 'SECURITY_ALERT',
      title: 'Security Alert',
      body: 'Test body',
      link: '/student/settings/security',
      metadata: null,
      readAt: null,
      createdAt: new Date(),
    });

    vi.spyOn(notificationRepository, 'getPreferences').mockResolvedValue([]);

    await notificationService.notifyUser({
      userId: 'user-1',
      type: 'SECURITY_ALERT',
      title: 'Security Alert',
      body: 'Test body',
      link: '/student/settings/security',
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        link: '/student/settings/security',
      }),
    );
  });

  it('bypasses preference opt-outs for mandatory security alerts', async () => {
    const createSpy = vi.spyOn(notificationRepository, 'create').mockResolvedValue({
      id: 'notif-3',
      userId: 'user-1',
      type: 'SECURITY_ALERT',
      title: 'Security Notice',
      body: 'Session revoked',
      link: '/login',
      metadata: null,
      readAt: null,
      createdAt: new Date(),
    });

    // Even if user disabled inApp notifications for this type, mandatory alert must be delivered
    vi.spyOn(notificationRepository, 'getPreferences').mockResolvedValue([
      { id: 'pref-1', userId: 'user-1', type: 'SECURITY_ALERT', inApp: false, email: false, updatedAt: new Date() },
    ]);

    await notificationService.notifyUser({
      userId: 'user-1',
      type: 'SECURITY_ALERT',
      title: 'Security Notice',
      body: 'Session revoked',
      link: '/login',
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('honors opt-out for optional notification types like connection requests', async () => {
    const createSpy = vi.spyOn(notificationRepository, 'create');

    vi.spyOn(notificationRepository, 'getPreferences').mockResolvedValue([
      { id: 'pref-2', userId: 'user-1', type: 'CONNECTION_REQUEST', inApp: false, email: true, updatedAt: new Date() },
    ]);

    const result = await notificationService.notifyUser({
      userId: 'user-1',
      type: 'CONNECTION_REQUEST',
      title: 'New Connection',
      body: 'Someone wants to connect',
      link: '/student/connections',
    });

    expect(result).toBeNull();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('broadcasts notifications to active role members', async () => {
    vi.spyOn(userRepository, 'findActiveUsersByRoles').mockResolvedValue([
      { id: 'admin-1', name: 'Super Admin 1', email: 'admin1@uni.edu', universityId: 'uni-1', role: { name: 'SUPER_ADMIN' } } as any,
      { id: 'admin-2', name: 'Super Admin 2', email: 'admin2@uni.edu', universityId: 'uni-1', role: { name: 'SUPER_ADMIN' } } as any,
    ]);

    const createManySpy = vi.spyOn(notificationRepository, 'createMany').mockResolvedValue({ count: 2 });

    const notifications = await notificationService.notifyRoles({
      roles: ['SUPER_ADMIN'],
      type: 'MODERATION_RESULT',
      title: 'New Alumni Verification',
      body: 'An alumnus submitted proof',
      link: '/admin/verification/pending',
    });

    expect(notifications).toHaveLength(2);
    expect(createManySpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'admin-1', link: '/admin/verification/pending' }),
        expect.objectContaining({ userId: 'admin-2', link: '/admin/verification/pending' }),
      ]),
    );
  });

  it('marks notifications read scoped strictly to userId', async () => {
    const markSpy = vi.spyOn(notificationRepository, 'markAsRead').mockResolvedValue({ count: 1 });

    const result = await notificationService.markAsRead('notif-100', 'user-owner');
    expect(result).toEqual({ success: true });
    expect(markSpy).toHaveBeenCalledWith('notif-100', 'user-owner');
  });

  it('ensures alumni verification broadcast targets SUPER_ADMIN only and never MODERATOR', async () => {
    const notifyRolesSpy = vi.spyOn(notificationService, 'notifyRoles').mockResolvedValue([]);
    vi.spyOn(notificationRepository, 'create').mockResolvedValue({} as any);
    vi.spyOn(notificationRepository, 'getPreferences').mockResolvedValue([]);

    const { authService } = await import('../../src/services/auth/auth.service.js');
    const { passwordResetService } = await import('../../src/services/auth/password-reset.service.js');
    const { passwordService } = await import('../../src/services/auth/password.service.js');

    const mockUniversity = { id: 'uni-1', domain: 'university.edu', isActive: true };
    vi.spyOn(prisma.university, 'findFirst').mockResolvedValue(mockUniversity as any);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
    vi.spyOn(passwordService, 'hash').mockResolvedValue('hashed-password');

    const mockAlumniUser = {
      id: 'alumni-test-1',
      email: 'alumni@university.edu',
      name: 'Alumni Verification Candidate',
      roleId: 'ALUMNI',
      role: { name: 'ALUMNI' },
      universityId: 'uni-1',
      university: { id: 'uni-1', name: 'Demo Uni', slug: 'demo', domain: 'demo.edu', isActive: true },
      isActive: true,
      verified: false,
      verificationStatus: 'PENDING',
      needPasswordChange: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn(userRepository, 'create').mockResolvedValue(mockAlumniUser as any);
    vi.spyOn(passwordResetService, 'requestEmailVerification').mockResolvedValue({
      success: true,
      message: 'Email sent',
      deliveredViaSmtp: false,
    } as any);

    await authService.register({
      email: 'alumni@university.edu',
      password: 'Password123!',
      name: 'Alumni Verification Candidate',
      role: 'ALUMNI',
    });

    // Verify notifyRoles was called with SUPER_ADMIN only, NOT MODERATOR
    expect(notifyRolesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['SUPER_ADMIN'],
        link: '/admin/verification/pending',
      }),
    );
    expect(notifyRolesSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        roles: expect.arrayContaining(['MODERATOR']),
      }),
    );
  });
});
