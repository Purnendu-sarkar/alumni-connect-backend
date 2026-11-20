import { prisma } from '../src/config/database.js';
import { cacheService } from '../src/services/cache/cache.service.js';
import {
  AnnouncementStatus,
  AnnouncementCategory,
  AnnouncementAudience,
  type Prisma,
} from '../src/generated/prisma/client.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// -----------------------------------------------------------------------------
// CONSTANTS & CONFIGURATION
// -----------------------------------------------------------------------------
const CANONICAL_UNIVERSITY_SLUG = 'north-western-university';
const CANONICAL_UNIVERSITY_NAME = 'North Western University';

const ROLE_PASSWORDS = {
  SUPER_ADMIN: 'SuperAdminPass@2026!',
  MODERATOR: 'ModeratorPass@2026!',
  ALUMNI: 'AlumniPass@2026!',
  STUDENT: 'StudentPass@2026!',
} as const;

// Helper to delay execution (micro-pause between database chunks)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------------------------------------------------------
// ANNOUNCEMENT TEMPLATE GENERATION DICTIONARIES
// -----------------------------------------------------------------------------
interface AnnouncementTemplate {
  title: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  body: string;
}

const PINNED_TEMPLATES: AnnouncementTemplate[] = [
  {
    title: 'Annual University Convocation & Grand Alumni Homecoming 2026',
    category: AnnouncementCategory.EVENT,
    audience: AnnouncementAudience.ALL,
    body: `
      <h3>North Western University Annual Convocation & Homecoming Celebration</h3>
      <p>The Syndicate and Academic Council of North Western University are pleased to formally announce the <strong>Annual University Convocation and Grand Alumni Homecoming 2026</strong>. This milestone gathering unites our graduating cohorts, distinguished alumni leaders, esteemed faculty, and honored corporate guests.</p>
      <h4>Event Highlights & Important Protocols:</h4>
      <ul>
        <li><strong>Venue:</strong> North Western University Central Campus Auditorium & Grand Pavilion.</li>
        <li><strong>Ceremonial Session:</strong> Conferment of undergraduate and postgraduate academic degrees, Chancellor's Gold Medals, and Vice-Chancellor's Academic Excellence awards.</li>
        <li><strong>Grand Homecoming Banquet:</strong> Evening cultural gala, reunion networking dinner, and institutional legacy recognition.</li>
        <li><strong>Gown Collection:</strong> Verified registrants must collect convocation regalia from the Central Gymnasium between 10:00 AM and 04:00 PM.</li>
      </ul>
      <blockquote>"Bridging academic excellence with lifelong alumni engagement to foster regional and national development."</blockquote>
      <p>All attendees are requested to display their digital invitation card at the main security reception. For further assistance, contact the Office of the Registrar.</p>
    `.trim(),
  },
  {
    title: 'Final Semester Examination Schedule & Central Admit Card Issuance Guideline',
    category: AnnouncementCategory.ACADEMIC,
    audience: AnnouncementAudience.STUDENTS,
    body: `
      <h3>Controller of Examinations — Semester Final Examination Circular</h3>
      <p>This is for the information of all enrolled undergraduate and graduate students across the Faculty of Science & Technology, Faculty of Business Studies, and Faculty of Liberal Arts & Law that the <strong>Final Semester Examination Schedule</strong> has been officially published.</p>
      <h4>Key Directives & Admit Card Collection:</h4>
      <ul>
        <li><strong>Exam Duration:</strong> Written examinations commence across all departmental exam centers as per the central routine.</li>
        <li><strong>Admit Card Download:</strong> Digital admit cards are accessible via the student portal under the <em>Academics & Examination</em> tab following clearance of semester dues.</li>
        <li><strong>Hall Entry Protocol:</strong> Students must produce their original university photo ID card along with a printed admit card. No programmable calculators or mobile handsets are permitted.</li>
        <li><strong>Exam Clashes & Rescheduling:</strong> Legitimate course clash notifications must be lodged with the departmental head within 48 hours of this notice.</li>
      </ul>
      <p>We urge all students to maintain academic integrity and adhere strictly to the university examination code of conduct.</p>
    `.trim(),
  },
  {
    title: 'Global Alumni Mentorship Network & Lifetime Industry Privilege Program',
    category: AnnouncementCategory.CAREER,
    audience: AnnouncementAudience.ALUMNI,
    body: `
      <h3>Directorate of Student Affairs & Central Alumni Association</h3>
      <p>We are delighted to inaugurate the <strong>Global Alumni Mentorship Network & Lifetime Industry Privilege Program</strong>, exclusively designed to celebrate and empower our alumni community worldwide.</p>
      <h4>New Privileges & Collaborative Initiatives:</h4>
      <ul>
        <li><strong>Executive Mentorship Matching:</strong> Experienced alumni holding managerial and technical leadership positions can mentor graduating seniors and junior alumni through our intelligent matching dashboard.</li>
        <li><strong>University Library & Research Commons:</strong> Lifetime digital access to IEEE Xplore, JSTOR, and central research archives.</li>
        <li><strong>Corporate & Hospitality Partner Discounts:</strong> Special institutional privileges at premier partner hotels, tech co-working spaces, and health clinics across Bangladesh.</li>
        <li><strong>Alumni Identity Card:</strong> Upgrade to the smart chip-enabled Lifetime Alumni Card at the Alumni Relations Desk.</li>
      </ul>
      <blockquote>"Your enduring achievements continue to inspire subsequent generations of North Western University graduates."</blockquote>
      <p>Register your current professional details on the alumni directory to activate these exclusive benefits immediately.</p>
    `.trim(),
  },
];

// Rich Template Bank for generating diverse, authentic institutional notices
const GENERAL_ALL_TITLES = [
  'Central Campus Infrastructure Upgrades & Sustainable Green Energy Initiative',
  'Annual Founders Day Commemoration & Public Lecture by Renowned Academician',
  'University Transport Service Route Expansion & Digital Bus Tracking App',
  'Campus Health & Wellness Center: Free Annual Medical Screening Week',
  'Institutional Accreditation Renewal & ISO Quality Assurance Report',
  'Central Cafeteria Hygiene Inspection & Subsidized Healthy Meal Program',
  'Observance of National Historic Days & Campus Flag-Raising Ceremony',
  'University Central Library Digital Kiosk Installation & Extended Hours',
  'Annual Sports Tournament & Inter-Departmental Cricket Championship',
  'University Endowment Fund & Community Outreach Initiative in Khulna',
  'Winter Break Official Operational Schedule & Administrative Office Hours',
  'Campus Waste Segregation & Plastic-Free University Drive 2026',
  'North Western University Annual Research Bulletin Publication',
  'Central Gymnasium Renovation & Modern Fitness Equipment Installation',
  'Emergency Campus Health Protocol & First-Aid Training for Volunteers',
];

const ACADEMIC_STUDENTS_TITLES = [
  'Mid-Semester Assessment Routine & Course Evaluation Questionnaire Guide',
  'Undergraduate Research Fellowship & Capstone Project Grant Applications',
  'Class Attendance Policy & Mandatory 75% Requirement for Exam Eligibility',
  'Departmental Course Add/Drop Period & Academic Advising Deadlines',
  'Central Scholarship & Tuition Fee Waiver Application for High Achievers',
  'Remedial Classes for Fundamental Engineering & Mathematics Courses',
  'Laboratory Safety Certification & Mandatory Chemical Handling Training',
  'Summer Internship Credit Transfer & Industrial Attachment Guidelines',
  'English Language Proficiency Clinic & Academic Writing Support Center',
  'Dean of Faculty Merit List & Academic Honors Roll Announcement',
  'Supplementary Examination Application Window for Graduating Students',
  'Postgraduate Thesis Submission Guidelines & Plagiarism Verification',
  'Inter-University Programming Contest (IUPC) Team Selection Trials',
  'Department of Law Moot Court Competition Registration Open',
  'Electrical Machines Lab New Equipment Arrival & Demonstration Sessions',
];

const CAREER_ALUMNI_TITLES = [
  'Alumni Chapter Leadership Election in Dhaka & Regional Metropolitan Hubs',
  'Exclusive Alumni Networking Dinner & Executive Roundtable Discussion',
  'Alumni Venture Capital & Tech Startup Showcase Opportunity',
  'Call for Alumni Guest Lecturers & Industry Adjunct Faculty Positions',
  'Alumni Corporate Referral Program: Top Tech & Banking Openings',
  'Postgraduate Study in North America & Europe: Alumni Guidance Panel',
  'Alumni Association Annual General Meeting & Financial Audit Report',
  'North Western University Alumni in Civil Service: Experience Sharing',
  'Senior Executive Roundtable: Strategic Innovation & Industry Trends',
  'Alumni Contribution to Central Campus Digital Innovation Lab',
  'Alumni Sports League: Football Tournament Registration Open',
  'Professional Engineering Certification (PEng) Prep Workshop for Alumni',
  'Alumni Mentors Recognition & Outstanding Service Awards 2026',
  'Overseas Alumni Chapter Meetup in London & Virtual Global Connect',
  'Alumni Legal Aid Advisory Cell Formation for Community Empowerment',
];

const CAREER_STUDENTS_TITLES = [
  'Campus Placement Drive: Top Tier Software Firms Hiring Graduating Seniors',
  'Resume Building Masterclass & Technical Interview System Design Workshop',
  'Annual Corporate Career Expo 2026: 50+ Multinationals On Campus',
  'Summer Software Engineering Internship Opportunities with Partner Firms',
  'Bank Management Trainee Officer (MTO) Preparation Bootcamp',
  'LinkedIn Optimization & Professional Branding Clinic at Career Center',
  'Industry Visit to Khulna High-Tech Park & IT Incubator Facilities',
  'Supply Chain & Operations Management Career Pathways Seminar',
  'Civil Engineering Project Site Attachment with Leading Construction Firms',
  'Mock HR Interviews & Assessment Center Simulation for Final Year Students',
];

const EVENT_ALL_TITLES = [
  'North Western University International Conference on Emerging Technologies',
  'Annual Cultural Fest & Inter-University Musical Symphony 2026',
  'Campus Tech Carnival & Robotics Showcase Exhibition',
  'National Science & Innovation Fair Hosted by Faculty of Science',
  'University Debate Championship: National Inter-University Grand Finale',
  'Annual Book Fair & Author Interaction at Central Courtyard',
  'International Mother Language Day Commemoration & Literary Seminar',
  'University Blood Donation Camp in Collaboration with Red Crescent',
  'Photography Exhibition & Arts Gala: Expressions of North Western',
  'Climate Change & Coastal Ecology Symposium with Global Scientists',
];

const SECURITY_SYSTEM_TITLES = [
  'Campus Central WiFi Infrastructure Upgrade & High-Speed Optical Fiber',
  'Mandatory Student & Faculty Two-Factor Authentication (2FA) Rollout',
  'University ERP Portal Scheduled Maintenance & Server Migration Window',
  'Campus CCTV Surveillance Expansion & Enhanced Perimeter Security',
  'Cyber Security Advisory: Phishing Awareness & Account Security Standards',
  'Digital ID Card Smart Reader Installation at Main Entry Turnstiles',
  'Central Database Optimization & Cloud Disaster Recovery Drill',
  'Student Email Service Migration to Enterprise Microsoft 365 Domain',
];

// -----------------------------------------------------------------------------
// MAIN PROVISIONING ROUTINE
// -----------------------------------------------------------------------------
async function main() {
  const startTime = Date.now();
  console.log('================================================================================');
  console.log('ALUMNI CONNECT - PRODUCTION BULK ANNOUNCEMENT PROVISIONING SCRIPT');
  console.log(`Target: ${CANONICAL_UNIVERSITY_NAME} (slug: ${CANONICAL_UNIVERSITY_SLUG})`);
  console.log('Goal: 240 Institutional Announcements (80/Super Admin), strictly 3 pinned notices');
  console.log('================================================================================\n');

  // STEP 1: RESOLVE UNIVERSITY & ACTORS
  console.log('>>> [STEP 1/5] Resolving Canonical University & Live Super Admins...');
  const university = await prisma.university.findUnique({
    where: { slug: CANONICAL_UNIVERSITY_SLUG },
  });

  if (!university) {
    throw new Error(
      `Canonical university "${CANONICAL_UNIVERSITY_NAME}" (${CANONICAL_UNIVERSITY_SLUG}) not found in PostgreSQL database.`
    );
  }

  // Idempotency check: Skip if >= 230 announcements already exist unless --force is specified
  const isForce = process.argv.includes('--force');
  const existingCount = await prisma.announcement.count({
    where: { universityId: university.id },
  });

  console.log(`[INFO] Current announcements in database for ${CANONICAL_UNIVERSITY_NAME}: ${existingCount}`);

  if (existingCount >= 230 && !isForce) {
    console.log(
      `[IDEMPOTENT SKIP] Database already contains ${existingCount} announcements for "${CANONICAL_UNIVERSITY_NAME}".`
    );
    console.log('Use "--force" flag if you wish to purge existing announcements and re-provision.\n');
    process.exit(0);
  }

  if (isForce && existingCount > 0) {
    console.log(`[FORCE RESET] Purging ${existingCount} existing announcements for clean re-provisioning...`);
    await prisma.announcement.deleteMany({
      where: { universityId: university.id },
    });
    console.log('[OK] Existing announcements purged.');
  }

  // Query live Super Admins
  const superAdmins = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: 'SUPER_ADMIN' },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (superAdmins.length < 3) {
    throw new Error(
      `Expected at least 3 Super Admins for North Western University, but found ${superAdmins.length}.`
    );
  }

  console.log(`[OK] Super Admins Loaded (${superAdmins.length} active admins):`);
  superAdmins.forEach((sa, idx) => {
    console.log(`  [${idx + 1}] "${sa.name}" <${sa.email}> (Target: 80 announcements)`);
  });

  const getAuthor = (index: number) => {
    const admin = superAdmins[index % superAdmins.length];
    if (!admin) throw new Error('Super Admin not found at index ' + index);
    return admin;
  };

  // STEP 2: SYNTHESIZE 240 ANNOUNCEMENTS
  console.log('\n>>> [STEP 2/5] Synthesizing 240 Realistic Institutional Announcements (80/Super Admin)...');

  // Exact target distribution pools:
  // Categories: 60 GENERAL, 55 ACADEMIC, 55 CAREER, 45 EVENT, 25 SECURITY_SYSTEM = 240
  // Audiences: 120 ALL, 60 STUDENTS, 60 ALUMNI = 240
  const remainingCategories: AnnouncementCategory[] = [];
  for (let i = 0; i < 60; i++) remainingCategories.push(AnnouncementCategory.GENERAL);
  for (let i = 0; i < 54; i++) remainingCategories.push(AnnouncementCategory.ACADEMIC); // 54 + 1 pinned = 55
  for (let i = 0; i < 54; i++) remainingCategories.push(AnnouncementCategory.CAREER);   // 54 + 1 pinned = 55
  for (let i = 0; i < 44; i++) remainingCategories.push(AnnouncementCategory.EVENT);    // 44 + 1 pinned = 45
  for (let i = 0; i < 25; i++) remainingCategories.push(AnnouncementCategory.SECURITY_SYSTEM);

  const remainingAudiences: AnnouncementAudience[] = [];
  for (let i = 0; i < 119; i++) remainingAudiences.push(AnnouncementAudience.ALL);      // 119 + 1 pinned = 120
  for (let i = 0; i < 59; i++) remainingAudiences.push(AnnouncementAudience.STUDENTS);  // 59 + 1 pinned = 60
  for (let i = 0; i < 59; i++) remainingAudiences.push(AnnouncementAudience.ALUMNI);    // 59 + 1 pinned = 60

  // Deterministically interleave to distribute categories and audiences smoothly
  const mixedCategories: AnnouncementCategory[] = [];
  const mixedAudiences: AnnouncementAudience[] = [];
  for (let i = 0; i < 237; i++) {
    const cat = remainingCategories[i % remainingCategories.length]!;
    const aud = remainingAudiences[i % remainingAudiences.length]!;
    mixedCategories.push(cat);
    mixedAudiences.push(aud);
  }

  interface SynthesizedAnnouncement {
    universityId: string;
    authorId: string;
    title: string;
    body: string;
    category: AnnouncementCategory;
    audience: AnnouncementAudience;
    pinned: boolean;
    status: AnnouncementStatus;
    publishAt: Date | null;
    archiveAt: Date | null;
    publishedAt: Date | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    version: number;
  }

  const plannedAnnouncements: SynthesizedAnnouncement[] = [];

  // Helper generator to build realistic HTML body
  function buildHtmlBody(
    title: string,
    category: AnnouncementCategory,
    audience: AnnouncementAudience,
    context: string
  ): string {
    const audienceDesc =
      audience === AnnouncementAudience.ALL
        ? 'all enrolled students, distinguished alumni, faculty members, and university staff'
        : audience === AnnouncementAudience.STUDENTS
        ? 'all undergraduate and postgraduate students of North Western University'
        : 'all registered and verified alumni across all graduated cohorts';

    return `
      <h3>${title}</h3>
      <p>The University Administration hereby notifies ${audienceDesc} regarding recent resolutions and executive directives pertaining to <strong>${title}</strong>.</p>
      <h4>Official Operational Guidelines:</h4>
      <ul>
        <li><strong>Scope & Implementation:</strong> This circular takes immediate effect across all departments under the purview of North Western University.</li>
        <li><strong>Administrative Support:</strong> The respective departmental advisory desks and student affairs offices are available for consultations during official working hours (09:00 AM – 05:00 PM).</li>
        <li><strong>Compliance Requirement:</strong> All relevant university members are requested to review the procedural documentation and adhere strictly to institutional policies.</li>
      </ul>
      <blockquote>${context}</blockquote>
      <p>For official inquiries or urgent clarification, please contact the administrative registrar office or submit a ticket through the official university portal.</p>
    `.trim();
  }

  function getTitleByContext(cat: AnnouncementCategory, aud: AnnouncementAudience, index: number): string {
    let pool = GENERAL_ALL_TITLES;
    if (cat === AnnouncementCategory.ACADEMIC) pool = ACADEMIC_STUDENTS_TITLES;
    else if (cat === AnnouncementCategory.CAREER && aud === AnnouncementAudience.ALUMNI) pool = CAREER_ALUMNI_TITLES;
    else if (cat === AnnouncementCategory.CAREER) pool = CAREER_STUDENTS_TITLES;
    else if (cat === AnnouncementCategory.EVENT) pool = EVENT_ALL_TITLES;
    else if (cat === AnnouncementCategory.SECURITY_SYSTEM) pool = SECURITY_SYSTEM_TITLES;

    const baseTitle = pool[index % pool.length] || 'Institutional Notice';
    return `${baseTitle} (Ref #NWU-2026-${String(index + 1).padStart(3, '0')})`;
  }

  // Build the 240 announcements:
  // 0..24: Recent Published (25) -> indices 0,1,2 are PINNED
  // 25..144: Established Published (120) -> indices 25..44 have future archiveAt
  // 145..169: Scheduled Drafts (25)
  // 170..179: Regular Drafts (10)
  // 180..239: Past Archived (60)
  for (let i = 0; i < 240; i++) {
    const author = getAuthor(i);

    if (i < 3) {
      // The 3 strictly PINNED notices
      const pinnedTpl = PINNED_TEMPLATES[i]!;
      const daysAgo = [2, 3, 1][i]!;
      const pubDate = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);

      plannedAnnouncements.push({
        universityId: university.id,
        authorId: author.id,
        title: pinnedTpl.title,
        body: pinnedTpl.body,
        category: pinnedTpl.category,
        audience: pinnedTpl.audience,
        pinned: true,
        status: AnnouncementStatus.PUBLISHED,
        publishAt: new Date(pubDate.getTime() - 3600 * 1000),
        archiveAt: null,
        publishedAt: pubDate,
        archivedAt: null,
        createdAt: pubDate,
        updatedAt: pubDate,
        version: 1,
      });
    } else if (i < 25) {
      // Remaining 22 recent published notices (published 1-6 days ago, pinned: false)
      const cat = mixedCategories[i - 3]!;
      const aud = mixedAudiences[i - 3]!;
      const daysAgo = 1 + ((i - 3) % 5);
      const pubDate = new Date(Date.now() - (daysAgo * 24 + i) * 3600 * 1000);
      const title = getTitleByContext(cat, aud, i);
      const body = buildHtmlBody(title, cat, aud, 'Recent circular issued for active university operations.');

      plannedAnnouncements.push({
        universityId: university.id,
        authorId: author.id,
        title,
        body,
        category: cat,
        audience: aud,
        pinned: false,
        status: AnnouncementStatus.PUBLISHED,
        publishAt: new Date(pubDate.getTime() - 1800 * 1000),
        archiveAt: null,
        publishedAt: pubDate,
        archivedAt: null,
        createdAt: pubDate,
        updatedAt: pubDate,
        version: 1,
      });
    } else if (i < 145) {
      // 120 Established Published (published 7-150 days ago, pinned: false)
      const cat = mixedCategories[i - 3]!;
      const aud = mixedAudiences[i - 3]!;
      const daysAgo = 7 + ((i - 25) % 140);
      const pubDate = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);

      // 20 notices with future archive deadlines (+5 to +45 days)
      const hasFutureArchive = i >= 25 && i < 45;
      const futureArchiveDate = hasFutureArchive
        ? new Date(Date.now() + (5 + (i - 25) * 2) * 24 * 3600 * 1000)
        : null;

      const title = getTitleByContext(cat, aud, i);
      const body = buildHtmlBody(title, cat, aud, 'Established institutional guideline maintained for ongoing academic term.');

      plannedAnnouncements.push({
        universityId: university.id,
        authorId: author.id,
        title,
        body,
        category: cat,
        audience: aud,
        pinned: false,
        status: AnnouncementStatus.PUBLISHED,
        publishAt: new Date(pubDate.getTime() - 3600 * 1000),
        archiveAt: futureArchiveDate,
        publishedAt: pubDate,
        archivedAt: null,
        createdAt: pubDate,
        updatedAt: pubDate,
        version: 1,
      });
    } else if (i < 170) {
      // 25 Future Scheduled Drafts (publishAt +1 to +30 days in future)
      const cat = mixedCategories[i - 3]!;
      const aud = mixedAudiences[i - 3]!;
      const daysAhead = 1 + ((i - 145) % 29);
      const scheduledPublishAt = new Date(Date.now() + daysAhead * 24 * 3600 * 1000);
      const createdDate = new Date(Date.now() - (i - 144) * 3600 * 1000);
      const title = `Scheduled: ${getTitleByContext(cat, aud, i)}`;
      const body = buildHtmlBody(title, cat, aud, 'Pre-scheduled notice awaiting automated cron release on scheduled publication date.');

      plannedAnnouncements.push({
        universityId: university.id,
        authorId: author.id,
        title,
        body,
        category: cat,
        audience: aud,
        pinned: false,
        status: AnnouncementStatus.DRAFT,
        publishAt: scheduledPublishAt,
        archiveAt: new Date(scheduledPublishAt.getTime() + 30 * 24 * 3600 * 1000),
        publishedAt: null,
        archivedAt: null,
        createdAt: createdDate,
        updatedAt: createdDate,
        version: 1,
      });
    } else if (i < 180) {
      // 10 Regular Unpublished Drafts (publishAt: null)
      const cat = mixedCategories[i - 3]!;
      const aud = mixedAudiences[i - 3]!;
      const createdDate = new Date(Date.now() - (i - 169) * 24 * 3600 * 1000);
      const title = `Draft Proposal: ${getTitleByContext(cat, aud, i)}`;
      const body = buildHtmlBody(title, cat, aud, 'Internal administrative draft under review prior to publication.');

      plannedAnnouncements.push({
        universityId: university.id,
        authorId: author.id,
        title,
        body,
        category: cat,
        audience: aud,
        pinned: false,
        status: AnnouncementStatus.DRAFT,
        publishAt: null,
        archiveAt: null,
        publishedAt: null,
        archivedAt: null,
        createdAt: createdDate,
        updatedAt: createdDate,
        version: 1,
      });
    } else {
      // 60 Past Archived (published 30-240 days ago, archived 1-25 days ago)
      const cat = mixedCategories[i - 3]!;
      const aud = mixedAudiences[i - 3]!;
      const pubDaysAgo = 35 + (i - 180) * 3;
      const archDaysAgo = 1 + ((i - 180) % 24);
      const pubDate = new Date(Date.now() - pubDaysAgo * 24 * 3600 * 1000);
      const archDate = new Date(Date.now() - archDaysAgo * 24 * 3600 * 1000);
      const title = `[Archived] ${getTitleByContext(cat, aud, i)}`;
      const body = buildHtmlBody(title, cat, aud, 'Archived historical circular retained for compliance, institutional records, and audit inspection.');

      plannedAnnouncements.push({
        universityId: university.id,
        authorId: author.id,
        title,
        body,
        category: cat,
        audience: aud,
        pinned: false,
        status: AnnouncementStatus.ARCHIVED,
        publishAt: pubDate,
        archiveAt: archDate,
        publishedAt: pubDate,
        archivedAt: archDate,
        createdAt: pubDate,
        updatedAt: archDate,
        version: 2,
      });
    }
  }

  console.log(`[OK] In-memory synthesis complete: ${plannedAnnouncements.length} announcements planned.`);

  // Verify distributions
  const publishedCount = plannedAnnouncements.filter((a) => a.status === AnnouncementStatus.PUBLISHED).length;
  const draftCount = plannedAnnouncements.filter((a) => a.status === AnnouncementStatus.DRAFT).length;
  const scheduledDraftCount = plannedAnnouncements.filter(
    (a) => a.status === AnnouncementStatus.DRAFT && a.publishAt !== null
  ).length;
  const regularDraftCount = plannedAnnouncements.filter(
    (a) => a.status === AnnouncementStatus.DRAFT && a.publishAt === null
  ).length;
  const archivedCount = plannedAnnouncements.filter((a) => a.status === AnnouncementStatus.ARCHIVED).length;
  const pinnedCount = plannedAnnouncements.filter((a) => a.pinned).length;

  console.log(`  - Total Synthesized: ${plannedAnnouncements.length}`);
  console.log(`  - PUBLISHED: ${publishedCount} (Recent: 25, Established: 120, Pinned: ${pinnedCount})`);
  console.log(`  - DRAFT: ${draftCount} (Scheduled: ${scheduledDraftCount}, Regular: ${regularDraftCount})`);
  console.log(`  - ARCHIVED: ${archivedCount}`);

  // Count per admin
  const adminCounts: Record<string, number> = {};
  for (const a of plannedAnnouncements) {
    adminCounts[a.authorId] = (adminCounts[a.authorId] || 0) + 1;
  }
  superAdmins.forEach((sa) => {
    console.log(`  - Super Admin "${sa.name}": ${adminCounts[sa.id]} announcements`);
  });

  // STEP 3: INSERT ANNOUNCEMENTS IN 50-RECORD CHUNKS
  console.log('\n>>> [STEP 3/5] Persisting Announcements to PostgreSQL in 50-Record Chunks...');
  const CHUNK_SIZE = 50;
  const insertedAnnouncements: Array<{ id: string; title: string; authorId: string; status: AnnouncementStatus; pinned: boolean; audience: AnnouncementAudience }> = [];

  for (let i = 0; i < plannedAnnouncements.length; i += CHUNK_SIZE) {
    const chunk = plannedAnnouncements.slice(i, i + CHUNK_SIZE);

    // Fast single-query batch insert per chunk
    await prisma.announcement.createMany({
      data: chunk.map((item) => ({
        universityId: item.universityId,
        authorId: item.authorId,
        title: item.title,
        body: item.body,
        category: item.category,
        audience: item.audience,
        pinned: item.pinned,
        status: item.status,
        publishAt: item.publishAt,
        archiveAt: item.archiveAt,
        publishedAt: item.publishedAt,
        archivedAt: item.archivedAt,
        version: item.version,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    });

    const chunkTitles = chunk.map((c) => c.title);
    const createdRows = await prisma.announcement.findMany({
      where: {
        universityId: university.id,
        title: { in: chunkTitles },
      },
      select: {
        id: true,
        title: true,
        authorId: true,
        status: true,
        pinned: true,
        audience: true,
      },
    });

    insertedAnnouncements.push(...createdRows);
    const progress = Math.min(100, Math.round(((i + chunk.length) / plannedAnnouncements.length) * 100));
    process.stdout.write(`  --> Inserted ${insertedAnnouncements.length}/${plannedAnnouncements.length} announcements (${progress}%)\r`);

    // Micro-pause to protect serverless connection pool
    await sleep(50);
  }
  console.log(`\n[OK] All ${insertedAnnouncements.length} announcements successfully persisted to PostgreSQL.`);

  // STEP 4: GENERATE MATCHING AUDIT LOG TRAILS IN CHUNKS
  console.log('\n>>> [STEP 4/5] Generating Matching AuditLog Trails in 50-Record Chunks...');
  const auditLogsToInsert: Array<Prisma.AuditLogCreateManyInput> = [];

  for (const ann of insertedAnnouncements) {
    // 1. ANNOUNCEMENT_CREATED for all 240
    auditLogsToInsert.push({
      universityId: university.id,
      actorId: ann.authorId,
      action: 'ANNOUNCEMENT_CREATED',
      targetType: 'ANNOUNCEMENT',
      targetId: ann.id,
      metadata: {
        title: ann.title,
        status: ann.status,
        audience: ann.audience,
      },
    });

    // 2. ANNOUNCEMENT_PUBLISHED for PUBLISHED announcements
    if (ann.status === AnnouncementStatus.PUBLISHED) {
      auditLogsToInsert.push({
        universityId: university.id,
        actorId: ann.authorId,
        action: 'ANNOUNCEMENT_PUBLISHED',
        targetType: 'ANNOUNCEMENT',
        targetId: ann.id,
        metadata: {
          title: ann.title,
        },
      });
    }

    // 3. ANNOUNCEMENT_ARCHIVED for ARCHIVED announcements
    if (ann.status === AnnouncementStatus.ARCHIVED) {
      auditLogsToInsert.push({
        universityId: university.id,
        actorId: ann.authorId,
        action: 'ANNOUNCEMENT_ARCHIVED',
        targetType: 'ANNOUNCEMENT',
        targetId: ann.id,
        metadata: {
          title: ann.title,
        },
      });
    }

    // 4. ANNOUNCEMENT_PINNED for strictly 3 pinned notices
    if (ann.pinned) {
      auditLogsToInsert.push({
        universityId: university.id,
        actorId: ann.authorId,
        action: 'ANNOUNCEMENT_PINNED',
        targetType: 'ANNOUNCEMENT',
        targetId: ann.id,
        metadata: {
          title: ann.title,
          pinned: true,
        },
      });
    }
  }

  for (let i = 0; i < auditLogsToInsert.length; i += CHUNK_SIZE) {
    const chunk = auditLogsToInsert.slice(i, i + CHUNK_SIZE);
    await prisma.auditLog.createMany({
      data: chunk,
    });
    await sleep(50);
  }
  console.log(`[OK] Generated and persisted ${auditLogsToInsert.length} AuditLog records.`);

  // STEP 5: FLUSH REDIS CACHES & EXPORT DIRECTORY
  console.log('\n>>> [STEP 5/5] Flushing Redis Caches & Exporting Directory Report...');
  try {
    await cacheService.bumpVersion('ann');
    await cacheService.delPattern('stats:*');
    await cacheService.delPattern('admin:*');
    await cacheService.delPattern('ann:*');
    console.log('[OK] Distributed Redis caches bumped and purged.');
  } catch (cacheErr) {
    console.warn('[WARN] Redis cache invalidation notice:', (cacheErr as Error).message);
  }

  // Export report/PRODUCTION_ANNOUNCEMENTS_DIRECTORY.md
  const reportDir = path.resolve(process.cwd(), '../report');
  await fs.mkdir(reportDir, { recursive: true });
  const mdPath = path.join(reportDir, 'PRODUCTION_ANNOUNCEMENTS_DIRECTORY.md');

  // Query sample IDs for testing
  const pinnedAnnouncements = await prisma.announcement.findMany({
    where: { universityId: university.id, pinned: true },
    select: { id: true, title: true, audience: true, category: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
  });

  const sampleStudentOnly = await prisma.announcement.findFirst({
    where: { universityId: university.id, audience: AnnouncementAudience.STUDENTS, status: AnnouncementStatus.PUBLISHED },
    select: { id: true, title: true, category: true },
  });

  const sampleAlumniOnly = await prisma.announcement.findFirst({
    where: { universityId: university.id, audience: AnnouncementAudience.ALUMNI, status: AnnouncementStatus.PUBLISHED },
    select: { id: true, title: true, category: true },
  });

  const sampleScheduled = await prisma.announcement.findFirst({
    where: { universityId: university.id, status: AnnouncementStatus.DRAFT, publishAt: { not: null } },
    select: { id: true, title: true, publishAt: true },
  });

  const sampleArchived = await prisma.announcement.findFirst({
    where: { universityId: university.id, status: AnnouncementStatus.ARCHIVED },
    select: { id: true, title: true, archivedAt: true },
  });

  const mdContent = `# North Western University - Production Announcements Directory

> **CONFIDENTIAL CREDENTIAL & TEST RUNNER REGISTER**
> Platform Scope: **North Western University** (\`north-western-university\`, \`nwu.ac.bd\`)
> Total Announcements Provisioned: **${insertedAnnouncements.length}** Real-Time Institutional Notices
> Creator Attribution: **80 announcements per Super Admin** across all 3 Super Admins
> Active Pinned Notices: **Strictly 3 notices** (\`activePinnedCount === 3\`)
> Date of Provisioning: **${new Date().toISOString()}**

---

## 1. Executive Metrics Breakdown

| Category / Metric | Count | Platform Purpose & UI Location |
| :--- | :--- | :--- |
| **PUBLISHED Announcements** | **145** | Live notices on \`/student/announcements\`, \`/alumni/announcements\`, \`/announcements\` |
| — *Recent Published ("NEW" Badge)* | *25* | Published 1-6 days ago (displays pulsating green "NEW" badge) |
| — *Active Pinned Notices* | *3* | Strictly 3 priority notices pinned at notice board tops (\`activePinnedCount === 3\`) |
| — *Established Published* | *120* | Published 7-150 days ago (20 notices configured with future auto-archive deadlines) |
| **DRAFT Announcements** | **35** | Unpublished drafts in Super Admin console (\`/admin/announcements\`) |
| — *Scheduled Drafts* | *25* | Pre-scheduled with future \`publishAt\` (+1 to +30 days) for cron auto-publishing |
| — *Regular Drafts* | *10* | Admin draft notices ready for manual editing and publishing |
| **ARCHIVED Announcements** | **60** | Completed past notices in Super Admin archive tab (\`/admin/announcements?status=ARCHIVED\`) |
| **Total Announcements** | **240** | **Exactly 80 announcements per Super Admin** |

---

## 2. Super Admin Attribution Matrix (Equal 80 Distribution)

| Super Admin Name | Official Email | User ID | Announcements Created | Governance Console |
| :--- | :--- | :--- | :--- | :--- |
${superAdmins
  .map(
    (sa) =>
      `| **${sa.name}** | \`${sa.email}\` | \`${sa.id}\` | **${adminCounts[sa.id]} announcements** | \`/admin/announcements\` |`
  )
  .join('\n')}

---

## 3. Strictly 3 Active Pinned Notices (Pin Integrity Compliance)

These 3 announcements have \`pinned: true\` and \`status: 'PUBLISHED'\`.
All other 237 announcements have \`pinned: false\` to protect the \`MAX_ACTIVE_PINNED = 3\` guard.

| Pin Slot | Announcement ID | Title | Category | Target Audience | Published Date |
| :---: | :--- | :--- | :---: | :---: | :--- |
${pinnedAnnouncements
  .map(
    (p, i) =>
      `| **PIN #${i + 1}** | \`${p.id}\` | **${p.title}** | \`${p.category}\` | \`${p.audience}\` | ${p.publishedAt?.toISOString().split('T')[0]} |`
  )
  .join('\n')}

---

## 4. Role-Based Audience Isolation & Cross-Role Security Testing

The backend enforces strict audience isolation at both repository query and service detail levels.
Attempting to access an audience-scoped notice with an unpermitted role returns **\`403 Forbidden\`**.

| Test Scenario | Target Announcement ID | Title | Permitted Viewers | Blocked Viewers (\`403 Forbidden\`) |
| :--- | :--- | :--- | :--- | :--- |
| **Students Only Notice** | \`${sampleStudentOnly?.id}\` | **${sampleStudentOnly?.title}** | Students, Moderators, Super Admins | **Alumni (\`403 Forbidden\`)** |
| **Alumni Only Notice** | \`${sampleAlumniOnly?.id}\` | **${sampleAlumniOnly?.title}** | Alumni, Moderators, Super Admins | **Students (\`403 Forbidden\`)** |
| **All University Notice** | \`${pinnedAnnouncements[0]?.id}\` | **${pinnedAnnouncements[0]?.title}** | All roles & Public viewers | *None (Publicly Accessible)* |
| **Scheduled Draft Notice** | \`${sampleScheduled?.id}\` | **${sampleScheduled?.title}** | Super Admins & Moderators | **Students & Alumni (\`404 Not Found\`)\** |
| **Archived Notice** | \`${sampleArchived?.id}\` | **${sampleArchived?.title}** | Super Admins & Moderators | **Students & Alumni (\`404 Not Found\`)\** |

---

## 5. Uniform Test Login Credentials Reference

| Role | Sample Test Login Email | Uniform Password | Notice Board Route |
| :--- | :--- | :--- | :--- |
| **Super Admin** | \`admin.registrar@nwu.ac.bd\` | \`${ROLE_PASSWORDS.SUPER_ADMIN}\` | \`/admin/announcements\` |
| **Moderator** | \`mod.cse.islam@nwu.ac.bd\` | \`${ROLE_PASSWORDS.MODERATOR}\` | \`/moderator/announcements\` |
| **Alumni** | \`tanvir.ahmed.2016.1@alumni.nwu.ac.bd\` | \`${ROLE_PASSWORDS.ALUMNI}\` | \`/alumni/announcements\` |
| **Student** | \`2022101001@nwu.ac.bd\` | \`${ROLE_PASSWORDS.STUDENT}\` | \`/student/announcements\` |
`;

  await fs.writeFile(mdPath, mdContent, 'utf8');
  console.log(`[OK] Announcement directory report exported: ${mdPath}`);

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n================================================================================');
  console.log(`SUCCESS: Bulk Announcement Provisioning Completed in ${totalElapsed}s!`);
  console.log(`Total Announcements Persisted: ${insertedAnnouncements.length}`);
  console.log(`Total AuditLogs Persisted: ${auditLogsToInsert.length}`);
  console.log('================================================================================\n');

  process.exit(0);
}

main()
  .catch((err) => {
    console.error('\n[FATAL ERROR during announcement provisioning]:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
