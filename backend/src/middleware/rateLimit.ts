import { Request, Response, NextFunction } from 'express';
import { getRateLimitUsage, incrementRateLimit } from '../lib/cache';
import { User } from '../modules/auth/auth.model';
import { Repository } from '../modules/review/repository.model';

const FREE_TIER_LIMIT = 5;

/**
 * Express middleware that intercepts webhook deliveries right before BullMQ
 * enqueue happens. It verifies that Free Tier users have not exceeded their
 * monthly limit.
 *
 * If they have, it returns HTTP 429 to GitHub (stopping the queue entirely),
 * which saves us server compute and AI token costs.
 */
export const enforcePlanLimit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // The body at this point is still a raw Buffer (express.raw middleware is on this route).
    // We need to parse it to inspect the repo name — but NOT consume it (the webhook
    // handler will also need to parse it). Reading a Buffer is safe — it's non-destructive.
    let payload: { repository?: { full_name?: string } };
    try {
      payload = JSON.parse((req.body as Buffer).toString('utf8'));
    } catch {
      // If the body isn't valid JSON, let the webhook handler deal with it
      return next();
    }

    const repoFullName = payload?.repository?.full_name;
    if (!repoFullName) {
      // Installation events don't have .repository — pass them through
      return next();
    }

    // 1. Look up the repo to find the owning user
    const repo = await Repository.findOne({ fullName: repoFullName });

    if (!repo) {
      // Repo is not registered in our system — reject the webhook
      res.status(403).json({ error: 'Repository not registered in our system.' });
      return;
    }

    // 2. Look up the user — first via installedBy (GitHub ID string), then owner ref
    let user;
    if (repo.installedBy) {
      user = await User.findOne({ githubId: repo.installedBy });
    } else if (repo.owner) {
      user = await User.findById(repo.owner);
    }

    if (!user) {
      // Repo known but user not found — fail-open (let it through)
      return next();
    }

    // 3. Pro users bypass the limit entirely
    if (user.plan === 'pro') {
      await incrementRateLimit(user._id.toString());
      return next();
    }

    // 4. Free tier — check Redis usage counter
    const currentUsage = await getRateLimitUsage(user._id.toString());

    if (currentUsage >= FREE_TIER_LIMIT) {
      res.status(429).json({
        error: `Monthly free tier limit reached (${currentUsage}/${FREE_TIER_LIMIT}). Please upgrade your plan.`,
      });
      return;
    }

    // 5. Under limit — increment and allow
    await incrementRateLimit(user._id.toString());
    next();

  } catch (error) {
    console.error('[RateLimitError]', error);
    // Fail-open on infrastructure errors so paying users aren't blocked by a Redis blip
    next();
  }
};
