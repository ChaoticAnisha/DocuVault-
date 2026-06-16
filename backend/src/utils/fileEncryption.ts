import crypto from 'crypto';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

const ALLOWED_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'text/plain': '.txt',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

const getKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not set');
  if (/^[0-9a-fA-F]{64}$/.test(key)) return Buffer.from(key, 'hex');
  return crypto.createHash('sha256').update(key).digest();
};

/** AES-256-CBC encrypt a file buffer. Returns the ciphertext buffer and the hex IV. */
export const encryptFile = (
  inputBuffer: Buffer
): { encryptedBuffer: Buffer; iv: string } => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encryptedBuffer = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  return { encryptedBuffer, iv: iv.toString('hex') };
};

/** AES-256-CBC decrypt a file buffer. Accepts the hex IV stored on the Document record. */
export const decryptFile = (encryptedBuffer: Buffer, iv: string): Buffer => {
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'hex'));
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
};

/**
 * Derive a safe on-disk filename from a MIME type (never from the user-supplied name).
 * Format: <uuid>.<ext>  — e.g.  "a1b2c3d4-...-ef56.pdf"
 */
export const generateSafeFilename = (mimetype: string): string => {
  const ext = ALLOWED_EXTENSIONS[mimetype] ?? '';
  return `${uuidv4()}${ext}`;
};

/**
 * Check that the MIME type is on the allowed list. The `allowedTypes` array
 * should be the keys of ALLOWED_EXTENSIONS; pass it explicitly so callers can
 * tighten or relax the whitelist per-endpoint.
 */
export const validateMimeType = (mimetype: string, allowedTypes: string[]): boolean =>
  allowedTypes.includes(mimetype);

/** Return true if sizeBytes is within maxBytes. */
export const scanFileSize = (sizeBytes: number, maxBytes: number): boolean =>
  sizeBytes > 0 && sizeBytes <= maxBytes;

/**
 * Guard against path-traversal in a user-supplied title/name string.
 * Strips directory components and null bytes; returns only the base name portion.
 */
export const sanitizeTitle = (title: string): string =>
  path.basename(title.replace(/\0/g, '').trim());

export const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_EXTENSIONS);
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
