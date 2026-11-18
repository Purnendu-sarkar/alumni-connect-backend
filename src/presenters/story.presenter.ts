import type { StoryCategory, StoryStatus, PrivacyScope } from '../generated/prisma/client.js';

export interface StoryViewerContext {
  userId?: string;
  role?: string;
}

export interface StoryAuthorSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  batch: string | null;
  graduationYear: string | number | null;
  currentRole: string | null;
  currentCompany: string | null;
}

export interface StoryCardDto {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: StoryCategory;
  tags: string[];
  coverImageUrl: string | null;
  readingTimeMinutes: number;
  publishedAt: string | null;
  createdAt: string;
  author: StoryAuthorSummary;
}

export interface StoryDetailDto extends StoryCardDto {
  body: string;
  version: number;
  status: StoryStatus;
}

export interface AuthorStoryDetailDto extends StoryDetailDto {
  coverImagePublicId: string | null;
  embeddedMediaPublicIds: string[];
  ownerVisibleNote: string | null;
  claimedAt: string | null;
  updatedAt: string;
  moderationHistory: Array<{
    action: string;
    note: string | null;
    createdAt: string;
  }>;
}

export interface AdminStoryDetailDto extends StoryDetailDto {
  coverImagePublicId: string | null;
  embeddedMediaPublicIds: string[];
  ownerVisibleNote: string | null;
  internalNote: string | null;
  reviewerId: string | null;
  claimedAt: string | null;
  reviewer: {
    id: string;
    name: string;
    avatarUrl: string | null;
  } | null;
  updatedAt: string;
  moderationHistory: Array<{
    id: string;
    action: string;
    reasonCode: string | null;
    note: string | null;
    createdAt: string;
    moderator: {
      id: string;
      name: string;
      avatarUrl: string | null;
    } | null;
  }>;
}

function formatAuthorSummary(author: any, viewer?: StoryViewerContext): StoryAuthorSummary {
  const isOwner = viewer?.userId === author.id;
  const isPrivileged = viewer?.role === 'SUPER_ADMIN' || viewer?.role === 'MODERATOR';

  const careerVis: PrivacyScope = author.privacySetting?.careerVisibility || 'ALL_MEMBERS';
  const educationVis: PrivacyScope = author.privacySetting?.educationVisibility || 'ALL_MEMBERS';

  const canViewCareer = isOwner || isPrivileged || careerVis !== 'ONLY_ME';
  const canViewEducation = isOwner || isPrivileged || educationVis !== 'ONLY_ME';

  return {
    id: author.id,
    name: author.name,
    avatarUrl: author.avatarUrl,
    department: canViewEducation ? author.department : null,
    batch: canViewEducation ? author.batch : null,
    graduationYear: canViewEducation ? author.graduationYear : null,
    currentRole: canViewCareer ? (author.position || author.currentRole || null) : null,
    currentCompany: canViewCareer ? author.currentCompany : null,
  };
}

export const storyPresenter = {
  toStoryCard(story: any, viewer?: StoryViewerContext): StoryCardDto {
    return {
      id: story.id,
      title: story.title,
      slug: story.slug,
      summary: story.summary,
      category: story.category,
      tags: story.tags || [],
      coverImageUrl: story.coverImageUrl,
      readingTimeMinutes: story.readingTimeMinutes,
      publishedAt: story.publishedAt ? story.publishedAt.toISOString() : null,
      createdAt: story.createdAt.toISOString(),
      author: formatAuthorSummary(story.author, viewer),
    };
  },

  toStoryDetail(story: any, viewer?: StoryViewerContext): StoryDetailDto {
    const card = this.toStoryCard(story, viewer);
    return {
      ...card,
      body: story.body,
      version: story.version,
      status: story.status,
    };
  },

  toAuthorStoryDetail(story: any, viewer?: StoryViewerContext): AuthorStoryDetailDto {
    const detail = this.toStoryDetail(story, viewer);
    return {
      ...detail,
      coverImagePublicId: story.coverImagePublicId,
      embeddedMediaPublicIds: story.embeddedMediaPublicIds || [],
      ownerVisibleNote: story.ownerVisibleNote,
      claimedAt: story.claimedAt ? story.claimedAt.toISOString() : null,
      updatedAt: story.updatedAt.toISOString(),
      moderationHistory: (story.moderationHistory || []).map((h: any) => ({
        action: h.action,
        note: h.note,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  },

  toAdminStoryDetail(story: any, viewer?: StoryViewerContext): AdminStoryDetailDto {
    const detail = this.toStoryDetail(story, viewer);
    return {
      ...detail,
      coverImagePublicId: story.coverImagePublicId ?? null,
      embeddedMediaPublicIds: story.embeddedMediaPublicIds || [],
      ownerVisibleNote: story.ownerVisibleNote ?? null,
      internalNote: story.internalNote ?? null,
      reviewerId: story.reviewerId || story.reviewer?.id || null,
      claimedAt: story.claimedAt ? story.claimedAt.toISOString() : null,
      reviewer: story.reviewer
        ? {
            id: story.reviewer.id,
            name: story.reviewer.name,
            avatarUrl: story.reviewer.avatarUrl,
          }
        : null,
      updatedAt: story.updatedAt.toISOString(),
      moderationHistory: (story.moderationHistory || []).map((h: any) => ({
        id: h.id,
        action: h.action,
        reasonCode: h.reasonCode ?? null,
        note: h.note ?? null,
        createdAt: h.createdAt.toISOString(),
        moderator: h.moderator
          ? {
              id: h.moderator.id,
              name: h.moderator.name,
              avatarUrl: h.moderator.avatarUrl,
            }
          : null,
      })),
    };
  },
};
