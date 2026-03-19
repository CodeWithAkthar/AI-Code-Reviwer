import { Worker, Job } from 'bullmq';
import { processReview } from '../../modules/review/review.service';
import { ReviewJobData } from '../reviewQueue';

/**
 * BullMQ Worker for the 'review-queue'.
 * 
 * Why separate the worker from the service layer?
 * 1. Decoupling: The worker handles the orchestration of pulling jobs, retries, concurrency, 
 *    and Redis connection lifecycle. The service handles pure business logic (diff fetching, AI calling, saving).
 * 2. Testing: We can test the `processReview` service function independently by passing it mock job data, 
 *    without needing a running BullMQ or Redis instance.
 * 3. Scalability: If we split this monolith into microservices, the worker file easily 
 *    moves to its own isolated Node process containing only review-queue consumers.
 */

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const reviewWorker = new Worker<ReviewJobData>(
  'review-queue',
  async (job: Job<ReviewJobData>) => {
    console.log(`[Worker] Picked up job ${job.id} for PR #${job.data.prNumber} in ${job.data.repoFullName}`);
    
    try {
      // Call into the isolated business logic layer
      await processReview(job.data);
      console.log(`[Worker] Successfully completed job ${job.id}`);
    } catch (error: any) {
      console.error(`[Worker] Failed job ${job.id}:`, error.message);
      // Re-throw so BullMQ registers the failure and triggers retries/backoff
      throw error;
    }
  },
  {
    connection: {
      url: redisUrl,
    },
    // We restrict concurrency so we don't accidentally get rate-limited by Claude/GitHub
    // if a burst of 50 webhooks comes in at once.
    concurrency: 5,
  }
);

reviewWorker.on('failed', (job, err) => {
  // This event runs after a specific attempt fails. It logs the failure.
  console.log(`[Worker] Job ${job?.id} attempt failed with reason: ${err.message}`);
});

reviewWorker.on('error', (err) => {
  // Catch broader worker-level connection/Redis errors
  console.error('[Worker] Fatal error:', err);
});
