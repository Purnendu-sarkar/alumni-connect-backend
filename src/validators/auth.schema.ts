import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/\d/, 'Password must include a number.')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol.');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
  email: z.string().email('Enter a valid institutional email address.').trim().toLowerCase(),
  password: passwordSchema,
  role: z.enum(['STUDENT', 'ALUMNI']),
  department: z.string().trim().min(1, 'Department is required.').max(100),
  batch: z.string().trim().min(1, 'Batch / class year is required.').max(100).optional(),
  universityId: z.string().trim().min(2, 'University ID is required.').max(40), // Institutional ID (e.g. STU-2026-001)
  graduationYear: z.coerce.number().int().min(1950).max(2100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address.').trim().toLowerCase(),
  password: z.string().min(1, 'Enter your password.').max(128),
});

export const setupAccountSchema = z.object({
  token: z.string().min(1, 'Account setup token is required.'),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Email verification token is required.'),
});

export const resendVerificationSchema = z.object({
  email: z.string().email('Enter a valid institutional email address.').trim().toLowerCase(),
});

export const reauthSchema = z.object({
  password: z.string().min(1, 'Password is required for re-authentication.').max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address.').trim().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required.'),
  password: passwordSchema,
});
