import rateLimit, { Options } from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { Request } from 'express';

// Memory-backed rate limiters (no Redis required for local development).
// Counters reset on process restart — acceptable for single-instance dev usage.
// In development, limits are intentionally relaxed so normal testing doesn't hit them.

const isDev = process.env.NODE_ENV !== 'production';

const json = (message: string): Partial<Options> => ({
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message },
});

// Key by authenticated user id when available, otherwise fall back to IP.
const byUser = (req: Request): string => req.user?.id ?? req.ip ?? 'anonymous';

/** 100 req / 15 min (prod) · 1000 req / 15 min (dev) */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    type: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 'Please wait before making more requests',
  },
});

/** 5 req / 15 min per IP — for /auth/login and /auth/register.
 *  Limit kept at 5 in prod for the PoC demo (easily demonstrable).
 *  Raised to 100 in dev so normal testing is unaffected. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 100 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Custom handler makes the 429 clearly visible in Burp Suite / browser DevTools.
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded: Too many requests from this IP.',
      message: 'You have exceeded 5 requests per 15 minutes on this endpoint.',
      retryAfter: 'Please wait 15 minutes before trying again.',
      type: 'RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString(),
    });
  },
});

/** 3 req / 10 min (prod) · 50 req / 10 min (dev) */
export const mfaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: isDev ? 50 : 3,
  ...json('Too many MFA attempts, please try again later.'),
});

/** 60 req / min (prod) · 600 req / min (dev) */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 600 : 60,
  keyGenerator: byUser,
  ...json('API rate limit exceeded, please slow down.'),
});

/** 10 uploads / hr (prod) · 100 uploads / hr (dev) */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isDev ? 100 : 10,
  keyGenerator: byUser,
  ...json('Upload limit reached, please try again later.'),
});

/**
 * Progressive slow-down: disabled in dev, active in prod
 * (after 3 requests each further request is delayed 500 ms).
 */
export const slowDownMiddleware = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: isDev ? 1000 : 3,
  delayMs: () => 500,
});

/** Alias kept for callers that reference authSlowDown. */
export const authSlowDown = slowDownMiddleware;
