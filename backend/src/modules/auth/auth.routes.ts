import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/authenticate';
import {
  getMe,
  handleGitHubCallback,
  logout,
  redirectToGitHub,
  refreshAccessToken,
} from './auth.controller';

/**
 * Rate limiter for the /refresh endpoint.
 *
 * /refresh is the most sensitive endpoint in the auth flow — an attacker with
 * a stolen refresh token could abuse it to generate unlimited access tokens.
 * We cap it at 10 requests per 15 minutes per IP to slow down brute-force
 * or automated reuse attempts while remaining invisible to legitimate users
 * (a human would never hit 10 refreshes in 15 minutes).
 */
const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: 'Too many token refresh attempts. Please try again later.',
  },
});

const router = Router();

// GET  /api/auth/github          — redirect to GitHub OAuth
router.get('/github', redirectToGitHub);

// GET  /api/auth/github/callback — GitHub posts back here after user grants permission
router.get('/github/callback', handleGitHubCallback);

// POST /api/auth/refresh         — rotate refresh token, issue new access token
router.post('/refresh', refreshRateLimiter, refreshAccessToken);

// POST /api/auth/logout          — revoke single-device refresh token
router.post('/logout', authenticate, logout);

// GET  /api/auth/me              — return authenticated user identity
router.get('/me', authenticate, getMe);

export { router as authRouter };
