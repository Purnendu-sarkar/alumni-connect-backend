import crypto from 'node:crypto';
import type { Prisma, EventStatus, EventMode, RsvpStatus } from '../../generated/prisma/client.js';

import { prisma } from '../../config/database.js';
import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { eventRepository, type EventFilterParams, type AdminEventFilterParams } from '../../repositories/event.repository.js';
import { eventRsvpRepository } from '../../repositories/event-rsvp.repository.js';
import { cacheService } from '../cache/cache.service.js';
import { eventPresenter, type EventViewerContext } from '../../presenters/event.presenter.js';
import { notificationService } from '../notification/notification.service.js';
import { sanitizeHtml } from '../../utils/html-sanitizer.js';
import { toPageMeta, type PaginationInput } from '../../utils/pagination.js';

export interface CreateEventInput {
  title: string;
  description: string;
  category?: string;
  organizer?: string | null;
  mode?: EventMode;
  venue?: string | null;
  onlineUrl?: string | null;
  startsAt: Date;
  endsAt: Date;
  rsvpDeadline?: Date | null;
  capacity?: number | null;
  waitlistEnabled?: boolean;
  bannerUrl?: string | null;
  bannerPublicId?: string | null;
  bannerKey?: string | null;
  reminderEnabled?: boolean;
  status?: EventStatus;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  category?: string;
  organizer?: string | null;
  mode?: EventMode;
  venue?: string | null;
  onlineUrl?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  rsvpDeadline?: Date | null;
  capacity?: number | null;
  waitlistEnabled?: boolean;
  bannerUrl?: string | null;
  bannerPublicId?: string | null;
  bannerKey?: string | null;
  reminderEnabled?: boolean;
  status?: EventStatus;
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
  const hash = crypto.randomBytes(3).toString('hex');
  return `${base || 'event'}-${hash}`;
}

export const eventService = {
  async listEvents(
    filters: EventFilterParams,
    pagination: PaginationInput,
    viewer?: EventViewerContext
  ) {
    const version = await cacheService.getVersion('events');
    const queryHash = crypto
      .createHash('md5')
      .update(JSON.stringify(filters) + JSON.stringify(pagination))
      .digest('hex');
    const cacheKey = `events:v${version}:${filters.tab || 'upcoming'}:${queryHash}`;

    interface CachedResult {
      events: any[];
      countsMap: Record<string, any>;
      total: number;
    }

    let cached = await cacheService.get<CachedResult>(cacheKey);

    if (!cached) {
      const { events, total } = await eventRepository.findManyPublished(filters, pagination);
      const countsMap: Record<string, any> = {};

      await Promise.all(
        events.map(async (ev) => {
          countsMap[ev.id] = await eventRepository.countRsvpsByStatus(ev.id);
        })
      );

      cached = { events, countsMap, total };
      await cacheService.set(cacheKey, cached, 120);
    }

    const userRsvpMap: Record<string, RsvpStatus> = {};
    if (viewer?.userId && cached.events.length > 0) {
      const eventIds = cached.events.map((e) => e.id);
      const userRsvps = await prisma.eventRsvp.findMany({
        where: {
          userId: viewer.userId,
          eventId: { in: eventIds },
        },
        select: { eventId: true, status: true },
      });
      userRsvps.forEach((r) => {
        userRsvpMap[r.eventId] = r.status;
      });
    }

    const items = cached.events.map((ev) => {
      const counts = cached!.countsMap[ev.id] || { going: 0, maybe: 0, notGoing: 0, waitlisted: 0 };
      const myRsvpStatus = viewer?.userId ? userRsvpMap[ev.id] || null : null;
      return eventPresenter.toEventCard(ev, counts, {
        ...viewer,
        myRsvpStatus,
      });
    });

    return {
      data: items,
      meta: toPageMeta(pagination.page, pagination.limit, cached.total),
    };
  },

  async getEventDetail(id: string, viewer?: EventViewerContext) {
    const event = await eventRepository.findById(id);
    if (!event) {
      throw ApiError.notFound('Event');
    }

    if (
      event.status !== 'PUBLISHED' &&
      viewer?.role !== 'SUPER_ADMIN' &&
      viewer?.role !== 'MODERATOR'
    ) {
      throw ApiError.notFound('Event');
    }

    const counts = await eventRepository.countRsvpsByStatus(id);

    let myRsvpStatus: RsvpStatus | null = null;
    if (viewer?.userId) {
      const rsvp = await eventRsvpRepository.findByEventAndUser(id, viewer.userId);
      if (rsvp) {
        myRsvpStatus = rsvp.status;
      }
    }

    return eventPresenter.toEventDetail(event as any, counts, {
      ...viewer,
      myRsvpStatus,
    });
  },

  async getMyRsvps(userId: string, pagination: PaginationInput) {
    const { rsvps, total } = await eventRsvpRepository.findUserRsvps(userId, pagination);

    const items = await Promise.all(
      rsvps.map(async (r) => {
        const counts = await eventRepository.countRsvpsByStatus(r.eventId);
        return {
          rsvpId: r.id,
          rsvpStatus: r.status,
          waitlistedAt: r.waitlistedAt,
          createdAt: r.createdAt,
          event: eventPresenter.toEventCard(r.event as any, counts, {
            userId,
            myRsvpStatus: r.status,
          }),
        };
      })
    );

    return {
      data: items,
      meta: toPageMeta(pagination.page, pagination.limit, total),
    };
  },

  async rsvpToEvent(eventId: string, userId: string, requestedStatus: 'GOING' | 'MAYBE' | 'NOT_GOING') {
    const result = await prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw<Array<{
        id: string;
        capacity: number | null;
        waitlistEnabled: boolean;
        status: EventStatus;
        rsvpDeadline: Date | null;
        startsAt: Date;
        endsAt: Date;
        title: string;
      }>>`SELECT id, capacity, "waitlistEnabled", status, "rsvpDeadline", "startsAt", "endsAt", title FROM "Event" WHERE id = ${eventId} FOR UPDATE`;

      const event = events[0];
      if (!event || event.status !== 'PUBLISHED') {
        throw new ApiError(404, 'Event is not available for RSVP', 'EVENT_NOT_AVAILABLE');
      }

      const now = new Date();
      if (event.startsAt < now) {
        throw new ApiError(400, 'Cannot RSVP to an event that has already started or ended', 'EVENT_PAST');
      }

      if (event.rsvpDeadline && event.rsvpDeadline < now) {
        throw new ApiError(400, 'RSVP deadline for this event has passed', 'RSVP_DEADLINE_PASSED');
      }

      let assignedStatus: RsvpStatus = requestedStatus;
      let waitlistedAt: Date | null = null;

      if (requestedStatus === 'GOING') {
        const goingCount = await tx.eventRsvp.count({
          where: { eventId, status: 'GOING' },
        });

        const existingRsvp = await tx.eventRsvp.findUnique({
          where: { eventId_userId: { eventId, userId } },
        });

        const isAlreadyGoing = existingRsvp?.status === 'GOING';

        if (!isAlreadyGoing && event.capacity !== null && goingCount >= event.capacity) {
          if (event.waitlistEnabled) {
            assignedStatus = 'WAITLISTED';
            waitlistedAt = new Date();
          } else {
            throw new ApiError(409, 'Event capacity has been reached', 'CAPACITY_REACHED');
          }
        }
      }

      const rsvp = await tx.eventRsvp.upsert({
        where: { eventId_userId: { eventId, userId } },
        create: {
          eventId,
          userId,
          status: assignedStatus,
          waitlistedAt,
        },
        update: {
          status: assignedStatus,
          waitlistedAt,
          updatedAt: new Date(),
        },
      });

      return { rsvp, assignedStatus, eventTitle: event.title };
    });

    await cacheService.bumpVersion('events');
    const counts = await eventRepository.countRsvpsByStatus(eventId);

    return {
      rsvp: result.rsvp,
      assignedStatus: result.assignedStatus,
      counts,
    };
  },

  async cancelRsvp(eventId: string, userId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw<Array<{
        id: string;
        capacity: number | null;
        waitlistEnabled: boolean;
        title: string;
      }>>`SELECT id, capacity, "waitlistEnabled", title FROM "Event" WHERE id = ${eventId} FOR UPDATE`;

      const event = events[0];
      if (!event) {
        throw ApiError.notFound('Event');
      }

      const existingRsvp = await tx.eventRsvp.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });

      if (!existingRsvp || existingRsvp.status === 'CANCELLED') {
        return { cancelled: true, promotedUser: null, eventTitle: event.title };
      }

      const wasGoing = existingRsvp.status === 'GOING';

      await tx.eventRsvp.update({
        where: { id: existingRsvp.id },
        data: {
          status: 'CANCELLED',
          waitlistedAt: null,
          updatedAt: new Date(),
        },
      });

      let promotedUser: { id: string; userId: string } | null = null;
      if (wasGoing) {
        const waitlisted = await tx.eventRsvp.findMany({
          where: { eventId, status: 'WAITLISTED' },
          orderBy: [{ waitlistedAt: 'asc' }, { createdAt: 'asc' }],
          take: 1,
        });

        if (waitlisted.length > 0 && waitlisted[0]) {
          const promoted = waitlisted[0];
          await tx.eventRsvp.update({
            where: { id: promoted.id },
            data: {
              status: 'GOING',
              waitlistedAt: null,
              updatedAt: new Date(),
            },
          });
          promotedUser = { id: promoted.id, userId: promoted.userId };
        }
      }

      return { cancelled: true, promotedUser, eventTitle: event.title };
    });

    if (result.promotedUser) {
      await notificationService.notifyUser({
        userId: result.promotedUser.userId,
        type: 'EVENT_REMINDER',
        title: `Waitlist Promotion: ${result.eventTitle}`,
        body: `A spot opened up for "${result.eventTitle}"! Your RSVP has been confirmed to Going.`,
        link: `/events/${eventId}`,
      });
    }

    await cacheService.bumpVersion('events');
    const counts = await eventRepository.countRsvpsByStatus(eventId);

    return {
      cancelled: true,
      counts,
      promotedUserId: result.promotedUser?.userId || null,
    };
  },

  // ================= ADMIN / MODERATOR METHODS =================

  async listAdminEvents(filters: AdminEventFilterParams, pagination: PaginationInput) {
    const { events, total } = await eventRepository.findManyAdmin(filters, pagination);

    const items = await Promise.all(
      events.map(async (ev) => {
        const counts = await eventRepository.countRsvpsByStatus(ev.id);
        return eventPresenter.toAdminEvent(ev as any, counts);
      })
    );

    return {
      data: items,
      meta: toPageMeta(pagination.page, pagination.limit, total),
    };
  },

  async getAdminEventDetail(id: string) {
    const event = await eventRepository.findById(id);
    if (!event) {
      throw ApiError.notFound('Event');
    }
    const counts = await eventRepository.countRsvpsByStatus(id);
    return eventPresenter.toAdminEvent(event as any, counts);
  },

  async createEvent(adminUserId: string, data: CreateEventInput) {
    const sanitizedDescription = sanitizeHtml(data.description);

    const user = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { universityId: true },
    });
    const universityId = user?.universityId || (await prisma.university.findFirst({ select: { id: true } }))?.id || '';

    const banner = data.bannerUrl || data.bannerKey || null;

    const event = await eventRepository.create({
      title: data.title,
      slug: generateSlug(data.title),
      description: sanitizedDescription,
      category: data.category || 'GENERAL',
      organizer: data.organizer || null,
      mode: data.mode || 'IN_PERSON',
      venue: data.venue || null,
      onlineUrl: data.onlineUrl || null,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      rsvpDeadline: data.rsvpDeadline || null,
      capacity: data.capacity || null,
      waitlistEnabled: data.waitlistEnabled ?? true,
      bannerUrl: banner,
      bannerPublicId: data.bannerPublicId || null,
      reminderEnabled: data.reminderEnabled ?? true,
      status: data.status || 'DRAFT',
      university: { connect: { id: universityId } },
      createdBy: { connect: { id: adminUserId } },
    });

    await cacheService.bumpVersion('events');

    await auditLogRepository.record({
      universityId,
      actorId: adminUserId,
      action: 'EVENT_CREATED',
      targetType: 'EVENT',
      targetId: event.id,
      metadata: { title: event.title, status: event.status },
    });

    const counts = await eventRepository.countRsvpsByStatus(event.id);
    return eventPresenter.toAdminEvent(event as any, counts);
  },

  async updateEvent(adminUserId: string, id: string, data: UpdateEventInput) {
    const existing = await eventRepository.findById(id);
    if (!existing) {
      throw ApiError.notFound('Event');
    }

    const currentCounts = await eventRepository.countRsvpsByStatus(id);

    if (
      data.capacity !== undefined &&
      data.capacity !== null &&
      data.capacity < currentCounts.going
    ) {
      throw new ApiError(
        400,
        `New capacity (${data.capacity}) cannot be less than confirmed attendees (${currentCounts.going})`,
        'CAPACITY_BELOW_GOING'
      );
    }

    let newlyPromotedCount = 0;

    if (
      (data.capacity === null || (data.capacity && data.capacity > (existing.capacity || 0))) &&
      currentCounts.waitlisted > 0
    ) {
      await prisma.$transaction(async (tx) => {
        const availableSlots =
          data.capacity === null
            ? currentCounts.waitlisted
            : (data.capacity ?? 0) - currentCounts.going;

        if (availableSlots > 0) {
          const waitlistedToPromote = await tx.eventRsvp.findMany({
            where: { eventId: id, status: 'WAITLISTED' },
            orderBy: [{ waitlistedAt: 'asc' }, { createdAt: 'asc' }],
            take: availableSlots,
          });

          for (const item of waitlistedToPromote) {
            await tx.eventRsvp.update({
              where: { id: item.id },
              data: { status: 'GOING', waitlistedAt: null, updatedAt: new Date() },
            });
            newlyPromotedCount++;

            await notificationService.notifyUser({
              userId: item.userId,
              type: 'EVENT_REMINDER',
              title: `Waitlist Promotion: ${existing.title}`,
              body: `A spot opened up for "${existing.title}" due to expanded capacity! Your RSVP is now Going.`,
              link: `/events/${id}`,
            });
          }
        }
      });
    }

    const updateData: Prisma.EventUpdateInput = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = sanitizeHtml(data.description);
    if (data.category !== undefined) updateData.category = data.category;
    if (data.organizer !== undefined) updateData.organizer = data.organizer;
    if (data.mode !== undefined) updateData.mode = data.mode;
    if (data.venue !== undefined) updateData.venue = data.venue;
    if (data.onlineUrl !== undefined) updateData.onlineUrl = data.onlineUrl;
    if (data.startsAt !== undefined) updateData.startsAt = data.startsAt;
    if (data.endsAt !== undefined) updateData.endsAt = data.endsAt;
    if (data.rsvpDeadline !== undefined) updateData.rsvpDeadline = data.rsvpDeadline;
    if (data.capacity !== undefined) updateData.capacity = data.capacity;
    if (data.waitlistEnabled !== undefined) updateData.waitlistEnabled = data.waitlistEnabled;
    if (data.bannerUrl !== undefined || data.bannerKey !== undefined) {
      updateData.bannerUrl = data.bannerUrl || data.bannerKey || null;
    }
    if (data.bannerPublicId !== undefined) updateData.bannerPublicId = data.bannerPublicId;
    if (data.reminderEnabled !== undefined) updateData.reminderEnabled = data.reminderEnabled;
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    updateData.version = { increment: 1 };

    const updated = await eventRepository.update(id, updateData);
    await cacheService.bumpVersion('events');

    const isMaterialChange =
      (data.startsAt && data.startsAt.getTime() !== existing.startsAt.getTime()) ||
      (data.venue && data.venue !== existing.venue) ||
      (data.onlineUrl && data.onlineUrl !== existing.onlineUrl);

    if (existing.status === 'PUBLISHED' && isMaterialChange) {
      const attendees = await prisma.eventRsvp.findMany({
        where: { eventId: id, status: { in: ['GOING', 'MAYBE'] } },
        select: { userId: true },
      });

      for (const att of attendees) {
        await notificationService.notifyUser({
          userId: att.userId,
          type: 'EVENT_REMINDER',
          title: `Event Updated: ${updated.title}`,
          body: `Key details (date/time/venue) for "${updated.title}" have changed. Please review the event page.`,
          link: `/events/${id}`,
        });
      }
    }

    await auditLogRepository.record({
      universityId: existing.universityId,
      actorId: adminUserId,
      action: 'EVENT_UPDATED',
      targetType: 'EVENT',
      targetId: id,
      metadata: { changes: Object.keys(data), newlyPromotedCount },
    });

    const newCounts = await eventRepository.countRsvpsByStatus(id);
    return eventPresenter.toAdminEvent(updated as any, newCounts);
  },

  async publishEvent(adminUserId: string, id: string) {
    const existing = await eventRepository.findById(id);
    if (!existing) throw ApiError.notFound('Event');

    if (existing.status === 'PUBLISHED') {
      throw new ApiError(400, 'Event is already published', 'ALREADY_PUBLISHED');
    }

    const updated = await eventRepository.update(id, {
      status: 'PUBLISHED',
      version: { increment: 1 },
    });

    await cacheService.bumpVersion('events');

    await auditLogRepository.record({
      universityId: existing.universityId,
      actorId: adminUserId,
      action: 'EVENT_PUBLISHED',
      targetType: 'EVENT',
      targetId: id,
      metadata: { title: updated.title },
    });

    const counts = await eventRepository.countRsvpsByStatus(id);
    return eventPresenter.toAdminEvent(updated as any, counts);
  },

  async cancelEvent(adminUserId: string, id: string, cancelReason: string) {
    const existing = await eventRepository.findById(id);
    if (!existing) throw ApiError.notFound('Event');

    if (existing.status === 'CANCELLED') {
      throw new ApiError(400, 'Event is already cancelled', 'ALREADY_CANCELLED');
    }

    const updated = await eventRepository.update(id, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason,
      version: { increment: 1 },
    });

    await cacheService.bumpVersion('events');

    const attendees = await prisma.eventRsvp.findMany({
      where: { eventId: id, status: { in: ['GOING', 'MAYBE', 'WAITLISTED'] } },
      select: { userId: true },
    });

    for (const att of attendees) {
      await notificationService.notifyUser({
        userId: att.userId,
        type: 'EVENT_REMINDER',
        title: `Event Cancelled: ${existing.title}`,
        body: `The event "${existing.title}" has been cancelled. Reason: ${cancelReason}`,
        link: `/events/${id}`,
      });
    }

    await auditLogRepository.record({
      universityId: existing.universityId,
      actorId: adminUserId,
      action: 'EVENT_CANCELLED',
      targetType: 'EVENT',
      targetId: id,
      metadata: { title: existing.title, cancelReason },
    });

    const counts = await eventRepository.countRsvpsByStatus(id);
    return eventPresenter.toAdminEvent(updated as any, counts);
  },

  async completeEvent(adminUserId: string, id: string) {
    const existing = await eventRepository.findById(id);
    if (!existing) throw ApiError.notFound('Event');

    const updated = await eventRepository.update(id, {
      status: 'COMPLETED',
      completedAt: new Date(),
      version: { increment: 1 },
    });

    await cacheService.bumpVersion('events');

    await auditLogRepository.record({
      universityId: existing.universityId,
      actorId: adminUserId,
      action: 'EVENT_COMPLETED',
      targetType: 'EVENT',
      targetId: id,
      metadata: { title: existing.title },
    });

    const counts = await eventRepository.countRsvpsByStatus(id);
    return eventPresenter.toAdminEvent(updated as any, counts);
  },

  async duplicateEvent(adminUserId: string, id: string) {
    const source = await eventRepository.findById(id);
    if (!source) throw ApiError.notFound('Event');

    const duration = source.endsAt.getTime() - source.startsAt.getTime();
    const newStartsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const newEndsAt = new Date(newStartsAt.getTime() + duration);

    const duplicate = await eventRepository.create({
      title: `Copy of ${source.title}`.slice(0, 120),
      slug: generateSlug(`Copy of ${source.title}`),
      description: source.description,
      category: source.category,
      organizer: source.organizer,
      mode: source.mode,
      venue: source.venue,
      onlineUrl: source.onlineUrl,
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      rsvpDeadline: source.rsvpDeadline ? new Date(newStartsAt.getTime() - 24 * 60 * 60 * 1000) : null,
      capacity: source.capacity,
      waitlistEnabled: source.waitlistEnabled,
      bannerUrl: source.bannerUrl,
      bannerPublicId: source.bannerPublicId,
      reminderEnabled: source.reminderEnabled,
      status: 'DRAFT',
      university: { connect: { id: source.universityId } },
      createdBy: { connect: { id: adminUserId } },
    });

    await cacheService.bumpVersion('events');

    await auditLogRepository.record({
      universityId: source.universityId,
      actorId: adminUserId,
      action: 'EVENT_DUPLICATED',
      targetType: 'EVENT',
      targetId: duplicate.id,
      metadata: { sourceId: id, newTitle: duplicate.title },
    });

    const counts = await eventRepository.countRsvpsByStatus(duplicate.id);
    return eventPresenter.toAdminEvent(duplicate as any, counts);
  },

  async deleteEvent(adminUserId: string, id: string) {
    const existing = await eventRepository.findById(id);
    if (!existing) throw ApiError.notFound('Event');

    const counts = await eventRepository.countRsvpsByStatus(id);
    if (existing.status === 'PUBLISHED' && counts.going > 0) {
      throw new ApiError(
        400,
        'Cannot delete a published event with confirmed attendees. Cancel the event instead.',
        'DELETE_ACTIVE_EVENT_BLOCKED'
      );
    }

    await eventRepository.softDelete(id);
    await cacheService.bumpVersion('events');

    await auditLogRepository.record({
      universityId: existing.universityId,
      actorId: adminUserId,
      action: 'EVENT_DELETED',
      targetType: 'EVENT',
      targetId: id,
      metadata: { title: existing.title },
    });

    return { success: true };
  },

  async getEventAttendees(
    eventId: string,
    status: RsvpStatus | 'ALL' = 'ALL',
    pagination: PaginationInput,
    q?: string
  ) {
    const event = await eventRepository.findById(eventId);
    if (!event) throw ApiError.notFound('Event');

    const { attendees, total } = await eventRsvpRepository.findEventAttendees(
      eventId,
      status,
      pagination,
      q
    );

    return {
      data: attendees,
      meta: toPageMeta(pagination.page, pagination.limit, total),
    };
  },
};
