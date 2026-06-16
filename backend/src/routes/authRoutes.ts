import { Router } from 'express';
import passport from 'passport';
import {
  register,
  login,
  verifyMfa,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  verifyEmail,
  setupMfa,
  verifyMfaSetup,
  disableMfa,
  googleOAuthCallback,
  getMe,
} from '../controllers/authController';
import {
  authLimiter,
  authSlowDown,
  mfaLimiter,
} from '../middleware/rateLimiter';
import {
  verifyAccessToken,
  verifyRefreshToken,
  requireEmailVerified,
} from '../middleware/auth';
import { checkAccountLock } from '../middleware/accountLock';
import { csrfTokenHandler } from '../middleware/csrf';

const router = Router();

// Public auth routes
router.post('/register', authLimiter, authSlowDown, register);
router.post('/login', authLimiter, authSlowDown, checkAccountLock, login);
router.post('/verify-mfa', mfaLimiter, verifyMfa);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.get('/verify-email/:token', verifyEmail);
router.get('/csrf-token', csrfTokenHandler);

// Authenticated routes
router.get('/me', verifyAccessToken, getMe);
router.post('/logout', verifyAccessToken, logout);
router.post('/refresh', verifyRefreshToken, refreshToken);
router.post('/setup-mfa', verifyAccessToken, requireEmailVerified, setupMfa);
router.post('/verify-mfa-setup', verifyAccessToken, verifyMfaSetup);
router.post('/disable-mfa', verifyAccessToken, disableMfa);

// Google OAuth
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_failed`,
  }),
  googleOAuthCallback
);

export default router;
