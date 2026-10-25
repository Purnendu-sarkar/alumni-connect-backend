import 'dotenv/config';
import { z } from 'zod';

const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url(),
  DIRECT_URL: z.url(),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  COOKIE_SECURE: booleanFromEnv.optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  // Bootstrap Super Admin Configuration (server-only)
  BOOTSTRAP_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_SUPER_ADMIN_PASSWORD: z.string().min(12).optional(),
  BOOTSTRAP_SUPER_ADMIN_NAME: z.string().default('Platform Super Admin'),
  BOOTSTRAP_UNIVERSITY_NAME: z.string().default('AlumniConnect Network'),
  BOOTSTRAP_UNIVERSITY_SLUG: z.string().default('platform-primary'),
  BOOTSTRAP_UNIVERSITY_DOMAIN: z.string().default('alumniconnect.internal'),

  // Development Demo Mode Flag (default-off)
  DEMO_ENABLED: booleanFromEnv.default(false),

  // Mailpit / Local SMTP Email Configuration
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: booleanFromEnv.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('AlumniConnect <noreply@alumniconnect.internal>'),
  APP_FRONTEND_URL: z.string().default('http://localhost:3000'),
}).refine(
  (data) => !(data.NODE_ENV === 'production' && data.DEMO_ENABLED),
  {
    message: 'CRITICAL SECURITY VIOLATION: DEMO_ENABLED must not be enabled in production.',
    path: ['DEMO_ENABLED'],
  },
);

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const details = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join(', ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsedEnvironment.data;
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
export const shouldUseSecureCookies = env.COOKIE_SECURE ?? env.NODE_ENV === 'production';
