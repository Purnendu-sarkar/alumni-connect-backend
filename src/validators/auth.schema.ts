import { z } from 'zod';

const optionalTrimmedText = z.string().trim().min(1).max(100).optional();
const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/\d/, 'Password must include a number.')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol.');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().trim().toLowerCase(),
  password: passwordSchema,
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
}).superRefine((data, context) => {
  if (data.role === 'STUDENT' && (!data.batch || !data.department)) {
    context.addIssue({ code: 'custom', path: ['batch'], message: 'Batch and department are required for students.' });
  }
  if (data.role === 'ALUMNI') {
    for (const field of ['batch', 'department', 'currentCompany', 'position'] as const) {
      if (!data[field]) context.addIssue({ code: 'custom', path: [field], message: 'This field is required for alumni.' });
    }
  }
});

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(128),
});
