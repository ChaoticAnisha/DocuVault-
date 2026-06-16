import { Router } from 'express';
import authRoutes from './authRoutes';
import documentRoutes from './documentRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/documents', documentRoutes);

export default router;
