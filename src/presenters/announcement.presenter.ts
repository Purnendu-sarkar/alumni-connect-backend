import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementStatus,
  AnnouncementAudience,
} from '../generated/prisma/client.js';

export interface AnnouncementWithAuthor extends Partial<Announcement> {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  pinned: boolean;
  status: AnnouncementStatus;
  publishAt?: Date | null;
  archiveAt?: Date | null;
  publishedAt?: Date | null;
  archivedAt?: Date | null;
  editedAt?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  author?: {
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
}

export const announcementPresenter = {
  isNew(publishedAt?: Date | null): boolean {
    if (!publishedAt) return false;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return new Date(publishedAt).getTime() > sevenDaysAgo;
  },

  isArchived(announcement: AnnouncementWithAuthor): boolean {
    if (announcement.status === 'ARCHIVED') return true;
    if (announcement.archiveAt && new Date(announcement.archiveAt).getTime() <= Date.now()) {
      return true;
    }
    return false;
  },

  getAuthorInfo(author?: AnnouncementWithAuthor['author']) {
    if (!author) return null;
    const name = author.name || author.profile?.fullName || author.email;
    const avatarUrl = author.avatarUrl || author.profile?.photoKey || null;
    return {
      id: author.id,
      name,
      avatarUrl,
      photoKey: avatarUrl,
    };
  },

  toAnnouncementCard(announcement: AnnouncementWithAuthor) {
    return {
      id: announcement.id,
      title: announcement.title,
      summary: announcement.body.replace(/<[^>]*>?/gm, '').slice(0, 180),
      category: announcement.category,
      audience: announcement.audience,
      pinned: announcement.pinned,
      status: announcement.status,
      isNew: this.isNew(announcement.publishedAt),
      isArchived: this.isArchived(announcement),
      publishAt: announcement.publishAt || null,
      publishedAt: announcement.publishedAt || announcement.createdAt,
      author: this.getAuthorInfo(announcement.author),
      createdAt: announcement.createdAt,
    };
  },

  toAnnouncementDetail(announcement: AnnouncementWithAuthor, viewerRole?: string) {
    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      category: announcement.category,
      audience: announcement.audience,
      pinned: announcement.pinned,
      status: announcement.status,
      isNew: this.isNew(announcement.publishedAt),
      isArchived: this.isArchived(announcement),
      publishAt: announcement.publishAt || null,
      archiveAt: announcement.archiveAt || null,
      publishedAt: announcement.publishedAt || announcement.createdAt,
      archivedAt: announcement.archivedAt || null,
      editedAt: announcement.editedAt || null,
      version: announcement.version,
      author: announcement.author
        ? {
            id: announcement.author.id,
            name: announcement.author.name || announcement.author.email,
            email: viewerRole === 'SUPER_ADMIN' ? announcement.author.email : undefined,
            avatarUrl: announcement.author.avatarUrl || null,
            photoKey: announcement.author.avatarUrl || null,
          }
        : null,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
    };
  },

  toAdminAnnouncement(announcement: AnnouncementWithAuthor) {
    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      category: announcement.category,
      audience: announcement.audience,
      pinned: announcement.pinned,
      status: announcement.status,
      isNew: this.isNew(announcement.publishedAt),
      isArchived: this.isArchived(announcement),
      publishAt: announcement.publishAt || null,
      archiveAt: announcement.archiveAt || null,
      publishedAt: announcement.publishedAt || null,
      archivedAt: announcement.archivedAt || null,
      editedAt: announcement.editedAt || null,
      version: announcement.version,
      author: announcement.author
        ? {
            id: announcement.author.id,
            email: announcement.author.email,
            name: announcement.author.name || announcement.author.email,
            avatarUrl: announcement.author.avatarUrl || null,
            photoKey: announcement.author.avatarUrl || null,
          }
        : null,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
    };
  },
};
