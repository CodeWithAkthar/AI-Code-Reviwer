/**
 * server.ts — Entry point. Bootstraps Express + WebSocket on a single HTTP server.
 *
 * WHY ONE HTTP SERVER FOR BOTH EXPRESS AND WEBSOCKET?
 * -------------------------------------------------------------------
 * The `ws` library attaches to an existing Node.js `http.Server`. When a browser
 * sends a WebSocket upgrade request (HTTP GET with `Upgrade: websocket` header),
 * the HTTP server intercepts it before Express sees it and hands it to the WS server.
 * Normal HTTP requests flow through to Express as usual.
 *
 * Benefits:
 *  1. One port — no CORS/firewall/proxy issues (frontend talks to same origin)
 *  2. No extra cost of running a second server process
 *  3. Reverse proxies (Nginx, Render, Railway) route both HTTP and WS on port 443 automatically
 */

// dotenv must be imported FIRST — before any other module — so that
// process.env is populated before any module reads from it at import time.
import 'dotenv/config';

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';

import app from './app';
import { connectDB } from './lib/mongodb';
import * as wsManager from './lib/wsManager';

const PORT = parseInt(process.env.PORT ?? '5000', 10);

// ─── Step 3: Create a plain Node.js HTTP server that wraps Express ────────────
// Express `app` is just a request handler function. Wrapping it lets us access
// the underlying `http.Server` instance so the WS server can attach to it.
const httpServer = http.createServer(app);

// ─── WebSocket Server (Step 3 continued) ─────────────────────────────────────
// We pass `{ server: httpServer }` — this makes `ws` listen for 'upgrade'
// events on the HTTP server instead of opening its own port.
// Path `/ws` is checked so normal HTTP upgrades (e.g. hot-reload) aren't confused.
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// ─── Step 4: JWT Auth Handshake on WebSocket Connect ─────────────────────────
//
// WHY AUTHENTICATE THE WEBSOCKET?
// Unlike HTTP requests which carry tokens per-request (stateless), a WebSocket
// is a persistent connection. If we skip auth, ANYONE who can open a WS connection
// (including from browser DevTools or curl/wscat) can receive another user's
// PR review events. This is a critical data-leak vulnerability.
//
// Browser WebSocket API does not support custom headers on connect — only cookies
// or URL query params work. We avoid URL query params (token leaks into logs/proxies).
// Instead we use the "first message" auth pattern:
//   1. Socket connects.
//   2. Server starts a 5-second countdown — no event before auth = close.
//   3. Client sends { type: "auth", token: "<JWT>" } as the FIRST message.
//   4. Server verifies JWT → registers socket with userId → connection is live.

wss.on('connection', (socket: WebSocket) => {
  let userId: string | null = null;
  let authenticated = false;

  // Kill unauthenticated sockets after 5 seconds.
  // Prevents open connections sitting idle consuming server memory.
  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      console.warn('[WS] Auth timeout — closing unauthenticated socket');
      socket.close(1008, 'Auth timeout'); // 1008 = Policy Violation
    }
  }, 5000);

  socket.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      // ── Auth handshake ────────────────────────────────────────────────────
      if (!authenticated && message.type === 'auth') {
        const token = message.token as string;
        const secret = process.env.JWT_ACCESS_SECRET;

        if (!secret) {
          socket.close(1011, 'Server misconfiguration');
          return;
        }

        try {
          // Verify and decode the JWT — throws if expired or tampered
          const decoded = jwt.verify(token, secret) as { userId: string };
          userId = decoded.userId;
          authenticated = true;
          clearTimeout(authTimeout);

          // Register socket in the shared Map — worker can now reach this user
          wsManager.register(userId, socket);

          // Acknowledge successful auth to the client
          socket.send(JSON.stringify({ type: 'auth:success', userId }));
          console.log(`[WS] Authenticated userId=${userId}`);
        } catch {
          socket.close(1008, 'Invalid token');
        }
        return;
      }

      // ── (Optional) Handle ping-pong keepalives from the client ───────────
      if (message.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
      }

    } catch {
      // Malformed JSON — ignore silently to avoid crashing the connection
      console.warn('[WS] Received non-JSON message, ignoring');
    }
  });

  socket.on('close', () => {
    if (userId) {
      wsManager.remove(userId);
    }
    clearTimeout(authTimeout);
  });

  socket.on('error', (err) => {
    console.error(`[WS] Socket error for userId=${userId}:`, err.message);
  });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  await connectDB();

  // Use httpServer.listen() instead of app.listen() — same effect, but
  // lets the WebSocket server share the same port.
  httpServer.listen(PORT, () => {
    console.log(`[Server] HTTP + WebSocket running on port ${PORT}`);
    console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ws`);
    console.log(
      `[Server] GitHub OAuth callback: ${
        process.env.GITHUB_CALLBACK_URL ??
        `http://localhost:${PORT}/api/auth/github/callback`
      }`,
    );
  });
}

bootstrap();
