import request from 'supertest';
// Removed mongoose import because we will mock the model entirely

import app from '../../app';
import { User } from './auth.model';
import axios from 'axios';
import jwt from 'jsonwebtoken';

jest.mock('bullmq');
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock User model
jest.mock('./auth.model', () => ({
  User: {
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
    deleteMany: jest.fn(),
  }
}));

describe('Integration Test: Auth Flow (GitHub OAuth -> JWT issued -> DB storage)', () => {
  beforeAll(() => {
    // Set mandatory environment variables
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
    process.env.GITHUB_CALLBACK_URL = 'http://localhost/callback';
    process.env.JWT_ACCESS_SECRET = 'super-secret-jwt-key';
    process.env.FRONTEND_URL = 'http://localhost:5173';
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Should successfully execute the GitHub Auth flow, issue JWT, and store user correctly in DB', async () => {
    const mockCode = 'github-oauth-code-123';
    const mockGithubAccessToken = 'gho_mock_token_456';
    const mockGithubProfile = {
      id: 999999,
      login: 'testuser',
      email: 'testuser@example.com',
      avatar_url: 'https://avatars.githubusercontent.com/u/999999?v=4',
    };

    // 1. Mock the GitHub OAuth token exchange
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: mockGithubAccessToken },
    });

    // 2. Mock the GitHub user profile fetch
    mockedAxios.get.mockResolvedValueOnce({
      data: mockGithubProfile,
    });

    // Mock DB operations
    const mockUserDocument = {
      _id: 'mock-mongo-id-123',
      githubId: String(mockGithubProfile.id),
      username: mockGithubProfile.login,
      email: mockGithubProfile.email,
      avatarUrl: mockGithubProfile.avatar_url,
      githubAccessToken: mockGithubAccessToken,
      refreshTokens: [],
      save: jest.fn().mockResolvedValue(true),
      markModified: jest.fn(),
    };
    
    // Auth controller calls upsertUser which uses User.findOneAndUpdate
    (User.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(mockUserDocument);

    // 3. Initiate the callback simulation calling our endpoint
    const response = await request(app).get(`/api/auth/github/callback?code=${mockCode}`);

    // Since it's a redirect, we expect a 302 Found status
    expect(response.status).toBe(302);

    // The redirect URL contains the JWT as a hash fragment #token=...
    const redirectLocation = response.header.location;
    expect(redirectLocation).toBeDefined();
    expect(redirectLocation).toContain('http://localhost:5173/auth/callback#token=');

    // Extract the JWT to verify its contents
    const tokenFragment = redirectLocation.split('#token=')[1];
    expect(tokenFragment).toBeDefined();

    const decodedToken = jwt.verify(tokenFragment, process.env.JWT_ACCESS_SECRET as string) as any;
    expect(decodedToken.githubId).toBe(String(mockGithubProfile.id));

    // 4. Validate the user is stored correctly by verifying DB calls
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { githubId: String(mockGithubProfile.id) },
      {
        $set: {
          username: mockGithubProfile.login,
          email: mockGithubProfile.email,
          avatarUrl: mockGithubProfile.avatar_url,
          githubAccessToken: mockGithubAccessToken,
        },
      },
      expect.any(Object)
    );

    // Verify token generation modified the user record
    expect(mockUserDocument.refreshTokens.length).toBe(1);
    expect(mockUserDocument.markModified).toHaveBeenCalledWith('refreshTokens');
    expect(mockUserDocument.save).toHaveBeenCalled();
    
    const refreshTokenRecord = mockUserDocument.refreshTokens[0] as any;
    expect(refreshTokenRecord.tokenHash).toBeDefined();
    expect(refreshTokenRecord.expiresAt).toBeDefined();
    
    // Check httpOnly Cookie for refresh token is sent down to client
    const cookies = response.header['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/refreshToken=/);
    expect(cookies[0]).toMatch(/HttpOnly/i);
  });
});
