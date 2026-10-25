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

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
    email: z.email('Enter a valid email address.').trim().toLowerCase(),
    password: passwordSchema,
    universitySlug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9-]+$/, 'University code may only contain lowercase letters, numbers, and hyphens.'),
    role: z.enum(['STUDENT', 'ALUMNI']),
    batch: z.string().trim().min(1, 'Batch / graduation year is required.').max(100),
    department: z.string().trim().min(1, 'Department is required.').max(100),

    // Student fields
    studentId: optionalTrimmedText,
    currentSemester: optionalTrimmedText,
    admissionYear: optionalTrimmedText,
    expectedGraduationYear: optionalTrimmedText,

    // Alumni fields
    graduationYear: optionalTrimmedText,
    academicId: optionalTrimmedText,
    employmentStatus: optionalTrimmedText,
    currentCompany: optionalTrimmedText,
    position: optionalTrimmedText,

    skills: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
    interests: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  })
  .superRefine((data, context) => {
    if (!data.batch || !data.batch.trim()) {
      context.addIssue({ code: 'custom', path: ['batch'], message: 'Batch is required.' });
    }
    if (!data.department || !data.department.trim()) {
      context.addIssue({ code: 'custom', path: ['department'], message: 'Department is required.' });
    }
  });

export const loginSchema = z.object({
  email: z.email('Enter a valid email address.').trim().toLowerCase(),
  password: z.string().min(1, 'Enter your password.').max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address.').trim().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Token is required.'),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1, 'Verification token is required.'),
});
