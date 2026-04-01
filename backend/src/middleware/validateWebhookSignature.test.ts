import { validateSignature } from './validateWebhookSignature';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

describe('validateSignature Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock<NextFunction>;

  const validSecret = 'my-super-secret';
  const payload = Buffer.from(JSON.stringify({ event: 'push', repo: 'test' }));

  beforeEach(() => {
    // Set up environment variable before each test
    process.env.GITHUB_WEBHOOK_SECRET = validSecret;

    // Mock the Express response object with chainable methods
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    // Mock the Express next function
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper function to generate a valid signature for testing
  const generateValidSignature = (bodyPayload: Buffer, secret: string) => {
    const hmac = crypto.createHmac('sha256', secret);
    return `sha256=${hmac.update(bodyPayload).digest('hex')}`;
  };

  it('should call next() for a valid signature', () => {
    const validSignature = generateValidSignature(payload, validSecret);

    mockReq = {
      headers: {
        'x-hub-signature-256': validSignature
      },
      rawBody: payload
      // Type assertion added because rawBody is a custom property attached before validation
    } as any;

    validateSignature(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
  });

  it('should return 401 when testing a fake signature', () => {
    mockReq = {
      headers: {
        'x-hub-signature-256': 'sha256=a1b2c3d4e5invalidfakehashthatislongenough1234567890abcde'
      },
      rawBody: payload
    } as any;

    validateSignature(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid webhook signature' });
  });

  it('should return 401 for an empty/missing signature', () => {
    mockReq = {
      headers: {},
      rawBody: payload
    } as any;

    validateSignature(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'No signature found on request' });
  });

  it('should return 500 if GITHUB_WEBHOOK_SECRET is not set in the environment variables', () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;

    const validSignature = generateValidSignature(payload, validSecret);
    mockReq = {
      headers: {
        'x-hub-signature-256': validSignature
      },
      rawBody: payload
    } as any;

    validateSignature(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Server configuration error: Webhook secret missing' });
  });

  it('should return 400 if req.rawBody is missing from the request', () => {
    const validSignature = generateValidSignature(payload, validSecret);
    mockReq = {
      headers: {
        'x-hub-signature-256': validSignature
      }
      // Assuming body parser didn't attach `rawBody`
    } as any;

    validateSignature(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Raw body required for signature validation' });
  });
});
