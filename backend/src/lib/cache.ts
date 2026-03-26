import { redis } from './redis';

/**
 * Defining all Redis key patterns as constants to prevent typos and ensure
 * we don't accidentally trample data across different features.
 */
const KEYS = {
  // Free tier billing cycle limit
  rateLimit: (userId: string, yearMonth: string) => `ratelimit:${userId}:${yearMonth}`,
  
  // Saves API token cost for Claude on re-runs of the identical commit
  diff: (repoId: string, prNumber: number, commitSha: string) => `diff:${repoId}:${prNumber}:${commitSha}`,
  
  // Quick auth verification (avoids hitting MongoDB on every API request)
  session: (userId: string) => `user:${userId}`,
  
  // Dashboard fast-load caching
  review: (repoId: string, prNumber: number) => `review:${repoId}:${prNumber}`,
};

// ---------------------------------------------------------------------------
// Rate Limiting (YYYY-MM window)
// ---------------------------------------------------------------------------

/**
 * Helper to get the number of seconds remaining until the exact end of the
 * current calendar month. This ensures rolling over accurately at midnight.
 */
function getSecondsUntilEndOfMonth(): number {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.floor((nextMonth.getTime() - now.getTime()) / 1000);
}

/**
 * Increments the user's usage count for the current month.
 * If this is the very first time the key is created, we set the TTL to
 * cleanly expire exactly when the month ends.
 */
export async function incrementRateLimit(userId: string): Promise<number> {
  const currentMonth = new Date().toISOString().slice(0, 7); // e.g., "2026-03"
  const key = KEYS.rateLimit(userId, currentMonth);

  // INCR handles both creating the key (as 0 → 1) and incrementing it atomically
  const count = await redis.incr(key);

  if (count === 1) {
    // If we just created the key, assign the TTL so it cleans up next month
    await redis.expire(key, getSecondsUntilEndOfMonth());
  }

  return count;
}

/**
 * Reads the current usage without incrementing it.
 */
export async function getRateLimitUsage(userId: string): Promise<number> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const val = await redis.get(KEYS.rateLimit(userId, currentMonth));
  return val ? parseInt(val, 10) : 0;
}

// ---------------------------------------------------------------------------
// Diff Caching (1 Hour TTL)
// WHY: We don't want to fetch a massive diff string from the GitHub API multiple
// times if the user rapidly restarts the job before pushing new code. 
// 1 hour is a safe cache length for active development sessions.
// ---------------------------------------------------------------------------

export async function setCachedDiff(repoId: string, prNumber: number, commitSha: string, diffText: string): Promise<void> {
  // SETEX: Atomic "SET" and "EXPIRE" in one command. (3600s = 1 hr)
  await redis.setex(KEYS.diff(repoId, prNumber, commitSha), 3600, diffText);
}

export async function getCachedDiff(repoId: string, prNumber: number, commitSha: string): Promise<string | null> {
  return redis.get(KEYS.diff(repoId, prNumber, commitSha));
}

// ---------------------------------------------------------------------------
// User Session Caching (15 Minute TTL)
// WHY: The `authenticate` middleware parses the JWT token on every route.
// Instead of looking up the User in MongoDB on every request, we cache them.
// We keep TTL short (15m) so plan changes take effect quickly.
// ---------------------------------------------------------------------------

export async function setCachedSession(userId: string, userDoc: any): Promise<void> {
  await redis.setex(KEYS.session(userId), 900, JSON.stringify(userDoc));
}

export async function getCachedSession(userId: string): Promise<any | null> {
  const data = await redis.get(KEYS.session(userId));
  return data ? JSON.parse(data) : null;
}

export async function invalidateCachedSession(userId: string): Promise<void> {
  await redis.del(KEYS.session(userId));
}

// ---------------------------------------------------------------------------
// Review Result Caching (24 Hour TTL)
// WHY: The Dashboard reads completed reviews constantly. Reviews are read-heavy
// and rarely change once completed. Caching saves expensive MongoDB lookups.
// ---------------------------------------------------------------------------

export async function setCachedReview(repoId: string, prNumber: number, reviewDoc: any): Promise<void> {
  await redis.setex(KEYS.review(repoId, prNumber), 86400, JSON.stringify(reviewDoc));
}

export async function getCachedReview(repoId: string, prNumber: number): Promise<any | null> {
  const data = await redis.get(KEYS.review(repoId, prNumber));
  return data ? JSON.parse(data) : null;
}
