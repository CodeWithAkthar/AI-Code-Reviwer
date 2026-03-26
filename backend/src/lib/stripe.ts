import Stripe from 'stripe';

/**
 * Singleton Stripe client.
 *
 * WHY A SINGLETON?
 * We initialize the Stripe SDK with our secret key once at startup.
 * Creating a new Stripe instance per-request would waste memory and slow down 
 * requests. By exporting a single shared instance from this module, Node's 
 * module caching guarantees we always use the same object.
 *
 * SECURITY: process.env.STRIPE_SECRET_KEY is only ever present on the server.
 * It is never passed to the frontend. Never log this value.
 */
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('[Stripe] STRIPE_SECRET_KEY is not set in environment variables');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Pin the API version so Stripe schema changes don't silently break our code.
  apiVersion: '2026-03-25.dahlia',
  typescript: true,
});
