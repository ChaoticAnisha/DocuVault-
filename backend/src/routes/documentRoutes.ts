import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  uploadDocument,
  downloadDocument,
  getDocuments,
  getDocumentById,
  deleteDocument,
  shareDocument,
  acceptShare,
  requestSignature,
  signDocument,
} from '../controllers/documentController';
import { verifyAccessToken, requireRole } from '../middleware/auth';
import { apiLimiter, uploadLimiter } from '../middleware/rateLimiter';
import { csrfMiddleware } from '../middleware/csrf';
import { upload } from '../config/multer';

const router = Router();

// File upload: auth + role + rate limit + multer (memory) + CSRF
router.post(
  '/upload',
  verifyAccessToken,
  requireRole([Role.EDITOR, Role.ADMIN]),
  uploadLimiter,
  upload.single('file'),
  csrfMiddleware,
  uploadDocument
);

// List all documents for the authenticated user (paginated, searchable)
router.get('/', verifyAccessToken, apiLimiter, getDocuments);

// Download a document (streams decrypted buffer)
router.get('/:id/download', verifyAccessToken, apiLimiter, downloadDocument);

// Get document metadata
router.get('/:id', verifyAccessToken, apiLimiter, getDocumentById);

// Soft-delete a document
router.delete('/:id', verifyAccessToken, csrfMiddleware, deleteDocument);

// Share a document with another user/email
router.post(
  '/:id/share',
  verifyAccessToken,
  requireRole([Role.EDITOR, Role.ADMIN]),
  apiLimiter,
  csrfMiddleware,
  shareDocument
);

// Accept a share invite (public — no auth required, works for guest links too)
router.get('/share/:token', apiLimiter, acceptShare);

// Request signatures from one or more signers
router.post('/:id/request-signature', verifyAccessToken, csrfMiddleware, requestSignature);

// Sign a document
router.post('/:id/sign', verifyAccessToken, apiLimiter, csrfMiddleware, signDocument);

export default router;
