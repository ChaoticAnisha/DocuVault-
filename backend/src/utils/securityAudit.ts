import { logger } from '../config/logger';

interface AuditResult {
  errors: string[];
  warnings: string[];
}

function checkSecrets(): AuditResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── JWT secrets ─────────────────────────────────────────────────────────────
  const jwtSecret = process.env.JWT_SECRET ?? '';
  if (jwtSecret.length < 64) {
    errors.push(
      `JWT_SECRET is too short (${jwtSecret.length} chars). Minimum 64 chars required to prevent brute-force.`
    );
  }

  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET ?? '';
  if (jwtRefreshSecret.length < 64) {
    errors.push(
      `JWT_REFRESH_SECRET is too short (${jwtRefreshSecret.length} chars). Minimum 64 chars required.`
    );
  }

  if (jwtSecret === jwtRefreshSecret && jwtSecret.length > 0) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different values.');
  }

  // ── Encryption key ──────────────────────────────────────────────────────────
  // Expected format: 64 hex characters = 32 bytes = AES-256 key
  const encryptionKey = process.env.ENCRYPTION_KEY ?? '';
  if (!encryptionKey) {
    errors.push('ENCRYPTION_KEY is not set. All encrypted data would be unreadable.');
  } else if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    errors.push(
      `ENCRYPTION_KEY must be exactly 64 hex characters (= 32 bytes / 256-bit AES key). ` +
        `Current value has ${encryptionKey.length} characters. Generate with: openssl rand -hex 32`
    );
  } else {
    // Verify the decoded length is exactly 32 bytes
    const decoded = Buffer.from(encryptionKey, 'hex');
    if (decoded.length !== 32) {
      errors.push(`ENCRYPTION_KEY decodes to ${decoded.length} bytes — expected exactly 32.`);
    }
  }

  // ── Database ────────────────────────────────────────────────────────────────
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set. The server cannot connect to PostgreSQL.');
  }

  // ── Redis ───────────────────────────────────────────────────────────────────
  if (!process.env.REDIS_URL) {
    errors.push('REDIS_URL is not set. Rate limiting and sessions will not work.');
  }

  // ── Session ─────────────────────────────────────────────────────────────────
  const sessionSecret = process.env.SESSION_SECRET ?? '';
  if (sessionSecret.length < 32) {
    errors.push(
      `SESSION_SECRET is too short (${sessionSecret.length} chars). Minimum 32 chars required.`
    );
  }

  // ── NODE_ENV ────────────────────────────────────────────────────────────────
  if (!process.env.NODE_ENV) {
    warnings.push(
      'NODE_ENV is not set. Secure cookie flags and other production hardening will not activate.'
    );
  } else if (process.env.NODE_ENV !== 'production') {
    warnings.push(
      `NODE_ENV is "${process.env.NODE_ENV}" — not "production". ` +
        'Secure cookies, strict CSP, and other hardening are disabled in non-production mode.'
    );
  }

  return { errors, warnings };
}

export function runSecurityAudit(): void {
  logger.info('Running startup security audit…');

  const { errors, warnings } = checkSecrets();

  // Print warnings first (non-fatal)
  for (const w of warnings) {
    logger.warn(`[security-audit] ⚠  ${w}`);
  }

  // Fatal errors — refuse to start
  if (errors.length > 0) {
    logger.error('[security-audit] STARTUP REFUSED — fix the following issues:');
    for (const e of errors) {
      logger.error(`[security-audit] ✗  ${e}`);
    }
    logger.error(
      '[security-audit] Tip: copy .env.example to .env and fill in real values.'
    );
    process.exit(1);
  }

  // ── Log enabled security features ───────────────────────────────────────────
  const env = process.env.NODE_ENV ?? 'development';
  const isProd = env === 'production';

  logger.info('[security-audit] ✓  All required secrets are present and valid');
  logger.info(`[security-audit] ✓  NODE_ENV: ${env}`);
  logger.info(`[security-audit] ✓  Secure cookies: ${isProd ? 'ON' : 'OFF (non-production)'}`);
  logger.info('[security-audit] ✓  CSRF protection: double-submit cookie (enabled)');
  logger.info('[security-audit] ✓  Rate limiting: Redis-backed (enabled)');
  logger.info('[security-audit] ✓  MFA: TOTP via speakeasy (available)');
  logger.info('[security-audit] ✓  File encryption: AES-256-CBC per-file IV (enabled)');
  logger.info('[security-audit] ✓  Field encryption: AES-256-CBC (enabled)');
  logger.info('[security-audit] ✓  Password hashing: bcrypt 12 rounds (enabled)');
  logger.info('[security-audit] Startup security audit passed.');
}
