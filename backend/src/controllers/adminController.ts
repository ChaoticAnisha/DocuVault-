import { Request, Response } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { auditLog } from '../middleware/logger';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { securityEvents, SecurityAlert } from '../utils/securityMonitor';

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

// Severity classification — used for the logs filter and returned in summaries.
const SEVERITY_MAP: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  SECURITY_ALERT_BRUTE_FORCE: 'critical',
  SECURITY_ALERT_SUSPICIOUS: 'critical',
  SECURITY_ALERT: 'critical',
  FAILED_LOGIN_ATTEMPT: 'high',
  UNAUTHORIZED_ACCESS_ATTEMPT: 'high',
  ACCOUNT_DELETED: 'medium',
  PASSWORD_RESET: 'medium',
  ADMIN_USER_LOCKED: 'medium',
  ADMIN_USER_UNLOCKED: 'medium',
  ADMIN_ROLE_CHANGED: 'medium',
};

const SEVERITY_ACTIONS: Record<string, string[]> = {
  critical: ['SECURITY_ALERT_BRUTE_FORCE', 'SECURITY_ALERT_SUSPICIOUS', 'SECURITY_ALERT'],
  high: ['FAILED_LOGIN_ATTEMPT', 'UNAUTHORIZED_ACCESS_ATTEMPT'],
  medium: ['ACCOUNT_DELETED', 'PASSWORD_RESET', 'ADMIN_USER_LOCKED', 'ADMIN_USER_UNLOCKED', 'ADMIN_ROLE_CHANGED'],
};

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
  if (id === req.user!.id) throw new AppError(400, 'Admins cannot change their own role');

  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid role value');

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) throw new AppError(404, 'User not found');

  await prisma.user.update({ where: { id }, data: { role: parsed.data.role } });

  await auditLog({
    userId: req.user!.id,
    action: 'ADMIN_ROLE_CHANGED',
    resourceType: 'USER',
    resourceId: id,
    req,
    metadata: { previousRole: target.role, newRole: parsed.data.role },
  });

  res.json({ success: true, message: `User role updated to ${parsed.data.role}` });
});

export const lockUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (id === req.user!.id) throw new AppError(400, 'Cannot lock your own account');

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new AppError(404, 'User not found');

  const lockedUntil = new Date('2099-12-31T23:59:59Z');
  await prisma.user.update({ where: { id }, data: { lockedUntil } });
  await prisma.refreshToken.updateMany({ where: { userId: id }, data: { isRevoked: true } });

  await auditLog({
    userId: req.user!.id,
    action: 'ADMIN_USER_LOCKED',
    resourceType: 'USER',
    resourceId: id,
    req,
  });

  res.json({ success: true, message: 'User account locked' });
});

export const unlockUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new AppError(404, 'User not found');

  await prisma.user.update({ where: { id }, data: { lockedUntil: null, failedLoginAttempts: 0 } });

  await auditLog({
    userId: req.user!.id,
    action: 'ADMIN_USER_UNLOCKED',
    resourceType: 'USER',
    resourceId: id,
    req,
  });

  res.json({ success: true, message: 'User account unlocked' });
});

export const getActivityLogs = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;
  const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
  const startDate = typeof req.query.startDate === 'string' ? new Date(req.query.startDate) : undefined;
  const endDate = typeof req.query.endDate === 'string' ? new Date(req.query.endDate) : undefined;

  // Build action filter: explicit action overrides severity
  let actionFilter: object | undefined;
  if (action) {
    actionFilter = { action: { contains: action, mode: 'insensitive' as const } };
  } else if (severity && SEVERITY_ACTIONS[severity]) {
    actionFilter = { action: { in: SEVERITY_ACTIONS[severity] } };
  }

  const where = {
    ...(userId && { userId }),
    ...actionFilter,
    ...((startDate || endDate) && {
      createdAt: {
        ...(startDate && !isNaN(startDate.getTime()) && { gte: startDate }),
        ...(endDate && !isNaN(endDate.getTime()) && { lte: endDate }),
      },
    }),
  };

  // Run page query, total count, unique users, top actions, and login failures in parallel
  const [logs, total, loginFailures, uniqueUserResult, topActionResult] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { email: true, username: true } } },
    }),
    prisma.activityLog.count({ where }),
    prisma.activityLog.count({
      where: {
        ...where,
        action: 'FAILED_LOGIN_ATTEMPT',
      },
    }),
    // Count distinct userId values — Prisma workaround via groupBy
    prisma.activityLog.groupBy({
      by: ['userId'],
      where: { ...where, userId: { not: null } },
      _count: true,
    }),
    prisma.activityLog.groupBy({
      by: ['action'],
      where,
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } },
      take: 5,
    }),
  ]);

  // Annotate each log with its severity tier
  const annotatedLogs = logs.map((log) => ({
    ...log,
    severity: SEVERITY_MAP[log.action] ?? 'low',
  }));

  res.json({
    success: true,
    data: annotatedLogs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    summary: {
      totalLogs: total,
      uniqueUsers: uniqueUserResult.length,
      loginFailures,
      topActions: topActionResult.map((r) => ({ action: r.action, count: r._count.action })),
    },
  });
});

export const getDashboardStats = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    totalDocuments,
    storageResult,
    failedLoginsDay,
    failedLoginsFiveMin,
    lockedAccounts,
    premiumUsers,
    newUsersToday,
    recentAlerts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.document.count({ where: { isDeleted: false } }),
    prisma.user.aggregate({ _sum: { storageUsed: true } }),
    prisma.activityLog.count({ where: { action: 'FAILED_LOGIN_ATTEMPT', createdAt: { gte: oneDayAgo } } }),
    prisma.activityLog.count({ where: { action: 'FAILED_LOGIN_ATTEMPT', createdAt: { gte: fiveMinAgo } } }),
    prisma.user.count({ where: { lockedUntil: { gt: now } } }),
    prisma.user.count({ where: { isPremium: true } }),
    prisma.user.count({ where: { createdAt: { gte: oneDayAgo } } }),
    prisma.activityLog.findMany({
      where: {
        action: { in: ['SECURITY_ALERT_BRUTE_FORCE', 'SECURITY_ALERT_SUSPICIOUS', 'SECURITY_ALERT'] },
        createdAt: { gte: oneDayAgo },
      },
      select: { id: true, action: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  res.json({
    success: true,
    data: {
      totalUsers,
      totalDocuments,
      totalStorageUsedBytes: storageResult._sum.storageUsed?.toString() ?? '0',
      premiumUsers,
      newUsersToday,
      lockedAccounts,
      failedLoginsDay,
      failedLoginsFiveMin,
      recentAlerts,
    },
  });
});

// ── Server-Sent Events — real-time security dashboard ─────────────────────────

export const adminSseEvents = async (req: Request, res: Response): Promise<void> => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx proxy buffering
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Push current stats immediately on connect
  const pushStats = async () => {
    try {
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [failedLoginsFiveMin, newUsers, lockedAccounts] = await Promise.all([
        prisma.activityLog.count({ where: { action: 'FAILED_LOGIN_ATTEMPT', createdAt: { gte: fiveMinAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: oneDayAgo } } }),
        prisma.user.count({ where: { lockedUntil: { gt: now } } }),
      ]);

      send('stats', { failedLoginsFiveMin, newUsers, lockedAccounts, ts: now.toISOString() });
    } catch {
      // Stats push failure must not crash the SSE connection
    }
  };

  await pushStats();
  const statsInterval = setInterval(pushStats, 30_000);

  // Forward security alerts to this client
  const onAlert = (alert: SecurityAlert) => send('alert', alert);
  securityEvents.on('alert', onAlert);

  // Keepalive comment every 25 s (prevents proxy timeouts)
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(statsInterval);
    clearInterval(keepAlive);
    securityEvents.off('alert', onAlert);
  });
};
