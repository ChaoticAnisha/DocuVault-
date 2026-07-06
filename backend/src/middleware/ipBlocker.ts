import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

const BLOCK_THRESHOLD = 30;                       // failed attempts before IP block
const BLOCK_DURATION_MS = 24 * 60 * 60 * 1000;  // 24-hour block
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;         // sliding 1-hour window

interface BlockedEntry {
  blockedAt: number;
  expiresAt: number;
}

interface AttemptEntry {
  count: number;
  windowStart: number;
}

const blockedIPs = new Map<string, BlockedEntry>();
const failedAttempts = new Map<string, AttemptEntry>();

const whitelist = (process.env.ADMIN_IP_WHITELIST || '127.0.0.1,::1,::ffff:127.0.0.1')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

export function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

export function isIPWhitelisted(ip: string): boolean {
  return whitelist.includes(ip);
}

export function isBlocked(ip: string): boolean {
  if (isIPWhitelisted(ip)) return false;
  const entry = blockedIPs.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    blockedIPs.delete(ip);
    return false;
  }
  return true;
}

export function recordFailedAttempt(ip: string): void {
  if (isIPWhitelisted(ip)) return;

  const now = Date.now();
  const entry = failedAttempts.get(ip);

  if (!entry || now - entry.windowStart > ATTEMPT_WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, windowStart: now });
    return;
  }

  entry.count += 1;

  if (entry.count >= BLOCK_THRESHOLD) {
    blockedIPs.set(ip, { blockedAt: now, expiresAt: now + BLOCK_DURATION_MS });
    failedAttempts.delete(ip);
  }
}

export function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

export function getBlockedIPsList(): Array<{ ipPartial: string; blockedAt: string; expiresAt: string }> {
  const now = Date.now();
  const result: Array<{ ipPartial: string; blockedAt: string; expiresAt: string }> = [];

  for (const [ip, entry] of blockedIPs.entries()) {
    if (now > entry.expiresAt) {
      blockedIPs.delete(ip);
      continue;
    }
    result.push({
      ipPartial: ip.substring(0, 6) + '***',
      blockedAt: new Date(entry.blockedAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString(),
    });
  }

  return result;
}

export function ipBlockMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);

  if (isBlocked(ip)) {
    const entry = blockedIPs.get(ip)!;
    const minutesRemaining = Math.ceil((entry.expiresAt - Date.now()) / (60 * 1000));
    next(
      new AppError(
        403,
        `Your IP has been temporarily blocked due to too many failed login attempts. ` +
          `Please try again in ${minutesRemaining} minutes or contact support.`
      )
    );
    return;
  }

  next();
}
