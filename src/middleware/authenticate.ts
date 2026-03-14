import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../modules/auth/auth.service';

/**
 * Express middleware that authenticates requests using a JWT access token.
 *
 * The token must be provided in the `Authorization` header as a Bearer token:
 *   Authorization: Bearer <token>
 *
 * On success, the verified payload is attached to `req.user` so that
 * downstream route handlers can access `userId` and `githubId` without
 * re-verifying the token.
 *
 * On failure, a 401 response is returned immediately with a descriptive
 * message — we intentionally distinguish between "missing" and "invalid"
 * to help legitimate clients debug integration issues.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;


  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authorization header missing or malformed. Expected: Bearer <token>',
    });
    return;
  }

  const token = authHeader.substring(7); // strip "Bearer " prefix

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.userId,
      githubId: payload.githubId,
    };
    next();
  } catch {
    res.status(401).json({
      error: 'Access token is invalid or expired. Please refresh your session.',
    });
  }
}
