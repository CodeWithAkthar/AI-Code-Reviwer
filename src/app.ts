import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { Request, Response, NextFunction } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './lib/swagger';
import { authRouter } from './modules/auth/auth.routes';

const app = express();

// ---------------------------------------------------------------------------
// Core middleware
// ---------------------------------------------------------------------------

/**
 * CORS — only the configured frontend origin may make credentialed requests.
 * `credentials: true` is required for the browser to include the httpOnly
 * refresh-token cookie on cross-origin requests (e.g., localhost:5173 → :5000).
 */
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  }),
);

app.use(express.json());

/**
 * cookie-parser is required so that `req.cookies.refreshToken` is populated
 * in the auth controllers. Without it, `req.cookies` is always undefined.
 */
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/auth', authRouter);

/** Swagger UI — interactive API documentation */
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'AI Review — Auth API',
  swaggerOptions: {
    persistAuthorization: true, // keeps the Bearer token across page refreshes
  },
}));

/** Serve the raw OpenAPI JSON spec (useful for code generators / Postman import) */
app.get('/api/docs.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(swaggerSpec);
});

/** Simple health check — used by load balancers and uptime monitors. */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Central error handler
// ---------------------------------------------------------------------------

/**
 * Catch-all error handler.
 *
 * Any error thrown in a route handler (or passed via `next(error)`) lands here.
 * We always return a consistent JSON shape so API clients can rely on parsing
 * `{ error: string }` regardless of which route threw.
 *
 * The 4-argument signature is required by Express to recognise this as an
 * error-handling middleware. The `_next` parameter must be present even though
 * it is never called.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err.message);
  const status = (err as Error & { status?: number }).status ?? 500;
  res.status(status).json({ error: err.message ?? 'Internal server error' });
});

export default app;
