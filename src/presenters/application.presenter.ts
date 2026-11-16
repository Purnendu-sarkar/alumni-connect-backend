import type { JobApplication } from '../generated/prisma/client.js';

export interface ApplicantSummary {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  phonePublic?: boolean;
  department?: string | null;
  batch?: string | null;
  studentId?: string | null;
  currentCompany?: string | null;
  position?: string | null;
  avatarUrl?: string | null;
  verified?: boolean;
  verificationStatus?: string;
  isActive?: boolean;
}

export interface ApplicationHistoryItem {
  id: string;
  fromStatus?: string | null;
  toStatus: string;
  note?: string | null;
  createdAt: Date | string;
  changedBy?: { id: string; name: string } | null;
}

export interface ApplicationWithRelations extends JobApplication {
  job?: {
    id: string;
    title: string;
    company: string;
    location?: string | null;
    category?: string | null;
    employmentType?: string | null;
    workMode?: string | null;
    status?: string | null;
    deadline?: Date | string | null;
    postedById?: string | null;
  } | null;
  applicant?: ApplicantSummary | null;
  history?: ApplicationHistoryItem[];
}

export const applicationPresenter = {
  toCandidateView(app: ApplicationWithRelations) {
    return {
      id: app.id,
      jobId: app.jobId,
      status: app.status,
      coverLetter: app.coverLetter || app.message || null,
      hasResume: Boolean(app.resumeKey),
      shareProfileConsent: app.shareProfileConsent,
      withdrawnAt: app.withdrawnAt,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      job: app.job
        ? {
            id: app.job.id,
            title: app.job.title,
            company: app.job.company,
            location: app.job.location || 'Remote',
            category: app.job.category || 'General',
            employmentType: app.job.employmentType || 'FULL_TIME',
            workMode: app.job.workMode || 'ON_SITE',
            status: app.job.status,
            deadline: app.job.deadline,
          }
        : null,
      // Candidate sees the status timeline, but NEVER sees the private ownerNote
      timeline: (app.history || []).map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        note: h.note,
        createdAt: h.createdAt,
      })),
    };
  },

  toOwnerCandidateView(app: ApplicationWithRelations) {
    const candidate = app.applicant;
    return {
      id: app.id,
      jobId: app.jobId,
      applicantId: app.applicantId,
      status: app.status,
      coverLetter: app.coverLetter || app.message || null,
      hasResume: Boolean(app.resumeKey),
      resumeKey: app.resumeKey || null,
      shareProfileConsent: app.shareProfileConsent,
      profileSnapshot: app.profileSnapshot || null,
      ownerNote: app.ownerNote || null,
      withdrawnAt: app.withdrawnAt,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      candidate: candidate
        ? {
            id: candidate.id,
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phonePublic ? candidate.phone : null,
            department: candidate.department,
            batch: candidate.batch,
            studentId: candidate.studentId,
            currentCompany: candidate.currentCompany,
            position: candidate.position,
            avatarUrl: candidate.avatarUrl,
            verified: candidate.verified,
            isActive: candidate.isActive,
          }
        : null,
      timeline: (app.history || []).map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        note: h.note,
        createdAt: h.createdAt,
        actor: h.changedBy ? { id: h.changedBy.id, name: h.changedBy.name } : null,
      })),
    };
  },
};
