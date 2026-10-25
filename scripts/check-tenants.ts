import { prisma } from '../src/config/database.js';

async function check() {
  const users = await prisma.user.findMany({
    where: { email: { in: ['demo.moderator@demo.edu', 'demo.alumni@demo.edu'] } },
    select: { id: true, email: true, universityId: true }
  });
  console.log("=== USERS ===");
  console.log(users);

  const pendingJobs = await prisma.job.findMany({
    where: { status: 'PENDING' },
    select: { id: true, title: true, universityId: true, postedById: true }
  });
  console.log("=== PENDING JOBS ===");
  console.log(pendingJobs);

  await prisma.$disconnect();
}

check().catch(console.error);
