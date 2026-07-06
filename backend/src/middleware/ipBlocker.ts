import { Request, Response, NextFunction } from 'express';
import { anonymizeIp } from './logger';

// ── IP-level block — sits above the per-account lockout ──────────────────────
// Threshold is intentionally higher than account lockout (30 vs 10) so that
// scanning multiple accounts doesn't bypass per-account protection.

const BLOCK_THRESHOLD = 30;           // block IP after 30 failed attempts
const BLOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory map: ipHash → { count, blockedUntil }
// For production use a Redis set with TTL instead.
const ipFailures = new Map<string, { count: number; blockedUntil: number | null }>();

/**
 * Record a failed authentication event for the given IP hash.
 * Called from authController after a failed password check.
 */
export const recordIpFailure = (ipHash: string): void => {
  const entry = ipFailures.get(ipHash) ?? { count: 0, blockedUntil: null };
  entry.count += 1;
  if (entry.count >= BLOCK_THRESHOLD) {
    entry.blockedUntil = Date.now() + BLOCK_DURATION_MS;
  }
  ipFailures.set(ipHash, entry);
};

/**
 * Middleware: reject requests from IPs that have exceeded 30 failed attempts
 * in the last 24 hours.
 */
export const checkIpBlock = (req: Request, res: Response, next: NextFunction): void => {
  const rawIp = req.ip ?? '';
  const ipHash = anonymizeIp(rawIp);
  const entry = ipFailures.get(ipHash);

  if (entry?.blockedUntil && Date.now() < entry.blockedUntil) {
    const remainingMs = entry.blockedUntil - Date.now();
    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
    res.setHeader('Retry-After', Math.ceil(remainingMs / 1000));
    res.status(429).json({
      error: 'IP address temporarily blocked',
      message: `Too many failed attempts from this IP. Blocked for ${remainingHours} hour(s).`,
      type: 'IP_BLOCKED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Clear stale block if it has expired.
  if (entry?.blockedUntil && Date.now() >= entry.blockedUntil) {
    ipFailures.delete(ipHash);
  }

  next();
};
