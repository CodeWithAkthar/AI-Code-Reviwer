import express from 'express';
import { getUsage, getRepos, toggleRepo } from './user.controller';
import { authenticate } from '../../middleware/authenticate';

export const userRouter = express.Router();

userRouter.use(authenticate);

userRouter.get('/usage', getUsage);
userRouter.get('/repos', getRepos);
userRouter.patch('/repos/:repoId', toggleRepo);
