import { useEffect, useState, useRef } from 'react';

// The shape of the state we hold in React
export interface ReviewState {
  status: 'queued' | 'reviewing' | 'complete' | 'failed' | 'idle';
  progress: {
    currentChunk: number;
    totalChunks: number;
    filesBeingAnalyzed: string[];
  } | null;
  result: {
    reviewId: string;
    summary: string;
    score: number;
    comments: any[];
    tokensUsed: number;
  } | null;
  error: string | null;
}

/**
 * Custom hook to manage the WebSocket connection and state for a specific PR.
 *
 * @param prNumber The PR number to listen for events on
 * @param token The user's JWT access token
 * @param repoFullName The full name of the repo (e.g. "CodeWithAkthar/testing-backend")
 */
export function useReviewSocket(prNumber: number, token: string, repoFullName: string) {
  const [reviewState, setReviewState] = useState<ReviewState>({
    status: 'idle',
    progress: null,
    result: null,
    error: null,
  });

  // useRef holds the live WebSocket instance across re-renders
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;

    // Connect to the WebSocket server running on the same port as Express
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws';
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('[useReviewSocket] Connected. Sending auth token...');
      // ── Step 4 Verification: JWT Auth Handshake ─────────────────────────────
      // We must send the token immediately or the server closes the socket after 5s
      socket.send(JSON.stringify({ type: 'auth', token }));
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Filter out events that aren't for this specific PR
        // (A user might have multiple tabs open for different PRs)
        if (message.prNumber && message.prNumber !== prNumber) return;
        if (message.repo && message.repo !== repoFullName) return;

        switch (message.type) {
          case 'auth:success':
            console.log('[useReviewSocket] Authenticated successfully');
            break;

          case 'job:started':
            setReviewState(prev => ({ ...prev, status: 'reviewing', error: null }));
            break;

          case 'review:progress':
            setReviewState(prev => ({
              ...prev,
              status: 'reviewing',
              progress: {
                currentChunk: message.chunk,
                totalChunks: message.totalChunks,
                filesBeingAnalyzed: message.files,
              },
            }));
            break;

          case 'review:complete':
            setReviewState(prev => ({
              ...prev,
              status: 'complete',
              progress: null,
              result: {
                reviewId: message.reviewId,
                summary: message.summary,
                score: message.score,
                comments: message.comments,
                tokensUsed: message.tokensUsed,
              },
            }));
            break;

          case 'job:failed':
            setReviewState(prev => ({
              ...prev,
              status: 'failed',
              error: message.error,
              progress: null,
            }));
            break;
        }
      } catch (err) {
        console.error('[useReviewSocket] Failed to parse message:', err);
      }
    };

    socket.onclose = () => {
      console.log('[useReviewSocket] Disconnected');
      // In a production app, we would implement exponential backoff reconnection here.
    };

    socket.onerror = (err) => {
      console.error('[useReviewSocket] WebSocket error:', err);
    };

    // Cleanup when the component unmounts (e.g. user navigates away from PR page)
    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [prNumber, repoFullName, token]);

  return reviewState;
}
