import { Router } from 'express';
import express from 'express';
import { createCheckoutSession, stripeWebhook } from '../controllers/paymentController';
import { verifyAccessToken } from '../middleware/auth';
import { csrfMiddleware } from '../middleware/csrf';

const router = Router();

// Webhook must receive the raw body for Stripe signature verification.
// It is mounted BEFORE the global json() middleware via the express.raw() override,
// and is explicitly excluded from CSRF (protected by the Stripe signature instead).
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

router.post('/create-checkout', verifyAccessToken, csrfMiddleware, createCheckoutSession);

export default router;
