import { describe, expect, it } from 'vitest';

import { registerSchema } from '../../src/validators/auth.schema.js';

const base = { name: 'Ada Lovelace', email: 'ada@example.edu', password: 'CorrectHorse1!', universitySlug: 'demo-university', role: 'STUDENT' as const, batch: '2026', department: 'CSE' };

describe('registerSchema', () => {
  it('allows complete student registration', () => expect(registerSchema.safeParse(base).success).toBe(true));
  it('rejects a weak password', () => expect(registerSchema.safeParse({ ...base, password: 'short' }).success).toBe(false));
  it('requires alumni professional information', () => expect(registerSchema.safeParse({ ...base, role: 'ALUMNI' }).success).toBe(false));
  it('does not accept privileged roles from public registration', () => expect(registerSchema.safeParse({ ...base, role: 'ADMIN' }).success).toBe(false));
});
