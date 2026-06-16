import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken } from '../middleware/auth';
import { apiLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/prisma';

const router = Router();

// Actions surfaced to regular users — excludes internal/admin/security events.
const USER_VISIBLE_ACTIONS = new Set([
  'USER_REGISTERED',
  'LOGIN_SUCCESS',
  'LOGOUT',
  'MFA_ENABLED',
  'MFA_DISABLED',
  'MFA_VERIFIED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'PROFILE_UPDATED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_DOWNLOADED',
  'DOCUMENT_DELETED',
  'DOCUMENT_SHARED',
  'SHARE_ACCEPTED',
  'SHARE_REVOKED',
  'SIGNATURE_REQUESTED',
  'DOCUMENT_SIGNED',
  'DATA_EXPORTED',
  'ACCOUNT_DELETED',
  'PAYMENT_INITIATED',
  'PAYMENT_SUCCEEDED',
]);

const ACTION_DESCRIPTIONS: Record<string, string> = {
  USER_REGISTERED: 'Created your account',
  LOGIN_SUCCESS: 'Signed in',
  LOGOUT: 'Signed out',
  MFA_ENABLED: 'Enabled two-factor authentication',
  MFA_DISABLED: 'Disabled two-factor authentication',
  MFA_VERIFIED: 'Completed MFA verification',
  PASSWORD_CHANGED: 'Changed your password',
  PASSWORD_RESET: 'Reset your password',
  PROFILE_UPDATED: 'Updated your profile',
  DOCUMENT_UPLOADED: 'Uploaded a document',
  DOCUMENT_DOWNLOADED: 'Downloaded a document',
  DOCUMENT_DELETED: 'Deleted a document',
  DOCUMENT_SHARED: 'Shared a document',
  SHARE_ACCEPTED: 'Accepted a document share',
  SHARE_REVOKED: 'Revoked a document share',
  SIGNATURE_REQUESTED: 'Requested document signatures',
  DOCUMENT_SIGNED: 'Signed a document',
  DATA_EXPORTED: 'Exported your account data',
  ACCOUNT_DELETED: 'Deleted your account',
  PAYMENT_INITIATED: 'Started a payment',
  PAYMENT_SUCCEEDED: 'Completed a payment',
};

router.get(
  '/mine',
  verifyAccessToken,
  apiLimiter,
  asyncHandler(async (req, res) => {
    const logs = await prisma.activityLog.findMany({
      where: {
        userId: req.user!.id,
        action: { in: Array.from(USER_VISIBLE_ACTIONS) },
      },
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        createdAt: true,
        // Never expose ipAddress or userAgent to the client
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const enriched = logs.map((log) => ({
      ...log,
      description: ACTION_DESCRIPTIONS[log.action] ?? log.action.replace(/_/g, ' ').toLowerCase(),
    }));

    res.json({ success: true, data: enriched });
  })
);

export default router;
