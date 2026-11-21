/**
 * Idempotent Job Title Cleanup Script
 *
 * Strips artificial moderation suffixes from Job.title in PostgreSQL
 * (e.g., "(Fresh Submission)", "(In Verification)", "(Rejected Submission)", "(Revisions Needed)", "(Changes Requested Submission)")
 * and invalidates Redis caches so clean job titles reflect across all views immediately.
 *
 * 100% Pure English Latin characters (0 Bengali characters).
 */

import { prisma } from '../src/config/database.js';
import { cacheService } from '../src/services/cache/cache.service.js';

const SUFFIXES_TO_STRIP = [
  ' (Fresh Submission)',
  ' (In Verification)',
  ' (Rejected Submission)',
  ' (Revisions Needed)',
  ' (Changes Requested Submission)',
];

async function findJobsWithRetry(retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await prisma.job.findMany({
        where: {
          OR: SUFFIXES_TO_STRIP.map((suffix) => ({
            title: { contains: suffix.trim() },
          })),
        },
        select: { id: true, title: true },
      });
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`[RETRY] Neon DB waking up (attempt ${attempt}/${retries}). Retrying in 2s...`);
      await new Promise((res) => setTimeout(res, 2000));
    }
  }
  return [];
}

async function main() {
  console.log('==============================================================================');
  console.log('>>> [START] IDEMPOTENT JOB TITLE CLEANUP');
  console.log('==============================================================================');

  const jobsToClean = await findJobsWithRetry(4);

  console.log(`Found ${jobsToClean.length} job(s) requiring title cleanup.`);

  let updatedCount = 0;
  for (const job of jobsToClean) {
    let cleanTitle = job.title;
    for (const suffix of SUFFIXES_TO_STRIP) {
      if (cleanTitle.includes(suffix)) {
        cleanTitle = cleanTitle.replace(suffix, '');
      }
    }
    // Also remove any remaining trimmed suffix if spaces differed
    cleanTitle = cleanTitle.replace(/\s*\((Fresh Submission|In Verification|Rejected Submission|Revisions Needed|Changes Requested Submission)\)\s*$/i, '').trim();

    if (cleanTitle !== job.title) {
      await prisma.job.update({
        where: { id: job.id },
        data: { title: cleanTitle },
      });
      updatedCount++;
      console.log(`[UPDATED] "${job.title}" -> "${cleanTitle}" (ID: ${job.id})`);
    }
  }

  console.log(`\nSuccessfully cleaned ${updatedCount} job titles in PostgreSQL.`);

  // Invalidate Redis caches
  console.log('\nInvalidating Redis caches...');
  try {
    await Promise.all([
      cacheService.bumpVersion('jobs'),
      cacheService.delPattern('jobs:*'),
      cacheService.delPattern('moderation:*'),
      cacheService.delPattern('admin:*'),
      cacheService.delPattern('stats:*'),
    ]);
    console.log('[OK] Redis job and moderation caches invalidated successfully.');
  } catch (err) {
    console.warn('[WARN] Redis cache flush encountered minor error:', (err as Error).message);
  }

  // Verification query
  const remainingPolluted = await prisma.job.count({
    where: {
      OR: [
        { title: { contains: 'Submission' } },
        { title: { contains: 'In Verification' } },
        { title: { contains: 'Revisions Needed' } },
      ],
    },
  });

  console.log(`\n[VERIFICATION] Remaining polluted job titles in database: ${remainingPolluted}`);
  if (remainingPolluted === 0) {
    console.log('[SUCCESS] All job titles are 100% clean!');
  } else {
    console.warn(`[WARN] ${remainingPolluted} jobs still contain target keywords.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[ERROR] Job title cleanup failed:', err);
  process.exit(1);
});
