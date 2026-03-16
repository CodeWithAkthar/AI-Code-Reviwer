import express, { Router } from 'express';
import { handleGitHubWebhook } from './webhook.controller';

/**
 * WHY express.raw() HERE, NOT express.json()?
 *
 * GitHub's HMAC signature is computed over the RAW request body bytes —
 * the exact byte sequence GitHub sent, before any parsing.
 *
 * express.json() does two things:
 *   1. Reads the raw bytes into memory ✅
 *   2. JSON.parses them and replaces req.body with the parsed object ❌
 *
 * After express.json() runs, the original bytes are GONE. When we then try
 * to compute HMAC, there is nothing to hash — the signature will never match.
 *
 * express.raw({ type: 'application/json' }) does only step 1:
 *   - req.body becomes a Buffer containing the raw bytes
 *   - We compute HMAC on that Buffer (in the controller)
 *   - We then JSON.parse the Buffer ourselves after validation passes
 *
 * This is why the webhook route CANNOT use the global express.json()
 * middleware — it must have its own raw body parser.
 *
 * See app.ts for the middleware ordering that makes this possible.
 */
const router = Router();

/**
 * Raw body parser middleware for the webhook route.
 * Placed here (not in app.ts) so it applies exclusively to POST /webhooks/github.
 * The 1mb limit prevents oversized payloads from exhausting memory.
 */
const rawBodyParser = express.raw({ type: 'application/json', limit: '1mb' });

// POST /webhooks/github — receive GitHub webhook events
router.post('/github', rawBodyParser, handleGitHubWebhook);

export { router as webhookRouter };
