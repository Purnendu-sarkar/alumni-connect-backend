import { RoleName } from '../src/generated/prisma/client.js';
import { prisma } from '../src/config/database.js';

async function main() {
  console.log('==============================================================================');
  console.log('ALUMNI CONNECT - SINGLE CANONICAL UNIVERSITY CONSOLIDATION & DEMO PURGE SCRIPT');
  console.log('==============================================================================\n');

  const superAdminEmail = (
    process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL || 'dsr102.purnendu@gmail.com'
  ).trim().toLowerCase();
  const canonicalSlug = (
    process.env.BOOTSTRAP_UNIVERSITY_SLUG || 'north-western-university'
  ).trim();
  const canonicalName = (
    process.env.BOOTSTRAP_UNIVERSITY_NAME || 'North Western University'
  ).trim();
  const canonicalDomain = (
    process.env.BOOTSTRAP_UNIVERSITY_DOMAIN || 'nwu.ac.bd'
  ).trim();

  // ---------------------------------------------------------------------------
  // STEP 1: Capture Pre-Consolidation State
  // ---------------------------------------------------------------------------
  console.log('>>> STEP 1: Inspecting Pre-Consolidation Database State...');
  const initialUnis = await prisma.university.findMany({
    include: {
      _count: {
        select: {
          users: true,
          departments: true,
          jobs: true,
          stories: true,
          auditLogs: true,
        },
      },
    },
  });
  console.log(`Found ${initialUnis.length} universities:`);
  for (const u of initialUnis) {
    console.log(
      `  - [${u.id}] ${u.name} (slug: ${u.slug}, domain: ${u.domain}, isActive: ${u.isActive}, isDemo: ${u.isDemo}) ` +
        `=> Users: ${u._count.users}, Depts: ${u._count.departments}, Jobs: ${u._count.jobs}, AuditLogs: ${u._count.auditLogs}`,
    );
  }

  const initialUsers = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: { select: { name: true } },
      university: { select: { id: true, name: true, slug: true } },
      isDemo: true,
      verified: true,
      verificationStatus: true,
      isActive: true,
    },
  });
  console.log(`\nFound ${initialUsers.length} total users in database:`);
  for (const usr of initialUsers) {
    console.log(
      `  - ${usr.name} <${usr.email}> | Role: ${usr.role.name} | Uni: ${usr.university?.name} (${usr.university?.slug}) | isDemo: ${usr.isDemo} | Status: ${usr.verificationStatus} | Verified: ${usr.verified}`,
    );
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Ensure Canonical University Exists and is Active
  // ---------------------------------------------------------------------------
  console.log('\n>>> STEP 2: Ensuring Canonical University Exists...');
  const canonicalUni = await prisma.university.upsert({
    where: { slug: canonicalSlug },
    update: {
      name: canonicalName,
      domain: canonicalDomain,
      isActive: true,
      isDemo: false,
    },
    create: {
      name: canonicalName,
      slug: canonicalSlug,
      domain: canonicalDomain,
      isActive: true,
      isDemo: false,
    },
  });
  console.log(`Canonical University Confirmed: ${canonicalUni.name} [${canonicalUni.id}] (slug: ${canonicalUni.slug})`);

  // ---------------------------------------------------------------------------
  // STEP 3: Reassign Super Admin to Canonical University
  // ---------------------------------------------------------------------------
  console.log(`\n>>> STEP 3: Reassigning Platform Super Admin (${superAdminEmail}) to Canonical University...`);
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: RoleName.SUPER_ADMIN },
  });

  const updatedAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      universityId: canonicalUni.id,
      roleId: adminRole.id,
      isDemo: false,
      isActive: true,
      verified: true,
      verificationStatus: 'APPROVED',
      verifiedAt: new Date(),
    },
    create: {
      email: superAdminEmail,
      name: process.env.BOOTSTRAP_SUPER_ADMIN_NAME || 'Platform Super Admin',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890', // placeholder if missing
      universityId: canonicalUni.id,
      roleId: adminRole.id,
      isDemo: false,
      isActive: true,
      verified: true,
      verificationStatus: 'APPROVED',
      verifiedAt: new Date(),
    },
  });
  console.log(`Super Admin reassigned: ${updatedAdmin.name} <${updatedAdmin.email}> => universityId: ${updatedAdmin.universityId}`);

  // Flush stale tokens and sessions for super admin so the next login generates fresh JWT with NWU id
  const deletedTokens = await prisma.refreshToken.deleteMany({
    where: { userId: updatedAdmin.id },
  });
  console.log(`Revoked ${deletedTokens.count} stale RefreshToken records for Super Admin.`);

  // ---------------------------------------------------------------------------
  // STEP 4: Ensure All Canonical Core Departments Exist in Canonical University
  // ---------------------------------------------------------------------------
  console.log('\n>>> STEP 4: Syncing Departments in Canonical University...');
  const CORE_DEPARTMENTS = [
    {
      name: 'Computer Science & Engineering',
      code: 'CSE',
      faculty: 'Faculty of Science & Engineering',
      displayOrder: 1,
      description: 'Department of Computer Science & Engineering',
    },
    {
      name: 'Electrical & Electronic Engineering',
      code: 'EEE',
      faculty: 'Faculty of Science & Engineering',
      displayOrder: 2,
      description: 'Department of Electrical & Electronic Engineering',
    },
    {
      name: 'Business Administration',
      code: 'BBA',
      faculty: 'Faculty of Business Studies',
      displayOrder: 3,
      description: 'School of Business & Entrepreneurship',
    },
    {
      name: 'Economics',
      code: 'ECON',
      faculty: 'Faculty of Social Sciences',
      displayOrder: 4,
      description: 'Department of Economics & Development Policy',
    },
    {
      name: 'English',
      code: 'ENG',
      faculty: 'Faculty of Arts & Humanities',
      displayOrder: 5,
      description: 'Department of English Language & Literature',
    },
    {
      name: 'Civil Engineering',
      code: 'CE',
      faculty: 'Faculty of Science & Engineering',
      displayOrder: 6,
      description: 'Department of Civil & Environmental Engineering',
    },
  ];

  const canonicalDepts = [];
  for (const dept of CORE_DEPARTMENTS) {
    const d = await prisma.department.upsert({
      where: {
        universityId_name: {
          universityId: canonicalUni.id,
          name: dept.name,
        },
      },
      update: {
        code: dept.code,
        faculty: dept.faculty,
        displayOrder: dept.displayOrder,
        description: dept.description,
        isActive: true,
      },
      create: {
        universityId: canonicalUni.id,
        name: dept.name,
        code: dept.code,
        faculty: dept.faculty,
        displayOrder: dept.displayOrder,
        description: dept.description,
        isActive: true,
      },
    });
    canonicalDepts.push(d);
  }
  console.log(`Ensured ${canonicalDepts.length} canonical departments under ${canonicalUni.name}.`);

  // Link any NWU users missing departmentId
  for (const dept of canonicalDepts) {
    const updatedUsers = await prisma.user.updateMany({
      where: {
        universityId: canonicalUni.id,
        OR: [
          { department: { equals: dept.name, mode: 'insensitive' } },
          { department: { equals: dept.code, mode: 'insensitive' } },
        ],
      },
      data: {
        departmentId: dept.id,
        department: dept.name,
      },
    });
    if (updatedUsers.count > 0) {
      console.log(`  Linked ${updatedUsers.count} users to department '${dept.name}'.`);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 5: Reassign Any Other Non-Demo Users to Canonical University
  // ---------------------------------------------------------------------------
  console.log('\n>>> STEP 5: Consolidating Any Non-Demo Users to Canonical University...');
  const nonDemoReassign = await prisma.user.updateMany({
    where: {
      isDemo: false,
      universityId: { not: canonicalUni.id },
    },
    data: {
      universityId: canonicalUni.id,
    },
  });
  console.log(`Reassigned ${nonDemoReassign.count} non-demo user(s) to ${canonicalUni.name}.`);

  // ---------------------------------------------------------------------------
  // STEP 6: Purge All Demo Users and Dependent Records
  // ---------------------------------------------------------------------------
  console.log('\n>>> STEP 6: Purging All Demo Users & Demo Data...');
  const demoUsers = await prisma.user.findMany({
    where: {
      OR: [
        { isDemo: true },
        { email: { endsWith: '@demo.edu' } },
      ],
    },
    select: { id: true, email: true, name: true },
  });
  console.log(`Identified ${demoUsers.length} demo user(s) to delete:`);
  for (const d of demoUsers) {
    console.log(`  - ${d.name} <${d.email}> [${d.id}]`);
  }

  const demoUserIds = demoUsers.map((u) => u.id);

  if (demoUserIds.length > 0) {
    // 6.1 Delete job applications by demo users
    const delJobApps = await prisma.jobApplication.deleteMany({
      where: { applicantId: { in: demoUserIds } },
    });
    console.log(`  Deleted ${delJobApps.count} JobApplication record(s).`);

    // 6.2 Delete job moderation records involving demo users
    const delJobMods = await prisma.jobModerationRecord.deleteMany({
      where: { actorId: { in: demoUserIds } },
    });
    console.log(`  Deleted ${delJobMods.count} JobModerationRecord record(s).`);

    // 6.3 Delete story moderation records involving demo users
    const delStoryMods = await prisma.storyModerationRecord.deleteMany({
      where: { moderatorId: { in: demoUserIds } },
    });
    console.log(`  Deleted ${delStoryMods.count} StoryModerationRecord record(s).`);

    // 6.4 Delete jobs posted by demo users (along with cascade applications & moderations)
    const demoJobs = await prisma.job.findMany({
      where: { postedById: { in: demoUserIds } },
      select: { id: true },
    });
    const demoJobIds = demoJobs.map((j) => j.id);
    if (demoJobIds.length > 0) {
      await prisma.jobApplication.deleteMany({ where: { jobId: { in: demoJobIds } } });
      await prisma.jobModerationRecord.deleteMany({ where: { jobId: { in: demoJobIds } } });
      const delJobs = await prisma.job.deleteMany({ where: { id: { in: demoJobIds } } });
      console.log(`  Deleted ${delJobs.count} Job record(s) posted by demo users.`);
    }

    // 6.5 Delete stories authored by demo users
    const delStories = await prisma.successStory.deleteMany({
      where: { authorId: { in: demoUserIds } },
    });
    console.log(`  Deleted ${delStories.count} SuccessStory record(s) authored by demo users.`);

    // 6.6 Delete connections involving demo users
    const delConnections = await prisma.connection.deleteMany({
      where: {
        OR: [
          { requesterId: { in: demoUserIds } },
          { recipientId: { in: demoUserIds } },
        ],
      },
    });
    console.log(`  Deleted ${delConnections.count} Connection record(s).`);

    // 6.7 Delete mentorship requests involving demo users
    const delMentorships = await prisma.mentorshipRequest.deleteMany({
      where: {
        OR: [
          { mentorId: { in: demoUserIds } },
          { menteeId: { in: demoUserIds } },
        ],
      },
    });
    console.log(`  Deleted ${delMentorships.count} MentorshipRequest record(s).`);

    // 6.8 Delete blocks involving demo users
    const delBlocks = await prisma.block.deleteMany({
      where: {
        OR: [
          { blockerId: { in: demoUserIds } },
          { blockedId: { in: demoUserIds } },
        ],
      },
    });
    console.log(`  Deleted ${delBlocks.count} Block record(s).`);

    // 6.9 Delete tokens, preferences, notifications & privacy settings
    await prisma.refreshToken.deleteMany({ where: { userId: { in: demoUserIds } } });
    await prisma.verificationToken.deleteMany({ where: { userId: { in: demoUserIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: demoUserIds } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: demoUserIds } } });
    await prisma.privacySetting.deleteMany({ where: { userId: { in: demoUserIds } } });
    await prisma.moderatorInvitation.deleteMany({ where: { invitedById: { in: demoUserIds } } });

    // 6.10 Nullify audit log actors for demo users so audit trail is preserved without FK error
    await prisma.auditLog.updateMany({
      where: { actorId: { in: demoUserIds } },
      data: { actorId: null },
    });

    // 6.11 Delete the demo users permanently
    const delUsers = await prisma.user.deleteMany({
      where: { id: { in: demoUserIds } },
    });
    console.log(`  Permanently deleted ${delUsers.count} demo user(s).`);
  }

  // ---------------------------------------------------------------------------
  // STEP 7: Decommission & Purge Demo University
  // ---------------------------------------------------------------------------
  console.log('\n>>> STEP 7: Decommissioning & Purging Demo University...');
  const demoUni = await prisma.university.findUnique({
    where: { slug: 'demo-university' },
  });

  if (demoUni) {
    // Delete any remaining jobs, stories, audit logs, departments for demoUni
    const remJobs = await prisma.job.findMany({ where: { universityId: demoUni.id }, select: { id: true } });
    const remJobIds = remJobs.map((j) => j.id);
    if (remJobIds.length > 0) {
      await prisma.jobApplication.deleteMany({ where: { jobId: { in: remJobIds } } });
      await prisma.jobModerationRecord.deleteMany({ where: { jobId: { in: remJobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: remJobIds } } });
    }
    await prisma.successStory.deleteMany({ where: { universityId: demoUni.id } });
    await prisma.auditLog.deleteMany({ where: { universityId: demoUni.id } });
    await prisma.department.deleteMany({ where: { universityId: demoUni.id } });
    await prisma.refreshToken.deleteMany({ where: { universityId: demoUni.id } });

    // Try hard delete; if anything remains, deactivate it completely
    try {
      await prisma.university.delete({ where: { id: demoUni.id } });
      console.log(`  Deleted demo university [${demoUni.id}] permanently.`);
    } catch (err: unknown) {
      console.warn(`  Could not hard-delete demo university (${err instanceof Error ? err.message : String(err)}). Deactivating permanently...`);
      await prisma.university.update({
        where: { id: demoUni.id },
        data: {
          isActive: false,
          isDemo: true,
          name: 'Decommissioned Demo University',
        },
      });
      console.log(`  Deactivated demo university [${demoUni.id}] (isActive: false).`);
    }
  } else {
    console.log('  No demo university found.');
  }

  // ---------------------------------------------------------------------------
  // STEP 8: Ensure Privacy Settings for All Remaining Users
  // ---------------------------------------------------------------------------
  console.log('\n>>> STEP 8: Ensuring Privacy Settings & Profiles for Remaining Users...');
  const remainingUsers = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: { select: { name: true } }, privacySetting: { select: { id: true } } },
  });

  for (const usr of remainingUsers) {
    if (!usr.privacySetting) {
      await prisma.privacySetting.create({
        data: {
          userId: usr.id,
          profileVisibility: 'ALL_MEMBERS',
          emailVisibility: 'CONNECTIONS_ONLY',
          phoneVisibility: 'ONLY_ME',
          locationVisibility: 'ALL_MEMBERS',
          careerVisibility: 'ALL_MEMBERS',
          educationVisibility: 'ALL_MEMBERS',
          skillsVisibility: 'ALL_MEMBERS',
          connectionsVisibility: 'ALL_MEMBERS',
          mentorshipVisibility: 'ALL_MEMBERS',
          searchVisibility: 'ALL_MEMBERS',
          messagingPermission: 'ALL_MEMBERS',
        },
      });
    }
  }
  console.log(`Verified privacy settings for all ${remainingUsers.length} users.`);

  // ---------------------------------------------------------------------------
  // STEP 9: Final Post-Consolidation Verification
  // ---------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log('POST-CONSOLIDATION DATABASE AUDIT & VERIFICATION');
  console.log('==============================================================================');

  const finalUnis = await prisma.university.findMany({
    where: { isActive: true },
    include: {
      _count: {
        select: {
          users: true,
          departments: true,
          jobs: true,
          stories: true,
        },
      },
    },
  });

  console.log(`Active Universities: ${finalUnis.length}`);
  for (const u of finalUnis) {
    console.log(
      `  * [${u.id}] ${u.name} (slug: ${u.slug}, domain: ${u.domain}) ` +
        `=> Users: ${u._count.users}, Depts: ${u._count.departments}, Jobs: ${u._count.jobs}, Stories: ${u._count.stories}`,
    );
  }

  const finalUsers = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { name: true } },
      university: { select: { name: true, slug: true } },
      isDemo: true,
      verified: true,
      verificationStatus: true,
      department: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\nTotal Users Remaining: ${finalUsers.length} (ALL under Canonical University):`);
  for (const u of finalUsers) {
    console.log(
      `  * ${u.name} <${u.email}> | Role: ${u.role.name} | Dept: ${u.department ?? 'N/A'} | Status: ${u.verificationStatus} | EmailVerified: ${u.verified} | isDemo: ${u.isDemo} | Created: ${u.createdAt.toISOString()}`,
    );
  }

  const pendingAlumni = finalUsers.filter(
    (u) => u.role.name === 'ALUMNI' && u.verificationStatus === 'PENDING',
  );
  console.log(`\nPending Alumni Verification Queue Count: ${pendingAlumni.length}`);
  for (const pa of pendingAlumni) {
    console.log(`  -> ${pa.name} <${pa.email}> (Status: ${pa.verificationStatus}, EmailVerified: ${pa.verified})`);
  }

  console.log('\nConsolidation & Demo Purge completed successfully!');
}

main()
  .catch((err) => {
    console.error('Fatal consolidation error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
