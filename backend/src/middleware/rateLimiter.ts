import rateLimit, { Options } from 'express-rate-limit';
import slowDown from 'express-slow-down';
import RedisStore from 'rate-limit-redis';
import { Request } from 'express';
import { redis } from '../config/redis';

/**
 * Build a Redis-backed store for a given limiter. Each limiter needs a distinct
 * key prefix so their counters do not collide in Redis.
 */
const store = (prefix: string) =>
  new RedisStore({
    // ioredis: forward the raw command to the shared client.
    sendCommand: (...args: string[]): Promise<any> => (redis as any).call(...args),
    prefix,
  });

const json = (message: string): Partial<Options> => ({
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message },
});

// Key by authenticated user id when available, otherwise fall back to IP.
const byUser = (req: Request): string => req.user?.id ?? req.ip ?? 'anonymous';

/** 100 requests / 15 minutes per IP. */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  store: store('rl:general:'),
  ...json('Too many requests, please try again later.'),
});

/** 5 requests / 15 minutes per IP — for /auth/login and /auth/register. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  store: store('rl:auth:'),
  ...json('Too many authentication attempts, please try again later.'),
});

/** 3 requests / 10 minutes per IP — for MFA verification. */
export const mfaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  store: store('rl:mfa:'),
  ...json('Too many MFA attempts, please try again later.'),
});

/** 60 requests / minute per authenticated user. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: byUser,
  store: store('rl:api:'),
  ...json('API rate limit exceeded, please slow down.'),
});

/** 10 uploads / hour per authenticated user. */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: byUser,
  store: store('rl:upload:'),
  ...json('Upload limit reached, please try again later.'),
});

/**
 * Progressive slow-down for auth endpoints: after 3 requests in the window,
 * each further request is delayed by a flat 500ms.
 */
export const authSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 3,
  delayMs: () => 500,
  store: store('sd:auth:'),
});
