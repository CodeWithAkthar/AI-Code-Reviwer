import mongoose, { Document, Schema } from 'mongoose';

export interface IRepository extends Document {
  githubRepoId: string;
  fullName: string;
  owner: mongoose.Types.ObjectId;
  installationId: number;
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
      unique: true, // We only want one document per physical GitHub repository
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      index: true, // Useful for lookups by "owner/repo" string
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // Useful to find all repos owned by a specific user
    },
    installationId: {
      type: Number,
      required: true,
      index: true, // Useful for correlating webhook events back to this repo
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
    strict: true // Ensure only fields defined in the schema are saved
  }
);

// We explicitly index githubRepoId as unique to prevent duplicate registrations
RepositorySchema.index({ githubRepoId: 1 }, { unique: true });

export const Repository = mongoose.model<IRepository>('Repository', RepositorySchema);
