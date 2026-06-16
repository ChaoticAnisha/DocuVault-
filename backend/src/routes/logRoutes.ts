import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken } from '../middleware/auth';
import { apiLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/prisma';

const router = Router();

router.get(
  '/mine',
  verifyAccessToken,
  apiLimiter,
  asyncHandler(async (req, res) => {
    const logs = await prisma.activityLog.findMany({
      where: { userId: req.user!.id },
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        createdAt: true,
        // Never expose ipAddress or userAgent in client-facing logs
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: logs });
  })
);

export default router;
