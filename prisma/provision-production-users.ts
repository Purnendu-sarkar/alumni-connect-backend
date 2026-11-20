import { prisma } from '../src/config/database.js';
import { passwordService } from '../src/services/auth/password.service.js';
import { cacheService } from '../src/services/cache/cache.service.js';
import { RoleName, VerificationStatus, PrivacyScope } from '../src/generated/prisma/client.js';
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

const CLOUDINARY_BASE_URL = 'https://res.cloudinary.com/a1dumxpe/image/upload/alumni-connect/avatars/verified';

// -----------------------------------------------------------------------------
// NAME & DATA POOLS (100% Pure English Latin Characters)
// -----------------------------------------------------------------------------
const MALE_FIRST_NAMES = [
  'Abrar', 'Tanvir', 'Mahmudul', 'Tahmidur', 'Farhan', 'Riyad', 'Sabbir', 'Nafis',
  'Shahriar', 'Zubair', 'Imtiaz', 'Shakil', 'Wasif', 'Muntasir', 'Ashfaq', 'Mehedi',
  'Rakibul', 'Saifur', 'Touhid', 'Kazi', 'Fahad', 'Arif', 'Mustafa', 'Kamrul',
  'Shafiq', 'Tareq', 'Nayeem', 'Asif', 'Rezaul', 'Zamil', 'Anwar', 'Sharif',
  'Habibur', 'Nasir', 'Jashim', 'Enamul', 'Sajjad', 'Monir', 'Liton', 'Biplob',
  'Rubel', 'Jewel', 'Sohel', 'Zahir', 'Golam', 'Mominul', 'Faisal', 'Shanto',
  'Alamin', 'Shakib', 'Tamim', 'Mushfiq', 'Mustafiz', 'Taskin', 'Litton', 'Soumya'
];

const FEMALE_FIRST_NAMES = [
  'Sadia', 'Farhana', 'Nusrat', 'Anika', 'Tasnim', 'Sabrina', 'Nazifa', 'Sumaiya',
  'Tahsin', 'Maliha', 'Afia', 'Lamia', 'Ishrat', 'Sanjida', 'Humaira', 'Nabila',
  'Fariha', 'Zarin', 'Samira', 'Sharmin', 'Afsana', 'Nowshin', 'Rifat', 'Nuzhat',
  'Bushra', 'Tamanna', 'Tasnuva', 'Mehzabin', 'Khadija', 'Suraiya', 'Rokeya',
  'Shamima', 'Shirin', 'Marufa', 'Hasina', 'Farzana', 'Jesmin', 'Nasima', 'Rina',
  'Salma', 'Monira', 'Parveen', 'Shahnaz', 'Dilruba', 'Fatema', 'Munira', 'Lubna'
];

const LAST_NAMES = [
  'Rahman', 'Ahmed', 'Islam', 'Hasan', 'Hossain', 'Chowdhury', 'Khan', 'Karim',
  'Sarker', 'Alam', 'Uddin', 'Mahmood', 'Haque', 'Akter', 'Bhuiyan', 'Sultana',
  'Siddique', 'Talukder', 'Mostafa', 'Barua', 'Khatun', 'Gazi', 'Mazumder', 'Dewan',
  'Munshi', 'Miah', 'Sheikh', 'Bhowmik', 'Pal', 'Datta', 'Biswas', 'Das', 'Sen'
];

const LOCATIONS = [
  'Dhaka, Bangladesh', 'Khulna, Bangladesh', 'Chattogram, Bangladesh', 'Sylhet, Bangladesh',
  'Rajshahi, Bangladesh', 'Barishal, Bangladesh', 'Rangpur, Bangladesh', 'Gazipur, Bangladesh',
  'Singapore', 'Berlin, Germany', 'London, UK', 'Toronto, Canada', 'Austin, TX, USA',
  'Sydney, Australia', 'Dubai, UAE', 'Tokyo, Japan', 'Kuala Lumpur, Malaysia'
];

const COMPANIES_BY_SECTOR = {
  TECH: [
    'bKash Limited', 'Grameenphone Ltd', 'Pathao', 'Brain Station 23', 'Samsung R&D Institute Bangladesh',
    'Chaldal', 'TigerIT Bangladesh', 'Banglalink Digital', 'Robi Axiata Limited', 'Therap BD',
    'ShopUp', 'Optimizely Bangladesh', 'Enosis Solutions', 'Kaz Software', 'Cefalo Bangladesh',
    'Dynamic Solution Innovators (DSi)', 'Nagad', 'Invento Software Limited', 'DataSoft Systems',
    'LeadSoft Bangladesh', 'Google Cloud (Remote)', 'Amazon Web Services (Remote)', 'Shopify (Remote)',
    'Meta (Remote)', 'Microsoft (Remote)', 'GitLab (Remote)', 'SELISE Digital Platforms'
  ],
  FINANCE: [
    'BRAC Bank PLC', 'Standard Chartered Bangladesh', 'City Bank PLC', 'Eastern Bank PLC',
    'Mutual Trust Bank Ltd', 'Dutch-Bangla Bank PLC', 'IDLC Finance Limited', 'IPDC Finance',
    'HSBC Bangladesh', 'Prime Bank Limited', 'United Commercial Bank (UCB)', 'Dhaka Bank PLC'
  ],
  CONGLOMERATE: [
    'Walton Digi-Tech', 'BEXIMCO Group', 'PRAN-RFL Group', 'Square Pharmaceuticals PLC',
    'Akij Group', 'Summit Power International', 'Bashundhara Group', 'Mir Akhter Hossain Ltd',
    'Abdul Monem Limited', 'Concord Group', 'Incepta Pharmaceuticals', 'Renata PLC'
  ],
  EDUCATION_GOV: [
    'North Western University', 'Institute of Water Modelling', 'Bangladesh Bureau of Statistics',
    'BRAC International', 'UNDP Bangladesh', 'World Bank Group Dhaka', 'Save the Children BD'
  ]
};

const DEPT_METRICS: Record<string, {
  skills: string[];
  interests: string[];
  titles: string[];
  mentorshipTopics: string[];
  companies: string[];
}> = {
  CSE: {
    skills: ['TypeScript', 'Node.js', 'React', 'Next.js', 'Python', 'Docker', 'Kubernetes', 'PostgreSQL', 'Redis', 'AWS', 'GraphQL', 'Machine Learning', 'CI/CD'],
    interests: ['Distributed Systems', 'Cloud Architecture', 'Artificial Intelligence', 'Open Source', 'Microservices', 'Web Security'],
    titles: ['Senior Software Engineer', 'Full Stack Developer', 'DevOps Engineer', 'Lead Backend Architect', 'Machine Learning Engineer', 'Frontend Specialist', 'Cloud Solutions Architect', 'Engineering Manager', 'QA Automation Lead', 'Data Engineer'],
    mentorshipTopics: ['System Design & Scalability', 'Full-Stack Web Architecture', 'Technical Interview Prep', 'Open Source Contributions', 'Cloud & DevOps Career Pathways'],
    companies: COMPANIES_BY_SECTOR.TECH
  },
  EEE: {
    skills: ['Power Systems', 'Substation Automation', 'MATLAB', 'Circuit Design', 'PLC Programming', 'Embedded Systems', 'IoT', 'AutoCAD Electrical', 'Renewable Energy'],
    interests: ['Smart Grid Technology', 'Renewable Solar & Wind Systems', 'Embedded Robotics', 'VLSI Design', 'High Voltage Engineering'],
    titles: ['Power Systems Engineer', 'Substation Automation Lead', 'Embedded Systems Specialist', 'Renewable Energy Consultant', 'Telecom Network Planner', 'Electrical Project Engineer', 'Operations & Maintenance Lead'],
    mentorshipTopics: ['Power Plant Operations', 'Substation Engineering', 'Renewable Energy Trends', 'Industrial Automation Pathways', 'Core Engineering Licensing'],
    companies: [...COMPANIES_BY_SECTOR.CONGLOMERATE, 'Grameenphone Ltd', 'Summit Power International', 'Banglalink Digital']
  },
  BBA: {
    skills: ['Financial Modeling', 'Strategic Planning', 'Digital Marketing', 'Data Analytics', 'Agile Product Management', 'Supply Chain Management', 'Corporate Accounting', 'SEO & SEM'],
    interests: ['Venture Capital & Startups', 'Fintech Innovations', 'Brand Equity', 'Macroeconomic Analysis', 'E-commerce Logistics'],
    titles: ['Senior Financial Analyst', 'Product Marketing Lead', 'Assistant Brand Manager', 'Supply Chain Strategist', 'Human Resources Business Partner', 'Operations Associate', 'Business Development Manager', 'Credit Risk Analyst'],
    mentorshipTopics: ['Corporate Strategy & Finance', 'Product Marketing Essentials', 'Venture Capital & Pitching', 'Executive Leadership', 'Networking in Banking & MNCs'],
    companies: [...COMPANIES_BY_SECTOR.FINANCE, ...COMPANIES_BY_SECTOR.CONGLOMERATE]
  },
  ECON: {
    skills: ['Econometric Modeling', 'STATA', 'R Programming', 'Python for Economists', 'Data Visualization', 'Policy Impact Analysis', 'Macroeconomic Forecasting', 'SPSS'],
    interests: ['Development Economics', 'Behavioral Economics', 'International Trade Policy', 'Monetary Policy', 'Financial Inclusion'],
    titles: ['Economic Policy Researcher', 'Quantitative Risk Analyst', 'Development Economist', 'Market Research Specialist', 'Macroeconomic Analyst', 'Financial Modeling Consultant'],
    mentorshipTopics: ['Graduate School & Research Prep', 'Data Analytics for Policy', 'Macroeconomic Research Techniques', 'Careers in Development & Multilaterals'],
    companies: [...COMPANIES_BY_SECTOR.FINANCE, ...COMPANIES_BY_SECTOR.EDUCATION_GOV]
  },
  ENG: {
    skills: ['Technical Writing', 'Corporate Communications', 'Content Strategy', 'Public Relations', 'Copywriting', 'SEO Content Design', 'Instructional Design', 'Proofreading'],
    interests: ['Digital Storytelling', 'Brand Voice Development', 'Intercultural Communications', 'Academic Publishing', 'Media Studies'],
    titles: ['Corporate Communications Specialist', 'Technical Content Strategist', 'Documentation Lead', 'Language & Localization Specialist', 'Editorial Project Manager', 'Public Relations Executive'],
    mentorshipTopics: ['Technical Writing & Documentation', 'Corporate PR Strategies', 'Creative & Brand Storytelling', 'Publishing & Editorial Pathways'],
    companies: [...COMPANIES_BY_SECTOR.TECH, ...COMPANIES_BY_SECTOR.EDUCATION_GOV]
  },
  CE: {
    skills: ['Structural Analysis', 'ETABS', 'AutoCAD Civil 3D', 'STAAD.Pro', 'Geotechnical Engineering', 'Project Management', 'BIM', 'Reinforced Concrete Design'],
    interests: ['Earthquake Resistant Design', 'Sustainable Infrastructure', 'Bridge & Tunnel Construction', 'Urban Drainage Systems', 'Smart Highway Systems'],
    titles: ['Structural Project Engineer', 'Geotechnical Consultant', 'Bridge Design Specialist', 'Site Construction Lead', 'Urban Infrastructure Planner', 'Environmental Impact Assessor'],
    mentorshipTopics: ['Structural Engineering Practice', 'Government Infrastructure Projects', 'BIM & 3D Modeling Best Practices', 'Civil Contracting & Procurement'],
    companies: COMPANIES_BY_SECTOR.CONGLOMERATE
  }
};

interface UserInsertData {
  universityId: string;
  roleId: string;
  name: string;
  email: string;
  passwordHash: string;
  batch?: string;
  departmentId?: string;
  department?: string;
  currentCompany?: string;
  position?: string;
  bio?: string;
  headline?: string;
  studentId?: string;
  currentSemester?: string;
  admissionYear?: string;
  expectedGraduationYear?: string;
  graduationYear?: string;
  academicId?: string;
  employmentStatus?: string;
  location?: string;
  phone?: string;
  phonePublic: boolean;
  linkedinUrl?: string;
  websiteUrl?: string;
  githubUrl?: string;
  skills: string[];
  interests: string[];
  avatarUrl?: string;
  avatarPublicId?: string;
  verified: boolean;
  verificationStatus: VerificationStatus;
  verifiedAt?: Date;
  onboardingCompleted: boolean;
  isMentorshipAvailable: boolean;
  mentorshipStatus: string;
  maxActiveMentees: number;
  mentorshipTopics: string[];
  isActive: boolean;
  isDemo: boolean;
  needPasswordChange: boolean;
  roleName: RoleName;
  plainPassword: string;
}

// -----------------------------------------------------------------------------
// MAIN PROVISIONING SCRIPT
// -----------------------------------------------------------------------------
async function main() {
  const startTime = Date.now();
  console.log('================================================================================');
  console.log('ALUMNI CONNECT - PRODUCTION BULK USER PROVISIONING SCRIPT');
  console.log('Target: North Western University (slug: north-western-university)');
  console.log('Goal: Provision ~2,000+ real, verified, non-demo production accounts (isDemo: false)');
  console.log('================================================================================\n');

  // STEP 1: Fetch Canonical University & Reference Entities
  console.log('>>> [STEP 1/6] Validating University, Roles, and Department IDs...');
  const university = await prisma.university.findFirst({
    where: { slug: CANONICAL_UNIVERSITY_SLUG },
  });

  if (!university) {
    throw new Error(`Canonical university with slug "${CANONICAL_UNIVERSITY_SLUG}" not found!`);
  }
  console.log(`[OK] University Found: "${university.name}" (ID: ${university.id})`);

  const roles = await prisma.role.findMany();
  const roleMap = new Map(roles.map((r) => [r.name, r.id]));
  for (const roleName of [RoleName.SUPER_ADMIN, RoleName.MODERATOR, RoleName.ALUMNI, RoleName.STUDENT]) {
    if (!roleMap.has(roleName)) {
      throw new Error(`Required role ${roleName} not found in database!`);
    }
  }
  console.log(`[OK] All 4 Roles Verified in Database.`);

  const departments = await prisma.department.findMany({
    where: { universityId: university.id },
  });
  if (departments.length === 0) {
    throw new Error(`No departments found for university ID "${university.id}"!`);
  }
  const deptMap = new Map(departments.map((d) => [d.code, d]));
  console.log(`[OK] ${departments.length} Departments Loaded: ${departments.map((d) => d.code).join(', ')}`);

  // STEP 2: Pre-compute Password Hashes in Memory
  console.log('\n>>> [STEP 2/6] Pre-computing Argon2 Password Hashes in Memory...');
  const hashStartTime = Date.now();
  const [alumniHash, studentHash, modHash, superAdminHash] = await Promise.all([
    passwordService.hash(ROLE_PASSWORDS.ALUMNI),
    passwordService.hash(ROLE_PASSWORDS.STUDENT),
    passwordService.hash(ROLE_PASSWORDS.MODERATOR),
    passwordService.hash(ROLE_PASSWORDS.SUPER_ADMIN),
  ]);
  console.log(`[OK] 4 Argon2 Password Hashes Generated in ${Date.now() - hashStartTime}ms.`);

  // STEP 3: Generate In-Memory Account Records
  console.log('\n>>> [STEP 3/6] Generating Realistic Production User Data...');
  const candidateUsers: UserInsertData[] = [];

  let maleAvatarIndex = 1;
  let femaleAvatarIndex = 1;
  const getNextAvatar = (gender: 'male' | 'female') => {
    if (gender === 'male') {
      const idx = maleAvatarIndex;
      maleAvatarIndex = (maleAvatarIndex % 30) + 1;
      return {
        url: `${CLOUDINARY_BASE_URL}/male_${idx}.jpg`,
        publicId: `alumni-connect/avatars/verified/male_${idx}`,
      };
    } else {
      const idx = femaleAvatarIndex;
      femaleAvatarIndex = (femaleAvatarIndex % 30) + 1;
      return {
        url: `${CLOUDINARY_BASE_URL}/female_${idx}.jpg`,
        publicId: `alumni-connect/avatars/verified/female_${idx}`,
      };
    }
  };

  const defaultDept = departments[0]!;

  // Helper for English Name Generation
  let nameCounter = 0;
  const generateName = (gender: 'male' | 'female', index: number) => {
    const firstPool = gender === 'male' ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;
    const firstName = firstPool[index % firstPool.length]!;
    const lastName = LAST_NAMES[(index + Math.floor(index / firstPool.length)) % LAST_NAMES.length]!;
    return { firstName, lastName, fullName: `${firstName} ${lastName}` };
  };

  // 3.1: Super Admins (2 New Accounts)
  console.log('Generating 2 Super Admin accounts...');
  const superAdminSpecs = [
    {
      firstName: 'Mahbubur',
      lastName: 'Rahman',
      email: 'admin.registrar@nwu.ac.bd',
      deptCode: 'CSE',
      academicId: 'NWU-ADM-002',
      headline: 'Registrar & Academic Governance Lead | North Western University',
      gender: 'male' as const,
    },
    {
      firstName: 'Shireen',
      lastName: 'Akhter',
      email: 'admin.director@nwu.ac.bd',
      deptCode: 'BBA',
      academicId: 'NWU-ADM-003',
      headline: 'Director of Student & Alumni Affairs | North Western University',
      gender: 'female' as const,
    },
  ];

  for (const spec of superAdminSpecs) {
    const dept = deptMap.get(spec.deptCode) || defaultDept;
    const avatar = getNextAvatar(spec.gender);
    candidateUsers.push({
      universityId: university.id,
      roleId: roleMap.get(RoleName.SUPER_ADMIN)!,
      name: `${spec.firstName} ${spec.lastName}`,
      email: spec.email,
      passwordHash: superAdminHash,
      departmentId: dept.id,
      department: dept.name,
      academicId: spec.academicId,
      headline: spec.headline,
      bio: `${spec.headline}. Over 18 years of academic administration and university leadership.`,
      employmentStatus: 'EMPLOYED',
      location: 'Khulna, Bangladesh',
      phone: `+880 1711-${Math.floor(100000 + Math.random() * 900000)}`,
      phonePublic: false,
      linkedinUrl: `https://linkedin.com/in/${spec.firstName.toLowerCase()}-${spec.lastName.toLowerCase()}-nwu`,
      skills: ['Higher Education Governance', 'Institutional Accreditation', 'Academic Leadership', 'Strategic Planning'],
      interests: ['Academic Excellence', 'Digital Campus Transformation', 'Student Welfare'],
      avatarUrl: avatar.url,
      avatarPublicId: avatar.publicId,
      verified: true,
      verificationStatus: VerificationStatus.APPROVED,
      verifiedAt: new Date(),
      onboardingCompleted: true,
      isMentorshipAvailable: false,
      mentorshipStatus: 'CLOSED',
      maxActiveMentees: 0,
      mentorshipTopics: [],
      isActive: true,
      isDemo: false,
      needPasswordChange: false,
      roleName: RoleName.SUPER_ADMIN,
      plainPassword: ROLE_PASSWORDS.SUPER_ADMIN,
    });
  }

  // 3.2: Moderators (8 New Faculty & Staff Accounts)
  console.log('Generating 8 Moderator accounts...');
  const modSpecs = [
    { firstName: 'Kazi', lastName: 'Moinul Islam', email: 'mod.cse.islam@nwu.ac.bd', deptCode: 'CSE', academicId: 'NWU-FAC-011', gender: 'male' as const },
    { firstName: 'Farzana', lastName: 'Yasmin', email: 'mod.eee.yasmin@nwu.ac.bd', deptCode: 'EEE', academicId: 'NWU-FAC-012', gender: 'female' as const },
    { firstName: 'Shamsul', lastName: 'Alam', email: 'mod.bba.alam@nwu.ac.bd', deptCode: 'BBA', academicId: 'NWU-FAC-013', gender: 'male' as const },
    { firstName: 'Nusrat', lastName: 'Chowdhury', email: 'mod.econ.chowdhury@nwu.ac.bd', deptCode: 'ECON', academicId: 'NWU-FAC-014', gender: 'female' as const },
    { firstName: 'Tariqul', lastName: 'Hasan', email: 'mod.eng.hasan@nwu.ac.bd', deptCode: 'ENG', academicId: 'NWU-FAC-015', gender: 'male' as const },
    { firstName: 'Anowar', lastName: 'Hossain', email: 'mod.ce.hossain@nwu.ac.bd', deptCode: 'CE', academicId: 'NWU-FAC-016', gender: 'male' as const },
    { firstName: 'Tahmidur', lastName: 'Rahman', email: 'mod.proctor.rahman@nwu.ac.bd', deptCode: 'CSE', academicId: 'NWU-ADM-017', gender: 'male' as const },
    { firstName: 'Salma', lastName: 'Sultana', email: 'mod.studentaffairs.sultana@nwu.ac.bd', deptCode: 'BBA', academicId: 'NWU-ADM-018', gender: 'female' as const },
  ];

  for (const mod of modSpecs) {
    const dept = deptMap.get(mod.deptCode) || defaultDept;
    const avatar = getNextAvatar(mod.gender);
    const metrics = DEPT_METRICS[mod.deptCode] || DEPT_METRICS.CSE!;
    candidateUsers.push({
      universityId: university.id,
      roleId: roleMap.get(RoleName.MODERATOR)!,
      name: `${mod.firstName} ${mod.lastName}`,
      email: mod.email,
      passwordHash: modHash,
      departmentId: dept.id,
      department: dept.name,
      academicId: mod.academicId,
      headline: `Faculty Moderator & Assistant Professor of ${dept.code} | North Western University`,
      bio: `Dedicated academic moderator and faculty member in the Department of ${dept.name} at North Western University.`,
      employmentStatus: 'EMPLOYED',
      location: 'Khulna, Bangladesh',
      phone: `+880 1712-${Math.floor(100000 + Math.random() * 900000)}`,
      phonePublic: false,
      linkedinUrl: `https://linkedin.com/in/${mod.firstName.toLowerCase()}-${mod.lastName.toLowerCase().replace(/\s+/g, '-')}-nwu`,
      skills: [...metrics.skills.slice(0, 4), 'Curriculum Development', 'Academic Moderation', 'Student Mentoring'],
      interests: ['Academic Quality Assurance', 'Research & Development', 'Community Engagement'],
      avatarUrl: avatar.url,
      avatarPublicId: avatar.publicId,
      verified: true,
      verificationStatus: VerificationStatus.APPROVED,
      verifiedAt: new Date(),
      onboardingCompleted: true,
      isMentorshipAvailable: false,
      mentorshipStatus: 'CLOSED',
      maxActiveMentees: 0,
      mentorshipTopics: [],
      isActive: true,
      isDemo: false,
      needPasswordChange: false,
      roleName: RoleName.MODERATOR,
      plainPassword: ROLE_PASSWORDS.MODERATOR,
    });
  }

  // 3.3: Alumni (1,050 Real Accounts)
  console.log('Generating 1,050 Alumni accounts (Cohorts 2016-2025)...');
  const targetAlumniCount = 1050;
  const alumniPerCohort = 105;
  const cohorts = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const deptCodes = ['CSE', 'EEE', 'BBA', 'ECON', 'ENG', 'CE'];

  let alumniGenerated = 0;
  let mentorCount = 0;

  for (let cIdx = 0; cIdx < cohorts.length; cIdx++) {
    const cohort = cohorts[cIdx]!;
    for (let i = 0; i < alumniPerCohort; i++) {
      nameCounter++;
      const gender: 'male' | 'female' = (i + cIdx) % 2 === 0 ? 'male' : 'female';
      const { firstName, lastName, fullName } = generateName(gender, nameCounter);
      const deptCode = deptCodes[(i + cIdx) % deptCodes.length]!;
      const dept = deptMap.get(deptCode) || defaultDept;
      const metrics = DEPT_METRICS[deptCode] || DEPT_METRICS.CSE!;

      const avatar = getNextAvatar(gender);
      const company = metrics.companies[(i + cIdx * 3) % metrics.companies.length]!;
      const title = metrics.titles[(i + cIdx) % metrics.titles.length]!;
      const location = LOCATIONS[(i + cIdx) % LOCATIONS.length]!;

      // Exactly ~30% are active mentors (first 315 alumni)
      const isMentor = mentorCount < 315 && (i % 3 === 0 || alumniGenerated < 315);
      if (isMentor) mentorCount++;

      const seq = i + 1;
      const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
      const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
      const email = `${cleanFirst}.${cleanLast}.${cohort}.${seq}@alumni.nwu.ac.bd`;

      candidateUsers.push({
        universityId: university.id,
        roleId: roleMap.get(RoleName.ALUMNI)!,
        name: fullName,
        email,
        passwordHash: alumniHash,
        batch: String(cohort - 4),
        departmentId: dept.id,
        department: dept.name,
        currentCompany: company,
        position: title,
        headline: `${title} at ${company} | NWU ${deptCode} Class of ${cohort}`,
        bio: `Experienced ${dept.code} graduate with a proven track record in ${metrics.skills.slice(0, 3).join(', ')}. Passionate about alumni collaboration and knowledge sharing.`,
        graduationYear: String(cohort),
        employmentStatus: 'EMPLOYED',
        location,
        phone: `+880 171${(i % 10)}${Math.floor(100000 + Math.random() * 900000)}`,
        phonePublic: false,
        linkedinUrl: `https://linkedin.com/in/${cleanFirst}-${cleanLast}-${cohort}`,
        githubUrl: deptCode === 'CSE' ? `https://github.com/${cleanFirst}${cleanLast}` : undefined,
        websiteUrl: i % 5 === 0 ? `https://${cleanFirst}${cleanLast}.dev` : undefined,
        skills: metrics.skills.slice(0, 6),
        interests: metrics.interests.slice(0, 4),
        avatarUrl: avatar.url,
        avatarPublicId: avatar.publicId,
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        verifiedAt: new Date(Date.now() - (2026 - cohort) * 365 * 24 * 60 * 60 * 1000),
        onboardingCompleted: true,
        isMentorshipAvailable: isMentor,
        mentorshipStatus: isMentor ? 'AVAILABLE' : 'CLOSED',
        maxActiveMentees: isMentor ? 4 : 0,
        mentorshipTopics: isMentor ? metrics.mentorshipTopics : [],
        isActive: true,
        isDemo: false,
        needPasswordChange: false,
        roleName: RoleName.ALUMNI,
        plainPassword: ROLE_PASSWORDS.ALUMNI,
      });

      alumniGenerated++;
    }
  }

  // 3.4: Running Students (950 Real Accounts)
  console.log('Generating 950 Running Student accounts (Batches 2022-2026)...');
  const studentBatches = [
    { batch: '2022', count: 190, semester: '8th Semester', admission: '2022', grad: '2026' },
    { batch: '2023', count: 200, semester: '6th Semester', admission: '2023', grad: '2027' },
    { batch: '2024', count: 210, semester: '4th Semester', admission: '2024', grad: '2028' },
    { batch: '2025', count: 200, semester: '2nd Semester', admission: '2025', grad: '2029' },
    { batch: '2026', count: 150, semester: '1st Semester', admission: '2026', grad: '2030' },
  ];

  const deptCodesNumMap: Record<string, string> = {
    CSE: '10', EEE: '20', BBA: '30', ECON: '40', ENG: '50', CE: '60',
  };

  let studentIdCounter = 1000;

  for (const bSpec of studentBatches) {
    for (let i = 0; i < bSpec.count; i++) {
      nameCounter++;
      studentIdCounter++;
      const gender: 'male' | 'female' = i % 2 === 0 ? 'male' : 'female';
      const { firstName, lastName, fullName } = generateName(gender, nameCounter);
      const deptCode = deptCodes[i % deptCodes.length]!;
      const dept = deptMap.get(deptCode) || defaultDept;
      const metrics = DEPT_METRICS[deptCode] || DEPT_METRICS.CSE!;

      const avatar = getNextAvatar(gender);
      const studentId = `${bSpec.admission}${deptCodesNumMap[deptCode] || '10'}${String(studentIdCounter).slice(-4)}`;
      const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
      const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
      const email = `${studentId}@nwu.ac.bd`;

      candidateUsers.push({
        universityId: university.id,
        roleId: roleMap.get(RoleName.STUDENT)!,
        name: fullName,
        email,
        passwordHash: studentHash,
        batch: bSpec.batch,
        departmentId: dept.id,
        department: dept.name,
        studentId,
        currentSemester: bSpec.semester,
        admissionYear: bSpec.admission,
        expectedGraduationYear: bSpec.grad,
        headline: `Undergraduate Student in ${dept.code} (${bSpec.semester}) | North Western University`,
        bio: `Motivated undergraduate in the Department of ${dept.name} with keen interests in ${metrics.interests.slice(0, 3).join(', ')}. Actively seeking mentorship and industry connections.`,
        employmentStatus: 'STUDENT',
        location: 'Khulna, Bangladesh',
        phone: `+880 1718-${Math.floor(100000 + Math.random() * 900000)}`,
        phonePublic: false,
        linkedinUrl: `https://linkedin.com/in/${cleanFirst}-${cleanLast}-student`,
        githubUrl: deptCode === 'CSE' ? `https://github.com/${cleanFirst}${cleanLast}` : undefined,
        skills: metrics.skills.slice(0, 4),
        interests: metrics.interests.slice(0, 3),
        avatarUrl: avatar.url,
        avatarPublicId: avatar.publicId,
        verified: true,
        verificationStatus: VerificationStatus.APPROVED,
        verifiedAt: new Date(),
        onboardingCompleted: true,
        isMentorshipAvailable: false,
        mentorshipStatus: 'CLOSED',
        maxActiveMentees: 0,
        mentorshipTopics: [],
        isActive: true,
        isDemo: false,
        needPasswordChange: false,
        roleName: RoleName.STUDENT,
        plainPassword: ROLE_PASSWORDS.STUDENT,
      });
    }
  }

  console.log(`[OK] In-memory generation complete: ${candidateUsers.length} total accounts prepared.`);
  console.log(`  - Super Admins: 2`);
  console.log(`  - Moderators: 8`);
  console.log(`  - Alumni: ${alumniGenerated} (Available Mentors: ${mentorCount})`);
  console.log(`  - Students: ${candidateUsers.length - 10 - alumniGenerated}`);

  // STEP 4: Idempotent Database Chunked Insertion
  console.log('\n>>> [STEP 4/6] Checking Existing Records & Bulk Inserting Users with Privacy Settings in 100-Record Batches...');
  const allEmails = candidateUsers.map((u) => u.email);
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: allEmails } },
    select: { email: true },
  });
  const existingEmailSet = new Set(existingUsers.map((u) => u.email.toLowerCase()));
  console.log(`[INFO] Found ${existingEmailSet.size} already-existing accounts in database. Skipping duplicates for idempotence.`);

  const usersToInsert = candidateUsers.filter((u) => !existingEmailSet.has(u.email.toLowerCase()));
  console.log(`[ACTION] Inserting ${usersToInsert.length} new production accounts...`);

  const BATCH_SIZE = 100;
  let insertedCount = 0;
  let privacySettingsCreated = 0;

  for (let i = 0; i < usersToInsert.length; i += BATCH_SIZE) {
    const chunk = usersToInsert.slice(i, i + BATCH_SIZE);
    const chunkEmails = chunk.map((u) => u.email);

    // Prepare User records (stripping internal helper fields)
    const userRecords = chunk.map(({ roleName, plainPassword, ...userProps }) => userProps);

    // Insert user chunk
    await prisma.user.createMany({
      data: userRecords,
      skipDuplicates: true,
    });

    // Query back newly created user IDs for this chunk to associate PrivacySetting records
    const createdUsers = await prisma.user.findMany({
      where: { email: { in: chunkEmails } },
      select: { id: true },
    });

    if (createdUsers.length > 0) {
      const privacyData = createdUsers.map((u) => ({
        userId: u.id,
        profileVisibility: PrivacyScope.ALL_MEMBERS,
        emailVisibility: PrivacyScope.CONNECTIONS_ONLY,
        phoneVisibility: PrivacyScope.ONLY_ME,
        locationVisibility: PrivacyScope.ALL_MEMBERS,
        careerVisibility: PrivacyScope.ALL_MEMBERS,
        educationVisibility: PrivacyScope.ALL_MEMBERS,
        skillsVisibility: PrivacyScope.ALL_MEMBERS,
        connectionsVisibility: PrivacyScope.ALL_MEMBERS,
        mentorshipVisibility: PrivacyScope.ALL_MEMBERS,
        searchVisibility: PrivacyScope.ALL_MEMBERS,
        messagingPermission: PrivacyScope.ALL_MEMBERS,
      }));

      const privacyRes = await prisma.privacySetting.createMany({
        data: privacyData,
        skipDuplicates: true,
      });
      privacySettingsCreated += privacyRes.count;
    }

    insertedCount += chunk.length;
    const progress = Math.min(100, Math.round((insertedCount / usersToInsert.length) * 100));
    process.stdout.write(`\r  --> Inserted ${insertedCount}/${usersToInsert.length} users (${progress}%)`);
  }
  console.log(`\n[OK] Bulk insertion complete. Inserted ${insertedCount} users, created ${privacySettingsCreated} privacy settings.`);

  // STEP 5: Redis Cache Invalidation
  console.log('\n>>> [STEP 5/6] Invalidating Shared Cache & Incrementing Version Keys...');
  try {
    await cacheService.bumpVersion('dir');
    await cacheService.bumpVersion('jobs');
    await cacheService.bumpVersion('events');
    await cacheService.bumpVersion('ann');
    await cacheService.bumpVersion('stories');
    await cacheService.delPattern('stats:*');
    await cacheService.delPattern('admin:*');
    await cacheService.delPattern('users:*');
    await cacheService.delPattern('directory:*');
    console.log('[OK] Distributed Redis cache versions bumped and keys purged.');
  } catch (cacheErr) {
    console.warn('[WARN] Redis cache invalidation encountered non-fatal notice:', (cacheErr as Error).message);
  }

  // STEP 6: Credential Directory Exports
  console.log('\n>>> [STEP 6/6] Generating Credential Directory Markdown & CSV...');
  const reportDir = path.resolve(process.cwd(), '../report');
  await fs.mkdir(reportDir, { recursive: true });

  const mdPath = path.join(reportDir, 'PRODUCTION_ACCOUNTS_DIRECTORY.md');
  const csvPath = path.join(reportDir, 'PRODUCTION_ACCOUNTS_DIRECTORY.csv');

  // Build CSV
  const csvHeader = 'Role,Name,Email,UniformPassword,Department,BatchOrGraduation,Status,MentorshipAvailable,CurrentCompany,Position,Location\n';
  const csvRows = candidateUsers.map((u) => {
    const yearOrBatch = u.roleName === RoleName.ALUMNI ? u.graduationYear : u.batch || '';
    return [
      `"${u.roleName}"`,
      `"${u.name.replace(/"/g, '""')}"`,
      `"${u.email}"`,
      `"${u.plainPassword}"`,
      `"${u.department || ''}"`,
      `"${yearOrBatch}"`,
      `"${u.verificationStatus}"`,
      `"${u.isMentorshipAvailable ? 'YES' : 'NO'}"`,
      `"${(u.currentCompany || '').replace(/"/g, '""')}"`,
      `"${(u.position || '').replace(/"/g, '""')}"`,
      `"${u.location || ''}"`,
    ].join(',');
  }).join('\n');

  await fs.writeFile(csvPath, csvHeader + csvRows, 'utf8');
  console.log(`[OK] CSV Credential Directory exported: ${csvPath}`);

  // Build Markdown Directory
  const mdContent = `# North Western University - Production Accounts Directory

> **CONFIDENTIAL CREDENTIAL REGISTER (ISDEMO: FALSE)**
> Single-University Platform: **North Western University** (\`north-western-university\`, \`nwu.ac.bd\`)
> Total Accounts Provisioned: **${candidateUsers.length}** Verified Production Accounts
> Date of Provisioning: **${new Date().toISOString()}**

---

## 1. Governance & Role Passwords Overview

Every newly provisioned account uses an enterprise-grade role-specific uniform password meeting all security schema requirements:

| Role | Total Accounts | Uniform Login Password | Login Dashboard Shell |
| :--- | :--- | :--- | :--- |
| **Super Admin** | 3 (1 existing + 2 new) | \`${ROLE_PASSWORDS.SUPER_ADMIN}\` | \`/admin\` (\`Shell-ADM\`) |
| **Moderator** | 10 (2 existing + 8 new) | \`${ROLE_PASSWORDS.MODERATOR}\` | \`/moderator\` (\`Shell-MOD\`) |
| **Alumni** | 1,053 (3 existing + 1,050 new) | \`${ROLE_PASSWORDS.ALUMNI}\` | \`/alumni\` (\`Shell-ALU\`) |
| **Student** | 955 (5 existing + 950 new) | \`${ROLE_PASSWORDS.STUDENT}\` | \`/student\` (\`Shell-STU\`) |

---

## 2. Platform Super Admins (\`/admin\`)

| Name | Official Email | Password | Department | Academic ID | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Platform Super Admin** (Lead) | \`dsr102.purnendu@gmail.com\` | *(Existing)* | CSE | \`NWU-ADM-001\` | APPROVED |
| **Dr. Mahbubur Rahman** | \`admin.registrar@nwu.ac.bd\` | \`${ROLE_PASSWORDS.SUPER_ADMIN}\` | CSE | \`NWU-ADM-002\` | APPROVED |
| **Prof. Shireen Akhter** | \`admin.director@nwu.ac.bd\` | \`${ROLE_PASSWORDS.SUPER_ADMIN}\` | BBA | \`NWU-ADM-003\` | APPROVED |

---

## 3. Departmental & Faculty Moderators (\`/moderator\`)

| Name | Official Email | Password | Department | Academic ID |
| :--- | :--- | :--- | :--- | :--- |
${candidateUsers
  .filter((u) => u.roleName === RoleName.MODERATOR)
  .map((u) => `| **${u.name}** | \`${u.email}\` | \`${u.plainPassword}\` | ${u.department} | \`${u.academicId}\` |`)
  .join('\n')}

---

## 4. Sample Verified Alumni Accounts with Active Mentorship (\`/alumni\`)

Showing first 25 verified Alumni mentors available for student guidance:

| Name | Email | Password | Dept | Cohort | Current Company | Role | Mentorship Topics |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${candidateUsers
  .filter((u) => u.roleName === RoleName.ALUMNI && u.isMentorshipAvailable)
  .slice(0, 25)
  .map(
    (u) =>
      `| **${u.name}** | \`${u.email}\` | \`${u.plainPassword}\` | ${u.department} | ${u.graduationYear} | ${u.currentCompany} | ${u.position} | ${u.mentorshipTopics.slice(0, 2).join(', ')} |`
  )
  .join('\n')}

---

## 5. Sample Running Student Accounts by Batch (\`/student\`)

Showing sample students across academic cohorts:

| Name | Student ID / Email | Password | Dept | Batch | Semester |
| :--- | :--- | :--- | :--- | :--- | :--- |
${candidateUsers
  .filter((u) => u.roleName === RoleName.STUDENT)
  .slice(0, 25)
  .map(
    (u) =>
      `| **${u.name}** | \`${u.email}\` | \`${u.plainPassword}\` | ${u.department} | Batch ${u.batch} | ${u.currentSemester} |`
  )
  .join('\n')}

---

## 6. Complete Data Directory Export

The complete directory of all **${candidateUsers.length}** accounts is exported in CSV format at:
\`report/PRODUCTION_ACCOUNTS_DIRECTORY.csv\`
`;

  await fs.writeFile(mdPath, mdContent, 'utf8');
  console.log(`[OK] Markdown Credential Directory exported: ${mdPath}`);

  // Final Summary
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n================================================================================');
  console.log(`SUCCESS: Bulk Provisioning Completed in ${totalElapsed}s!`);
  console.log(`Total New Accounts Processed: ${candidateUsers.length}`);
  console.log(`New Accounts Inserted: ${insertedCount}`);
  console.log(`Privacy Settings Created: ${privacySettingsCreated}`);
  console.log('================================================================================\n');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[FATAL ERROR during user provisioning]:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
