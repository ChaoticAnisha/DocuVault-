import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../utils/fileEncryption';
import { AppError } from '../utils/AppError';

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(415, `Unsupported file type: ${file.mimetype}`));
  }
};

/**
 * Memory storage: the file buffer is available as req.file.buffer.
 * Plaintext never touches disk — we encrypt the buffer before writing.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});
