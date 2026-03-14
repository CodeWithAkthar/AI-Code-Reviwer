// dotenv must be imported FIRST — before any other module — so that
// process.env is populated before any module reads from it at import time.
import 'dotenv/config';

import app from './app';
import { connectDB } from './lib/mongodb';

const PORT = parseInt(process.env.PORT ?? '5000', 10);

async function bootstrap(): Promise<void> {
  // Establish DB connection before accepting traffic.
  // connectDB() calls process.exit(1) on failure, so if we get past this
  // line the connection is guaranteed to be live.
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
    console.log(
      `[Server] GitHub OAuth callback: ${
        process.env.GITHUB_CALLBACK_URL ??
        `http://localhost:${PORT}/api/auth/github/callback`
      }`,
    );
  });
}

bootstrap();
