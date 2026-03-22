import axios from 'axios';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { IUser, User } from './auth.model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a GitHub user profile returned by GET /user */
export interface GitHubUserProfile {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
}

/** An issued access + refresh token pair */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** The payload embedded in our JWT access tokens */
export interface JWTPayload {
  userId: string;
  githubId: string;
  iat?: number;
  exp?: number;
}

// ---------------------------------------------------------------------------
// Helpers — environment variable access is centralised here, not scattered
// ---------------------------------------------------------------------------

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable "${key}" is not set`);
  }
  return value;
}

const BCRYPT_ROUNDS = 10;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// NOTE: JWT_REFRESH_SECRET is intentionally not used here.
// Our refresh tokens are opaque random strings (not JWTs) — they do not
// need to be signed. They are validated by bcrypt hash comparison against
// the stored hash in MongoDB. Remove JWT_REFRESH_SECRET from .env if
// it is not used elsewhere in the project.

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Trades a GitHub OAuth authorization code for a GitHub access token.
 *
 * Security note: we NEVER log the returned token. The raw value is only held
 * in memory long enough to be passed to `fetchGitHubUserProfile`.
 *
 * @param code - The one-time OAuth code received from GitHub's callback.
 * @returns The GitHub access token string.
 * @throws If GitHub does not return an access_token (e.g., code already used).
 */
export async function exchangeCodeForGitHubToken(code: string): Promise<string> {
  const response = await axios.post<{ access_token?: string; error?: string }>(
    'https://github.com/login/oauth/access_token',
    {
      client_id: getRequiredEnv('GITHUB_CLIENT_ID'),
      client_secret: getRequiredEnv('GITHUB_CLIENT_SECRET'),
      code,
    },
    {
      headers: { Accept: 'application/json' },
    },
  );

  const { access_token, error } = response.data;

  if (!access_token) {
    throw new Error(
      `GitHub OAuth token exchange failed: ${error ?? 'no access_token in response'}`,
    );
  }

  return access_token;
}

/**
 * Fetches the authenticated user's public profile from the GitHub API.
 *
 * @param accessToken - A valid GitHub OAuth access token.
 * @returns The user's GitHub profile.
 * @throws On network failure or if GitHub rejects the token.
 */
export async function fetchGitHubUserProfile(
  accessToken: string,
): Promise<GitHubUserProfile> {
  const response = await axios.get<GitHubUserProfile>('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  return response.data;
}

/**
 * Creates or updates the User document for a GitHub login.
 *
 * We upsert rather than insert so that re-authentication (e.g., after token
 * expiry or permission change) updates the stored GitHub token rather than
 * creating a duplicate account.
 *
 * @param profile - The GitHub user profile.
 * @param githubAccessToken - The fresh GitHub access token to persist.
 * @returns The full User document after upsert.
 */
export async function upsertUser(
  profile: GitHubUserProfile,
  githubAccessToken: string,
): Promise<IUser> {
  const user = await User.findOneAndUpdate(
    { githubId: String(profile.id) },
    {
      $set: {
        username: profile.login,
        // GitHub allows email to be null (private account). Fall back to a
        // placeholder so the required field constraint is satisfied.
        email: profile.email ?? `${profile.login}@users.noreply.github.com`,
        avatarUrl: profile.avatar_url,
        githubAccessToken, // always refresh — token can change on re-auth
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
    },
  );

  // findOneAndUpdate with upsert + new:true always returns a document.
  // The non-null assertion is safe but we add a guard for clarity.
  if (!user) {
    throw new Error('upsertUser: failed to create or retrieve user document');
  }

  return user;
}

/**
 * Issues a new JWT access token and an opaque refresh token for a user.
 *
 * Refresh token format: `{userId}.{64 random hex bytes}`
 *
 * The userId prefix is intentional and critical — it allows `rotateRefreshToken`
 * to extract the user's ObjectId and call `findById` directly, avoiding a full
 * collection scan to find which user owns a given token.
 *
 * The token is hashed with bcrypt before being stored so that a database
 * breach cannot be used to fabricate valid refresh tokens.
 *
 * Expired tokens are pruned from the array on every issuance to keep the
 * document size bounded.
 *
 * @param user - The user document to issue tokens for.
 * @returns An object containing the plaintext accessToken and refreshToken.
 */
export async function issueTokenPair(user: IUser): Promise<TokenPair> {
  const accessSecret = getRequiredEnv('JWT_ACCESS_SECRET');

  // --- Access token (short-lived JWT) ---
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    userId: String(user._id),
    githubId: user.githubId,
  };

  const accessToken = jwt.sign(payload, accessSecret, { expiresIn: '15m' });

  // --- Refresh token (opaque, long-lived) ---
  const rawRandom = crypto.randomBytes(64).toString('hex');
  const refreshToken = `${String(user._id)}.${rawRandom}`;
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const tokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);

  // Prune tokens that have already expired before adding the new one.
  // This keeps the refreshTokens array from growing indefinitely.
  const now = new Date();
  user.refreshTokens = user.refreshTokens.filter((t) => t.expiresAt > now);

  user.refreshTokens.push({ tokenHash, createdAt: new Date(), expiresAt });

  // Bug fix: Mongoose does not reliably detect direct array mutation/reassignment.
  // markModified ensures the array is included in the next save() diff.
  user.markModified('refreshTokens');
  await user.save();

  return { accessToken, refreshToken };
}

/**
 * Validates an incoming refresh token and issues a new token pair (rotation).
 *
 * Token rotation means the old refresh token is immediately invalidated when
 * used — each token can only be consumed once. This limits the window of
 * exposure if a token is stolen.
 *
 * Reuse detection: if the incoming token doesn't match any stored hash, it
 * means either the token has already been rotated (possible theft of the old
 * token) or the token is completely fabricated. In either case we treat it as
 * a compromise and immediately revoke ALL sessions for that user (nuclear
 * option) to force a full re-login.
 *
 * @param incomingToken - The raw refresh token from the client cookie.
 * @returns The new token pair and the updated user document.
 * @throws 'Refresh token reuse detected — all sessions terminated' on reuse.
 * @throws 'Invalid refresh token format' if the prefix is malformed.
 * @throws 'User not found' if the userId prefix is invalid.
 */
export async function rotateRefreshToken(
  incomingToken: string,
): Promise<{ tokenPair: TokenPair; user: IUser }> {
  // Bug fix: validate input before any processing.
  // 200 chars is a safe upper bound: ObjectId(24) + dot(1) + hex64(128) = 153.
  // Blocking oversized strings prevents a bcrypt DoS (hashing a 1MB string is slow).
  if (
    !incomingToken ||
    typeof incomingToken !== 'string' ||
    incomingToken.length > 200
  ) {
    throw new Error('Invalid refresh token format');
  }

  // Extract userId from the `{userId}.{hex}` format.
  // We split on the FIRST dot only — the hex portion may theoretically
  // contain dots in future formats, but currently it's hex so it won't.
  const dotIndex = incomingToken.indexOf('.');
  if (dotIndex === -1) {
    throw new Error('Invalid refresh token format');
  }

  const userId = incomingToken.substring(0, dotIndex);

  // Targeted O(1) lookup — no collection scan needed because the userId is
  // embedded in the token format itself.
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const now = new Date();
  let matchIndex = -1;

  // Loop through all non-expired tokens and bcrypt.compare each hash.
  for (let i = 0; i < user.refreshTokens.length; i++) {
    const entry = user.refreshTokens[i];
    if (entry.expiresAt <= now) continue; // skip expired
    const isMatch = await bcrypt.compare(incomingToken, entry.tokenHash);
    if (isMatch) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex === -1) {
    // No matching hash found — this is a REUSE ATTACK or a tampered token.
    // Immediately invalidate ALL sessions for this user (nuclear option).
    // The user will need to log in again via GitHub OAuth.
    user.refreshTokens = [];
    user.markModified('refreshTokens'); // Bug fix: array reassignment not auto-detected
    await user.save();
    throw new Error('Refresh token reuse detected — all sessions terminated');
  }

  // Splice out the matched token — it is now dead (single-use rotation).
  user.refreshTokens.splice(matchIndex, 1);

  // Bug fix: persist the splice BEFORE calling issueTokenPair.
  // issueTokenPair runs its own `user.refreshTokens = filter(...)` which would
  // overwrite the in-memory splice, letting the consumed token survive in MongoDB.
  // Saving here guarantees the removal lands in the DB first.
  user.markModified('refreshTokens');
  await user.save();

  // Issue a fresh token pair (which also saves the user document).
  const tokenPair = await issueTokenPair(user);

  return { tokenPair, user };
}

/**
 * Revokes a single refresh token for a user (per-device logout).
 *
 * Only the token that matches the incoming hash is removed, leaving all
 * other sessions intact. This is the correct behaviour for "logout this device".
 *
 * @param userId - The user's MongoDB ObjectId as a string.
 * @param incomingToken - The raw refresh token from the client cookie.
 */
export async function revokeRefreshToken(
  userId: string,
  incomingToken: string,
): Promise<void> {
  const user = await User.findById(userId);
  if (!user) {
    // Silently return — the token is effectively revoked if the user doesn't exist.
    return;
  }

  let matchIndex = -1;
  const now = new Date();
  for (let i = 0; i < user.refreshTokens.length; i++) {
    // Bug fix: skip expired tokens — bcrypt.compare takes ~100ms per call;
    // running it on expired entries wastes time and slows down logout.
    if (user.refreshTokens[i].expiresAt <= now) continue;
    const isMatch = await bcrypt.compare(incomingToken, user.refreshTokens[i].tokenHash);
    if (isMatch) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex !== -1) {
    user.refreshTokens.splice(matchIndex, 1);
    user.markModified('refreshTokens'); // Bug fix: splice not auto-detected by Mongoose
    await user.save();
  }
  // If no match found, the token was already revoked or never valid — no-op.
}

/**
 * Verifies a JWT access token and returns the typed payload.
 *
 * @param token - The raw JWT string from the Authorization header.
 * @returns The decoded and verified payload.
 * @throws If the token is expired, malformed, or signed with the wrong secret.
 */
export function verifyAccessToken(token: string): JWTPayload {
  const accessSecret = getRequiredEnv('JWT_ACCESS_SECRET');
  const payload = jwt.verify(token, accessSecret) as JWTPayload;
  return payload;
}
