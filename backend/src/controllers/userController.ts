import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { auditLog } from '../middleware/logger';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { hashPassword, verifyPassword } from '../utils/encryption';
import { validatePasswordStrength, isPasswordReused } from '../utils/passwordPolicy';

// Fields deliberately withheld from every profile response.
const PROFILE_SELECT = {
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

// ─── Schemas ─────────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers and underscores')
    .optional(),
  avatarUrl: z.string().url('Invalid avatar URL').max(500).optional(),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(12, 'Password must be at least 12 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password confirmation is required'),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: PROFILE_SELECT,
  });
  if (!user) throw new AppError(404, 'User not found');
  res.json({ success: true, user });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  // Parse only the whitelisted fields — req.body is never spread directly.
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
  }

  const { username, avatarUrl } = parsed.data;
  if (!username && !avatarUrl) {
    throw new AppError(400, 'No updatable fields provided');
  }

  if (username) {
    const taken = await prisma.user.findFirst({
      where: { username, NOT: { id: req.user!.id } },
    });
    if (taken) throw new AppError(409, 'Username is already taken');
  }

  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: { ...(username && { username }), ...(avatarUrl && { avatarUrl }) },
    select: PROFILE_SELECT,
  });

  await auditLog({
    userId: req.user!.id,
    action: 'PROFILE_UPDATED',
    resourceType: 'USER',
    resourceId: req.user!.id,
    req,
    metadata: { fields: Object.keys(parsed.data) },
  });

  res.json({ success: true, user: updated });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, passwordHash: true, passwordHistory: true },
  });
  if (!user?.passwordHash) throw new AppError(400, 'Password change is not available for OAuth accounts');

  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) throw new AppError(401, 'Current password is incorrect');

  if (currentPassword === newPassword) {
    throw new AppError(400, 'New password must differ from current password');
  }

  const { valid, errors } = validatePasswordStrength(newPassword);
  if (!valid) throw new AppError(400, errors.join(' '));

  const reused = await isPasswordReused(newPassword, user.passwordHistory);
  if (reused) throw new AppError(400, 'You cannot reuse one of your last 5 passwords');

  const newHash = await hashPassword(newPassword);
  const updatedHistory = [user.passwordHash, ...user.passwordHistory].slice(0, 5);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        passwordHistory: updatedHistory,
        passwordChangedAt: new Date(),
      },
    }),
    // Revoke all refresh tokens — forces re-login on all other devices.
    prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    }),
  ]);

  await auditLog({
    userId: user.id,
    action: 'PASSWORD_CHANGED',
    resourceType: 'USER',
    resourceId: user.id,
    req,
  });

  res.json({ success: true, message: 'Password changed. Please log in again.' });
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors[0].message);
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, passwordHash: true },
  });
  if (!user) throw new AppError(404, 'User not found');
  if (!user.passwordHash) throw new AppError(400, 'Account deletion requires password confirmation');

  const matches = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!matches) throw new AppError(401, 'Incorrect password');

  const tombstoneEmail = `deleted_${uuidv4()}@deleted.invalid`;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        email: tombstoneEmail,
        username: `deleted_${uuidv4().slice(0, 8)}`,
        passwordHash: null,
        mfaSecret: null,
        mfaEnabled: false,
        avatarUrl: null,
        googleId: null,
        emailVerificationToken: null,
        passwordResetToken: null,
        passwordResetExpiry: null,
        stripeCustomerId: null,
        passwordHistory: [],
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    }),
  ]);

  await auditLog({
    userId: user.id,
    action: 'ACCOUNT_DELETED',
    resourceType: 'USER',
    resourceId: user.id,
    req,
  });

  res.clearCookie('access_token');
  res.clearCookie('refresh_token', { path: '/api/auth/refresh' });

  res.json({ success: true, message: 'Account deleted. We are sorry to see you go.' });
});

export const exportData = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, username: true, role: true,
        isPremium: true, mfaEnabled: true, isEmailVerified: true,
        createdAt: true, storageUsed: true,
      },
    });

    const documents = await prisma.document.findMany({
      where: { ownerId: userId, isDeleted: false },
      select: {
        id: true, title: true, mimeType: true,
        sizeBytes: true, createdAt: true,
      },
    });

    const activityLogs = await prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { action: true, resourceType: true, createdAt: true },
    });

    const exportPayload = {
      exportDate: new Date().toISOString(),
      exportVersion: '1.0',
      gdprNotice:
        'This file contains all personal data held about you in DocuVault, exported under GDPR Article 20 (Right to Data Portability).',
      profile: user,
      documents: { count: documents.length, items: documents },
      activitySummary: { count: activityLogs.length, recentActions: activityLogs },
    };

    await auditLog({ userId, action: 'DATA_EXPORTED', req });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="docuvault-export-' + userId + '.json"'
    );
    return res.status(200).json(exportPayload);
  } catch (error) {
    return next(error);
  }
});
