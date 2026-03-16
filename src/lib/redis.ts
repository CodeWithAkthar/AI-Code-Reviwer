import Redis from 'ioredis';

/**
 * Shared Redis client singleton.
 *
 * WHY A SINGLETON?
 * Redis connections are stateful TCP sockets. Creating a new connection
 * per request would:
 *   1. Exhaust Redis's connection limit quickly under load (default: 10,000,
 *      but each idle connection still consumes server memory and a file descriptor)
 *   2. Add ~1-5ms of TCP handshake latency to every request
 *   3. Require manual cleanup to avoid connection leaks
 *
 * A single shared instance stays connected, reuses the socket for all
 * commands, and ioredis handles reconnection automatically if the connection
 * drops. BullMQ requires a dedicated connection per Queue/Worker, so we
 * export a `createRedisConnection` factory for those cases.
 */

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * The shared Redis client — used for ad-hoc commands (idempotency checks,
 * caching, etc.). Do NOT pass this directly to BullMQ; use
 * `createRedisConnection()` instead so BullMQ can manage its own lifecycle.
 */
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ when using this for queues
  enableReadyCheck: false,    // avoids startup delay in environments with slow HELLO
  lazyConnect: false,         // connect immediately so startup errors are caught early
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err: Error) => console.error('[Redis] Error:', err.message));

/**
 * Factory that creates a fresh ioredis connection for BullMQ.
 *
 * BullMQ requires each Queue and Worker to own a dedicated Redis connection
 * because it uses blocking commands (BRPOP, BLMOVE) that cannot share a
 * connection with regular commands — doing so would deadlock the socket.
 */
export function createRedisConnection(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
