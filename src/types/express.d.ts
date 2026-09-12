import type { RoleName } from '../generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        universityId: string;
        role: RoleName;
        permissions: string[];
      };
      tenant?: {
        id: string;
        slug: string;
        domain: string;
      };
    }
  }
}

export {};
