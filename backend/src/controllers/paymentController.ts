import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../config/prisma';
import { auditLog } from '../middleware/logger';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../config/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-04-10',
});

const PREMIUM_STORAGE_BYTES = BigInt(10 * 1024 * 1024 * 1024); // 10 GB
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── Create checkout session ──────────────────────────────────────────────────

export const createCheckoutSession = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, stripeCustomerId: true, isPremium: true },
  });
  if (!user) throw new AppError(404, 'User not found');
  if (user.isPremium) throw new AppError(400, 'You are already on the Premium plan');

  // Find or create the Stripe customer so we can correlate webhook events back to this user.
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });
    customerId = customer.id;
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          product_data: {
            name: 'DocuVault Premium',
            description: '10 GB storage, unlimited document sharing and e-signatures',
          },
          unit_amount: 499, // £4.99 in pence
          recurring: { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    success_url: `${FRONTEND}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${FRONTEND}/payment/cancel`,
    metadata: { userId },
  });

  await auditLog({
    userId,
    action: 'PAYMENT_INITIATED',
    resourceType: 'TRANSACTION',
    req,
    metadata: { sessionId: session.id },
  });

  res.json({ success: true, url: session.url });
});

// ─── Stripe webhook ───────────────────────────────────────────────────────────

export const stripeWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    res.status(400).json({ success: false, message: 'Missing Stripe signature' });
    return;
  }

  let event: Stripe.Event;
  try {
    // req.body must be the raw Buffer — the payment router mounts a raw body parser.
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err) {
    logger.warn('Stripe webhook signature verification failed', err);
    res.status(400).json({ success: false, message: 'Webhook signature invalid' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) break;

        const amountTotal = session.amount_total ?? 0;

        await prisma.$transaction([
          prisma.user.update({
            where: { id: userId },
            data: {
              isPremium: true,
              storageLimitBytes: PREMIUM_STORAGE_BYTES,
              stripeCustomerId: session.customer as string,
            },
          }),
          prisma.transaction.create({
            data: {
              userId,
              stripePaymentIntentId: (session.payment_intent as string) ?? session.id,
              amount: amountTotal,
              currency: session.currency ?? 'gbp',
              status: 'SUCCEEDED',
              planType: 'PREMIUM_MONTHLY',
            },
          }),
        ]);

        await auditLog({
          userId,
          action: 'PAYMENT_SUCCEEDED',
          resourceType: 'TRANSACTION',
          metadata: { sessionId: session.id, amount: amountTotal },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        });
        if (!user) break;

        await prisma.user.update({
          where: { id: user.id },
          data: {
            isPremium: false,
            storageLimitBytes: BigInt(100 * 1024 * 1024), // revert to 100 MB free tier
          },
        });

        await auditLog({
          userId: user.id,
          action: 'PAYMENT_FAILED',
          resourceType: 'TRANSACTION',
          metadata: { subscriptionId: subscription.id, reason: 'subscription_deleted' },
        });
        break;
      }

      default:
        // Acknowledge unhandled events so Stripe doesn't retry them.
        logger.info(`Unhandled Stripe event type: ${event.type}`);
    }
  } catch (err) {
    logger.error('Error processing Stripe webhook event', { type: event.type, err });
    // Return 200 so Stripe doesn't retry — the error is on our side and logged.
  }

  res.json({ received: true });
};
