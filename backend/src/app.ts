import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { Request, Response, NextFunction } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './lib/swagger';
import { authRouter } from './modules/auth/auth.routes';
import { webhookRouter } from './modules/webhook/webhook.routes';

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


/**
 * cookie-parser is required so that `req.cookies.refreshToken` is populated
 * in the auth controllers. Without it, `req.cookies` is always undefined.
 */
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * MIDDLEWARE ORDER — CRITICAL
 *
 * The webhook route MUST be mounted BEFORE `express.json()` is applied
 * globally. Here is why:
 *
 * `express.json()` is a destructive parser — it reads the raw bytes from the
 * request stream and replaces them with a parsed JS object. Once it runs,
 * the original byte stream is gone and cannot be recovered.
 *
 * The webhook handler needs the raw bytes to compute the HMAC-SHA256
 * signature. So the webhook route brings its own `express.raw()` parser
 * that captures the bytes as a Buffer without destroying them.
 *
 * If we mounted the webhook route AFTER `app.use(express.json())`, the
 * global parser would have already consumed and replaced the body before
 * the route-level `express.raw()` ever gets a chance to run. The HMAC
 * would always fail.
 *
 * Solution: mount `/webhooks` first (with its own raw parser), then add
 * the global `express.json()` for all remaining routes.
 */
app.use('/webhooks', webhookRouter);

/**
 * express.json() is intentionally placed HERE — after the webhook route.
 *
 * The webhook route uses express.raw() to keep req.body as a raw Buffer
 * for HMAC validation. If express.json() ran first (as global middleware),
 * it would parse and replace req.body with a JS object before the webhook
 * handler ever ran — destroying the Buffer and making HMAC impossible.
 *
 * Placing express.json() here means it only applies to routes mounted below
 * this point (/api/auth, /api/docs, /health) which all need parsed JSON.
 */
import { reviewRouter } from './modules/review/review.routes';

// ...
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/reviews', reviewRouter);

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
