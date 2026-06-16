import { Request, Response } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { auditLog } from '../middleware/logger';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

// Safe user fields for admin listings — still excludes secrets.
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  role: true,
  isPremium: true,
  isEmailVerified: true,
  mfaEnabled: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  storageUsed: true,
  storageLimitBytes: true,
  createdAt: true,
  updatedAt: true,
} as const;

const roleSchema = z.object({
  role: z.nativeEnum(Role),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : undefined;
  const role = req.query.role as Role | undefined;
  const isPremium =
    req.query.isPremium === 'true' ? true : req.query.isPremium === 'false' ? false : undefined;
  const locked = req.query.locked === 'true';

  const where = {
    ...(search && {
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { username: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
    ...(role && { role }),
    ...(isPremium !== undefined && { isPremium }),
    ...(locked && { lockedUntil: { gt: new Date() } }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: ADMIN_USER_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ success: true, data: users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const updateUserRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (id === req.user!.id) {
    throw new AppError(400, 'Admins cannot change their own role');
  }

  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'Invalid role value');
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) throw new AppError(404, 'User not found');

  await prisma.user.update({ where: { id }, data: { role: parsed.data.role } });

  await auditLog({
    userId: req.user!.id,
    action: 'ADMIN_ROLE_CHANGED',
    resourceType: 'USER',
    resourceId: id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: { previousRole: target.role, newRole: parsed.data.role },
  });

  res.json({ success: true, message: `User role updated to ${parsed.data.role}` });
});

export const lockUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (id === req.user!.id) throw new AppError(400, 'Cannot lock your own account');

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new AppError(404, 'User not found');

  // Far-future date signals a manual admin lock (vs. auto-lock from failed logins).
  const lockedUntil = new Date('2099-12-31T23:59:59Z');
  await prisma.user.update({ where: { id }, data: { lockedUntil } });

  // Revoke all active sessions.
  await prisma.refreshToken.updateMany({ where: { userId: id }, data: { isRevoked: true } });

  await auditLog({
    userId: req.user!.id,
    action: 'ADMIN_USER_LOCKED',
    resourceType: 'USER',
    resourceId: id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: 'User account locked' });
});

export const unlockUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new AppError(404, 'User not found');

  await prisma.user.update({
    where: { id },
    data: { lockedUntil: null, failedLoginAttempts: 0 },
  });

  await auditLog({
    userId: req.user!.id,
    action: 'ADMIN_USER_UNLOCKED',
    resourceType: 'USER',
    resourceId: id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: 'User account unlocked' });
});

export const getActivityLogs = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;

  const where = {
    ...(userId && { userId }),
    ...(action && { action: { contains: action, mode: 'insensitive' as const } }),
    ...((from || to) && {
      createdAt: {
        ...(from && !isNaN(from.getTime()) && { gte: from }),
        ...(to && !isNaN(to.getTime()) && { lte: to }),
      },
    }),
  };

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { email: true, username: true } } },
    }),
    prisma.activityLog.count({ where }),
  ]);

  res.json({ success: true, data: logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const getDashboardStats = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    totalDocuments,
    storageResult,
    recentFailedLogins,
    lockedAccounts,
    premiumUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.document.count({ where: { isDeleted: false } }),
    prisma.user.aggregate({ _sum: { storageUsed: true } }),
    prisma.activityLog.count({
      where: { action: 'FAILED_LOGIN_ATTEMPT', createdAt: { gte: oneDayAgo } },
    }),
    prisma.user.count({ where: { lockedUntil: { gt: now } } }),
    prisma.user.count({ where: { isPremium: true } }),
  ]);

  res.json({
    success: true,
    stats: {
      totalUsers,
      totalDocuments,
      totalStorageUsedBytes: storageResult._sum.storageUsed?.toString() ?? '0',
      recentFailedLogins,
      lockedAccounts,
      premiumUsers,
    },
  });
});
