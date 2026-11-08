import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';
import { env } from './index.js';

const parsedSchema = (() => {
  try {
    const url = new URL(env.DATABASE_URL.replace(/^[a-z]+:\/\//, 'http://'));
    return url.searchParams.get('schema') || undefined;
  } catch {
    return undefined;
  }
})();

const adapter = new PrismaPg(
  {
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  },
  parsedSchema ? { schema: parsedSchema } : undefined,
);

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
