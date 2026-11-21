import { prisma } from '../src/config/database.js';
import { cacheService } from '../src/services/cache/cache.service.js';
import {
  JobStatus,
  WorkMode,
  ExperienceLevel,
  JobModerationAction,
  ApplicationStatus,
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
  ALUMNI: 'AlumniPass@2026!',
  STUDENT: 'StudentPass@2026!',
  MODERATOR: 'ModeratorPass@2026!',
  SUPER_ADMIN: 'SuperAdminPass@2026!',
} as const;

// -----------------------------------------------------------------------------
// INDUSTRY DATA & DOMAIN TEMPLATES (100% Pure English Latin Characters)
// -----------------------------------------------------------------------------
interface JobTemplate {
  title: string;
  category: string;
  deptCode: string;
  experienceLevel: ExperienceLevel;
  employmentType: string;
  salaryMinBDT: number;
  salaryMaxBDT: number;
  salaryUSD?: { min: number; max: number };
  descriptionHtml: string;
  requirementsHtml: string;
}

const JOB_TEMPLATES: JobTemplate[] = [
  // 1. Software Engineering
  {
    title: 'Senior Full Stack Software Engineer',
    category: 'Software Engineering',
    deptCode: 'CSE',
    experienceLevel: ExperienceLevel.SENIOR,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 130000,
    salaryMaxBDT: 220000,
    salaryUSD: { min: 2500, max: 4500 },
    descriptionHtml: '<p><strong>Role Overview:</strong> We are looking for an experienced Senior Full Stack Engineer to spearhead high-throughput distributed microservices and dynamic user-facing web applications.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Architect and maintain resilient microservices in TypeScript, Node.js, and Go.</li><li>Design intuitive, responsive user experiences with Next.js App Router and Tailwind CSS.</li><li>Lead architectural reviews, mentor junior campus developers, and ensure 99.99% system availability.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>B.Sc. in Computer Science or related engineering discipline.</li><li>5+ years of hands-on experience in full-stack web application development.</li><li>Deep expertise in PostgreSQL query optimization, Redis cache-aside patterns, and Dockerized deployments.</li></ul>',
  },
  {
    title: 'Junior Frontend Developer',
    category: 'Software Engineering',
    deptCode: 'CSE',
    experienceLevel: ExperienceLevel.ENTRY_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 45000,
    salaryMaxBDT: 70000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Exciting opportunity for ambitious campus graduates to contribute to our core customer dashboard and component design system.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Build accessible, performant React and Next.js UI components.</li><li>Integrate RESTful APIs and handle asynchronous application state with TanStack Query.</li><li>Collaborate with product designers to implement pixel-perfect Figma designs.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>Graduating senior or recent B.Sc. graduate in CSE.</li><li>Solid proficiency in TypeScript, React, HTML5, CSS3, and Git workflows.</li><li>Demonstrated academic or personal projects showcasing modern web technologies.</li></ul>',
  },
  {
    title: 'Backend Platform Engineer',
    category: 'Software Engineering',
    deptCode: 'CSE',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 85000,
    salaryMaxBDT: 140000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Join our infrastructure engineering team to design, optimize, and scale transactional backend services handling millions of daily events.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Design database schemas and write optimized SQL queries in PostgreSQL.</li><li>Implement secure authentication flows, rate limiting, and observability telemetry.</li><li>Build asynchronous message queuing pipelines with Redis and Kafka.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>2-4 years of backend software engineering experience with Node.js, Python, or Go.</li><li>Solid understanding of relational database normalization and indexing.</li><li>Experience with unit and integration testing using Vitest or Jest.</li></ul>',
  },
  {
    title: 'Cloud DevOps & Site Reliability Engineer',
    category: 'Software Engineering',
    deptCode: 'CSE',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 95000,
    salaryMaxBDT: 160000,
    salaryUSD: { min: 2200, max: 4000 },
    descriptionHtml: '<p><strong>Role Overview:</strong> Manage automated CI/CD pipelines, container orchestration, and cloud infrastructure across multi-region production clusters.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Maintain automated build, test, and deployment workflows using GitHub Actions.</li><li>Provision and manage cloud resources via Terraform and Infrastructure-as-Code.</li><li>Implement automated alerting, Prometheus monitoring, and incident response runbooks.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>Demonstrated experience managing Docker containers and Kubernetes clusters.</li><li>Strong proficiency with Linux system administration, bash scripting, and AWS/GCP services.</li><li>Knowledge of network security, SSL termination, and distributed tracing.</li></ul>',
  },
  {
    title: 'Software Quality Assurance (QA) Automation Engineer',
    category: 'Software Engineering',
    deptCode: 'CSE',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 65000,
    salaryMaxBDT: 105000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Ensure bulletproof software quality across our client apps and APIs through comprehensive automated test suites.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Design and execute end-to-end test scenarios using Playwright and Cypress.</li><li>Perform automated API contract validation and regression testing.</li><li>Identify edge-case defects, document reproduction steps, and partner with engineers for rapid fixes.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>2+ years in automated software quality assurance and testing frameworks.</li><li>Hands-on programming skills in JavaScript or TypeScript.</li><li>Familiarity with performance profiling and load testing tools.</li></ul>',
  },
  {
    title: 'Full Stack Web Development Intern',
    category: 'Software Engineering',
    deptCode: 'CSE',
    experienceLevel: ExperienceLevel.ENTRY_LEVEL,
    employmentType: 'INTERNSHIP',
    salaryMinBDT: 20000,
    salaryMaxBDT: 35000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Intensive 6-month university internship program offering hands-on mentorship from senior industry alumni on live production projects.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Shadow senior software engineers in daily standups and sprint planning.</li><li>Write clean TypeScript modules and unit tests for internal productivity tools.</li><li>Participate in collaborative peer code reviews and technical knowledge sharing.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>Current 3rd or 4th year undergraduate student in CSE at North Western University.</li><li>Understanding of object-oriented programming, data structures, and web fundamentals.</li><li>Enthusiastic attitude, curiosity, and eagerness to learn modern engineering practices.</li></ul>',
  },

  // 2. Data & AI
  {
    title: 'Machine Learning & AI Research Specialist',
    category: 'Data & AI',
    deptCode: 'CSE',
    experienceLevel: ExperienceLevel.SENIOR,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 140000,
    salaryMaxBDT: 250000,
    salaryUSD: { min: 3000, max: 5500 },
    descriptionHtml: '<p><strong>Role Overview:</strong> Lead the research, fine-tuning, and deployment of large language models and predictive machine learning architectures for enterprise automation.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Develop and optimize neural network models using PyTorch and Hugging Face.</li><li>Build scalable data ingestion and embedding vector retrieval pipelines.</li><li>Collaborate with product teams to embed AI capabilities into production applications.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>B.Sc. or M.Sc. in Computer Science with focus on Machine Learning or Data Science.</li><li>Strong programming background in Python, NumPy, Pandas, and PyTorch.</li><li>Experience deploying containerized models via FastAPI and cloud endpoints.</li></ul>',
  },
  {
    title: 'Data Analyst & Business Intelligence Lead',
    category: 'Data & AI',
    deptCode: 'CSE',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 75000,
    salaryMaxBDT: 125000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Transform complex transactional datasets into strategic executive insights and automated KPI monitoring dashboards.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Write complex SQL queries and transformations for data warehousing pipelines.</li><li>Develop executive dashboards in Power BI, Tableau, and Metabase.</li><li>Analyze user conversion funnels, retention metrics, and cohort behavior.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>2+ years of professional experience in data analytics or business intelligence.</li><li>Advanced SQL skills and proficiency in Python or R for statistical data analysis.</li><li>Exceptional verbal and written data communication capabilities.</li></ul>',
  },

  // 3. Electrical & Telecom
  {
    title: 'Substation Automation & Power Systems Engineer',
    category: 'Electrical & Telecom',
    deptCode: 'EEE',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 80000,
    salaryMaxBDT: 135000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Oversee grid substation automation, protective relay programming, and supervisory control systems for modern power facilities.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Configure and test SCADA systems and intelligent electronic devices (IEDs).</li><li>Conduct load flow, short circuit, and harmonic analyses using ETAP.</li><li>Supervise field testing, protective coordination, and equipment commissioning.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>B.Sc. in Electrical & Electronic Engineering (EEE).</li><li>3+ years in power generation, transmission, or substation engineering.</li><li>Familiarity with IEC 61850 protocol and electrical protection standards.</li></ul>',
  },
  {
    title: 'Telecom Network & RF Optimization Engineer',
    category: 'Electrical & Telecom',
    deptCode: 'EEE',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 70000,
    salaryMaxBDT: 115000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Optimize cellular base station coverage, radio frequency parameters, and network transmission performance across regional networks.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Analyze drive test logs and KPI statistics to resolve coverage drops and interference.</li><li>Plan 4G/5G antenna azimuths, tilts, and capacity expansions.</li><li>Partner with field maintenance crews to ensure continuous cell site reliability.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>Degree in EEE or Telecommunications Engineering.</li><li>Strong background in mobile cellular architectures, RF propagation, and network optimization tools.</li><li>Ability to travel for site verification and field assessments.</li></ul>',
  },
  {
    title: 'Embedded Systems & Hardware Design Engineer',
    category: 'Electrical & Telecom',
    deptCode: 'EEE',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 75000,
    salaryMaxBDT: 120000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Design custom printed circuit boards (PCBs), write micro-controller firmware, and validate IoT hardware devices.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Design schematic and multi-layer PCB layouts using Altium Designer or KiCad.</li><li>Develop bare-metal and RTOS firmware in Embedded C/C++.</li><li>Conduct hardware thermal analysis, signal integrity testing, and EMC compliance.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>B.Sc. in EEE or Computer Engineering.</li><li>Hands-on experience with STM32, ESP32, or ARM Cortex microcontrollers.</li><li>Practical laboratory skills using oscilloscopes, logic analyzers, and soldering tools.</li></ul>',
  },

  // 4. Finance & Banking
  {
    title: 'Corporate Credit & Risk Analyst',
    category: 'Finance & Banking',
    deptCode: 'BBA',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 75000,
    salaryMaxBDT: 125000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Conduct thorough credit appraisals, financial statement evaluations, and repayment feasibility analyses for commercial enterprises.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Analyze historical balance sheets, cash flow statements, and working capital cycles.</li><li>Prepare credit appraisal memorandums for board sanctioning committees.</li><li>Monitor borrower compliance with loan covenants and collateral requirements.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>BBA or MBA in Finance or Accounting.</li><li>2-4 years in corporate credit underwriting or commercial banking operations.</li><li>Strong mastery of financial modeling and Bangladesh Bank regulatory guidelines.</li></ul>',
  },
  {
    title: 'Investment Banking & Financial Modeler',
    category: 'Finance & Banking',
    deptCode: 'BBA',
    experienceLevel: ExperienceLevel.SENIOR,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 120000,
    salaryMaxBDT: 200000,
    salaryUSD: { min: 2000, max: 3800 },
    descriptionHtml: '<p><strong>Role Overview:</strong> Structure syndicated loans, capital market debt instruments, and equity valuation models for prominent institutional clients.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Build dynamic discounted cash flow (DCF) and leveraged buyout (LBO) valuation models.</li><li>Draft comprehensive investor pitch decks and information memorandums.</li><li>Coordinate legal due diligence and closing documentation for major transactions.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>Degree in Finance, Economics, or Business Administration.</li><li>Proven background in corporate finance, private equity, or merchant banking.</li><li>CFA charterholder or level 2/3 candidate preferred.</li></ul>',
  },
  {
    title: 'Management Trainee Officer (Finance & Accounts)',
    category: 'Finance & Banking',
    deptCode: 'BBA',
    experienceLevel: ExperienceLevel.ENTRY_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 50000,
    salaryMaxBDT: 75000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Prestigious leadership rotational program designed to cultivate future executive branch leaders and financial managers.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Rotate through Treasury, Retail Banking, Corporate Credit, and Internal Audit departments.</li><li>Complete capstone business process optimization projects under senior alumni mentorship.</li><li>Deliver presentations on branch productivity and customer onboarding efficiencies.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>Recent BBA or MBA graduate with CGPA 3.50+ from North Western University.</li><li>Exemplary leadership skills demonstrated through campus club or extracurricular involvement.</li><li>High analytical, numerical, and interpersonal presentation acumen.</li></ul>',
  },

  // 5. Product & Design
  {
    title: 'Associate Product Manager',
    category: 'Product & Design',
    deptCode: 'BBA',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 80000,
    salaryMaxBDT: 130000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Own the product development lifecycle for core digital features, translating user problems into actionable engineering backlogs.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Conduct user interviews and analyze usage telemetry to define product requirements.</li><li>Author detailed user stories, acceptance criteria, and PRDs in Jira.</li><li>Coordinate sprint priorities between design, engineering, and business stakeholders.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>2+ years of software product management or business analyst experience.</li><li>Strong intuition for UX, data analysis, and agile software development.</li><li>Exceptional cross-functional communication and backlog prioritization skills.</li></ul>',
  },
  {
    title: 'UI/UX Product Designer',
    category: 'Product & Design',
    deptCode: 'CSE',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 70000,
    salaryMaxBDT: 115000,
    salaryUSD: { min: 1800, max: 3200 },
    descriptionHtml: '<p><strong>Role Overview:</strong> Craft elegant, accessible user interfaces and cohesive design systems for responsive web and mobile digital products.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Create low-fidelity wireframes, high-fidelity mockups, and interactive Figma prototypes.</li><li>Conduct usability tests and iterate designs based on real customer feedback.</li><li>Maintain and scale our multi-brand UI component library in close collaboration with frontend engineers.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>Demonstrated digital design portfolio showcasing web or mobile UX/UI case studies.</li><li>Expert mastery of Figma, auto-layout, design tokens, and prototyping.</li><li>Understanding of HTML/CSS semantics and WCAG 2.1 accessibility criteria.</li></ul>',
  },

  // 6. Civil Engineering
  {
    title: 'Structural Design & Analysis Engineer',
    category: 'Civil Engineering',
    deptCode: 'CE',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 75000,
    salaryMaxBDT: 125000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Model, calculate, and engineer reinforced concrete and steel superstructures for commercial towers and industrial complexes.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Perform finite element structural analyses using ETABS and STAAD.Pro.</li><li>Design earthquake and wind-resistant framing systems in compliance with BNBC.</li><li>Generate detailed structural fabrication drawings and bar bending schedules.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>B.Sc. in Civil Engineering (CE).</li><li>3+ years of structural modeling experience in consultancy or contracting firms.</li><li>Deep familiarity with Bangladesh National Building Code (BNBC) and ACI standards.</li></ul>',
  },
  {
    title: 'Site Construction Management Supervisor',
    category: 'Civil Engineering',
    deptCode: 'CE',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 65000,
    salaryMaxBDT: 105000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Direct on-site construction operations, contractor logistics, quality inspections, and job-site occupational safety.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Ensure concrete batching, rebar placements, and formwork match engineering specifications.</li><li>Coordinate daily material deliveries and subcontractor workforce scheduling.</li><li>Enforce stringent occupational health and safety (OHS) protocols across all active zones.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>Degree in Civil Engineering or Diploma in Civil Construction.</li><li>2+ years of hands-on field experience overseeing building construction sites.</li><li>Strong site leadership, vendor management, and crisis resolution abilities.</li></ul>',
  },

  // 7. Communications & PR
  {
    title: 'Technical Content & Documentation Strategist',
    category: 'Communications & PR',
    deptCode: 'ENG',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 65000,
    salaryMaxBDT: 100000,
    salaryUSD: { min: 1600, max: 2800 },
    descriptionHtml: '<p><strong>Role Overview:</strong> Author comprehensive developer guides, API references, architecture overviews, and technical release notes.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Interview software architects to synthesize complex technical workflows into crystal-clear documentation.</li><li>Maintain documentation portals using Markdown and automated docs-as-code pipelines.</li><li>Author release change-logs and developer onboarding tutorials.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>Degree in English, Communications, or Computer Science.</li><li>Superb technical writing clarity with zero grammatical ambiguity.</li><li>Familiarity with Git, Markdown, and reading basic API endpoints.</li></ul>',
  },

  // 8. Operations & Supply Chain
  {
    title: 'Supply Chain Logistics & Procurement Coordinator',
    category: 'Operations & Supply Chain',
    deptCode: 'BBA',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 65000,
    salaryMaxBDT: 110000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Optimize end-to-end procurement, inventory management, and freight forwarding operations for manufacturing facilities.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Manage vendor relations, negotiate bulk purchase contracts, and evaluate supplier ratings.</li><li>Coordinate customs clearance, import LC processing, and bonded warehouse logistics.</li><li>Implement lean inventory models to eliminate stock-outs and reduce holding costs.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>BBA in Supply Chain Management or Operations.</li><li>2+ years in procurement, import/export logistics, or manufacturing supply chain.</li><li>Proficiency in ERP software (SAP or Oracle) and advanced Excel.</li></ul>',
  },

  // 9. Academia & Research
  {
    title: 'Economic Policy & Market Research Associate',
    category: 'Academia & Research',
    deptCode: 'ECON',
    experienceLevel: ExperienceLevel.MID_LEVEL,
    employmentType: 'FULL_TIME',
    salaryMinBDT: 60000,
    salaryMaxBDT: 95000,
    descriptionHtml: '<p><strong>Role Overview:</strong> Perform econometric evaluations, socio-economic survey analyses, and public policy impact assessments.</p><p><strong>Key Responsibilities:</strong></p><ul><li>Compile and clean longitudinal micro-data from statistical surveys.</li><li>Estimate regression and time-series models in STATA, R, or Python.</li><li>Co-author policy briefs and empirical research reports for institutional stakeholders.</li></ul>',
    requirementsHtml: '<p><strong>Prerequisites:</strong></p><ul><li>B.Sc. or M.Sc. in Economics.</li><li>Proven econometric research background and familiarity with survey design.</li><li>High proficiency in STATA, R, and LaTeX document preparation.</li></ul>',
  },
];

const COMPANIES = [
  'bKash Limited', 'Brain Station 23', 'Grameenphone Ltd', 'Robi Axiata Limited',
  'Samsung R&D Institute Bangladesh', 'Optimizely Bangladesh', 'Cefalo Bangladesh',
  'Pathao', 'Chaldal', 'Therap BD', 'TigerIT Bangladesh', 'BRAC Bank PLC',
  'City Bank PLC', 'Standard Chartered Bangladesh', 'Dutch-Bangla Bank PLC',
  'Square Pharmaceuticals PLC', 'Walton Hi-Tech Industries', 'Summit Power International',
  'Mir Akhter Hossain Ltd', 'Akij Group', 'BEXIMCO Group', 'PRAN-RFL Group',
  'Nagad', 'ShopUp', 'SELISE Digital Platforms', 'Enosis Solutions', 'Kaz Software',
  'Invento Software Limited', 'DataSoft Systems', 'Google Cloud (Remote)',
  'Amazon Web Services (Remote)', 'Shopify (Remote)', 'Microsoft (Remote)',
  'North Western University', 'Institute of Water Modelling'
];

const CITIES = [
  'Dhaka, Bangladesh', 'Khulna, Bangladesh', 'Chattogram, Bangladesh',
  'Sylhet, Bangladesh', 'Rajshahi, Bangladesh', 'Gazipur, Bangladesh',
  'Remote (Worldwide)', 'Remote (Bangladesh)', 'Singapore'
];

// Helper to pick random element
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

// -----------------------------------------------------------------------------
// MAIN PROVISIONING SCRIPT
// -----------------------------------------------------------------------------
async function main() {
  const startTime = Date.now();
  const isForce = process.argv.includes('--force');

  console.log('================================================================================');
  console.log('ALUMNI CONNECT - PRODUCTION BULK JOB & APPLICATION PROVISIONING SCRIPT');
  console.log('Target: North Western University (slug: north-western-university)');
  console.log('Goal: 1,500 Jobs, Moderation Trails, ~4,000 Applications, Redis Sync');
  console.log('================================================================================\n');

  // STEP 1: Verify University & Live User Pool
  console.log('>>> [STEP 1/5] Fetching Live Actors & Checking Idempotency...');
  const university = await prisma.university.findFirst({
    where: { slug: CANONICAL_UNIVERSITY_SLUG },
  });
  if (!university) {
    throw new Error(`Canonical university with slug "${CANONICAL_UNIVERSITY_SLUG}" not found!`);
  }

  // Idempotency check
  const existingJobCount = await prisma.job.count({
    where: { universityId: university.id },
  });
  console.log(`[INFO] Current jobs in database for North Western University: ${existingJobCount}`);
  if (existingJobCount >= 1400 && !isForce) {
    console.log('[IDEMPOTENT EXIT] Database already has >= 1,400 jobs. Skipping provisioning.');
    console.log('To force re-provisioning, re-run with "--force".');
    process.exit(0);
  }

  // Fetch real users
  const alumniUsers = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: RoleName.ALUMNI },
      isActive: true,
      verificationStatus: 'APPROVED',
    },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      currentCompany: true,
      position: true,
      headline: true,
      skills: true,
      avatarUrl: true,
      batch: true,
      graduationYear: true,
      academicId: true,
      phone: true,
      phonePublic: true,
    },
  });

  const studentUsers = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: RoleName.STUDENT },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      headline: true,
      skills: true,
      avatarUrl: true,
      batch: true,
      studentId: true,
      phone: true,
      phonePublic: true,
    },
  });

  const moderators = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: RoleName.MODERATOR },
      isActive: true,
    },
    select: { id: true, name: true, email: true, department: true },
  });

  const superAdmins = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: RoleName.SUPER_ADMIN },
      isActive: true,
    },
    select: { id: true, name: true, email: true, department: true },
  });

  console.log(`[OK] Actors Loaded for "${university.name}":`);
  console.log(`  - Alumni Posters & Senior Applicants: ${alumniUsers.length}`);
  console.log(`  - Student Applicants: ${studentUsers.length}`);
  console.log(`  - Faculty Moderators: ${moderators.length}`);
  console.log(`  - Super Admins: ${superAdmins.length}`);

  if (alumniUsers.length < 50 || moderators.length < 2) {
    throw new Error('Insufficient user pool in database to safely generate realistic job relations!');
  }

  const allReviewers = [...moderators, ...superAdmins];

  // STEP 2: In-Memory Preparation of 1,500 Jobs
  console.log('\n>>> [STEP 2/5] Synthesizing 1,500 Jobs with Full Moderation Profiles...');

  interface PlannedJob {
    tempId: string;
    universityId: string;
    postedById: string;
    reviewerId?: string | null;
    approvedById?: string | null;
    title: string;
    company: string;
    category: string;
    employmentType: string;
    workMode: WorkMode;
    experienceLevel: ExperienceLevel;
    location: string;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency: string;
    deadline: Date;
    referralAvailable: boolean;
    requireResume: boolean;
    requireCoverLetter: boolean;
    status: JobStatus;
    submittedAt?: Date | null;
    claimedAt?: Date | null;
    publishedAt?: Date | null;
    approvedAt?: Date | null;
    closedAt?: Date | null;
    closedById?: string | null;
    closedReason?: string | null;
    rejectionReason?: string | null;
    description: string;
    requirements?: string | null;
    moderationRecords: {
      actorId: string;
      actorRole: string;
      action: JobModerationAction;
      reasonCode?: string | null;
      ownerVisibleNote?: string | null;
      internalNote?: string | null;
      createdAt: Date;
    }[];
    auditLogs: {
      actorId: string;
      actorRole: string;
      action: string;
      createdAt: Date;
      metadata?: Record<string, unknown>;
    }[];
  }

  const plannedJobs: PlannedJob[] = [];
  const now = Date.now();

  // Helper for generating job dates
  const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000);
  const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);
  const daysAhead = (d: number) => new Date(now + d * 24 * 60 * 60 * 1000);

  let jobCounter = 0;

  // 2.1: 1,220 PUBLISHED Jobs
  console.log('Generating 1,220 PUBLISHED jobs (Active live board)...');
  for (let i = 0; i < 1220; i++) {
    jobCounter++;
    const tpl = JOB_TEMPLATES[i % JOB_TEMPLATES.length]!;
    const alumni = alumniUsers[i % alumniUsers.length]!;
    const reviewer = allReviewers[i % allReviewers.length]!;
    const isRemote = i % 5 === 0;
    const workMode = isRemote ? WorkMode.REMOTE : i % 3 === 0 ? WorkMode.HYBRID : WorkMode.ON_SITE;
    const location = isRemote ? 'Remote (Global)' : CITIES[i % CITIES.length]!;
    const company = alumni.currentCompany || COMPANIES[i % COMPANIES.length]!;
    const isUSD = isRemote && Boolean(tpl.salaryUSD) && i % 2 === 0;

    const daysPublished = 1 + (i % 40);
    const subDate = daysAgo(daysPublished + 1);
    const claimDate = new Date(subDate.getTime() + 2 * 60 * 60 * 1000);
    const pubDate = daysAgo(daysPublished);
    const deadline = daysAhead(10 + (i % 75));

    const roleName = moderators.some((m) => m.id === reviewer.id) ? 'MODERATOR' : 'SUPER_ADMIN';

    plannedJobs.push({
      tempId: `JOB_PUB_${jobCounter}`,
      universityId: university.id,
      postedById: alumni.id,
      reviewerId: reviewer.id,
      approvedById: reviewer.id,
      title: tpl.title,
      company,
      category: tpl.category,
      employmentType: tpl.employmentType,
      workMode,
      experienceLevel: tpl.experienceLevel,
      location,
      salaryMin: isUSD ? tpl.salaryUSD!.min : tpl.salaryMinBDT,
      salaryMax: isUSD ? tpl.salaryUSD!.max : tpl.salaryMaxBDT,
      salaryCurrency: isUSD ? 'USD' : 'BDT',
      deadline,
      referralAvailable: i % 3 === 0, // ~35% referral available
      requireResume: false, // Keep false on seeded jobs so real users can easily test apply without broken keys
      requireCoverLetter: i % 2 === 0,
      status: JobStatus.PUBLISHED,
      submittedAt: subDate,
      claimedAt: claimDate,
      publishedAt: pubDate,
      approvedAt: pubDate,
      description: tpl.descriptionHtml,
      requirements: tpl.requirementsHtml,
      moderationRecords: [
        {
          actorId: alumni.id,
          actorRole: 'ALUMNI',
          action: JobModerationAction.SUBMIT,
          ownerVisibleNote: 'Opportunity submitted to campus moderation queue.',
          internalNote: 'Initial submission by verified alumnus.',
          createdAt: subDate,
        },
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: JobModerationAction.CLAIM,
          ownerVisibleNote: 'Listing claimed by institutional reviewer.',
          internalNote: `Review claim taken by ${roleName} (${reviewer.name}).`,
          createdAt: claimDate,
        },
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: JobModerationAction.APPROVE,
          ownerVisibleNote: 'Listing verified and published live to the North Western University opportunities board.',
          internalNote: `Approved following institutional accreditation verification by ${reviewer.name}.`,
          createdAt: pubDate,
        },
      ],
      auditLogs: [
        {
          actorId: alumni.id,
          actorRole: 'ALUMNI',
          action: 'JOB_SUBMITTED',
          createdAt: subDate,
          metadata: { title: tpl.title, company },
        },
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: 'JOB_CLAIMED',
          createdAt: claimDate,
        },
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: 'JOB_APPROVED',
          createdAt: pubDate,
          metadata: { actorRole: roleName },
        },
      ],
    });
  }

  // 2.2: 180 CLOSED Jobs
  console.log('Generating 180 CLOSED jobs (Past deadlines / Filled positions)...');
  for (let i = 0; i < 180; i++) {
    jobCounter++;
    const tpl = JOB_TEMPLATES[(i + 4) % JOB_TEMPLATES.length]!;
    const alumni = alumniUsers[(i + 15) % alumniUsers.length]!;
    const reviewer = allReviewers[(i + 2) % allReviewers.length]!;
    const company = COMPANIES[(i + 3) % COMPANIES.length]!;

    const subDate = daysAgo(55 + (i % 30));
    const claimDate = new Date(subDate.getTime() + 3 * 60 * 60 * 1000);
    const pubDate = daysAgo(50 + (i % 30));
    const closeDate = daysAgo(1 + (i % 25));
    const deadline = closeDate;

    const roleName = moderators.some((m) => m.id === reviewer.id) ? 'MODERATOR' : 'SUPER_ADMIN';
    const closeReasons = [
      'Position successfully filled via Alumni Connect candidate',
      'Application deadline expired',
      'Hiring concluded by corporate talent acquisition team',
      'Vacancy fulfilled by internal department promotion',
    ];
    const closedReason = closeReasons[i % closeReasons.length]!;

    plannedJobs.push({
      tempId: `JOB_CLS_${jobCounter}`,
      universityId: university.id,
      postedById: alumni.id,
      reviewerId: reviewer.id,
      approvedById: reviewer.id,
      title: tpl.title,
      company,
      category: tpl.category,
      employmentType: tpl.employmentType,
      workMode: WorkMode.ON_SITE,
      experienceLevel: tpl.experienceLevel,
      location: CITIES[i % CITIES.length]!,
      salaryMin: tpl.salaryMinBDT,
      salaryMax: tpl.salaryMaxBDT,
      salaryCurrency: 'BDT',
      deadline,
      referralAvailable: false,
      requireResume: false,
      requireCoverLetter: false,
      status: JobStatus.CLOSED,
      submittedAt: subDate,
      claimedAt: claimDate,
      publishedAt: pubDate,
      approvedAt: pubDate,
      closedAt: closeDate,
      closedById: alumni.id,
      closedReason,
      description: tpl.descriptionHtml,
      requirements: tpl.requirementsHtml,
      moderationRecords: [
        {
          actorId: alumni.id,
          actorRole: 'ALUMNI',
          action: JobModerationAction.SUBMIT,
          createdAt: subDate,
        },
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: JobModerationAction.CLAIM,
          createdAt: claimDate,
        },
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: JobModerationAction.APPROVE,
          createdAt: pubDate,
        },
        {
          actorId: alumni.id,
          actorRole: 'ALUMNI',
          action: JobModerationAction.CLOSE,
          ownerVisibleNote: closedReason,
          internalNote: `Listing closed by poster with reason: ${closedReason}`,
          createdAt: closeDate,
        },
      ],
      auditLogs: [
        {
          actorId: alumni.id,
          actorRole: 'ALUMNI',
          action: 'JOB_CLOSED',
          createdAt: closeDate,
          metadata: { closedReason },
        },
      ],
    });
  }

  // 2.3: 12 Recent In-Review Jobs (6 SUBMITTED + 6 UNDER_REVIEW)
  console.log('Generating 12 In-Review jobs (6 ready-to-claim + 6 actively locked)...');
  // 6 SUBMITTED jobs
  for (let i = 0; i < 6; i++) {
    jobCounter++;
    const tpl = JOB_TEMPLATES[(i * 2) % JOB_TEMPLATES.length]!;
    const alumni = alumniUsers[(i * 7) % alumniUsers.length]!;
    const subDate = hoursAgo(1 + i);
    const deadline = daysAhead(20 + i * 5);

    plannedJobs.push({
      tempId: `JOB_SUB_${jobCounter}`,
      universityId: university.id,
      postedById: alumni.id,
      reviewerId: null,
      approvedById: null,
      title: tpl.title,
      company: COMPANIES[(i * 4) % COMPANIES.length]!,
      category: tpl.category,
      employmentType: tpl.employmentType,
      workMode: WorkMode.HYBRID,
      experienceLevel: tpl.experienceLevel,
      location: 'Khulna, Bangladesh',
      salaryMin: tpl.salaryMinBDT,
      salaryMax: tpl.salaryMaxBDT,
      salaryCurrency: 'BDT',
      deadline,
      referralAvailable: true,
      requireResume: false,
      requireCoverLetter: true,
      status: JobStatus.SUBMITTED,
      submittedAt: subDate,
      claimedAt: null,
      description: tpl.descriptionHtml,
      requirements: tpl.requirementsHtml,
      moderationRecords: [
        {
          actorId: alumni.id,
          actorRole: 'ALUMNI',
          action: JobModerationAction.SUBMIT,
          ownerVisibleNote: 'Listing submitted for institutional moderation. Awaiting reviewer claim.',
          internalNote: 'Unclaimed item in general queue.',
          createdAt: subDate,
        },
      ],
      auditLogs: [
        {
          actorId: alumni.id,
          actorRole: 'ALUMNI',
          action: 'JOB_SUBMITTED',
          createdAt: subDate,
        },
      ],
    });
  }

  // 6 UNDER_REVIEW jobs (assigned 1 each to 6 active moderators)
  for (let i = 0; i < 6; i++) {
    jobCounter++;
    const tpl = JOB_TEMPLATES[(i * 2 + 1) % JOB_TEMPLATES.length]!;
    const alumni = alumniUsers[(i * 9 + 3) % alumniUsers.length]!;
    const mod = moderators[i % moderators.length]!;
    const subDate = hoursAgo(4 + i);
    const claimDate = hoursAgo(1 + i * 0.3);
    const deadline = daysAhead(25 + i * 3);

    plannedJobs.push({
      tempId: `JOB_REV_${jobCounter}`,
      universityId: university.id,
      postedById: alumni.id,
      reviewerId: mod.id,
      approvedById: null,
      title: tpl.title,
      company: COMPANIES[(i * 3 + 2) % COMPANIES.length]!,
      category: tpl.category,
      employmentType: tpl.employmentType,
      workMode: WorkMode.ON_SITE,
      experienceLevel: tpl.experienceLevel,
      location: 'Dhaka, Bangladesh',
      salaryMin: tpl.salaryMinBDT,
      salaryMax: tpl.salaryMaxBDT,
      salaryCurrency: 'BDT',
      deadline,
      referralAvailable: true,
      requireResume: false,
      requireCoverLetter: false,
      status: JobStatus.UNDER_REVIEW,
      submittedAt: subDate,
      claimedAt: claimDate,
      description: tpl.descriptionHtml,
      requirements: tpl.requirementsHtml,
      moderationRecords: [
        {
          actorId: alumni.id,
          actorRole: 'ALUMNI',
          action: JobModerationAction.SUBMIT,
          createdAt: subDate,
        },
        {
          actorId: mod.id,
          actorRole: 'MODERATOR',
          action: JobModerationAction.CLAIM,
          ownerVisibleNote: `Listing claimed by ${mod.name} for departmental verification.`,
          internalNote: `Active review lock held by moderator ${mod.id}`,
          createdAt: claimDate,
        },
      ],
      auditLogs: [
        {
          actorId: alumni.id,
          actorRole: 'ALUMNI',
          action: 'JOB_SUBMITTED',
          createdAt: subDate,
        },
        {
          actorId: mod.id,
          actorRole: 'MODERATOR',
          action: 'JOB_CLAIMED',
          createdAt: claimDate,
        },
      ],
    });
  }

  // 2.4: 55 REJECTED Jobs
  console.log('Generating 55 REJECTED jobs (Moderation declined with actionable reason codes)...');
  const rejectReasons = [
    {
      code: 'POLICY_VIOLATION',
      reason: 'Listing violates platform compensation transparency rules. Clear salary bounds must be specified.',
    },
    {
      code: 'INCOMPLETE',
      reason: 'Job description lacks clear minimum candidate qualifications and prerequisite technologies.',
    },
    {
      code: 'MISLEADING',
      reason: 'Role title does not match specified job duties. Please align title with industry standards.',
    },
    {
      code: 'DUPLICATE',
      reason: 'An identical opportunity is already active on the board under your organization profile.',
    },
  ];

  for (let i = 0; i < 55; i++) {
    jobCounter++;
    const tpl = JOB_TEMPLATES[(i + 3) % JOB_TEMPLATES.length]!;
    const alumni = alumniUsers[(i + 22) % alumniUsers.length]!;
    const reviewer = allReviewers[i % allReviewers.length]!;
    const reasonSpec = rejectReasons[i % rejectReasons.length]!;
    const roleName = moderators.some((m) => m.id === reviewer.id) ? 'MODERATOR' : 'SUPER_ADMIN';

    const subDate = daysAgo(10 + (i % 20));
    const claimDate = new Date(subDate.getTime() + 2 * 60 * 60 * 1000);
    const rejDate = new Date(subDate.getTime() + 6 * 60 * 60 * 1000);

    plannedJobs.push({
      tempId: `JOB_REJ_${jobCounter}`,
      universityId: university.id,
      postedById: alumni.id,
      reviewerId: reviewer.id,
      approvedById: null,
      title: tpl.title,
      company: COMPANIES[(i + 7) % COMPANIES.length]!,
      category: tpl.category,
      employmentType: tpl.employmentType,
      workMode: WorkMode.ON_SITE,
      experienceLevel: tpl.experienceLevel,
      location: 'Khulna, Bangladesh',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: 'BDT',
      deadline: daysAhead(15),
      referralAvailable: false,
      requireResume: false,
      requireCoverLetter: false,
      status: JobStatus.REJECTED,
      submittedAt: subDate,
      claimedAt: claimDate,
      rejectionReason: reasonSpec.reason,
      description: tpl.descriptionHtml,
      requirements: tpl.requirementsHtml,
      moderationRecords: [
        {
          actorId: alumni.id,
          actorRole: 'ALUMNI',
          action: JobModerationAction.SUBMIT,
          createdAt: subDate,
        },
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: JobModerationAction.CLAIM,
          createdAt: claimDate,
        },
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: JobModerationAction.REJECT,
          reasonCode: reasonSpec.code,
          ownerVisibleNote: reasonSpec.reason,
          internalNote: `Declined by ${reviewer.name}. Reason code: ${reasonSpec.code}`,
          createdAt: rejDate,
        },
      ],
      auditLogs: [
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: 'JOB_REJECTED',
          createdAt: rejDate,
          metadata: { reason: reasonSpec.reason, reasonCode: reasonSpec.code },
        },
      ],
    });
  }

  // 2.5: 33 CHANGES_REQUESTED Jobs
  console.log('Generating 33 CHANGES_REQUESTED jobs (Actionable revision feedback)...');
  const changesNotes = [
    'Please detail whether laptop and remote work equipment allowances are provided by the employer.',
    'Kindly specify the office attendance schedule for hybrid work (e.g. required days per week in Khulna).',
    'Please outline the evaluation process stages (e.g., technical round, take-home task, HR interview).',
    'Please clarify if this position offers permanent full-time absorption following the probationary period.',
  ];

  for (let i = 0; i < 33; i++) {
    jobCounter++;
    const tpl = JOB_TEMPLATES[(i + 5) % JOB_TEMPLATES.length]!;
    const alumni = alumniUsers[(i + 40) % alumniUsers.length]!;
    const reviewer = allReviewers[(i + 4) % allReviewers.length]!;
    const note = changesNotes[i % changesNotes.length]!;
    const roleName = moderators.some((m) => m.id === reviewer.id) ? 'MODERATOR' : 'SUPER_ADMIN';

    const subDate = daysAgo(5 + (i % 12));
    const claimDate = new Date(subDate.getTime() + 1 * 60 * 60 * 1000);
    const chgDate = new Date(subDate.getTime() + 4 * 60 * 60 * 1000);

    plannedJobs.push({
      tempId: `JOB_CHG_${jobCounter}`,
      universityId: university.id,
      postedById: alumni.id,
      reviewerId: reviewer.id,
      approvedById: null,
      title: tpl.title,
      company: COMPANIES[(i + 11) % COMPANIES.length]!,
      category: tpl.category,
      employmentType: tpl.employmentType,
      workMode: WorkMode.HYBRID,
      experienceLevel: tpl.experienceLevel,
      location: 'Dhaka, Bangladesh',
      salaryMin: tpl.salaryMinBDT,
      salaryMax: tpl.salaryMaxBDT,
      salaryCurrency: 'BDT',
      deadline: daysAhead(20),
      referralAvailable: true,
      requireResume: false,
      requireCoverLetter: false,
      status: JobStatus.CHANGES_REQUESTED,
      submittedAt: subDate,
      claimedAt: claimDate,
      description: tpl.descriptionHtml,
      requirements: tpl.requirementsHtml,
      moderationRecords: [
        {
          actorId: alumni.id,
          actorRole: 'ALUMNI',
          action: JobModerationAction.SUBMIT,
          createdAt: subDate,
        },
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: JobModerationAction.CLAIM,
          createdAt: claimDate,
        },
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: JobModerationAction.REQUEST_CHANGES,
          ownerVisibleNote: note,
          internalNote: `Revisions requested by ${reviewer.name}: ${note}`,
          createdAt: chgDate,
        },
      ],
      auditLogs: [
        {
          actorId: reviewer.id,
          actorRole: roleName,
          action: 'JOB_CHANGES_REQUESTED',
          createdAt: chgDate,
          metadata: { notes: note },
        },
      ],
    });
  }

  console.log(`[OK] In-memory job synthesis complete: ${plannedJobs.length} total jobs prepared.`);
  console.log(`  - PUBLISHED: 1220`);
  console.log(`  - CLOSED: 180`);
  console.log(`  - SUBMITTED (Ready to Claim): 6`);
  console.log(`  - UNDER_REVIEW (Active Lock): 6`);
  console.log(`  - REJECTED: 55`);
  console.log(`  - CHANGES_REQUESTED: 33`);

  // STEP 3: Chunked Database Insertion of 1,500 Jobs
  console.log('\n>>> [STEP 3/5] Inserting 1,500 Jobs & Moderation Trails in 100-Job Chunks...');
  const JOB_BATCH_SIZE = 100;
  const createdJobIdMap = new Map<string, string>(); // tempId -> real db cuid

  for (let b = 0; b < plannedJobs.length; b += JOB_BATCH_SIZE) {
    const chunk = plannedJobs.slice(b, b + JOB_BATCH_SIZE);

    // 1. Insert jobs in transaction
    const chunkData = chunk.map(
      ({ tempId, moderationRecords, auditLogs, ...jobFields }) => jobFields
    );

    await prisma.job.createMany({
      data: chunkData,
    });

    // 2. Query back the created jobs to map IDs
    const titles = chunk.map((c) => c.title);
    const createdRows = await prisma.job.findMany({
      where: {
        universityId: university.id,
        title: { in: titles },
      },
      select: { id: true, title: true, postedById: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: chunk.length * 2,
    });

    // Map tempId to created ID
    for (const pJob of chunk) {
      const match = createdRows.find(
        (r) => r.title === pJob.title && r.postedById === pJob.postedById && r.status === pJob.status
      );
      if (match) {
        createdJobIdMap.set(pJob.tempId, match.id);
      }
    }

    // 3. Insert moderation records & audit logs for this chunk
    const chunkModerations: Prisma.JobModerationRecordCreateManyInput[] = [];
    const chunkAudits: Prisma.AuditLogCreateManyInput[] = [];

    for (const pJob of chunk) {
      const realId = createdJobIdMap.get(pJob.tempId);
      if (!realId) continue;

      for (const mod of pJob.moderationRecords) {
        chunkModerations.push({
          jobId: realId,
          actorId: mod.actorId,
          actorRole: mod.actorRole,
          action: mod.action,
          reasonCode: mod.reasonCode,
          ownerVisibleNote: mod.ownerVisibleNote,
          internalNote: mod.internalNote,
          createdAt: mod.createdAt,
        });
      }

      for (const aud of pJob.auditLogs) {
        chunkAudits.push({
          universityId: university.id,
          actorId: aud.actorId,
          actorRole: aud.actorRole,
          action: aud.action,
          targetType: 'job',
          targetId: realId,
          createdAt: aud.createdAt,
          metadata: aud.metadata ? (aud.metadata as Prisma.InputJsonValue) : undefined,
        });
      }
    }

    if (chunkModerations.length > 0) {
      await prisma.jobModerationRecord.createMany({
        data: chunkModerations,
      });
    }

    if (chunkAudits.length > 0) {
      await prisma.auditLog.createMany({
        data: chunkAudits,
      });
    }

    const insertedSoFar = Math.min(b + JOB_BATCH_SIZE, plannedJobs.length);
    const pct = Math.round((insertedSoFar / plannedJobs.length) * 100);
    process.stdout.write(`\r  --> Inserted ${insertedSoFar}/1500 jobs (${pct}%)`);
  }
  console.log('\n[OK] All 1,500 Jobs and Moderation Trails successfully persisted to PostgreSQL.');

  // STEP 4: Generate & Insert ~4,000 Candidate Applications
  console.log('\n>>> [STEP 4/5] Generating & Inserting ~4,000 Realistic Applications...');

  // Candidate pool: students + alumni
  const studentApplicants = studentUsers;
  const alumniApplicants = alumniUsers;

  // Jobs open to application: PUBLISHED (1220) and CLOSED (180)
  const applicableJobs = plannedJobs.filter(
    (j) => (j.status === JobStatus.PUBLISHED || j.status === JobStatus.CLOSED) && createdJobIdMap.has(j.tempId)
  );
  console.log(`[INFO] Found ${applicableJobs.length} applicable jobs for candidate applications.`);

  // Target status counts for exactly 4,000 applications:
  // APPLIED: 1600 (40%), UNDER_REVIEW: 1000 (25%), SHORTLISTED: 600 (15%),
  // ACCEPTED: 320 (8%), REJECTED: 400 (10%), WITHDRAWN: 80 (2%)
  const APP_TARGETS = [
    { status: ApplicationStatus.APPLIED, count: 1600 },
    { status: ApplicationStatus.UNDER_REVIEW, count: 1000 },
    { status: ApplicationStatus.SHORTLISTED, count: 600 },
    { status: ApplicationStatus.ACCEPTED, count: 320 },
    { status: ApplicationStatus.REJECTED, count: 400 },
    { status: ApplicationStatus.WITHDRAWN, count: 80 },
  ];

  const totalTargetApps = 4000;
  const appliedPairs = new Set<string>(); // "jobId:applicantId"

  interface PlannedApplication {
    jobId: string;
    applicantId: string;
    coverLetter: string;
    resumeKey: string;
    shareProfileConsent: boolean;
    profileSnapshot: Prisma.InputJsonValue;
    status: ApplicationStatus;
    ownerNote?: string | null;
    withdrawnAt?: Date | null;
    createdAt: Date;
    jobPosterId: string;
  }

  const plannedApps: PlannedApplication[] = [];

  const COVER_LETTERS: Record<string, string[]> = {
    CSE: [
      'I am writing to express my strong enthusiasm for this engineering position. Having developed multiple production-grade web applications with modern TypeScript, React, and PostgreSQL stacks, I am confident in delivering immediate value to your technical roadmap.',
      'As an avid software craftsman from North Western University, I have honed my skills in distributed systems and cloud microservices. I would be thrilled to bring my problem-solving energy and collaborative mindset to your engineering team.',
      'With a solid academic foundation in algorithms, database design, and hands-on full-stack development, I am eager to contribute to your core product architecture and help scale high-availability features.',
    ],
    EEE: [
      'I am excited to submit my candidacy for this engineering role. My practical laboratory training in power system modeling, substation protective devices, and embedded automation aligns directly with your technical prerequisites.',
      'Having completed comprehensive coursework in electrical circuit design and automated SCADA architectures at NWU, I am keen to apply my engineering diligence to your operations.',
    ],
    BBA: [
      'I am delighted to present my qualifications for this opportunity. My background in financial statement analysis, credit underwriting models, and corporate strategy equips me to make immediate contributions to your business objectives.',
      'As a motivated business graduate with rigorous training in digital marketing funnels, product management, and data-driven market research, I am eager to drive measurable growth for your organization.',
    ],
    DEFAULT: [
      'I am writing to express my earnest interest in this opportunity. My analytical coursework and active participation in university project initiatives have prepared me to excel in a high-performing team environment.',
      'With strong organizational discipline and a passion for continuous professional development, I welcome the chance to discuss how my capabilities align with your strategic targets.',
    ],
  };

  const OWNER_NOTES: Record<string, string[]> = {
    UNDER_REVIEW: [
      'Candidate profile under active review by hiring team.',
      'Academic background matches requirements. Evaluating GitHub and project portfolio.',
      'Strong academic CGPA. Awaiting department head feedback.',
    ],
    SHORTLISTED: [
      'Exceptional candidate profile. Schedule for round 1 technical interview.',
      'Impressive coursework and portfolio. Shortlisted for senior panel discussion.',
      'Shortlisted. Send coding challenge and coordinate panel schedule.',
    ],
    ACCEPTED: [
      'Candidate successfully cleared all interview rounds. Formal offer extended and accepted.',
      'Outstanding technical evaluation. Welcome to the engineering team.',
      'Offer letter issued. Onboarding scheduled for upcoming month.',
    ],
    REJECTED: [
      'Candidate profile reviewed with care. Pursuing candidates with deeper specialized experience.',
      'Impressive potential, but senior prerequisites were not met at this time.',
      'Position closed with another shortlisted candidate.',
    ],
  };

  let appCounter = 0;

  for (const target of APP_TARGETS) {
    for (let i = 0; i < target.count; i++) {
      appCounter++;

      // Pick an applicable job
      const jobIndex = (appCounter * 7) % applicableJobs.length;
      const pJob = applicableJobs[jobIndex]!;
      const realJobId = createdJobIdMap.get(pJob.tempId)!;

      // Decide whether to pick a student or alumni applicant
      // Junior/Internship roles favor students; Senior roles favor alumni
      const isSenior = pJob.experienceLevel === ExperienceLevel.SENIOR || pJob.experienceLevel === ExperienceLevel.EXECUTIVE;
      const applicantPool = isSenior || appCounter % 2 === 0 ? alumniApplicants : studentApplicants;

      // Pick applicant strictly enforcing applicantId !== job.postedById and unique pair
      let applicant = applicantPool[appCounter % applicantPool.length]!;
      let attempts = 0;
      while (
        (applicant.id === pJob.postedById || appliedPairs.has(`${realJobId}:${applicant.id}`)) &&
        attempts < 50
      ) {
        attempts++;
        const nextPool = attempts % 2 === 0 ? studentApplicants : alumniApplicants;
        applicant = nextPool[(appCounter + attempts * 13) % nextPool.length]!;
      }

      appliedPairs.add(`${realJobId}:${applicant.id}`);

      // Compose realistic profile snapshot
      const profileSnapshot = {
        name: applicant.name,
        email: applicant.email,
        phone: null,
        department: applicant.department,
        batch: (applicant as any).batch || null,
        studentId: (applicant as any).studentId || null,
        headline: applicant.headline,
        currentCompany: (applicant as any).currentCompany || null,
        position: (applicant as any).position || null,
        skills: applicant.skills,
        avatarUrl: applicant.avatarUrl,
      };

      // Compose cover letter
      const deptKey = pJob.category.includes('Software') || pJob.category.includes('Data')
        ? 'CSE'
        : pJob.category.includes('Electrical')
        ? 'EEE'
        : pJob.category.includes('Finance') || pJob.category.includes('Product')
        ? 'BBA'
        : 'DEFAULT';
      const letters = COVER_LETTERS[deptKey] || COVER_LETTERS.DEFAULT!;
      const coverLetter = letters[appCounter % letters.length]!;

      // Dates
      const jobPubDate = pJob.publishedAt || daysAgo(15);
      const appDate = new Date(jobPubDate.getTime() + (1 + (appCounter % 10)) * 24 * 60 * 60 * 1000);
      const withdrawnDate = target.status === ApplicationStatus.WITHDRAWN ? new Date(appDate.getTime() + 48 * 60 * 60 * 1000) : null;

      const ownerNotesPool = OWNER_NOTES[target.status];
      const ownerNote = ownerNotesPool ? ownerNotesPool[appCounter % ownerNotesPool.length] : null;

      plannedApps.push({
        jobId: realJobId,
        applicantId: applicant.id,
        coverLetter,
        resumeKey: `resumes/nwu-candidate-${appCounter}.pdf`,
        shareProfileConsent: true,
        profileSnapshot,
        status: target.status,
        ownerNote,
        withdrawnAt: withdrawnDate,
        createdAt: appDate,
        jobPosterId: pJob.postedById,
      });
    }
  }

  console.log(`[OK] Prepared ${plannedApps.length} candidate applications matching pipeline targets.`);

  // Insert Applications in chunks of 200
  const APP_BATCH_SIZE = 200;
  let insertedApps = 0;

  for (let b = 0; b < plannedApps.length; b += APP_BATCH_SIZE) {
    const chunk = plannedApps.slice(b, b + APP_BATCH_SIZE);

    // 1. Bulk insert applications
    const insertData = chunk.map(({ jobPosterId, ...appFields }) => appFields);
    await prisma.jobApplication.createMany({
      data: insertData,
    });

    // 2. Query back created application IDs to insert timeline history & audit logs
    const jobIds = chunk.map((c) => c.jobId);
    const applicantIds = chunk.map((c) => c.applicantId);
    const createdApps = await prisma.jobApplication.findMany({
      where: {
        jobId: { in: jobIds },
        applicantId: { in: applicantIds },
      },
      select: {
        id: true,
        jobId: true,
        applicantId: true,
        status: true,
        createdAt: true,
      },
    });

    const chunkHistory: Prisma.JobApplicationStatusHistoryCreateManyInput[] = [];
    const chunkAudits: Prisma.AuditLogCreateManyInput[] = [];

    for (const pApp of chunk) {
      const match = createdApps.find(
        (a) => a.jobId === pApp.jobId && a.applicantId === pApp.applicantId
      );
      if (!match) continue;

      // Initial history item: submitted
      chunkHistory.push({
        applicationId: match.id,
        fromStatus: null,
        toStatus: ApplicationStatus.APPLIED,
        changedById: pApp.applicantId,
        note: 'Application submitted',
        createdAt: pApp.createdAt,
      });

      chunkAudits.push({
        universityId: university.id,
        actorId: pApp.applicantId,
        action: 'JOB_APPLICATION_SUBMITTED',
        targetType: 'job',
        targetId: pApp.jobId,
        createdAt: pApp.createdAt,
        metadata: { applicationId: match.id },
      });

      // Subsequent status transition if not APPLIED
      if (pApp.status !== ApplicationStatus.APPLIED) {
        const transDate = new Date(pApp.createdAt.getTime() + 24 * 60 * 60 * 1000);
        const actorId = pApp.status === ApplicationStatus.WITHDRAWN ? pApp.applicantId : pApp.jobPosterId;
        const note =
          pApp.status === ApplicationStatus.WITHDRAWN
            ? 'Candidacy withdrawn by applicant'
            : pApp.ownerNote || `Status updated to ${pApp.status} by employer`;

        chunkHistory.push({
          applicationId: match.id,
          fromStatus: ApplicationStatus.APPLIED,
          toStatus: pApp.status,
          changedById: actorId,
          note,
          createdAt: transDate,
        });

        chunkAudits.push({
          universityId: university.id,
          actorId,
          action: 'APPLICATION_STATUS_CHANGED',
          targetType: 'job_application',
          targetId: match.id,
          createdAt: transDate,
          metadata: { fromStatus: 'APPLIED', toStatus: pApp.status },
        });
      }
    }

    if (chunkHistory.length > 0) {
      await prisma.jobApplicationStatusHistory.createMany({
        data: chunkHistory,
      });
    }

    if (chunkAudits.length > 0) {
      await prisma.auditLog.createMany({
        data: chunkAudits,
      });
    }

    insertedApps += chunk.length;
    const pct = Math.round((insertedApps / plannedApps.length) * 100);
    process.stdout.write(`\r  --> Inserted ${insertedApps}/4000 applications (${pct}%)`);
  }
  console.log('\n[OK] All 4,000 Applications & History Timelines successfully persisted to PostgreSQL.');

  // STEP 5: Redis Cache Flush & Test Directory Export
  console.log('\n>>> [STEP 5/5] Flushing Redis Caches & Exporting Directory Report...');
  try {
    await cacheService.bumpVersion('jobs');
    await cacheService.bumpVersion('dir');
    await cacheService.delPattern('stats:*');
    await cacheService.delPattern('admin:*');
    await cacheService.delPattern('moderation:*');
    await cacheService.delPattern('jobs:*');
    console.log('[OK] Distributed Redis caches bumped and purged.');
  } catch (cacheErr) {
    console.warn('[WARN] Redis cache invalidation notice:', (cacheErr as Error).message);
  }

  // Export report/PRODUCTION_JOBS_DIRECTORY.md
  const reportDir = path.resolve(process.cwd(), '../report');
  await fs.mkdir(reportDir, { recursive: true });
  const mdPath = path.join(reportDir, 'PRODUCTION_JOBS_DIRECTORY.md');

  // Pull sample IDs for quick UI testing
  const sampleSubmitted = await prisma.job.findMany({
    where: { universityId: university.id, status: JobStatus.SUBMITTED },
    include: { postedBy: { select: { name: true, email: true } } },
    take: 6,
  });

  const sampleUnderReview = await prisma.job.findMany({
    where: { universityId: university.id, status: JobStatus.UNDER_REVIEW },
    include: {
      postedBy: { select: { name: true, email: true } },
      reviewer: { select: { name: true, email: true } },
    },
    take: 6,
  });

  const samplePublished = await prisma.job.findMany({
    where: { universityId: university.id, status: JobStatus.PUBLISHED },
    include: {
      postedBy: { select: { name: true, email: true } },
      _count: { select: { applications: true } },
    },
    take: 10,
  });

  const sampleRejected = await prisma.job.findMany({
    where: { universityId: university.id, status: JobStatus.REJECTED },
    include: { postedBy: { select: { name: true, email: true } } },
    take: 5,
  });

  const sampleChanges = await prisma.job.findMany({
    where: { universityId: university.id, status: JobStatus.CHANGES_REQUESTED },
    include: { postedBy: { select: { name: true, email: true } } },
    take: 5,
  });

  const mdContent = `# North Western University - Production Jobs & Applications Directory

> **CONFIDENTIAL CREDENTIAL & TEST RUNNER REGISTER**
> Platform Scope: **North Western University** (\`north-western-university\`, \`nwu.ac.bd\`)
> Total Jobs Provisioned: **1,500** Real-Time Opportunities
> Total Applications Provisioned: **4,000** Real-Time Applications
> Date of Provisioning: **${new Date().toISOString()}**

---

## 1. Executive Metrics Breakdown

| Entity & Status | Count | Platform Purpose & UX Location |
| :--- | :--- | :--- |
| **PUBLISHED Jobs** | **1,220** | Live opportunities board on \`/student/jobs\` and \`/alumni/jobs\` |
| **CLOSED Jobs** | **180** | Expired / completed positions with closing reasons |
| **SUBMITTED (Pending Claim)** | **6** | Ready to be claimed immediately by any Moderator in \`/moderator/jobs\` |
| **UNDER_REVIEW (Active Lock)** | **6** | Locked to 6 active Moderators to test active review workflows |
| **REJECTED Jobs** | **55** | Tested with reason codes and feedback banners on \`/alumni/jobs/my-jobs\` |
| **CHANGES_REQUESTED Jobs** | **33** | Tested with actionable feedback banners on \`/alumni/jobs/my-jobs\` |
| **Total Jobs Persisted** | **1,500** | **Complete coverage across 9 industry categories** |
| **Candidate Applications** | **4,000** | **Distributed across APPLIED, UNDER_REVIEW, SHORTLISTED, ACCEPTED, REJECTED, WITHDRAWN** |

---

## 2. Ready-to-Claim Pending Jobs (Live in \`/moderator/jobs\`)

Log in as any Moderator (e.g. \`mod.cse.islam@nwu.ac.bd\` / \`${ROLE_PASSWORDS.MODERATOR}\`) and navigate to \`/moderator/jobs\` to test the live **Claim** action:

| Job ID | Title | Company | Category | Alumni Poster | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
${sampleSubmitted
  .map(
    (j) =>
      `| \`${j.id}\` | **${j.title}** | ${j.company} | ${j.category} | ${j.postedBy.name} (\`${j.postedBy.email}\`) | \`SUBMITTED\` |`
  )
  .join('\n')}

---

## 3. Actively Claimed Jobs (Locked Review in \`/moderator/jobs\`)

These jobs are held under an active review lock. Log in as the assigned Moderator to test **Approve**, **Reject**, or **Request Changes**:

| Job ID | Title | Company | Assigned Moderator (Holder) | Moderator Email | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
${sampleUnderReview
  .map(
    (j) =>
      `| \`${j.id}\` | **${j.title}** | ${j.company} | **${j.reviewer?.name || 'Assigned'}** | \`${j.reviewer?.email}\` | \`UNDER_REVIEW\` |`
  )
  .join('\n')}

---

## 4. Sample Alumni Job Posters with Received Applications (\`/alumni/applications/received\`)

Log in with any of these Alumni posters (Password: \`${ROLE_PASSWORDS.ALUMNI}\`) to review candidates, update statuses, or test applicant filters:

| Poster Name | Poster Email | Sample Job Title | Company | Applications Received |
| :--- | :--- | :--- | :--- | :--- |
${samplePublished
  .map(
    (j) =>
      `| **${j.postedBy.name}** | \`${j.postedBy.email}\` | ${j.title} | ${j.company} | **${j._count.applications} applicants** |`
  )
  .join('\n')}

---

## 5. Sample Alumni with Moderation Feedback Banners (\`/alumni/jobs/my-jobs\`)

### 5.1 Revisions Requested Banners (\`CHANGES_REQUESTED\`):
${sampleChanges
  .map(
    (j) =>
      `- **${j.postedBy.name}** (\`${j.postedBy.email}\`): Listing "*${j.title}*" at **${j.company}** (ID: \`${j.id}\`)`
  )
  .join('\n')}

### 5.2 Declined Banners (\`REJECTED\`):
${sampleRejected
  .map(
    (j) =>
      `- **${j.postedBy.name}** (\`${j.postedBy.email}\`): Listing "*${j.title}*" at **${j.company}** (ID: \`${j.id}\`)`
  )
  .join('\n')}

---

## 6. Uniform Test Passwords Reference

| Role | Uniform Password | Standard Login Dashboard |
| :--- | :--- | :--- |
| **Super Admin** | \`${ROLE_PASSWORDS.SUPER_ADMIN}\` | \`/admin\` |
| **Moderator** | \`${ROLE_PASSWORDS.MODERATOR}\` | \`/moderator\` |
| **Alumni** | \`${ROLE_PASSWORDS.ALUMNI}\` | \`/alumni\` |
| **Student** | \`${ROLE_PASSWORDS.STUDENT}\` | \`/student\` |
`;

  await fs.writeFile(mdPath, mdContent, 'utf8');
  console.log(`[OK] Credential test directory exported: ${mdPath}`);

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n================================================================================');
  console.log(`SUCCESS: Bulk Job & Application Provisioning Completed in ${totalElapsed}s!`);
  console.log(`Total Jobs Persisted: 1,500`);
  console.log(`Total Applications Persisted: 4,000`);
  console.log('================================================================================\n');

  process.exit(0);
}

main()
  .catch((err) => {
    console.error('\n[FATAL ERROR during job provisioning]:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
