import { Redis } from 'ioredis';
import { RedisStore } from 'rate-limit-redis';

import { env } from './index.js';
import { logger } from './logger.js';

let redisClient: Redis | null = null;
let isRedisAvailable = false;

if (env.REDIS_URL) {
  try {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn('[REDIS] Max connection retries reached. Operating in in-memory fallback mode.');
          return null;
        }
        return Math.min(times * 200, 1000);
      },
    });

    redisClient.on('connect', () => {
      isRedisAvailable = true;
      logger.info('[REDIS] Connected to distributed Redis instance.');
    });

    redisClient.on('ready', () => {
      isRedisAvailable = true;
    });

    redisClient.on('error', (err) => {
      isRedisAvailable = false;
      logger.warn({ error: err.message }, '[REDIS] Connection error encountered. Falling back to in-memory mode.');
    });

    redisClient.on('close', () => {
      isRedisAvailable = false;
    });

    // Attempt initial async connection safely
    redisClient.connect().catch((err) => {
      logger.warn({ error: err.message }, '[REDIS] Initial connection failed. Operating in in-memory fallback mode.');
    });
  } catch (error) {
    logger.warn({ error }, '[REDIS] Failed to initialize Redis client. Falling back to in-memory.');
    redisClient = null;
    isRedisAvailable = false;
  }
}

/**
 * Creates a RedisStore for express-rate-limit if Redis is active,
 * or returns undefined to fall back cleanly to MemoryStore.
 */
export function getRateLimitStore(prefix: string) {
  if (redisClient) {
    return new RedisStore({
      // @ts-expect-error - ioredis call signature is compatible
      sendCommand: (...args: string[]) => redisClient!.call(...args),
      prefix: `rl:${prefix}:`,
    });
  }
  return undefined;
}

export { redisClient, isRedisAvailable };
