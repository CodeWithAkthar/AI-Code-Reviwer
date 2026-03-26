import { Worker, Job } from 'bullmq';
import { processReview } from '../../modules/review/review.service';
import { ReviewJobData } from '../reviewQueue';
import * as wsManager from '../../lib/wsManager';

/**
 * BullMQ Worker for the 'review-queue'.
 *
 * WHY emit wsManager events here (in the worker) and not in the service?
 * The worker is the job lifecycle manager — it knows when a job STARTS and FAILS.
 * The service knows when individual files are processed. We split accordingly:
 *   - job:started / job:failed  → worker  (lifecycle events)
 *   - review:progress           → service (per-chunk business event, emitted via callback)
 *   - review:complete           → service (final result)
 *
 * WHY separate worker from service?
 * 1. The worker owns Redis/BullMQ connections and retry logic — not business logic.
 * 2. The service can be tested with direct function calls (no Redis needed).
 * 3. In a future microservices split, the worker moves to its own process easily.
 */

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const reviewWorker = new Worker<ReviewJobData>(
  'review-queue',
  async (job: Job<ReviewJobData>) => {
    const { userId, repoFullName, prNumber } = job.data;
    console.log(`[Worker] Picked up job ${job.id} for PR #${prNumber} in ${repoFullName}`);

    // ── Event 1: job:started ─────────────────────────────────────────────────
    // Emitted immediately so the dashboard changes status from "queued" → "reviewing".
    wsManager.send(userId, {
      type: 'job:started',
      prNumber,
      repo: repoFullName,
      jobId: job.id,
    });

    try {
      // review:progress and review:complete events are emitted from within 
      // processReview() because only the service knows per-file progress and the final result.
      await processReview(job.data);
      console.log(`[Worker] Successfully completed job ${job.id}`);
    } catch (error: any) {
      // ── Event 4: job:failed ──────────────────────────────────────────────────
      // Fires on each failed attempt so the UI can show an error state.
      wsManager.send(userId, {
        type: 'job:failed',
        prNumber,
        repo: repoFullName,
        error: error.message,
      });

      const fs = require('fs');
      const errLog = `
      ==========================================
      [Worker] Failed job ${job.id} for PR #${prNumber}
      installationId was: ${job.data.installationId}
      userId was: ${job.data.userId}
      repo: ${repoFullName}
      Error message: ${error.message}
      ==========================================\n`;
      fs.appendFileSync('error.log', errLog);
      
      console.error(`[Worker] Failed job ${job.id}:`, error.message);
      // Re-throw so BullMQ registers the failure and triggers retries / backoff
      throw error;
    }
  },
  {
    connection: { url: redisUrl },
    // Limit concurrency so we don't get rate-limited by Groq/GitHub in burst scenarios
    concurrency: 5,
  }
);

reviewWorker.on('failed', (job, err) => {
  console.log(`[Worker] Job ${job?.id} attempt failed: ${err.message}`);
});

reviewWorker.on('error', (err) => {
  console.error('[Worker] Fatal error:', err);
});
