import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';

/**
 * Hash an IP address for privacy-preserving request logs. A salt keeps hashes
 * non-reversible across deployments.
 */
const anonymizeIp = (ip?: string): string => {
  if (!ip) return 'unknown';
  return crypto
    .createHash('sha256')
    .update(ip + (process.env.IP_HASH_SALT ?? ''))
    .digest('hex')
    .slice(0, 16);
};

/**
 * Per-request access logger. Records method, path, status, response time,
 * anonymized IP and the user id (when authenticated). Deliberately never logs
 * request bodies, tokens, file contents, or the Authorization header.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const meta = {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      responseTimeMs: Math.round(durationMs * 100) / 100,
      ip: anonymizeIp(req.ip),
      userId: req.user?.id,
    };

    const level = res.statusCode >= 500 ? 'error' : 'info';
    logger.log(
      level,
      `${meta.method} ${meta.path} ${meta.status} ${meta.responseTimeMs}ms`,
      meta
    );
  });

  next();
};

export interface AuditEntry {
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persist a security/audit event to the ActivityLog table. Fire-and-forget:
 * failures are logged but never block the request. Callers must avoid passing
 * secrets in `metadata`.
 */
export const auditLog = async (entry: AuditEntry): Promise<void> => {
  try {
    await prisma.activityLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        metadata: (entry.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  } catch (err) {
    logger.error('Failed to write audit log', err);
  }
};
