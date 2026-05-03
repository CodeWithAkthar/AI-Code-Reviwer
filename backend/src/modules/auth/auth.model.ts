import mongoose, { Document, Schema } from 'mongoose';

/**
 * Represents a single hashed refresh token entry stored on the user document.
 * Only the bcrypt hash is persisted — the raw token is never stored.
 */
export interface IRefreshTokenEntry {
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * The full User document interface.
 * `githubAccessToken` is stored in plaintext because it is actively used
 * to call the GitHub API on behalf of the user (e.g., fetching PR data).
 */
export interface IUser extends Document {
  githubId: string;
  username: string;
  email: string;
  avatarUrl: string;
  githubAccessToken: string;
  refreshTokens: IRefreshTokenEntry[];
  plan: 'free' | 'pro' | 'enterprise';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;  // active Stripe Subscription ID (null on free)
  planExpiresAt?: Date;           // when the current billing period ends
  connectedRepos: mongoose.Types.ObjectId[];
  prReviewsThisMonth: number;
  planResetDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RefreshTokenEntrySchema = new Schema<IRefreshTokenEntry>(
  {
    tokenHash: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }, // subdocuments don't need their own _id
);

const UserSchema = new Schema<IUser>(
  {
    githubId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: { type: String, required: true },
    email: { type: String, required: true },
    avatarUrl: { type: String, default: '' },
    /**
     * The raw GitHub OAuth access token.
     * Stored in plaintext intentionally — it is needed to make authenticated
     * GitHub API calls (fetch PRs, post review comments, etc.).
     * This is updated on every login in case the user re-authorizes.
     */
    githubAccessToken: { type: String, required: true },
    refreshTokens: { type: [RefreshTokenEntrySchema], default: [] },
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'] as const,
      default: 'free',
    },
    // Stripe billing fields
    stripeCustomerId: { type: String, default: null },
    // The ID of the active Stripe Subscription object. Null for free users.
    stripeSubscriptionId: { type: String, default: null },
    // Exact timestamp when the current paid billing period ends.
    // We use this so users keep Pro access for the rest of the period they paid for,
    // even if they cancel mid-month — a practice called "access until period end".
    planExpiresAt: { type: Date, default: null },
    // Tracks repositories the user has installed the GitHub App on
    connectedRepos: [{ type: Schema.Types.ObjectId, ref: 'Repository' }],
    prReviewsThisMonth: { type: Number, default: 0 },
    planResetDate: {
      type: Date,
      default: () => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d;
      },
    },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>('User', UserSchema);
