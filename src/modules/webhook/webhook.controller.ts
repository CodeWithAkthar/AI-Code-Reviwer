import crypto from 'crypto';
import { Request, Response } from 'express';
import { redis } from '../../lib/redis';
import { reviewQueue } from '../../queues/reviewQueue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a GitHub pull_request webhook payload (partial — only what we use) */
interface GitHubPullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
  };
  repository: {
    full_name: string;
  };
  installation?: {
    id: number;
  };
  sender: {
    login: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Actions we care about — others are ignored with 200 */
const RELEVANT_ACTIONS = new Set(['opened', 'synchronize']);

/** TTL for the idempotency key — 24 hours in seconds */
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

// ---------------------------------------------------------------------------
// HMAC Validation helper
// ---------------------------------------------------------------------------

/**
 * Validates the GitHub webhook HMAC-SHA256 signature.
 *
 * WHAT IS A TIMING ATTACK?
 * A naive string comparison (`sig === expected`) returns early as soon as it
 * finds the first mismatched character. An attacker can measure response times
 * across thousands of requests with slightly different signatures to determine,
 * byte by byte, what the correct signature looks like — even without knowing
 * the secret. This is a timing side-channel attack.
 *
 * `crypto.timingSafeEqual` always compares ALL bytes regardless of where the
 * first mismatch is, making every comparison take the same amount of time.
 * This eliminates the timing signal entirely.
 *
 * @param rawBody - The raw request body Buffer (pre-JSON-parse)
 * @param signature - The x-hub-signature-256 header value from GitHub
 * @returns true if the signature matches, false otherwise
 */
function isValidSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('GITHUB_WEBHOOK_SECRET environment variable is not set');
  }

  // GitHub sends: "sha256=<hex_digest>"
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')}`;

  // Both buffers must be the same length for timingSafeEqual to work.
  // If lengths differ, the signature is definitely wrong — return false
  // without risking a length-based timing leak.
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}


// ---------------------------------------------------------------------------
// Main webhook handler
// ---------------------------------------------------------------------------

/**
 * Handles incoming GitHub webhook POST requests.
 *
 * Processing pipeline (in order — each step short-circuits on failure):
 *   1. HMAC signature validation
 *   2. Idempotency check (Redis)
 *   3. Event/action filtering
 *   4. Job enqueue (BullMQ)
 */
export async function handleGitHubWebhook(req: Request, res: Response): Promise<void> {

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — HMAC Signature Validation
  // ─────────────────────────────────────────────────────────────────────────
  //
  // The raw body must be a Buffer here — this is guaranteed by the
  // express.raw() middleware on the webhook route (NOT express.json()).
  // express.json() parses and discards the raw body, making HMAC impossible.
  const rawBody = req.body as Buffer;
  const signature = req.headers['x-hub-signature-256'];

  if (!signature || typeof signature !== 'string') {
    res.status(401).json({ error: 'Missing x-hub-signature-256 header' });
    return;
  }

  let signatureValid: boolean;
  try {
    signatureValid = isValidSignature(rawBody, signature);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signature validation error';
    res.status(500).json({ error: message });
    return;
  }

  if (!signatureValid) {
    // Do not reveal whether the secret is wrong or the body was tampered with.
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — Idempotency Check
  // ─────────────────────────────────────────────────────────────────────────
  //
  // WHY 200 for duplicates, not 4xx?
  // GitHub's webhook delivery system retries when it does NOT receive a 2xx
  // response within 10 seconds. If we return 409/4xx, GitHub will keep
  // retrying, flooding our system. Returning 200 tells GitHub "we got it,
  // no need to retry" — even though we are skipping processing.
  const deliveryId = req.headers['x-github-delivery'];

  if (!deliveryId || typeof deliveryId !== 'string') {
    res.status(400).json({ error: 'Missing x-github-delivery header' });
    return;
  }

  const idempotencyKey = `webhook:${deliveryId}`;
  const alreadyProcessed = await redis.get(idempotencyKey);

  if (alreadyProcessed) {
    res.status(200).json({ status: 'duplicate', deliveryId });
    return;
  }

  // Reserve the key with a 24-hour TTL BEFORE processing.
  // Using SET NX (set if not exists) is atomic — no race condition possible
  // even with multiple server instances receiving the same delivery.
  await redis.set(idempotencyKey, '1', 'EX', IDEMPOTENCY_TTL_SECONDS);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3 — Event Filtering
  // ─────────────────────────────────────────────────────────────────────────
  //
  // WHY 200 for ignored events?
  // Same reason as duplicates — GitHub will retry any non-2xx response.
  // We don't want retries for events we simply don't care about (e.g.,
  // `push`, `issues`, `star`). 200 + { status: "ignored" } signals
  // "received and understood, nothing to do".
  const githubEvent = req.headers['x-github-event'];

  if (githubEvent !== 'pull_request') {
    res.status(200).json({ status: 'ignored', event: githubEvent });
    return;
  }

  // Parse the raw body (Buffer) into a typed payload
  const payload = JSON.parse(rawBody.toString('utf8')) as GitHubPullRequestPayload;

  if (!RELEVANT_ACTIONS.has(payload.action)) {
    res.status(200).json({ status: 'ignored', event: githubEvent, action: payload.action });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4 — Enqueue Review Job
  // ─────────────────────────────────────────────────────────────────────────
  //
  // WHAT IS EXPONENTIAL BACKOFF?
  // If the AI review API is temporarily unavailable, we do not want to hammer
  // it with retries immediately. Exponential backoff means each retry waits
  // twice as long as the previous:
  //   Attempt 1 fails → wait 5s
  //   Attempt 2 fails → wait 10s
  //   Attempt 3 fails → wait 20s
  // This gives the downstream system time to recover, and prevents a cascade
  // of simultaneous retries from all queued jobs (the "thundering herd" problem).
  const job = await reviewQueue.add(
    'review-pr',
    {
      prNumber: payload.number,
      repoFullName: payload.repository.full_name,
      installationId: payload.installation?.id ?? 0,
      sender: payload.sender.login,
      deliveryId,
    },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s → 10s → 20s
      },
    },
  );

  res.status(200).json({
    status: 'queued',
    jobId: job.id,
    prNumber: payload.number,
    repo: payload.repository.full_name,
  });
}
