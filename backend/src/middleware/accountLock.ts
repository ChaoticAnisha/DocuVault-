import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';

/**
 * Blocks login attempts against a locked account. Expects `email` in the request
 * body. If the lock window is still active, responds 423 with the remaining time.
 * If the lock has expired, the counters are reset and the request proceeds.
 * Unknown emails pass through so as not to reveal which accounts exist.
 */
export const checkAccountLock = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const email = (req.body?.email as string | undefined)?.toLowerCase();

  if (!email) {
    next();
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, lockedUntil: true },
  });

  if (!user || !user.lockedUntil) {
    next();
    return;
  }

  const now = new Date();

  if (user.lockedUntil > now) {
    const remainingSeconds = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000);
    const remainingMinutes = Math.ceil(remainingSeconds / 60);
    res.setHeader('Retry-After', remainingSeconds);
    res.status(423).json({
      success: false,
      message: `Account locked. Try again in ${remainingMinutes} minute(s).`,
      retryAfterSeconds: remainingSeconds,
    });
    return;
  }

  // Lock has expired — clear it before continuing.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  next();
};
