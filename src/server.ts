import { createServer } from 'node:http';

import { app } from './app.js';
import { prisma } from './config/database.js';
import { env } from './config/index.js';
import { logger } from './config/logger.js';
import { bootstrapPlatform } from './services/bootstrap/bootstrap.service.js';

const server = createServer(app);

async function startServer() {
  try {
    // 1. Ensure database connectivity
    await prisma.$queryRaw`SELECT 1`.catch((err) => {
      logger.warn({ err: err.message }, 'Database connection not yet ready at boot; continuing.');
    });

    // 2. Bootstrap platform Super Admin idempotently
    await bootstrapPlatform().catch((err) => {
      logger.warn({ err: err.message }, 'Super Admin bootstrap encountered warning.');
    });

    // 3. Begin listening for incoming HTTP requests
    server.listen(env.PORT, () => {
      logger.info(
        { port: env.PORT, institution: env.INSTITUTION_NAME, environment: env.NODE_ENV },
        'AlumniConnect Single-University API is listening',
      );
    });
  } catch (error) {
    logger.fatal(error, 'Startup lifecycle failed. Halting process to prevent unauthenticated/inconsistent state.');
    await prisma.$disconnect();
    process.exit(1);
  }
}

void startServer();

async function shutdown(signal: string) {
  logger.info({ signal }, 'Gracefully shutting down server');
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
