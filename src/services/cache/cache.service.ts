import { redisClient, isRedisAvailable } from '../../config/redis.js';
import { logger } from '../../config/logger.js';

export const cacheService = {
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!redisClient || !isRedisAvailable) return null;
      const data = await redisClient.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err) {
      logger.warn({ key, error: (err as Error).message }, '[CACHE] Failed to get key from Redis.');
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds = 120): Promise<void> {
    try {
      if (!redisClient || !isRedisAvailable) return;
      await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      logger.warn({ key, error: (err as Error).message }, '[CACHE] Failed to set key in Redis.');
    }
  },

  async del(key: string): Promise<void> {
    try {
      if (!redisClient || !isRedisAvailable) return;
      await redisClient.del(key);
    } catch (err) {
      logger.warn({ key, error: (err as Error).message }, '[CACHE] Failed to delete key from Redis.');
    }
  },

  async delPattern(pattern: string): Promise<void> {
    try {
      if (!redisClient || !isRedisAvailable) return;
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err) {
      logger.warn({ pattern, error: (err as Error).message }, '[CACHE] Failed to delPattern in Redis.');
    }
  },

  async getVersion(prefix: string): Promise<number> {
    try {
      if (!redisClient || !isRedisAvailable) return 1;
      const ver = await redisClient.get(`ver:${prefix}`);
      return ver ? parseInt(ver, 10) : 1;
    } catch {
      return 1;
    }
  },

  async bumpVersion(prefix: string): Promise<number> {
    try {
      if (!redisClient || !isRedisAvailable) return 1;
      return await redisClient.incr(`ver:${prefix}`);
    } catch {
      return 1;
    }
  },
};
