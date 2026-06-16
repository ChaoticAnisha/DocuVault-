import { Request, Response, NextFunction } from 'express';
import { filterXSS, IFilterXSSOptions } from 'xss';
import validator from 'validator';
import { auditLog } from './logger';

// Strip all HTML/script content, leaving plain text only.
const XSS_OPTIONS: IFilterXSSOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

/**
 * Sanitize a single string: trim, strip control chars, then strip all HTML.
 * Returns the cleaned value plus whether the input changed (a possible attack).
 */
const sanitizeString = (input: string): { value: string; suspicious: boolean } => {
  const trimmed = validator.stripLow(input.trim());
  const cleaned = filterXSS(trimmed, XSS_OPTIONS);
  return { value: cleaned, suspicious: cleaned !== trimmed };
};

/** Recursively sanitize every string in an object/array in place. */
const sanitizeValue = (value: unknown, flag: { suspicious: boolean }): unknown => {
  if (typeof value === 'string') {
    const result = sanitizeString(value);
    if (result.suspicious) flag.suspicious = true;
    return result.value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, flag));
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      obj[key] = sanitizeValue(obj[key], flag);
    }
    return obj;
  }
  return value;
};

/**
 * Recursively sanitizes req.body, req.query and req.params. If any value looked
 * like it contained markup/script, records an XSS_ATTEMPT_BLOCKED audit entry.
 */
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  const flag = { suspicious: false };

  if (req.body && typeof req.body === 'object') {
    sanitizeValue(req.body, flag);
  }
  if (req.query && typeof req.query === 'object') {
    // req.query is mutated in place (Express 4); keys remain, values are cleaned.
    sanitizeValue(req.query, flag);
  }
  if (req.params && typeof req.params === 'object') {
    sanitizeValue(req.params, flag);
  }

  if (flag.suspicious) {
    void auditLog({
      userId: req.user?.id ?? null,
      action: 'XSS_ATTEMPT_BLOCKED',
      resourceType: 'REQUEST',
      req,
      metadata: { method: req.method, path: req.originalUrl.split('?')[0] },
    });
  }

  next();
};
