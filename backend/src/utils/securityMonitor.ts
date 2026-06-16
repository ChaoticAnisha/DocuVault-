import { EventEmitter } from 'events';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { auditLog } from '../middleware/logger';

// ── Security event bus ────────────────────────────────────────────────────────
// SSE handlers listen on this emitter to push real-time alerts to admins.
export const securityEvents = new EventEmitter();
securityEvents.setMaxListeners(50); // allow many concurrent admin SSE connections

export interface SecurityAlert {
  type: 'BRUTE_FORCE' | 'SUSPICIOUS_LOGINS' | 'MASS_DOWNLOAD' | 'PASSWORD_RESETS';
  severity: 'critical' | 'high';
  message: string;
  ipHash?: string;
  userId?: string;
  count: number;
  detectedAt: string;
}

// ── Deduplication ─────────────────────────────────────────────────────────────
// Track recently fired alerts (key = type:identifier) to avoid flooding logs.
const recentAlerts = new Map<string, number>();
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function isDuplicate(key: string): boolean {
  const last = recentAlerts.get(key);
  if (last && Date.now() - last < ALERT_COOLDOWN_MS) return true;
  recentAlerts.set(key, Date.now());
  return false;
}

// ── Brute-force detection ─────────────────────────────────────────────────────

export async function detectBruteForce(ipHash: string): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const count = await prisma.activityLog.count({
    where: {
      action: 'FAILED_LOGIN_ATTEMPT',
      ipAddress: ipHash,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (count <= 10) return;

  const dedupeKey = `BRUTE_FORCE:${ipHash}`;
  if (isDuplicate(dedupeKey)) return;

  const alert: SecurityAlert = {
    type: 'BRUTE_FORCE',
    severity: 'critical',
    message: `Brute-force detected: ${count} failed logins from IP ${ipHash} in the last hour`,
    ipHash,
    count,
    detectedAt: new Date().toISOString(),
  };

  await auditLog({
    action: 'SECURITY_ALERT_BRUTE_FORCE',
    resourceType: 'IP',
    metadata: { ipHash, failedAttempts: count, windowHours: 1 },
  });

  logger.warn('[security-monitor] Brute-force alert', alert);
  securityEvents.emit('alert', alert);
}

// ── Suspicious activity detection ─────────────────────────────────────────────

export async function detectSuspiciousActivity(userId: string): Promise<void> {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  const [loginIps, passwordResets, downloads] = await Promise.all([
    // Distinct IP hashes used for successful logins in the last 24 h
    prisma.activityLog.findMany({
      where: {
        userId,
        action: 'LOGIN_SUCCESS',
        createdAt: { gte: oneDayAgo },
        ipAddress: { not: null },
      },
      select: { ipAddress: true },
      distinct: ['ipAddress'],
    }),
    // Password resets in the last 24 h
    prisma.activityLog.count({
      where: { userId, action: 'PASSWORD_RESET', createdAt: { gte: oneDayAgo } },
    }),
    // Document downloads in the last hour
    prisma.activityLog.count({
      where: {
        userId,
        action: 'DOCUMENT_DOWNLOADED',
        createdAt: { gte: oneHourAgo },
      },
    }),
  ]);

  // > 3 distinct login locations in 24 h → suspicious
  if (loginIps.length > 3) {
    const key = `SUSPICIOUS_LOGINS:${userId}`;
    if (!isDuplicate(key)) {
      const alert: SecurityAlert = {
        type: 'SUSPICIOUS_LOGINS',
        severity: 'high',
        message: `User logged in from ${loginIps.length} different locations in 24 h`,
        userId,
        count: loginIps.length,
        detectedAt: new Date().toISOString(),
      };
      await auditLog({
        userId,
        action: 'SECURITY_ALERT_SUSPICIOUS',
        resourceType: 'USER',
        resourceId: userId,
        metadata: { reason: 'multiple_locations', distinctIps: loginIps.length },
      });
      logger.warn('[security-monitor] Suspicious logins', alert);
      securityEvents.emit('alert', alert);
    }
  }

  // > 5 password resets in 24 h → suspicious
  if (passwordResets > 5) {
    const key = `PASSWORD_RESETS:${userId}`;
    if (!isDuplicate(key)) {
      const alert: SecurityAlert = {
        type: 'PASSWORD_RESETS',
        severity: 'high',
        message: `User performed ${passwordResets} password resets in 24 h`,
        userId,
        count: passwordResets,
        detectedAt: new Date().toISOString(),
      };
      await auditLog({
        userId,
        action: 'SECURITY_ALERT_SUSPICIOUS',
        resourceType: 'USER',
        resourceId: userId,
        metadata: { reason: 'excess_password_resets', count: passwordResets },
      });
      logger.warn('[security-monitor] Excess password resets', alert);
      securityEvents.emit('alert', alert);
    }
  }

  // > 20 downloads in 1 h → mass download
  if (downloads > 20) {
    const key = `MASS_DOWNLOAD:${userId}`;
    if (!isDuplicate(key)) {
      const alert: SecurityAlert = {
        type: 'MASS_DOWNLOAD',
        severity: 'high',
        message: `User downloaded ${downloads} documents in the last hour`,
        userId,
        count: downloads,
        detectedAt: new Date().toISOString(),
      };
      await auditLog({
        userId,
        action: 'SECURITY_ALERT_SUSPICIOUS',
        resourceType: 'USER',
        resourceId: userId,
        metadata: { reason: 'mass_download', count: downloads },
      });
      logger.warn('[security-monitor] Mass download alert', alert);
      securityEvents.emit('alert', alert);
    }
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export function scheduleAlertChecks(): void {
  const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

  const runChecks = async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Collect distinct IP hashes from recent failed logins
      const failedIps = await prisma.activityLog.findMany({
        where: {
          action: 'FAILED_LOGIN_ATTEMPT',
          createdAt: { gte: oneHourAgo },
          ipAddress: { not: null },
        },
        select: { ipAddress: true },
        distinct: ['ipAddress'],
      });

      await Promise.allSettled(
        failedIps.map(({ ipAddress }) => ipAddress && detectBruteForce(ipAddress))
      );

      // Collect distinct active users
      const activeUsers = await prisma.activityLog.findMany({
        where: {
          userId: { not: null },
          createdAt: { gte: oneDayAgo },
        },
        select: { userId: true },
        distinct: ['userId'],
      });

      await Promise.allSettled(
        activeUsers.map(({ userId }) => userId && detectSuspiciousActivity(userId))
      );
    } catch (err) {
      logger.error('[security-monitor] Check run failed', err);
    }
  };

  // Run once at startup (after a short delay so DB is reachable), then on interval
  setTimeout(runChecks, 30_000);
  setInterval(runChecks, CHECK_INTERVAL_MS);

  logger.info('[security-monitor] Alert checks scheduled every 5 minutes');
}
