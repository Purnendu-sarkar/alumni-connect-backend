import type { Role, UserStatus, VerificationStatus } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: {
        id: string;
        email: string;
        name: string;
        role: Role;
        status: UserStatus;
        verificationStatus: VerificationStatus;
        sessionId?: string;
        familyId?: string;
        permissions?: string[];
      };
      session?: {
        id: string;
        familyId: string;
        reauthUntil?: Date | null;
      };
    }
  }
}

export {};
