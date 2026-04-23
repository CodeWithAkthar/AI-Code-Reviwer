import { Request, Response } from 'express';
import { User } from './auth.model';
import {
  exchangeCodeForGitHubToken,
  fetchGitHubUserProfile,
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  upsertUser,
} from './auth.service';

// ---------------------------------------------------------------------------
// Cookie configuration
// ---------------------------------------------------------------------------

/**
 * Cookie options for the httpOnly refresh token cookie.
 *
 * `secure: true` in production ensures the cookie is only sent over HTTPS.
 * `sameSite: 'lax'` protects against CSRF while still allowing the cookie to
 *   be sent on top-level navigations (e.g., the OAuth callback redirect).
 * `httpOnly: true` prevents JavaScript from reading the cookie, which is the
 *   primary defence against XSS-based token theft.
 */
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

const REFRESH_COOKIE_NAME = 'refreshToken';

// ---------------------------------------------------------------------------
// Controllers — no business logic, only orchestrate service calls
// ---------------------------------------------------------------------------

/**
 * Builds the GitHub OAuth authorization URL and redirects the user to it.
 *
 * Scopes:
 *  - `read:user`  — read the user's profile (name, avatar, etc.)
 *  - `user:email` — read the user's primary email address
 *  - `repo`       — required for reading private PR data
 */
export function redirectToGitHub(_req: Request, res: Response): void {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID ?? '',
    redirect_uri: process.env.GITHUB_CALLBACK_URL ?? '',
    scope: 'read:user user:email repo',
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

/**
 * Handles the GitHub OAuth callback after the user grants permission.
 *
 * Flow: code → GitHub access token → GitHub profile → upsert user → token pair
 *
 * The access token is delivered via URL fragment (#token=...) rather than a
 * query parameter (?token=...). Fragments are processed entirely by the browser
 * and are NEVER sent to the server or written to server access logs — this
 * prevents the token from leaking through proxy/CDN logs or Referer headers.
 */
export async function handleGitHubCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.query;

    if (typeof code !== 'string' || !code) {
      res.status(400).json({ error: 'Missing or invalid OAuth code in query string' });
      return;
    }

    const githubAccessToken = await exchangeCodeForGitHubToken(code);
    const profile = await fetchGitHubUserProfile(githubAccessToken);
    const user = await upsertUser(profile, githubAccessToken);
    const { accessToken, refreshToken } = await issueTokenPair(user);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    // Fragment (#) — never reaches the server, safe from logs and proxies.
    res.redirect(`${frontendUrl}/auth/callback#token=${accessToken}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub OAuth callback failed';
    res.status(500).json({ error: message });
  }
}

/**
 * Rotates the refresh token and issues a new access token.
 *
 * Reads the refresh token from the httpOnly cookie, delegates rotation to the
 * service (which handles reuse detection and hashing), then sets a fresh cookie
 * and returns the new access token in the JSON body so the client can update
 * its in-memory state.
 *
 * On any error (expired, reuse, invalid format), the cookie is cleared to
 * force re-authentication.
 */
export async function refreshAccessToken(req: Request, res: Response): Promise<void> {
  const incomingToken: string | undefined = req.cookies[REFRESH_COOKIE_NAME];

  if (!incomingToken) {
    res.status(401).json({ error: 'Refresh token cookie is missing' });
    return;
  }

  try {
    const { tokenPair } = await rotateRefreshToken(incomingToken);

    res.cookie(REFRESH_COOKIE_NAME, tokenPair.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.json({ accessToken: tokenPair.accessToken });
  } catch (error) {
    // Clear the cookie on any failure — the client must log in again.
    res.clearCookie(REFRESH_COOKIE_NAME);
    const message =
      error instanceof Error ? error.message : 'Failed to refresh access token';
    res.status(401).json({ error: message });
  }
}

/**
 * Logs out the current device by revoking the specific refresh token stored
 * in the cookie.
 *
 * Only the token tied to this device/session is removed; all other sessions
 * remain active. This requires `authenticate` middleware to have run first
 * (so `req.user.userId` is available).
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const incomingToken: string | undefined = req.cookies[REFRESH_COOKIE_NAME];
  const userId = req.user?.userId;

  if (incomingToken && userId) {
    await revokeRefreshToken(userId, incomingToken);
  }

  res.clearCookie(REFRESH_COOKIE_NAME);
  res.json({ message: 'Logged out successfully' });
}

/**
 * Returns the authenticated user's full profile from the database.
 *
 * The JWT payload only contains `userId` and `githubId` (kept small for
 * security). This endpoint fetches the full document so the client gets
 * `username`, `avatarUrl`, `email`, and `plan` as well.
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const user = await User.findById(req.user?.userId).select(
      'githubId username email avatarUrl plan',
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        userId: String(user._id),
        githubId: user.githubId,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        plan: user.plan,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user';
    res.status(500).json({ error: message });
  }
}
