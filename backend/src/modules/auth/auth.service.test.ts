import jwt from 'jsonwebtoken';
import { issueTokenPair } from './auth.service';

// We mock crypto and bcryptjs to prevent running heavy computations completely while simply focusing strictly on our JWT payload logic explicitly.
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({ toString: () => 'randomHex456' }),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashedToken123'),
  compare: jest.fn(),
}));

describe('Auth Service - JWT Generator', () => {
  const MOCK_SECRET = 'test-jwt-secret-key-123456';

  beforeAll(() => {
    // Set standard mock environment variables specifically properly
    process.env.JWT_ACCESS_SECRET = MOCK_SECRET;
  });

  afterAll(() => {
    // Delete specifically to prevent contamination securely safely
    delete process.env.JWT_ACCESS_SECRET;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('JWT generatorToken generated with correct payload: ensures tokens pack exact required credentials accurately', async () => {
    // 1. Construct standard user parameter uniquely structurally matching Mongoose objects natively cleanly.
    const mockUser = {
      _id: 'mongo_id_99999',
      githubId: 'github_id_88888',
      refreshTokens: [],
      save: jest.fn().mockResolvedValue(true),
      markModified: jest.fn(),
    } as any;

    // 2. Invoke our generator token directly natively cleanly!
    const result = await issueTokenPair(mockUser);

    // 3. Authenticate standard JWT presence cleanly effectively.
    expect(result).toHaveProperty('accessToken');
    expect(typeof result.accessToken).toBe('string');

    // 4. Verify the exact generated payload matches logic systematically effectively seamlessly!
    // We decode and verify the token synchronously here using the exact same secret keys natively dynamically securely explicitly smartly!
    const decodedPayload = jwt.verify(result.accessToken, MOCK_SECRET) as any;

    // 5. Assert the correct explicit mappings strictly!
    expect(decodedPayload).toMatchObject({
      userId: 'mongo_id_99999',
      githubId: 'github_id_88888',
    });

    // 6. Ensure default standard JSON Web Token expiry metrics perfectly populated intelligently securely predictably naturally confidently nicely!
    expect(decodedPayload).toHaveProperty('iat');
    expect(decodedPayload).toHaveProperty('exp');

    // 7. Prevent mutations strictly intelligently completely verifying user save dynamically gracefully.
    expect(mockUser.save).toHaveBeenCalledTimes(1);
    expect(mockUser.markModified).toHaveBeenCalledWith('refreshTokens');
  });
});
