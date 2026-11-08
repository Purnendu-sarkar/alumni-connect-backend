import { Redis } from 'ioredis';

import { env } from './index.js';
import { logger } from './logger.js';

let redisClient: Redis | null = null;
let isConnected = false;
let hasWarnedAboutRedis = false;

// In-memory fallback when Redis is unavailable.
const fallbackStore = new Map<
  string,
  { value: string; expiresAt: number | null }
>();

const fallbackVersions = new Map<string, number>();

function logRedisUnavailable(): void {
  if (hasWarnedAboutRedis) return;

  hasWarnedAboutRedis = true;

  logger.warn(
    'Redis is unavailable. In-memory fallback is active; Redis data will not be shared across server instances.',
  );
}

try {
  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,

    retryStrategy(times) {
      if (times > 3) {
        return null;
      }

      return Math.min(times * 200, 1000);
    },

    lazyConnect: true,
  });

  // TCP connection established.
  redisClient.on('connect', () => {
    isConnected = false;
  });

  // Redis is ready to accept commands.
  redisClient.on('ready', () => {
    isConnected = true;
    hasWarnedAboutRedis = false;
  });

  redisClient.on('error', () => {
    isConnected = false;
  });

  redisClient.on('close', () => {
    isConnected = false;
  });

  redisClient.on('reconnecting', () => {
    isConnected = false;
  });

  redisClient.on('end', () => {
    isConnected = false;
    logRedisUnavailable();
  });

  // Initial connection attempt.
  void redisClient.connect().catch(() => {
    isConnected = false;
  });
} catch {
  isConnected = false;
  logRedisUnavailable();
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

  const entry = fallbackStore.get(key);

  if (!entry) return null;

  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    fallbackStore.delete(key);
    return null;
  }

  return JSON.parse(entry.value) as T;
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 300,
): Promise<void> {
  const serialized = JSON.stringify(value);

  if (isConnected && redisClient) {
    try {
      if (ttlSeconds > 0) {
        await redisClient.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await redisClient.set(key, serialized);
      }

      return;
    } catch (err) {
      logger.warn({ err }, `Redis cacheSet failed for key: ${key}`);
    }
  }

  fallbackStore.set(key, {
    value: serialized,
    expiresAt:
      ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
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

// Version-bump namespaces mandated by SSOT.
export type CacheNamespace = 'dir' | 'jobs' | 'events' | 'ann' | 'stories';

export async function getVersion(
  namespace: CacheNamespace,
): Promise<number> {
  const key = `${namespace}:v`;

  if (isConnected && redisClient) {
    try {
      const val = await redisClient.get(key);

      if (val !== null) {
        return parseInt(val, 10);
      }

      await redisClient.set(key, '1');
      return 1;
    } catch {
      // Use in-memory fallback.
    }
  }

  return fallbackVersions.get(key) ?? 1;
}

export async function bumpVersion(
  namespace: CacheNamespace,
): Promise<number> {
  const key = `${namespace}:v`;

  if (isConnected && redisClient) {
    try {
      return await redisClient.incr(key);
    } catch {
      // Use in-memory fallback.
    }
  }

  const current = fallbackVersions.get(key) ?? 1;
  const next = current + 1;

  fallbackVersions.set(key, next);

  return next;
}