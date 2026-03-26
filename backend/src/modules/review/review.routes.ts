import express from 'express';
import { getUserReviews, getReviewDetail } from './review.controller';
import { authenticate } from '../../middleware/authenticate';

export const reviewRouter = express.Router();

// All review endpoints require authentication
reviewRouter.use(authenticate);

// GET /api/reviews
reviewRouter.get('/', getUserReviews);

// GET /api/reviews/:repoId/:prNumber
reviewRouter.get('/:repoId/:prNumber', getReviewDetail);
