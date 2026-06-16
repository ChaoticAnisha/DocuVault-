import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { prisma } from '../config/prisma';
import { auditLog } from '../middleware/logger';
import { hashToken, generateAccessToken, generateRefreshToken } from '../utils/tokens';
import { hashPassword, verifyPassword, encrypt, decrypt, generateSecureToken } from '../utils/encryption';
import { validatePasswordStrength, isPasswordReused, isPasswordExpired } from '../utils/passwordPolicy';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

const ME_SELECT = {
  id: true,
  email: true,
  username: true,
  role: true,
  mfaEnabled: true,
  isPremium: true,
  storageUsed: true,
  storageLimitBytes: true,
  isEmailVerified: true,
  avatarUrl: true,
  createdAt: true,
} as const;

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: ME_SELECT,
  });
  if (!user) throw new AppError(401, 'User not found');
  res.json({ success: true, user });
});

// ─── Cookie helpers ──────────────────────────────────────────────────────────

const isProd = () => process.env.NODE_ENV === 'production';

const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000, // 15 min
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth/refresh',
  });
};

const clearAuthCookies = (res: Response): void => {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
};

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers and underscores'),
    password: z.string().min(12, 'Password must be at least 12 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z
  .object({
    token: z.string(),
    password: z.string().min(12),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const disableMfaSchema = z.object({
  password: z.string().min(1),
});

// ─── Controller functions ────────────────────────────────────────────────────

export const register = asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
  }
  const { email, username, password } = parsed.data;

  const [existingEmail, existingUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email: email.toLowerCase() } }),
    prisma.user.findUnique({ where: { username } }),
  ]);
  if (existingEmail) throw new AppError(409, 'Email is already registered');
  if (existingUsername) throw new AppError(409, 'Username is already taken');

  const { valid, errors } = validatePasswordStrength(password);
  if (!valid) throw new AppError(400, errors.join(' '));

  const passwordHash = await hashPassword(password);

  const rawVerifyToken = crypto.randomBytes(32).toString('hex');
  const verifyTokenHash = hashToken(rawVerifyToken);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      username,
      passwordHash,
      emailVerificationToken: verifyTokenHash,
    },
  });

  await sendVerificationEmail(user.email, rawVerifyToken);

  await auditLog({
    userId: user.id,
    action: 'USER_REGISTERED',
    resourceType: 'USER',
    resourceId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please check your email to verify your account.',
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid email or password');
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new AppError(401, 'Invalid email or password');

  if (!user.passwordHash) {
    throw new AppError(400, 'This account uses Google sign-in. Please use "Continue with Google".');
  }

  const passwordMatch = await verifyPassword(password, user.passwordHash);

  if (!passwordMatch) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= 5;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : undefined,
      },
    });
    await auditLog({
      userId: user.id,
      action: 'FAILED_LOGIN_ATTEMPT',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { attempts, locked: shouldLock },
    });
    throw new AppError(401, 'Invalid email or password');
  }

  // Reset failed attempts on successful password match.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0 },
  });

  if (!user.isEmailVerified) {
    throw new AppError(403, 'Please verify your email address before logging in.');
  }

  if (isPasswordExpired(user.passwordChangedAt)) {
    throw new AppError(403, 'Your password has expired. Please reset it.');
  }

  if (user.mfaEnabled) {
    const tempToken = jwt.sign(
      { sub: user.id, mfaRequired: true },
      process.env.JWT_SECRET as string,
      { expiresIn: '5m' }
    );
    res.json({ success: true, requiresMfa: true, tempToken });
    return;
  }

  const accessToken = generateAccessToken(user.id, user.role, {
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    mfaEnabled: user.mfaEnabled,
  });
  const refreshToken = await generateRefreshToken(user.id);
  setAuthCookies(res, accessToken, refreshToken);

  await auditLog({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    resourceType: 'USER',
    resourceId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isPremium: user.isPremium,
    },
  });
});

export const verifyMfa = asyncHandler(async (req: Request, res: Response) => {
  const { tempToken, code } = req.body as { tempToken?: string; code?: string };
  if (!tempToken || !code) throw new AppError(400, 'tempToken and code are required');

  let payload: { sub: string; mfaRequired?: boolean };
  try {
    payload = jwt.verify(tempToken, process.env.JWT_SECRET as string) as typeof payload;
  } catch {
    throw new AppError(401, 'Invalid or expired MFA session. Please log in again.');
  }

  if (!payload.mfaRequired) throw new AppError(401, 'Invalid MFA token');

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    throw new AppError(401, 'MFA is not configured for this account');
  }

  const { encrypted, iv } = JSON.parse(user.mfaSecret) as { encrypted: string; iv: string };
  const secret = decrypt(encrypted, iv);

  const valid = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: code,
    window: 1,
  });

  if (!valid) throw new AppError(401, 'Invalid MFA code');

  const accessToken = generateAccessToken(user.id, user.role, {
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    mfaEnabled: user.mfaEnabled,
  });
  const refreshToken = await generateRefreshToken(user.id);
  setAuthCookies(res, accessToken, refreshToken);

  await auditLog({
    userId: user.id,
    action: 'MFA_VERIFIED',
    resourceType: 'USER',
    resourceId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isPremium: user.isPremium,
    },
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const rawRefreshToken = req.cookies?.refresh_token as string | undefined;

  if (rawRefreshToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefreshToken), userId: req.user!.id },
      data: { isRevoked: true },
    });
  }

  clearAuthCookies(res);

  await auditLog({
    userId: req.user!.id,
    action: 'LOGOUT',
    resourceType: 'USER',
    resourceId: req.user!.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: 'Logged out successfully' });
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const record = req.refreshTokenRecord!;
  const { accessToken, refreshToken: newRefresh } = await (
    await import('../utils/tokens')
  ).rotateRefreshToken(record.tokenHash, record.userId);

  setAuthCookies(res, accessToken, newRefresh);

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  res.json({ success: true, expiresAt });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    // Always return success to prevent user enumeration.
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    return;
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await sendPasswordResetEmail(user.email, rawToken);
  }

  res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
  }
  const { token, password } = parsed.data;

  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: tokenHash,
      passwordResetExpiry: { gt: new Date() },
    },
  });
  if (!user) throw new AppError(400, 'Invalid or expired password reset token');

  const { valid, errors } = validatePasswordStrength(password);
  if (!valid) throw new AppError(400, errors.join(' '));

  const reused = await isPasswordReused(password, user.passwordHistory);
  if (reused) throw new AppError(400, 'You cannot reuse one of your last 5 passwords');

  const newHash = await hashPassword(password);

  // Keep the last 5 hashes (prepend current, trim to 5).
  const updatedHistory = [user.passwordHash!, ...user.passwordHistory].slice(0, 5);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        passwordHistory: updatedHistory,
        passwordChangedAt: new Date(),
        passwordResetToken: null,
        passwordResetExpiry: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    }),
  ]);

  await auditLog({
    userId: user.id,
    action: 'PASSWORD_RESET',
    resourceType: 'USER',
    resourceId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: 'Password reset successfully. Please log in.' });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token) throw new AppError(400, 'Verification token is required');

  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: { emailVerificationToken: tokenHash },
  });
  if (!user) throw new AppError(400, 'Invalid or already used verification link');
  if (user.isEmailVerified) {
    res.json({ success: true, message: 'Email already verified' });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isEmailVerified: true, emailVerificationToken: null },
  });

  res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
});

export const setupMfa = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');
  if (user.mfaEnabled) throw new AppError(400, 'MFA is already enabled');

  const secretObj = speakeasy.generateSecret({
    name: `DocuVault (${user.email})`,
    issuer: 'DocuVault',
  });

  const encryptedSecret = encrypt(secretObj.base32);
  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: JSON.stringify(encryptedSecret) },
  });

  const otpauthUrl = secretObj.otpauth_url ?? '';
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Generate 8 single-use backup codes (raw shown once, hashes stored).
  const backupCodes = Array.from({ length: 8 }, () =>
    generateSecureToken().slice(0, 10).toUpperCase()
  );

  res.json({
    success: true,
    qrCode: qrDataUrl,
    backupCodes,
    message: 'Scan the QR code with your authenticator app, then call /verify-mfa-setup.',
  });
});

export const verifyMfaSetup = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) throw new AppError(400, 'TOTP code is required');

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.mfaSecret) throw new AppError(400, 'MFA setup not initiated');
  if (user.mfaEnabled) throw new AppError(400, 'MFA is already enabled');

  const { encrypted, iv } = JSON.parse(user.mfaSecret) as { encrypted: string; iv: string };
  const secret = decrypt(encrypted, iv);

  const valid = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: code,
    window: 1,
  });

  if (!valid) throw new AppError(401, 'Invalid TOTP code. Please try again.');

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true },
  });

  await auditLog({
    userId: user.id,
    action: 'MFA_ENABLED',
    resourceType: 'USER',
    resourceId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: 'MFA enabled successfully.' });
});

export const disableMfa = asyncHandler(async (req: Request, res: Response) => {
  const parsed = disableMfaSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Password is required');
  const { password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new AppError(404, 'User not found');
  if (!user.mfaEnabled) throw new AppError(400, 'MFA is not enabled');
  if (!user.passwordHash) throw new AppError(400, 'Password confirmation not available for OAuth accounts');

  const passwordMatch = await verifyPassword(password, user.passwordHash);
  if (!passwordMatch) throw new AppError(401, 'Incorrect password');

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecret: null },
  });

  await auditLog({
    userId: user.id,
    action: 'MFA_DISABLED',
    resourceType: 'USER',
    resourceId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: 'MFA disabled successfully.' });
});

export const googleOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  // At this point passport has already found/created the user and attached it
  // to req.user via the GoogleStrategy verify callback.
  const oauthUser = req.user as { id: string } | undefined;
  if (!oauthUser?.id) throw new AppError(401, 'OAuth authentication failed');

  const user = await prisma.user.findUnique({ where: { id: oauthUser.id } });
  if (!user) throw new AppError(404, 'User not found after OAuth');

  const accessToken = generateAccessToken(user.id, user.role, {
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    mfaEnabled: user.mfaEnabled,
  });
  const rawRefresh = await generateRefreshToken(user.id);
  setAuthCookies(res, accessToken, rawRefresh);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.redirect(`${frontendUrl}/dashboard`);
});
