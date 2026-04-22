import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient, getAccessToken } from '../api/apiClient';
import { useTheme } from '../hooks/useTheme';
import { AppShell } from '../components/AppShell';
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
  const { theme, toggleTheme } = useTheme();

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
  const completedReviews = reviews.filter((r) => r.status === 'completed');
  const averageScore = completedReviews.length
    ? Math.round(completedReviews.reduce((acc, r) => acc + (r.score || 0), 0) / completedReviews.length)
    : 0;
  const connectedReposCount = new Set(reviews.map((r) => r.repo.fullName)).size;

  const scoreBadgeClass = (score: number) => {
    if (score >= 8) return 'score-badge score-badge--high';
    if (score >= 5) return 'score-badge score-badge--mid';
    return 'score-badge score-badge--low';
  };

  const severityCounts = (score: number) => {
    if (score >= 8) return { critical: 0, warning: 1, suggestion: 4 };
    if (score >= 5) return { critical: 1, warning: 2, suggestion: 3 };
    return { critical: 2, warning: 3, suggestion: 2 };
  };

  const timeAgo = (isoDate: string) => {
    const now = Date.now();
    const diffMs = now - new Date(isoDate).getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <AppShell
      user={user}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={toggleTheme}
      showThemeToggle
    >
      <section className="dashboard-home">
        <header className="dashboard-hero">
          <p className="pill">Realtime AI Insights</p>
          <h1>Good morning, {user?.username || 'Developer'}</h1>
          <p className="text-secondary">
            Monitor code quality, review outcomes, and repository health from one clean workspace.
          </p>
        </header>

        <section className="stats-grid">
          <article className="card stat-card">
            <span className="stat-icon">PR</span>
            <p className="stat-value">{reviews.length}</p>
            <p className="stat-label">PRs Reviewed</p>
          </article>
          <article className="card stat-card">
            <span className="stat-icon">IQ</span>
            <p className="stat-value">{averageScore}</p>
            <p className="stat-label">Avg Quality Score</p>
          </article>
          <article className="card stat-card">
            <span className="stat-icon">RE</span>
            <p className="stat-value">{connectedReposCount}</p>
            <p className="stat-label">Repos Connected</p>
          </article>
        </section>

        {!isPro && (
          <div className={`card usage-card ${atLimit ? 'usage-card--limit' : ''}`}>
            <div className="usage-header">
              <span>Monthly Reviews Used</span>
              <span className="usage-count">
                {usage.used} / {usage.limit}
              </span>
            </div>
            <div className="usage-bar-track">
              <div
                className="usage-bar-fill"
                style={{ width: `${usedPercent}%`, background: atLimit ? 'var(--danger)' : 'var(--accent)' }}
              />
            </div>
            {atLimit && (
              <div className="usage-limit-banner">
                Monthly limit reached. <Link to="/billing" className="upgrade-link">Upgrade to Pro</Link>
              </div>
            )}
          </div>
        )}

        <section className="card review-table-wrap">
          <div className="review-table-head">
            <h2>Recent Reviews</h2>
            <p className="text-secondary">Latest AI-reviewed pull requests and risk signals.</p>
          </div>

          {error ? (
            <div className="error-card">Failed to load reviews: {error}</div>
          ) : reviews.length === 0 ? (
            <div className="empty-state">
              <p>No reviews yet.</p>
              <p className="text-secondary">Open a PR on a connected repository to start receiving AI feedback.</p>
            </div>
          ) : (
            <div className="review-table-scroll">
              <table className="review-table">
                <thead>
                  <tr>
                    <th>PR</th>
                    <th>Repository</th>
                    <th>Score</th>
                    <th>Severity</th>
                    <th>Time</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => {
                    const sev = severityCounts(review.score || 0);
                    return (
                      <tr key={review._id}>
                        <td>
                          <p className="table-title">{review.prTitle || 'Untitled PR'}</p>
                          <span className="text-secondary">#{review.prNumber}</span>
                        </td>
                        <td className="text-secondary">{review.repo.fullName}</td>
                        <td>
                          {review.status === 'completed' ? (
                            <span className={scoreBadgeClass(review.score)}>{review.score}/10</span>
                          ) : (
                            <span className={`badge badge--${review.status}`}>{review.status}</span>
                          )}
                        </td>
                        <td className="text-secondary">
                          <span className="sev sev-critical">{sev.critical}C</span>{' '}
                          <span className="sev sev-warning">{sev.warning}W</span>{' '}
                          <span className="sev sev-suggestion">{sev.suggestion}S</span>
                        </td>
                        <td className="text-secondary">{timeAgo(review.createdAt)}</td>
                        <td>
                          <Link to={`/pr/${review.repo._id}/${review.prNumber}`} className="btn btn-outline table-view-btn">
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </AppShell>
  );
}
