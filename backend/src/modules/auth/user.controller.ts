import { Request, Response } from 'express';
import { Review } from '../review/review.model';
import { Repository } from '../review/repository.model';

export const getUsage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Count reviews created this month by this user
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const used = await Review.countDocuments({
      user: userId,
      createdAt: { $gte: startOfMonth },
    });

    res.json({ used });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
};

export const getRepos = async (req: Request, res: Response) => {
  try {
    const githubId = req.user?.githubId;
    if (!githubId) return res.status(401).json({ error: 'Unauthorized' });

    // Repos installed by this user's GitHub ID (from GitHub webhook)
    const repos = await Repository.find({ installedBy: githubId }).lean();
    
    // Calculate review counts per repo
    const reposWithCounts = await Promise.all(
      repos.map(async (repo) => {
        const reviewCount = await Review.countDocuments({ repo: repo._id });
        return { ...repo, reviewCount };
      })
    );

    res.json({ repos: reposWithCounts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch repos' });
  }
};

export const toggleRepo = async (req: Request, res: Response) => {
  try {
    const { isActive } = req.body;
    const { repoId } = req.params;
    
    await Repository.findByIdAndUpdate(repoId, { isActive });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update repo' });
  }
};
