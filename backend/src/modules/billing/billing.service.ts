import { stripe } from '../../lib/stripe';
import { User, IUser } from '../auth/auth.model';

/**
 * Retrieves the Stripe Customer ID for a user, creating one if it doesn't exist.
 *
 * WHY: Stripe requires a Customer object to attach subscriptions, payment methods,
 * and invoices to. We create it once and store the ID on our User doc so we don't
 * create duplicate customers for the same person (which causes billing chaos).
 */
export async function getOrCreateStripeCustomer(user: IUser): Promise<string> {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.username,
    // Store our internal userId in Stripe metadata so we can always cross-reference
    metadata: { userId: user._id.toString() },
  });

  // Persist the Stripe customer ID so we don't create duplicates on next call
  await User.updateOne({ _id: user._id }, { stripeCustomerId: customer.id });

  return customer.id;
}

/**
 * Creates a Stripe Checkout Session for upgrading to the Pro plan.
 *
 * Returns the session URL to redirect the user to Stripe's hosted checkout page.
 *
 * SECURITY: The `client_reference_id` is set to our internal userId.
 * When Stripe fires the `checkout.session.completed` webhook, we use this ID
 * to find the correct user — not anything from the frontend (which can be faked).
 */
export async function createCheckoutSession(user: IUser, priceId: string): Promise<string> {
  const customerId = await getOrCreateStripeCustomer(user);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    // client_reference_id lets us identify this user in the webhook without
    // trusting any query params the frontend might pass.
    client_reference_id: user._id.toString(),
    success_url: `${process.env.FRONTEND_URL}/billing/success`,
    cancel_url: `${process.env.FRONTEND_URL}/billing/cancel`,
  });

  if (!session.url) throw new Error('Stripe did not return a session URL');
  return session.url;
}

/**
 * Creates a Stripe Billing Portal session so the user can manage their subscription.
 *
 * The portal lets users update payment methods, view invoices, and cancel —
 * all handled by Stripe's hosted UI so WE don't need to build any of that.
 */
export async function createPortalSession(user: IUser): Promise<string> {
  const customerId = await getOrCreateStripeCustomer(user);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.FRONTEND_URL}/dashboard`,
  });

  return session.url;
}

/**
 * Upgrades a user to Pro after successful payment.
 * Called only from the verified Stripe webhook handler — never from the frontend.
 *
 * @param stripeCustomerId - The Stripe customer ID from the webhook event
 * @param subscriptionId   - The new Stripe Subscription ID
 * @param periodEnd        - Unix timestamp (seconds) when this billing period ends
 */
export async function activateProPlan(
  stripeCustomerId: string,
  subscriptionId: string,
  periodEnd: number,
): Promise<void> {
  await User.updateOne(
    { stripeCustomerId },
    {
      plan: 'pro',
      stripeSubscriptionId: subscriptionId,
      // Convert Unix seconds → JS Date
      planExpiresAt: new Date(periodEnd * 1000),
    },
  );
}

/**
 * Keeps the Pro plan active and refreshes the period end date.
 * Called when Stripe fires `invoice.paid` (monthly auto-renewal).
 *
 * @param stripeCustomerId - The Stripe customer ID from the webhook event
 * @param periodEnd        - Unix timestamp of the new billing period end
 */
export async function renewProPlan(stripeCustomerId: string, periodEnd: number): Promise<void> {
  await User.updateOne(
    { stripeCustomerId },
    { planExpiresAt: new Date(periodEnd * 1000) },
  );
}

/**
 * Downgrades a user to free when their subscription is cancelled.
 * Called when Stripe fires `customer.subscription.deleted`.
 *
 * WHY NOT DOWNGRADE IMMEDIATELY ON CANCEL?
 * When a user clicks "Cancel subscription" in the portal, Stripe doesn't end
 * access immediately — it marks the subscription to cancel at `period_end`.
 * The `subscription.deleted` event fires at the actual end of the period.
 * This way the user gets access for the rest of the month they paid for.
 */
export async function downgradeToFree(stripeCustomerId: string): Promise<void> {
  await User.updateOne(
    { stripeCustomerId },
    {
      plan: 'free',
      stripeSubscriptionId: null,
      planExpiresAt: null,
    },
  );
}
