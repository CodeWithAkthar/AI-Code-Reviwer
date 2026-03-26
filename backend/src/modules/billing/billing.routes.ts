import express, { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { createCheckout, openPortal, handleWebhook } from './billing.controller';

export const billingRouter: Router = express.Router();

// ── Stripe Webhook ──────────────────────────────────────────────────────────
// CRITICAL: express.raw() MUST be the first middleware on this route.
// This captures the raw Buffer body that Stripe's signature verification needs.
// It is mounted on the specific route — it does NOT affect other billing routes.
// The global express.json() (in app.ts) will NOT run on this request because
// route-level middleware runs before the response is handed to global middleware.
billingRouter.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// ── Protected Routes ────────────────────────────────────────────────────────
// `authenticate` validates the JWT and populates req.user.
// These routes must come AFTER the webhook to avoid express.json() intercepting it.
billingRouter.post('/create-checkout-session', authenticate, createCheckout);
billingRouter.post('/portal', authenticate, openPortal);
