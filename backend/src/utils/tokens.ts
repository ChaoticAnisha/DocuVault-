import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';

// NOTE: 15-day access tokens configured per assignment requirements.
// Production best practice would use 15-minute tokens with refresh rotation
// to minimise the window of exposure if a token is stolen (OWASP JWT Security).
const ACCESS_TOKEN_TTL = '15d';
const REFRESH_TOKEN_BYTES = 64;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Extra claims embedded in the access token so middleware can authorize without a DB hit. */
export interface AccessTokenClaims {
  email: string;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
}

/** SHA-256 hash of a token, returned as a hex string. */
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/** Sign a 15-day JWT access token with JWT_SECRET (per assignment requirements). */
export const generateAccessToken = (
  userId: string,
  role: Role,
  claims?: AccessTokenClaims
): string =>
  jwt.sign(
    {
      sub: userId,
      role,
      email: claims?.email,
      isEmailVerified: claims?.isEmailVerified,
      mfaEnabled: claims?.mfaEnabled,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: ACCESS_TOKEN_TTL }
  );

/**
 * Create a random 64-byte refresh token. The SHA-256 hash is stored in the
 * RefreshToken table with a 7-day expiry; the raw token is returned to the caller.
 */
export const generateRefreshToken = async (userId: string): Promise<string> => {
  const raw = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return raw;
};

/**
 * Revoke the supplied refresh token and issue a fresh access + refresh pair for
 * the user. Returns both raw tokens.
 */
export const rotateRefreshToken = async (
  oldTokenHash: string,
  userId: string
): Promise<{ accessToken: string; refreshToken: string }> => {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: oldTokenHash, userId },
    data: { isRevoked: true },
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found while rotating refresh token');

  const accessToken = generateAccessToken(user.id, user.role, {
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    mfaEnabled: user.mfaEnabled,
  });
  const refreshToken = await generateRefreshToken(user.id);

  return { accessToken, refreshToken };
};
