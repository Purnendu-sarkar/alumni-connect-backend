import type { Event, EventRsvp, EventMode, EventStatus, RsvpStatus } from '../generated/prisma/client.js';

export interface EventViewerContext {
  userId?: string;
  role?: string;
  myRsvpStatus?: RsvpStatus | null;
}

export interface RsvpCounts {
  going: number;
  maybe: number;
  notGoing: number;
  waitlisted: number;
  total?: number;
}

export interface EventWithCreator extends Partial<Event> {
  id: string;
  title: string;
  slug?: string;
  description: string;
  category: string;
  organizer?: string | null;
  mode: EventMode;
  venue?: string | null;
  onlineUrl?: string | null;
  startsAt: Date;
  endsAt: Date;
  rsvpDeadline?: Date | null;
  capacity?: number | null;
  waitlistEnabled: boolean;
  bannerUrl?: string | null;
  bannerPublicId?: string | null;
  status: EventStatus;
  cancelledAt?: Date | null;
  cancelReason?: string | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: {
    id: string;
    email: string;
    name?: string | null;
    avatarUrl?: string | null;
    role?: {
      name: string;
    } | string | null;
    profile?: {
      fullName: string;
      photoKey?: string | null;
    } | null;
  } | null;
  rsvps?: Partial<EventRsvp>[];
}

export const eventPresenter = {
  shouldExposeOnlineUrl(
    viewer?: EventViewerContext,
    myRsvpStatus?: RsvpStatus | null
  ): boolean {
    if (!viewer) return false;
    if (viewer.role === 'SUPER_ADMIN') return true;
    const effectiveStatus = myRsvpStatus || viewer.myRsvpStatus;
    return effectiveStatus === 'GOING';
  },

  calculateSpotsRemaining(capacity?: number | null, goingCount: number = 0): number | null {
    if (capacity === null || capacity === undefined) return null;
    return Math.max(0, capacity - goingCount);
  },

  getOrganizerInfo(createdBy?: EventWithCreator['createdBy']) {
    if (!createdBy) return null;
    const name = createdBy.name || createdBy.profile?.fullName || createdBy.email;
    const avatarUrl = createdBy.avatarUrl || createdBy.profile?.photoKey || null;
    return {
      id: createdBy.id,
      name,
      avatarUrl,
      photoKey: avatarUrl,
    };
  },

  toEventCard(
    event: EventWithCreator,
    counts?: RsvpCounts,
    viewer?: EventViewerContext
  ) {
    const going = counts?.going ?? 0;
    const spotsRemaining = this.calculateSpotsRemaining(event.capacity, going);
    const isFull = event.capacity ? going >= event.capacity : false;
    const myRsvpStatus = viewer?.myRsvpStatus || (event.rsvps && event.rsvps[0]?.status) || null;

    const canSeeOnlineUrl = this.shouldExposeOnlineUrl(viewer, myRsvpStatus);
    const banner = event.bannerUrl || null;

    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      category: event.category,
      organizer: event.organizer || null,
      mode: event.mode,
      venue: event.venue || null,
      onlineUrl: canSeeOnlineUrl ? event.onlineUrl : null,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      rsvpDeadline: event.rsvpDeadline || null,
      capacity: event.capacity || null,
      waitlistEnabled: event.waitlistEnabled,
      bannerUrl: banner,
      bannerKey: banner,
      bannerPublicId: event.bannerPublicId || null,
      status: event.status,
      cancelledAt: event.cancelledAt || null,
      cancelReason: event.cancelReason || null,
      goingCount: going,
      waitlistedCount: counts?.waitlisted ?? 0,
      spotsRemaining,
      isFull,
      myRsvpStatus,
      organizerInfo: this.getOrganizerInfo(event.createdBy),
      createdAt: event.createdAt,
    };
  },

  toEventDetail(
    event: EventWithCreator,
    counts: RsvpCounts,
    viewer?: EventViewerContext
  ) {
    const going = counts.going;
    const spotsRemaining = this.calculateSpotsRemaining(event.capacity, going);
    const isFull = event.capacity ? going >= event.capacity : false;
    const myRsvpStatus = viewer?.myRsvpStatus || (event.rsvps && event.rsvps[0]?.status) || null;
    const canSeeOnlineUrl = this.shouldExposeOnlineUrl(viewer, myRsvpStatus);
    const banner = event.bannerUrl || null;

    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      category: event.category,
      organizer: event.organizer || null,
      mode: event.mode,
      venue: event.venue || null,
      onlineUrl: canSeeOnlineUrl ? event.onlineUrl : null,
      onlineUrlMasked: !canSeeOnlineUrl && Boolean(event.onlineUrl),
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      rsvpDeadline: event.rsvpDeadline || null,
      capacity: event.capacity || null,
      waitlistEnabled: event.waitlistEnabled,
      bannerUrl: banner,
      bannerKey: banner,
      bannerPublicId: event.bannerPublicId || null,
      status: event.status,
      cancelledAt: event.cancelledAt || null,
      cancelReason: event.cancelReason || null,
      completedAt: event.completedAt || null,
      counts: {
        going: counts.going,
        maybe: counts.maybe,
        notGoing: counts.notGoing,
        waitlisted: counts.waitlisted,
        spotsRemaining,
        isFull,
      },
      myRsvpStatus,
      organizerInfo: this.getOrganizerInfo(event.createdBy),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  },

  toAdminEvent(event: EventWithCreator, counts: RsvpCounts) {
    const going = counts.going;
    const spotsRemaining = this.calculateSpotsRemaining(event.capacity, going);
    const isFull = event.capacity ? going >= event.capacity : false;
    const banner = event.bannerUrl || null;

    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      category: event.category,
      organizer: event.organizer || null,
      mode: event.mode,
      venue: event.venue || null,
      onlineUrl: event.onlineUrl || null,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      rsvpDeadline: event.rsvpDeadline || null,
      capacity: event.capacity || null,
      waitlistEnabled: event.waitlistEnabled,
      bannerUrl: banner,
      bannerKey: banner,
      bannerPublicId: event.bannerPublicId || null,
      status: event.status,
      reminderEnabled: event.reminderEnabled ?? true,
      reminderSentAt: event.reminderSentAt || null,
      cancelledAt: event.cancelledAt || null,
      cancelReason: event.cancelReason || null,
      completedAt: event.completedAt || null,
      counts: {
        going: counts.going,
        maybe: counts.maybe,
        notGoing: counts.notGoing,
        waitlisted: counts.waitlisted,
        spotsRemaining,
        isFull,
      },
      createdBy: event.createdBy
        ? {
            id: event.createdBy.id,
            email: event.createdBy.email,
            name: event.createdBy.name || event.createdBy.email,
          }
        : null,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  },
};
