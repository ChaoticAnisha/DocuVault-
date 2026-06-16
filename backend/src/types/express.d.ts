import { Role, RefreshToken } from '@prisma/client';

declare global {
  namespace Express {
    // Extending the Passport-declared User interface so req.user carries our
    // fields without conflicting with passport's own augmentation.
    interface User {
      id: string;
      email: string;
      role: Role;
      isEmailVerified: boolean;
      mfaEnabled: boolean;
    }

    interface Request {
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
