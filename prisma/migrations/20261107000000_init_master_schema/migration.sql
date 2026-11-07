-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ALUMNI', 'MODERATOR', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_EMAIL_VERIFICATION', 'PENDING_ADMIN_VERIFICATION', 'PENDING_SETUP', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'VERIFICATION_REJECTED', 'DELETION_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'ACCOUNT_SETUP');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('ONLY_ME', 'CONNECTIONS', 'VERIFIED_MEMBERS');

-- CreateEnum
CREATE TYPE "MessagingPermission" AS ENUM ('CONNECTIONS_ONLY', 'VERIFIED_MEMBERS');

-- CreateEnum
CREATE TYPE "MentorshipAvailability" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "MentorshipStatus" AS ENUM ('REQUESTED', 'CLARIFICATION_REQUESTED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MentorshipEventType" AS ENUM ('REQUESTED', 'CLARIFICATION_REQUESTED', 'CLARIFICATION_REPLIED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'ENDED');

-- CreateEnum
CREATE TYPE "CommunicationMethod" AS ENUM ('EMAIL', 'CHAT', 'VIDEO_CALL', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'CONTRACT');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ON_SITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('ANY', 'ENTRY', 'MID', 'SENIOR');

-- CreateEnum
CREATE TYPE "JobModerationAction" AS ENUM ('SUBMITTED', 'CLAIMED', 'CLAIM_RELEASED', 'CLAIM_EXPIRED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'WITHDRAWN', 'RESUBMITTED', 'UNPUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ModerationReasonCode" AS ENUM ('SPAM', 'MISLEADING', 'INCOMPLETE', 'POLICY', 'INAPPROPRIATE', 'COPYRIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'UNDER_REVIEW', 'SHORTLISTED', 'REJECTED', 'ACCEPTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EventMode" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('GOING', 'MAYBE', 'NOT_GOING', 'WAITLISTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AnnouncementCategory" AS ENUM ('GENERAL', 'ACADEMIC', 'CAREER', 'EVENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('ALL', 'STUDENTS', 'ALUMNI', 'MODERATORS');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'PUBLISHED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "StoryModerationAction" AS ENUM ('SUBMITTED', 'CLAIMED', 'CLAIM_RELEASED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'WITHDRAWN', 'RESUBMITTED', 'UNPUBLISHED', 'RESTORED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'MENTORSHIP_REQUEST', 'MENTORSHIP_ACCEPTED', 'MENTORSHIP_REJECTED', 'MENTORSHIP_CLARIFICATION', 'MENTORSHIP_ENDED', 'JOB_APPROVED', 'JOB_REJECTED', 'JOB_CHANGES_REQUESTED', 'APPLICATION_RECEIVED', 'APPLICATION_UPDATE', 'STORY_APPROVED', 'STORY_REJECTED', 'STORY_CHANGES_REQUESTED', 'STORY_UNPUBLISHED', 'EVENT_REMINDER', 'EVENT_UPDATED', 'EVENT_CANCELLED', 'ANNOUNCEMENT', 'MODERATION_RESULT', 'ACCOUNT_VERIFICATION', 'VERIFICATION_PENDING', 'SECURITY_ALERT', 'CLAIM_EXPIRED', 'WATCHLIST_ALERT', 'ESCALATION', 'ESCALATION_RESOLVED', 'RESTRICTION_APPLIED', 'RESTRICTION_ENDED', 'WARNING', 'MODERATOR_ALERT', 'SYSTEM_BROADCAST');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "BroadcastCategory" AS ENUM ('INFO', 'IMPORTANT', 'SECURITY');

-- CreateEnum
CREATE TYPE "ConversationContext" AS ENUM ('DIRECT', 'MENTORSHIP', 'JOB_APPLICATION');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('INAPPROPRIATE_CONTENT', 'FAKE_PROFILE', 'SPAM', 'MISLEADING_JOB', 'HARASSMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'JOB', 'STORY', 'MESSAGE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportActionType" AS ENUM ('CLAIMED', 'NOTE', 'NONE', 'HIDE_CONTENT', 'WARN_USER', 'RESTRICT_USER', 'ESCALATE', 'RESOLVED', 'REJECTED', 'OVERTURNED', 'TAKEN_OVER', 'REASSIGNED');

-- CreateEnum
CREATE TYPE "RestrictionType" AS ENUM ('MESSAGING', 'JOB_POSTING', 'MENTORSHIP_REQUESTS');

-- CreateEnum
CREATE TYPE "WatchlistStatus" AS ENUM ('OPEN', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('PROFILE_PHOTO', 'RESUME', 'STORY_IMAGE', 'EVENT_BANNER', 'UNIVERSITY_LOGO');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "universityId" VARCHAR(40),
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "emailVerifiedAt" TIMESTAMPTZ(6),
    "verifiedAt" TIMESTAMPTZ(6),
    "verifiedById" UUID,
    "verificationNote" VARCHAR(500),
    "suspendedAt" TIMESTAMPTZ(6),
    "suspendedUntil" TIMESTAMPTZ(6),
    "suspendReason" VARCHAR(500),
    "suspendedById" UUID,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" TIMESTAMPTZ(6),
    "lastLoginAt" TIMESTAMPTZ(6),
    "deactivatedAt" TIMESTAMPTZ(6),
    "deletionRequestedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "anonymizedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role" "Role" NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role","permissionId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "refreshTokenHash" VARCHAR(128) NOT NULL,
    "rotatedFromId" UUID,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(400),
    "deviceLabel" VARCHAR(120),
    "reauthUntil" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "revokedReason" VARCHAR(60),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_history" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "emailHash" VARCHAR(64) NOT NULL,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(400),
    "success" BOOLEAN NOT NULL,
    "failureReason" VARCHAR(60),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "TokenType" NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "otpHash" VARCHAR(128),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fullName" VARCHAR(100) NOT NULL,
    "department" VARCHAR(100),
    "program" VARCHAR(100),
    "degree" VARCHAR(100),
    "batch" INTEGER,
    "graduationYear" INTEGER,
    "bio" VARCHAR(500),
    "skills" TEXT[],
    "interests" TEXT[],
    "careerGoal" VARCHAR(200),
    "currentJob" VARCHAR(100),
    "company" VARCHAR(100),
    "industry" VARCHAR(100),
    "location" VARCHAR(100),
    "phone" VARCHAR(30),
    "links" JSONB,
    "photoKey" VARCHAR(255),
    "mentorshipStatus" "MentorshipAvailability" NOT NULL DEFAULT 'CLOSED',
    "mentorshipTopics" TEXT[],
    "maxActiveMentees" INTEGER NOT NULL DEFAULT 5,
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "company" VARCHAR(100) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "description" VARCHAR(1000),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_settings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "profileVis" "Visibility" NOT NULL DEFAULT 'VERIFIED_MEMBERS',
    "emailVis" "Visibility" NOT NULL DEFAULT 'ONLY_ME',
    "phoneVis" "Visibility" NOT NULL DEFAULT 'ONLY_ME',
    "locationVis" "Visibility" NOT NULL DEFAULT 'CONNECTIONS',
    "careerVis" "Visibility" NOT NULL DEFAULT 'VERIFIED_MEMBERS',
    "educationVis" "Visibility" NOT NULL DEFAULT 'VERIFIED_MEMBERS',
    "connectionsVis" "Visibility" NOT NULL DEFAULT 'ONLY_ME',
    "mentorshipVis" "Visibility" NOT NULL DEFAULT 'VERIFIED_MEMBERS',
    "searchVis" "Visibility" NOT NULL DEFAULT 'VERIFIED_MEMBERS',
    "messagingPermission" "MessagingPermission" NOT NULL DEFAULT 'CONNECTIONS_ONLY',
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "privacy_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "receiverId" UUID NOT NULL,
    "userLowId" UUID NOT NULL,
    "userHighId" UUID NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "note" VARCHAR(200),
    "respondedAt" TIMESTAMPTZ(6),
    "rejectedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "id" UUID NOT NULL,
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "reason" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentorship_requests" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "alumniId" UUID NOT NULL,
    "topic" VARCHAR(150) NOT NULL,
    "careerGoal" VARCHAR(300) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "preferredCommunication" "CommunicationMethod" NOT NULL,
    "availability" VARCHAR(300) NOT NULL,
    "expectedDurationWeeks" INTEGER,
    "status" "MentorshipStatus" NOT NULL DEFAULT 'REQUESTED',
    "decisionNote" VARCHAR(500),
    "clarificationQuestion" VARCHAR(1000),
    "clarificationReply" VARCHAR(1000),
    "alumniNote" VARCHAR(2000),
    "endNote" VARCHAR(500),
    "endedById" UUID,
    "respondedAt" TIMESTAMPTZ(6),
    "startedAt" TIMESTAMPTZ(6),
    "endedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mentorship_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentorship_events" (
    "id" UUID NOT NULL,
    "mentorshipId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "type" "MentorshipEventType" NOT NULL,
    "note" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentorship_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "company" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "category" VARCHAR(60) NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "workMode" "WorkMode" NOT NULL,
    "location" VARCHAR(100),
    "experienceLevel" "ExperienceLevel" NOT NULL DEFAULT 'ANY',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" VARCHAR(3),
    "deadline" TIMESTAMPTZ(6),
    "referralAvailable" BOOLEAN NOT NULL DEFAULT false,
    "requireResume" BOOLEAN NOT NULL DEFAULT false,
    "requireCoverLetter" BOOLEAN NOT NULL DEFAULT false,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMPTZ(6),
    "reviewerId" UUID,
    "claimedAt" TIMESTAMPTZ(6),
    "publishedAt" TIMESTAMPTZ(6),
    "closedAt" TIMESTAMPTZ(6),
    "closedById" UUID,
    "closedReason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_moderation_records" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "actorRole" "Role" NOT NULL,
    "action" "JobModerationAction" NOT NULL,
    "reasonCode" "ModerationReasonCode",
    "ownerVisibleNote" VARCHAR(1000),
    "internalNote" VARCHAR(1000),
    "overrideOfReviewerId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_moderation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "applicantId" UUID NOT NULL,
    "coverLetter" VARCHAR(2000),
    "resumeKey" VARCHAR(255),
    "shareProfileConsent" BOOLEAN NOT NULL DEFAULT true,
    "profileSnapshot" JSONB,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "ownerNote" VARCHAR(1000),
    "withdrawnAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_application_status_history" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "organizer" VARCHAR(100),
    "mode" "EventMode" NOT NULL,
    "venue" VARCHAR(150),
    "onlineUrl" VARCHAR(500),
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "rsvpDeadline" TIMESTAMPTZ(6),
    "capacity" INTEGER,
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bannerKey" VARCHAR(255),
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderSentAt" TIMESTAMPTZ(6),
    "publishedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "cancelReason" VARCHAR(500),
    "completedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_rsvps" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "RsvpStatus" NOT NULL,
    "waitlistedAt" TIMESTAMPTZ(6),
    "attendedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "category" "AnnouncementCategory" NOT NULL DEFAULT 'GENERAL',
    "audience" "Audience" NOT NULL DEFAULT 'ALL',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMPTZ(6),
    "archiveAt" TIMESTAMPTZ(6),
    "publishedAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "editedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "success_stories" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "coverImageKey" VARCHAR(255),
    "status" "StoryStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMPTZ(6),
    "reviewerId" UUID,
    "claimedAt" TIMESTAMPTZ(6),
    "publishedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "success_stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_moderation_records" (
    "id" UUID NOT NULL,
    "storyId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "actorRole" "Role" NOT NULL,
    "action" "StoryModerationAction" NOT NULL,
    "reasonCode" "ModerationReasonCode",
    "ownerVisibleNote" VARCHAR(1000),
    "internalNote" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_moderation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500),
    "link" VARCHAR(300),
    "metadata" JSONB,
    "broadcastId" UUID,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "audience" "Audience" NOT NULL,
    "channelInApp" BOOLEAN NOT NULL DEFAULT true,
    "channelEmail" BOOLEAN NOT NULL DEFAULT false,
    "category" "BroadcastCategory" NOT NULL DEFAULT 'INFO',
    "link" VARCHAR(300),
    "scheduledAt" TIMESTAMPTZ(6),
    "sentAt" TIMESTAMPTZ(6),
    "status" "BroadcastStatus" NOT NULL DEFAULT 'SCHEDULED',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "userLowId" UUID NOT NULL,
    "userHighId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "contextType" "ConversationContext" NOT NULL DEFAULT 'DIRECT',
    "contextId" UUID,
    "firstMessageOnly" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMPTZ(6),
    "hiddenAt" TIMESTAMPTZ(6),

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "type" "ReportType" NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "reportedUserId" UUID,
    "description" VARCHAR(1000) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewerId" UUID,
    "claimedAt" TIMESTAMPTZ(6),
    "resolverId" UUID,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolutionNote" VARCHAR(1000),
    "escalatedAt" TIMESTAMPTZ(6),
    "escalatedById" UUID,
    "overturnedAt" TIMESTAMPTZ(6),
    "overturnedById" UUID,
    "overturnReason" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_actions" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "actorRole" "Role" NOT NULL,
    "actionType" "ReportActionType" NOT NULL,
    "metadata" JSONB,
    "internalNote" VARCHAR(1000),
    "publicMessage" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_restrictions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "RestrictionType" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID NOT NULL,
    "sourceReportId" UUID,
    "revokedAt" TIMESTAMPTZ(6),
    "revokedById" UUID,
    "revokeReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ruleKey" VARCHAR(60) NOT NULL,
    "details" JSONB,
    "status" "WatchlistStatus" NOT NULL DEFAULT 'OPEN',
    "dismissedById" UUID,
    "dismissedAt" TIMESTAMPTZ(6),
    "dismissReason" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actorId" UUID,
    "actorRole" "Role",
    "action" VARCHAR(60) NOT NULL,
    "targetType" VARCHAR(40),
    "targetId" VARCHAR(64),
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(400),
    "requestId" VARCHAR(64),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "data_export_requests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "fileKey" VARCHAR(255),
    "errorMessage" VARCHAR(300),
    "requestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),

    CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "storageKey" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64),
    "originalName" VARCHAR(200),
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" VARCHAR(100) NOT NULL,
    "userId" UUID,
    "route" VARCHAR(200) NOT NULL,
    "responseCode" INTEGER,
    "responseHash" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_universityId_key" ON "users"("universityId");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_status_createdAt_idx" ON "users"("status", "createdAt");

-- CreateIndex
CREATE INDEX "users_verificationStatus_createdAt_idx" ON "users"("verificationStatus", "createdAt");

-- CreateIndex
CREATE INDEX "users_lastLoginAt_idx" ON "users"("lastLoginAt");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "sessions_familyId_idx" ON "sessions"("familyId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "login_history_userId_createdAt_idx" ON "login_history"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "login_history_emailHash_createdAt_idx" ON "login_history"("emailHash", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "login_history_success_createdAt_idx" ON "login_history"("success", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_tokenHash_key" ON "verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "verification_tokens_userId_type_usedAt_idx" ON "verification_tokens"("userId", "type", "usedAt");

-- CreateIndex
CREATE INDEX "verification_tokens_expiresAt_idx" ON "verification_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE INDEX "profiles_department_idx" ON "profiles"("department");

-- CreateIndex
CREATE INDEX "profiles_graduationYear_idx" ON "profiles"("graduationYear");

-- CreateIndex
CREATE INDEX "profiles_batch_idx" ON "profiles"("batch");

-- CreateIndex
CREATE INDEX "profiles_industry_idx" ON "profiles"("industry");

-- CreateIndex
CREATE INDEX "profiles_mentorshipStatus_idx" ON "profiles"("mentorshipStatus");

-- CreateIndex
CREATE INDEX "profiles_skills_idx" ON "profiles" USING GIN ("skills");

-- CreateIndex
CREATE INDEX "experiences_profileId_sortOrder_idx" ON "experiences"("profileId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "privacy_settings_userId_key" ON "privacy_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_type_key" ON "notification_preferences"("userId", "type");

-- CreateIndex
CREATE INDEX "connections_receiverId_status_idx" ON "connections"("receiverId", "status");

-- CreateIndex
CREATE INDEX "connections_requesterId_status_idx" ON "connections"("requesterId", "status");

-- CreateIndex
CREATE INDEX "connections_status_updatedAt_idx" ON "connections"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "connections_userLowId_userHighId_key" ON "connections"("userLowId", "userHighId");

-- CreateIndex
CREATE INDEX "user_blocks_blockedId_idx" ON "user_blocks"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "user_blocks_blockerId_blockedId_key" ON "user_blocks"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "mentorship_requests_alumniId_status_idx" ON "mentorship_requests"("alumniId", "status");

-- CreateIndex
CREATE INDEX "mentorship_requests_studentId_status_idx" ON "mentorship_requests"("studentId", "status");

-- CreateIndex
CREATE INDEX "mentorship_requests_status_updatedAt_idx" ON "mentorship_requests"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "mentorship_events_mentorshipId_createdAt_idx" ON "mentorship_events"("mentorshipId", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_status_publishedAt_idx" ON "jobs"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "jobs_status_submittedAt_idx" ON "jobs"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "jobs_ownerId_status_idx" ON "jobs"("ownerId", "status");

-- CreateIndex
CREATE INDEX "jobs_reviewerId_status_idx" ON "jobs"("reviewerId", "status");

-- CreateIndex
CREATE INDEX "jobs_category_idx" ON "jobs"("category");

-- CreateIndex
CREATE INDEX "jobs_deadline_idx" ON "jobs"("deadline");

-- CreateIndex
CREATE INDEX "job_moderation_records_jobId_createdAt_idx" ON "job_moderation_records"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "job_moderation_records_actorId_createdAt_idx" ON "job_moderation_records"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "job_applications_applicantId_status_idx" ON "job_applications"("applicantId", "status");

-- CreateIndex
CREATE INDEX "job_applications_jobId_status_idx" ON "job_applications"("jobId", "status");

-- CreateIndex
CREATE INDEX "job_applications_createdAt_idx" ON "job_applications"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_jobId_applicantId_key" ON "job_applications"("jobId", "applicantId");

-- CreateIndex
CREATE INDEX "job_application_status_history_applicationId_createdAt_idx" ON "job_application_status_history"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "events_status_startsAt_idx" ON "events"("status", "startsAt");

-- CreateIndex
CREATE INDEX "events_category_idx" ON "events"("category");

-- CreateIndex
CREATE INDEX "events_createdById_idx" ON "events"("createdById");

-- CreateIndex
CREATE INDEX "event_rsvps_eventId_status_idx" ON "event_rsvps"("eventId", "status");

-- CreateIndex
CREATE INDEX "event_rsvps_userId_status_idx" ON "event_rsvps"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_rsvps_eventId_userId_key" ON "event_rsvps"("eventId", "userId");

-- CreateIndex
CREATE INDEX "announcements_status_pinned_publishedAt_idx" ON "announcements"("status", "pinned", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "announcements_status_publishAt_idx" ON "announcements"("status", "publishAt");

-- CreateIndex
CREATE INDEX "announcements_status_archiveAt_idx" ON "announcements"("status", "archiveAt");

-- CreateIndex
CREATE INDEX "announcements_category_idx" ON "announcements"("category");

-- CreateIndex
CREATE INDEX "success_stories_status_publishedAt_idx" ON "success_stories"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "success_stories_status_submittedAt_idx" ON "success_stories"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "success_stories_authorId_status_idx" ON "success_stories"("authorId", "status");

-- CreateIndex
CREATE INDEX "success_stories_reviewerId_status_idx" ON "success_stories"("reviewerId", "status");

-- CreateIndex
CREATE INDEX "story_moderation_records_storyId_createdAt_idx" ON "story_moderation_records"("storyId", "createdAt");

-- CreateIndex
CREATE INDEX "story_moderation_records_actorId_createdAt_idx" ON "story_moderation_records"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_type_createdAt_idx" ON "notifications"("userId", "type", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_broadcastId_idx" ON "notifications"("broadcastId");

-- CreateIndex
CREATE INDEX "broadcasts_status_scheduledAt_idx" ON "broadcasts"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "broadcasts_createdAt_idx" ON "broadcasts"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_userLowId_userHighId_key" ON "conversations"("userLowId", "userHighId");

-- CreateIndex
CREATE INDEX "conversation_participants_userId_hiddenAt_idx" ON "conversation_participants"("userId", "hiddenAt");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "messages_senderId_createdAt_idx" ON "messages"("senderId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "reports_reportedUserId_status_idx" ON "reports"("reportedUserId", "status");

-- CreateIndex
CREATE INDEX "reports_reporterId_createdAt_idx" ON "reports"("reporterId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reports_reviewerId_status_idx" ON "reports"("reviewerId", "status");

-- CreateIndex
CREATE INDEX "reports_escalatedAt_idx" ON "reports"("escalatedAt");

-- CreateIndex
CREATE INDEX "report_actions_reportId_createdAt_idx" ON "report_actions"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "report_actions_actorId_createdAt_idx" ON "report_actions"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "user_restrictions_userId_type_endsAt_idx" ON "user_restrictions"("userId", "type", "endsAt");

-- CreateIndex
CREATE INDEX "user_restrictions_endsAt_revokedAt_idx" ON "user_restrictions"("endsAt", "revokedAt");

-- CreateIndex
CREATE INDEX "watchlist_items_status_createdAt_idx" ON "watchlist_items"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "watchlist_items_userId_ruleKey_status_idx" ON "watchlist_items"("userId", "ruleKey", "status");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "data_export_requests_userId_status_idx" ON "data_export_requests"("userId", "status");

-- CreateIndex
CREATE INDEX "data_export_requests_status_expiresAt_idx" ON "data_export_requests"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_files_storageKey_key" ON "uploaded_files"("storageKey");

-- CreateIndex
CREATE INDEX "uploaded_files_ownerId_purpose_idx" ON "uploaded_files"("ownerId", "purpose");

-- CreateIndex
CREATE INDEX "uploaded_files_deletedAt_idx" ON "uploaded_files"("deletedAt");

-- CreateIndex
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_settings" ADD CONSTRAINT "privacy_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_requests" ADD CONSTRAINT "mentorship_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_requests" ADD CONSTRAINT "mentorship_requests_alumniId_fkey" FOREIGN KEY ("alumniId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_events" ADD CONSTRAINT "mentorship_events_mentorshipId_fkey" FOREIGN KEY ("mentorshipId") REFERENCES "mentorship_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_events" ADD CONSTRAINT "mentorship_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_moderation_records" ADD CONSTRAINT "job_moderation_records_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_moderation_records" ADD CONSTRAINT "job_moderation_records_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application_status_history" ADD CONSTRAINT "job_application_status_history_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application_status_history" ADD CONSTRAINT "job_application_status_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "success_stories" ADD CONSTRAINT "success_stories_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "success_stories" ADD CONSTRAINT "success_stories_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_moderation_records" ADD CONSTRAINT "story_moderation_records_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "success_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_moderation_records" ADD CONSTRAINT "story_moderation_records_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "broadcasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolverId_fkey" FOREIGN KEY ("resolverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_actions" ADD CONSTRAINT "report_actions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_actions" ADD CONSTRAINT "report_actions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_restrictions" ADD CONSTRAINT "user_restrictions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_restrictions" ADD CONSTRAINT "user_restrictions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_restrictions" ADD CONSTRAINT "user_restrictions_sourceReportId_fkey" FOREIGN KEY ("sourceReportId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
