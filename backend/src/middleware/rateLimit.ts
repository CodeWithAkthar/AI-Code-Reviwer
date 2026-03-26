import { Request, Response, NextFunction } from 'express';
import { getRateLimitUsage, incrementRateLimit } from '../lib/cache';
import { User } from '../modules/auth/auth.model';
import { Repository } from '../modules/review/repository.model';

// The max free PR reviews per month defined in requirements
const FREE_TIER_LIMIT = 5;

/**
 * Express middleware that intercepts webhook deliveries right before BullMQ
 * enqueue happens. It verifies that Free Tier users have not exceeded their
 * monthly limit.
 *
 * If they have, it returns an HTTP 429 to GitHub (stopping the queue entirely),
 * which saves us server compute and Anthropic token costs.
 */
export const enforcePlanLimit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payload = req.body;
    
    // 1. We must find which User owns the Repository this PR belongs to.
    const repoFullName = payload.repository.full_name;
    const repo = await Repository.findOne({ fullName: repoFullName }).populate('owner');

    if (!repo || !repo.owner) {
      // If we don't know who this is, we can't rate limit them, so we must fail safely 
      // by either letting it pass or blocking it. We'll block it since it indicates an 
      // internal state bug if a webhook fires for an unregistered repo.
      res.status(403).json({ error: 'Repository not registered in our system.' });
      return;
    }

    const user = repo.owner as any; // Cast populated doc
    
    // 2. Pro/Enterprise users bypass the check completely
    if (user.plan === 'pro' || user.plan === 'enterprise') {
      // Still tracked for usage metrics, but we don't block
      await incrementRateLimit(user._id.toString());
      return next();
    }

    // 3. For free tier, check actual Redis usage
    const currentUsage = await getRateLimitUsage(user._id.toString());

    if (currentUsage >= FREE_TIER_LIMIT) {
      res.status(429).json({
        error: `Monthly free tier limit reached (${FREE_TIER_LIMIT}/${FREE_TIER_LIMIT}). Please upgrade your plan.`,
      });
      return;
    }

    // 4. They haven't hit the limit. Increment and allow the request to proceed.
    await incrementRateLimit(user._id.toString());
    next();
    
  } catch (error) {
    console.error('[RateLimitError]', error);
    // On Redis/DB failure, it's a best practice to fail-open so your product 
    // doesn't completely break for paying users just because Redis blipped.
    next();
  }
};
