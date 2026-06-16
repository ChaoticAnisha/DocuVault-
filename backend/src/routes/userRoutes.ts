import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  exportData,
} from '../controllers/userController';
import { verifyAccessToken } from '../middleware/auth';
import { csrfMiddleware } from '../middleware/csrf';
import { apiLimiter, authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.get('/profile', verifyAccessToken, getProfile);
router.put('/profile', verifyAccessToken, csrfMiddleware, apiLimiter, updateProfile);
router.post('/change-password', verifyAccessToken, csrfMiddleware, authLimiter, changePassword);
router.delete('/account', verifyAccessToken, csrfMiddleware, authLimiter, deleteAccount);
router.get('/export-data', verifyAccessToken, apiLimiter, exportData);

export default router;
