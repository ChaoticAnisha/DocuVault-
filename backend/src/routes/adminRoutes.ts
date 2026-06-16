import { Router } from 'express';
import { Role } from '@prisma/client';
import {
  getUsers,
  updateUserRole,
  lockUser,
  unlockUser,
  getActivityLogs,
  getDashboardStats,
  adminSseEvents,
} from '../controllers/adminController';
import { verifyAccessToken, requireRole } from '../middleware/auth';
import { csrfMiddleware } from '../middleware/csrf';

const adminOnly = [verifyAccessToken, requireRole([Role.ADMIN])];

const router = Router();

router.get('/users', ...adminOnly, getUsers);
router.patch('/users/:id/role', ...adminOnly, csrfMiddleware, updateUserRole);
router.post('/users/:id/lock', ...adminOnly, csrfMiddleware, lockUser);
router.post('/users/:id/unlock', ...adminOnly, csrfMiddleware, unlockUser);
router.get('/logs', ...adminOnly, getActivityLogs);
// /stats — also aliased as /dashboard for backward compat
router.get('/stats', ...adminOnly, getDashboardStats);
router.get('/dashboard', ...adminOnly, getDashboardStats);
// SSE: GET, no CSRF token needed; auth via httpOnly access_token cookie
router.get('/events', ...adminOnly, adminSseEvents);

export default router;
