import mongoose, { Document, Schema } from 'mongoose';

export interface IRepository extends Document {
  githubRepoId: string;
  fullName: string;
  owner?: mongoose.Types.ObjectId;      // our MongoDB user (may be null if not matched)
  installedBy?: string;                  // GitHub numeric user ID (from installation event)
  installationId?: number;              // GitHub App installation ID
  isActive: boolean;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const RepositorySchema = new Schema<IRepository>(
  {
    githubRepoId: {
      type: String,
      required: true,
      unique: true, // single index — do NOT also call RepositorySchema.index() on this
    },
    fullName: {
      type: String,
      required: true,
      index: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Optional — linked when we can match to a DB user
      index: true,
    },
    installedBy: {
      type: String,   // GitHub numeric user ID as string
      index: true,
    },
    installationId: {
      type: Number,
      required: false, // Optional — provided in full installation events
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
  },
  { 
    timestamps: true,
    strict: true
  }
);

// githubRepoId uniqueness is already enforced in the field definition above.
// No extra RepositorySchema.index() call needed — that was creating the duplicate.

export const Repository = mongoose.model<IRepository>('Repository', RepositorySchema);
