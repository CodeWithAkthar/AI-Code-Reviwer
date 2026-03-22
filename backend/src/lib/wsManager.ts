/**
 * wsManager.ts — WebSocket Connection Registry
 *
 * WHY A SINGLETON MAP?
 * -------------------------------------------------------------------
 * The BullMQ worker runs in a background async context. It has no
 * reference to any HTTP request, WebSocket connection, or user session.
 *
 * Meanwhile, when a user connects via WebSocket, that socket lives inside
 * the WebSocket server's connection event handler — a completely different
 * call stack from the worker.
 *
 * The bridge: a module-level Map that both sides can import. Because Node.js
 * caches modules, every `import wsManager from './wsManager'` within the same
 * process returns the SAME object — the same Map instance. This means:
 *
 *   • WebSocket server  → registers userId → socket into the Map
 *   • BullMQ worker     → imports the same Map, looks up userId, sends event
 *
 * No Redis pub/sub, no socket.io, no shared memory buss. Just Node's
 * own module cache acting as the coordination layer.
 *
 * LIMITATION: This only works for a single process (modular monolith).
 * If you ever scale to multiple Node.js processes, you'd need Redis pub/sub
 * (Module 5 consideration) — the Map won't be shared across processes.
 */

import { WebSocket } from 'ws';

// The single source of truth: userId → active WebSocket connection
const connections = new Map<string, WebSocket>();

/**
 * Registers a WebSocket connection for a user.
 * Called after JWT auth handshake succeeds.
 *
 * If the user already has an open connection (e.g. opened a second tab),
 * the old socket is closed before storing the new one to avoid ghost connections.
 *
 * @param userId MongoDB ObjectId string (from JWT payload)
 * @param socket The raw WebSocket connection for this user
 */
export function register(userId: string, socket: WebSocket): void {
  const existing = connections.get(userId);
  if (existing && existing.readyState === WebSocket.OPEN) {
    // Gracefully close the old connection before replacing it
    existing.close(1000, 'Replaced by new connection');
  }
  connections.set(userId, socket);
  console.log(`[wsManager] Registered userId=${userId} (total: ${connections.size})`);
}

/**
 * Sends a JSON payload to a specific user's WebSocket connection.
 *
 * Uses readyState check before sending — the socket might be in a CLOSING
 * or CLOSED state if the user disconnected between the worker starting and
 * finishing. Sending to a closed socket throws, so we guard against it.
 *
 * @param userId MongoDB ObjectId string
 * @param payload Plain object — will be JSON serialised
 */
export function send(userId: string, payload: Record<string, unknown>): void {
  const socket = connections.get(userId);

  // Guard 1: user is not connected (never authenticated or already disconnected)
  if (!socket) {
    console.log(`[wsManager] No connection for userId=${userId}, dropping event: ${payload.type}`);
    return;
  }

  // Guard 2: socket exists but is closing/closed (network drop, tab close)
  if (socket.readyState !== WebSocket.OPEN) {
    console.log(`[wsManager] Socket not OPEN for userId=${userId}, state=${socket.readyState}`);
    return;
  }

  socket.send(JSON.stringify(payload));
}

/**
 * Removes a user's connection from the registry.
 * Called when the WebSocket 'close' event fires.
 *
 * @param userId MongoDB ObjectId string
 */
export function remove(userId: string): void {
  connections.delete(userId);
  console.log(`[wsManager] Removed userId=${userId} (remaining: ${connections.size})`);
}

/**
 * Returns the count of currently active connections.
 * Useful for health check endpoints.
 */
export function connectionCount(): number {
  return connections.size;
}
