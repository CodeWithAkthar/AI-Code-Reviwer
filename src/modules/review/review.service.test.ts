import dotenv from 'dotenv';
dotenv.config();

import { processReview } from './review.service';
import mongoose from 'mongoose';

const mockJob = {
  repoFullName: 'CodeWithAkthar/testing-backend',
  prNumber: 1,
  installationId: 118128171,
  deliveryId: 'test-delivery-123',
  sender: 'CodeWithAkthar',
};

async function runTest() {
  // Connect to MongoDB first
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-reviewer');
  console.log('✅ MongoDB connected');

  console.log('🧪 Running mock review job...');
  try {
    await processReview(mockJob);
    console.log('✅ processReview completed without throwing');
  } catch (err: any) {
    console.error('❌ processReview threw:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

runTest();
