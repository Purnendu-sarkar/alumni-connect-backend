import { describe, it, expect, vi, beforeEach } from 'vitest';
import { announcementPresenter } from '../../src/presenters/announcement.presenter.js';
import { announcementService } from '../../src/services/announcement/announcement.service.js';
import { prisma } from '../../src/config/database.js';
import { sanitizeHtml } from '../../src/utils/html-sanitizer.js';

describe('Feature 9: Institutional Announcements Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Presenter Formatting and Badges', () => {
    it('accurately identifies new announcements published within 7 days', () => {
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(announcementPresenter.isNew(recentDate)).toBe(true);

      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      expect(announcementPresenter.isNew(oldDate)).toBe(false);
      expect(announcementPresenter.isNew(null)).toBe(false);
    });

    it('accurately identifies archived announcements', () => {
      expect(announcementPresenter.isArchived({ status: 'ARCHIVED' } as any)).toBe(true);
      expect(announcementPresenter.isArchived({ status: 'PUBLISHED', archiveAt: new Date(Date.now() - 1000) } as any)).toBe(true);
      expect(announcementPresenter.isArchived({ status: 'PUBLISHED', archiveAt: new Date(Date.now() + 100000) } as any)).toBe(false);
    });
  });

  describe('Security and HTML Sanitization', () => {
    it('completely strips script tags, iframes, and dangerous onclick event handlers', () => {
      const maliciousHtml = `
        <p>Welcome to our university.</p>
        <script>alert("XSS Attack!");</script>
        <iframe src="https://attacker.com/steal"></iframe>
        <a href="https://example.com" onclick="stealCookies()">Safe Link</a>
        <img src="x" onerror="alert(1)" />
      `;

      const sanitized = sanitizeHtml(maliciousHtml);

      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('alert(');
      expect(sanitized).not.toContain('<iframe');
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).toContain('<p>Welcome to our university.</p>');
      expect(sanitized).toContain('href="https://example.com"');
      expect(sanitized).toContain('rel="noopener noreferrer"');
      expect(sanitized).toContain('target="_blank"');
    });
  });

  describe('Institutional Constraints & Business Rules', () => {
    it('enforces maximum 3 active pinned announcements rule', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'admin-1',
        universityId: 'uni-1',
      } as any);

      // Already 3 pinned
      vi.spyOn(prisma.announcement, 'count').mockResolvedValue(3);

      await expect(
        announcementService.createAnnouncement('admin-1', {
          title: 'Fourth Pinned Announcement',
          body: 'This should be blocked due to the 3-pin limit.',
          pinned: true,
        })
      ).rejects.toThrow('A maximum of 3 active pinned announcements is allowed');
    });

    it('blocks deleting a published announcement without archiving it first', async () => {
      vi.spyOn(prisma.announcement, 'findFirst').mockResolvedValue({
        id: 'ann-pub-1',
        title: 'Active Published Notice',
        status: 'PUBLISHED',
      } as any);

      await expect(
        announcementService.deleteAnnouncement('admin-1', 'ann-pub-1')
      ).rejects.toThrow('Cannot delete a published announcement. Archive it first.');
    });

    it('restricts audience-targeted announcements from unauthorized roles', async () => {
      vi.spyOn(prisma.announcement, 'findFirst').mockResolvedValue({
        id: 'ann-alumni-only',
        title: 'Exclusive Alumni Reunion Notice',
        status: 'PUBLISHED',
        audience: 'ALUMNI',
        body: 'Alumni only content',
        category: 'GENERAL',
        pinned: false,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // A STUDENT role attempts to view alumni-only announcement
      await expect(
        announcementService.getAnnouncementDetail('ann-alumni-only', 'STUDENT')
      ).rejects.toThrow('This announcement is intended for alumni only.');
    });
  });
});
