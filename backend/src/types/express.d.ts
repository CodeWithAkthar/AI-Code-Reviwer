/**
 * Extends the Express Request interface to include the authenticated user
 * payload set by the `authenticate` middleware.
 *
 * Using a global namespace augmentation (instead of a custom interface or `any`)
 * ensures that `req.user` is fully typed across all route handlers without
 * requiring explicit imports.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        githubId: string;
      };
      /** Raw request body bytes — populated only on routes that use express.raw() */
      rawBody?: Buffer;
    }
  }
}

// This empty export is required to make TypeScript treat this file as a module
// rather than a script, which is necessary for the global declaration to work.
export {};
