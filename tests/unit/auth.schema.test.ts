import { describe, expect, it } from 'vitest';

import { registerSchema } from '../../src/validators/auth.schema.js';

const baseStudent = {
  name: 'পূর্ণেন্দু কুমার সরকার',
  email: 'student@example.edu',
  password: 'CorrectHorse1!',
  universitySlug: 'demo-university',
  role: 'STUDENT' as const,
  batch: '2026',
  department: 'CSE',
  studentId: '160101',
  currentSemester: '8th',
};

const baseAlumniWithoutJob = {
  name: 'Sadia Rahman',
  email: 'sadia@example.edu',
  password: 'CorrectHorse1!',
  universitySlug: 'demo-university',
  role: 'ALUMNI' as const,
  batch: '2020',
  department: 'CSE',
  employmentStatus: 'seeking_employment',
};

const baseAlumniWithJob = {
  ...baseAlumniWithoutJob,
  employmentStatus: 'employed',
  currentCompany: 'Pathao',
  position: 'Software Engineer',
};

describe('registerSchema', () => {
  it('allows complete student registration with Unicode/Bengali name', () => {
    expect(registerSchema.safeParse(baseStudent).success).toBe(true);
  });

  it('allows alumni registration without an existing job', () => {
    expect(registerSchema.safeParse(baseAlumniWithoutJob).success).toBe(true);
  });

  it('allows alumni registration with company and position', () => {
    expect(registerSchema.safeParse(baseAlumniWithJob).success).toBe(true);
  });

  it('rejects registration when batch is missing', () => {
    expect(registerSchema.safeParse({ ...baseStudent, batch: '' }).success).toBe(false);
  });

  it('rejects registration when department is missing', () => {
    expect(registerSchema.safeParse({ ...baseStudent, department: '' }).success).toBe(false);
  });

  it('rejects a weak password', () => {
    expect(registerSchema.safeParse({ ...baseStudent, password: 'short' }).success).toBe(false);
  });

  it('does not accept privileged roles from public registration', () => {
    expect(registerSchema.safeParse({ ...baseStudent, role: 'ADMIN' }).success).toBe(false);
  });
});
