import mongoose, { Document, Schema } from 'mongoose';

// ---------------------------------------------------------------------------
// Subdocument Schema (Embedded)
// ---------------------------------------------------------------------------
// We use a subdocument array instead of a separate referenced collection for
// Comments because they inherently belong to a Review. We will never query
// a Comment independently of its parent Review. Embedding them provides O(1)
// fetch performance when reading the Review, avoiding costly $lookup joins.

export interface IComment {
  filename: string;
  line: number;
  severity: 'info' | 'warning' | 'critical';
  category: string;
  issue: string;
  suggestion: string;
}

const CommentSchema = new Schema<IComment>({
  filename: { type: String, required: true },
  line: { type: Number, required: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], required: true },
  category: { type: String, required: true },
  issue: { type: String, required: true },
  suggestion: { type: String, required: true },
});

// ---------------------------------------------------------------------------
// Main Document Schema
// ---------------------------------------------------------------------------

export interface IReview extends Document {
  prNumber: number;
  prTitle: string;
  prUrl: string;
  repo: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  summary: string;
  score: number;
  modelUsed: string;
  tokensUsed: number;
  comments: IComment[];
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    prNumber: { type: Number, required: true },
    prTitle: { type: String, default: '' },
    prUrl: { type: String, default: '' },
    
    // Referenced fields - points to User and Repository collections
    repo: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },

    summary: { type: String, default: '' },
    score: { type: Number, default: 0 },
    modelUsed: { type: String, default: '' },
    tokensUsed: { type: Number, default: 0 },

    // The embedded array of comments
    comments: { type: [CommentSchema], default: [] },
  },
  { 
    timestamps: true,
    strict: true 
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// 1. A single PR can only have one active review process per repository.
// This compound unique index guarantees we don't duplicate a Review for the same PR.
ReviewSchema.index({ repo: 1, prNumber: 1 }, { unique: true });

// 2. Querying recent reviews for a user's dashboard will heavily filter by User
// and sort by creation date. This compound index optimizes that exact query.
ReviewSchema.index({ user: 1, createdAt: -1 });

// Export the Model
export const Review = mongoose.model<IReview>('Review', ReviewSchema);
