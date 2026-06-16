import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { SharePermission } from '@prisma/client';
import { prisma } from '../config/prisma';
import { auditLog } from '../middleware/logger';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import {
  encryptFile,
  decryptFile,
  generateSafeFilename,
  validateMimeType,
  scanFileSize,
  sanitizeTitle,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from '../utils/fileEncryption';
import {
  sendShareEmail,
  sendSignatureRequestEmail,
  sendSignatureCompleteEmail,
} from '../utils/email';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

// Never expose these fields to API consumers.
const SAFE_DOCUMENT_SELECT = {
  id: true,
  title: true,
  description: true,
  mimeType: true,
  sizeBytes: true,
  requiresSignature: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  ownerId: true,
} as const;

const hashEmail = (email: string): string =>
  crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const shareSchema = z.object({
  targetEmail: z.string().email('Invalid email address'),
  permission: z.nativeEnum(SharePermission),
  expiryHours: z.number().int().positive().max(8760).optional(), // max 1 year
});

const signatureRequestSchema = z.object({
  signerEmails: z
    .array(z.string().email())
    .min(1)
    .max(20, 'Maximum 20 signers per request'),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Verify user is document owner OR has an active share record. */
const assertDocumentAccess = async (
  documentId: string,
  userId: string,
  userEmail: string
): Promise<void> => {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, isDeleted: false },
  });
  if (!doc) throw new AppError(404, 'Document not found');

  if (doc.ownerId === userId) return; // owner always has access

  const share = await prisma.documentShare.findFirst({
    where: {
      documentId,
      isAccepted: true,
      OR: [{ sharedWithId: userId }, { sharedWithEmail: userEmail }],
      expiresAt: { gt: new Date() },
    },
  });
  if (!share) throw new AppError(403, 'Access denied');
};

// ─── Controllers ──────────────────────────────────────────────────────────────

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const file = req.file;
  if (!file) throw new AppError(400, 'No file uploaded');

  if (!validateMimeType(file.mimetype, ALLOWED_MIME_TYPES)) {
    throw new AppError(415, 'File type not allowed');
  }
  if (!scanFileSize(file.size, MAX_FILE_SIZE)) {
    throw new AppError(413, 'File exceeds the 50 MB limit');
  }

  // Storage quota check (requires fresh user record for accurate storageUsed).
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { storageUsed: true, storageLimitBytes: true },
  });
  if (!dbUser) throw new AppError(404, 'User not found');

  if (dbUser.storageUsed + BigInt(file.size) > dbUser.storageLimitBytes) {
    throw new AppError(
      413,
      'Storage quota exceeded. Upgrade to Premium for more space.'
    );
  }

  const title = sanitizeTitle(
    typeof req.body.title === 'string' ? req.body.title : file.originalname
  );
  const description =
    typeof req.body.description === 'string' ? req.body.description.slice(0, 500) : undefined;

  const safeFilename = generateSafeFilename(file.mimetype);
  const { encryptedBuffer, iv } = encryptFile(file.buffer);

  const destPath = path.join(UPLOADS_DIR, safeFilename);
  await fs.promises.writeFile(destPath, encryptedBuffer);

  const doc = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        title,
        description,
        fileKey: safeFilename,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        encryptionIv: iv,
        ownerId: user.id,
      },
      select: SAFE_DOCUMENT_SELECT,
    });
    await tx.user.update({
      where: { id: user.id },
      data: { storageUsed: { increment: BigInt(file.size) } },
    });
    return created;
  });

  await auditLog({
    userId: user.id,
    action: 'DOCUMENT_UPLOADED',
    resourceType: 'DOCUMENT',
    resourceId: doc.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: { mimeType: file.mimetype, sizeBytes: file.size },
  });

  res.status(201).json({ success: true, document: doc });
});

export const downloadDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const doc = await prisma.document.findFirst({
    where: { id, isDeleted: false },
  });
  if (!doc) throw new AppError(404, 'Document not found');

  const isOwner = doc.ownerId === user.id;
  if (!isOwner) {
    const now = new Date();
    const share = await prisma.documentShare.findFirst({
      where: {
        documentId: id,
        isAccepted: true,
        AND: [
          { OR: [{ sharedWithId: user.id }, { sharedWithEmail: user.email }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
    });
    if (!share) {
      await auditLog({
        userId: user.id,
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        resourceType: 'DOCUMENT',
        resourceId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      throw new AppError(403, 'Access denied');
    }
  }

  const filePath = path.join(UPLOADS_DIR, doc.fileKey);
  let encryptedBuffer: Buffer;
  try {
    encryptedBuffer = await fs.promises.readFile(filePath);
  } catch {
    throw new AppError(500, 'File not found on server');
  }

  const decryptedBuffer = decryptFile(encryptedBuffer, doc.encryptionIv);

  await auditLog({
    userId: user.id,
    action: 'DOCUMENT_DOWNLOADED',
    resourceType: 'DOCUMENT',
    resourceId: id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Use the sanitized title for Content-Disposition, never the raw fileKey.
  const safeTitle = sanitizeTitle(doc.title);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}"`);
  res.setHeader('Content-Length', decryptedBuffer.length);
  res.send(decryptedBuffer);
});

export const getDocuments = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : undefined;

  const where = {
    ownerId: user.id,
    isDeleted: false,
    ...(search && {
      title: { contains: search, mode: 'insensitive' as const },
    }),
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      select: {
        ...SAFE_DOCUMENT_SELECT,
        shares: {
          where: { isAccepted: true },
          select: { id: true, permission: true, sharedWithEmail: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.document.count({ where }),
  ]);

  res.json({
    success: true,
    data: documents,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const getDocumentById = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  await assertDocumentAccess(id, user.id, user.email);

  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      ...SAFE_DOCUMENT_SELECT,
      shares: {
        select: { id: true, permission: true, sharedWithEmail: true, expiresAt: true },
      },
      signatures: {
        select: { id: true, signerEmail: true, isSigned: true, signedAt: true },
      },
    },
  });

  res.json({ success: true, document: doc });
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const doc = await prisma.document.findFirst({
    where: { id, isDeleted: false },
  });
  if (!doc) throw new AppError(404, 'Document not found');

  const isOwner = doc.ownerId === user.id;
  const isAdmin = user.role === 'ADMIN';
  if (!isOwner && !isAdmin) throw new AppError(403, 'Only the document owner can delete this');

  // Soft delete; TODO: schedule a hard delete (fs.unlink + DB row removal) after 30 days.
  await prisma.document.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await auditLog({
    userId: user.id,
    action: 'DOCUMENT_DELETED',
    resourceType: 'DOCUMENT',
    resourceId: id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: 'Document deleted' });
});

export const shareDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const parsed = shareSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
  }
  const { targetEmail, permission, expiryHours } = parsed.data;

  const doc = await prisma.document.findFirst({
    where: { id, ownerId: user.id, isDeleted: false },
  });
  if (!doc) throw new AppError(404, 'Document not found or you are not the owner');

  const shareToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = expiryHours
    ? new Date(Date.now() + expiryHours * 60 * 60 * 1000)
    : null;

  // Link to an existing user account if the email matches.
  const targetUser = await prisma.user.findUnique({
    where: { email: targetEmail.toLowerCase() },
    select: { id: true },
  });

  await prisma.documentShare.create({
    data: {
      documentId: id,
      sharedWithId: targetUser?.id ?? null,
      sharedWithEmail: targetEmail.toLowerCase(),
      permission,
      token: shareToken,
      expiresAt,
    },
  });

  await sendShareEmail(targetEmail, shareToken, doc.title, permission);

  await auditLog({
    userId: user.id,
    action: 'DOCUMENT_SHARED',
    resourceType: 'DOCUMENT',
    resourceId: id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: { recipientEmailHash: hashEmail(targetEmail), permission },
  });

  res.json({ success: true, message: 'Document shared successfully' });
});

export const acceptShare = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;
  const userId = req.user?.id;
  const userEmail = req.user?.email;

  const share = await prisma.documentShare.findUnique({ where: { token } });
  if (!share) throw new AppError(404, 'Share link not found');
  if (share.expiresAt && share.expiresAt < new Date()) {
    throw new AppError(410, 'This share link has expired');
  }
  if (share.isAccepted) {
    res.json({ success: true, message: 'Share already accepted', documentId: share.documentId });
    return;
  }

  await prisma.documentShare.update({
    where: { token },
    data: {
      isAccepted: true,
      sharedWithId: userId ?? share.sharedWithId,
      sharedWithEmail: userEmail ?? share.sharedWithEmail,
    },
  });

  await auditLog({
    userId: userId ?? null,
    action: 'SHARE_ACCEPTED',
    resourceType: 'DOCUMENT',
    resourceId: share.documentId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, documentId: share.documentId });
});

export const requestSignature = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const parsed = signatureRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
  }
  const { signerEmails } = parsed.data;

  const doc = await prisma.document.findFirst({
    where: { id, ownerId: user.id, isDeleted: false },
  });
  if (!doc) throw new AppError(404, 'Document not found or you are not the owner');

  await prisma.documentSignature.createMany({
    data: signerEmails.map((email) => {
      const existingUser = null; // resolved below if needed
      return {
        documentId: id,
        signerEmail: email.toLowerCase(),
        signerId: null,
      };
    }),
    skipDuplicates: true,
  });

  // Update document to require signatures.
  await prisma.document.update({ where: { id }, data: { requiresSignature: true } });

  // Resolve user IDs for known accounts and send emails.
  const knownUsers = await prisma.user.findMany({
    where: { email: { in: signerEmails.map((e) => e.toLowerCase()) } },
    select: { id: true, email: true },
  });
  const knownById = new Map(knownUsers.map((u) => [u.email, u.id]));

  await Promise.all([
    // Link signerId for existing users.
    ...knownUsers.map((u) =>
      prisma.documentSignature.updateMany({
        where: { documentId: id, signerEmail: u.email },
        data: { signerId: u.id },
      })
    ),
    // Send emails.
    ...signerEmails.map((email) =>
      sendSignatureRequestEmail(email, doc.title, id)
    ),
  ]);

  await auditLog({
    userId: user.id,
    action: 'SIGNATURE_REQUESTED',
    resourceType: 'DOCUMENT',
    resourceId: id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: { signerCount: signerEmails.length },
  });

  res.json({ success: true, message: `Signature requested from ${signerEmails.length} signer(s)` });
});

export const signDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const sigRecord = await prisma.documentSignature.findFirst({
    where: {
      documentId: id,
      isSigned: false,
      OR: [{ signerId: user.id }, { signerEmail: user.email }],
    },
  });
  if (!sigRecord) throw new AppError(404, 'No pending signature request found for your account');

  await prisma.documentSignature.update({
    where: { id: sigRecord.id },
    data: {
      isSigned: true,
      signedAt: new Date(),
      signerId: user.id,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    },
  });

  await auditLog({
    userId: user.id,
    action: 'DOCUMENT_SIGNED',
    resourceType: 'DOCUMENT',
    resourceId: id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Check if all signatures are now collected.
  const remaining = await prisma.documentSignature.count({
    where: { documentId: id, isSigned: false },
  });

  if (remaining === 0) {
    const doc = await prisma.document.findUnique({
      where: { id },
      include: { owner: { select: { email: true } } },
    });
    if (doc?.owner?.email) {
      await sendSignatureCompleteEmail(doc.owner.email, doc.title);
    }
  }

  res.json({ success: true, message: 'Document signed successfully', remainingSignatures: remaining });
});
