import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventPresenter } from '../../src/presenters/event.presenter.js';
import { eventService } from '../../src/services/event/event.service.js';
import { prisma } from '../../src/config/database.js';
import { ApiError } from '../../src/errors/api-error.js';

describe('Feature 8: Events & RSVP System Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Presenter Privacy & Online URL Masking', () => {
    const mockEvent: any = {
      id: 'event-101',
      title: 'Annual Tech Symposium 2026',
      description: 'Grand alumni tech symposium',
      category: 'CAREER',
      organizer: 'CSE Alumni Association',
      mode: 'HYBRID',
      venue: 'Main Auditorium',
      onlineUrl: 'https://meet.google.com/xyz-tech-symposium',
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
      rsvpDeadline: null,
      capacity: 50,
      waitlistEnabled: true,
      bannerUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      status: 'PUBLISHED',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: {
        id: 'admin-1',
        name: 'Admin User',
        email: 'admin@university.edu',
      },
    };

    const counts = { going: 45, maybe: 10, notGoing: 2, waitlisted: 5 };

    it('masks onlineUrl (returns null) for unauthenticated or public viewers', () => {
      const card = eventPresenter.toEventCard(mockEvent, counts);
      expect(card.onlineUrl).toBeNull();

      const detail = eventPresenter.toEventDetail(mockEvent, counts);
      expect(detail.onlineUrl).toBeNull();
      expect(detail.onlineUrlMasked).toBe(true);
    });

    it('masks onlineUrl (returns null) for authenticated users whose status is not GOING', () => {
      const viewer = { userId: 'user-2', role: 'STUDENT', myRsvpStatus: 'MAYBE' as const };
      const detail = eventPresenter.toEventDetail(mockEvent, counts, viewer);
      expect(detail.onlineUrl).toBeNull();
      expect(detail.onlineUrlMasked).toBe(true);
    });

    it('exposes onlineUrl to authenticated attendees whose RSVP status is GOING', () => {
      const viewer = { userId: 'user-3', role: 'STUDENT', myRsvpStatus: 'GOING' as const };
      const detail = eventPresenter.toEventDetail(mockEvent, counts, viewer);
      expect(detail.onlineUrl).toBe('https://meet.google.com/xyz-tech-symposium');
      expect(detail.onlineUrlMasked).toBe(false);
    });

    it('exposes onlineUrl unconditionally to SUPER_ADMIN', () => {
      const viewer = { userId: 'super-admin-1', role: 'SUPER_ADMIN', myRsvpStatus: null };
      const detail = eventPresenter.toEventDetail(mockEvent, counts, viewer);
      expect(detail.onlineUrl).toBe('https://meet.google.com/xyz-tech-symposium');
      expect(detail.onlineUrlMasked).toBe(false);
    });

    it('correctly calculates spotsRemaining and isFull flag', () => {
      const fullCounts = { going: 50, maybe: 5, notGoing: 0, waitlisted: 3 };
      const detail = eventPresenter.toEventDetail(mockEvent, fullCounts);
      expect(detail.counts.spotsRemaining).toBe(0);
      expect(detail.counts.isFull).toBe(true);

      const openCounts = { going: 30, maybe: 5, notGoing: 0, waitlisted: 0 };
      const openDetail = eventPresenter.toEventDetail(mockEvent, openCounts);
      expect(openDetail.counts.spotsRemaining).toBe(20);
      expect(openDetail.counts.isFull).toBe(false);
    });
  });

  describe('Capacity and Concurrency Safety Guards', () => {
    it('blocks reducing event capacity below the number of confirmed GOING attendees', async () => {
      vi.spyOn(prisma.event, 'findFirst').mockResolvedValue({
        id: 'event-cap-test',
        universityId: 'uni-1',
        createdById: 'admin-1',
        title: 'Limited Workshop',
        slug: 'limited-workshop',
        description: 'Exclusive hands-on workshop',
        category: 'ACADEMIC',
        organizer: null,
        mode: 'IN_PERSON',
        venue: 'Lab 402',
        onlineUrl: null,
        startsAt: new Date(Date.now() + 86400000),
        endsAt: new Date(Date.now() + 90000000),
        rsvpDeadline: null,
        capacity: 25,
        waitlistEnabled: true,
        bannerUrl: null,
        bannerPublicId: null,
        reminderEnabled: true,
        reminderSentAt: null,
        status: 'PUBLISHED',
        cancelledAt: null,
        cancelReason: null,
        completedAt: null,
        version: 1,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Current going count is 20
      vi.spyOn(prisma.eventRsvp, 'count').mockImplementation(async (args: any) => {
        if (args?.where?.status === 'GOING') return 20;
        return 0;
      });

      // Attempt to lower capacity to 15 (less than 20 going)
      await expect(
        eventService.updateEvent('admin-1', 'event-cap-test', { capacity: 15 })
      ).rejects.toThrow(ApiError);
    });

    it('blocks deleting a published event that has confirmed attendees', async () => {
      vi.spyOn(prisma.event, 'findFirst').mockResolvedValue({
        id: 'event-del-test',
        universityId: 'uni-1',
        title: 'Active Event',
        status: 'PUBLISHED',
      } as any);

      vi.spyOn(prisma.eventRsvp, 'count').mockImplementation(async (args: any) => {
        if (args?.where?.status === 'GOING') return 12;
        return 0;
      });

      await expect(
        eventService.deleteEvent('admin-1', 'event-del-test')
      ).rejects.toThrow('Cannot delete a published event with confirmed attendees. Cancel the event instead.');
    });
  });
});
