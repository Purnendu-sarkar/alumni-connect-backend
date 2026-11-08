import { createServer } from 'node:http';

import { app } from './app.js';
import { prisma } from './config/database.js';
import { env } from './config/index.js';
import { logger } from './config/logger.js';
import { bootstrapPlatform } from './services/bootstrap/bootstrap.service.js';
import { emailService } from './services/email/email.service.js';

const server = createServer(app);

let isShuttingDown = false;

async function startServer(): Promise<void> {
  try {
    // 1. Verify database connection
    await prisma.$queryRaw`SELECT 1`;

    console.log('Connected to the database successfully.');

    // 2. Verify Email Transport (Google Gmail SMTP or Local fallback)
    await emailService.verifyEmailTransport().catch((err) => {
      logger.warn({ err: err.message }, 'Email transport verification encountered an issue.');
    });

    // 3. Bootstrap platform Super Admin
    await bootstrapPlatform();

    // 4. Start HTTP server
    await new Promise<void>((resolve, reject) => {
      const onListenError = (error: Error) => {
        reject(error);
      };

      server.once('error', onListenError);

      server.listen(env.PORT, () => {
        server.off('error', onListenError);
        resolve();
      });
    });

    server.on('error', (error) => {
      logger.error({ err: error }, 'HTTP server encountered an error.');
    });

    console.log(`Server is running on port ${env.PORT}`);
  } catch (error) {
    logger.fatal(
      { err: error },
      'Unable to start AlumniConnect Backend.',
    );

    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      logger.error(
        { err: disconnectError },
        'Database cleanup failed.',
      );
    }

    process.exit(1);
  }
}

// Start application
void startServer();

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log(`Received ${signal}. Shutting down gracefully...`);

  if (server.listening) {
    await new Promise<void>((resolve) => {
      server.close((error) => {
        if (error) {
          logger.error(
            { err: error },
            'HTTP server failed to close cleanly.',
          );
          process.exitCode = 1;
        }

        resolve();
      });
    });
  }

  try {
    await prisma.$disconnect();
    console.log('Database connection closed successfully.');
  } catch (error) {
    logger.error(
      { err: error },
      'Failed to disconnect from database.',
    );
    process.exitCode = 1;
  }

  console.log('AlumniConnect Backend shutdown completed.');
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});