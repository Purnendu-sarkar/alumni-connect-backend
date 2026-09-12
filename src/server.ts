import { createServer } from 'node:http';

import { app } from './app.js';
import { prisma } from './config/database.js';
import { env } from './config/index.js';
import { logger } from './config/logger.js';

const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'AlumniConnect API is listening');
});

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
