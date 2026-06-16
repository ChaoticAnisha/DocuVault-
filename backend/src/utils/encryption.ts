import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const SALT_ROUNDS = 12;

/**
 * Derive a 32-byte AES key from ENCRYPTION_KEY. Accepts either a 64-char hex
 * string (used directly) or any passphrase (SHA-256 hashed to 32 bytes).
 */
const getKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not set');
  if (/^[0-9a-fA-F]{64}$/.test(key)) return Buffer.from(key, 'hex');
  return crypto.createHash('sha256').update(key).digest();
};

/** AES-256-CBC encrypt. Returns ciphertext and IV as base64 strings. */
export const encrypt = (text: string): { encrypted: string; iv: string } => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return { encrypted: encrypted.toString('base64'), iv: iv.toString('base64') };
};

/** AES-256-CBC decrypt. Expects base64 ciphertext and IV. */
export const decrypt = (encrypted: string, iv: string): string => {
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};

/** bcrypt hash with 12 salt rounds. */
export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, SALT_ROUNDS);

/** bcrypt compare. */
export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

/** Cryptographically random 32-byte hex token. */
export const generateSecureToken = (): string => crypto.randomBytes(32).toString('hex');
