import { createServer } from 'node:http';

import { app } from './app.js';
import { prisma } from './config/database.js';
import { env } from './config/index.js';
import { logger } from './config/logger.js';

import { bootstrapService } from './services/bootstrap/bootstrap.service.js';

const server = createServer(app);

async function startServer() {
  try {
    // Step 1: Ensure database connectivity
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection established and verified.');

    // Step 2: Ensure canonical roles, permissions, and permanent Super Admin
    await bootstrapService.initialize();

    // Step 3: Initialize development demo fixtures if enabled
    if (env.DEMO_ENABLED && env.NODE_ENV !== 'production') {
      try {
        const { initializeDevDemo } = await import('./dev/index.js');
        await initializeDevDemo();
      } catch (err) {
        logger.warn(err, 'Development demo module initialization skipped or not bundled.');
      }
    }

    // Step 4: Begin listening for incoming HTTP requests
    server.listen(env.PORT, () => {
      logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'AlumniConnect API is listening');
    });
  } catch (error) {
    logger.fatal(error, 'Startup lifecycle failed. Halting process to prevent unauthenticated/inconsistent state.');
    await prisma.$disconnect();
    process.exit(1);
  }
}

void startServer();

async function shutdown(signal: string) {
  logger.info({ signal }, 'Gracefully shutting down');
  server.close(async (closeError) => {
    await prisma.$disconnect();
    if (closeError) {
      logger.error(closeError, 'HTTP server failed to close cleanly');
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
