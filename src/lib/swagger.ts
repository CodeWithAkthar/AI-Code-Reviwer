import swaggerJsdoc from 'swagger-jsdoc';

/**
 * OpenAPI 3.0 specification for the AI Review Auth API.
 * Served at /api/docs by swagger-ui-express.
 */
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AI Review — Auth API',
      version: '1.0.0',
      description:
        'Authentication module for the AI-powered GitHub PR Review SaaS. ' +
        'Implements GitHub OAuth 2.0, JWT access tokens (15 min), and ' +
        'opaque refresh tokens (7 days) with rotation and reuse detection.',
      contact: {
        name: 'AI Review API',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Local development server',
      },
    ],
    tags: [
      {
        name: 'Auth',
        description: 'GitHub OAuth + token management',
      },
      {
        name: 'Health',
        description: 'Server health check',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'JWT access token. Obtained from the GitHub OAuth callback URL fragment (#token=...). ' +
            'Expires in 15 minutes — use POST /api/auth/refresh to rotate.',
        },
      },
      schemas: {
        UserIdentity: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              example: '65f1a2b3c4d5e6f7a8b9c0d1',
              description: 'MongoDB ObjectId of the user',
            },
            githubId: {
              type: 'string',
              example: '12345678',
              description: 'GitHub numeric user ID',
            },
          },
          required: ['userId', 'githubId'],
        },
        AccessTokenResponse: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              description: 'JWT access token valid for 15 minutes',
            },
          },
          required: ['accessToken'],
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              example: 'Access token is invalid or expired. Please refresh your session.',
            },
          },
          required: ['error'],
        },
        SuccessMessage: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Logged out successfully',
            },
          },
          required: ['message'],
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'ok',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2026-03-14T12:00:00.000Z',
            },
          },
          required: ['status', 'timestamp'],
        },
      },
      // Refresh token is stored in an httpOnly cookie — not representable
      // as a security scheme, documented inline per endpoint instead.
    },
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Server health check',
          description: 'Returns server status and current timestamp. No authentication required. Used by load balancers and uptime monitors.',
          operationId: 'getHealth',
          responses: {
            '200': {
              description: 'Server is running',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
          },
        },
      },
      '/api/auth/github': {
        get: {
          tags: ['Auth'],
          summary: 'Redirect to GitHub OAuth',
          description:
            'Builds the GitHub OAuth authorization URL and redirects the browser to it. ' +
            'The user will be asked to grant `read:user`, `user:email`, and `repo` permissions. ' +
            '\n\n**Note:** Open this URL in a browser — Postman/curl will follow the redirect but cannot complete the OAuth flow.',
          operationId: 'redirectToGitHub',
          responses: {
            '302': {
              description: 'Redirect to GitHub OAuth authorization page',
              headers: {
                Location: {
                  schema: { type: 'string' },
                  example: 'https://github.com/login/oauth/authorize?client_id=...&scope=read:user+user:email+repo',
                },
              },
            },
          },
        },
      },
      '/api/auth/github/callback': {
        get: {
          tags: ['Auth'],
          summary: 'GitHub OAuth callback',
          description:
            'GitHub redirects here after the user grants permission. ' +
            'The server exchanges the one-time `code` for a GitHub access token, ' +
            'fetches the user profile, upserts the user in MongoDB, and issues a token pair.\n\n' +
            '**On success:**\n' +
            '- Sets an `httpOnly` `refreshToken` cookie (7 days)\n' +
            '- Redirects to `{FRONTEND_URL}/auth/callback#token={accessToken}`\n' +
            '- The access token is in the URL **fragment** (`#`), not a query param — fragments are never sent to servers or logged\n\n' +
            '**To test manually:** Start the OAuth flow via `GET /api/auth/github` in a browser, ' +
            'copy the `code` from the redirect URL, and pass it here.',
          operationId: 'handleGitHubCallback',
          parameters: [
            {
              name: 'code',
              in: 'query',
              required: true,
              description: 'One-time OAuth authorization code from GitHub',
              schema: { type: 'string', example: 'abc123def456' },
            },
          ],
          responses: {
            '302': {
              description:
                'Login successful — redirects to frontend with access token in URL fragment',
              headers: {
                Location: {
                  schema: { type: 'string' },
                  example: 'http://localhost:5173/auth/callback#token=eyJhbGci...',
                },
                'Set-Cookie': {
                  schema: { type: 'string' },
                  example: 'refreshToken=abc.xyz; HttpOnly; SameSite=Lax; Max-Age=604800',
                },
              },
            },
            '400': {
              description: 'Missing or invalid OAuth code',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  example: { error: 'Missing or invalid OAuth code in query string' },
                },
              },
            },
            '500': {
              description: 'GitHub token exchange or profile fetch failed',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  example: { error: 'GitHub OAuth token exchange failed: bad_verification_code' },
                },
              },
            },
          },
        },
      },
      '/api/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Rotate refresh token / issue new access token',
          description:
            'Reads the `refreshToken` httpOnly cookie, validates it, removes it (single-use rotation), ' +
            'and issues a new token pair.\n\n' +
            '**Security:**\n' +
            '- Rate limited: **10 requests per 15 minutes per IP**\n' +
            '- If an already-used refresh token is presented (reuse attack), **all sessions are immediately terminated**\n' +
            '- On any error the `refreshToken` cookie is cleared — the user must log in again via GitHub OAuth\n\n' +
            '**Cookie:** The `refreshToken` cookie must be present. Postman sends it automatically from the cookie jar.',
          operationId: 'refreshAccessToken',
          parameters: [
            {
              name: 'refreshToken',
              in: 'cookie',
              required: true,
              description: 'httpOnly refresh token cookie set by the callback endpoint',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'New access token issued, new refresh token set in cookie',
              headers: {
                'Set-Cookie': {
                  schema: { type: 'string' },
                  example: 'refreshToken=newtoken.xyz; HttpOnly; SameSite=Lax; Max-Age=604800',
                },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AccessTokenResponse' },
                },
              },
            },
            '401': {
              description: 'Refresh token missing, expired, or reuse detected',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  examples: {
                    missing: { value: { error: 'Refresh token cookie is missing' } },
                    reuse: { value: { error: 'Refresh token reuse detected — all sessions terminated' } },
                    invalid: { value: { error: 'Invalid refresh token format' } },
                  },
                },
              },
            },
            '429': {
              description: 'Rate limit exceeded (10 req / 15 min per IP)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  example: { error: 'Too many token refresh attempts. Please try again later.' },
                },
              },
            },
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout (single-device)',
          description:
            'Revokes the refresh token stored in the cookie for this device only. ' +
            'All other active sessions remain valid.\n\n' +
            'Requires a valid JWT access token in the `Authorization` header ' +
            'so the server knows which user is logging out.',
          operationId: 'logout',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'refreshToken',
              in: 'cookie',
              required: false,
              description: 'httpOnly refresh token cookie to revoke',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Logged out — refresh token cookie cleared',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessMessage' },
                },
              },
            },
            '401': {
              description: 'Access token missing or expired',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  example: {
                    error: 'Authorization header missing or malformed. Expected: Bearer <token>',
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get authenticated user identity',
          description:
            'Returns the `userId` and `githubId` extracted from the verified JWT access token. ' +
            'No database call is made — the payload is read directly from the token.',
          operationId: 'getMe',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Authenticated user identity',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/UserIdentity' },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Access token missing or expired',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  examples: {
                    missing: {
                      value: {
                        error: 'Authorization header missing or malformed. Expected: Bearer <token>',
                      },
                    },
                    expired: {
                      value: {
                        error: 'Access token is invalid or expired. Please refresh your session.',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [], // spec is defined inline above, not via JSDoc comments
};

export const swaggerSpec = swaggerJsdoc(options);
