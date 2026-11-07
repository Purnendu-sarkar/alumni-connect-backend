import { Redis } from 'ioredis';

import { env } from './index.js';
import { logger } from './logger.js';

let redisClient: Redis | null = null;
let isConnected = false;

// In-memory fallback map when Redis is offline in local dev
const fallbackStore = new Map<string, { value: string; expiresAt: number | null }>();
const fallbackVersions = new Map<string, number>();

try {
  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) {
        logger.warn('Redis reconnection limit reached. Falling back to in-memory cache.');
        return null;
      }
      return Math.min(times * 200, 1000);
    },
    lazyConnect: true,
  });

  redisClient.on('connect', () => {
    isConnected = true;
    logger.info('Redis connected successfully.');
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    logger.warn({ err: err.message }, 'Redis connection warning; in-memory fallback active.');
  });

  // Attempt initial connection asynchronously
  redisClient.connect().catch((err) => {
    isConnected = false;
    logger.warn({ err: err.message }, 'Redis server unavailable at startup; using fallback.');
  });
} catch (error) {
  logger.warn({ err: (error as Error).message }, 'Failed to initialize Redis client.');
}

export const redis = redisClient;

export async function isRedisHealthy(): Promise<boolean> {
  if (!redisClient || !isConnected) return false;
  try {
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (isConnected && redisClient) {
    try {
      const data = await redisClient.get(key);
      return data ? (JSON.parse(data) as T) : null;
    } catch (err) {
      logger.warn({ err }, `Redis cacheGet failed for key: ${key}`);
    }
  }

  // Fallback
  const entry = fallbackStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    fallbackStore.delete(key);
    return null;
  }
  return JSON.parse(entry.value) as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  const serialized = JSON.stringify(value);

  if (isConnected && redisClient) {
    try {
      await redisClient.set(key, serialized, 'EX', ttlSeconds);
      return;
    } catch (err) {
      logger.warn({ err }, `Redis cacheSet failed for key: ${key}`);
    }
  }

  // Fallback
  fallbackStore.set(key, {
    value: serialized,
    expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
  });
}

export async function cacheDel(key: string): Promise<void> {
  if (isConnected && redisClient) {
    try {
      await redisClient.del(key);
      return;
    } catch (err) {
      logger.warn({ err }, `Redis cacheDel failed for key: ${key}`);
    }
  }
  fallbackStore.delete(key);
}

// Version-bump namespaces mandated by SSOT
export type CacheNamespace = 'dir' | 'jobs' | 'events' | 'ann' | 'stories';

export async function getVersion(namespace: CacheNamespace): Promise<number> {
  const key = `${namespace}:v`;
  if (isConnected && redisClient) {
    try {
      const val = await redisClient.get(key);
      if (val) return parseInt(val, 10);
      await redisClient.set(key, '1');
      return 1;
    } catch {
      // fallback on error
    }
  }
  return fallbackVersions.get(key) ?? 1;
}

export async function bumpVersion(namespace: CacheNamespace): Promise<number> {
  const key = `${namespace}:v`;
  if (isConnected && redisClient) {
    try {
      const newVer = await redisClient.incr(key);
      return newVer;
    } catch {
      // fallback on error
    }
  }
  const current = fallbackVersions.get(key) ?? 1;
  const next = current + 1;
  fallbackVersions.set(key, next);
  return next;
}

