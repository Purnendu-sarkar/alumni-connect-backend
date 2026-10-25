import { z } from 'zod';

const nullableOrEmptyString = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((val) => (val === '' ? null : val));

const urlPattern = /^https?:\/\/.+/i;

const nullableUrl = z
  .union([z.string().trim().regex(urlPattern, 'URL must start with http:// or https://'), z.literal(''), z.null()])
  .optional()
  .transform((val) => (val === '' || val === null ? null : val));

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100).optional(),
  headline: nullableOrEmptyString(150),
  bio: nullableOrEmptyString(1000),
  location: nullableOrEmptyString(100),
  phone: nullableOrEmptyString(30),
  phonePublic: z.boolean().optional(),
  linkedinUrl: nullableUrl,
  websiteUrl: nullableUrl,
  githubUrl: nullableUrl,

  department: z.string().trim().min(1).max(100).optional(),
  batch: z.string().trim().min(1).max(100).optional(),

  // Student-specific fields
  studentId: nullableOrEmptyString(100),
  currentSemester: nullableOrEmptyString(50),
  admissionYear: nullableOrEmptyString(20),
  expectedGraduationYear: nullableOrEmptyString(20),

  // Alumni-specific fields
  graduationYear: nullableOrEmptyString(20),
  academicId: nullableOrEmptyString(100),
  employmentStatus: nullableOrEmptyString(100),
  currentCompany: nullableOrEmptyString(100),
  position: nullableOrEmptyString(100),

  skills: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  interests: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  onboardingCompleted: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
