import { describe, expect, it } from 'vitest';

import { registerSchema } from '../../src/validators/auth.schema.js';

const baseStudent = {
  name: 'Purnendu Kumar Sarkar',
  email: 'student@nwu.ac.bd',
  password: 'CorrectHorse1!',
  role: 'STUDENT' as const,
  batch: '2026',
  department: 'CSE',
  universityId: '160101',
};

const baseAlumni = {
  name: 'Sadia Rahman',
  email: 'sadia@nwu.ac.bd',
  password: 'CorrectHorse1!',
  role: 'ALUMNI' as const,
  batch: '2020',
  department: 'CSE',
  universityId: '120105',
};

describe('registerSchema', () => {
  it('allows complete student registration', () => {
    expect(registerSchema.safeParse(baseStudent).success).toBe(true);
  });

  it('allows alumni registration', () => {
    expect(registerSchema.safeParse(baseAlumni).success).toBe(true);
  });

  it('rejects registration when email is invalid', () => {
    expect(registerSchema.safeParse({ ...baseStudent, email: 'notanemail' }).success).toBe(false);
  });
});
