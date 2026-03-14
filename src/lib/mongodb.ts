import mongoose from 'mongoose';

/**
 * Establishes a connection to MongoDB using the MONGODB_URI environment variable.
 *
 * Exits the process with code 1 on failure — the application cannot operate
 * without a database connection, so a hard crash is preferable to serving
 * requests against a broken state.
 */
export async function connectDB(): Promise<void> {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }

    const conn = await mongoose.connect(uri);
    console.log(`[MongoDB] Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error);
    process.exit(1);
  }
}
