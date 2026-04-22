import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/apiClient';
import { getAccessToken } from '../api/apiClient';
import { useTheme } from '../hooks/useTheme';
import { ThemeToggle } from '../components/ThemeToggle';
import '../styles/prDetail.css';

interface Comment {
  filename: string;
  line: number;
  severity: 'info' | 'warning' | 'critical';
  category: string;
  issue: string;
  suggestion: string;
}

interface Review {
  _id: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  score: number;
  summary: string;
  modelUsed: string;
  tokensUsed: number;
  comments: Comment[];
  createdAt: string;
  repo: { fullName: string };
}

interface LiveProgress {
  chunk: number;
  totalChunks: number;
  files: string[];
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Suggestion',
};

export function PRDetailPage() {
  const { repoId, prNumber } = useParams<{ repoId: string; prNumber: string }>();
  const { user } = useAuth();

  const [review, setReview] = useState<Review | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<LiveProgress | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const { theme, toggleTheme } = useTheme();

  // ── Load review from API ─────────────────────────────────────────────────
  useEffect(() => {
    if (!repoId || !prNumber) return;
    async function load() {
      try {
        const data = await apiClient.get<{ review: Review }>(`/api/reviews/${repoId}/${prNumber}`);
        setReview(data.review);
        // If already processing, show live state
        if (data.review.status === 'processing' || data.review.status === 'pending') {
          setLiveStatus('Waiting for review to start...');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [repoId, prNumber]);

  // ── WebSocket for live updates ───────────────────────────────────────────
  // We only connect if the review is in an active state.
  // Once it completes we close the connection to avoid leaking resources.
  useEffect(() => {
    const isActive = review?.status === 'pending' || review?.status === 'processing';
    if (!isActive || !user) return;

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Authenticate the WebSocket session (same pattern as Module 4)
      ws.send(JSON.stringify({ type: 'auth', token: getAccessToken() }));
      setLiveStatus('Connected — waiting for review...');
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'review:progress') {
        setLiveStatus(`Analyzing chunk ${msg.chunk} of ${msg.totalChunks}...`);
        setLiveProgress({ chunk: msg.chunk, totalChunks: msg.totalChunks, files: msg.files });
      }

      if (msg.type === 'review:complete') {
        setLiveStatus(null);
        setLiveProgress(null);
        // Re-fetch the full review from the API (source of truth is the database)
        apiClient.get<{ review: Review }>(`/api/reviews/${repoId}/${prNumber}`)
          .then(data => setReview(data.review))
          .catch(() => {});
        ws.close();
      }

      if (msg.type === 'job:failed') {
        setLiveStatus('❌ Review failed.');
        ws.close();
      }
    };

    ws.onerror = () => setLiveStatus('WebSocket connection error.');
    ws.onclose = () => {};

    return () => ws.close();
  }, [review?.status, user, repoId, prNumber]);

  if (isLoading) return <div className="loading-screen">Loading review...</div>;
  if (error) return <div className="page"><div className="error-card">Error: {error}</div></div>;
  if (!review) return <div className="page"><p>Review not found.</p></div>;

  // Group comments by filename for the diff-style view
  const commentsByFile = review.comments.reduce<Record<string, Comment[]>>((acc, c) => {
    if (!acc[c.filename]) acc[c.filename] = [];
    acc[c.filename].push(c);
    return acc;
  }, {});

  return (
    <div className="pr-detail-page">
      {/* Header */}
      <div className="pr-header">
        <div className="pr-header-top">
          <Link to="/dashboard" className="back-link">← Dashboard</Link>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
        <div className="pr-title-row">
          <h1>
            <span className="pr-num">#{review.prNumber}</span>{' '}
            {review.prTitle || 'Pull Request Review'}
          </h1>
          <span className={`badge badge--${review.status}`}>{review.status}</span>
        </div>
        <p className="text-secondary">{review.repo?.fullName}</p>
      </div>

      {/* Live Progress Banner */}
      {liveStatus && (
        <div className="live-banner">
          <span className="live-dot" />
          <span>{liveStatus}</span>
          {liveProgress && (
            <div className="live-files">
              {liveProgress.files.map(f => <code key={f}>{f}</code>)}
            </div>
          )}
        </div>
      )}

      {/* Summary Card */}
      {review.status === 'completed' && (
        <div className="summary-shell">
          <div className={`score-ring score-${review.score >= 8 ? 'high' : review.score >= 5 ? 'mid' : 'low'}`}>
            <div className="score-circle">
              <span className="score-value">{review.score}</span>
              <span className="score-label">/10</span>
            </div>
          </div>
          <div className="summary-card card">
            <div className="summary-text">
              <h3>AI Summary</h3>
              <p>{review.summary || 'No summary available.'}</p>
              <div className="summary-meta">
                <span>Model: <strong>{review.modelUsed}</strong></span>
                <span>Tokens: <strong>{review.tokensUsed?.toLocaleString()}</strong></span>
                <span>Comments: <strong>{review.comments.length}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline Comments — grouped by file */}
      {review.comments.length > 0 ? (
        <div className="comments-section">
          <h2>Inline Comments</h2>
          {Object.entries(commentsByFile).map(([filename, comments]) => (
            <div key={filename} className="file-block">
              <div className="file-header">
                <code>{filename}</code>
                <span className="text-secondary">{comments.length} issue{comments.length !== 1 ? 's' : ''}</span>
              </div>
              {comments.map((c, i) => (
                <div key={i} className={`comment-card comment-card--${c.severity}`}>
                  <div className="comment-header">
                    <span className={`severity-badge severity--${c.severity}`}>
                      {SEVERITY_LABELS[c.severity]}
                    </span>
                    <code className="comment-line">Line {c.line}</code>
                    <span className="comment-category">{c.category}</span>
                  </div>
                  <p className="comment-issue"><strong>Issue:</strong> {c.issue}</p>
                  <p className="comment-suggestion"><strong>Suggestion:</strong> {c.suggestion}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : review.status === 'completed' ? (
        <div className="empty-state">No comments found. This PR looks clean.</div>
      ) : null}
    </div>
  );
}
