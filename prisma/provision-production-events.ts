import { prisma } from '../src/config/database.js';
import { cacheService } from '../src/services/cache/cache.service.js';
import {
  EventStatus,
  EventMode,
  RsvpStatus,
  RoleName,
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

const CLOUDINARY_BANNER_BASE = 'https://res.cloudinary.com/a1dumxpe/image/upload/alumni-connect/events/banners';

// -----------------------------------------------------------------------------
// 25 CURATED 16:9 EVENT BANNER POOL
// -----------------------------------------------------------------------------
const EVENT_BANNERS = Array.from({ length: 25 }, (_, i) => ({
  id: `banner_${i + 1}`,
  url: `${CLOUDINARY_BANNER_BASE}/banner_${i + 1}.jpg`,
  publicId: `alumni-connect/events/banners/banner_${i + 1}`,
}));

// -----------------------------------------------------------------------------
// EVENT TEMPLATES & CONTENT (100% Pure English Latin Characters)
// -----------------------------------------------------------------------------
interface EventTemplate {
  title: string;
  category: string;
  mode: EventMode;
  organizer: string;
  defaultCapacity: number | null;
  venue?: string;
  descriptionHtml: string;
}

const EVENT_TEMPLATES: EventTemplate[] = [
  // 1. TECH_SUMMIT
  {
    title: 'National Cloud Architecture & Distributed Systems Summit',
    category: 'TECH_SUMMIT',
    mode: EventMode.IN_PERSON,
    organizer: 'NWU Department of CSE & Alumni Tech Network',
    defaultCapacity: 200,
    venue: 'NWU Central Auditorium, Campus 1, Sonadanga, Khulna',
    descriptionHtml: '<p><strong>Event Overview:</strong> Premier gathering of software architects, cloud engineers, and university scholars exploring enterprise distributed computing and resilient cloud backends.</p><p><strong>Key Highlights:</strong></p><ul><li>Keynote sessions on microservices scalability and zero-downtime database migrations.</li><li>Deep-dive architectural reviews of high-concurrency systems handling millions of daily events.</li><li>Exclusive alumni networking lunch with senior engineering leaders.</li></ul>',
  },
  {
    title: 'Annual Artificial Intelligence & Machine Learning Symposium',
    category: 'TECH_SUMMIT',
    mode: EventMode.HYBRID,
    organizer: 'Faculty of Science & Engineering',
    defaultCapacity: 150,
    venue: 'CSE Department Seminar Hall, Room 402, NWU Building 2',
    descriptionHtml: '<p><strong>Event Overview:</strong> Multidisciplinary symposium presenting breakthrough research in deep learning, computer vision, and large language model fine-tuning.</p><p><strong>Key Highlights:</strong></p><ul><li>Peer-reviewed paper presentations by faculty researchers and industry practitioners.</li><li>Interactive panel discussion on ethical AI governance and academic integrity.</li><li>Hands-on GPU-accelerated computing demonstration.</li></ul>',
  },
  {
    title: 'Cyber Security & Enterprise Defense Conclave',
    category: 'TECH_SUMMIT',
    mode: EventMode.ONLINE,
    organizer: 'NWU Information Security Advisory Committee',
    defaultCapacity: 300,
    descriptionHtml: '<p><strong>Event Overview:</strong> Interactive virtual conclave addressing contemporary cyber threat vectors, zero-trust architectures, and institutional data compliance.</p><p><strong>Key Highlights:</strong></p><ul><li>Live red-team vs. blue-team attack simulation and incident triage.</li><li>Corporate compliance workshops on data protection and cryptographic key rotation.</li><li>Career transition Q&A with cybersecurity alumni based in North America and Europe.</li></ul>',
  },

  // 2. CAREER
  {
    title: 'NWU Annual Campus Placement Drive & Corporate Career Expo',
    category: 'CAREER',
    mode: EventMode.IN_PERSON,
    organizer: 'NWU Career Guidance & Placement Center',
    defaultCapacity: 500,
    venue: 'Main Campus Ground & Open Plaza, North Western University, Khulna',
    descriptionHtml: '<p><strong>Event Overview:</strong> Flagship recruitment expo uniting over 40 leading corporations, fintech leaders, conglomerates, and software companies for on-the-spot interviews.</p><p><strong>Key Highlights:</strong></p><ul><li>Direct interviews for graduating seniors and recent alumni.</li><li>On-site resume critique booths hosted by corporate talent acquisition leads.</li><li>Panel discussions on high-demand technical and business competencies.</li></ul>',
  },
  {
    title: 'Engineering Technical Interview & System Design Clinic',
    category: 'CAREER',
    mode: EventMode.HYBRID,
    organizer: 'NWU Alumni Association Technical Mentorship Board',
    defaultCapacity: 100,
    venue: 'CSE Department Seminar Hall, Room 402, NWU Building 2',
    descriptionHtml: '<p><strong>Event Overview:</strong> Intensive clinic designed to demystify technical coding interviews, whiteboard system design problems, and behavioral evaluations.</p><p><strong>Key Highlights:</strong></p><ul><li>Live mock technical interviews with real-time feedback from alumni engineering managers.</li><li>System design breakdown: Architecting URL shorteners and distributed message brokers.</li><li>Strategies for negotiating compensation packages and equity offers.</li></ul>',
  },
  {
    title: 'Banking, Corporate Credit & Financial Services Career Masterclass',
    category: 'CAREER',
    mode: EventMode.IN_PERSON,
    organizer: 'Faculty of Business Administration',
    defaultCapacity: 120,
    venue: 'Faculty of Business Studies Conference Room, NWU',
    descriptionHtml: '<p><strong>Event Overview:</strong> Specialized masterclass tailored for aspiring financial analysts, corporate credit officers, and investment banking associates.</p><p><strong>Key Highlights:</strong></p><ul><li>Overview of management trainee recruitment frameworks across top private commercial banks.</li><li>Financial statement analysis case study: Assessing corporate debt serviceability.</li><li>Networking tea with senior banking executives and alumni branch managers.</li></ul>',
  },

  // 3. WORKSHOP
  {
    title: 'Full-Stack Next.js App Router & TypeScript Bootcamp',
    category: 'WORKSHOP',
    mode: EventMode.IN_PERSON,
    organizer: 'NWU Computer & Programming Club',
    defaultCapacity: 60,
    venue: 'Software Engineering Laboratory, Lab 3, NWU Campus 1',
    descriptionHtml: '<p><strong>Event Overview:</strong> Comprehensive hands-on workshop guiding undergraduates through modern web engineering with Next.js, TypeScript, and Tailwind CSS.</p><p><strong>Key Highlights:</strong></p><ul><li>Building server-side rendered layouts and streaming UI components.</li><li>State management and asynchronous query caching with TanStack Query.</li><li>Deploying production-ready applications to cloud infrastructure.</li></ul>',
  },
  {
    title: 'Substation Automation, Protection & SCADA Testing Lab',
    category: 'WORKSHOP',
    mode: EventMode.IN_PERSON,
    organizer: 'NWU Department of Electrical & Electronic Engineering',
    defaultCapacity: 50,
    venue: 'High Voltage & Electrical Machines Lab, NWU Building 2',
    descriptionHtml: '<p><strong>Event Overview:</strong> Practical laboratory workshop covering substation protective relay settings, IEC 61850 communications, and industrial SCADA telemetry.</p><p><strong>Key Highlights:</strong></p><ul><li>Hands-on testing of microprocessor-based protective relays.</li><li>Simulation of grid faults and automatic trip sequence verification.</li><li>Field safety guidelines and protective grounding inspection practices.</li></ul>',
  },
  {
    title: 'Structural Design, Earthquake Modeling & ETABS Masterclass',
    category: 'WORKSHOP',
    mode: EventMode.IN_PERSON,
    organizer: 'Department of Civil Engineering',
    defaultCapacity: 50,
    venue: 'Civil Engineering Computer Lab & Drawing Studio, NWU',
    descriptionHtml: '<p><strong>Event Overview:</strong> Technical masterclass exploring three-dimensional structural frame analysis, seismic load combinations, and shear wall design.</p><p><strong>Key Highlights:</strong></p><ul><li>Finite element modeling of multi-story reinforced concrete structures in ETABS.</li><li>Application of Bangladesh National Building Code (BNBC) wind and earthquake provisions.</li><li>Automated rebar scheduling and structural drawing production.</li></ul>',
  },

  // 4. ACADEMIC
  {
    title: 'Inter-University Undergraduate Research Colloquium',
    category: 'ACADEMIC',
    mode: EventMode.HYBRID,
    organizer: 'Office of the Registrar & Academic Research Council',
    defaultCapacity: 150,
    venue: 'NWU Central Auditorium, Campus 1, Sonadanga, Khulna',
    descriptionHtml: '<p><strong>Event Overview:</strong> Celebrated annual colloquium showcasing undergraduate research papers, empirical studies, and innovative capstone engineering designs.</p><p><strong>Key Highlights:</strong></p><ul><li>Oral presentations evaluated by distinguished external peer reviewers.</li><li>Poster presentation exhibition in the Central Campus Plaza.</li><li>Best Research Paper awards and recognition ceremony.</li></ul>',
  },
  {
    title: 'Graduate Studies in North America & Europe: Application Masterclass',
    category: 'ACADEMIC',
    mode: EventMode.ONLINE,
    organizer: 'NWU Global Alumni Fellowship Network',
    defaultCapacity: 250,
    descriptionHtml: '<p><strong>Event Overview:</strong> Guidance webinar hosted by alumni currently pursuing Ph.D. and Master’s degrees across prestigious global universities.</p><p><strong>Key Highlights:</strong></p><ul><li>Deconstructing the Statement of Purpose (SOP) and obtaining compelling recommendation letters.</li><li>Securing research assistantships (RA) and teaching assistantships (TA) with full funding.</li><li>Interactive Q&A regarding visa interviews and graduate student life.</li></ul>',
  },

  // 5. NETWORKING
  {
    title: 'Alumni-Student Leadership & Professional Mentorship Mixer',
    category: 'NETWORKING',
    mode: EventMode.IN_PERSON,
    organizer: 'Directorate of Student & Alumni Affairs',
    defaultCapacity: 100,
    venue: 'NWU Central Auditorium, Campus 1, Sonadanga, Khulna',
    descriptionHtml: '<p><strong>Event Overview:</strong> High-impact networking evening connecting ambitious current undergraduates with verified alumni mentors from diverse industry sectors.</p><p><strong>Key Highlights:</strong></p><ul><li>Speed-mentoring rotations structured by department and domain interests.</li><li>Fireside address by the Registrar and Alumni Association President.</li><li>Refreshments, coffee lounge networking, and contact exchange.</li></ul>',
  },
  {
    title: 'Women in Engineering & Technology Leadership Roundtable',
    category: 'NETWORKING',
    mode: EventMode.HYBRID,
    organizer: 'NWU Women in STEM Society',
    defaultCapacity: 80,
    venue: 'Faculty of Business Studies Conference Room, NWU',
    descriptionHtml: '<p><strong>Event Overview:</strong> Inspiring panel and networking roundtable highlighting the achievements and leadership journeys of female alumni in STEM fields.</p><p><strong>Key Highlights:</strong></p><ul><li>Panelists sharing career strategies, work-life integration, and leadership progression.</li><li>One-on-one mentorship pairings for female engineering students.</li><li>Open networking session with complimentary refreshments.</li></ul>',
  },

  // 6. ALUMNI_GALA
  {
    title: 'North Western University Grand Annual Alumni Homecoming & Gala',
    category: 'ALUMNI_GALA',
    mode: EventMode.IN_PERSON,
    organizer: 'Executive Committee of NWU Alumni Association',
    defaultCapacity: 400,
    venue: 'Main Campus Ground & Open Plaza, North Western University, Khulna',
    descriptionHtml: '<p><strong>Event Overview:</strong> The pinnacle event of the academic year, bringing together graduates across all cohorts for an evening of celebration, awards, and dinner.</p><p><strong>Key Highlights:</strong></p><ul><li>Conferring of Distinguished Alumni Achievement Awards in Innovation and Public Service.</li><li>Multi-course formal dinner featuring regional culinary delicacies.</li><li>Live musical performance by university cultural society and renowned guest artists.</li></ul>',
  },
  {
    title: 'Decennial Homecoming Celebration (Class of 2016 Commemoration)',
    category: 'ALUMNI_GALA',
    mode: EventMode.IN_PERSON,
    organizer: 'NWU Alumni Affairs & 2016 Batch Representatives',
    defaultCapacity: 150,
    venue: 'NWU Central Auditorium, Campus 1, Sonadanga, Khulna',
    descriptionHtml: '<p><strong>Event Overview:</strong> Special anniversary celebration marking ten years since the pioneering 2016 cohort completed their degrees at North Western University.</p><p><strong>Key Highlights:</strong></p><ul><li>Commemorative video presentation showcasing a decade of alumni impact.</li><li>Reunion banquet, memory book distribution, and group photo sessions.</li><li>Interactive address with university founders and founding faculty members.</li></ul>',
  },

  // 7. HACKATHON
  {
    title: 'NWU 36-Hour National Hackathon: Code for Campus & Community',
    category: 'HACKATHON',
    mode: EventMode.IN_PERSON,
    organizer: 'NWU Department of CSE & Robotics Club',
    defaultCapacity: 120,
    venue: 'Software Engineering Laboratory & Auditorium, NWU Campus 1',
    descriptionHtml: '<p><strong>Event Overview:</strong> High-octane 36-hour hackathon where student teams design, build, and deploy innovative software prototypes addressing civic and campus challenges.</p><p><strong>Key Highlights:</strong></p><ul><li>Continuous mentorship from alumni software architects throughout the night.</li><li>Exciting tracks: Smart Campus, Healthcare Technology, and Financial Inclusion.</li><li>Substantial cash prize pool, corporate recruitment fast-tracks, and sponsor swag.</li></ul>',
  },
  {
    title: 'Inter-Department Algorithmic Coding Championship',
    category: 'HACKATHON',
    mode: EventMode.IN_PERSON,
    organizer: 'NWU Competitive Programming Society',
    defaultCapacity: 80,
    venue: 'Computer Laboratory 1 & 2, NWU Building 2',
    descriptionHtml: '<p><strong>Event Overview:</strong> Fast-paced algorithmic contest featuring rigorous data structure and dynamic programming problem sets modeled after ICPC competitions.</p><p><strong>Key Highlights:</strong></p><ul><li>Real-time automated scoreboard with live balloon distribution for first solves.</li><li>Comprehensive post-contest problem editorial by senior competitive programming alumni.</li><li>Trophies and certificates of distinction for top performers.</li></ul>',
  },
];

const VENUES = [
  'NWU Central Auditorium, Campus 1, Sonadanga, Khulna',
  'CSE Department Seminar Hall, Room 402, NWU Building 2',
  'Faculty of Business Studies Conference Room, NWU',
  'Civil Engineering Materials & Concrete Lab, NWU',
  'Main Campus Ground & Open Plaza, North Western University, Khulna',
  'NWU Digital Library & Learning Commons, Campus 1',
];

// Helper to generate slug safely
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// -----------------------------------------------------------------------------
// MAIN PROVISIONING SCRIPT
// -----------------------------------------------------------------------------
async function main() {
  const startTime = Date.now();
  const isForce = process.argv.includes('--force');

  console.log('================================================================================');
  console.log('ALUMNI CONNECT - PRODUCTION BULK EVENT & RSVP PROVISIONING SCRIPT');
  console.log('Target: North Western University (slug: north-western-university)');
  console.log('Goal: 480 Events (160/Admin), ~4,800 Balanced RSVPs, FIFO Waitlist Queues');
  console.log('================================================================================\n');

  // STEP 1: Fetch Canonical University & Live User Pool
  console.log('>>> [STEP 1/5] Fetching Live Actors & Checking Idempotency...');
  const university = await prisma.university.findFirst({
    where: { slug: CANONICAL_UNIVERSITY_SLUG },
  });
  if (!university) {
    throw new Error(`Canonical university with slug "${CANONICAL_UNIVERSITY_SLUG}" not found!`);
  }

  // Idempotency check
  const existingEventCount = await prisma.event.count({
    where: { universityId: university.id },
  });
  console.log(`[INFO] Current events in database for North Western University: ${existingEventCount}`);
  if (existingEventCount >= 450 && !isForce) {
    console.log('[IDEMPOTENT EXIT] Database already has >= 450 events. Skipping provisioning.');
    console.log('To force re-provisioning, re-run with "--force".');
    process.exit(0);
  }

  const superAdmins = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: RoleName.SUPER_ADMIN },
      isActive: true,
    },
    select: { id: true, name: true, email: true },
  });

  const alumniUsers = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: RoleName.ALUMNI },
      isActive: true,
      verificationStatus: 'APPROVED',
    },
    select: { id: true, name: true, email: true, department: true },
  });

  const studentUsers = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: RoleName.STUDENT },
      isActive: true,
    },
    select: { id: true, name: true, email: true, department: true },
  });

  console.log(`[OK] Actors Loaded for "${university.name}":`);
  console.log(`  - Super Admin Creators: ${superAdmins.length} (Target: 160 events each)`);
  console.log(`  - Alumni Attendees: ${alumniUsers.length}`);
  console.log(`  - Student Attendees: ${studentUsers.length}`);

  if (superAdmins.length < 3) {
    throw new Error(`Expected at least 3 Super Admins for equal 160-event distribution, found ${superAdmins.length}!`);
  }

  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);
  const daysAhead = (d: number) => new Date(now + d * 24 * 60 * 60 * 1000);

  // STEP 2: In-Memory Preparation of 480 Events
  console.log('\n>>> [STEP 2/5] Synthesizing 480 Real-Time Events (160 per Super Admin)...');

  interface PlannedEvent {
    tempId: string;
    universityId: string;
    createdById: string;
    title: string;
    slug: string;
    description: string;
    category: string;
    organizer: string;
    startsAt: Date;
    endsAt: Date;
    mode: EventMode;
    venue?: string | null;
    onlineUrl?: string | null;
    capacity: number | null;
    rsvpDeadline?: Date | null;
    waitlistEnabled: boolean;
    bannerUrl: string;
    bannerPublicId: string;
    reminderEnabled: boolean;
    status: EventStatus;
    cancelledAt?: Date | null;
    cancelReason?: string | null;
    completedAt?: Date | null;
    createdAt: Date;
    isFullCapacityTarget: boolean; // Flag for exactly 25 full capacity events
    auditLogs: {
      actorId: string;
      action: string;
      createdAt: Date;
      metadata?: Record<string, unknown>;
    }[];
  }

  const plannedEvents: PlannedEvent[] = [];
  let eventCounter = 0;

  // Distribution targets:
  // 250 PUBLISHED (225 open-capacity, 25 full-capacity with waitlist)
  // 190 COMPLETED (Past events)
  // 20 DRAFT (Future drafts)
  // 20 CANCELLED (Cancelled notices)
  // Total = 480 events (Exactly 160 per Super Admin)

  const adminIds = [superAdmins[0]!.id, superAdmins[1]!.id, superAdmins[2]!.id];

  // 2.1: 250 PUBLISHED Events (225 Open + 25 Full-Capacity)
  console.log('Generating 250 PUBLISHED events (225 Open + 25 Full-Capacity)...');
  for (let i = 0; i < 250; i++) {
    eventCounter++;
    const adminId = adminIds[(eventCounter - 1) % 3]!;
    const tpl = EVENT_TEMPLATES[i % EVENT_TEMPLATES.length]!;
    const banner = EVENT_BANNERS[i % EVENT_BANNERS.length]!;
    const isFullTarget = i < 25; // First 25 events are full-capacity waitlist test targets!

    const daysInFuture = 2 + (i % 85);
    const startsAt = daysAhead(daysInFuture);
    const durationHours = 2 + (i % 5);
    const endsAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);
    const rsvpDeadline = new Date(startsAt.getTime() - 12 * 60 * 60 * 1000);

    const mode = i % 2 === 0 ? EventMode.IN_PERSON : i % 3 === 0 ? EventMode.HYBRID : EventMode.ONLINE;
    const venue = mode !== EventMode.ONLINE ? (tpl.venue || VENUES[i % VENUES.length]!) : null;
    const onlineUrl = mode !== EventMode.IN_PERSON ? `https://meet.google.com/nwu-events-${eventCounter}` : null;

    // For full capacity: fixed capacity of 30
    const capacity = isFullTarget ? 30 : i % 4 === 0 ? null : (50 + (i % 6) * 30);
    const waitlistEnabled = true;

    const baseTitle = isFullTarget
      ? `${tpl.title} (High-Demand Session)`
      : `${tpl.title} - Cohort ${Math.floor(i / EVENT_TEMPLATES.length) + 1}`;
    const slug = `${slugify(baseTitle)}-${eventCounter}`;

    const createdAt = daysAgo(20 + (i % 30));

    plannedEvents.push({
      tempId: `EVT_${eventCounter}`,
      universityId: university.id,
      createdById: adminId,
      title: baseTitle,
      slug,
      description: tpl.descriptionHtml,
      category: tpl.category,
      organizer: tpl.organizer,
      startsAt,
      endsAt,
      mode,
      venue,
      onlineUrl,
      capacity,
      rsvpDeadline,
      waitlistEnabled,
      bannerUrl: banner.url,
      bannerPublicId: banner.publicId,
      reminderEnabled: true,
      status: EventStatus.PUBLISHED,
      createdAt,
      isFullCapacityTarget: isFullTarget,
      auditLogs: [
        {
          actorId: adminId,
          action: 'EVENT_CREATED',
          createdAt,
          metadata: { title: baseTitle, mode },
        },
        {
          actorId: adminId,
          action: 'EVENT_PUBLISHED',
          createdAt: new Date(createdAt.getTime() + 60 * 1000),
          metadata: { title: baseTitle },
        },
      ],
    });
  }

  // 2.2: 190 COMPLETED Events (Past events archive)
  console.log('Generating 190 COMPLETED past events (Historical archive)...');
  for (let i = 0; i < 190; i++) {
    eventCounter++;
    const adminId = adminIds[(eventCounter - 1) % 3]!;
    const tpl = EVENT_TEMPLATES[(i + 3) % EVENT_TEMPLATES.length]!;
    const banner = EVENT_BANNERS[(i + 5) % EVENT_BANNERS.length]!;

    const daysInPast = 2 + (i % 170);
    const startsAt = daysAgo(daysInPast);
    const durationHours = 2 + (i % 4);
    const endsAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);
    const rsvpDeadline = new Date(startsAt.getTime() - 12 * 60 * 60 * 1000);

    const mode = i % 2 === 0 ? EventMode.IN_PERSON : EventMode.HYBRID;
    const venue = tpl.venue || VENUES[i % VENUES.length]!;
    const onlineUrl = mode === EventMode.HYBRID ? `https://meet.google.com/nwu-past-${eventCounter}` : null;
    const capacity = 100 + (i % 5) * 50;

    const baseTitle = `${tpl.title} (Past Edition - ${startsAt.getFullYear()})`;
    const slug = `${slugify(baseTitle)}-${eventCounter}`;

    const createdAt = new Date(startsAt.getTime() - 25 * 24 * 60 * 60 * 1000);

    plannedEvents.push({
      tempId: `EVT_${eventCounter}`,
      universityId: university.id,
      createdById: adminId,
      title: baseTitle,
      slug,
      description: tpl.descriptionHtml,
      category: tpl.category,
      organizer: tpl.organizer,
      startsAt,
      endsAt,
      mode,
      venue,
      onlineUrl,
      capacity,
      rsvpDeadline,
      waitlistEnabled: true,
      bannerUrl: banner.url,
      bannerPublicId: banner.publicId,
      reminderEnabled: true,
      status: EventStatus.COMPLETED,
      completedAt: endsAt,
      createdAt,
      isFullCapacityTarget: false,
      auditLogs: [
        {
          actorId: adminId,
          action: 'EVENT_CREATED',
          createdAt,
        },
        {
          actorId: adminId,
          action: 'EVENT_PUBLISHED',
          createdAt: new Date(createdAt.getTime() + 60 * 1000),
        },
        {
          actorId: adminId,
          action: 'EVENT_COMPLETED',
          createdAt: endsAt,
          metadata: { autoCompleted: false },
        },
      ],
    });
  }

  // 2.3: 20 DRAFT Events (Ready for Super Admin editing & publishing)
  console.log('Generating 20 DRAFT events (Admin queue)...');
  for (let i = 0; i < 20; i++) {
    eventCounter++;
    const adminId = adminIds[(eventCounter - 1) % 3]!;
    const tpl = EVENT_TEMPLATES[(i + 7) % EVENT_TEMPLATES.length]!;
    const banner = EVENT_BANNERS[(i + 10) % EVENT_BANNERS.length]!;

    const startsAt = daysAhead(30 + i * 2);
    const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);

    const baseTitle = `${tpl.title} (Draft Proposal)`;
    const slug = `${slugify(baseTitle)}-${eventCounter}`;
    const createdAt = daysAgo(5 + i);

    plannedEvents.push({
      tempId: `EVT_${eventCounter}`,
      universityId: university.id,
      createdById: adminId,
      title: baseTitle,
      slug,
      description: tpl.descriptionHtml,
      category: tpl.category,
      organizer: tpl.organizer,
      startsAt,
      endsAt,
      mode: EventMode.IN_PERSON,
      venue: tpl.venue || VENUES[0]!,
      onlineUrl: null,
      capacity: 100,
      rsvpDeadline: null,
      waitlistEnabled: true,
      bannerUrl: banner.url,
      bannerPublicId: banner.publicId,
      reminderEnabled: true,
      status: EventStatus.DRAFT,
      createdAt,
      isFullCapacityTarget: false,
      auditLogs: [
        {
          actorId: adminId,
          action: 'EVENT_CREATED',
          createdAt,
          metadata: { isDraft: true },
        },
      ],
    });
  }

  // 2.4: 20 CANCELLED Events (Historical cancellation notices)
  console.log('Generating 20 CANCELLED events (Cancellation banners)...');
  const cancelReasons = [
    'Rescheduled due to university semester examination schedule adjustments.',
    'Speaker travel disrupted by unexpected international flight cancellation.',
    'Venue undergoing mandatory electrical maintenance and safety inspection.',
    'Consolidated into the upcoming National Tech Summit keynote session.',
  ];

  for (let i = 0; i < 20; i++) {
    eventCounter++;
    const adminId = adminIds[(eventCounter - 1) % 3]!;
    const tpl = EVENT_TEMPLATES[(i + 11) % EVENT_TEMPLATES.length]!;
    const banner = EVENT_BANNERS[(i + 15) % EVENT_BANNERS.length]!;

    const startsAt = daysAhead(15 + i);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    const createdAt = daysAgo(10 + i);
    const cancelledAt = daysAgo(2 + (i % 5));
    const reason = cancelReasons[i % cancelReasons.length]!;

    const baseTitle = `${tpl.title} (Cancelled Notice)`;
    const slug = `${slugify(baseTitle)}-${eventCounter}`;

    plannedEvents.push({
      tempId: `EVT_${eventCounter}`,
      universityId: university.id,
      createdById: adminId,
      title: baseTitle,
      slug,
      description: tpl.descriptionHtml,
      category: tpl.category,
      organizer: tpl.organizer,
      startsAt,
      endsAt,
      mode: EventMode.IN_PERSON,
      venue: tpl.venue || VENUES[1]!,
      onlineUrl: null,
      capacity: 100,
      rsvpDeadline: null,
      waitlistEnabled: false,
      bannerUrl: banner.url,
      bannerPublicId: banner.publicId,
      reminderEnabled: false,
      status: EventStatus.CANCELLED,
      cancelledAt,
      cancelReason: reason,
      createdAt,
      isFullCapacityTarget: false,
      auditLogs: [
        {
          actorId: adminId,
          action: 'EVENT_CREATED',
          createdAt,
        },
        {
          actorId: adminId,
          action: 'EVENT_CANCELLED',
          createdAt: cancelledAt,
          metadata: { cancelReason: reason },
        },
      ],
    });
  }

  console.log(`[OK] In-memory event synthesis complete: ${plannedEvents.length} events prepared.`);
  console.log(`  - PUBLISHED: 250 (Open: 225, Full Capacity Waitlist: 25)`);
  console.log(`  - COMPLETED: 190`);
  console.log(`  - DRAFT: 20`);
  console.log(`  - CANCELLED: 20`);

  // Verify per-Admin distribution
  const countByAdmin = new Map<string, number>();
  for (const pe of plannedEvents) {
    countByAdmin.set(pe.createdById, (countByAdmin.get(pe.createdById) || 0) + 1);
  }
  for (const sa of superAdmins) {
    console.log(`  - Super Admin "${sa.name}" <${sa.email}>: ${countByAdmin.get(sa.id)} events`);
  }

  // STEP 3: Chunked Database Insertion of 480 Events
  console.log('\n>>> [STEP 3/5] Inserting 480 Events & Audit Logs in 50-Event Batches...');
  const EVENT_BATCH_SIZE = 50;
  const createdEventMap = new Map<string, { id: string; isFullTarget: boolean; capacity: number | null; endsAt: Date }>();

  for (let b = 0; b < plannedEvents.length; b += EVENT_BATCH_SIZE) {
    const chunk = plannedEvents.slice(b, b + EVENT_BATCH_SIZE);

    const chunkData = chunk.map(
      ({ tempId, isFullCapacityTarget, auditLogs, ...eventFields }) => eventFields
    );

    await prisma.event.createMany({
      data: chunkData,
    });

    const slugs = chunk.map((c) => c.slug);
    const createdRows = await prisma.event.findMany({
      where: {
        universityId: university.id,
        slug: { in: slugs },
      },
      select: { id: true, slug: true, capacity: true, endsAt: true },
    });

    const chunkAudits: Prisma.AuditLogCreateManyInput[] = [];

    for (const pEvt of chunk) {
      const match = createdRows.find((r) => r.slug === pEvt.slug);
      if (match) {
        createdEventMap.set(pEvt.tempId, {
          id: match.id,
          isFullTarget: pEvt.isFullCapacityTarget,
          capacity: match.capacity,
          endsAt: match.endsAt,
        });

        for (const aud of pEvt.auditLogs) {
          chunkAudits.push({
            universityId: university.id,
            actorId: aud.actorId,
            action: aud.action,
            targetType: 'EVENT',
            targetId: match.id,
            createdAt: aud.createdAt,
            metadata: aud.metadata ? (aud.metadata as Prisma.InputJsonValue) : undefined,
          });
        }
      }
    }

    if (chunkAudits.length > 0) {
      await prisma.auditLog.createMany({
        data: chunkAudits,
      });
    }

    const inserted = Math.min(b + EVENT_BATCH_SIZE, plannedEvents.length);
    const pct = Math.round((inserted / plannedEvents.length) * 100);
    process.stdout.write(`\r  --> Inserted ${inserted}/480 events (${pct}%)`);
  }
  console.log('\n[OK] All 480 Events successfully persisted to PostgreSQL.');

  // STEP 4: Generate & Insert ~4,800 Balanced Student & Alumni RSVPs
  console.log('\n>>> [STEP 4/5] Generating & Inserting ~4,800 Balanced Student & Alumni RSVPs...');

  interface PlannedRsvp {
    eventId: string;
    userId: string;
    status: RsvpStatus;
    waitlistedAt?: Date | null;
    attendedAt?: Date | null;
    createdAt: Date;
  }

  const plannedRsvps: PlannedRsvp[] = [];
  const uniqueRsvpPairs = new Set<string>(); // "eventId:userId"

  // 440 applicable events (250 PUBLISHED + 190 COMPLETED)
  const applicableEvents = plannedEvents.filter(
    (e) => (e.status === EventStatus.PUBLISHED || e.status === EventStatus.COMPLETED) && createdEventMap.has(e.tempId)
  );

  let studentIndex = 0;
  let alumniIndex = 0;

  // Helper to pick next user alternating between student and alumni
  const getNextUser = (preferRole: 'STUDENT' | 'ALUMNI') => {
    if (preferRole === 'STUDENT') {
      const u = studentUsers[studentIndex % studentUsers.length]!;
      studentIndex++;
      return u;
    } else {
      const u = alumniUsers[alumniIndex % alumniUsers.length]!;
      alumniIndex++;
      return u;
    }
  };

  let totalRsvpCounter = 0;

  for (let eIdx = 0; eIdx < applicableEvents.length; eIdx++) {
    const pEvt = applicableEvents[eIdx]!;
    const realEvt = createdEventMap.get(pEvt.tempId)!;
    const isCompleted = pEvt.status === EventStatus.COMPLETED;
    const isFullTarget = realEvt.isFullTarget; // One of the 25 full capacity events

    if (isFullTarget) {
      // 25 Full-Capacity Events:
      // Exact capacity: 30
      // GOING: exactly 30 (15 Students, 15 Alumni)
      // WAITLISTED: exactly 12 (6 Students, 6 Alumni) with waitlistedAt 1 minute apart
      // MAYBE: 2
      // NOT_GOING: 1
      // CANCELLED: 1
      // Total per full event = 46 RSVPs. (25 * 46 = 1,150 RSVPs)
      const baseDate = pEvt.createdAt;

      // 1. 30 GOING
      for (let g = 0; g < 30; g++) {
        totalRsvpCounter++;
        const role: 'STUDENT' | 'ALUMNI' = g % 2 === 0 ? 'STUDENT' : 'ALUMNI';
        let user = getNextUser(role);
        while (uniqueRsvpPairs.has(`${realEvt.id}:${user.id}`)) {
          user = getNextUser(role);
        }
        uniqueRsvpPairs.add(`${realEvt.id}:${user.id}`);
        plannedRsvps.push({
          eventId: realEvt.id,
          userId: user.id,
          status: RsvpStatus.GOING,
          createdAt: new Date(baseDate.getTime() + g * 3600 * 1000),
        });
      }

      // 2. 12 WAITLISTED (Sequential FIFO timestamps)
      const waitlistStart = new Date(baseDate.getTime() + 32 * 3600 * 1000);
      for (let w = 0; w < 12; w++) {
        totalRsvpCounter++;
        const role: 'STUDENT' | 'ALUMNI' = w % 2 === 0 ? 'STUDENT' : 'ALUMNI';
        let user = getNextUser(role);
        while (uniqueRsvpPairs.has(`${realEvt.id}:${user.id}`)) {
          user = getNextUser(role);
        }
        uniqueRsvpPairs.add(`${realEvt.id}:${user.id}`);
        // Sequential timestamps 1 minute apart: w * 60,000 ms
        const waitlistedAt = new Date(waitlistStart.getTime() + w * 60 * 1000);
        plannedRsvps.push({
          eventId: realEvt.id,
          userId: user.id,
          status: RsvpStatus.WAITLISTED,
          waitlistedAt,
          createdAt: waitlistedAt,
        });
      }

      // 3. 2 MAYBE, 1 NOT_GOING, 1 CANCELLED
      const otherStatuses: RsvpStatus[] = [RsvpStatus.MAYBE, RsvpStatus.MAYBE, RsvpStatus.NOT_GOING, RsvpStatus.CANCELLED];
      for (let o = 0; o < otherStatuses.length; o++) {
        totalRsvpCounter++;
        const role: 'STUDENT' | 'ALUMNI' = o % 2 === 0 ? 'STUDENT' : 'ALUMNI';
        let user = getNextUser(role);
        while (uniqueRsvpPairs.has(`${realEvt.id}:${user.id}`)) {
          user = getNextUser(role);
        }
        uniqueRsvpPairs.add(`${realEvt.id}:${user.id}`);
        plannedRsvps.push({
          eventId: realEvt.id,
          userId: user.id,
          status: otherStatuses[o]!,
          createdAt: new Date(baseDate.getTime() + (35 + o) * 3600 * 1000),
        });
      }
    } else if (isCompleted) {
      // 190 COMPLETED Events:
      // Average 9-10 attendees per past event
      // Status: GOING with attendedAt set for ~80%
      const rsvpCount = 8 + (eIdx % 4); // 8 to 11
      const baseDate = pEvt.createdAt;

      for (let r = 0; r < rsvpCount; r++) {
        totalRsvpCounter++;
        const role: 'STUDENT' | 'ALUMNI' = r % 2 === 0 ? 'STUDENT' : 'ALUMNI';
        let user = getNextUser(role);
        while (uniqueRsvpPairs.has(`${realEvt.id}:${user.id}`)) {
          user = getNextUser(role);
        }
        uniqueRsvpPairs.add(`${realEvt.id}:${user.id}`);

        const hasAttended = r % 5 !== 0; // ~80% attended
        const attendedAt = hasAttended ? new Date(realEvt.endsAt.getTime() - 3600 * 1000) : null;

        plannedRsvps.push({
          eventId: realEvt.id,
          userId: user.id,
          status: RsvpStatus.GOING,
          attendedAt,
          createdAt: new Date(baseDate.getTime() + r * 3600 * 1000),
        });
      }
    } else {
      // Remaining 225 Open-Capacity PUBLISHED Events:
      // Average 8-10 RSVPs (mostly GOING, some MAYBE, NOT_GOING, CANCELLED)
      // Never exceeding capacity
      const capacityLimit = realEvt.capacity || 100;
      const targetGoing = Math.min(capacityLimit - 5, 6 + (eIdx % 5)); // 6 to 10
      const baseDate = pEvt.createdAt;

      // GOING
      for (let g = 0; g < targetGoing; g++) {
        totalRsvpCounter++;
        const role: 'STUDENT' | 'ALUMNI' = g % 2 === 0 ? 'STUDENT' : 'ALUMNI';
        let user = getNextUser(role);
        while (uniqueRsvpPairs.has(`${realEvt.id}:${user.id}`)) {
          user = getNextUser(role);
        }
        uniqueRsvpPairs.add(`${realEvt.id}:${user.id}`);
        plannedRsvps.push({
          eventId: realEvt.id,
          userId: user.id,
          status: RsvpStatus.GOING,
          createdAt: new Date(baseDate.getTime() + g * 3600 * 1000),
        });
      }

      // 1-2 MAYBE or NOT_GOING
      const otherCount = 1 + (eIdx % 3);
      for (let o = 0; o < otherCount; o++) {
        totalRsvpCounter++;
        const role: 'STUDENT' | 'ALUMNI' = o % 2 === 0 ? 'ALUMNI' : 'STUDENT';
        let user = getNextUser(role);
        while (uniqueRsvpPairs.has(`${realEvt.id}:${user.id}`)) {
          user = getNextUser(role);
        }
        uniqueRsvpPairs.add(`${realEvt.id}:${user.id}`);
        const st = o === 0 ? RsvpStatus.MAYBE : o === 1 ? RsvpStatus.NOT_GOING : RsvpStatus.CANCELLED;
        plannedRsvps.push({
          eventId: realEvt.id,
          userId: user.id,
          status: st,
          createdAt: new Date(baseDate.getTime() + (12 + o) * 3600 * 1000),
        });
      }
    }
  }

  console.log(`[OK] Prepared ${plannedRsvps.length} balanced Student & Alumni RSVPs.`);

  // Insert RSVPs in batches of 200
  const RSVP_BATCH_SIZE = 200;
  let insertedRsvps = 0;

  for (let b = 0; b < plannedRsvps.length; b += RSVP_BATCH_SIZE) {
    const chunk = plannedRsvps.slice(b, b + RSVP_BATCH_SIZE);

    await prisma.eventRsvp.createMany({
      data: chunk,
      skipDuplicates: true,
    });

    insertedRsvps += chunk.length;
    const pct = Math.round((insertedRsvps / plannedRsvps.length) * 100);
    process.stdout.write(`\r  --> Inserted ${insertedRsvps}/${plannedRsvps.length} RSVPs (${pct}%)`);
  }
  console.log('\n[OK] All RSVPs successfully persisted to PostgreSQL.');

  // STEP 5: Redis Cache Invalidation & Directory Export
  console.log('\n>>> [STEP 5/5] Flushing Redis Caches & Exporting Directory Report...');
  try {
    await cacheService.bumpVersion('events');
    await cacheService.delPattern('stats:*');
    await cacheService.delPattern('admin:*');
    await cacheService.delPattern('events:*');
    console.log('[OK] Distributed Redis caches bumped and purged.');
  } catch (cacheErr) {
    console.warn('[WARN] Redis cache invalidation notice:', (cacheErr as Error).message);
  }

  // Export report/PRODUCTION_EVENTS_DIRECTORY.md
  const reportDir = path.resolve(process.cwd(), '../report');
  await fs.mkdir(reportDir, { recursive: true });
  const mdPath = path.join(reportDir, 'PRODUCTION_EVENTS_DIRECTORY.md');

  // Pull sample full-capacity waitlisted events
  const sampleWaitlistEvents = await prisma.event.findMany({
    where: {
      universityId: university.id,
      title: { contains: 'High-Demand' },
    },
    include: {
      rsvps: {
        where: { status: 'WAITLISTED' },
        include: { user: { select: { name: true, email: true, role: { select: { name: true } } } } },
        orderBy: { waitlistedAt: 'asc' },
        take: 3,
      },
    },
    take: 5,
  });

  const mdContent = `# North Western University - Production Events & RSVPs Directory

> **CONFIDENTIAL CREDENTIAL & TEST RUNNER REGISTER**
> Platform Scope: **North Western University** (\`north-western-university\`, \`nwu.ac.bd\`)
> Total Events Provisioned: **${plannedEvents.length}** Real-Time Events (160 per Super Admin)
> Total RSVPs Provisioned: **${plannedRsvps.length}** Balanced Multi-Role RSVPs (50% Student / 50% Alumni)
> Date of Provisioning: **${new Date().toISOString()}**

---

## 1. Executive Metrics Breakdown

| Category / Metric | Count | Platform Purpose & UI Location |
| :--- | :--- | :--- |
| **PUBLISHED Events** | **250** | Upcoming live events on \`/student/events\`, \`/alumni/events\`, \`/events\` |
| **COMPLETED Events** | **190** | Rich historical past archive with attendance records on \`/events?tab=past\` |
| **DRAFT Events** | **20** | Future unpublished drafts ready to edit/publish in \`/admin/events\` |
| **CANCELLED Events** | **20** | Clear cancellation notice banners on \`/admin/events\` |
| **Total Events** | **480** | **160 events per Super Admin (3 Super Admins)** |
| **Total RSVPs** | **${plannedRsvps.length}** | **Balanced evenly across ~50% Students and ~50% Alumni** |

---

## 2. Super Admin Event Creation Attribution (Equal 160 Distribution)

| Super Admin Name | Official Email | Events Created | Governance Dashboard |
| :--- | :--- | :--- | :--- |
${superAdmins
  .map(
    (sa) =>
      `| **${sa.name}** | \`${sa.email}\` | **160 events** | \`/admin/events\` |`
  )
  .join('\n')}

---

## 3. High-Demand Full-Capacity Events (Live FIFO Waitlist Testing)

These events have \`goingCount === 30\` (100% capacity) and an active \`WAITLISTED\` queue ordered sequentially by \`waitlistedAt ASC\`.
Cancelling 1 \`GOING\` RSVP will automatically trigger the backend FIFO promotion mechanism!

| Event ID | Event Title | Capacity | Going | Waitlisted | First Waitlisted Candidate (Next in Line) |
| :--- | :--- | :--- | :--- | :--- | :--- |
${sampleWaitlistEvents
  .map((e) => {
    const first = e.rsvps[0]?.user;
    return `| \`${e.id}\` | **${e.title}** | 30 | 30 (Full) | ${e.rsvps.length}+ in queue | ${first ? `**${first.name}** (\`${first.email}\` [${first.role.name}])` : 'N/A'} |`;
  })
  .join('\n')}

---

## 4. Uniform Test Login Credentials Reference

| Role | Sample Test Login Email | Uniform Password | Dashboard Shell |
| :--- | :--- | :--- | :--- |
| **Super Admin** | \`admin.registrar@nwu.ac.bd\` | \`${ROLE_PASSWORDS.SUPER_ADMIN}\` | \`/admin/events\` |
| **Moderator** | \`mod.cse.islam@nwu.ac.bd\` | \`${ROLE_PASSWORDS.MODERATOR}\` | \`/moderator/events\` |
| **Alumni** | \`tanvir.ahmed.2016.1@alumni.nwu.ac.bd\` | \`${ROLE_PASSWORDS.ALUMNI}\` | \`/alumni/events\` |
| **Student** | \`2022101001@nwu.ac.bd\` | \`${ROLE_PASSWORDS.STUDENT}\` | \`/student/events\` |
`;

  await fs.writeFile(mdPath, mdContent, 'utf8');
  console.log(`[OK] Event directory report exported: ${mdPath}`);

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n================================================================================');
  console.log(`SUCCESS: Bulk Event & RSVP Provisioning Completed in ${totalElapsed}s!`);
  console.log(`Total Events Persisted: ${plannedEvents.length}`);
  console.log(`Total RSVPs Persisted: ${plannedRsvps.length}`);
  console.log('================================================================================\n');

  process.exit(0);
}

main()
  .catch((err) => {
    console.error('\n[FATAL ERROR during event provisioning]:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
