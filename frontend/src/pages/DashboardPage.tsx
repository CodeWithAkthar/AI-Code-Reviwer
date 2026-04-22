import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient, getAccessToken } from '../api/apiClient';
import '../styles/dashboard.css';

interface Review {
  _id: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  score: number;
  createdAt: string;
  repo: {
    _id: string;
    fullName: string;
  };
}

interface UsageData {
  used: number;
  limit: number;
}

const PLAN_LIMITS: Record<string, number> = {
  free: 5,
  pro: Infinity,
  enterprise: Infinity,
};

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate(); 

  const [reviews, setReviews] = useState<Review[]>([]);
  const [usage, setUsage] = useState<UsageData>({ used: 0, limit: 5 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [reviewsData, usageData] = await Promise.all([
          apiClient.get<{ reviews: Review[] }>('/api/reviews'),
          apiClient.get<{ used: number }>('/api/usage'),
        ]);
        setReviews(reviewsData.reviews);
        const limit = PLAN_LIMITS[user?.plan || 'free'];
        setUsage({ used: usageData.used, limit: limit === Infinity ? 999999 : limit });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, [user]);

  // Keep dashboard list live via WebSocket events from worker/service.
  useEffect(() => {
    if (!user) return;

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws';
    const ws = new WebSocket(wsUrl);
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        try {
          const data = await apiClient.get<{ reviews: Review[] }>('/api/reviews');
          setReviews(data.reviews);
        } catch {
          // Ignore live refresh errors; initial load already handles error UI.
        }
      }, 400);
    };

    ws.onopen = () => {
      const token = getAccessToken();
      if (!token) return;
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (
          msg.type === 'job:started' ||
          msg.type === 'review:progress' ||
          msg.type === 'review:complete' ||
          msg.type === 'job:failed'
        ) {
          scheduleRefresh();
        }
      } catch {
        // Ignore malformed events.
      }
    };

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      ws.close();
    };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (isLoading) return <div className="loading-screen">Loading dashboard...</div>;

  const isPro = user?.plan === 'pro' || user?.plan === 'enterprise';
  const usedPercent = isPro ? 0 : Math.min((usage.used / usage.limit) * 100, 100);
  const atLimit = !isPro && usage.used >= usage.limit; 

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">⚡ AI Reviewer</div>
        <nav className="sidebar-nav">
          <Link to="/dashboard" className="sidebar-link active">📋 Reviews</Link>
          <Link to="/settings/repos" className="sidebar-link">⚙️ Repos</Link>
          <Link to="/billing" className="sidebar-link">💳 Billing</Link>
        </nav>
        <div className="sidebar-user">
          {user?.avatarUrl && ( 
            <img src={user.avatarUrl} alt={user.username} className="avatar" />
          )}
          <div>
            <p className="sidebar-username">{user?.username}</p>
            <span className={`badge badge--${isPro ? 'completed' : 'pending'}`}>
              {user?.plan?.toUpperCase()}
            </span>
          </div>
          <button className="btn-logout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>
      
      {/* Main content */}
      <main className="dashboard-main">
        <div className="dashboard-header">
          <h1>PR Reviews</h1>
          <p className="text-secondary">AI-reviewed pull requests across all connected repos.</p>
        </div>

        {/* Usage Meter */}
        {!isPro && (
          <div className={`usage-card ${atLimit ? 'usage-card--limit' : ''}`}>
            <div className="usage-header">
              <span>Monthly Reviews Used</span>
              <span className="usage-count">
                {usage.used} / {usage.limit}
              </span>
            </div>
            <div className="usage-bar-track">
              <div
                className="usage-bar-fill"
                style={{ width: `${usedPercent}%`, background: atLimit ? 'var(--color-danger)' : 'var(--color-accent)' }}
              />
            </div>
            {atLimit && (
              <div className="usage-limit-banner">
                🚫 Monthly limit reached.{' '}
                <Link to="/billing" className="upgrade-link">Upgrade to Pro →</Link>
              </div>
            )}
          </div>
        )}

        {/* Reviews List */}
        {error ? (
          <div className="error-card">Failed to load reviews: {error}</div>
        ) : reviews.length === 0 ? (
          <div className="empty-state">
            <p>🔍 No reviews yet.</p>
            <p className="text-secondary">Open a PR on a connected repo to get started.</p>
          </div>
        ) : (
          <div className="reviews-list">
            {reviews.map((review) => (
              <Link
                key={review._id}
                to={`/pr/${review.repo._id}/${review.prNumber}`}
                className="review-card"
              >
                <div className="review-card-left">
                  <p className="review-repo">{review.repo.fullName}</p>
                  <p className="review-title">
                    <span className="review-pr-num">#{review.prNumber}</span>{' '}
                    {review.prTitle || 'Untitled PR'}
                  </p>
                  <p className="review-date text-secondary">
                    {new Date(review.createdAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="review-card-right">
                  <span className={`badge badge--${review.status}`}>{review.status}</span>
                  {review.status === 'completed' && (
                    <span className="review-score">
                      {review.score > 0 ? `${review.score}/10` : '—'}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
