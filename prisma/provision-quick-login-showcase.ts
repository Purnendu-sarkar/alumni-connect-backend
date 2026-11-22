/**
 * Idempotent 360-Degree Quick-Login Showcase Data Enrichment Script
 *
 * Populates real, interconnected, rich-media production data across Features 1 through 11
 * for the 4 canonical Quick-Role Access accounts under North Western University:
 *   - SUPER_ADMIN: dsr102.purnendu@gmail.com (Platform Super Admin)
 *   - MODERATOR:   mod.cse.islam@nwu.ac.bd (Kazi Moinul Islam)
 *   - ALUMNI:      arif.gazi.2016.21@alumni.nwu.ac.bd (Arif Gazi)
 *   - STUDENT:     2022101013@nwu.ac.bd (Soumya Miah)
 *
 * 100% Pure English Latin characters (0 Bengali characters).
 */

import {
  ApplicationStatus,
  ConnectionStatus,
  ConversationContext,
  JobStatus,
  MessageDeliveryStatus,
  MessageType,
  NotificationType,
  ReportStatus,
  ReportType,
  RoleName,
  RsvpStatus,
  StoryCategory,
  StoryModerationAction,
  StoryStatus,
} from '../src/generated/prisma/client.js';
import { prisma } from '../src/config/database.js';
import { redisClient, isRedisAvailable } from '../src/config/redis.js';
import { cacheService } from '../src/services/cache/cache.service.js';

const UNIVERSITY_SLUG = 'north-western-university';

async function main() {
  console.log('==============================================================================');
  console.log('>>> [START] 360-DEGREE QUICK-LOGIN SHOWCASE PROVISIONING');
  console.log('==============================================================================');

  // STEP 1: Verify University and the 4 Canonical Accounts
  console.log('\n>>> [STEP 1/9] Resolving Canonical University & Showcase Accounts...');
  const university = await prisma.university.findFirstOrThrow({
    where: { slug: UNIVERSITY_SLUG },
  });
  console.log(`[OK] University: "${university.name}" (ID: ${university.id})`);

  const [superAdmin, moderator, alumni, student] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { email: 'dsr102.purnendu@gmail.com' } }),
    prisma.user.findFirstOrThrow({ where: { email: 'mod.cse.islam@nwu.ac.bd' } }),
    prisma.user.findFirstOrThrow({ where: { email: 'arif.gazi.2016.21@alumni.nwu.ac.bd' } }),
    prisma.user.findFirstOrThrow({ where: { email: '2022101013@nwu.ac.bd' } }),
  ]);

  console.log(`[OK] Super Admin: "${superAdmin.name}" (${superAdmin.email})`);
  console.log(`[OK] Moderator:   "${moderator.name}" (${moderator.email})`);
  console.log(`[OK] Alumni:      "${alumni.name}" (${alumni.email})`);
  console.log(`[OK] Student:     "${student.name}" (${student.email})`);

  // Fetch peripheral verified NWU users for mutual connections and requests
  const peerStudents = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: 'STUDENT' },
      id: { not: student.id },
      isActive: true,
      verificationStatus: 'APPROVED',
    },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });

  const peerAlumni = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: 'ALUMNI' },
      id: { not: alumni.id },
      isActive: true,
      verificationStatus: 'APPROVED',
    },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });

  if (peerStudents.length < 5 || peerAlumni.length < 5) {
    throw new Error('Insufficient peer accounts found in database. Run users:provision first.');
  }

  // STEP 2: Feature 4 — Mutual Connections & Connection Requests
  console.log('\n>>> [STEP 2/9] Provisioning Feature 4 Connections & Requests...');

  async function ensureConnection(
    reqId: string,
    recId: string,
    status: ConnectionStatus,
    msg: string,
  ) {
    const userLowId = reqId < recId ? reqId : recId;
    const userHighId = reqId < recId ? recId : reqId;

    await prisma.connection.upsert({
      where: { requesterId_recipientId: { requesterId: reqId, recipientId: recId } },
      update: {
        status,
        userLowId,
        userHighId,
        message: msg,
        respondedAt: status === ConnectionStatus.ACCEPTED ? new Date() : null,
      },
      create: {
        universityId: university.id,
        requesterId: reqId,
        recipientId: recId,
        userLowId,
        userHighId,
        status,
        message: msg,
        respondedAt: status === ConnectionStatus.ACCEPTED ? new Date() : null,
      },
    });
  }

  // Mutual ACCEPTED connections among showcase accounts
  await ensureConnection(alumni.id, student.id, ConnectionStatus.ACCEPTED, 'Excited to connect for career mentorship and software engineering guidance.');
  await ensureConnection(alumni.id, moderator.id, ConnectionStatus.ACCEPTED, 'Privileged to stay connected with our respected departmental faculty.');
  await ensureConnection(alumni.id, superAdmin.id, ConnectionStatus.ACCEPTED, 'Connecting regarding alumni chapter initiatives and governance.');
  await ensureConnection(student.id, moderator.id, ConnectionStatus.ACCEPTED, 'Department faculty mentorship and course guidance.');
  await ensureConnection(student.id, superAdmin.id, ConnectionStatus.ACCEPTED, 'Student body networking and platform feedback.');

  // Additional ACCEPTED connections with peripheral students & alumni
  for (let i = 0; i < 4; i++) {
    const pAlumni = peerAlumni[i]!;
    const pStudent = peerStudents[i]!;
    await ensureConnection(alumni.id, pAlumni.id, ConnectionStatus.ACCEPTED, 'Connecting with fellow NWU alumni.');
    await ensureConnection(pStudent.id, alumni.id, ConnectionStatus.ACCEPTED, 'Thank you for connecting and sharing your industry experience.');
    await ensureConnection(student.id, pStudent.id, ConnectionStatus.ACCEPTED, 'Connecting with CSE classmates.');
    await ensureConnection(pAlumni.id, student.id, ConnectionStatus.ACCEPTED, 'Glad to support current NWU undergraduate students.');
  }

  // Incoming & Outgoing PENDING Requests for actionable tabs
  // For Student:
  await ensureConnection(peerStudents[4]!.id, student.id, ConnectionStatus.PENDING, 'Hey Soumya, let us connect for the upcoming semester capstone project.');
  await ensureConnection(peerStudents[5]!.id, student.id, ConnectionStatus.PENDING, 'Would love to discuss distributed systems study notes.');
  await ensureConnection(peerAlumni[4]!.id, student.id, ConnectionStatus.PENDING, 'I noticed your GitHub projects. Happy to share backend tips.');
  await ensureConnection(student.id, peerAlumni[5]!.id, ConnectionStatus.PENDING, 'Hello, I am seeking guidance on cloud infrastructure careers.');
  await ensureConnection(student.id, peerAlumni[6]!.id, ConnectionStatus.PENDING, 'Would value the opportunity to connect with an engineering senior.');
  await ensureConnection(student.id, peerStudents[6]!.id, ConnectionStatus.PENDING, 'Connecting for competitive programming study sessions.');

  // For Alumni:
  await ensureConnection(peerStudents[7]!.id, alumni.id, ConnectionStatus.PENDING, 'Respected Sir, seeking career advice on corporate recruitment.');
  await ensureConnection(peerStudents[8]!.id, alumni.id, ConnectionStatus.PENDING, 'Would love to connect regarding business administration opportunities.');
  await ensureConnection(peerAlumni[7]!.id, alumni.id, ConnectionStatus.PENDING, 'Hey Arif, let us catch up on corporate HR best practices.');
  await ensureConnection(alumni.id, peerAlumni[8]!.id, ConnectionStatus.PENDING, 'Connecting with fellow class of 2016 graduates.');
  await ensureConnection(alumni.id, peerAlumni[9]!.id, ConnectionStatus.PENDING, 'Glad to connect across executive leadership circles.');

  // For Moderator:
  await ensureConnection(peerStudents[9]!.id, moderator.id, ConnectionStatus.PENDING, 'Respected Sir, requesting connection for academic consultation.');
  await ensureConnection(moderator.id, peerAlumni[10]!.id, ConnectionStatus.PENDING, 'Connecting with our valued department alumnus.');

  // STEP 3: Feature 4 — Realistic Block Records (Blocked Members Tab)
  console.log('\n>>> [STEP 3/9] Provisioning Feature 4 Blocks...');
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: student.id, blockedId: peerStudents[14]!.id } },
    update: { reason: 'Unsolicited promotional spam messages' },
    create: { blockerId: student.id, blockedId: peerStudents[14]!.id, reason: 'Unsolicited promotional spam messages' },
  });
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: student.id, blockedId: peerStudents[15]!.id } },
    update: { reason: 'Persistent unwanted messaging' },
    create: { blockerId: student.id, blockedId: peerStudents[15]!.id, reason: 'Persistent unwanted messaging' },
  });
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: alumni.id, blockedId: peerStudents[16]!.id } },
    update: { reason: 'Repeated off-topic commercial solicitation' },
    create: { blockerId: alumni.id, blockedId: peerStudents[16]!.id, reason: 'Repeated off-topic commercial solicitation' },
  });
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: alumni.id, blockedId: peerAlumni[16]!.id } },
    update: { reason: 'Spam connection requests' },
    create: { blockerId: alumni.id, blockedId: peerAlumni[16]!.id, reason: 'Spam connection requests' },
  });
  console.log('[OK] 4 Block records established.');

  // STEP 4: Feature 5 — Alumni Mentorship (Active, Pending & Completed)
  console.log('\n>>> [STEP 4/9] Provisioning Feature 5 Mentorship Records...');
  await prisma.user.update({
    where: { id: alumni.id },
    data: {
      isMentorshipAvailable: true,
      mentorshipStatus: 'OPEN',
      maxActiveMentees: 5,
      mentorshipTopics: [
        'Corporate Strategy & Leadership',
        'Human Resources & Talent Acquisition',
        'Engineering Career Transition',
        'Technical Interview Preparation',
      ],
    },
  });

  // Active / Accepted Mentorship: Soumya Miah (Mentee) -> Arif Gazi (Mentor)
  const existingShowcaseMentorship = await prisma.mentorshipRequest.findFirst({
    where: { mentorId: alumni.id, menteeId: student.id },
  });

  if (existingShowcaseMentorship) {
    await prisma.mentorshipRequest.update({
      where: { id: existingShowcaseMentorship.id },
      data: {
        status: 'ACCEPTED',
        topic: 'Full-Stack Engineering Architecture & Industry Interview Preparation',
        careerGoal: 'Transitioning from Undergraduate Studies to High-Scale Software Engineering',
        message: 'Dear Arif Bhai, I am preparing for software engineering roles and would greatly value your guidance on technical communication and system design interview readiness.',
        goals: '1. Review portfolio and resume.\n2. Conduct mock technical architecture interview.\n3. Establish roadmap for corporate readiness.',
        preferredCommunication: 'CHAT',
        availability: 'Weekends & Evenings',
        expectedDuration: '3 Months',
        alumniNote: 'Excited to guide Soumya. We will focus on architectural scaling and corporate communication.',
        decisionNote: 'Accepted with enthusiasm.',
        startedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      },
    });
  } else {
    await prisma.mentorshipRequest.create({
      data: {
        universityId: university.id,
        mentorId: alumni.id,
        menteeId: student.id,
        status: 'ACCEPTED',
        topic: 'Full-Stack Engineering Architecture & Industry Interview Preparation',
        careerGoal: 'Transitioning from Undergraduate Studies to High-Scale Software Engineering',
        message: 'Dear Arif Bhai, I am preparing for software engineering roles and would greatly value your guidance on technical communication and system design interview readiness.',
        goals: '1. Review portfolio and resume.\n2. Conduct mock technical architecture interview.\n3. Establish roadmap for corporate readiness.',
        preferredCommunication: 'CHAT',
        availability: 'Weekends & Evenings',
        expectedDuration: '3 Months',
        alumniNote: 'Excited to guide Soumya. We will focus on architectural scaling and corporate communication.',
        decisionNote: 'Accepted with enthusiasm.',
        startedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // 2 Outgoing PENDING requests from Soumya to other Alumni mentors
  const pendingMentors = [peerAlumni[0]!, peerAlumni[1]!];
  for (let i = 0; i < pendingMentors.length; i++) {
    const mentorUser = pendingMentors[i]!;
    const exists = await prisma.mentorshipRequest.findFirst({
      where: { mentorId: mentorUser.id, menteeId: student.id },
    });
    if (!exists) {
      await prisma.mentorshipRequest.create({
        data: {
          universityId: university.id,
          mentorId: mentorUser.id,
          menteeId: student.id,
          status: 'REQUESTED',
          topic: i === 0 ? 'Cloud Architecture & Distributed Microservices' : 'FinTech Platform Engineering',
          careerGoal: 'Seeking guidance on production infrastructure scaling and containerization.',
          message: 'Hello! I am a final-year CSE student exploring cloud-native architectures.',
          goals: 'Guidance on Kubernetes orchestration and cloud deployments.',
          preferredCommunication: 'CHAT',
          availability: 'Flexible',
        },
      });
    }
  }

  // 1 COMPLETED Mentorship for Soumya
  const completedMentor = peerAlumni[2]!;
  const completedExists = await prisma.mentorshipRequest.findFirst({
    where: { mentorId: completedMentor.id, menteeId: student.id },
  });
  if (!completedExists) {
    await prisma.mentorshipRequest.create({
      data: {
        universityId: university.id,
        mentorId: completedMentor.id,
        menteeId: student.id,
        status: 'COMPLETED',
        topic: 'Foundations of Algorithm Optimization & Data Structures',
        careerGoal: 'Mastering algorithm efficiency for technical interviews.',
        message: 'Seeking structured mentorship for LeetCode problem solving.',
        goals: 'Completed weekly algorithmic design sessions.',
        preferredCommunication: 'CHAT',
        availability: 'Evenings',
        startedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        endedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endNote: 'Successfully completed 8-week mentoring track with outstanding performance.',
      },
    });
  }

  // 3 Incoming PENDING requests to Arif Gazi from other Students
  const studentMentees = [peerStudents[0]!, peerStudents[1]!, peerStudents[2]!];
  const topics = [
    'Corporate HR Management & Talent Acquisition Roadmaps',
    'Career Transition from Engineering to Tech Product Management',
    'Executive Communication, Negotiation & Leadership Readiness',
  ];
  for (let i = 0; i < studentMentees.length; i++) {
    const sMentee = studentMentees[i]!;
    const topic = topics[i] ?? 'Corporate Career Mentorship';
    const exists = await prisma.mentorshipRequest.findFirst({
      where: { mentorId: alumni.id, menteeId: sMentee.id },
    });
    if (!exists) {
      await prisma.mentorshipRequest.create({
        data: {
          universityId: university.id,
          mentorId: alumni.id,
          menteeId: sMentee.id,
          status: 'REQUESTED',
          topic,
          careerGoal: 'Preparing for corporate recruitment and executive interviews.',
          message: `Dear Arif Sir, I am an undergraduate student seeking your mentorship in ${topic}.`,
          goals: 'Resume review and interview preparation guidance.',
          preferredCommunication: 'CHAT',
          availability: 'Flexible',
        },
      });
    }
  }
  console.log('[OK] Mentorship ecosystem provisioned (Active, Pending & Completed).');

  // STEP 5: Feature 6 & 7 — Jobs, Applications & Moderation History
  console.log('\n>>> [STEP 5/9] Provisioning Feature 6 & 7 Jobs & Applications...');

  // Link Soumya's application directly to one of Arif Gazi's PUBLISHED jobs
  const arifPublishedJob = await prisma.job.findFirst({
    where: { postedById: alumni.id, status: JobStatus.PUBLISHED },
  });

  if (arifPublishedJob) {
    const app = await prisma.jobApplication.upsert({
      where: { jobId_applicantId: { jobId: arifPublishedJob.id, applicantId: student.id } },
      update: {
        status: ApplicationStatus.SHORTLISTED,
        ownerNote: 'Top candidate. High academic standing and strong full-stack GitHub portfolio. Scheduled for technical interview.',
        coverLetter: 'As a motivated final-year CSE student with practical experience in TypeScript, React, and PostgreSQL, I am eager to apply my skills to drive measurable impact for your team.',
        resumeKey: 'resumes/soumya-miah-cse-cv.pdf',
        shareProfileConsent: true,
      },
      create: {
        jobId: arifPublishedJob.id,
        applicantId: student.id,
        status: ApplicationStatus.SHORTLISTED,
        ownerNote: 'Top candidate. High academic standing and strong full-stack GitHub portfolio. Scheduled for technical interview.',
        coverLetter: 'As a motivated final-year CSE student with practical experience in TypeScript, React, and PostgreSQL, I am eager to apply my skills to drive measurable impact for your team.',
        resumeKey: 'resumes/soumya-miah-cse-cv.pdf',
        shareProfileConsent: true,
      },
    });

    // Add status history trail
    await prisma.jobApplicationStatusHistory.deleteMany({ where: { applicationId: app.id } });
    await prisma.jobApplicationStatusHistory.createMany({
      data: [
        {
          applicationId: app.id,
          fromStatus: null,
          toStatus: ApplicationStatus.APPLIED,
          changedById: student.id,
          note: 'Application submitted online.',
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        },
        {
          applicationId: app.id,
          fromStatus: ApplicationStatus.APPLIED,
          toStatus: ApplicationStatus.UNDER_REVIEW,
          changedById: alumni.id,
          note: 'Profile reviewed by hiring manager.',
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
        {
          applicationId: app.id,
          fromStatus: ApplicationStatus.UNDER_REVIEW,
          toStatus: ApplicationStatus.SHORTLISTED,
          changedById: alumni.id,
          note: 'Shortlisted for technical round.',
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        },
      ],
    });
  }

  // Ensure Soumya has ACCEPTED and REJECTED application statuses for completeness
  const otherJobs = await prisma.job.findMany({
    where: {
      universityId: university.id,
      postedById: { not: alumni.id },
      status: JobStatus.PUBLISHED,
    },
    take: 2,
  });

  if (otherJobs.length >= 2 && otherJobs[0] && otherJobs[1]) {
    const job0 = otherJobs[0];
    const job1 = otherJobs[1];

    // 1 ACCEPTED Application
    await prisma.jobApplication.upsert({
      where: { jobId_applicantId: { jobId: job0.id, applicantId: student.id } },
      update: { status: ApplicationStatus.ACCEPTED, ownerNote: 'Congratulations! Official job offer dispatched.' },
      create: {
        jobId: job0.id,
        applicantId: student.id,
        status: ApplicationStatus.ACCEPTED,
        ownerNote: 'Congratulations! Official job offer dispatched.',
        coverLetter: 'Eager to contribute to software architecture.',
        resumeKey: 'resumes/soumya-miah-accepted-cv.pdf',
        shareProfileConsent: true,
      },
    });

    // 1 REJECTED Application
    await prisma.jobApplication.upsert({
      where: { jobId_applicantId: { jobId: job1.id, applicantId: student.id } },
      update: {
        status: ApplicationStatus.REJECTED,
        ownerNote: 'Role filled internally. Thank you for your interest and we encourage future applications.',
      },
      create: {
        jobId: job1.id,
        applicantId: student.id,
        status: ApplicationStatus.REJECTED,
        ownerNote: 'Role filled internally. Thank you for your interest and we encourage future applications.',
        coverLetter: 'Applying for backend role.',
        resumeKey: 'resumes/soumya-miah-cv.pdf',
        shareProfileConsent: true,
      },
    });
  }

  // Ensure Arif Gazi has 1 CLOSED job and 1 CHANGES_REQUESTED job
  const arifAllJobs = await prisma.job.findMany({
    where: { postedById: alumni.id },
    orderBy: { createdAt: 'desc' },
  });

  if (arifAllJobs.length >= 3 && arifAllJobs[1] && arifAllJobs[2]) {
    const closedJob = arifAllJobs[1];
    const changesJob = arifAllJobs[2];

    // Mark one as CLOSED
    await prisma.job.update({
      where: { id: closedJob.id },
      data: {
        status: JobStatus.CLOSED,
        closedAt: new Date(),
        closedById: alumni.id,
        closedReason: 'Position successfully filled via Alumni Connect.',
      },
    });

    // Mark one as CHANGES_REQUESTED
    await prisma.job.update({
      where: { id: changesJob.id },
      data: {
        status: JobStatus.CHANGES_REQUESTED,
        rejectionReason: 'Please specify the exact remote/hybrid work arrangement and mandatory tech requirements.',
      },
    });
  }

  // Ensure Moderator and Super Admin have active pending UNDER_REVIEW jobs
  const pendingJobsCount = await prisma.job.count({
    where: { universityId: university.id, status: JobStatus.UNDER_REVIEW },
  });
  if (pendingJobsCount < 3) {
    const candidateToReview = await prisma.job.findFirst({
      where: { universityId: university.id, status: JobStatus.PUBLISHED, postedById: { not: alumni.id } },
    });
    if (candidateToReview) {
      await prisma.job.update({
        where: { id: candidateToReview.id },
        data: {
          status: JobStatus.UNDER_REVIEW,
          reviewerId: moderator.id,
          claimedAt: new Date(),
        },
      });
    }
  }
  console.log('[OK] Job pipeline, application statuses, and moderation queues ready.');

  // STEP 6: Feature 8 — Event RSVPs & Waitlist Status
  console.log('\n>>> [STEP 6/9] Provisioning Feature 8 Event Waitlist RSVPs...');
  const waitlistEvent = await prisma.event.findFirst({
    where: { universityId: university.id, status: 'PUBLISHED' },
    orderBy: { startsAt: 'desc' },
  });

  if (waitlistEvent) {
    await prisma.event.update({
      where: { id: waitlistEvent.id },
      data: { waitlistEnabled: true, capacity: 50 },
    });

    // Add WAITLISTED RSVPs for Soumya & Arif
    await prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId: waitlistEvent.id, userId: student.id } },
      update: { status: RsvpStatus.WAITLISTED, waitlistedAt: new Date() },
      create: { eventId: waitlistEvent.id, userId: student.id, status: RsvpStatus.WAITLISTED, waitlistedAt: new Date() },
    });

    await prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId: waitlistEvent.id, userId: alumni.id } },
      update: { status: RsvpStatus.WAITLISTED, waitlistedAt: new Date() },
      create: { eventId: waitlistEvent.id, userId: alumni.id, status: RsvpStatus.WAITLISTED, waitlistedAt: new Date() },
    });
    console.log(`[OK] Waitlist RSVPs established on event: "${waitlistEvent.title}"`);
  }

  // STEP 7: Feature 10 — Success Stories Draft & Pending Moderation
  console.log('\n>>> [STEP 7/9] Provisioning Feature 10 Success Story Drafts...');
  // Draft story for Arif Gazi
  await prisma.successStory.upsert({
    where: {
      universityId_slug: {
        universityId: university.id,
        slug: 'navigating-corporate-strategy-arif-gazi',
      },
    },
    update: {
      status: StoryStatus.DRAFT,
      title: 'Navigating Corporate Strategy and Organizational Growth in Emerging Markets',
      summary: 'Key reflections from a decade of talent acquisition and organizational strategy across Bangladesh corporate landscape.',
      body: '<p>Reflecting on my graduation from North Western University, the transition into corporate human resource leadership required balancing analytical rigor with empathetic communication.</p><h3>Key Principles for Emerging Leaders</h3><p>Building high-performing teams requires transparency, psychological safety, and clear metrics for career advancement.</p>',
      coverImageUrl: 'https://res.cloudinary.com/a1dumxpe/image/upload/alumni-connect/stories/covers/cover_11.jpg',
      category: StoryCategory.CAREER_MILESTONE,
      readingTimeMinutes: 4,
    },
    create: {
      universityId: university.id,
      authorId: alumni.id,
      slug: 'navigating-corporate-strategy-arif-gazi',
      status: StoryStatus.DRAFT,
      title: 'Navigating Corporate Strategy and Organizational Growth in Emerging Markets',
      summary: 'Key reflections from a decade of talent acquisition and organizational strategy across Bangladesh corporate landscape.',
      body: '<p>Reflecting on my graduation from North Western University, the transition into corporate human resource leadership required balancing analytical rigor with empathetic communication.</p><h3>Key Principles for Emerging Leaders</h3><p>Building high-performing teams requires transparency, psychological safety, and clear metrics for career advancement.</p>',
      coverImageUrl: 'https://res.cloudinary.com/a1dumxpe/image/upload/alumni-connect/stories/covers/cover_11.jpg',
      category: StoryCategory.CAREER_MILESTONE,
      readingTimeMinutes: 4,
    },
  });

  // Submitted story for Arif Gazi under review by Moderator
  const submittedStory = await prisma.successStory.upsert({
    where: {
      universityId_slug: {
        universityId: university.id,
        slug: 'building-sustainable-teams-arif-gazi',
      },
    },
    update: {
      status: StoryStatus.UNDER_REVIEW,
      reviewerId: moderator.id,
      claimedAt: new Date(),
      title: 'Building Sustainable Cross-Functional Teams: Lessons from NWU to Corporate HR',
      summary: 'How foundational engineering and management values learned at NWU drive scalable team alignment in enterprise operations.',
      body: '<p>Cross-functional synergy between software engineers and management executives remains the single most critical predictor of corporate agility.</p><p>At North Western University, collaborating on inter-departmental projects prepared me directly for enterprise stakeholder management.</p>',
      coverImageUrl: 'https://res.cloudinary.com/a1dumxpe/image/upload/alumni-connect/stories/covers/cover_12.jpg',
      category: StoryCategory.ENTREPRENEURSHIP,
      readingTimeMinutes: 5,
    },
    create: {
      universityId: university.id,
      authorId: alumni.id,
      slug: 'building-sustainable-teams-arif-gazi',
      status: StoryStatus.UNDER_REVIEW,
      reviewerId: moderator.id,
      claimedAt: new Date(),
      title: 'Building Sustainable Cross-Functional Teams: Lessons from NWU to Corporate HR',
      summary: 'How foundational engineering and management values learned at NWU drive scalable team alignment in enterprise operations.',
      body: '<p>Cross-functional synergy between software engineers and management executives remains the single most critical predictor of corporate agility.</p><p>At North Western University, collaborating on inter-departmental projects prepared me directly for enterprise stakeholder management.</p>',
      coverImageUrl: 'https://res.cloudinary.com/a1dumxpe/image/upload/alumni-connect/stories/covers/cover_12.jpg',
      category: StoryCategory.ENTREPRENEURSHIP,
      readingTimeMinutes: 5,
    },
  });

  // Ensure moderation record
  await prisma.storyModerationRecord.deleteMany({ where: { storyId: submittedStory.id } });
  await prisma.storyModerationRecord.create({
    data: {
      storyId: submittedStory.id,
      moderatorId: moderator.id,
      action: StoryModerationAction.CLAIM,
      note: 'Claimed for editorial review and verification.',
    },
  });
  console.log('[OK] Success Story drafts and moderation claims ready.');

  // STEP 8: Feature 11 — 1:1 Real-Time Messaging Threads & Unread Badges
  console.log('\n>>> [STEP 8/9] Provisioning Feature 11 1:1 Chat Threads & Unread Badges...');

  // 8.1: Rich Multi-Turn Conversation: Soumya Miah <-> Arif Gazi
  const userLowId = student.id < alumni.id ? student.id : alumni.id;
  const userHighId = student.id < alumni.id ? alumni.id : student.id;

  const showcaseConv = await prisma.conversation.upsert({
    where: {
      universityId_userLowId_userHighId: {
        universityId: university.id,
        userLowId,
        userHighId,
      },
    },
    update: {
      contextType: ConversationContext.DIRECT,
    },
    create: {
      universityId: university.id,
      userLowId,
      userHighId,
      contextType: ConversationContext.DIRECT,
      createdById: student.id,
    },
  });

  // Purge prior seed messages for showcase conversation to maintain clean multi-turn history
  await prisma.message.deleteMany({ where: { conversationId: showcaseConv.id } });

  const m1 = await prisma.message.create({
    data: {
      conversationId: showcaseConv.id,
      senderId: student.id,
      type: MessageType.TEXT,
      content: 'Hello Arif Bhai! Assalamu Alaikum. Thank you for connecting with me on Alumni Connect.',
      deliveryStatus: MessageDeliveryStatus.READ,
      readAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
  });

  const m2 = await prisma.message.create({
    data: {
      conversationId: showcaseConv.id,
      senderId: alumni.id,
      type: MessageType.TEXT,
      content: 'Wa Alaikum Assalam Soumya! Great to connect with you. How are your final semester software engineering projects progressing at NWU?',
      deliveryStatus: MessageDeliveryStatus.READ,
      readAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  });

  const m3 = await prisma.message.create({
    data: {
      conversationId: showcaseConv.id,
      senderId: student.id,
      type: MessageType.FILE,
      content: 'They are going great! We just finalized our distributed messaging architecture with Redis streams and WebSockets. Attached is our draft design document for your review.',
      attachments: [
        {
          fileUrl: 'https://res.cloudinary.com/a1dumxpe/raw/upload/alumni-connect/documents/distributed-systems-design.pdf',
          fileName: 'distributed-systems-design.pdf',
          mimeType: 'application/pdf',
          size: 1245000,
        },
      ],
      deliveryStatus: MessageDeliveryStatus.READ,
      readAt: new Date(Date.now() - 90 * 60 * 1000),
      createdAt: new Date(Date.now() - 90 * 60 * 1000),
    },
  });

  const m4 = await prisma.message.create({
    data: {
      conversationId: showcaseConv.id,
      senderId: alumni.id,
      type: MessageType.TEXT,
      content: 'This architecture looks very solid. The WebSocket heartbeats and Redis pub/sub caching layer will definitely keep latency sub-20ms under high concurrency.',
      replyToId: m3.id,
      reactions: { '👍': [alumni.id] },
      deliveryStatus: MessageDeliveryStatus.READ,
      readAt: new Date(Date.now() - 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  });

  const m5 = await prisma.message.create({
    data: {
      conversationId: showcaseConv.id,
      senderId: student.id,
      type: MessageType.TEXT,
      content: 'Thank you so much for the review, Arif Bhai! Your feedback gives our development team huge confidence.',
      reactions: { '❤️': [student.id] },
      deliveryStatus: MessageDeliveryStatus.READ,
      readAt: new Date(Date.now() - 30 * 60 * 1000),
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    },
  });

  const m6 = await prisma.message.create({
    data: {
      conversationId: showcaseConv.id,
      senderId: alumni.id,
      type: MessageType.TEXT,
      content: "Always glad to support fellow NWU peers. Let us schedule a 30-minute sync this Saturday to review your interview presentation.",
      deliveryStatus: MessageDeliveryStatus.READ,
      readAt: new Date(Date.now() - 5 * 60 * 1000),
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
    },
  });

  await prisma.conversation.update({
    where: { id: showcaseConv.id },
    data: {
      lastMessageId: m6.id,
      lastMessageAt: m6.createdAt,
      lastMessageSnippet: m6.content.slice(0, 80),
    },
  });

  // Ensure participants exist with 0 unread on this read thread
  await prisma.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId: showcaseConv.id, userId: student.id } },
    update: { unreadCount: 0, lastReadAt: new Date() },
    create: { conversationId: showcaseConv.id, userId: student.id, unreadCount: 0, lastReadAt: new Date() },
  });
  await prisma.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId: showcaseConv.id, userId: alumni.id } },
    update: { unreadCount: 0, lastReadAt: new Date() },
    create: { conversationId: showcaseConv.id, userId: alumni.id, unreadCount: 0, lastReadAt: new Date() },
  });

  // 8.2: Create Unread Incoming Threads for All 4 Showcase Accounts (Sidebar Badge = 2)
  async function createUnreadThread(
    targetUser: { id: string },
    senderPeer: { id: string },
    msg1Content: string,
    msg2Content: string,
  ) {
    const lowId = targetUser.id < senderPeer.id ? targetUser.id : senderPeer.id;
    const highId = targetUser.id < senderPeer.id ? senderPeer.id : targetUser.id;

    const conv = await prisma.conversation.upsert({
      where: {
        universityId_userLowId_userHighId: {
          universityId: university.id,
          userLowId: lowId,
          userHighId: highId,
        },
      },
      update: {},
      create: {
        universityId: university.id,
        userLowId: lowId,
        userHighId: highId,
        contextType: ConversationContext.DIRECT,
        createdById: senderPeer.id,
      },
    });

    await prisma.message.deleteMany({ where: { conversationId: conv.id } });

    await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: senderPeer.id,
        type: MessageType.TEXT,
        content: msg1Content,
        deliveryStatus: MessageDeliveryStatus.DELIVERED,
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
      },
    });

    const lastMsg = await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: senderPeer.id,
        type: MessageType.TEXT,
        content: msg2Content,
        deliveryStatus: MessageDeliveryStatus.DELIVERED,
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });

    await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        lastMessageId: lastMsg.id,
        lastMessageAt: lastMsg.createdAt,
        lastMessageSnippet: lastMsg.content.slice(0, 80),
      },
    });

    // Target user has unreadCount = 2!
    await prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: conv.id, userId: targetUser.id } },
      update: { unreadCount: 2, lastReadAt: null },
      create: { conversationId: conv.id, userId: targetUser.id, unreadCount: 2, lastReadAt: null },
    });

    // Sender has unreadCount = 0
    await prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: conv.id, userId: senderPeer.id } },
      update: { unreadCount: 0, lastReadAt: new Date() },
      create: { conversationId: conv.id, userId: senderPeer.id, unreadCount: 0, lastReadAt: new Date() },
    });
  }

  // 1. Unread thread for Soumya Miah (Student):
  await createUnreadThread(
    student,
    peerAlumni[0]!,
    'Hello Soumya, I reviewed your full-stack GitHub repo. Great engineering fundamentals on display.',
    'Our engineering team at bKash is currently recruiting associate backend engineers. Let me know if you would like me to submit an internal employee referral for your candidacy.',
  );

  // 2. Unread thread for Arif Gazi (Alumni):
  await createUnreadThread(
    alumni,
    peerStudents[3]!,
    'Dear Arif Sir, Assalamu Alaikum. I submitted a mentorship request regarding HR corporate training.',
    'Could you please review my attached CV when you have a free moment this week? Thank you very much.',
  );

  // 3. Unread thread for Kazi Moinul Islam (Moderator):
  await createUnreadThread(
    moderator,
    peerStudents[4]!,
    'Respected Faculty Sir, could you please provide guidance on the upcoming semester elective registration?',
    'I have emailed my course prerequisite waiver form for your endorsement. Thank you, Sir.',
  );

  // 4. Unread thread for Platform Super Admin:
  await createUnreadThread(
    superAdmin,
    peerAlumni[4]!,
    'Dear Platform Administrator, our alumni batch committee has finalized the agenda for the 2026 Grand Reunion.',
    'We would like to request an official institutional announcement to be pinned on the campus portal. Attached are the verified event banners.',
  );

  console.log('[OK] 1:1 Messaging conversations and unread badges provisioned.');

  // STEP 9: Feature 12 & 13 — Notifications, Moderation Incident Reports & Snapshots
  console.log('\n>>> [STEP 9/10] Provisioning Feature 12 & 13 Notifications & Reports...');

  // 9.1: Clean previous showcase notifications for idempotency
  await prisma.notification.deleteMany({
    where: {
      userId: { in: [superAdmin.id, moderator.id, alumni.id, student.id] },
    },
  });

  // Provision Notifications for Kazi Moinul Islam (Moderator)
  await prisma.notification.createMany({
    data: [
      {
        userId: moderator.id,
        type: NotificationType.MODERATION_RESULT,
        title: 'Job Moderation Queue Alert',
        body: 'A new job posting was submitted and awaits review.',
        link: '/moderator/jobs',
        readAt: null,
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
      {
        userId: moderator.id,
        type: NotificationType.MODERATION_RESULT,
        title: 'Content Incident Escalation',
        body: 'An incident report was escalated for safety review.',
        link: '/moderator/reports',
        readAt: null,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      {
        userId: moderator.id,
        type: NotificationType.SECURITY_ALERT,
        title: 'Admin Session Authenticated',
        body: 'Moderator elevated privileges were verified.',
        link: '/login',
        readAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      },
      {
        userId: moderator.id,
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: 'Campus Guidelines Updated',
        body: 'Spring semester community moderation standards have been published.',
        link: '/announcements',
        readAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    ],
  });

  // Provision Notifications for Arif Gazi (Alumni)
  await prisma.notification.createMany({
    data: [
      {
        userId: alumni.id,
        type: NotificationType.MENTORSHIP_REQUEST,
        title: 'New Mentorship Request',
        body: 'Soumya Miah requested career mentorship in Software Engineering.',
        link: '/alumni/mentorship/requests',
        readAt: null,
        createdAt: new Date(Date.now() - 45 * 60 * 1000),
      },
      {
        userId: alumni.id,
        type: NotificationType.APPLICATION_RECEIVED,
        title: 'Job Application Received',
        body: 'A new candidate applied for Senior Software Engineer.',
        link: '/alumni/applications/received',
        readAt: null,
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
      {
        userId: alumni.id,
        type: NotificationType.JOB_APPROVED,
        title: 'Job Listing Approved',
        body: 'Your posting for Senior Software Engineer is now published.',
        link: '/alumni/jobs/my-jobs',
        readAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      },
      {
        userId: alumni.id,
        type: NotificationType.CONNECTION_REQUEST,
        title: 'New Connection Request',
        body: 'Soumya Miah sent you a connection request.',
        link: '/alumni/connections?tab=received',
        readAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 14 * 60 * 60 * 1000),
      },
    ],
  });

  // Provision Notifications for Soumya Miah (Student)
  await prisma.notification.createMany({
    data: [
      {
        userId: student.id,
        type: NotificationType.MENTORSHIP_DECISION,
        title: 'Mentorship Request Accepted',
        body: 'Arif Gazi accepted your mentorship request in Full-Stack Engineering Architecture.',
        link: '/student/mentorship',
        readAt: null,
        createdAt: new Date(Date.now() - 15 * 60 * 1000),
      },
      {
        userId: student.id,
        type: NotificationType.APPLICATION_UPDATE,
        title: 'Application Shortlisted',
        body: 'Your application for Senior Software Engineer was shortlisted.',
        link: '/student/applications',
        readAt: null,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      {
        userId: student.id,
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: 'Spring Campus Career Fair 2026',
        body: 'Annual career fair schedule and participating tech employers announced.',
        link: '/announcements',
        readAt: new Date(Date.now() - 18 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
      },
    ],
  });

  // Provision Notifications for Platform Super Admin
  await prisma.notification.createMany({
    data: [
      {
        userId: superAdmin.id,
        type: NotificationType.SECURITY_ALERT,
        title: 'System Health Check Completed',
        body: 'Automated database and Redis integrity scan passed with zero anomalies.',
        link: '/admin/overview',
        readAt: null,
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      },
      {
        userId: superAdmin.id,
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: 'Quarterly Infrastructure Upgrade',
        body: 'Platform maintenance scheduled for next month.',
        link: '/announcements',
        readAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    ],
  });
  console.log('[OK] Realistic notifications provisioned across all 4 showcase accounts.');

  // 9.2: Provision 4 Realistic Reports & Audit Action Timelines
  console.log('>>> Provisioning 4 Realistic Incident Reports & Moderation Timelines...');

  // Target 1: Misleading Job Posting
  const candidateReportJob = await prisma.job.findFirst({
    where: { universityId: university.id, postedById: { not: alumni.id } },
    include: { postedBy: true },
  });

  if (candidateReportJob) {
    await prisma.report.deleteMany({
      where: { universityId: university.id, targetType: 'JOB', targetId: candidateReportJob.id },
    });

    const jobSnapshot = {
      targetType: 'JOB',
      targetId: candidateReportJob.id,
      title: candidateReportJob.title,
      company: candidateReportJob.company,
      location: candidateReportJob.location,
      workMode: candidateReportJob.workMode,
      employmentType: candidateReportJob.employmentType,
      salaryRange:
        candidateReportJob.salaryMin && candidateReportJob.salaryMax
          ? `${candidateReportJob.salaryMin} - ${candidateReportJob.salaryMax} BDT`
          : 'Negotiable',
      postedBy: {
        id: candidateReportJob.postedById,
        name: candidateReportJob.postedBy.name,
        email: candidateReportJob.postedBy.email,
      },
    };

    await prisma.report.create({
      data: {
        universityId: university.id,
        reportedById: student.id,
        reportedUserId: candidateReportJob.postedById,
        targetType: 'JOB',
        targetId: candidateReportJob.id,
        type: ReportType.MISLEADING_JOB,
        reason:
          'Suspicious Job / Possible Advance Fee Scam: The employer requested an upfront application processing fee via mobile banking prior to screening, which violates university hiring ethics and student protection policies.',
        status: ReportStatus.OPEN,
        snapshot: jobSnapshot,
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      },
    });
  }

  // Target 2: Impersonation / Fake Profile
  const impersonatedTarget = peerStudents[10]!;
  await prisma.report.deleteMany({
    where: { universityId: university.id, targetType: 'USER', targetId: impersonatedTarget.id },
  });

  const studentSnapshot = {
    targetType: 'USER',
    targetId: impersonatedTarget.id,
    name: impersonatedTarget.name,
    email: impersonatedTarget.email,
    role: 'STUDENT',
    department: impersonatedTarget.department,
    graduationYear: impersonatedTarget.graduationYear,
  };

  await prisma.report.create({
    data: {
      universityId: university.id,
      reportedById: alumni.id,
      reportedUserId: impersonatedTarget.id,
      targetType: 'USER',
      targetId: impersonatedTarget.id,
      type: ReportType.FAKE_PROFILE,
      reason:
        'Impersonating Faculty Member: This profile claims to be an adjunct professor and has been privately messaging undergraduate students asking for personal phone numbers and institutional credentials.',
      status: ReportStatus.OPEN,
      snapshot: studentSnapshot,
      createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
    },
  });

  // Target 3: Unsolicited Commercial Spam Message
  const spamSender = peerStudents[14]!;
  const spamConvLow = student.id < spamSender.id ? student.id : spamSender.id;
  const spamConvHigh = student.id < spamSender.id ? spamSender.id : student.id;

  const spamConv = await prisma.conversation.upsert({
    where: {
      universityId_userLowId_userHighId: {
        universityId: university.id,
        userLowId: spamConvLow,
        userHighId: spamConvHigh,
      },
    },
    update: {},
    create: {
      universityId: university.id,
      userLowId: spamConvLow,
      userHighId: spamConvHigh,
      contextType: ConversationContext.DIRECT,
      createdById: spamSender.id,
    },
  });

  const spamMsg = await prisma.message.create({
    data: {
      conversationId: spamConv.id,
      senderId: spamSender.id,
      type: MessageType.TEXT,
      content:
        'Click here to earn quick cash on university campus! Guaranteed 500 BDT per day: https://unverified-affiliate-portal.example.com',
      deliveryStatus: MessageDeliveryStatus.DELIVERED,
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    },
  });

  await prisma.report.deleteMany({
    where: { universityId: university.id, targetType: 'MESSAGE', targetId: spamMsg.id },
  });

  const messageSnapshot = {
    targetType: 'MESSAGE',
    targetId: spamMsg.id,
    content: spamMsg.content,
    senderId: spamMsg.senderId,
    senderName: spamSender.name,
    createdAt: spamMsg.createdAt,
  };

  const report3 = await prisma.report.create({
    data: {
      universityId: university.id,
      reportedById: student.id,
      reportedUserId: spamSender.id,
      targetType: 'MESSAGE',
      targetId: spamMsg.id,
      type: ReportType.SPAM,
      reason:
        'Unsolicited commercial affiliate marketing in chat: Sent repetitive unsolicited promotional affiliate links in direct messages despite repeated requests to cease.',
      status: ReportStatus.UNDER_REVIEW,
      reviewerId: moderator.id,
      claimedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      snapshot: messageSnapshot,
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    },
  });

  await prisma.reportAction.create({
    data: {
      reportId: report3.id,
      actorId: moderator.id,
      actorRole: RoleName.MODERATOR,
      actionType: 'STATUS_CHANGE',
      note: 'Claimed by Moderator Kazi Moinul Islam for investigation.',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  });

  // Target 4: Inappropriate Content in Success Story
  const targetStory = await prisma.successStory.findFirst({
    where: { universityId: university.id, authorId: { not: alumni.id } },
    include: { author: true },
  });

  if (targetStory) {
    await prisma.report.deleteMany({
      where: { universityId: university.id, targetType: 'STORY', targetId: targetStory.id },
    });

    const storySnapshot = {
      targetType: 'STORY',
      targetId: targetStory.id,
      title: targetStory.title,
      summary: targetStory.summary,
      authorId: targetStory.authorId,
      authorName: targetStory.author?.name,
      category: targetStory.category,
    };

    const report4 = await prisma.report.create({
      data: {
        universityId: university.id,
        reportedById: student.id,
        reportedUserId: targetStory.authorId,
        targetType: 'STORY',
        targetId: targetStory.id,
        type: ReportType.INAPPROPRIATE_CONTENT,
        reason:
          'Commercial solicitation violation in article: Article contained direct unauthorized marketing and external referral codes disguised as career advice.',
        status: ReportStatus.RESOLVED,
        reviewerId: moderator.id,
        resolverId: moderator.id,
        resolution: 'HIDE_CONTENT',
        resolutionNote: 'Content unpublished and author warned regarding promotional standards.',
        claimedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        resolvedAt: new Date(Date.now() - 22 * 60 * 60 * 1000),
        snapshot: storySnapshot,
        createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      },
    });

    await prisma.reportAction.createMany({
      data: [
        {
          reportId: report4.id,
          actorId: moderator.id,
          actorRole: RoleName.MODERATOR,
          actionType: 'STATUS_CHANGE',
          note: 'Claimed by Moderator for content compliance check.',
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        {
          reportId: report4.id,
          actorId: moderator.id,
          actorRole: RoleName.MODERATOR,
          actionType: 'RESOLUTION_APPLIED',
          note: 'Content unpublished and author issued formal warning on commercial terms.',
          metadata: { resolution: 'HIDE_CONTENT' },
          createdAt: new Date(Date.now() - 22 * 60 * 60 * 1000),
        },
      ],
    });
  }

  console.log('[OK] 4 Realistic incident reports and audit action trails provisioned.');

  // STEP 10: Provision Showcase Login History and Active Sessions
  console.log('\n>>> [STEP 10/11] Provisioning Showcase Login History & Active Browser Sessions...');
  const users = [
    { record: superAdmin, roleName: RoleName.SUPER_ADMIN, device: 'Chrome on Windows' },
    { record: moderator, roleName: RoleName.MODERATOR, device: 'Firefox on Linux' },
    { record: alumni, roleName: RoleName.ALUMNI, device: 'Chrome on macOS' },
    { record: student, roleName: RoleName.STUDENT, device: 'Edge on Windows' },
  ];

  for (const u of users) {
    // 1. Ensure realistic Login History in AuditLog
    const existingLogins = await prisma.auditLog.count({
      where: {
        actorId: u.record.id,
        action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'USER_LOGIN'] },
      },
    });

    if (existingLogins < 3) {
      await prisma.auditLog.createMany({
        data: [
          {
            universityId: university.id,
            actorId: u.record.id,
            actorRole: u.roleName,
            action: 'LOGIN_SUCCESS',
            result: 'SUCCESS',
            targetType: 'user',
            targetId: u.record.id,
            ip: '103.114.98.42',
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          },
          {
            universityId: university.id,
            actorId: u.record.id,
            actorRole: u.roleName,
            action: 'LOGIN_SUCCESS',
            result: 'SUCCESS',
            targetType: 'user',
            targetId: u.record.id,
            ip: '103.114.98.50',
            userAgent:
              'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
            createdAt: new Date(Date.now() - 28 * 60 * 60 * 1000), // 28 hours ago
          },
          {
            universityId: university.id,
            actorId: u.record.id,
            actorRole: u.roleName,
            action: 'LOGIN_FAILED',
            result: 'FAILURE',
            targetType: 'user',
            targetId: u.record.id,
            ip: '185.220.101.5',
            userAgent:
              'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
            metadata: { reason: 'CURRENT_PASSWORD_INVALID' },
            createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000), // 3 days ago
          },
        ],
      });
    }

    // 2. Ensure realistic Active Sessions in RefreshToken
    const activeTokens = await prisma.refreshToken.findMany({
      where: {
        userId: u.record.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (activeTokens.length === 0) {
      await prisma.refreshToken.createMany({
        data: [
          {
            id: `showcase-session-${u.roleName.toLowerCase()}-1`,
            tokenHash: `hash-${u.record.id}-desktop-1`,
            familyId: `fam-${u.record.id}-1`,
            userId: u.record.id,
            universityId: university.id,
            deviceName: u.device,
            ipAddress: '103.114.98.42',
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            lastActiveAt: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          {
            id: `showcase-session-${u.roleName.toLowerCase()}-2`,
            tokenHash: `hash-${u.record.id}-mobile-2`,
            familyId: `fam-${u.record.id}-2`,
            userId: u.record.id,
            universityId: university.id,
            deviceName: 'Safari on iPhone',
            ipAddress: '103.114.98.77',
            userAgent:
              'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
            lastActiveAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
            expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
          },
        ],
      });
    }
  }
  console.log('[OK] Rich login history and active session records provisioned for all 4 accounts.');

  // STEP 11: Flush Redis Caches
  console.log('\n>>> [STEP 11/11] Invalidating & Flushing Redis Caches...');
  try {
    await Promise.all([
      cacheService.bumpVersion('dir'),
      cacheService.bumpVersion('jobs'),
      cacheService.bumpVersion('events'),
      cacheService.bumpVersion('ann'),
      cacheService.bumpVersion('stories'),
      cacheService.delPattern('stats:*'),
      cacheService.delPattern('admin:*'),
      cacheService.delPattern('moderation:*'),
      cacheService.delPattern('dir:*'),
      cacheService.delPattern('jobs:*'),
      cacheService.delPattern('events:*'),
      cacheService.delPattern('ann:*'),
      cacheService.delPattern('stories:*'),
      cacheService.delPattern('user:*:notif_unread'),
    ]);
    console.log('[OK] All Redis cache versions bumped and pattern keys invalidated.');
  } catch (err) {
    console.warn('[WARN] Redis cache flush encountered minor error:', (err as Error).message);
  }

  console.log('\n==============================================================================');
  console.log('>>> [SUCCESS] 360-DEGREE QUICK-LOGIN SHOWCASE PROVISIONING COMPLETE');
  console.log('==============================================================================');
}

main()
  .catch((err) => {
    console.error('[FATAL ERROR IN SHOWCASE PROVISIONING]:', err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      if (redisClient && isRedisAvailable) {
        await redisClient.quit();
      }
    } catch {}
    await prisma.$disconnect();
    process.exit(0);
  });
