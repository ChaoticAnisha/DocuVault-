import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  getUsers,
  updateUserRole,
  lockUser,
  unlockUser,
  getActivityLogs,
  getDashboardStats,
} from '../controllers/adminController';
import { verifyAccessToken, requireRole } from '../middleware/auth';
import { csrfMiddleware } from '../middleware/csrf';

const adminOnly = [verifyAccessToken, requireRole([Role.ADMIN])];

const router = Router();

router.get('/users', ...adminOnly, getUsers);
router.put('/users/:id/role', ...adminOnly, csrfMiddleware, updateUserRole);
router.post('/users/:id/lock', ...adminOnly, csrfMiddleware, lockUser);
router.post('/users/:id/unlock', ...adminOnly, csrfMiddleware, unlockUser);
router.get('/logs', ...adminOnly, getActivityLogs);
router.get('/dashboard', ...adminOnly, getDashboardStats);

export default router;
