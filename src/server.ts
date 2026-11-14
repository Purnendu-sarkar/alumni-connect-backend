import { createServer } from 'node:http';

import { app } from './app.js';
import { prisma } from './config/database.js';
import { env } from './config/index.js';
import { logger } from './config/logger.js';

import { bootstrapService } from './services/bootstrap/bootstrap.service.js';

const server = createServer(app);

async function startServer() {
  try {
    if (env.NODE_ENV === 'development') {
      console.log('\n==================================================');
      console.log('              ALUMNI CONNECT API');
      console.log('==================================================\n');
      logger.info(`[INFO] Environment: ${env.NODE_ENV}`);
      logger.info(`[INFO] Application: AlumniConnect API`);
      logger.info(`[INFO] Port: ${env.PORT}`);
      logger.info('[STARTUP] Initializing application...');
      logger.info('[DATABASE] Connecting to PostgreSQL...');
    }

    // Step 1: Ensure database connectivity
    await prisma.$queryRaw`SELECT 1`;
    logger.info('[SUCCESS] Database connected successfully!');

    // Step 2: Ensure canonical roles, permissions, and permanent Super Admin
    await bootstrapService.initialize();

    // Step 3: Initialize development demo fixtures if enabled
    let demoStatus: 'INITIALIZED' | 'FAILED' | 'DISABLED' = 'DISABLED';
    if (env.DEMO_ENABLED && env.NODE_ENV !== 'production') {
      try {
        const { initializeDevDemo } = await import('./dev/index.js');
        await initializeDevDemo();
        demoStatus = 'INITIALIZED';
      } catch (err) {
        demoStatus = 'FAILED';
        logger.error(err, '[DEMO] Development demo fixture initialization FAILED with error.');
      }
    } else {
      logger.info('[DEMO] Development demo module is disabled (DEMO_ENABLED=false or production mode).');
    }

    // Step 4: Begin listening for incoming HTTP requests
    server.listen(env.PORT, () => {
      if (env.NODE_ENV === 'development') {
        logger.info('[SERVER] API server started successfully.');
        logger.info(`[SERVER] Base URL: http://localhost:${env.PORT}`);
        logger.info(`[SERVER] API Base: http://localhost:${env.PORT}/api/v1`);
        logger.info(`[SERVER] Demo Module Status: ${demoStatus}`);
        console.log('\n==================================================');
        console.log(`       SERVER READY (Demo: ${demoStatus})`);
        console.log('==================================================\n');
      } else {
        logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'AlumniConnect API is listening');
      }
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
