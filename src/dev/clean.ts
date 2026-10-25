import 'dotenv/config';

import { prisma } from '../config/database.js';
import { demoService } from './demo.service.js';

async function main() {
  console.log('--- Development Demo Purge Utility ---');
  const result = await demoService.cleanupDemoData();
  console.log(`Deleted ${result.deletedUsers} demo users and ${result.deletedUniversities} demo universities.`);
  console.log('Real tenants and non-demo users remain intact.');
}

main()
  .catch((err) => {
    console.error('Failed to cleanup demo data:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
