import { Role, RefreshToken } from '@prisma/client';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      email: string;
      role: Role;
      isEmailVerified: boolean;
      mfaEnabled: boolean;
    }

    interface Request {
      user?: AuthUser;
      refreshTokenRecord?: RefreshToken;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    mfaVerified?: boolean;
  }
}

export {};
