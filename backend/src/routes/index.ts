import { Router } from 'express';
import authRoutes from './authRoutes';
import documentRoutes from './documentRoutes';
import userRoutes from './userRoutes';
import adminRoutes from './adminRoutes';
import paymentRoutes from './paymentRoutes';
import logRoutes from './logRoutes';
import { ipBlockMiddleware } from '../middleware/ipBlocker';

const router = Router();

router.use('/auth', ipBlockMiddleware, authRoutes);
router.use('/documents', documentRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);
router.use('/logs', logRoutes);

export default router;
