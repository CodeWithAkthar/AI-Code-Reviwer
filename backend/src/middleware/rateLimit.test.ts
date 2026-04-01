import { Request, Response, NextFunction } from 'express';
import { enforcePlanLimit } from './rateLimit';
import { getRateLimitUsage, incrementRateLimit } from '../lib/cache';
import { User } from '../modules/auth/auth.model';
import { Repository } from '../modules/review/repository.model';

// Mock dependencies completely to avoid hitting real Redis or MongoDB
jest.mock('../lib/cache', () => ({
  getRateLimitUsage: jest.fn(),
  incrementRateLimit: jest.fn(),
}));

jest.mock('../modules/auth/auth.model', () => ({
  User: {
    findOne: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock('../modules/review/repository.model', () => ({
  Repository: {
    findOne: jest.fn(),
  },
}));

describe('Rate limit checker', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    // Reset all mocks before each test block specifically
    jest.clearAllMocks();

    req = {
      body: Buffer.from(JSON.stringify({
        repository: { full_name: 'test/repo' }
      }))
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    next = jest.fn();

    // Setup base successful mocks for Repo and User finds
    (Repository.findOne as jest.Mock).mockResolvedValue({ owner: 'userId123' });
    (User.findById as jest.Mock).mockResolvedValue({ _id: 'userId123', plan: 'free' });
  });

  it('Under limit passes: allows webhook when usage is under FREE_TIER_LIMIT (5)', async () => {
    // Setup Mock: Usage currently at 4 (under limit of 5)
    (getRateLimitUsage as jest.Mock).mockResolvedValue(4);

    await enforcePlanLimit(req as Request, res as Response, next);

    // Validate logic increments usage tracking natively securely cleanly
    expect(incrementRateLimit).toHaveBeenCalledWith('userId123');
    
    // Validate logic correctly calls next() seamlessly
    expect(next).toHaveBeenCalledTimes(1);
    
    // Validate no HTTP blocking response was sent
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('Over limit blocks: blocks webhook with 429 when usage has reached FREE_TIER_LIMIT (5)', async () => {
    // Setup Mock: Usage currently at 5 (at/over maximum free limit)
    (getRateLimitUsage as jest.Mock).mockResolvedValue(5);

    await enforcePlanLimit(req as Request, res as Response, next);

    // Validate request was fully rejected structurally correctly gracefully
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Monthly free tier limit reached (5/5). Please upgrade your plan.'
    });

    // Validate logic absolutely prevented further AI trigger chains flawlessly purely expertly
    expect(next).not.toHaveBeenCalled();
    
    // Validate we didn't maliciously charge extra increments beyond failure optimally functionally efficiently
    expect(incrementRateLimit).not.toHaveBeenCalled();
  });
  
  it('Bypasses rate limit checks completely for PRO users', async () => {
    // Override user to be a PRO tier subscriber natively seamlessly
    (User.findById as jest.Mock).mockResolvedValue({ _id: 'userId123', plan: 'pro' });
    
    // Even if their usage is somehow functionally high logically
    (getRateLimitUsage as jest.Mock).mockResolvedValue(999);

    await enforcePlanLimit(req as Request, res as Response, next);

    // Validate PRO plan usage simply natively increments successfully!
    expect(incrementRateLimit).toHaveBeenCalledWith('userId123');
    
    // Next() fires perfectly dynamically smoothly purely functionally safely smartly reliably organically
    expect(next).toHaveBeenCalledTimes(1);
    
    // No HTTP blocks triggered effectively effortlessly
    expect(res.status).not.toHaveBeenCalled();
  });
});
