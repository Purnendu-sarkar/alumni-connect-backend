import argon2 from 'argon2';

export const passwordService = {
  hash(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  },

  verify(hash: string, password: string) {
    return argon2.verify(hash, password);
  },
};
