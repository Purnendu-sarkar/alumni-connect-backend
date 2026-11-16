
export interface PosterSummary {
  id: string;
  name: string;
  email?: string;
  phone?: string | null;
  phonePublic?: boolean;
  currentCompany?: string | null;
  position?: string | null;
  department?: string | null;
  batch?: string | null;
  avatarUrl?: string | null;
  verified?: boolean;
}

export interface ModerationRecordItem {
  id: string;
  action: string;
  reasonCode?: string | null;
  ownerVisibleNote?: string | null;
  internalNote?: string | null;
  createdAt: Date | string;
  actor?: { id: string; name: string; email?: string } | null;
}

export interface JobCardSource {
  id: string;
  universityId?: string;
  postedById: string;
  title: string;
  company: string;
  category?: string | null;
  employmentType?: string | null;
  workMode?: string | null;
  experienceLevel?: string | null;
  location?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  deadline: Date | string;
  referralAvailable?: boolean;
  requireResume?: boolean;
  requireCoverLetter?: boolean;
  status: string;
  publishedAt?: Date | string | null;
  createdAt: Date | string;
  applicationUrl?: string | null;
  applicationEmail?: string | null;
  _count?: { applications?: number } | null;
  postedBy?: PosterSummary | null;
  description?: string;
  requirements?: string | null;
  moderations?: ModerationRecordItem[];
  reviewer?: { id: string; name: string; email?: string } | null;
  [key: string]: unknown;
}

export type JobWithRelations = JobCardSource;

export interface ViewerContext {
  userId?: string;
  role?: string;
  hasApplied?: boolean;
  applicationStatus?: string | null;
}

export const jobPresenter = {
  formatSalary(min?: number | null, max?: number | null, currency?: string | null): string {
    const cur = currency || 'BDT';
    if (min && max) {
      return `${cur} ${min.toLocaleString()} - ${max.toLocaleString()}`;
    }
    if (min && !max) {
      return `From ${cur} ${min.toLocaleString()}`;
    }
    if (!min && max) {
      return `Up to ${cur} ${max.toLocaleString()}`;
    }
    return 'Negotiable / Undisclosed';
  },

  computeDaysLeft(deadline: Date | string): number {
    const end = new Date(deadline).getTime();
    const now = Date.now();
    const diff = end - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  },

  computeRiskHints(job: JobWithRelations): string[] {
    const hints: string[] = [];
    const desc = (job.description || '') + ' ' + (job.requirements || '');

    // Check for external contact info inside text
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(desc)) {
      hints.push('Contains inline email addresses in job description.');
    }
    if (/(\+?8801|01)[3-9]\d{8}/.test(desc)) {
      hints.push('Contains inline mobile phone numbers in job description.');
    }
    if (/(telegram|whatsapp|t\.me|wa\.me)/i.test(desc)) {
      hints.push('Mentions off-platform messaging channels (Telegram/WhatsApp).');
    }
    if (/(crypto|bitcoin|usdt|forex|earn money fast|guaranteed income)/i.test(desc)) {
      hints.push('Contains keywords commonly associated with investment or employment scams.');
    }
    if (job.salaryMin && job.salaryMin > 500000) {
      hints.push('Unusually high entry compensation for local campus roles (> 500,000 BDT).');
    }
    if (!job.postedBy?.verified) {
      hints.push('Author account has not completed official university verification.');
    }

    return hints;
  },

  toPublishedCard(job: JobWithRelations, viewer?: ViewerContext) {
    const poster = job.postedBy;
    return {
      id: job.id,
      title: job.title,
      company: job.company,
      category: job.category || 'General',
      employmentType: job.employmentType || 'FULL_TIME',
      workMode: job.workMode || 'ON_SITE',
      experienceLevel: job.experienceLevel || 'ANY',
      location: job.location || 'Remote',
      salary: this.formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency),
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      deadline: job.deadline,
      daysLeft: this.computeDaysLeft(job.deadline),
      referralAvailable: job.referralAvailable,
      requireResume: job.requireResume,
      requireCoverLetter: job.requireCoverLetter,
      status: job.status,
      publishedAt: job.publishedAt || job.createdAt,
      createdAt: job.createdAt,
      applicationUrl: job.applicationUrl || null,
      applicationEmail: job.applicationEmail || null,
      applicantCount: job._count?.applications ?? 0,
      hasApplied: viewer?.hasApplied ?? false,
      myApplicationStatus: viewer?.applicationStatus ?? null,
      isOwner: viewer?.userId ? viewer.userId === job.postedById : false,
      poster: poster
        ? {
            id: poster.id,
            name: poster.name,
            currentCompany: poster.currentCompany,
            position: poster.position,
            department: poster.department,
            batch: poster.batch,
            avatarUrl: poster.avatarUrl,
            verified: poster.verified,
          }
        : null,
    };
  },

  toDetailView(job: JobWithRelations, viewer?: ViewerContext) {
    const card = this.toPublishedCard(job, viewer);
    return {
      ...card,
      description: job.description,
      requirements: job.requirements || null,
      moderationFeedback:
        job.postedById === viewer?.userId && job.moderations && job.moderations.length > 0 && job.moderations[0]
          ? {
              action: job.moderations[0].action,
              note: job.moderations[0].ownerVisibleNote || null,
              date: job.moderations[0].createdAt,
            }
          : null,
    };
  },

  toOwnerDetail(job: JobWithRelations, applicationCounts: Record<string, number> = {}) {
    return {
      id: job.id,
      title: job.title,
      company: job.company,
      category: job.category,
      description: job.description,
      requirements: job.requirements,
      employmentType: job.employmentType,
      workMode: job.workMode,
      experienceLevel: job.experienceLevel,
      location: job.location,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      deadline: job.deadline,
      daysLeft: this.computeDaysLeft(job.deadline),
      referralAvailable: job.referralAvailable,
      requireResume: job.requireResume,
      requireCoverLetter: job.requireCoverLetter,
      status: job.status,
      submittedAt: job.submittedAt,
      claimedAt: job.claimedAt,
      publishedAt: job.publishedAt,
      closedAt: job.closedAt,
      closedReason: job.closedReason,
      applicationUrl: job.applicationUrl,
      applicationEmail: job.applicationEmail,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      applicationCounts,
      // Strictly expose only owner-visible moderation notes without internal notes or reviewer ID
      moderationHistory: (job.moderations || []).map((m) => ({
        id: m.id,
        action: m.action,
        ownerVisibleNote: m.ownerVisibleNote || null,
        createdAt: m.createdAt,
      })),
    };
  },

  toModerationDetail(job: JobWithRelations) {
    const riskHints = this.computeRiskHints(job);

    return {
      id: job.id,
      title: job.title,
      company: job.company,
      category: job.category,
      description: job.description,
      requirements: job.requirements,
      employmentType: job.employmentType,
      workMode: job.workMode,
      experienceLevel: job.experienceLevel,
      location: job.location,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      salaryFormatted: this.formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency),
      deadline: job.deadline,
      daysLeft: this.computeDaysLeft(job.deadline),
      referralAvailable: job.referralAvailable,
      requireResume: job.requireResume,
      requireCoverLetter: job.requireCoverLetter,
      status: job.status,
      submittedAt: job.submittedAt,
      claimedAt: job.claimedAt,
      publishedAt: job.publishedAt,
      closedAt: job.closedAt,
      closedReason: job.closedReason,
      applicationUrl: job.applicationUrl,
      applicationEmail: job.applicationEmail,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      applicantCount: job._count?.applications ?? 0,
      riskHints,
      reviewer: job.reviewer
        ? { id: job.reviewer.id, name: job.reviewer.name, email: job.reviewer.email }
        : null,
      postedBy: job.postedBy
        ? {
            id: job.postedBy.id,
            name: job.postedBy.name,
            email: job.postedBy.email,
            phone: job.postedBy.phone,
            currentCompany: job.postedBy.currentCompany,
            position: job.postedBy.position,
            department: job.postedBy.department,
            batch: job.postedBy.batch,
            verified: job.postedBy.verified,
          }
        : null,
      moderationHistory: (job.moderations || []).map((m) => ({
        id: m.id,
        action: m.action,
        reasonCode: m.reasonCode || null,
        ownerVisibleNote: m.ownerVisibleNote || null,
        internalNote: m.internalNote || null,
        createdAt: m.createdAt,
        actor: m.actor ? { id: m.actor.id, name: m.actor.name } : null,
      })),
    };
  },
};
