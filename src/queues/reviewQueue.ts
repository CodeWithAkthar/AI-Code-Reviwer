import { Queue } from 'bullmq';

/**
 * The data payload stored with every review job.
 *
 * Keeping this typed ensures the Worker (Module 5) and the Queue
 * agree on the exact shape without runtime surprises.
 */
export interface ReviewJobData {
  prNumber: number;
  repoFullName: string;
  installationId: number;
  sender: string;
  deliveryId: string;
}

/**
 * QUEUE vs WORKER — why they are in separate files:
 *
 * A BullMQ `Queue` is the producer side — it adds jobs to Redis.
 * A BullMQ `Worker` is the consumer side — it picks up and processes jobs.
 *
 * They are intentionally separated because:
 *   1. In a modular monolith you may want to start the web server (which
 *      enqueues jobs) without also starting the worker (which processes them).
 *      Keeping them separate lets you do `import { reviewQueue }` without
 *      accidentally spawning a worker process.
 *   2. In a microservices split, the Queue lives in the API process and
 *      the Worker lives in a separate worker process. Separate files make
 *      that refactor trivial.
 *   3. Workers hold open Redis blocking connections. A Queue does not.
 *      Importing only the Queue in the webhook handler keeps the connection
 *      count low.
 *
 * WHY pass connection options (not an IORedis instance) to BullMQ?
 * BullMQ v5 manages its own IORedis connection lifecycle internally.
 * It requires a plain ConnectionOptions object so it can control when
 * to connect, reconnect, and close the socket. Passing an existing
 * IORedis instance causes a TypeScript type mismatch (AbstractConnector)
 * because BullMQ wraps the connection in its own connector class.
 */
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');

export const reviewQueue = new Queue<ReviewJobData, void, string>('review-queue', {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port) || 6379,
    password: redisUrl.password || undefined,
    username: redisUrl.username || undefined,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
  },
  defaultJobOptions: {
    removeOnComplete: 100, // keep last 100 completed jobs for debugging
    removeOnFail: 200,     // keep last 200 failed jobs for post-mortem analysis
  },
});

console.log('[BullMQ] review-queue initialized');
