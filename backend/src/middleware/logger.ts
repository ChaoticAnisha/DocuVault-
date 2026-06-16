import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';

// ── IP anonymisation ───────────────────────────────────────────────────────────

/**
 * Hash an IP address with SHA-256 + deployment salt so it can detect patterns
 * (same source, many failures) without ever being reversible to a real address.
 * The truncated 16-char hex is stored in ActivityLog.ipAddress.
 */
export const anonymizeIp = (ip?: string): string => {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return 'loopback';
  return crypto
    .createHash('sha256')
    .update(ip + (process.env.IP_HASH_SALT ?? ''))
    .digest('hex')
    .slice(0, 16);
};

/** Extract the originating client IP from the request, preferring X-Forwarded-For. */
const extractIp = (req: Request): string | undefined => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
    if (first) return first;
  }
  return req.ip;
};

// ── Metadata sanitisation ──────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'key', 'hash', 'iv',
  'accesstoken', 'refreshtoken', 'apikey', 'authorization',
]);

const isSensitiveKey = (k: string): boolean =>
  SENSITIVE_KEYS.has(k.toLowerCase().replace(/[_-]/g, ''));

const sanitizeMetadata = (raw?: Record<string, unknown>): Record<string, unknown> | undefined => {
  if (!raw) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isSensitiveKey(k)) continue;
    if (typeof v === 'string') {
      out[k] = v.length > 500 ? v.slice(0, 500) + '…' : v;
    } else if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v;
    } else {
      // Stringify complex values and truncate
      const str = JSON.stringify(v);
      out[k] = str.length > 500 ? str.slice(0, 500) + '…' : v;
    }
  }
  return out;
};

// ── Request logger middleware ──────────────────────────────────────────────────

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
      ip: anonymizeIp(extractIp(req)),
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

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  /** Pass the Express request to auto-extract and anonymise IP + User-Agent. */
  req?: Request;
  metadata?: Record<string, unknown>;
}

/**
 * Persist a security/audit event to ActivityLog. Fire-and-forget: failures
 * are logged to stderr but never propagate to the caller.
 */
export const auditLog = async (entry: AuditEntry): Promise<void> => {
  try {
    let ipHash: string | null = null;
    let userAgent: string | null = null;

    if (entry.req) {
      const rawIp = extractIp(entry.req);
      ipHash = rawIp ? anonymizeIp(rawIp) : null;
      userAgent = (entry.req.headers['user-agent'] as string) ?? null;
    }

    const cleanMeta = sanitizeMetadata(entry.metadata);

    await prisma.activityLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        ipAddress: ipHash,
        userAgent,
        metadata: (cleanMeta as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });

    logger.info(`[audit] ${entry.action}`, {
      userId: entry.userId,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
    });
  } catch (err) {
    // Never throw from audit logging — a DB failure must not take down a request.
    console.error('[audit] Failed to write audit log:', err);
  }
};
