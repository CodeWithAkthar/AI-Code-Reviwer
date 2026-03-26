import express, { Router } from 'express';
import { handleGitHubWebhook } from './webhook.controller';
import { enforcePlanLimit } from '../../middleware/rateLimit';

/**
 * WHY express.raw() HERE, NOT express.json()?
 * -------------------------------------------------------------------
 * GitHub webhooks are secured using an HMAC-SHA256 signature calculated over the 
 * EXACT raw byte payload sent over the wire.
 * 
 * If we use `express.json()` globally before this route, it consumes the raw byte
 * stream, parses it into an object, and throws away the bytes. When we try to 
 * stringify it back later to calculate the signature, JS object key ordering and 
 * spacing variations will produce a completely different payload string, causing 
 * signature validation to fail permanently.
 * 
 * `express.raw({ type: 'application/json' })` safely captures the raw Buffer 
 * and stores it on `req.body` so `webhook.controller` can compute the HMAC cleanly.
 */

export const webhookRouter: Router = express.Router();

// The rate limit must run BEFORE handleGitHubWebhook to prevent
// BullMQ enqueueing and Claude tokens being spent on blocked users.
// Added enforcePlanLimit middleware:
webhookRouter.post('/github', express.raw({ type: 'application/json' }), enforcePlanLimit, handleGitHubWebhook);
