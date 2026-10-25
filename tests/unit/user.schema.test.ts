import { describe, expect, it } from 'vitest';

import { updateProfileSchema } from '../../src/validators/user.schema.js';

describe('updateProfileSchema', () => {
  it('allows updating basic profile information', () => {
    const input = {
      name: 'Purnendu Kumar',
      headline: 'Software Engineer & Tech Lead',
      bio: 'Passionate about building scalable systems.',
      location: 'Khulna, Bangladesh',
      phone: '+8801700000000',
      phonePublic: true,
      linkedinUrl: 'https://linkedin.com/in/purnendu',
      githubUrl: 'https://github.com/purnendu',
      skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
    };
    const result = updateProfileSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('allows clearing optional fields with null or empty string', () => {
    const input = {
      bio: '',
      headline: null,
      linkedinUrl: '',
      websiteUrl: null,
    };
    const result = updateProfileSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bio).toBeNull();
      expect(result.data.headline).toBeNull();
      expect(result.data.linkedinUrl).toBeNull();
      expect(result.data.websiteUrl).toBeNull();
    }
  });

  it('rejects invalid URLs in social links', () => {
    const input = {
      linkedinUrl: 'not-a-valid-url',
    };
    const result = updateProfileSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
