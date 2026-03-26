import { Request, Response } from 'express';
import { stripe } from '../../lib/stripe';
import { User } from '../auth/auth.model';
import {
  createCheckoutSession,
  createPortalSession,
  activateProPlan,
  renewProPlan,
  downgradeToFree,
} from './billing.service';

// ---------------------------------------------------------------------------
// POST /billing/create-checkout-session
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe Checkout Session and returns the hosted URL.
 *
 * The user is redirected to Stripe's checkout page from the frontend.
 * We do NOT handle payment here — Stripe does. We only start the session.
 *
 * SECURITY: This route is protected by the `authenticate` middleware.
 * We look up the user by req.user.userId so there is no way for a 
 * different user to create a checkout session on behalf of someone else.
 */
export const createCheckout = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) throw new Error('STRIPE_PRO_PRICE_ID env var is not configured');

    const sessionUrl = await createCheckoutSession(user, priceId);
    res.json({ url: sessionUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ---------------------------------------------------------------------------
// POST /billing/portal
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe Billing Portal session.
 *
 * The portal lets users update payment methods, view invoices, and cancel.
 * We don't build any of that UI — Stripe hosts it.
 */
export const openPortal = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const portalUrl = await createPortalSession(user);
    res.json({ url: portalUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ---------------------------------------------------------------------------
// POST /billing/webhook
// ---------------------------------------------------------------------------

/**
 * Stripe Webhook Handler.
 *
 * CRITICAL SECURITY NOTE — WHY WE ALWAYS RETURN 200:
 * If we return a non-2xx status, Stripe assumes the webhook was not received
 * and will retry it — with exponential backoff — for 72 hours. This could 
 * result in your handlers running multiple times with stale data, causing 
 * double-upgrades or double-downgrades. Returning 200 immediately after 
 * processing (or even on known errors) stops retries.
 *
 * The ONLY thing that should fail hard (non-200) is signature verification
 * itself — because a failed signature means the request is not from Stripe.
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    res.status(400).json({ error: 'Missing Stripe signature or webhook secret' });
    return;
  }

  let event: any;

  try {
    // req.body is a raw Buffer here because this route uses express.raw().
    // If express.json() had run first, this would always throw — see the theory section.
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    // Signature mismatch — this request is NOT from Stripe. Reject it hard.
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    res.status(400).json({ error: `Webhook signature error: ${err.message}` });
    return;
  }

  // From here on, ALL errors are caught and still return 200 to prevent Stripe retries.
  try {
    switch (event.type) {
      // ── User successfully paid and completed checkout ────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        // The subscription object gives us the period end timestamp
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await activateProPlan(
          session.customer,
          subscription.id,
          (subscription.items.data[0].current_period_end),
        );
        console.log(`[Stripe] ✅ Pro plan activated for customer: ${session.customer}`);
        break;
      }

      // ── Monthly auto-renewal (keep Pro access, update expiry date) ───────────
      case 'invoice.paid': {
        const invoice = event.data.object;
        // Only subscriptions generate invoices with a subscription field
        if (!invoice.subscription) break;
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        await renewProPlan(
          invoice.customer,
          (subscription.items.data[0].current_period_end),
        );
        console.log(`[Stripe] 🔄 Pro plan renewed for customer: ${invoice.customer}`);
        break;
      }

      // ── Subscription cancelled (at end of period) — downgrade to free ───────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await downgradeToFree(subscription.customer);
        console.log(`[Stripe] ⬇️  Downgraded to free for customer: ${subscription.customer}`);
        break;
      }

      default:
        // Unhandled event — this is fine. Stripe sends many event types.
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    // Something went wrong processing the event. Log for investigation but return 200.
    // If we returned 500, Stripe would retry and we might double-process the event.
    console.error(`[Stripe] Error handling event ${event.type}:`, err.message);
  }

  // Always acknowledge receipt to prevent retry storms
  res.json({ received: true });
};
