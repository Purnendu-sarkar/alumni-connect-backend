import { JobStatus, RoleName, VerificationStatus } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';
import { env } from '../config/index.js';
import { logger } from '../config/logger.js';
import { passwordService } from '../services/auth/password.service.js';

export const DEMO_ROLES_INFO = [
  {
    role: RoleName.STUDENT,
    label: 'Student',
    desc: 'Explore jobs, mentorship & network directory',
    email: 'demo.student@demo.edu',
    name: 'Sabbir Ahmed (Demo Student)',
  },
  {
    role: RoleName.ALUMNI,
    label: 'Alumni',
    desc: 'Post career opportunities & connect with students',
    email: 'demo.alumni@demo.edu',
    name: 'Tahmina Rahman (Demo Alumni)',
  },
  {
    role: RoleName.MODERATOR,
    label: 'Moderator',
    desc: 'Review pending job submissions & content moderation',
    email: 'demo.moderator@demo.edu',
    name: 'Monirul Islam (Demo Moderator)',
  },
  {
    role: RoleName.ADMIN,
    label: 'University Admin',
    desc: 'Review verification queue & institutional operations',
    email: 'demo.admin@demo.edu',
    name: 'Dr. Anisur Rahman (Demo Admin)',
  },
  {
    role: RoleName.SUPER_ADMIN,
    label: 'Super Admin',
    desc: 'Platform governance, universities & multi-tenant logs',
    email: 'demo.superadmin@demo.edu',
    name: 'Shakil Mahmud (Demo SuperAdmin)',
  },
] as const;

export class DemoService {
  /**
   * Initializes sandbox demo accounts and workflow fixtures for local testing.
   * Completely idempotent and isolated with isDemo=true.
   */
  async initializeDemoFixtures(): Promise<void> {
    if (env.NODE_ENV === 'production' || !env.DEMO_ENABLED) {
      logger.info('Demo module is disabled or in production. Skipping demo seeding.');
      return;
    }

    logger.info('Initializing development demo accounts and test fixtures...');

    // 1. Ensure Sandbox University
    const demoUniversity = await prisma.university.upsert({
      where: { slug: 'demo-university' },
      update: {
        name: 'Demo State University',
        domain: 'demo.edu',
        isActive: true,
        isDemo: true,
      },
      create: {
        name: 'Demo State University',
        slug: 'demo-university',
        domain: 'demo.edu',
        isActive: true,
        isDemo: true,
      },
    });

    const roles = await prisma.role.findMany();
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    // Secure default password for demo accounts in development
    const demoPasswordHash = await passwordService.hash('DemoPass123!');

    // 2. Upsert the 5 canonical demo users
    const userRecords: Record<string, string> = {};

    // 2.1 Demo Student
    const studentUser = await prisma.user.upsert({
      where: { email: 'demo.student@demo.edu' },
      update: {
        name: 'Sabbir Ahmed (Demo Student)',
        universityId: demoUniversity.id,
        roleId: roleMap.get(RoleName.STUDENT)!,
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        isDemo: true,
      },
      create: {
        email: 'demo.student@demo.edu',
        name: 'Sabbir Ahmed (Demo Student)',
        passwordHash: demoPasswordHash,
        universityId: demoUniversity.id,
        roleId: roleMap.get(RoleName.STUDENT)!,
        department: 'Computer Science & Engineering',
        batch: '2024',
        studentId: 'CSE-2024-042',
        currentSemester: '8th Semester',
        skills: ['TypeScript', 'React', 'Python', 'PostgreSQL'],
        interests: ['Artificial Intelligence', 'Web Development'],
        headline: 'Final Year CSE Student | Aspiring Full-Stack Engineer',
        bio: 'Passionate about distributed web systems and modern frontend architecture.',
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        onboardingCompleted: true,
        isDemo: true,
      },
    });
    userRecords[RoleName.STUDENT] = studentUser.id;

    // 2.2 Demo Alumni
    const alumniUser = await prisma.user.upsert({
      where: { email: 'demo.alumni@demo.edu' },
      update: {
        name: 'Tahmina Rahman (Demo Alumni)',
        universityId: demoUniversity.id,
        roleId: roleMap.get(RoleName.ALUMNI)!,
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        isDemo: true,
      },
      create: {
        email: 'demo.alumni@demo.edu',
        name: 'Tahmina Rahman (Demo Alumni)',
        passwordHash: demoPasswordHash,
        universityId: demoUniversity.id,
        roleId: roleMap.get(RoleName.ALUMNI)!,
        department: 'Computer Science & Engineering',
        batch: '2019',
        graduationYear: '2019',
        employmentStatus: 'Employed',
        currentCompany: 'Apex Cloud Solutions',
        position: 'Lead Software Architect',
        skills: ['Cloud Architecture', 'Go', 'Kubernetes', 'Node.js', 'System Design'],
        headline: 'Lead Software Architect @ Apex Cloud Solutions',
        bio: 'Alumna of 2019. Happy to mentor enthusiastic students and hire top engineering talent.',
        linkedinUrl: 'https://linkedin.com',
        websiteUrl: 'https://github.com',
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        onboardingCompleted: true,
        isDemo: true,
      },
    });
    userRecords[RoleName.ALUMNI] = alumniUser.id;

    // 2.3 Demo Moderator
    const moderatorUser = await prisma.user.upsert({
      where: { email: 'demo.moderator@demo.edu' },
      update: {
        name: 'Monirul Islam (Demo Moderator)',
        universityId: demoUniversity.id,
        roleId: roleMap.get(RoleName.MODERATOR)!,
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        isDemo: true,
      },
      create: {
        email: 'demo.moderator@demo.edu',
        name: 'Monirul Islam (Demo Moderator)',
        passwordHash: demoPasswordHash,
        universityId: demoUniversity.id,
        roleId: roleMap.get(RoleName.MODERATOR)!,
        department: 'University Relations & Moderation',
        headline: 'Campus Community Moderator',
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        onboardingCompleted: true,
        isDemo: true,
      },
    });
    userRecords[RoleName.MODERATOR] = moderatorUser.id;

    // 2.4 Demo Admin
    const adminUser = await prisma.user.upsert({
      where: { email: 'demo.admin@demo.edu' },
      update: {
        name: 'Dr. Anisur Rahman (Demo Admin)',
        universityId: demoUniversity.id,
        roleId: roleMap.get(RoleName.ADMIN)!,
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        isDemo: true,
      },
      create: {
        email: 'demo.admin@demo.edu',
        name: 'Dr. Anisur Rahman (Demo Admin)',
        passwordHash: demoPasswordHash,
        universityId: demoUniversity.id,
        roleId: roleMap.get(RoleName.ADMIN)!,
        department: 'Registrar & Alumni Affairs Office',
        headline: 'Director of Alumni Relations',
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        onboardingCompleted: true,
        isDemo: true,
      },
    });
    userRecords[RoleName.ADMIN] = adminUser.id;

    // 2.5 Demo Super Admin (separate from permanent platform owner)
    const superAdminUser = await prisma.user.upsert({
      where: { email: 'demo.superadmin@demo.edu' },
      update: {
        name: 'Shakil Mahmud (Demo SuperAdmin)',
        universityId: demoUniversity.id,
        roleId: roleMap.get(RoleName.SUPER_ADMIN)!,
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        isDemo: true,
      },
      create: {
        email: 'demo.superadmin@demo.edu',
        name: 'Shakil Mahmud (Demo SuperAdmin)',
        passwordHash: demoPasswordHash,
        universityId: demoUniversity.id,
        roleId: roleMap.get(RoleName.SUPER_ADMIN)!,
        department: 'Global Platform Operations',
        headline: 'Platform Operations Super Administrator (Sandbox)',
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        onboardingCompleted: true,
        isDemo: true,
      },
    });
    userRecords[RoleName.SUPER_ADMIN] = superAdminUser.id;

    // 3. Workflow Fixture: Connection Request (Student -> Alumni, Accepted)
    await prisma.connection.upsert({
      where: {
        requesterId_recipientId: {
          requesterId: studentUser.id,
          recipientId: alumniUser.id,
        },
      },
      update: {},
      create: {
        universityId: demoUniversity.id,
        requesterId: studentUser.id,
        recipientId: alumniUser.id,
        status: 'ACCEPTED',
        message: 'Hi Tahmina, I am an 8th semester student interested in cloud architecture.',
        respondedAt: new Date(),
      },
    });

    // 4. Workflow Fixture: Jobs
    // 4.1 Approved Job (Visible to students)
    const approvedJob = await prisma.job.upsert({
      where: { id: 'demo-job-approved-01' },
      update: { status: JobStatus.APPROVED },
      create: {
        id: 'demo-job-approved-01',
        universityId: demoUniversity.id,
        postedById: alumniUser.id,
        approvedById: adminUser.id,
        title: 'Senior Cloud Systems Engineer',
        company: 'Apex Cloud Solutions',
        location: 'Dhaka (Hybrid)',
        employmentType: 'Full-time',
        description: 'Seeking a skilled backend engineer with Go and Kubernetes experience to build high-scale cloud services.',
        applicationEmail: 'careers@apexcloud.example',
        status: JobStatus.APPROVED,
        approvedAt: new Date(),
      },
    });

    // 4.2 Pending Job (Awaiting review for Moderator/Admin to approve or reject)
    await prisma.job.upsert({
      where: { id: 'demo-job-pending-02' },
      update: { status: JobStatus.PENDING },
      create: {
        id: 'demo-job-pending-02',
        universityId: demoUniversity.id,
        postedById: alumniUser.id,
        title: 'Junior Frontend Developer (React/Next.js)',
        company: 'Apex Cloud Solutions',
        location: 'Dhaka',
        employmentType: 'Full-time',
        description: 'Join our design systems and frontend team. Great mentorship opportunity for recent graduates and final year students.',
        applicationEmail: 'careers@apexcloud.example',
        status: JobStatus.PENDING,
      },
    });

    // 5. Workflow Fixture: Job Application (Student applied to approved job)
    await prisma.jobApplication.upsert({
      where: {
        jobId_applicantId: {
          jobId: approvedJob.id,
          applicantId: studentUser.id,
        },
      },
      update: {},
      create: {
        jobId: approvedJob.id,
        applicantId: studentUser.id,
        message: 'I have completed several full-stack projects in Next.js and Go. Resume attached.',
      },
    });

    // 6. Workflow Fixture: Pending Student for Verification Queue review
    await prisma.user.upsert({
      where: { email: 'pending.verification@demo.edu' },
      update: {
        verificationStatus: VerificationStatus.PENDING,
      },
      create: {
        email: 'pending.verification@demo.edu',
        name: 'Nusrat Jahan (Verification Candidate)',
        passwordHash: demoPasswordHash,
        universityId: demoUniversity.id,
        roleId: roleMap.get(RoleName.STUDENT)!,
        department: 'Electrical & Electronic Engineering',
        batch: '2025',
        studentId: 'EEE-2025-089',
        currentSemester: '6th Semester',
        verified: false,
        verificationStatus: VerificationStatus.PENDING,
        onboardingCompleted: true,
        isDemo: true,
      },
    });

    logger.info('Development demo accounts, sandbox fixtures, and queues ready.');
  }

  /**
   * Resolves a demo user by requested role.
   */
  async findDemoUserByRole(role: RoleName) {
    return prisma.user.findFirst({
      where: {
        role: { name: role },
        isDemo: true,
      },
      include: {
        role: {
          include: {
            permissions: true,
          },
        },
        university: true,
      },
    });
  }

  /**
   * Safely deletes all records tagged with isDemo=true without touching real user data.
   */
  async cleanupDemoData(): Promise<{ deletedUsers: number; deletedUniversities: number }> {
    logger.warn('Running development demo cleanup. Purging only demo-tagged records...');

    // Cascade relationships in PostgreSQL handle related jobs/connections
    const deletedUsers = await prisma.user.deleteMany({
      where: { isDemo: true },
    });

    const deletedUniversities = await prisma.university.deleteMany({
      where: { isDemo: true },
    });

    logger.info(
      { users: deletedUsers.count, universities: deletedUniversities.count },
      'Development demo data cleanup finished.',
    );

    return {
      deletedUsers: deletedUsers.count,
      deletedUniversities: deletedUniversities.count,
    };
  }
}

export const demoService = new DemoService();
