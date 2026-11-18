import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateReadingTime, sanitizeStoryHtml } from '../../src/utils/html-sanitizer.js';
import { storyService } from '../../src/services/story/story.service.js';
import { storyModerationService } from '../../src/services/story/story-moderation.service.js';
import { storyRepository } from '../../src/repositories/story.repository.js';
import { storyModerationRepository } from '../../src/repositories/story-moderation.repository.js';
import { auditLogRepository } from '../../src/repositories/audit-log.repository.js';
import { universityRepository } from '../../src/repositories/university.repository.js';
import { cacheService } from '../../src/services/cache/cache.service.js';
import { notificationService } from '../../src/services/notification/notification.service.js';
import { ApiError } from '../../src/errors/api-error.js';

describe('Feature 10: Success Stories Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);
  });

  describe('Rich-Media HTML Sanitizer & Security', () => {
    const cloudName = 'alumni-cloud';

    it('allows verified Cloudinary image and video elements with safe formatting', () => {
      const rawHtml = `
        <h2>My Engineering Milestone</h2>
        <p>A transformative journey at the university labs.</p>
        <figure>
          <img src="https://res.cloudinary.com/alumni-cloud/image/upload/stories/lab.webp" alt="Distributed Lab" />
          <figcaption>Fig 1: High throughput test cluster</figcaption>
        </figure>
        <video src="https://res.cloudinary.com/alumni-cloud/video/upload/stories/demo.mp4" controls preload="metadata"></video>
      `;

      const sanitized = sanitizeStoryHtml(rawHtml, cloudName);

      expect(sanitized).toContain('<h2>My Engineering Milestone</h2>');
      expect(sanitized).toContain('https://res.cloudinary.com/alumni-cloud/image/upload/stories/lab.webp');
      expect(sanitized).toContain('https://res.cloudinary.com/alumni-cloud/video/upload/stories/demo.mp4');
      expect(sanitized).toContain('controls');
      expect(sanitized).toContain('preload="metadata"');
      expect(sanitized).toContain('rounded-xl max-w-full my-6 shadow-sm');
    });

    it('strictly strips non-Cloudinary images, tracking pixels, and external media', () => {
      const rawHtml = `
        <p>Narrative text</p>
        <img src="https://tracker.attacker.com/pixel.png" alt="Tracker" />
        <img src="https://external-site.com/image.jpg" alt="External" />
      `;

      const sanitized = sanitizeStoryHtml(rawHtml, cloudName);
      expect(sanitized).not.toContain('tracker.attacker.com');
      expect(sanitized).not.toContain('external-site.com');
      expect(sanitized).not.toContain('<img');
    });

    it('strips all XSS vectors including script, iframe, onload, and javascript URI', () => {
      const xssHtml = `
        <script>alert('pwned')</script>
        <iframe src="javascript:alert(1)"></iframe>
        <a href="javascript:stealCookie()">Click here</a>
        <img src="https://res.cloudinary.com/alumni-cloud/safe.jpg" onerror="alert(2)" />
      `;

      const sanitized = sanitizeStoryHtml(xssHtml, cloudName);
      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('<iframe');
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).toContain('https://res.cloudinary.com/alumni-cloud/safe.jpg');
    });

    it('neutralizes attribute breakout via single-quoted type on source tag and strips media when cloudName is empty', () => {
      const breakoutHtml = `
        <figure>
          <video controls>
            <source src="https://res.cloudinary.com/alumni-cloud/video/upload/demo.mp4" type='video/mp4" onerror="alert(1)' />
          </video>
        </figure>
      `;

      const sanitized = sanitizeStoryHtml(breakoutHtml, cloudName);
      expect(sanitized).toContain('type="video/mp4"');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).not.toContain('alert(1)');

      const strippedNoCloud = sanitizeStoryHtml(breakoutHtml, '');
      expect(strippedNoCloud).not.toContain('<video');
      expect(strippedNoCloud).not.toContain('<source');
      expect(strippedNoCloud).not.toContain('res.cloudinary.com');
    });

    it('accurately calculates estimated reading time', () => {
      const shortText = '<p>Short story with only a few words.</p>';
      expect(calculateReadingTime(shortText)).toBe(1);

      const longWords = Array.from({ length: 450 }, (_, i) => `word${i}`).join(' ');
      const longHtml = `<p>${longWords}</p>`;
      expect(calculateReadingTime(longHtml)).toBe(3); // 450 / 200 = 2.25 -> 3 mins
    });
  });

  describe('Story Lifecycle & Bait-and-Switch Protection', () => {
    const authorId = 'alumni-author-1';
    const universityId = 'uni-1';

    it('creates story draft and sanitizes content', async () => {
      vi.spyOn(storyRepository, 'create').mockImplementation(async (data: any) => ({
        id: 'story-101',
        universityId,
        authorId,
        title: data.title,
        slug: data.slug,
        summary: data.summary,
        body: data.body,
        category: data.category,
        tags: data.tags,
        coverImageUrl: null,
        coverImagePublicId: null,
        embeddedMediaPublicIds: [],
        readingTimeMinutes: data.readingTimeMinutes,
        status: 'DRAFT',
        version: 1,
        ownerVisibleNote: null,
        claimedAt: null,
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: {
          id: authorId,
          name: 'Alumni Author',
          email: 'alumni@univ.edu',
          avatarUrl: null,
          department: 'CSE',
          batch: '2016',
          graduationYear: 2020,
          currentCompany: 'Tech Corp',
          currentRole: 'Staff Engineer',
          status: 'ACTIVE',
          isActive: true,
        },
        moderationHistory: [],
      } as any));

      const story = await storyService.createStory(authorId, universityId, {
        title: 'Building Resilient Distributed Systems',
        summary: 'Lessons learned architecting systems at scale.',
        body: '<p>Core foundations matter more than fleeting frameworks.</p>',
        submitNow: false,
      });

      expect(story.id).toBe('story-101');
      expect(story.status).toBe('DRAFT');
      expect(story.readingTimeMinutes).toBe(1);
    });

    it('blocks withdrawing a story that has already been claimed by a moderator', async () => {
      vi.spyOn(storyRepository, 'findById').mockResolvedValue({
        id: 'story-claimed-test',
        authorId,
        status: 'UNDER_REVIEW',
        reviewerId: 'mod-1',
      } as any);

      await expect(
        storyService.withdrawStory('story-claimed-test', authorId, universityId)
      ).rejects.toThrow(ApiError);
    });

    it('automatically transitions PUBLISHED story back to UNDER_REVIEW when narrative is modified', async () => {
      vi.spyOn(storyRepository, 'findById').mockResolvedValue({
        id: 'story-pub-edit',
        authorId,
        universityId,
        title: 'Original Title',
        summary: 'Original Summary that is long enough',
        body: '<p>Original body narrative</p>',
        status: 'PUBLISHED',
        embeddedMediaPublicIds: [],
      } as any);

      const bumpSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(1);
      const modRecordSpy = vi.spyOn(storyModerationRepository, 'record').mockResolvedValue({} as any);
      const notifyRolesSpy = vi.spyOn(notificationService, 'notifyRoles').mockResolvedValue([]);

      vi.spyOn(storyRepository, 'update').mockImplementation(async (_id: string, data: any) => ({
        id: 'story-pub-edit',
        authorId,
        title: data.title || 'Original Title',
        summary: 'Original Summary that is long enough',
        body: data.body || '<p>Original body narrative</p>',
        status: data.status || 'PUBLISHED',
        category: 'CAREER_MILESTONE',
        tags: [],
        coverImageUrl: null,
        readingTimeMinutes: 1,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        author: {
          id: authorId,
          name: 'Alumni Author',
          status: 'ACTIVE',
          isActive: true,
        },
        moderationHistory: [],
      } as any));

      const updated = await storyService.updateStory('story-pub-edit', authorId, universityId, {
        title: 'Drastically Modified Title',
      });

      expect(bumpSpy).toHaveBeenCalledWith('stories');
      expect(modRecordSpy).toHaveBeenCalled();
      expect(notifyRolesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          roles: ['MODERATOR', 'SUPER_ADMIN'],
          link: '/moderator/content',
        })
      );
      expect(updated.title).toBe('Drastically Modified Title');
    });

    it('resolves canonical university for unauthenticated public story listing', async () => {
      vi.spyOn(universityRepository, 'findCanonical').mockResolvedValue({
        id: 'canonical-uni-1',
        name: 'North Western University',
        slug: 'nwu',
        domain: 'nwu.edu',
        isActive: true,
      });
      vi.spyOn(cacheService, 'getVersion').mockResolvedValue(1);
      vi.spyOn(cacheService, 'get').mockResolvedValue(null);
      vi.spyOn(cacheService, 'set').mockResolvedValue(undefined);
      const findSpy = vi.spyOn(storyRepository, 'findManyPublished').mockResolvedValue({
        stories: [],
        total: 0,
      });

      const res = await storyService.listPublishedStories('', {}, { page: 1, limit: 12 });
      expect(findSpy).toHaveBeenCalledWith('canonical-uni-1', {}, { page: 1, limit: 12 });
      expect(res.data).toEqual([]);
    });
  });

  describe('Editorial Moderation & Concurrency Guards', () => {
    const universityId = 'uni-1';
    const moderatorId = 'mod-1';

    it('returns 409 ALREADY_CLAIMED when another moderator attempts to claim the same story', async () => {
      vi.spyOn(storyRepository, 'atomicClaim').mockResolvedValue({ count: 0 });

      await expect(
        storyModerationService.claimStory('story-race-test', universityId, moderatorId)
      ).rejects.toThrow(ApiError);
    });

    it('approves story, sets status to PUBLISHED, invalidates cache, and notifies author', async () => {
      vi.spyOn(storyRepository, 'findById').mockResolvedValue({
        id: 'story-approve-test',
        universityId,
        authorId: 'author-10',
        title: 'Scaling Systems',
        status: 'UNDER_REVIEW',
        reviewerId: moderatorId,
      } as any);

      vi.spyOn(storyRepository, 'update').mockResolvedValue({
        id: 'story-approve-test',
        universityId,
        authorId: 'author-10',
        title: 'Scaling Systems',
        slug: 'scaling-systems',
        summary: 'Scaling systems summary',
        body: '<p>Body</p>',
        status: 'PUBLISHED',
        category: 'TECH_INNOVATION',
        tags: [],
        coverImageUrl: null,
        readingTimeMinutes: 2,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        author: {
          id: 'author-10',
          name: 'Author Name',
          status: 'ACTIVE',
          isActive: true,
        },
        moderationHistory: [],
      } as any);

      const bumpSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(1);
      const notifySpy = vi.spyOn(notificationService, 'notifyUser').mockResolvedValue(null as any);
      const modRecordSpy = vi.spyOn(storyModerationRepository, 'record').mockResolvedValue({} as any);

      const result = await storyModerationService.approveStory(
        'story-approve-test',
        universityId,
        moderatorId
      );

      expect(result.status).toBe('PUBLISHED');
      expect(bumpSpy).toHaveBeenCalledWith('stories');
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'author-10',
          type: 'STORY_REVIEW',
        })
      );
      expect(modRecordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPROVE',
        })
      );
    });

    it('rejects story with mandatory feedback reason and notifies author', async () => {
      vi.spyOn(storyRepository, 'findById').mockResolvedValue({
        id: 'story-reject-test',
        universityId,
        authorId: 'author-20',
        title: 'Misleading Guide',
        status: 'UNDER_REVIEW',
      } as any);

      vi.spyOn(storyRepository, 'update').mockResolvedValue({
        id: 'story-reject-test',
        universityId,
        authorId: 'author-20',
        title: 'Misleading Guide',
        slug: 'misleading-guide',
        summary: 'Summary',
        body: '<p>Body</p>',
        status: 'REJECTED',
        category: 'GENERAL_INSIGHT',
        tags: [],
        coverImageUrl: null,
        readingTimeMinutes: 1,
        publishedAt: null,
        ownerVisibleNote: 'Content does not meet institutional editorial guidelines.',
        createdAt: new Date(),
        updatedAt: new Date(),
        author: {
          id: 'author-20',
          name: 'Author Name',
          status: 'ACTIVE',
          isActive: true,
        },
        moderationHistory: [],
      } as any);

      const notifySpy = vi.spyOn(notificationService, 'notifyUser').mockResolvedValue(null as any);
      const modRecordSpy = vi.spyOn(storyModerationRepository, 'record').mockResolvedValue({} as any);

      const result = await storyModerationService.rejectStory(
        'story-reject-test',
        universityId,
        moderatorId,
        'Content does not meet institutional editorial guidelines.'
      );

      expect(result.status).toBe('REJECTED');
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'author-20',
          type: 'STORY_REVIEW',
        })
      );
      expect(modRecordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REJECT',
        })
      );
    });

    it('prevents another moderator from approving a story claimed by a different moderator', async () => {
      vi.spyOn(storyRepository, 'findById').mockResolvedValue({
        id: 'story-owned-by-other',
        universityId,
        authorId: 'author-30',
        title: 'Claimed Story',
        status: 'UNDER_REVIEW',
        reviewerId: 'other-moderator-99',
      } as any);

      await expect(
        storyModerationService.approveStory('story-owned-by-other', universityId, moderatorId, 'MODERATOR')
      ).rejects.toThrow(ApiError);
    });

    it('blocks moderating a DRAFT story that has not been submitted', async () => {
      vi.spyOn(storyRepository, 'findById').mockResolvedValue({
        id: 'story-draft-guard',
        universityId,
        authorId: 'author-31',
        title: 'Draft Story',
        status: 'DRAFT',
        reviewerId: null,
      } as any);

      await expect(
        storyModerationService.rejectStory(
          'story-draft-guard',
          universityId,
          moderatorId,
          'Cannot reject a private draft story.',
          undefined,
          'MODERATOR'
        )
      ).rejects.toThrow(ApiError);
    });
  });
});
