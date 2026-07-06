import { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { verifyAccessToken as verifyAccessJwt } from '../utils/jwt';

const unauthorized = (res: Response, message = 'Authentication required'): void => {
  res.status(401).json({ success: false, message });
};

/** Hash a refresh token the same way it is stored in the database. */
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const extractBearer = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return undefined;
};

/**
 * Verify a JWT access token from the Authorization header (Bearer) or the
 * httpOnly "access_token" cookie. Attaches the decoded user to req.user.
 */
export const verifyAccessToken: RequestHandler = (req, res, next) => {
  const token = extractBearer(req) ?? (req.cookies?.access_token as string | undefined);

  if (!token) {
    unauthorized(res, 'No access token provided');
    return;
  }

  try {
    const decoded = verifyAccessJwt(token);
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      isEmailVerified: decoded.isEmailVerified,
      mfaEnabled: decoded.mfaEnabled,
    };
    // isActive enforced at deactivation: all refresh tokens revoked on deactivate,
    // preventing new access tokens from being issued to deactivated accounts.
    next();
  } catch {
    unauthorized(res, 'Invalid or expired access token');
  }
};

/**
 * Verify a refresh token from the httpOnly "refresh_token" cookie. The token is
 * SHA-256 hashed and looked up in the database; it must exist, be unrevoked and
 * unexpired. The matching record is attached to req.refreshTokenRecord.
 */
export const verifyRefreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = req.cookies?.refresh_token as string | undefined;

  if (!token) {
    unauthorized(res, 'No refresh token provided');
    return;
  }

  try {
    const record = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!record || record.isRevoked || record.expiresAt <= new Date()) {
      unauthorized(res, 'Invalid or expired refresh token');
      return;
    }

    req.refreshTokenRecord = record;
    next();
  } catch {
    unauthorized(res, 'Invalid refresh token');
  }
};

/**
 * Restrict a route to the given roles. Use after verifyAccessToken.
 * Example: requireRole([Role.ADMIN])
 */
export const requireRole =
  (roles: Role[]): RequestHandler =>
  (req, res, next) => {
    if (!req.user) {
      unauthorized(res);
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    next();
  };

/** Require the authenticated user's email to be verified. */
export const requireEmailVerified: RequestHandler = (req, res, next) => {
  if (!req.user) {
    unauthorized(res);
    return;
  }
  if (!req.user.isEmailVerified) {
    res.status(403).json({ success: false, message: 'Email verification required' });
    return;
  }
  next();
};

/**
 * If the user has MFA enabled, require that MFA was completed for this session
 * (req.session.mfaVerified). Users without MFA pass through.
 */
export const requireMfa: RequestHandler = (req, res, next) => {
  if (!req.user) {
    unauthorized(res);
    return;
  }
  if (req.user.mfaEnabled && !req.session?.mfaVerified) {
    res.status(403).json({ success: false, message: 'MFA verification required' });
    return;
  }
  next();
};
