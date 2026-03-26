import { Request, Response } from 'express';
import { Review } from './review.model';
import { getCachedReview, setCachedReview } from '../../lib/cache';

/**
 * Controller to fetch all reviews for the authenticated user to display on 
 * the React dashboard.
 */
export const getUserReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Leveraging the compound index we specifically created: { user: 1, createdAt: -1 }
    // which makes this extremely fast without caching everything globally.
    const reviews = await Review.find({ user: userId })
      .populate('repo', 'fullName isActive') // only select a couple fields
      .sort({ createdAt: -1 })
      .lean(); // returns raw JS objects, not mongoose Documents (faster execution)

    res.json({ reviews });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
};

/**
 * Controller to fetch a specific PR review.
 * Heavily utilizes Redis caching because individual PR detail views are 
 * frequently refreshed or fetched and rarely change once completed.
 */
export const getReviewDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const repoId = req.params.repoId as string;
    const prNumberStr = req.params.prNumber as string;

    // 1. FAST PATH: Check the Redis Cache
    const cached = await getCachedReview(repoId, parseInt(prNumberStr, 10));
    if (cached) {
      res.json({ review: cached, source: 'cache' }); // "source: cache" helps debug if it worked!
      return;
    }

    // 2. SLOW PATH: Hit MongoDB
    const review = await Review.findOne({ repo: repoId, prNumber: parseInt(prNumberStr, 10) }).lean();
    
    if (!review) {
      res.status(404).json({ error: 'Review not found' });
      return;
    }

    // 3. Save to Cache for 24 hours (if the review process is entirely complete)
    // We only cache completed/failed jobs indefinitely. Processing ones shouldn't be long-term cached
    // because their data changes frequently as streaming completes.
    if (review.status === 'completed' || review.status === 'failed') {
      await setCachedReview(repoId, parseInt(prNumberStr, 10), review);
    }

    res.json({ review, source: 'database' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch review detail' });
  }
};
