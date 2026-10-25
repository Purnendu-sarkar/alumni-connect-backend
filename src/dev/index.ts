import type { Router } from 'express';

import { env } from '../config/index.js';
import { logger } from '../config/logger.js';
import { demoRouter } from './demo.routes.js';
import { demoService } from './demo.service.js';

/**
 * Initializes development demo data if enabled in local environment.
 * Safe no-op in production or if DEMO_ENABLED=false.
 */
export async function initializeDevDemo(): Promise<void> {
  if (env.NODE_ENV === 'production' || !env.DEMO_ENABLED) {
    return;
  }
  await demoService.initializeDemoFixtures();
}

/**
 * Mounts development demo API endpoints if enabled in local environment.
 * In production or when DEMO_ENABLED=false, this is a clean no-op.
 */
export function registerDemoRoutes(router: Router): void {
  if (env.NODE_ENV === 'production' || !env.DEMO_ENABLED) {
    return;
  }
  router.use('/dev/demo', demoRouter);
  logger.info('Development Demo module mounted at /api/v1/dev/demo');
}

export { demoService } from './demo.service.js';
