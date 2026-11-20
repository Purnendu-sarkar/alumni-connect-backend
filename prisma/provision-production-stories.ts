import { prisma } from '../src/config/database.js';
import { cacheService } from '../src/services/cache/cache.service.js';
import { sanitizeStoryHtml, calculateReadingTime } from '../src/utils/html-sanitizer.js';
import {
  StoryStatus,
  StoryCategory,
  StoryModerationAction,
  ReportStatus,
  AuditResult,
  type Prisma,
} from '../src/generated/prisma/client.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// -----------------------------------------------------------------------------
// CONSTANTS & CONFIGURATION
// -----------------------------------------------------------------------------
const CANONICAL_UNIVERSITY_SLUG = 'north-western-university';
const CANONICAL_UNIVERSITY_NAME = 'North Western University';
const CLOUDINARY_CLOUD_NAME = 'a1dumxpe';

const ROLE_PASSWORDS = {
  SUPER_ADMIN: 'SuperAdminPass@2026!',
  MODERATOR: 'ModeratorPass@2026!',
  ALUMNI: 'AlumniPass@2026!',
  STUDENT: 'StudentPass@2026!',
} as const;

// Helper to delay execution (micro-pause between database chunks)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// -----------------------------------------------------------------------------
// MEDIA POOL ASSETS (25 Covers, 25 Inlines, 6 Videos)
// -----------------------------------------------------------------------------
const COVERS = Array.from({ length: 25 }, (_, i) => ({
  publicId: `alumni-connect/stories/covers/cover_${i + 1}`,
  url: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/alumni-connect/stories/covers/cover_${i + 1}.jpg`,
}));

const INLINES = Array.from({ length: 25 }, (_, i) => ({
  publicId: `alumni-connect/stories/images/inline_${i + 1}`,
  url: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/alumni-connect/stories/images/inline_${i + 1}.jpg`,
}));

const VIDEOS = Array.from({ length: 6 }, (_, i) => ({
  publicId: `alumni-connect/stories/videos/video_${i + 1}`,
  url: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/upload/alumni-connect/stories/videos/video_${i + 1}.mp4`,
}));

// -----------------------------------------------------------------------------
// STORY TOPIC MATRICES & TEMPLATES (100% Pure English)
// -----------------------------------------------------------------------------
interface StoryMetaTemplate {
  title: string;
  category: StoryCategory;
  summary: string;
  tags: string[];
  theme: string;
  milestoneMetric: string;
}

const STORY_DEFINITIONS: StoryMetaTemplate[] = [
  // 1. CAREER_MILESTONE (33 Stories)
  {
    title: 'From NWU Labs to Principal Cloud Architect at Global Fintech',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'A journey of navigating technical leadership, architecting resilient multi-cloud infrastructures, and scaling real-time transaction engines across Southeast Asia.',
    tags: ['CloudArchitecture', 'Fintech', 'CareerGrowth', 'NWUAlumni', 'DistributedSystems'],
    theme: 'Enterprise cloud infrastructure and engineering leadership',
    milestoneMetric: 'Scaled distributed transaction processing to handle over 150,000 transactions per second with 99.999% uptime.',
  },
  {
    title: 'Rising Through the Ranks: Leading Financial Engineering in Corporate Banking',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Navigating syndicated financing, risk modeling, and corporate treasury operations from an entry-level analyst to Vice President.',
    tags: ['Banking', 'Finance', 'Leadership', 'BBA', 'CorporateCredit'],
    theme: 'Corporate banking leadership and financial portfolio governance',
    milestoneMetric: 'Structured and syndicated over $450M in industrial infrastructure financing facilities.',
  },
  {
    title: 'Architecting National Grid Modernization & SCADA Transmission Systems',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'How foundational electrical engineering training translated into modernizing national power transmission networks and digital substations.',
    tags: ['ElectricalEngineering', 'PowerGrid', 'SCADA', 'EEE', 'Infrastructure'],
    theme: 'High-voltage transmission automation and industrial control telemetry',
    milestoneMetric: 'Supervised telemetry integration across 42 high-voltage transmission substations.',
  },
  {
    title: 'Leading Structural Integrity & Mega Bridge Construction Projects',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Overseeing heavy civil engineering, pile foundation testing, and geotechnical stabilization across major river delta infrastructure.',
    tags: ['CivilEngineering', 'StructuralDesign', 'MegaProjects', 'CE', 'Geotechnical'],
    theme: 'Heavy infrastructure engineering and quality assurance standards',
    milestoneMetric: 'Executed concrete strength and seismic compliance inspections across 18km of elevated highway corridors.',
  },
  {
    title: 'Econometric Modeling & Monetary Policy Analysis at Central Banking Institutions',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Translating quantitative economic theory into empirical policy frameworks, inflation forecasting models, and national financial surveillance.',
    tags: ['Economics', 'DataModeling', 'MonetaryPolicy', 'Macroeconomics', 'ECON'],
    theme: 'Macroeconomic surveillance and econometric time-series analysis',
    milestoneMetric: 'Built dynamic stochastic general equilibrium models utilized in quarterly inflation outlook reports.',
  },
  {
    title: 'Bridging Literature and Corporate Communications: Leading Global Brand PR',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Leveraging linguistic precision, narrative clarity, and cross-cultural communication to lead multinational media relations and brand strategy.',
    tags: ['CorporateCommunications', 'PR', 'MediaStrategy', 'English', 'BrandLeadership'],
    theme: 'Strategic communications and enterprise stakeholder alignment',
    milestoneMetric: 'Spearheaded international media campaigns reaching over 12 million readers across 8 regional markets.',
  },
  {
    title: 'Scaling Engineering Operations as VP of Software at High-Growth Logistics Startup',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'The operational playbook for expanding an engineering organization from 8 to 120 engineers while maintaining architectural velocity.',
    tags: ['EngineeringManagement', 'ScaleUp', 'Hiring', 'SoftwareArchitecture', 'CSE'],
    theme: 'People management and developer productivity frameworks',
    milestoneMetric: 'Reduced release cycle times by 70% while growing engineering team size tenfold.',
  },
  {
    title: 'From Graduate Trainee to Chief Financial Officer in Multinational Manufacturing',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Key milestones in mastering working capital optimization, cost accounting, and international supply chain financial controls.',
    tags: ['CFO', 'Manufacturing', 'SupplyChainFinance', 'BBA', 'ExecutiveLeadership'],
    theme: 'Strategic corporate finance and global supply chain accounting',
    milestoneMetric: 'Optimized working capital cycles, unlocking $14M in free cash flow across five production facilities.',
  },
  {
    title: 'Designing Renewable Energy Microgrids for Rural Industrial Complexes',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Engineering hybrid solar-diesel microgrids that ensure reliable 24/7 power for export processing zones.',
    tags: ['RenewableEnergy', 'SolarPV', 'Microgrids', 'EEE', 'Sustainability'],
    theme: 'Industrial clean energy transition and load dispatch balancing',
    milestoneMetric: 'Commissioned 35 MW of rooftop solar installations with synchronized battery energy storage.',
  },
  {
    title: 'Managing Urban Transit Highway Corridors: Seismic Design and Soil Improvement',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Overcoming difficult alluvial soil strata through deep cement mixing and prestressed girder installations.',
    tags: ['CivilEngineering', 'HighwayDesign', 'Geotechnical', 'CE', 'UrbanTransit'],
    theme: 'Urban transport infrastructure and soil mechanical stabilization',
    milestoneMetric: 'Delivered four high-density urban flyovers 3 months ahead of scheduled commercial operation.',
  },
  {
    title: 'International Development & Microfinance Analytics Across Frontier Markets',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Evaluating credit accessibility, financial inclusion metrics, and randomized controlled trial impact assessments.',
    tags: ['DevelopmentEconomics', 'Microfinance', 'ImpactEvaluation', 'ECON', 'Policy'],
    theme: 'Empirical development finance and quantitative social impact analysis',
    milestoneMetric: 'Evaluated micro-credit lending disbursement programs benefiting over 80,000 rural entrepreneurs.',
  },
  {
    title: 'Technical Writing to Enterprise Content Strategy: Directing Documentation Teams',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'How an English graduate built an international career designing developer documentation portals and API guides for SaaS unicorns.',
    tags: ['TechnicalWriting', 'APIDocumentation', 'ContentStrategy', 'ENG', 'DeveloperExperience'],
    theme: 'Developer documentation architectures and information design',
    milestoneMetric: 'Authored and architected documentation portals serving over 1.2M active developers worldwide.',
  },
  {
    title: 'Leading SRE & Zero-Downtime Migration for Millions of Active Banking Users',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'The operational discipline of Site Reliability Engineering: SLA enforcement, chaos testing, and disaster recovery drill orchestration.',
    tags: ['SRE', 'DevOps', 'HighAvailability', 'CSE', 'IncidentManagement'],
    theme: 'Reliability engineering and large-scale fault tolerance',
    milestoneMetric: 'Maintained 99.995% service availability across 4 consecutive calendar quarters.',
  },
  {
    title: 'Navigating Corporate M&A: Due Diligence and Valuation in Emerging Markets',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Structuring cross-border mergers, equity carve-outs, and synergy valuations for venture-backed regional conglomerates.',
    tags: ['MergersAndAcquisitions', 'Valuation', 'PrivateEquity', 'BBA', 'CorporateStrategy'],
    theme: 'Financial due diligence and corporate asset transactions',
    milestoneMetric: 'Advised on strategic merger transactions with combined enterprise valuation exceeding $120M.',
  },
  {
    title: 'Substation Protection Engineering: Relaying Schemes and Fault Diagnosis',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Implementing digital relay protection coordination, IEC 61850 substation bus protocols, and rapid fault clearing.',
    tags: ['PowerSystems', 'RelayProtection', 'IEC61850', 'EEE', 'Automation'],
    theme: 'Protective relaying schemes and electrical grid cybersecurity',
    milestoneMetric: 'Engineered protective coordination schemes preventing wide-area cascade trips across 132kV networks.',
  },
  {
    title: 'Coastal Embankment & Climate Resilient River Bank Protection Engineering',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Combating river erosion and seasonal storm surges through geo-textile filter revetment and hydrodynamic modeling.',
    tags: ['WaterResources', 'CoastalEngineering', 'FloodProtection', 'CE', 'ClimateResilience'],
    theme: 'Hydraulic structures and deltaic coastal protection',
    milestoneMetric: 'Constructed 24km of reinforced earthen dykes protecting 45,000 coastal households.',
  },
  {
    title: 'Quantitative Trading Strategy & Algorithmic Market Making in FX Markets',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Applying statistical arbitrage, liquidity modeling, and automated order execution systems in institutional currency markets.',
    tags: ['QuantitativeFinance', 'AlgoTrading', 'ForeignExchange', 'ECON', 'DataScience'],
    theme: 'Algorithmic market microstructure and financial statistical models',
    milestoneMetric: 'Engineered automated execution algorithms executing over $80M in daily currency turnover.',
  },
  {
    title: 'Publishing, Localization, and Academic Editing: Leading Educational Presses',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Directing curriculum development, pedagogical translations, and quality peer-review editorial boards for higher education texts.',
    tags: ['Publishing', 'AcademicEditing', 'Localization', 'ENG', 'HigherEducation'],
    theme: 'Educational publishing governance and editorial excellence',
    milestoneMetric: 'Published 45 peer-reviewed university textbooks adopted across 14 national universities.',
  },
  {
    title: 'Principal Security Architect: Securing Multi-Tenant Cloud Environments',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Zero-trust architecture implementation, SOC 2 compliance certifications, and proactive vulnerability red-teaming.',
    tags: ['Cybersecurity', 'ZeroTrust', 'CloudSecurity', 'CSE', 'Compliance'],
    theme: 'Enterprise information security and cryptographic policy enforcement',
    milestoneMetric: 'Achieved automated compliance validation across 4,500 cloud infrastructure assets.',
  },
  {
    title: 'Human Resource Transformation: Building Talent Pipelines in Modern Enterprises',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'From administrative personnel management to strategic people operations, OKR alignment, and retention engineering.',
    tags: ['PeopleOperations', 'HumanResources', 'TalentAcquisition', 'BBA', 'Culture'],
    theme: 'Enterprise organizational design and competency frameworks',
    milestoneMetric: 'Reduced annual key-talent voluntary attrition from 24% down to under 8%.',
  },
  {
    title: 'Industrial Automation & PLC Commissioning in Advanced Pharmaceutical Facilities',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Designing Cleanroom SCADA systems, batch process controllers, and FDA 21 CFR Part 11 validation protocols.',
    tags: ['Automation', 'PLC', 'PharmaEngineering', 'EEE', 'SCADA'],
    theme: 'Pharmaceutical process control and compliant automation architectures',
    milestoneMetric: 'Commissioned fully automated sterile manufacturing lines complying with US FDA standards.',
  },
  {
    title: 'Structural Health Monitoring of Commercial High-Rise Towers Using Sensor Telemetry',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Deploying accelerometers, strain gauges, and fiber optic sensors to track building vibration and structural deflection.',
    tags: ['StructuralHealth', 'Sensors', 'CivilEngineering', 'CE', 'SmartStructures'],
    theme: 'Non-destructive testing and real-time structural telemetry',
    milestoneMetric: 'Installed continuous real-time modal analysis networks across 3 commercial skyscrapers.',
  },
  {
    title: 'Macro-Fiscal Analysis & Sovereign Debt Sustainability Modeling',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Evaluating national fiscal deficit trajectories, revenue mobilization strategies, and medium-term expenditure frameworks.',
    tags: ['PublicFinance', 'FiscalPolicy', 'SovereignDebt', 'ECON', 'Governance'],
    theme: 'Public financial management and fiscal sustainability analysis',
    milestoneMetric: 'Contributed to comprehensive public expenditure review frameworks for international funding agencies.',
  },
  {
    title: 'Cross-Cultural Corporate Training & Executive Speech Coaching',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Preparing C-suite executives for international board presentations, investor pitches, and media panel appearances.',
    tags: ['ExecutiveCoaching', 'Communications', 'SpeechWriting', 'ENG', 'Leadership'],
    theme: 'Executive verbal presence and rhetorical strategy',
    milestoneMetric: 'Trained over 200 corporate leaders across technology, manufacturing, and financial services.',
  },
  {
    title: 'Engineering Director: Orchestrating Global Open-Source Developer Communities',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Fostering inclusive open-source contributions, technical steering committee governance, and release management at scale.',
    tags: ['OpenSource', 'DevRel', 'CommunityGovernance', 'CSE', 'DistributedSystems'],
    theme: 'Open-source software stewardship and global developer ecosystems',
    milestoneMetric: 'Governed foundational frameworks supporting over 400,000 active downstream repository builds.',
  },
  {
    title: 'Supply Chain Optimization & Cold Storage Logistics in FMCG Conglomerates',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Implementing automated warehouse management systems, demand forecasting algorithms, and route optimization fleets.',
    tags: ['SupplyChain', 'Logistics', 'FMCG', 'BBA', 'OperationsManagement'],
    theme: 'Cold chain integrity and distribution route modeling',
    milestoneMetric: 'Reduced spoilage rates by 42% while shrinking delivery lead times from 48 to 18 hours.',
  },
  {
    title: 'High-Voltage Switchgear Engineering and Substation GIS Installation',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Supervising gas-insulated switchgear (GIS) installations, SF6 gas handling, and partial discharge acoustic testing.',
    tags: ['HighVoltage', 'GISSwitchgear', 'PowerEngineering', 'EEE', 'Substations'],
    theme: 'Gas-insulated switchgear design and electrical insulation diagnostics',
    milestoneMetric: 'Completed testing and energization of a 230/132kV urban compact GIS substation.',
  },
  {
    title: 'Water Treatment Plant Engineering & Environmental Impact Assessment',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Designing high-capacity municipal surface water treatment works, rapid sand filtration, and sludge dewatering facilities.',
    tags: ['EnvironmentalEngineering', 'WaterTreatment', 'CivilEngineering', 'CE', 'Sanitation'],
    theme: 'Municipal water resource purification and environmental engineering',
    milestoneMetric: 'Designed biological treatment facilities supplying potable water to 350,000 municipal residents.',
  },
  {
    title: 'Behavioral Economics & Consumer Decision Architecture in E-Commerce',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Testing nudge theory, pricing transparency experiments, and conversion funnel optimization using randomized A/B tests.',
    tags: ['BehavioralEconomics', 'ConsumerPsychology', 'ABTesting', 'ECON', 'ECommerce'],
    theme: 'Empirical consumer behavior and choice architecture experiments',
    milestoneMetric: 'Implemented personalized pricing nudges increasing checkout conversion velocity by 18%.',
  },
  {
    title: 'Digital Humanities & Literary Heritage Archiving in the Era of AI',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Digitizing historical university manuscripts, applying OCR for rare prints, and creating searchable open-access knowledge bases.',
    tags: ['DigitalHumanities', 'ArchivalScience', 'Linguistics', 'ENG', 'OpenAccess'],
    theme: 'Cultural preservation technologies and textual corpus analysis',
    milestoneMetric: 'Curated and published open digital archives comprising over 25,000 historical documents.',
  },
  {
    title: 'Database Reliability Engineer: Managing Sharded Multi-Petabyte Clusters',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Partitioning PostgreSQL topologies, automating WAL backup verification, and optimizing memory access under heavy write loads.',
    tags: ['PostgreSQL', 'DatabaseReliability', 'PerformanceTuning', 'CSE', 'DistributedData'],
    theme: 'Relational database scaling and disaster recovery orchestration',
    milestoneMetric: 'Maintained query p99 latency below 12 milliseconds across 14 TB of relational application data.',
  },
  {
    title: 'Enterprise Risk Management: Basel III Compliance & Stress Testing',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Developing macroeconomic stress testing scenarios, liquidity coverage ratios (LCR), and capital adequacy compliance models.',
    tags: ['RiskManagement', 'BaselIII', 'RegulatoryCompliance', 'BBA', 'Banking'],
    theme: 'Institutional risk governance and statutory banking compliance',
    milestoneMetric: 'Engineered capital calculation engines validated by national banking regulatory inspectors.',
  },
  {
    title: 'Renewable Hybrid Power Systems for Off-Grid Telecom Towers',
    category: StoryCategory.CAREER_MILESTONE,
    summary: 'Replacing diesel generators with hybrid lithium-ion battery and solar PV systems across 200 remote cellular base stations.',
    tags: ['TelecomPower', 'CleanEnergy', 'BatteryStorage', 'EEE', 'Sustainability'],
    theme: 'Remote infrastructure electrification and green telecommunications',
    milestoneMetric: 'Cut cellular tower operational diesel emissions by 68% across remote regional sites.',
  },

  // 2. ENTREPRENEURSHIP (25 Stories)
  {
    title: 'Bootstrapping a Cloud-Native B2B SaaS Platform from Khulna to the World',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'How three NWU alumni founded an enterprise workflow automation software company that now serves customers across 24 countries.',
    tags: ['Startup', 'Bootstrapping', 'SaaS', 'FounderJourney', 'CSE'],
    theme: 'Software venture creation, product-market fit, and remote revenue generation',
    milestoneMetric: 'Achieved $1.8M Annual Recurring Revenue (ARR) within 36 months of founding without external venture dilution.',
  },
  {
    title: 'Launching a Sustainable Agro-Commodities Export Venture',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Connecting regional organic shrimp and agricultural farmers directly to international European fair-trade distribution chains.',
    tags: ['AgriBusiness', 'ExportTrade', 'SupplyChain', 'BBA', 'SocialImpact'],
    theme: 'Sustainable export entrepreneurship and fair-trade farmer collectives',
    milestoneMetric: 'Exported over 450 metric tons of certified organic produce generating $3.2M in annual export earnings.',
  },
  {
    title: 'Founding an IoT Industrial Telemetry & Hardware Manufacturing Firm',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Designing custom printed circuit boards, firmware, and wireless sensory nodes for domestic textile and energy factories.',
    tags: ['HardwareStartup', 'IoT', 'IndustrialTech', 'EEE', 'Manufacturing'],
    theme: 'Hardware product engineering, domestic prototyping, and factory deployment',
    milestoneMetric: 'Manufactured and installed 15,000 industrial energy monitoring nodes across 120 factories.',
  },
  {
    title: 'Building a Full-Service Geotechnical Survey & Civil Consultancy',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'From one rotary drill rig to a premier soil mechanics laboratory conducting standard penetration and seismic cross-hole tests.',
    tags: ['CivilConsultancy', 'GeotechnicalEngineering', 'BusinessGrowth', 'CE', 'Entrepreneurship'],
    theme: 'Professional engineering services, laboratory accreditation, and project delivery',
    milestoneMetric: 'Conducted sub-soil investigations for over 250 multistory commercial and industrial developments.',
  },
  {
    title: 'Creating an Economic Research & Data Analytics Consultancy',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Providing independent market intelligence, consumer price index tracking, and trade feasibility studies to development partners.',
    tags: ['Consulting', 'DataAnalytics', 'EconomicResearch', 'ECON', 'Startup'],
    theme: 'Boutique economics consulting and evidence-based policy research',
    milestoneMetric: 'Completed 60+ institutional market studies commissioned by multilateral development banks.',
  },
  {
    title: 'Founding an EdTech Content Studio & English Language Academy',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Empowering thousands of university students with professional IELTS preparation, business communication, and interview coaching.',
    tags: ['EdTech', 'LanguageLearning', 'EnglishEducation', 'ENG', 'FounderJourney'],
    theme: 'Digital education platforms, curriculum design, and student empowerment',
    milestoneMetric: 'Trained over 35,000 registered learners with an 88% exam band improvement rate.',
  },
  {
    title: 'From College Idea to Nationwide On-Demand Logistics Network',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Solving the last-mile logistics bottleneck across secondary cities through a proprietary driver routing and dispatch mobile app.',
    tags: ['LogisticsTech', 'HyperlocalDelivery', 'MobileApps', 'CSE', 'VentureCapital'],
    theme: 'Platform business models and algorithmically dispatched delivery operations',
    milestoneMetric: 'Dispatched over 2.5 million parcels while providing steady income to 1,200 motorcycle couriers.',
  },
  {
    title: 'Pioneering Eco-Friendly Construction Materials: Green Concrete Blocks',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Commercializing fly-ash compressed hollow blocks to eliminate topsoil depletion from traditional brick kilns.',
    tags: ['GreenBuilding', 'SustainableMaterials', 'CivilEngineering', 'CE', 'Manufacturing'],
    theme: 'Sustainable manufacturing, environmental compliance, and commercial adoption',
    milestoneMetric: 'Supplied 12 million eco-friendly hollow blocks, replacing traditional kiln bricks and preventing 4,000 tons of CO2.',
  },
  {
    title: 'Building a Solar Rooftop EPC Company: Financing Clean Power for Industry',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Structuring OPEX and CAPEX commercial solar installations that reduce factory grid electricity bills by up to 35%.',
    tags: ['SolarEPC', 'RenewableEnergy', 'CleanTech', 'EEE', 'BusinessDevelopment'],
    theme: 'Engineering procurement construction and clean energy contract management',
    milestoneMetric: 'Installed a cumulative 48 MWp of industrial rooftop solar power systems.',
  },
  {
    title: 'Bootstrapping a Digital Marketing & Growth Hacking Agency',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Scaling performance marketing campaigns, customer acquisition funnels, and programmatic advertising for direct-to-consumer brands.',
    tags: ['DigitalMarketing', 'GrowthHacking', 'ECommerce', 'BBA', 'AgencyLife'],
    theme: 'Data-driven marketing agencies and performance attribution modeling',
    milestoneMetric: 'Managed $6M+ in annual ad spend, delivering an average 4.2x verified return on ad spend (ROAS).',
  },
  {
    title: 'Fintech Inclusion: Building an Agent-Banking Digital Network for Rural Artisans',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Deploying point-of-sale micro-banking kiosks in remote coastal villages, enabling savings accounts and bill settlements.',
    tags: ['Fintech', 'FinancialInclusion', 'AgentBanking', 'ECON', 'SocialVenture'],
    theme: 'Branchless banking infrastructure and grassroots liquidity management',
    milestoneMetric: 'Processed $28M in annual micro-transactions across 180 rural touchpoints.',
  },
  {
    title: 'Launching a Creative Design & UI/UX Consultancy for Silicon Valley Startups',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'How a remote team of designers and front-end developers secured contracts with Y-Combinator and Techstars portfolio firms.',
    tags: ['UIUX', 'DesignStudio', 'RemoteWork', 'CSE', 'GlobalAgency'],
    theme: 'Remote product design agencies and cross-border client acquisition',
    milestoneMetric: 'Designed flagship applications for 32 venture-backed startups with over $80M in combined capital.',
  },
  {
    title: 'Founding a Commercial Testing Laboratory for Structural Steels and Aggregates',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Establishing an ISO/IEC 17025 accredited materials testing laboratory to serve government highway and bridge contractors.',
    tags: ['MaterialsTesting', 'QualityControl', 'CivilEngineering', 'CE', 'Accreditation'],
    theme: 'Laboratory quality management systems and construction material diagnostics',
    milestoneMetric: 'Issued over 8,500 certified test reports for major national infrastructure projects.',
  },
  {
    title: 'Creating an Open-Source Security Audit and Penetration Testing Firm',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Conducting smart contract audits, web penetration testing, and ethical hacking assessments for international decentralized finance apps.',
    tags: ['Cybersecurity', 'PenTesting', 'SmartContracts', 'CSE', 'TechConsulting'],
    theme: 'Information security consulting and automated vulnerability fuzzing',
    milestoneMetric: 'Identified and remediated 140+ critical zero-day vulnerabilities across client software.',
  },
  {
    title: 'Specialty Coffee & Urban Social Spaces: Entrepreneurship in Hospitality',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Transforming a passion for artisanal coffee into a three-branch urban cafe and community co-working hub.',
    tags: ['Hospitality', 'UrbanCulture', 'CommunitySpace', 'BBA', 'BrandBuilding'],
    theme: 'Retail hospitality operations, direct sourcing, and brand identity design',
    milestoneMetric: 'Served over 180,000 customers while hosting 90+ cultural and tech meetups.',
  },
  {
    title: 'Commercializing EV Powertrains for Electric Three-Wheelers',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Retrofitting indigenous low-speed transit vehicles with smart brushless DC motors, regenerative braking, and lithium battery packs.',
    tags: ['ElectricVehicles', 'BLDCMotors', 'BatteryTechnology', 'EEE', 'GreenMobility'],
    theme: 'E-mobility hardware engineering and circular transport economics',
    milestoneMetric: 'Converted 1,400 commercial three-wheelers, saving 350,000 liters of fossil fuel annually.',
  },
  {
    title: 'Establishing a Translation & Cross-Border Document Certification Firm',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Providing sworn legal translations, embassy document attestation, and multilingual technical manuals for international trade.',
    tags: ['Translation', 'LegalServices', 'CrossBorderTrade', 'ENG', 'Enterprise'],
    theme: 'Legal translation precision and diplomatic documentation governance',
    milestoneMetric: 'Translated and certified legal documentation for 4,200 international corporate and immigration cases.',
  },
  {
    title: 'Founding a Precision Agriculture Drone Surveying Company',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Utilizing multispectral drone imagery to calculate normalized difference vegetation index (NDVI) for industrial crop yield prediction.',
    tags: ['AgriTech', 'Drones', 'RemoteSensing', 'CSE', 'DataScience'],
    theme: 'Unmanned aerial vehicle telemetry and agricultural crop health monitoring',
    milestoneMetric: 'Surveyed 65,000 acres of commercial farmland, reducing pesticide application waste by 30%.',
  },
  {
    title: 'Prefabricated Steel Building & Industrial Shed Fabrication Venture',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Engineering pre-engineered steel buildings (PEB) with computerized CNC beam fabrication for modern logistics parks.',
    tags: ['Prefabrication', 'SteelStructures', 'IndustrialBuildings', 'CE', 'Manufacturing'],
    theme: 'Pre-engineered building structural design and rapid industrial erection',
    milestoneMetric: 'Fabricated and erected over 1.2 million square feet of clear-span industrial warehouse facilities.',
  },
  {
    title: 'Building a Healthcare Teleconsultation App for Secondary Towns',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Connecting specialized tertiary hospital physicians in the capital with patients in district towns via low-bandwidth video consultation.',
    tags: ['HealthTech', 'Telemedicine', 'MobileHealth', 'CSE', 'SocialImpact'],
    theme: 'Digital health infrastructure and WebRTC video streaming over erratic networks',
    milestoneMetric: 'Facilitated 125,000 doctor-patient teleconsultations with a 94% patient satisfaction index.',
  },
  {
    title: 'Waste-to-Resource: Industrial Organic Composting & Bio-Fertilizer Production',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Diverting municipal market vegetable waste into enriched organic soil conditioners with microbial innoculants.',
    tags: ['CircularEconomy', 'WasteManagement', 'BioFertilizer', 'ECON', 'Sustainability'],
    theme: 'Municipal organic waste diversion and circular chemical economics',
    milestoneMetric: 'Diverted 8,500 metric tons of organic landfill waste into premium agricultural compost.',
  },
  {
    title: 'Industrial Electrical Panel Board Manufacturing & Switchboard Assembly',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Designing type-tested motor control centers (MCC) and low-voltage distribution switchgear complying with IEC 61439 standards.',
    tags: ['Switchgear', 'PanelBuilding', 'IndustrialPower', 'EEE', 'Manufacturing'],
    theme: 'Low-voltage electrical panel assembly and busbar thermal design',
    milestoneMetric: 'Supplied custom motor control centers to 45 commercial spinning and jute processing mills.',
  },
  {
    title: 'Boutique Accounting & Tax Compliance Advisory for Tech Startups',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Helping emerging tech ventures navigate withholding tax rules, transfer pricing compliance, and investor-ready capitalization tables.',
    tags: ['Taxation', 'CorporateGovernance', 'Accounting', 'BBA', 'StartupAdvisory'],
    theme: 'Corporate statutory taxation and startup financial infrastructure',
    milestoneMetric: 'Structured compliance and corporate tax filings for 85 high-growth software enterprises.',
  },
  {
    title: 'Building an Audio Storytelling & Regional Voice Studio',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Producing high-fidelity audiobooks, podcasts, and sound design for regional literature and educational media.',
    tags: ['AudioProduction', 'Podcasting', 'Storytelling', 'ENG', 'CreativeIndustry'],
    theme: 'Digital audio production, acoustic mastering, and voice talent management',
    milestoneMetric: 'Produced 450 hours of licensed audiobook content distributed on global streaming services.',
  },
  {
    title: 'Custom Hydro-Met Data Loggers for Disaster Early Warning Systems',
    category: StoryCategory.ENTREPRENEURSHIP,
    summary: 'Developing solar-powered GSM water level recorders deployed along tidal rivers for community storm surge alerts.',
    tags: ['DisasterManagement', 'Hydrology', 'EmbeddedSystems', 'CE', 'EEE'],
    theme: 'Environmental sensor networks and telemetry for disaster risk reduction',
    milestoneMetric: 'Deployed 60 early-warning water level stations protecting 12 coastal upazilas.',
  },

  // 3. TECH_INNOVATION (25 Stories)
  {
    title: 'Handling 100,000 Orders/Min: Re-Engineering E-Commerce Flash Sale Architecture',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Designing high-throughput event queues with Apache Kafka, Redis cluster cache locks, and optimistic inventory decrements.',
    tags: ['DistributedSystems', 'Kafka', 'Redis', 'HighConcurrency', 'CSE'],
    theme: 'Flash sale transaction architecture and cache concurrency mitigation',
    milestoneMetric: 'Eliminated inventory over-allocation under peak traffic of 120,000 requests per second.',
  },
  {
    title: 'Smart Inverter Design with Integrated Maximum Power Point Tracking (MPPT)',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Designing a 98.4% efficient solar power inverter using silicon carbide MOSFETs and fast perturb-and-observe digital algorithms.',
    tags: ['PowerElectronics', 'MPPT', 'InverterDesign', 'EEE', 'HardwareInnovation'],
    theme: 'Wide bandgap semiconductors and high-frequency power electronics',
    milestoneMetric: 'Attained 98.4% European efficiency certification for indigenous solar inverters.',
  },
  {
    title: 'Finite Element Modeling for Earthquake-Resistant Soft-Story Buildings',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Applying non-linear dynamic time-history analysis to retrofit open ground-floor parking columns against catastrophic seismic shear failure.',
    tags: ['SeismicDesign', 'FiniteElementAnalysis', 'StructuralEngineering', 'CE', 'Retrofitting'],
    theme: 'Non-linear dynamic structural analysis and seismic retrofitting',
    milestoneMetric: 'Retrofit designs validated to withstand seismic base shear acceleration up to 0.28g.',
  },
  {
    title: 'Automated Loan Underwriting Using Gradient Boosting & Machine Learning',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Deploying XGBoost and LightGBM models to predict retail credit default risk using alternative telco and utility payment records.',
    tags: ['MachineLearning', 'CreditScoring', 'PredictiveAnalytics', 'ECON', 'Fintech'],
    theme: 'Supervised predictive modeling and algorithmic bias mitigation in credit risk',
    milestoneMetric: 'Reduced credit assessment turnaround time from 5 business days down to 4 minutes.',
  },
  {
    title: 'Natural Language Processing for Low-Resource Vernacular Sentiment Analysis',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Fine-tuning transformer models (BanglaBERT) for automated customer service routing and social sentiment extraction.',
    tags: ['NLP', 'Transformers', 'DeepLearning', 'CSE', 'Linguistics'],
    theme: 'Transfer learning, tokenization, and transformer architectures for regional languages',
    milestoneMetric: 'Achieved 93.6% F1-score on customer intent classification across 200,000 conversational corpora.',
  },
  {
    title: 'Zero-Downtime Database Architecture: Active-Active Multi-Region Replication',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Overcoming split-brain hazards and conflict-free replicated data types (CRDT) across distributed cloud regions.',
    tags: ['Databases', 'HighAvailability', 'CRDT', 'CloudArchitecture', 'CSE'],
    theme: 'Distributed database consensus and conflict-free multi-region synchronization',
    milestoneMetric: 'Reduced cross-continent database replication lag to under 85 milliseconds.',
  },
  {
    title: 'Real-Time Edge Computer Vision for Industrial Defect Detection in Textiles',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Deploying YOLOv8 models onto NVIDIA Jetson edge accelerators to identify weaving anomalies and fabric discolorations at 60 FPS.',
    tags: ['ComputerVision', 'EdgeAI', 'TextileManufacturing', 'CSE', 'EEE'],
    theme: 'Edge accelerated inference and high-speed automated optical inspection',
    milestoneMetric: 'Detected fabric defects down to 0.4mm at production line speeds of 45 meters per minute.',
  },
  {
    title: 'Design and Implementation of Low-Cost IoT River Salinity Sensor Probes',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Combating sensor corrosion in brackish coastal waters through four-electrode conductivity telemetry and automatic anti-fouling cycles.',
    tags: ['IoT', 'EnvironmentalSensors', 'WaterQuality', 'EEE', 'CE'],
    theme: 'Electrochemical sensor design and long-range LoRaWAN telemetry',
    milestoneMetric: 'Operated submerged sensor networks continuously for 18 months without electrode drift.',
  },
  {
    title: 'BIM-Driven Clash Detection & 4D Construction Schedule Simulation',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Integrating Revit, Navisworks, and Primavera P6 to detect 1,400+ MEP and structural clashes prior to concrete casting.',
    tags: ['BIM', '4DPlanning', 'ClashDetection', 'CivilEngineering', 'CE'],
    theme: 'Building Information Modeling and virtual construction coordination',
    milestoneMetric: 'Saved an estimated $320,000 in physical rework by resolving spatial clashes virtually.',
  },
  {
    title: 'Agent-Based Microeconomic Simulation of Urban Transport Congestion Pricing',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Simulating commuter elasticity and dynamic peak-hour road tolling across 50,000 synthetic commuters in capital transit corridors.',
    tags: ['AgentBasedModeling', 'TransportEconomics', 'UrbanPlanning', 'ECON', 'Simulation'],
    theme: 'Computational microeconomics and dynamic pricing equilibrium',
    milestoneMetric: 'Model validated optimal congestion toll schedules predicted to reduce peak gridlock by 22%.',
  },
  {
    title: 'Microservices Decomposition: Migrating a Monolithic Enterprise Core to gRPC',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'The technical blueprint for carving out bounded contexts from a 12-year-old Java monolith into high-speed Go services.',
    tags: ['Microservices', 'gRPC', 'SoftwareArchitecture', 'BackendEngineering', 'CSE'],
    theme: 'Domain-driven design and binary serialization protocol optimization',
    milestoneMetric: 'Reduced intra-service payload latency by 65% and cut CPU utilization in half.',
  },
  {
    title: 'DSP-Based Active Noise Cancellation for Heavy Industrial Turbine Rooms',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Implementing filtered-X least mean squares (FxLMS) algorithms on dedicated Texas Instruments digital signal processors.',
    tags: ['SignalProcessing', 'ActiveNoiseControl', 'DSP', 'EEE', 'Acoustics'],
    theme: 'Adaptive digital filtering and real-time acoustic phase cancellation',
    milestoneMetric: 'Achieved 14 dB sound pressure level attenuation in low-frequency turbine room environments.',
  },
  {
    title: 'Self-Compacting Concrete (SCC) Formulations Using Ground Granulated Blast Slag',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Optimizing polycarboxylate ether superplasticizer dosages to achieve slump flows of 720mm without aggregate segregation.',
    tags: ['ConcreteTechnology', 'MaterialsScience', 'CivilEngineering', 'CE', 'Innovation'],
    theme: 'Rheology of high-performance cementitious pastes and heavy industrial casting',
    milestoneMetric: 'Achieved 60 MPa compressive strength at 28 days with zero mechanical vibration required.',
  },
  {
    title: 'Algorithmic Liquidity Pooling & Automated Market Maker (AMM) Invariance',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Mathematical formulation of constant-product invariant curves with concentrated liquidity tick allocations.',
    tags: ['FinancialMath', 'AMM', 'LiquidityModeling', 'ECON', 'Blockchain'],
    theme: 'Decentralized exchange mechanics and mathematical slippage curves',
    milestoneMetric: 'Designed liquidity algorithms providing 3x capital efficiency over conventional constant product pools.',
  },
  {
    title: 'Next-Generation Web Performance: Streaming SSR and Edge CDN Computing',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Architecting web applications with Next.js App Router, React Server Components, and Cloudflare Workers to achieve sub-second TTFB globally.',
    tags: ['WebPerformance', 'Nextjs', 'EdgeComputing', 'CSE', 'FrontendArchitecture'],
    theme: 'Modern streaming server rendering and edge-computed asset pipelines',
    milestoneMetric: 'Achieved 100/100 Core Web Vitals across both mobile and desktop international endpoints.',
  },
  {
    title: 'Substation Telemetry Over LoRaWAN: Long-Range Low-Power Grid Monitoring',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Deploying sub-GHz wireless transceivers to collect transformer oil temperatures and busbar vibration without cellular SIM cards.',
    tags: ['LoRaWAN', 'GridTelemetry', 'SmartGrid', 'EEE', 'WirelessTech'],
    theme: 'Sub-gigahertz spread-spectrum RF transmission in high electromagnetic interference zones',
    milestoneMetric: 'Maintained 99.8% packet delivery ratio across a 12-kilometer non-line-of-sight industrial corridor.',
  },
  {
    title: 'Geographic Information Systems (GIS) for Urban Flood Evacuation Routing',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Combining digital elevation models (DEM) with network analysis algorithms to calculate safe flood rescue routes in real time.',
    tags: ['GIS', 'FloodModeling', 'DisasterResilience', 'CE', 'SpatialAnalytics'],
    theme: 'Spatial multi-criteria decision analysis and hydrodynamic inundation simulation',
    milestoneMetric: 'Reduced modeled disaster evacuation travel times by 38% for high-vulnerability coastal communities.',
  },
  {
    title: 'Semantic Search Engine for Academic Theses Using Vector Embeddings',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Building a vector retrieval system using pgvector, HNSW indexing, and hybrid BM25 lexical ranking for institutional research archives.',
    tags: ['VectorSearch', 'pgvector', 'InformationRetrieval', 'CSE', 'ENG'],
    theme: 'Dense vector retrieval and hybrid lexical-semantic relevance ranking',
    milestoneMetric: 'Indexed 45,000 academic research papers with mean query response times under 40 milliseconds.',
  },
  {
    title: 'High-Speed Battery Management Systems (BMS) with Active Cell Balancing',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Designing bidirectional flyback converters to equalize energy across 96 series-connected lithium iron phosphate (LiFePO4) battery cells.',
    tags: ['BatteryManagement', 'PowerElectronics', 'EVTech', 'EEE', 'EnergyStorage'],
    theme: 'Active charge shuttling topologies and state-of-charge Kalman filtering',
    milestoneMetric: 'Extended high-capacity lithium battery operational life cycle by 24% under harsh tropical ambient temperatures.',
  },
  {
    title: 'Automated Code Review Assistant Using Domain-Specialized Large Language Models',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Integrating static AST analysis with LLM prompt chains to catch security vulnerabilities and styling drifts during GitHub PR checks.',
    tags: ['GenerativeAI', 'DevTools', 'CodeQuality', 'CSE', 'DeveloperProductivity'],
    theme: 'Static code analysis integration with LLM semantic reasoning engines',
    milestoneMetric: 'Automated 42% of routine pull-request code reviews across an enterprise engineering org.',
  },
  {
    title: 'Prestressed Concrete Bridge Girder Optimization: Carbon Footprint Reduction',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Optimizing post-tensioned tendon profiling and high-strength concrete mixes to reduce raw Portland cement volume in bridge spans.',
    tags: ['PrestressedConcrete', 'BridgeEngineering', 'CarbonReduction', 'CE', 'Sustainability'],
    theme: 'Post-tensioning layout optimization and embodied carbon minimization',
    milestoneMetric: 'Reduced embodied carbon in superstructure bridge components by 18% per linear meter.',
  },
  {
    title: 'Central Bank Digital Currency (CBDC) Architecture: Offline Cryptographic Transactions',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Designing secure hardware element handshakes for dual-offline peer-to-peer digital currency settlement without active cellular internet.',
    tags: ['CBDC', 'Cryptography', 'Fintech', 'ECON', 'CSE'],
    theme: 'Offline cryptographic protocols, secure enclaves, and double-spend mitigation',
    milestoneMetric: 'Demonstrated zero double-spending attacks across 10,000 synthetic offline payment simulations.',
  },
  {
    title: 'Automated Hydroponics Control Systems Using Sensor Fusion and PID Regulators',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Closed-loop automation of electrical conductivity (EC), pH, and dissolved oxygen for precision vertical agriculture facilities.',
    tags: ['AgriTech', 'EmbeddedControl', 'Hydroponics', 'EEE', 'Automation'],
    theme: 'Sensor fusion and multi-variable PID control in precision agricultural environments',
    milestoneMetric: 'Achieved 40% reduction in nutrient water consumption while boosting leafy green crop yields by 25%.',
  },
  {
    title: 'Real-Time Distributed Telemetry Pipeline Processing 5 Billion Events Daily',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Scaling ClickHouse columnar storage alongside Apache Flink stream analytics to provide sub-second observability for cloud infrastructure.',
    tags: ['BigData', 'ClickHouse', 'StreamProcessing', 'CSE', 'Observability'],
    theme: 'Columnar storage optimization and distributed streaming state management',
    milestoneMetric: 'Maintained analytical query execution times under 200ms across 40 TB of daily incoming metric logs.',
  },
  {
    title: 'Dynamic Traffic Signal Optimization Using Reinforcement Learning',
    category: StoryCategory.TECH_INNOVATION,
    summary: 'Simulating Deep Q-Networks (DQN) with SUMO traffic simulator to dynamically adjust green light phases based on queue lengths.',
    tags: ['ReinforcementLearning', 'SmartCities', 'TrafficEngineering', 'CSE', 'CE'],
    theme: 'Deep reinforcement learning for urban transportation flow optimization',
    milestoneMetric: 'Reduced cumulative vehicle intersection wait times by 28% during peak commuter rush hours.',
  },

  // 4. RESEARCH_ACADEMIA (20 Stories)
  {
    title: 'From Undergraduate Thesis to First-Author Publication in IEEE Transactions',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'The rigorous methodological journey of conducting electrical research, formulating mathematical proofs, and navigating the peer-review process.',
    tags: ['AcademicResearch', 'IEEE', 'PowerSystems', 'EEE', 'Publications'],
    theme: 'Academic peer review, rigorous experimentation, and mathematical modeling',
    milestoneMetric: 'Published in an IEEE Transactions Q1 journal with over 85 subsequent international scholarly citations.',
  },
  {
    title: 'Securing a Fully Funded PhD at a Premier Global Research University',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Navigating graduate school admissions, research statement formulation, and securing doctoral fellowships in North America.',
    tags: ['HigherEducation', 'PhD', 'Scholarships', 'GradSchool', 'CSE'],
    theme: 'Academic fellowship applications, mentorship, and doctoral research alignment',
    milestoneMetric: 'Awarded a five-year comprehensive doctoral fellowship valued at over $260,000.',
  },
  {
    title: 'Empirical Impact Evaluation of Conditional Cash Transfers on Rural Education',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Employing difference-in-differences and propensity score matching econometrics to evaluate government poverty alleviation programs.',
    tags: ['Econometrics', 'DevelopmentEconomics', 'PublicPolicy', 'ECON', 'Research'],
    theme: 'Quasi-experimental econometric methods and evidence-based policy evaluation',
    milestoneMetric: 'Analyzed panel survey datasets covering 12,000 households over an eight-year observation window.',
  },
  {
    title: 'Geotechnical Soil Stabilization Using Industrial Byproducts: Fly Ash and Silica Fume',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Investigating unconfined compressive strength and California Bearing Ratio (CBR) enhancements in soft coastal marine clays.',
    tags: ['GeotechnicalResearch', 'SoilMechanics', 'MaterialsScience', 'CE', 'Academia'],
    theme: 'Sustainable soil improvement materials and laboratory triaxial testing',
    milestoneMetric: 'Demonstrated a 210% increase in soil California Bearing Ratio with 15% fly ash admixture.',
  },
  {
    title: 'Post-Colonial Narrative Structures in Contemporary South Asian Literature',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Analyzing linguistic subversion, diaspora identity, and hybridity across modern English prose in regional academic journals.',
    tags: ['LiteraryTheory', 'PostColonialStudies', 'Humanities', 'ENG', 'CulturalResearch'],
    theme: 'Textual hermeneutics, cultural post-colonial theory, and literary critique',
    milestoneMetric: 'Presented peer-reviewed conference papers at three international literary colloquiums.',
  },
  {
    title: 'Micro-Hydrokinetic Turbine Blade Design for Low-Velocity River Streams',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Computational fluid dynamic (CFD) modeling of novel hydrofoil geometries capable of power generation in flat deltaic rivers.',
    tags: ['FluidDynamics', 'RenewableEnergy', 'Hydrokinetics', 'EEE', 'CFD'],
    theme: 'Computational fluid mechanics and low-head hydrokinetic energy extraction',
    milestoneMetric: 'Simulated power coefficient (Cp) of 0.41 in low-velocity water flows under 1.2 meters per second.',
  },
  {
    title: 'Deep Transfer Learning for Early Detection of Plant Foliar Diseases',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Training convolutional neural network architectures on field-collected leaf imagery to distinguish between fungal and bacterial blights.',
    tags: ['ComputerVision', 'DeepLearning', 'AgriTech', 'CSE', 'ArtificialIntelligence'],
    theme: 'Applied machine learning in agrarian disease surveillance',
    milestoneMetric: 'Achieved 97.4% multi-class classification accuracy across 14 distinct crop pathology classes.',
  },
  {
    title: 'Macroeconomic Determinants of Foreign Direct Investment Inflows into Emerging Asia',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Investigating institutional governance indicators, trade openness, and exchange rate volatility on foreign direct investments.',
    tags: ['InternationalTrade', 'Macroeconomics', 'PanelData', 'ECON', 'PolicyResearch'],
    theme: 'Cross-country panel econometrics and foreign capital flow determinants',
    milestoneMetric: 'Constructed dynamic panel GMM estimators across 18 emerging market economies over 25 years.',
  },
  {
    title: 'Alkali-Activated Slag Concrete Under Aggressive Marine Exposure',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Evaluating chloride ion diffusion coefficients and sulfate resistance in zero-cement alkali-activated geopolymer concrete.',
    tags: ['Geopolymer', 'MarineConcrete', 'CivilEngineering', 'CE', 'Durability'],
    theme: 'Durability mechanics of cement-free geopolymers in harsh coastal environments',
    milestoneMetric: 'Demonstrated 60% lower chloride penetration depth compared to standard ordinary Portland cement specimens.',
  },
  {
    title: 'Pedagogical Shift: Implementing Task-Based Language Teaching (TBLT) in Universities',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Assessing oral communicative competence and learner engagement in undergraduate second-language acquisition classrooms.',
    tags: ['AppliedLinguistics', 'LanguageTeaching', 'HigherEdPedagogy', 'ENG', 'Education'],
    theme: 'Second-language acquisition frameworks and task-based instructional design',
    milestoneMetric: 'Conducted longitudinal classroom intervention studies across 600 undergraduate learners.',
  },
  {
    title: 'Design of Wide-Bandgap GaN High-Electron-Mobility Transistors (HEMT)',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Simulating two-dimensional electron gas (2DEG) density and breakdown voltage characteristics for high-power radio frequency applications.',
    tags: ['Semiconductors', 'GaN', 'Nanotechnology', 'EEE', 'SolidStatePhysics'],
    theme: 'Semiconductor device physics and gallium nitride high-electron-mobility modeling',
    milestoneMetric: 'Modeled breakdown voltages exceeding 1,200V with sub-picosecond switching transition times.',
  },
  {
    title: 'Fairness and Algorithmic Auditing in Machine Learning Decision Systems',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Formulating demographic parity and equalized odds mathematical metrics to evaluate commercial hiring and screening algorithms.',
    tags: ['AIEthics', 'MachineLearning', 'AlgorithmicFairness', 'CSE', 'DataGovernance'],
    theme: 'Mathematical foundations of algorithmic bias and ethical AI verification',
    milestoneMetric: 'Developed open-source fairness auditing packages adopted by university research consortia.',
  },
  {
    title: 'Inflation Expectations and Monetary Transmission Mechanisms: Survey Evidence',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Analyzing household inflation expectations formation using adaptive learning algorithms and micro-level consumer surveys.',
    tags: ['MonetaryEconomics', 'InflationExpectations', 'CentralBanking', 'ECON', 'Econometrics'],
    theme: 'Behavioral macroeconomics and central banking communication credibility',
    milestoneMetric: 'Published empirical findings cited in sovereign monetary policy research series.',
  },
  {
    title: 'Structural Performance of Timber-Concrete Composite Floors for Tall Timber Buildings',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Investigating shear connector stiffness and long-term creep deflection in mass timber engineered construction.',
    tags: ['MassTimber', 'StructuralEngineering', 'CivilResearch', 'CE', 'SustainableDesign'],
    theme: 'Composite timber-concrete structural mechanics and vibration serviceability',
    milestoneMetric: 'Completed experimental shear load tests on 24 full-scale composite connection specimens.',
  },
  {
    title: 'Corpus Linguistics and Stylometric Analysis of Historical Periodicals',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Using computational concordance software to map semantic shifts in cultural and political terminology across century-old print archives.',
    tags: ['CorpusLinguistics', 'Stylometry', 'DigitalHumanities', 'ENG', 'Linguistics'],
    theme: 'Quantitative corpus linguistic analysis and historical lexicography',
    milestoneMetric: 'Analyzed a multi-million-word historical textual corpus to trace linguistic syntactic transitions.',
  },
  {
    title: 'Optimal Power Flow (OPF) in Distribution Networks with High Inverter Penetration',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Applying second-order cone programming (SOCP) convex relaxations to solve voltage regulation challenges in distributed solar grids.',
    tags: ['Optimization', 'SmartGrids', 'OptimalPowerFlow', 'EEE', 'ConvexOptimization'],
    theme: 'Mathematical optimization and convex relaxations in power distribution networks',
    milestoneMetric: 'Demonstrated provably optimal voltage profiles across 10,000 randomized solar generation load scenarios.',
  },
  {
    title: 'Federated Learning for Privacy-Preserving Collaborative Medical Diagnostics',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Training multi-institutional medical imaging models without centralizing patient radiological scans, preserving HIPAA compliance.',
    tags: ['FederatedLearning', 'Privacy', 'MedicalAI', 'CSE', 'Healthcare'],
    theme: 'Decentralized deep learning, differential privacy, and encrypted gradient exchange',
    milestoneMetric: 'Trained multi-institutional chest X-ray classifiers achieving 96.2% AUC without moving patient data.',
  },
  {
    title: 'Trade Liberalization and Wage Inequality: Empirical Evidence from Regional Manufacturing',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Examining Stolper-Samuelson theorem applicability and skill-biased technical change across domestic industrial labor markets.',
    tags: ['LaborEconomics', 'InternationalTrade', 'WageInequality', 'ECON', 'EmpiricalEconomics'],
    theme: 'Applied labor economics and distributional impacts of international trade exposure',
    milestoneMetric: 'Utilized national economic census data spanning three decades to trace sectoral wage distributions.',
  },
  {
    title: 'Hydrodynamic Modeling of Storm Surges in Mangrove-Protected Delta Coastlines',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Employing Delft3D numerical wave dissipation simulations to quantify mangrove forest attenuation of catastrophic tidal wave surges.',
    tags: ['Hydrodynamics', 'CoastalProtection', 'Mangroves', 'CE', 'ClimateScience'],
    theme: 'Nature-based coastal defense mechanics and numerical shallow-water equations',
    milestoneMetric: 'Quantified wave energy reduction coefficients across various mangrove canopy density profiles.',
  },
  {
    title: 'Linguistic Landscape and Multilingual Signage in Rapidly Urbanizing Metropolises',
    category: StoryCategory.RESEARCH_ACADEMIA,
    summary: 'Documenting commercial signage, script choices, and sociolinguistic prestige markers across commercial urban corridors.',
    tags: ['Sociolinguistics', 'LinguisticLandscape', 'UrbanStudies', 'ENG', 'SocialResearch'],
    theme: 'Urban sociolinguistics, semiotics, and public linguistic spatial hierarchy',
    milestoneMetric: 'Photographed and categorized 1,800 public commercial signs across major urban commercial arteries.',
  },

  // 5. DESIGN_PRODUCT (15 Stories)
  {
    title: 'Building Enterprise Design Systems: Scaling UI Consistency for 100+ Product Teams',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Designing tokenized component libraries in Figma, coordinating with React developers, and enforcing WCAG 2.1 AAA accessibility standards.',
    tags: ['DesignSystems', 'UIUX', 'Figma', 'Accessibility', 'ProductDesign'],
    theme: 'Design token architecture, multi-brand component governance, and accessible UX',
    milestoneMetric: 'Standardized 850 reusable components adopted across 14 independent enterprise software products.',
  },
  {
    title: 'Human-Centered Design for Financial Inclusion: Mobile Wallet UX for First-Time Users',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Conducting in-person contextual field research in rural villages to design illiterate-friendly mobile banking interfaces.',
    tags: ['ProductDesign', 'UXResearch', 'Fintech', 'BBA', 'HumanCenteredDesign'],
    theme: 'Contextual field ethnography, iconographic clarity, and low-literacy user experiences',
    milestoneMetric: 'Reduced transaction failure rates among first-time mobile money users from 34% down to under 3%.',
  },
  {
    title: 'Industrial Ergonomics & Control Room Console Design for Mega Power Plants',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Applying ISO 11064 control center human-factors engineering to layout dual-operator consoles and alarm annunciator panels.',
    tags: ['IndustrialDesign', 'Ergonomics', 'HumanFactors', 'EEE', 'ControlRooms'],
    theme: 'Control room ergonomics, situational awareness, and operator fatigue reduction',
    milestoneMetric: 'Engineered control consoles reducing operator emergency reaction response time by 25%.',
  },
  {
    title: 'Architectural Heritage Restoration & Adaptive Reuse of Historic Riverfront Mansions',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Balancing historical masonry preservation with modern structural reinforcement to transform colonial heritage structures into cultural centers.',
    tags: ['AdaptiveReuse', 'HeritageArchitecture', 'CivilEngineering', 'CE', 'UrbanDesign'],
    theme: 'Historic preservation ethics, structural masonry tiebacks, and civic revitalization',
    milestoneMetric: 'Restored a 140-year-old riverfront estate into a thriving 800-seat community cultural auditorium.',
  },
  {
    title: 'Designing Data-Dense Dashboards for High-Frequency Quantitative Trading Desks',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Optimizing color psychology, typographic scale, and micro-interactions for financial analysts monitoring 40 live currency pairs.',
    tags: ['DashboardDesign', 'DataVisualization', 'Fintech', 'ECON', 'UX'],
    theme: 'High-density visual analytics and rapid visual decision support systems',
    milestoneMetric: 'Designed modular trading layouts capable of rendering 120 streaming data tickers at 60 FPS without UI jank.',
  },
  {
    title: 'Typography, Editorial Layout, and Brand Identity for Literary Quarterlies',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Pairing classical serif typography with contemporary grid systems to publish award-winning literary journals.',
    tags: ['Typography', 'EditorialDesign', 'BrandIdentity', 'ENG', 'PrintDesign'],
    theme: 'Macro and micro typography, publication grid systems, and tactile print production',
    milestoneMetric: 'Designed 16 issues of internationally circulated literary magazines winning regional design citations.',
  },
  {
    title: 'Designing Accessible Mobile Healthcare Apps for Chronic Disease Management',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Developing diabetic glucose tracking workflows tailored for elderly users with tactile touch targets and voice feedback.',
    tags: ['HealthUX', 'Accessibility', 'MobileDesign', 'CSE', 'InclusiveDesign'],
    theme: 'Universal design principles and accessible mobile interfaces for elder care',
    milestoneMetric: 'Achieved a 94% daily app logging compliance rate across 10,000 enrolled diabetic patients.',
  },
  {
    title: 'Packaging Design & Biodegradable Materials for Premium Consumer Goods',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Replacing single-use plastic packaging with cassava-starch compostable cartons and water-based soy ink printing.',
    tags: ['PackagingDesign', 'SustainableMaterials', 'Branding', 'BBA', 'EcoDesign'],
    theme: 'Circular packaging lifecycle design and sustainable brand positioning',
    milestoneMetric: 'Replaced over 2 million plastic blister packs with 100% home-compostable molded fiber trays.',
  },
  {
    title: 'Smart Home IoT Mobile App UX: Simplifying Device Onboarding and Pairing',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Designing frictionless Bluetooth Low Energy (BLE) and Wi-Fi provisioning flows that non-technical homeowners can complete in under 60 seconds.',
    tags: ['IoTDashboards', 'MobileUX', 'SmartHome', 'EEE', 'InteractionDesign'],
    theme: 'Hardware-to-software onboarding flows and clear device state feedback',
    milestoneMetric: 'Reduced customer support smart-device onboarding tickets by 78%.',
  },
  {
    title: 'Pedestrian-First Urban Street Design: Complete Streets Engineering in Historic Quarters',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Transforming car-clogged urban alleys into vibrant pedestrian plazas with permeable pavers, bioswales, and traffic calming.',
    tags: ['UrbanDesign', 'CompleteStreets', 'CivilEngineering', 'CE', 'PedestrianPlazas'],
    theme: 'Tactical urbanism, pedestrian safety geometry, and sustainable stormwater pavers',
    milestoneMetric: 'Reclaimed 3.5 kilometers of historic urban core for dedicated pedestrian and active cycling transit.',
  },
  {
    title: 'Gamified Micro-Savings Product Design: Nudging Young Adults Towards Financial Resilience',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Designing round-up savings rules, visual progress streaks, and zero-loss lottery mechanics that make personal finance engaging.',
    tags: ['BehavioralDesign', 'Fintech', 'Gamification', 'ECON', 'ProductStrategy'],
    theme: 'Behavioral product mechanics and habit-forming ethical finance loops',
    milestoneMetric: 'Enrolled users saved an average of 18% more disposable income over 6 months.',
  },
  {
    title: 'Brand Architecture and Visual Identity for Higher Education Institutions',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Modernizing university heraldry, typography guidelines, and digital campus signage across unified institutional touchpoints.',
    tags: ['Branding', 'VisualIdentity', 'Typography', 'ENG', 'HigherEd'],
    theme: 'Institutional brand governance and digital-physical unified identity',
    milestoneMetric: 'Rebranded 4 higher education institutions, harmonizing identity across digital and physical collateral.',
  },
  {
    title: 'Enterprise ERP Design Overhaul: Streamlining Complex Industrial Procurement',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Transforming bloated 90-field SAP and Oracle enterprise forms into streamlined, role-specific multi-step approval cards.',
    tags: ['EnterpriseUX', 'B2BSoftware', 'Procurement', 'BBA', 'CSE'],
    theme: 'Enterprise software consumerization and cognitive load reduction',
    milestoneMetric: 'Cut industrial purchase order creation time from 45 minutes down to 8 minutes.',
  },
  {
    title: '3D CAD Modeling & Aerodynamic Fairing Design for Electric Racing Karts',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Utilizing SolidWorks surfacing and computational aerodynamic simulations to minimize drag on collegiate electric racing chassis.',
    tags: ['IndustrialDesign', 'CAD', 'Aerodynamics', 'EEE', 'Motorsport'],
    theme: 'Parametric surface modeling and computational vehicle aerodynamic optimization',
    milestoneMetric: 'Reduced vehicle aerodynamic drag coefficient (Cd) by 14%, extending battery race endurance.',
  },
  {
    title: 'Landscape Architecture & Sponge City Park Design for Urban Stormwater Retention',
    category: StoryCategory.DESIGN_PRODUCT,
    summary: 'Designing multi-tiered retention ponds, constructed wetlands, and native riparian buffers that absorb monsoon flash flooding.',
    tags: ['LandscapeArchitecture', 'SpongeCity', 'Stormwater', 'CE', 'UrbanEcology'],
    theme: 'Ecological civil engineering and urban flood detention landscapes',
    milestoneMetric: 'Constructed an 18-acre urban lake park capable of retaining 120,000 cubic meters of stormwater runoff.',
  },

  // 6. CAMPUS_NOSTALGIA (12 Stories)
  {
    title: 'Late Nights in Lab 4: Remembering the Birth of Our Coding Camaraderie',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'Reflecting on shared debugging marathons, cold tea runs in Sonadanga, and the enduring bonds forged during undergraduate ACM training.',
    tags: ['CampusMemories', 'AlumniReflections', 'StudentLife', 'CSE', 'SonadangaCampus'],
    theme: 'Collegiate friendships, academic perseverance, and formative student experiences',
    milestoneMetric: 'Reunited an entire 2017 coding team that now operates across three continents.',
  },
  {
    title: 'The Annual NWU Business Fest: Where Case Studies Became Lifelong Lessons',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'How organizing student case competitions and corporate sponsorship pitches prepared an entire batch for real-world boardroom debates.',
    tags: ['BusinessFest', 'StudentLeadership', 'AlumniMemories', 'BBA', 'CampusLife'],
    theme: 'Student leadership, collegiate event governance, and practical business instincts',
    milestoneMetric: 'Organized flagship collegiate festivals that welcomed over 600 participants from 22 universities.',
  },
  {
    title: 'Sparks and Solder: The Electrifying Days in the Machines Laboratory',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'Remembering the hum of DC shunt motors, oscilloscope traces, and the patient faculty guidance that grounded our technical careers.',
    tags: ['EEE', 'ElectricalLab', 'FacultyMentorship', 'StudentMemories', 'NWU'],
    theme: 'Hands-on practical laboratory training and revered academic mentors',
    milestoneMetric: 'Graduated a cohort of electrical engineers who now maintain national transmission grids.',
  },
  {
    title: 'Surveying Field Camp: Measuring Contours and Forging Lifelong Friendships',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'Two weeks of optical theodolite readings, leveling staves under the blazing sun, and evening campfire sing-alongs in the countryside.',
    tags: ['CivilEngineering', 'SurveyCamp', 'Fieldwork', 'CE', 'Friendship'],
    theme: 'Civil engineering field traditions and collegiate teamwork',
    milestoneMetric: 'Completed 140 hectares of topographical contour mapping during annual residential field camps.',
  },
  {
    title: 'The Departmental Debate Club: Finding Our Voice in the Central Auditorium',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'Passionate parliamentary debates on economic policy, philosophical dilemmas, and late-night research sessions in the library.',
    tags: ['DebatingClub', 'PublicSpeaking', 'StudentLife', 'ECON', 'ENG'],
    theme: 'Competitive student debating, critical thinking, and civic rhetoric',
    milestoneMetric: 'Secured national championship debating trophies representing North Western University.',
  },
  {
    title: 'Rainy Monsoons on the NWU Rooftop: Poetry, Philosophy, and Raindrops',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'Memories of torrential afternoon rain over Khulna city, shared umbrellas, and spirited discussions on romantic literature and post-modernism.',
    tags: ['MonsoonMemories', 'Poetry', 'Literature', 'ENG', 'KhulnaCity'],
    theme: 'Literary romanticism, regional campus atmosphere, and contemplative student years',
    milestoneMetric: 'Authored an alumni commemorative poetry anthology celebrating campus memories.',
  },
  {
    title: 'Founding the University Open-Source Club: The First Hackathon We Ever Hosted',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'Sleeping on laboratory desks with sleeping bags, ordering 40 boxes of midnight pizza, and demoing 24 working web applications.',
    tags: ['Hackathons', 'StudentClubs', 'CodingCommunity', 'CSE', 'OpenSource'],
    theme: 'Grassroots collegiate developer organizing and hackathon culture',
    milestoneMetric: 'Hosted the inaugural 36-hour NWU Hackathon with 45 working project submissions.',
  },
  {
    title: 'The Canteen Adda: Where Startup Ideas Were Sketched on Paper Napkins',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'The bustling central canteen, steaming cups of spiced milk tea, and the endless debates that incubated three successful alumni companies.',
    tags: ['CanteenAdda', 'StartupIdeas', 'CampusCulture', 'BBA', 'NWUAlumni'],
    theme: 'Informal collegiate social life, entrepreneurial sparks, and lifelong camaraderie',
    milestoneMetric: 'Turned three canteen napkin business sketches into operating enterprise entities.',
  },
  {
    title: 'The Convocation Day: Caps in the Air and Tears of Gratitude',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'Looking back at graduation day: black gowns, proud parents wiping tears in the front row, and the solemn pledge to serve society.',
    tags: ['Convocation', 'GraduationDay', 'AlumniMilestone', 'NWUFamily', 'Pride'],
    theme: 'Commencement ceremonies, generational pride, and institutional transition',
    milestoneMetric: 'Celebrated the academic conferment of 850 bachelor and master degrees in a single ceremonial session.',
  },
  {
    title: 'Project Defense Day: The 15 Minutes That Defined Four Years of Study',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'The nervous anticipation outside the faculty boardroom, the sudden projector glitch, and the triumphant applause after final defense.',
    tags: ['SeniorThesis', 'ProjectDefense', 'AcademicJourney', 'Engineering', 'CSE'],
    theme: 'Academic capstone defense, rigorous faculty scrutiny, and final validation',
    milestoneMetric: 'Successfully defended senior engineering capstone designs before external industrial examiners.',
  },
  {
    title: 'The University Sports Gala: Winning the Inter-Departmental Cricket Cup',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'Six runs needed off the final delivery, the roaring sidelines of faculty and students, and lifting the championship trophy under floodlights.',
    tags: ['CricketGala', 'Sports', 'InterDepartmental', 'CampusSpirit', 'Champions'],
    theme: 'Athletic sportsmanship, inter-departmental rivalry, and collective campus pride',
    milestoneMetric: 'Clinched the annual chancellor cricket championship trophy before 2,000 cheering campus spectators.',
  },
  {
    title: 'A Tribute to Our Professors: The Mentors Who Believed When We Doubted',
    category: StoryCategory.CAMPUS_NOSTALGIA,
    summary: 'Reflecting on the open-door policy of our department heads, the midnight recommendation letters, and the wisdom that guides us daily.',
    tags: ['FacultyMentorship', 'Gratitude', 'ProfessorTribute', 'NWUAlumni', 'AcademicLegacy'],
    theme: 'Faculty dedication, lifelong pedagogical influence, and alumni gratitude',
    milestoneMetric: 'Established an alumni-funded faculty research grant to honor founding university professors.',
  },

  // 7. GENERAL_INSIGHT (10 Stories)
  {
    title: 'Navigating Early-Career Imposter Syndrome in Global Tech Organizations',
    category: StoryCategory.GENERAL_INSIGHT,
    summary: 'Overcoming the anxiety of working alongside engineers from elite world universities and building unshakeable technical self-efficacy.',
    tags: ['MentalHealth', 'ImposterSyndrome', 'CareerAdvice', 'ProfessionalGrowth', 'CSE'],
    theme: 'Psychological resilience, technical confidence, and continuous learning frameworks',
    milestoneMetric: 'Mentored 80+ junior software engineers through early-career transition anxiety.',
  },
  {
    title: 'The Art of Stakeholder Empathy: Why Soft Skills Determine Senior Leadership',
    category: StoryCategory.GENERAL_INSIGHT,
    summary: 'How learning to listen, negotiate transparently, and translate technical jargon into business value unlocked executive promotions.',
    tags: ['Leadership', 'SoftSkills', 'StakeholderManagement', 'CareerAdvice', 'BBA'],
    theme: 'Executive empathy, active listening, and cross-functional alignment',
    milestoneMetric: 'Successfully aligned 14 divergent corporate stakeholder groups behind a multi-year IT transformation.',
  },
  {
    title: 'Continuous Learning Frameworks: Staying Relevant in the Era of Rapid AI Disruption',
    category: StoryCategory.GENERAL_INSIGHT,
    summary: 'A disciplined daily routine for reading research preprints, prototyping novel frameworks, and avoiding technological obsolescence.',
    tags: ['LifelongLearning', 'AIDisruption', 'SelfImprovement', 'TechTrends', 'EEE'],
    theme: 'Intellectual curiosity, rapid skill acquisition, and technical adaptability',
    milestoneMetric: 'Completed 45 technical certifications and published 24 technical breakdown articles over 5 years.',
  },
  {
    title: 'Ethical Engineering: The Moral Responsibility of Building Public Infrastructure',
    category: StoryCategory.GENERAL_INSIGHT,
    summary: 'Why refusing to compromise on material specifications, structural safety factors, and environmental standards is non-negotiable.',
    tags: ['EngineeringEthics', 'PublicSafety', 'ProfessionalIntegrity', 'CE', 'Governance'],
    theme: 'Professional ethics, public safety accountability, and principled engineering',
    milestoneMetric: 'Rejected substandard commercial aggregate shipments on three separate major municipal road projects.',
  },
  {
    title: 'Financial Literacy for Young Graduates: Mastering Budgeting, Investing, and Compounding',
    category: StoryCategory.GENERAL_INSIGHT,
    summary: 'The essential guide to early investing: index funds, emergency liquidity buffers, and avoiding consumer debt traps right after graduation.',
    tags: ['PersonalFinance', 'FinancialLiteracy', 'Investing', 'ECON', 'GradAdvice'],
    theme: 'Prudent wealth accumulation, emergency funds, and disciplined compound interest',
    milestoneMetric: 'Conducted financial literacy workshops for over 2,500 graduating university seniors.',
  },
  {
    title: 'The Power of Written Communication in High-Trust Asynchronous Remote Work',
    category: StoryCategory.GENERAL_INSIGHT,
    summary: 'Why writing clear RFCs, concise project memos, and structured status reports is the single greatest career superpower in remote teams.',
    tags: ['RemoteWork', 'Asynchronous', 'WrittenCommunication', 'ENG', 'Productivity'],
    theme: 'Asynchronous collaboration, documentation clarity, and remote organizational velocity',
    milestoneMetric: 'Authored 120+ architectural decision records (ADRs) that guided multi-million-dollar software refactors.',
  },
  {
    title: 'Work-Life Integration: Avoiding Burnout While Building a Demanding Career',
    category: StoryCategory.GENERAL_INSIGHT,
    summary: 'Setting firm digital boundaries, prioritizing physical health, and recognizing that sustainable careers are marathons, not sprints.',
    tags: ['WorkLifeBalance', 'BurnoutPrevention', 'Wellness', 'CareerHealth', 'Mindfulness'],
    theme: 'Sustainable workplace boundaries, mental wellness, and holistic life balance',
    milestoneMetric: 'Coached corporate teams to maintain zero weekend emails and reduce burnout leaves by 60%.',
  },
  {
    title: 'Mentorship as a Two-Way Street: How Teaching Junior Peers Sharpens Your Own Mastery',
    category: StoryCategory.GENERAL_INSIGHT,
    summary: 'Why explaining foundational concepts to junior teammates exposes gaps in your own knowledge and accelerates technical clarity.',
    tags: ['Mentorship', 'KnowledgeSharing', 'TeamCulture', 'EngineeringExcellence', 'CSE'],
    theme: 'The Feynman technique, peer mentorship, and engineering culture cultivation',
    milestoneMetric: 'Conducted over 300 hours of 1-on-1 career and technical mentorship sessions.',
  },
  {
    title: 'Embracing Failure: Why Every System Outage and Rejected Proposal Is an Asset',
    category: StoryCategory.GENERAL_INSIGHT,
    summary: 'Conducting blameless post-mortems, extracting systemic lessons from catastrophic production errors, and building institutional grit.',
    tags: ['PostMortem', 'BlamelessCulture', 'FailureAnalysis', 'Resilience', 'Operations'],
    theme: 'Blameless post-mortems, psychological safety, and institutional resilience',
    milestoneMetric: 'Pioneered blameless post-mortem frameworks that reduced recurring production outages by 82%.',
  },
  {
    title: 'Giving Back to Alma Mater: The Lifelong Duty of Supporting the Next Generation',
    category: StoryCategory.GENERAL_INSIGHT,
    summary: 'How participating in mock interviews, funding scholarships, and offering internship placements creates a compounding institutional legacy.',
    tags: ['AlumniGiving', 'CommunityImpact', 'AlmaMater', 'NWUPride', 'HigherEducation'],
    theme: 'Alumni civic responsibility, endowment support, and institutional stewardship',
    milestoneMetric: 'Coordinated alumni funding that disbursed full tuition scholarships to 40 underprivileged scholars.',
  },
];

// Helper to generate a realistic, rich HTML body (600 - 1,200+ words)
function generateRichStoryHtml(
  template: StoryMetaTemplate,
  authorName: string,
  department: string,
  gradYear: number,
  inlineImageIdx: number,
  hasVideo: boolean,
  videoIdx: number
): string {
  const inline = INLINES[inlineImageIdx % INLINES.length]!;
  const video = VIDEOS[videoIdx % VIDEOS.length]!;

  const videoSection = hasVideo
    ? `
      <figure class="my-6">
        <video controls preload="metadata" playsinline class="w-full rounded-xl my-6 shadow-sm aspect-video bg-black">
          <source src="${video.url}" type="video/mp4" />
        </video>
        <figcaption class="text-xs text-center text-slate-500 mt-2 italic">
          Video Walkthrough: Demonstrating technical milestones, project validation, and production benchmarks.
        </figcaption>
      </figure>
    `
    : '';

  return `
    <h2>1. The Academic Foundation & Formative Years at North Western University</h2>
    <p>My journey into the field of ${template.theme} began during my undergraduate studies at <strong>North Western University</strong>, where I enrolled in the Department of ${department} back in the class of ${gradYear}. Walking through the academic halls of NWU in Sonadanga, Khulna, I was consistently challenged by a rigorous curriculum that prioritized foundational first principles over superficial shortcuts. Under the patient guidance of our faculty professors, we learned to break down complex multidimensional problems into tractable, verifiable engineering and analytical components.</p>
    <p>Late evenings in the university computer labs and specialized departmental workshops were the crucible where abstract theory transformed into real-world operational intuition. Whether we were debugging intricate algorithms until dawn, calculating mechanical stress distributions, or analyzing microeconomic market structures, the core philosophy instilled by North Western University was unshakeable: <em>excellence is not an accidental act, but an ongoing habit of intellectual discipline and unrelenting curiosity</em>.</p>

    <figure class="my-6">
      <img src="${inline.url}" alt="${template.title} illustration" class="rounded-xl max-w-full my-6 shadow-sm" loading="lazy" />
      <figcaption class="text-xs text-center text-slate-500 mt-2 italic">
        Figure 1: Architectural diagram and operational workflow reflecting key production milestones.
      </figcaption>
    </figure>

    <h2>2. Confronting Real-World Industry Realities & Initial Breakthroughs</h2>
    <p>Transitioning from academia into high-stakes industrial operations was both humbling and exhilarating. In the enterprise sector, requirements are rarely static, and constraints are perpetually shifting. I quickly discovered that the theoretical frameworks mastered during my university years provided the exact mental scaffolding required to diagnose systemic bottlenecks, coordinate multi-disciplinary stakeholders, and execute resilient engineering strategies under tight commercial deadlines.</p>
    <p>During the early phases of this initiative, our team encountered severe operational hurdles that threatened to derail project timelines. We faced legacy data inconsistencies, resource contention across distributed computing clusters, and rigorous statutory compliance mandates. By returning to fundamental principles—measuring empirical performance metrics, isolating failure domains, and formulating verifiable mathematical hypotheses—we systematically engineered high-throughput, fault-tolerant solutions that exceeded initial performance targets.</p>

    ${videoSection}

    <h2>3. Key Production Milestones & Verifiable Architectural Outcomes</h2>
    <p>Over the course of this multi-year operational endeavor, our team delivered transformative outcomes that established new organizational benchmarks. By adhering to rigorous architectural standards, automated continuous integration pipelines, and proactive failure-mode testing, we accomplished the following verified milestones:</p>
    <ul>
      <li><strong>Operational Scale:</strong> ${template.milestoneMetric}</li>
      <li><strong>Reliability & Availability:</strong> Achieved 99.99% service availability through automated health checks, blue-green deployment strategies, and self-healing infrastructure topologies.</li>
      <li><strong>Cost Optimization:</strong> Reduced recurring infrastructure and operational overhead by 38% through intelligent capacity reservation and resource rightsizing.</li>
      <li><strong>Stakeholder Transparency:</strong> Built automated telemetry dashboards providing real-time visibility into mission-critical KPIs for executive leadership.</li>
    </ul>

    <blockquote>
      "True professional mastery is demonstrated not when nothing more can be added, but when every superfluous complexity has been stripped away to leave a clean, resilient, and enduring solution."
    </blockquote>

    <h2>4. Strategic Lessons & Guidance for North Western University Students</h2>
    <p>To the current undergraduate students and junior alumni walking the campus of North Western University today, I offer several candid reflections gained from over a decade of navigating international industry challenges:</p>
    <ol>
      <li><strong>Master the Fundamentals Relentlessly:</strong> Frameworks, programming libraries, and corporate buzzwords evolve continuously, but core mathematics, data structures, and systemic analytical logic remain constant across generations.</li>
      <li><strong>Communicate with Uncompromising Clarity:</strong> Technical brilliance is severely diminished if you cannot articulate your architectural decisions, trade-offs, and risk matrices clearly to cross-functional teams and executive decision-makers. Explore documentation standards at <a href="https://nwu.ac.bd" target="_blank" rel="noopener noreferrer">North Western University Central Portal</a>.</li>
      <li><strong>Cultivate Enduring Professional Integrity:</strong> Never compromise on safety factors, software test coverage, or ethical transparency for the sake of artificial short-term velocity. The long-term reputation you build is your most valuable professional currency.</li>
    </ol>
    <p>I remain deeply indebted to North Western University for providing the academic foundation, ethical compass, and lifelong community that made this career trajectory possible. As alumni, our greatest responsibility is to reach back, open doors, and inspire the subsequent generations of NWU scholars who will build the future of our nation and the wider global society.</p>
  `.trim();
}

// -----------------------------------------------------------------------------
// MAIN PROVISIONING ROUTINE
// -----------------------------------------------------------------------------
async function main() {
  const startTime = Date.now();
  console.log('================================================================================');
  console.log('ALUMNI CONNECT - PRODUCTION SUCCESS STORIES PROVISIONING');
  console.log('Target Institution: North Western University (slug: north-western-university)');
  console.log('Volume: 140 Long-Form Rich-Media Stories across All 4 Roles & 7 Categories');
  console.log('Media Pool: 25 High-Res Covers, 25 Inlines, 6 Real MP4 Videos');
  console.log('================================================================================\n');

  // 1. Resolve Canonical University
  const university = await prisma.university.findUnique({
    where: { slug: CANONICAL_UNIVERSITY_SLUG },
  });

  if (!university) {
    console.error(`[FATAL] Canonical university "${CANONICAL_UNIVERSITY_SLUG}" not found!`);
    process.exit(1);
  }

  console.log(`[OK] Resolved University: ${university.name} (ID: ${university.id})`);

  // 2. Idempotency Check
  const existingStoryCount = await prisma.successStory.count({
    where: { universityId: university.id },
  });

  const isForce = process.argv.includes('--force');
  if (existingStoryCount >= 135 && !isForce) {
    console.log(`\n[IDEMPOTENT SKIP] North Western University already has ${existingStoryCount} stories.`);
    console.log('Pass "--force" to re-provision or clear existing stories.');
    process.exit(0);
  }

  if (isForce && existingStoryCount > 0) {
    console.log(`[FORCE RESET] Purging ${existingStoryCount} existing stories and related records...`);
    await prisma.report.deleteMany({
      where: { universityId: university.id, targetType: 'STORY' },
    });
    await prisma.auditLog.deleteMany({
      where: { universityId: university.id, targetType: 'STORY' },
    });
    await prisma.successStory.deleteMany({
      where: { universityId: university.id },
    });
    console.log('[OK] Existing stories purged cleanly.');
  }

  // 3. Resolve Real Actors
  console.log('\n[ACTOR RESOLUTION] Resolving active NWU actors across all 4 roles...');

  const alumniUsers = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: 'ALUMNI' },
      isDemo: false,
      verificationStatus: 'APPROVED',
      isActive: true,
    },
    select: { id: true, name: true, email: true, department: true, graduationYear: true },
    orderBy: [{ department: 'asc' }, { graduationYear: 'asc' }],
  });

  const moderatorUsers = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: 'MODERATOR' },
      isDemo: false,
      isActive: true,
    },
    select: { id: true, name: true, email: true, department: true },
    orderBy: { createdAt: 'asc' },
  });

  const superAdminUsers = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: 'SUPER_ADMIN' },
      isDemo: false,
      isActive: true,
    },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
  });

  const studentUsers = await prisma.user.findMany({
    where: {
      universityId: university.id,
      role: { name: 'STUDENT' },
      isDemo: false,
      isActive: true,
    },
    select: { id: true, name: true, email: true },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });

  console.log(`  -> Resolved Approved Alumni Authors: ${alumniUsers.length}`);
  console.log(`  -> Resolved Active Moderators: ${moderatorUsers.length}`);
  console.log(`  -> Resolved Active Super Admins: ${superAdminUsers.length}`);
  console.log(`  -> Resolved Active Student Reporters: ${studentUsers.length}`);

  if (alumniUsers.length < 140) {
    console.warn(`[WARN] Alumni count (${alumniUsers.length}) < 140. Authors will wrap around.`);
  }

  // Unified reviewer pool (10 Moderators + 3 Super Admins = 13 Reviewers)
  const reviewers = [...moderatorUsers, ...superAdminUsers];
  console.log(`  -> Total Editorial Reviewers Pool: ${reviewers.length} actors`);

  // 4. Construct 140 Stories with Realistic State Machine Distribution
  console.log('\n[STORY SYNTHESIS] Generating 140 long-form, rich-media Success Stories...');

  interface StoryToInsert {
    index: number;
    title: string;
    slug: string;
    summary: string;
    body: string;
    category: StoryCategory;
    tags: string[];
    coverImageUrl: string;
    coverImagePublicId: string;
    embeddedMediaPublicIds: string[];
    readingTimeMinutes: number;
    status: StoryStatus;
    authorId: string;
    authorName: string;
    authorDept: string;
    authorYear: number;
    reviewerId: string | null;
    reviewerName: string | null;
    submittedAt: Date | null;
    claimedAt: Date | null;
    publishedAt: Date | null;
    ownerVisibleNote: string | null;
    internalNote: string | null;
    hasVideo: boolean;
    moderations: Array<{
      action: StoryModerationAction;
      actorId: string;
      reasonCode?: string;
      note?: string;
      createdAt: Date;
    }>;
    auditLogs: Array<{
      action: string;
      actorId: string;
      actorRole: string;
      metadata: Record<string, any>;
      createdAt: Date;
    }>;
  }

  const storiesToInsert: StoryToInsert[] = [];
  const now = new Date();

  for (let i = 0; i < 140; i++) {
    const meta = STORY_DEFINITIONS[i % STORY_DEFINITIONS.length]!;
    const author = alumniUsers[i % alumniUsers.length]!;

    const coverIdx = i % COVERS.length;
    const inlineIdx = i % INLINES.length;
    // ~26% of stories have embedded video (~37 stories)
    const hasVideo = i % 4 === 0 || i === 138 || i === 139;
    const videoIdx = i % VIDEOS.length;

    const cover = COVERS[coverIdx]!;
    const inline = INLINES[inlineIdx]!;
    const video = VIDEOS[videoIdx]!;

    const gradYearNum = typeof author.graduationYear === 'number'
      ? author.graduationYear
      : parseInt(String(author.graduationYear || '2020'), 10) || 2020;

    const rawHtml = generateRichStoryHtml(
      meta,
      author.name,
      author.department || 'CSE',
      gradYearNum,
      inlineIdx,
      hasVideo,
      videoIdx
    );

    // Sanitize with live html-sanitizer ensuring strict compliance
    const sanitizedBody = sanitizeStoryHtml(rawHtml, CLOUDINARY_CLOUD_NAME);
    const readingTime = calculateReadingTime(sanitizedBody);

    const embeddedMediaPublicIds: string[] = [inline.publicId];
    if (hasVideo) {
      embeddedMediaPublicIds.push(video.publicId);
    }

    const uniqueSuffix = (i + 1).toString().padStart(3, '0');
    const slug = `${slugify(meta.title)}-${uniqueSuffix}`;

    // Status assignment & moderation trails based on blueprint:
    // 0..104: PUBLISHED (105)
    // 105..109: SUBMITTED (5)
    // 110..114: UNDER_REVIEW (5)
    // 115..124: REJECTED (10)
    // 125..132: DRAFT (Changes Requested) (8)
    // 133..137: DRAFT (Clean) (5)
    // 138..139: UNPUBLISHED (2)

    let status: StoryStatus = StoryStatus.PUBLISHED;
    let reviewerId: string | null = null;
    let reviewerName: string | null = null;
    let submittedAt: Date | null = null;
    let claimedAt: Date | null = null;
    let publishedAt: Date | null = null;
    let ownerVisibleNote: string | null = null;
    let internalNote: string | null = null;

    const moderations: StoryToInsert['moderations'] = [];
    const auditLogs: StoryToInsert['auditLogs'] = [];

    if (i < 105) {
      // 105 PUBLISHED Stories
      status = StoryStatus.PUBLISHED;
      const daysAgo = 1 + Math.floor((i * 119) / 104); // 1 to 120 days ago
      publishedAt = new Date(now.getTime() - daysAgo * 86400000);
      claimedAt = new Date(publishedAt.getTime() - 4 * 3600000);
      submittedAt = new Date(claimedAt.getTime() - 2 * 86400000);

      const reviewer = reviewers[i % reviewers.length]!;
      reviewerId = reviewer.id;
      reviewerName = reviewer.name;

      moderations.push(
        { action: StoryModerationAction.SUBMIT, actorId: author.id, createdAt: submittedAt },
        { action: StoryModerationAction.CLAIM, actorId: reviewer.id, createdAt: claimedAt },
        {
          action: StoryModerationAction.APPROVE,
          actorId: reviewer.id,
          note: 'Verified academic credentials and approved for institutional publication.',
          createdAt: publishedAt,
        }
      );

      auditLogs.push(
        { action: 'STORY_CREATED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt },
        { action: 'STORY_SUBMITTED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt },
        { action: 'STORY_CLAIMED', actorId: reviewer.id, actorRole: reviewer.email.includes('admin') ? 'SUPER_ADMIN' : 'MODERATOR', metadata: { title: meta.title }, createdAt: claimedAt },
        { action: 'STORY_APPROVED', actorId: reviewer.id, actorRole: reviewer.email.includes('admin') ? 'SUPER_ADMIN' : 'MODERATOR', metadata: { title: meta.title }, createdAt: publishedAt }
      );
    } else if (i < 110) {
      // 5 SUBMITTED Stories (Pending Moderator Queue)
      status = StoryStatus.SUBMITTED;
      const hoursAgo = 1 + (i - 105); // 1 to 5 hours ago
      submittedAt = new Date(now.getTime() - hoursAgo * 3600000);

      moderations.push({
        action: StoryModerationAction.SUBMIT,
        actorId: author.id,
        createdAt: submittedAt,
      });

      auditLogs.push(
        { action: 'STORY_CREATED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt },
        { action: 'STORY_SUBMITTED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt }
      );
    } else if (i < 115) {
      // 5 UNDER_REVIEW Stories (Claimed by 5 distinct moderators)
      status = StoryStatus.UNDER_REVIEW;
      const modIdx = i - 110;
      const assignedMod = moderatorUsers[modIdx % moderatorUsers.length]!;
      reviewerId = assignedMod.id;
      reviewerName = assignedMod.name;

      const subHoursAgo = 5 + modIdx;
      submittedAt = new Date(now.getTime() - subHoursAgo * 3600000);
      const claimMinsAgo = 30 + modIdx * 25;
      claimedAt = new Date(now.getTime() - claimMinsAgo * 60000);

      moderations.push(
        { action: StoryModerationAction.SUBMIT, actorId: author.id, createdAt: submittedAt },
        { action: StoryModerationAction.CLAIM, actorId: assignedMod.id, createdAt: claimedAt }
      );

      auditLogs.push(
        { action: 'STORY_CREATED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt },
        { action: 'STORY_SUBMITTED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt },
        { action: 'STORY_CLAIMED', actorId: assignedMod.id, actorRole: 'MODERATOR', metadata: { title: meta.title }, createdAt: claimedAt }
      );
    } else if (i < 125) {
      // 10 REJECTED Stories
      status = StoryStatus.REJECTED;
      const daysAgo = 3 + (i - 115);
      const rejectedAt = new Date(now.getTime() - daysAgo * 86400000);
      claimedAt = new Date(rejectedAt.getTime() - 3 * 3600000);
      submittedAt = new Date(claimedAt.getTime() - 24 * 3600000);

      const reviewer = reviewers[i % reviewers.length]!;
      reviewerId = reviewer.id;
      reviewerName = reviewer.name;

      ownerVisibleNote = 'We appreciate your contribution. However, the narrative contains unsubstantiated claims and promotional links to external commercial platforms, which conflict with our institutional non-commercial publication guidelines.';
      internalNote = 'Failed editorial guidelines due to commercial promotion. Author informed via feedback note.';

      moderations.push(
        { action: StoryModerationAction.SUBMIT, actorId: author.id, createdAt: submittedAt },
        { action: StoryModerationAction.CLAIM, actorId: reviewer.id, createdAt: claimedAt },
        {
          action: StoryModerationAction.REJECT,
          actorId: reviewer.id,
          reasonCode: 'POLICY_VIOLATION',
          note: ownerVisibleNote,
          createdAt: rejectedAt,
        }
      );

      auditLogs.push(
        { action: 'STORY_CREATED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt },
        { action: 'STORY_SUBMITTED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt },
        { action: 'STORY_CLAIMED', actorId: reviewer.id, actorRole: reviewer.email.includes('admin') ? 'SUPER_ADMIN' : 'MODERATOR', metadata: { title: meta.title }, createdAt: claimedAt },
        { action: 'STORY_REJECTED', actorId: reviewer.id, actorRole: reviewer.email.includes('admin') ? 'SUPER_ADMIN' : 'MODERATOR', metadata: { title: meta.title, reason: 'POLICY_VIOLATION' }, createdAt: rejectedAt }
      );
    } else if (i < 133) {
      // 8 DRAFT (Changes Requested) Stories
      status = StoryStatus.DRAFT;
      const daysAgo = 4 + (i - 125);
      const returnedAt = new Date(now.getTime() - daysAgo * 86400000);
      claimedAt = new Date(returnedAt.getTime() - 4 * 3600000);
      submittedAt = new Date(claimedAt.getTime() - 36 * 3600000);

      const reviewer = reviewers[i % reviewers.length]!;
      reviewerId = reviewer.id;
      reviewerName = reviewer.name;

      ownerVisibleNote = 'Excellent narrative foundation! Please expand section 3 with specific technical metrics and clarify the division of engineering responsibilities before resubmitting for editorial approval.';
      internalNote = 'Returned for revision: high potential narrative, needs more granular engineering metrics.';

      moderations.push(
        { action: StoryModerationAction.SUBMIT, actorId: author.id, createdAt: submittedAt },
        { action: StoryModerationAction.CLAIM, actorId: reviewer.id, createdAt: claimedAt },
        {
          action: StoryModerationAction.REQUEST_CHANGES,
          actorId: reviewer.id,
          reasonCode: 'INSUFFICIENT_DETAILS',
          note: ownerVisibleNote,
          createdAt: returnedAt,
        }
      );

      auditLogs.push(
        { action: 'STORY_CREATED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt },
        { action: 'STORY_SUBMITTED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt },
        { action: 'STORY_CLAIMED', actorId: reviewer.id, actorRole: reviewer.email.includes('admin') ? 'SUPER_ADMIN' : 'MODERATOR', metadata: { title: meta.title }, createdAt: claimedAt },
        { action: 'STORY_CHANGES_REQUESTED', actorId: reviewer.id, actorRole: reviewer.email.includes('admin') ? 'SUPER_ADMIN' : 'MODERATOR', metadata: { title: meta.title, feedback: ownerVisibleNote }, createdAt: returnedAt }
      );
    } else if (i < 138) {
      // 5 Clean DRAFT Stories
      status = StoryStatus.DRAFT;
      const createdDaysAgo = 2 + (i - 133);
      const createdAt = new Date(now.getTime() - createdDaysAgo * 86400000);

      auditLogs.push({
        action: 'STORY_CREATED',
        actorId: author.id,
        actorRole: 'ALUMNI',
        metadata: { title: meta.title },
        createdAt,
      });
    } else {
      // 2 UNPUBLISHED Stories (Administrative Takedown)
      status = StoryStatus.UNPUBLISHED;
      const unpubDaysAgo = 2 + (i - 138);
      const unpubAt = new Date(now.getTime() - unpubDaysAgo * 86400000);
      publishedAt = new Date(unpubAt.getTime() - 20 * 86400000);
      claimedAt = new Date(publishedAt.getTime() - 5 * 3600000);
      submittedAt = new Date(claimedAt.getTime() - 3 * 86400000);

      const reviewer = reviewers[i % reviewers.length]!;
      const adminActor = superAdminUsers[0]!;
      reviewerId = reviewer.id;
      reviewerName = reviewer.name;

      ownerVisibleNote = 'This story has been temporarily unpublished per author request to update proprietary employer disclosures.';
      internalNote = 'Temporarily unpublished for corporate NDA clearance.';

      moderations.push(
        { action: StoryModerationAction.SUBMIT, actorId: author.id, createdAt: submittedAt },
        { action: StoryModerationAction.CLAIM, actorId: reviewer.id, createdAt: claimedAt },
        { action: StoryModerationAction.APPROVE, actorId: reviewer.id, note: 'Approved for institutional publication.', createdAt: publishedAt },
        { action: StoryModerationAction.UNPUBLISH, actorId: adminActor.id, note: ownerVisibleNote, createdAt: unpubAt }
      );

      auditLogs.push(
        { action: 'STORY_CREATED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt },
        { action: 'STORY_SUBMITTED', actorId: author.id, actorRole: 'ALUMNI', metadata: { title: meta.title }, createdAt: submittedAt },
        { action: 'STORY_CLAIMED', actorId: reviewer.id, actorRole: reviewer.email.includes('admin') ? 'SUPER_ADMIN' : 'MODERATOR', metadata: { title: meta.title }, createdAt: claimedAt },
        { action: 'STORY_APPROVED', actorId: reviewer.id, actorRole: reviewer.email.includes('admin') ? 'SUPER_ADMIN' : 'MODERATOR', metadata: { title: meta.title }, createdAt: publishedAt },
        { action: 'STORY_UNPUBLISHED', actorId: adminActor.id, actorRole: 'SUPER_ADMIN', metadata: { title: meta.title, reason: 'Author disclosure update' }, createdAt: unpubAt }
      );
    }

    storiesToInsert.push({
      index: i + 1,
      title: meta.title,
      slug,
      summary: meta.summary,
      body: sanitizedBody,
      category: meta.category,
      tags: meta.tags,
      coverImageUrl: cover.url,
      coverImagePublicId: cover.publicId,
      embeddedMediaPublicIds,
      readingTimeMinutes: readingTime,
      status,
      authorId: author.id,
      authorName: author.name,
      authorDept: author.department || 'CSE',
      authorYear: gradYearNum,
      reviewerId,
      reviewerName,
      submittedAt,
      claimedAt,
      publishedAt,
      ownerVisibleNote,
      internalNote,
      hasVideo,
      moderations,
      auditLogs,
    });
  }

  // 5. Batch Insertion with Neon-Safe Chunking (25 Stories per Chunk)
  console.log(`\n[BATCH INSERTION] Inserting 140 stories in 6 chunks with 50ms pauses...`);

  const CHUNK_SIZE = 25;
  const insertedStories: any[] = [];
  const insertedModerations: any[] = [];
  const insertedAuditLogs: any[] = [];

  for (let c = 0; c < storiesToInsert.length; c += CHUNK_SIZE) {
    const chunk = storiesToInsert.slice(c, c + CHUNK_SIZE);
    const chunkNum = Math.floor(c / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(storiesToInsert.length / CHUNK_SIZE);

    console.log(`  -> Processing Chunk ${chunkNum}/${totalChunks} (Stories ${c + 1} to ${c + chunk.length})...`);

    // Insert stories
    const chunkData = chunk.map((s) => ({
      universityId: university.id,
      authorId: s.authorId,
      title: s.title,
      slug: s.slug,
      summary: s.summary,
      body: s.body,
      category: s.category,
      tags: s.tags,
      coverImageUrl: s.coverImageUrl,
      coverImagePublicId: s.coverImagePublicId,
      embeddedMediaPublicIds: s.embeddedMediaPublicIds,
      readingTimeMinutes: s.readingTimeMinutes,
      status: s.status,
      reviewerId: s.reviewerId,
      claimedAt: s.claimedAt,
      ownerVisibleNote: s.ownerVisibleNote,
      internalNote: s.internalNote,
      publishedAt: s.publishedAt,
      version: 1,
    }));

    await prisma.successStory.createMany({
      data: chunkData,
    });

    // Retrieve inserted records to get real IDs for moderation records and audit logs
    const createdChunkRecords = await prisma.successStory.findMany({
      where: {
        universityId: university.id,
        slug: { in: chunk.map((s) => s.slug) },
      },
      select: { id: true, slug: true },
    });

    const slugToIdMap = new Map(createdChunkRecords.map((r) => [r.slug, r.id]));
    insertedStories.push(...createdChunkRecords);

    // Prepare moderation records and audit logs for this chunk
    const chunkModerations: any[] = [];
    const chunkAuditLogs: any[] = [];

    for (const storyDef of chunk) {
      const realStoryId = slugToIdMap.get(storyDef.slug);
      if (!realStoryId) continue;

      for (const mod of storyDef.moderations) {
        chunkModerations.push({
          storyId: realStoryId,
          moderatorId: mod.actorId,
          action: mod.action,
          reasonCode: mod.reasonCode || null,
          note: mod.note || null,
          createdAt: mod.createdAt,
        });
      }

      for (const al of storyDef.auditLogs) {
        chunkAuditLogs.push({
          universityId: university.id,
          actorId: al.actorId,
          actorRole: al.actorRole,
          action: al.action,
          targetType: 'STORY',
          targetId: realStoryId,
          result: AuditResult.SUCCESS,
          metadata: al.metadata,
          createdAt: al.createdAt,
        });
      }
    }

    if (chunkModerations.length > 0) {
      await prisma.storyModerationRecord.createMany({
        data: chunkModerations,
      });
      insertedModerations.push(...chunkModerations);
    }

    if (chunkAuditLogs.length > 0) {
      await prisma.auditLog.createMany({
        data: chunkAuditLogs,
      });
      insertedAuditLogs.push(...chunkAuditLogs);
    }

    await sleep(50); // 50ms pause between chunks
  }

  console.log(`[OK] All 140 stories inserted cleanly!`);
  console.log(`  -> Stories: ${insertedStories.length}`);
  console.log(`  -> Moderation Records: ${insertedModerations.length}`);
  console.log(`  -> Audit Logs: ${insertedAuditLogs.length}`);

  // 6. Provision 5 Sample Student Content Reports
  console.log('\n[REPORTS PROVISIONING] Inserting 5 sample Student content reports on published stories...');
  const publishedStoryRecords = await prisma.successStory.findMany({
    where: { universityId: university.id, status: StoryStatus.PUBLISHED },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  const sampleReportsData = [
    {
      reportedById: studentUsers[0]!.id,
      targetId: publishedStoryRecords[0]!.id,
      reason: 'Suspected duplicate text sections matching public technical blog posts without citation.',
      status: ReportStatus.OPEN,
    },
    {
      reportedById: studentUsers[1]!.id,
      targetId: publishedStoryRecords[1]!.id,
      reason: 'Contains broken external reference link in Section 4 that redirects to an inactive domain.',
      status: ReportStatus.OPEN,
    },
    {
      reportedById: studentUsers[2]!.id,
      targetId: publishedStoryRecords[2]!.id,
      reason: 'Requesting confirmation of corporate grant statistics cited in production metrics.',
      status: ReportStatus.REVIEWED,
    },
    {
      reportedById: studentUsers[3]!.id,
      targetId: publishedStoryRecords[3]!.id,
      reason: 'Inquiry regarding student scholarship eligibility mentioned in concluding paragraphs.',
      status: ReportStatus.REVIEWED,
    },
    {
      reportedById: studentUsers[4]!.id,
      targetId: publishedStoryRecords[4]!.id,
      reason: 'Inquiry on alumni contact email validity.',
      status: ReportStatus.RESOLVED,
      resolution: 'Reviewed by editorial board. Verification confirmed with author and claims substantiated.',
      resolvedAt: new Date(now.getTime() - 3600000),
    },
  ];

  await prisma.report.createMany({
    data: sampleReportsData.map((r) => ({
      universityId: university.id,
      reportedById: r.reportedById,
      targetType: 'STORY',
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      resolution: r.resolution || null,
      resolvedAt: r.resolvedAt || null,
    })),
  });
  console.log('[OK] 5 sample Student content reports provisioned.');

  // 7. Flush Redis Caches
  console.log('\n[REDIS CACHE] Invalidating application Redis caches...');
  try {
    await cacheService.bumpVersion('stories');
    await cacheService.delPattern('stats:*');
    await cacheService.delPattern('admin:*');
    await cacheService.delPattern('moderation:*');
    await cacheService.delPattern('stories:*');
    console.log('[OK] Redis story version bumped and cache keys flushed successfully.');
  } catch (cacheErr) {
    console.warn('[WARN] Redis cache flush encountered minor warning:', cacheErr);
  }

  // 8. Generate Export Directory (report/PRODUCTION_STORIES_DIRECTORY.md)
  console.log('\n[EXPORT] Generating comprehensive testing directory...');
  const reportDir = path.resolve(process.cwd(), '..', 'report');
  await fs.mkdir(reportDir, { recursive: true });
  const mdPath = path.join(reportDir, 'PRODUCTION_STORIES_DIRECTORY.md');

  // Breakdown statistics
  const statusCounts = {
    PUBLISHED: storiesToInsert.filter((s) => s.status === StoryStatus.PUBLISHED).length,
    SUBMITTED: storiesToInsert.filter((s) => s.status === StoryStatus.SUBMITTED).length,
    UNDER_REVIEW: storiesToInsert.filter((s) => s.status === StoryStatus.UNDER_REVIEW).length,
    REJECTED: storiesToInsert.filter((s) => s.status === StoryStatus.REJECTED).length,
    DRAFT_CHANGES: storiesToInsert.filter((s) => s.status === StoryStatus.DRAFT && s.ownerVisibleNote).length,
    DRAFT_CLEAN: storiesToInsert.filter((s) => s.status === StoryStatus.DRAFT && !s.ownerVisibleNote).length,
    UNPUBLISHED: storiesToInsert.filter((s) => s.status === StoryStatus.UNPUBLISHED).length,
  };

  const categoryCounts: Record<string, number> = {};
  for (const s of storiesToInsert) {
    categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
  }

  const videoCount = storiesToInsert.filter((s) => s.hasVideo).length;

  const samplePublishedWithVideo = storiesToInsert.find((s) => s.status === StoryStatus.PUBLISHED && s.hasVideo);
  const sampleSubmitted = storiesToInsert.filter((s) => s.status === StoryStatus.SUBMITTED);
  const sampleUnderReview = storiesToInsert.filter((s) => s.status === StoryStatus.UNDER_REVIEW);
  const sampleRejected = storiesToInsert.filter((s) => s.status === StoryStatus.REJECTED);
  const sampleChangesReq = storiesToInsert.filter((s) => s.status === StoryStatus.DRAFT && s.ownerVisibleNote);
  const sampleCleanDraft = storiesToInsert.filter((s) => s.status === StoryStatus.DRAFT && !s.ownerVisibleNote);
  const sampleUnpublished = storiesToInsert.filter((s) => s.status === StoryStatus.UNPUBLISHED);

  const mdContent = `# North Western University — Production Success Stories Directory

> **CONFIDENTIAL CREDENTIAL & TEST RUNNER REGISTER**  
> Platform Scope: **North Western University** (\`slug: 'north-western-university'\`, \`domain: 'nwu.ac.bd'\`)  
> Total Long-Form Stories Provisioned: **${storiesToInsert.length}** Stories (600–1,200+ words each)  
> Total Moderation Trails: **${insertedModerations.length}** \`StoryModerationRecord\` entries  
> Total Audit Logs: **${insertedAuditLogs.length}** \`AuditLog\` entries  
> Sample Student Content Reports: **5** \`Report\` entries (\`targetType: 'STORY'\`)  
> Cloudinary Media Pool: **25 16:9 Covers**, **25 Inline Images**, **6 Optimized MP4 Videos** (All HTTP 200 OK)  
> Date of Provisioning: **${new Date().toISOString()}**  

---

## 1. Executive Metrics Breakdown

| Category / Metric | Count | Platform Purpose & UI Location |
| :--- | :---: | :--- |
| **PUBLISHED Stories** | **${statusCounts.PUBLISHED}** | Live campus feed across \`/stories\`, \`/student/stories\`, \`/alumni/stories\`, \`/admin/stories\` |
| — *Video-Embedded Stories* | *${videoCount}* | Embedded responsive Cloudinary MP4 video walkthroughs (~26% of stories) |
| — *Average Reading Time* | *4–7 mins* | Dynamically calculated using \`calculateReadingTime\` (600–1,200+ words) |
| **SUBMITTED Stories** | **${statusCounts.SUBMITTED}** | Recent pending queue in \`/moderator/content\` and \`/moderator/content/pending\` (Ready to claim live) |
| **UNDER_REVIEW Stories** | **${statusCounts.UNDER_REVIEW}** | Assigned 1 each across 5 distinct active Moderators in \`/moderator/content\` |
| **REJECTED Stories** | **${statusCounts.REJECTED}** | Visible in Alumni \`/alumni/stories/my-stories\` with constructive \`ownerVisibleNote\` feedback |
| **DRAFT (Changes Requested)** | **${statusCounts.DRAFT_CHANGES}** | Revision queue in \`/alumni/stories/my-stories\` with actionable notes & "Edit & Resubmit" workflow |
| **Clean DRAFT Stories** | **${statusCounts.DRAFT_CLEAN}** | Unsubmitted working drafts in \`/alumni/stories/my-stories\` ready for first submission |
| **UNPUBLISHED Stories** | **${statusCounts.UNPUBLISHED}** | Takedown archive in \`/admin/stories\` ready for Super Admin / Moderator "Restore" testing |
| **Total Success Stories** | **${storiesToInsert.length}** | **Evenly authored across 6 NWU departments and 2016–2025 cohorts** |

---

## 2. Category Distribution Matrix

| Story Category | Provisioned Count | Key Focus & Narrative Themes |
| :--- | :---: | :--- |
| **CAREER_MILESTONE** | **${categoryCounts.CAREER_MILESTONE || 0}** | Cloud architecture, corporate banking, mega civil bridges, power grid telemetry |
| **ENTREPRENEURSHIP** | **${categoryCounts.ENTREPRENEURSHIP || 0}** | Bootstrapping SaaS, agro-exports, IoT hardware manufacturing, clean-tech EPC |
| **TECH_INNOVATION** | **${categoryCounts.TECH_INNOVATION || 0}** | Flash-sale concurrency, edge AI vision, vector embeddings, LoRaWAN telemetry |
| **RESEARCH_ACADEMIA** | **${categoryCounts.RESEARCH_ACADEMIA || 0}** | IEEE publications, funded PhDs, econometric evaluations, soil stabilization |
| **DESIGN_PRODUCT** | **${categoryCounts.DESIGN_PRODUCT || 0}** | Enterprise design systems, financial inclusion UX, control room ergonomics |
| **CAMPUS_NOSTALGIA** | **${categoryCounts.CAMPUS_NOSTALGIA || 0}** | Late nights in Lab 4, survey field camps, business fests, canteen adda memories |
| **GENERAL_INSIGHT** | **${categoryCounts.GENERAL_INSIGHT || 0}** | Overcoming imposter syndrome, asynchronous remote work, engineering ethics |

---

## 3. Reviewer Attribution Matrix (10 Moderators + 3 Super Admins)

The 105 published stories, 10 rejected stories, and 8 revision-requested stories are evenly attributed across all 13 editorial reviewers:

| Reviewer Name | Role | Email | Status in Platform |
| :--- | :---: | :--- | :--- |
${reviewers
  .map(
    (r) =>
      `| **${r.name}** | \`${r.email.includes('admin') ? 'SUPER_ADMIN' : 'MODERATOR'}\` | \`${r.email}\` | Active & Verified |`
  )
  .join('\n')}

---

## 4. Ready-to-Test Sample Story Register

### 4.1 Sample Published Story with Embedded Video & Inline Images
- **Title:** \`${samplePublishedWithVideo?.title}\`
- **Slug:** \`${samplePublishedWithVideo?.slug}\`
- **URL Route:** \`/stories/${samplePublishedWithVideo?.slug}\`
- **Author:** **${samplePublishedWithVideo?.authorName}** (\`${samplePublishedWithVideo?.authorDept}\`, Class of ${samplePublishedWithVideo?.authorYear})
- **Reviewer:** **${samplePublishedWithVideo?.reviewerName}**
- **Reading Time:** **${samplePublishedWithVideo?.readingTimeMinutes} minutes** (~900 words)
- **Features:** 16:9 Cover Image, 1 Inline Narrative Image, 1 Embedded Cloudinary MP4 Video with player controls.

### 4.2 All 5 Pending \`SUBMITTED\` Stories (Ready for Moderator to Claim)
These stories have \`status: 'SUBMITTED'\`, \`reviewerId: null\`. Any Moderator can visit \`/moderator/content\` and click **"Claim for Review"**:

| # | Title | Category | Author | Submitted | Route |
| :-: | :--- | :---: | :--- | :---: | :--- |
${sampleSubmitted
  .map(
    (s, idx) =>
      `| **${idx + 1}** | **${s.title}** | \`${s.category}\` | ${s.authorName} (${s.authorDept}) | Recent (Hours ago) | \`/moderator/content\` |`
  )
  .join('\n')}

### 4.3 All 5 \`UNDER_REVIEW\` Claimed Stories (Assigned Across 5 Distinct Moderators)
These stories have been claimed by individual moderators. The assigned moderator can review, approve, request changes, or reject:

| # | Title | Assigned Moderator | Moderator Email | Story Status |
| :-: | :--- | :--- | :--- | :---: |
${sampleUnderReview
  .map(
    (s, idx) =>
      `| **${idx + 1}** | **${s.title}** | **${s.reviewerName}** | \`${moderatorUsers[idx]?.email}\` | \`UNDER_REVIEW\` |`
  )
  .join('\n')}

### 4.4 Sample \`DRAFT\` (Changes Requested) Stories ("Edit & Resubmit" Workflow)
These stories have \`status: 'DRAFT'\` with yellow "Changes Requested" feedback banner visible to the author:

| # | Title | Author Email | Author Password | Moderator Feedback Note |
| :-: | :--- | :--- | :--- | :--- |
${sampleChangesReq.slice(0, 3)
  .map(
    (s, idx) =>
      `| **${idx + 1}** | **${s.title}** | \`${alumniUsers.find((a) => a.id === s.authorId)?.email}\` | \`${ROLE_PASSWORDS.ALUMNI}\` | "${s.ownerVisibleNote}" |`
  )
  .join('\n')}

### 4.5 Sample \`REJECTED\` Stories
These stories have \`status: 'REJECTED'\` with editorial feedback explaining why they were not approved:

| # | Title | Author Email | Author Password | Rejection Reason |
| :-: | :--- | :--- | :--- | :--- |
${sampleRejected.slice(0, 3)
  .map(
    (s, idx) =>
      `| **${idx + 1}** | **${s.title}** | \`${alumniUsers.find((a) => a.id === s.authorId)?.email}\` | \`${ROLE_PASSWORDS.ALUMNI}\` | "${s.ownerVisibleNote}" |`
  )
  .join('\n')}

### 4.6 Sample \`UNPUBLISHED\` Stories (Admin Restore Testing)
These stories were published and subsequently taken down. Super Admins and Moderators can test the **"Restore Story"** button in \`/admin/stories\`:

| # | Title | Slug | Takedown Reason | Route |
| :-: | :--- | :--- | :--- | :--- |
${sampleUnpublished
  .map(
    (s, idx) =>
      `| **${idx + 1}** | **${s.title}** | \`${s.slug}\` | "${s.ownerVisibleNote}" | \`/admin/stories\` |`
  )
  .join('\n')}

---

## 5. Sample Student Content Reports Register (\`Report\` Model)

| Report ID | Reported Story Title | Reporter Student | Status | Reason / Resolution |
| :--- | :--- | :--- | :---: | :--- |
| **Report #1** | \`${publishedStoryRecords[0]?.title}\` | \`${studentUsers[0]?.email}\` | \`OPEN\` | Suspected duplicate text sections matching public blog posts. |
| **Report #2** | \`${publishedStoryRecords[1]?.title}\` | \`${studentUsers[1]?.email}\` | \`OPEN\` | Broken external reference link in Section 4. |
| **Report #3** | \`${publishedStoryRecords[2]?.title}\` | \`${studentUsers[2]?.email}\` | \`REVIEWED\` | Requesting confirmation of corporate grant statistics. |
| **Report #4** | \`${publishedStoryRecords[3]?.title}\` | \`${studentUsers[3]?.email}\` | \`REVIEWED\` | Inquiry regarding student scholarship eligibility. |
| **Report #5** | \`${publishedStoryRecords[4]?.title}\` | \`${studentUsers[4]?.email}\` | \`RESOLVED\` | Resolved by editorial board. Verification confirmed with author. |

---

## 6. Uniform Test Login Credentials Reference

| Role | Sample Test Login Email | Uniform Password | Key Story Route |
| :--- | :--- | :--- | :--- |
| **Super Admin** | \`admin.registrar@nwu.ac.bd\` | \`${ROLE_PASSWORDS.SUPER_ADMIN}\` | \`/admin/stories\` |
| **Moderator #1 (CSE)** | \`${moderatorUsers[0]?.email}\` | \`${ROLE_PASSWORDS.MODERATOR}\` | \`/moderator/content\` |
| **Moderator #2 (EEE)** | \`${moderatorUsers[1]?.email}\` | \`${ROLE_PASSWORDS.MODERATOR}\` | \`/moderator/content\` |
| **Alumni (Published)** | \`${alumniUsers[0]?.email}\` | \`${ROLE_PASSWORDS.ALUMNI}\` | \`/alumni/stories/my-stories\` |
| **Alumni (Changes Req)** | \`${alumniUsers.find((a) => a.id === sampleChangesReq[0]?.authorId)?.email}\` | \`${ROLE_PASSWORDS.ALUMNI}\` | \`/alumni/stories/my-stories\` |
| **Alumni (Rejected)** | \`${alumniUsers.find((a) => a.id === sampleRejected[0]?.authorId)?.email}\` | \`${ROLE_PASSWORDS.ALUMNI}\` | \`/alumni/stories/my-stories\` |
| **Student (Reader/Reporter)** | \`${studentUsers[0]?.email}\` | \`${ROLE_PASSWORDS.STUDENT}\` | \`/student/stories\` |
| **Public Viewer** | *No authentication required* | *N/A* | \`/stories\` |
`;

  await fs.writeFile(mdPath, mdContent, 'utf8');
  console.log(`[OK] Stories directory testing guide exported: ${mdPath}`);

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n================================================================================');
  console.log(`SUCCESS: Bulk Stories Provisioning Completed in ${totalElapsed}s!`);
  console.log(`Total Stories Persisted: ${insertedStories.length}`);
  console.log(`Total Moderation Records Persisted: ${insertedModerations.length}`);
  console.log(`Total Audit Logs Persisted: ${insertedAuditLogs.length}`);
  console.log('================================================================================\n');

  process.exit(0);
}

main()
  .catch((err) => {
    console.error('\n[FATAL ERROR during stories provisioning]:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
