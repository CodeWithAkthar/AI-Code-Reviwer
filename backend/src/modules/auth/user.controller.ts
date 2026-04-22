import { Request, Response } from 'express';
import { Review } from '../review/review.model';
import { Repository } from '../review/repository.model';
import axios from 'axios';
import { User } from './auth.model';

interface GitHubRepoApiItem {
  id: number;
  full_name: string;
  private: boolean;
}

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
    const userId = req.user?.userId;
    const githubId = req.user?.githubId;
    if (!userId || !githubId) return res.status(401).json({ error: 'Unauthorized' });

    // Start with the authenticated user's GitHub account id.
    const installedByCandidates = new Set<string>([githubId]);

    // Include org IDs where this user is a member so org-installed repos appear too.
    const userDoc = await User.findById(userId).select('githubAccessToken').lean();
    if (userDoc?.githubAccessToken) {
      try {
        const orgsResp = await axios.get<Array<{ id: number }>>(
          'https://api.github.com/user/orgs',
          {
            headers: {
              Authorization: `Bearer ${userDoc.githubAccessToken}`,
              Accept: 'application/vnd.github+json',
            },
          },
        );
        for (const org of orgsResp.data) {
          installedByCandidates.add(String(org.id));
        }
      } catch (err) {
        // Fail-open: still return personal repos if org lookup fails.
        console.warn('[getRepos] Failed to fetch GitHub orgs:', err);
      }
    }

    // Include repos owned by this app user OR installed by user/org GitHub account.
    const dbRepos = await Repository.find({
      $or: [
        { owner: userId },
        { installedBy: { $in: Array.from(installedByCandidates) } },
      ],
    }).lean();

    // If token is missing, keep existing behavior (DB only).
    if (!userDoc?.githubAccessToken) {
      const repos = await Promise.all(
        dbRepos.map(async (repo) => {
          const reviewCount = await Review.countDocuments({ repo: repo._id });
          return {
            _id: repo._id,
            githubRepoId: repo.githubRepoId,
            fullName: repo.fullName,
            isPrivate: false,
            isAppInstalled: true,
            isActive: repo.isActive,
            installationId: repo.installationId,
            reviewCount,
          };
        }),
      );
      res.json({ repos });
      return;
    }

    try {
      const githubReposResp = await axios.get<GitHubRepoApiItem[]>(
        'https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member',
        {
          headers: {
            Authorization: `Bearer ${userDoc.githubAccessToken}`,
            Accept: 'application/vnd.github+json',
          },
        },
      );

      const githubRepoIds = githubReposResp.data.map((repo) => String(repo.id));
      const installedRepos = await Repository.find({
        githubRepoId: { $in: githubRepoIds },
      }).lean();
      const reviewCounts = await Promise.all(
        installedRepos.map(async (repo) => {
          const reviewCount = await Review.countDocuments({ repo: repo._id });
          return [repo.githubRepoId, reviewCount] as const;
        }),
      );
      const reviewCountByGithubRepoId = new Map(reviewCounts);
      const installedRepoByGithubId = new Map(
        installedRepos.map((repo) => [repo.githubRepoId, repo]),
      );

      const mergedRepos = githubReposResp.data.map((ghRepo) => {
        const githubRepoId = String(ghRepo.id);
        const dbRepo = installedRepoByGithubId.get(githubRepoId);

        if (dbRepo) {
          return {
            _id: dbRepo._id,
            githubRepoId: dbRepo.githubRepoId,
            fullName: dbRepo.fullName,
            isPrivate: ghRepo.private,
            isAppInstalled: true,
            isActive: dbRepo.isActive,
            installationId: dbRepo.installationId,
            reviewCount: reviewCountByGithubRepoId.get(githubRepoId) ?? 0,
          };
        }

        return {
          githubRepoId,
          fullName: ghRepo.full_name,
          isPrivate: ghRepo.private,
          isActive: false,
          reviewCount: 0,
          installationId: undefined,
          isAppInstalled: false,
        };
      });

      res.json({ repos: mergedRepos });
      return;
    } catch (err) {
      // Required fallback: if GitHub API fails, return DB repos only.
      console.warn('[getRepos] Failed to fetch /user/repos, using DB fallback:', err);
      const repos = await Promise.all(
        dbRepos.map(async (repo) => {
          const reviewCount = await Review.countDocuments({ repo: repo._id });
          return {
            _id: repo._id,
            githubRepoId: repo.githubRepoId,
            fullName: repo.fullName,
            isPrivate: false,
            isAppInstalled: true,
            isActive: repo.isActive,
            installationId: repo.installationId,
            reviewCount,
          };
        }),
      );
      res.json({ repos });
      return;
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch repos' });
  }
};

export const toggleRepo = async (req: Request, res: Response) => {
  try {
    const { isActive } = req.body;
    const { repoId } = req.params;

    const updated = await Repository.findOneAndUpdate(
      { githubRepoId: repoId },
      { isActive },
      { new: true },
    );
    if (!updated) {
      res.status(404).json({ error: 'GitHub App not installed on this repo' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update repo' });
  }
};
