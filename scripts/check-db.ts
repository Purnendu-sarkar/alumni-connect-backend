import { prisma } from '../src/config/database.js';

async function check() {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      title: true,
      company: true,
      status: true,
      applications: { select: { id: true, applicantId: true, message: true, createdAt: true } }
    }
  });
  console.log("=== RECENT JOBS ===");
  console.log(JSON.stringify(jobs, null, 2));

  const tokens = await prisma.verificationToken.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, type: true, expiresAt: true, consumedAt: true, userId: true }
  });
  console.log("=== RECENT TOKENS ===");
  console.log(JSON.stringify(tokens, null, 2));

  const universities = await prisma.university.findMany({
    select: { id: true, name: true, slug: true, domain: true, isActive: true }
  });
  console.log("=== UNIVERSITIES ===");
  console.log(JSON.stringify(universities, null, 2));

  await prisma.$disconnect();
}

check().catch(console.error);
