// jest.setup.ts
process.env.STRIPE_SECRET_KEY = 'test-stripe-secret';
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.GITHUB_CALLBACK_URL = 'http://localhost/callback';
process.env.JWT_ACCESS_SECRET = 'super-secret-jwt-key';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock IORedis to avoid keeping Jest hanging with open handles
jest.mock('ioredis', () => require('ioredis-mock'));
