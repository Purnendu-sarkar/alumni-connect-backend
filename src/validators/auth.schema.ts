import { z } from 'zod';

const optionalTrimmedText = z.string().trim().min(1).max(100).optional();

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(12).max(128),
  universitySlug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  role: z.enum(['STUDENT', 'ALUMNI']),
  batch: optionalTrimmedText,
  department: optionalTrimmedText,
  currentCompany: optionalTrimmedText,
  position: optionalTrimmedText,
  skills: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
});

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(128),
});
