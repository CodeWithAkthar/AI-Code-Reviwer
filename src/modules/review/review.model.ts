import mongoose, { Document, Schema } from 'mongoose';

export interface IReviewComment {
  filename: string;
  line: number;
  severity: 'critical' | 'warning' | 'info';
  category: 'security' | 'bug' | 'performance' | 'style' | 'logic';
  issue: string;
  suggestion: string;
}

export interface IReview {
  _id: mongoose.Types.ObjectId;
  repoId?: mongoose.Types.ObjectId; // Optional ref if we have a Repo model later
  prNumber: number;
  owner: string;
  repo: string;
  summary: string;
  score: number;
  comments: IReviewComment[];
  status: 'pending' | 'completed' | 'failed';
  model: string;
  tokensUsed: number;
  error?: string; // To capture failure messages
  createdAt: Date;
  updatedAt: Date;
}

const reviewCommentSchema = new Schema<IReviewComment>(
  {
    filename: { type: String, required: true },
    line: { type: Number, required: true },
    severity: { type: String, enum: ['critical', 'warning', 'info'], required: true },
    category: { type: String, enum: ['security', 'bug', 'performance', 'style', 'logic'], required: true },
    issue: { type: String, required: true },
    suggestion: { type: String, required: true },
  },
  { _id: false }
);

const reviewSchema = new Schema<IReview>(
  {
    repoId: { type: Schema.Types.ObjectId, ref: 'Repo' },
    prNumber: { type: Number, required: true },
    owner: { type: String, required: true },
    repo: { type: String, required: true },
    summary: { type: String, default: '' },
    score: { type: Number, default: 0 },
    comments: [reviewCommentSchema],
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    model: { type: String, required: true },
    tokensUsed: { type: Number, default: 0 },
    error: { type: String },
  },
  { timestamps: true }
);

export const Review = mongoose.model<IReview>('Review', reviewSchema);
