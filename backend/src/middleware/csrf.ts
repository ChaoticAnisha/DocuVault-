import { Request, Response, NextFunction } from 'express';
import Tokens from 'csrf';

const tokens = new Tokens();

const SECRET_COOKIE = 'csrf-secret';
const TOKEN_COOKIE = 'csrf-token';
const HEADER = 'x-csrf-token';

// Paths that must bypass CSRF (external callers cannot send our header).
const EXCLUDED_PATHS = ['/api/auth/google/callback', '/api/webhooks/stripe'];

const isProd = () => process.env.NODE_ENV === 'production';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const isExcluded = (req: Request): boolean =>
  EXCLUDED_PATHS.some((p) => req.path === p || req.originalUrl.split('?')[0] === p);

/**
 * GET /api/auth/csrf-token
 * Issues (or reuses) a per-session CSRF secret stored in an httpOnly cookie, and
 * returns a fresh token both as a JS-readable cookie and in the JSON body. The
 * frontend echoes the token back in the "X-CSRF-Token" header on mutating calls.
 */
export const csrfTokenHandler = (req: Request, res: Response): void => {
  let secret = req.cookies?.[SECRET_COOKIE] as string | undefined;

  if (!secret) {
    secret = tokens.secretSync();
    res.cookie(SECRET_COOKIE, secret, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd(),
      path: '/',
    });
  }

  const token = tokens.create(secret);
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: false, // must be readable by the frontend to set the header
    sameSite: 'lax',
    secure: isProd(),
    path: '/',
  });

  res.json({ success: true, csrfToken: token });
};

/**
 * Validates the double-submitted CSRF token on every mutating request. The token
 * from the "X-CSRF-Token" header must equal the "csrf-token" cookie and verify
 * against the secret held in the httpOnly "csrf-secret" cookie.
 */
export const csrfMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (SAFE_METHODS.has(req.method) || isExcluded(req)) {
    next();
    return;
  }

  const secret = req.cookies?.[SECRET_COOKIE] as string | undefined;
  const cookieToken = req.cookies?.[TOKEN_COOKIE] as string | undefined;
  const headerToken = req.headers[HEADER] as string | undefined;

  if (
    !secret ||
    !cookieToken ||
    !headerToken ||
    headerToken !== cookieToken ||
    !tokens.verify(secret, headerToken)
  ) {
    res.status(403).json({ success: false, message: 'Invalid CSRF token' });
    return;
  }

  next();
};
