import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/apiClient';
import { useTheme } from '../hooks/useTheme';
import { AppShell } from '../components/AppShell';
import '../styles/billing.css';

export function BillingPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [usageUsed, setUsageUsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isPro = user?.plan === 'pro' || user?.plan === 'enterprise';

  // Re-fetch user on mount in case plan changed after Stripe webhook fired
  useEffect(() => {
    refreshUser();
    apiClient
      .get<{ used: number }>('/api/usage')
      .then((data) => setUsageUsed(data.used))
      .catch(() => {});
  }, [refreshUser]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleUpgrade = async () => {
    setIsLoadingCheckout(true);
    setError(null);
    try {
      const data = await apiClient.post<{ url: string }>('/billing/create-checkout-session');
      // Redirect the browser to Stripe's hosted checkout page.
      // The frontend's job is done — Stripe handles payment from here.
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message);
      setIsLoadingCheckout(false);
    }
  };

  const handleManage = async () => {
    setIsLoadingPortal(true);
    setError(null);
    try {
      const data = await apiClient.post<{ url: string }>('/billing/portal');
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message);
      setIsLoadingPortal(false);
    }
  };

  const usageLimit = isPro ? 999 : 5;
  const usagePercent = Math.min((usageUsed / usageLimit) * 100, 100);

  return (
    <AppShell user={user} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme}>
      <section className="billing-page page">
        <header className="billing-header">
          <h1>Billing &amp; Plans</h1>
          <p className="text-secondary">Choose your plan and scale AI reviews for every repository.</p>
        </header>

        {error && <div className="error-card">{error}</div>}

        <div className="card usage-meter">
          <div className="usage-header">
            <span>PR usage this month</span>
            <strong>{isPro ? 'Unlimited' : `${usageUsed}/5`}</strong>
          </div>
          <div className="usage-track">
            <div className="usage-fill" style={{ width: `${isPro ? 100 : usagePercent}%` }} />
          </div>
        </div>

        <div className="plan-cards">
          <div className={`card plan-card ${!isPro ? 'plan-card--current' : ''}`}>
            <div className="plan-card-header">
              <h2>Free</h2>
              <div className="plan-price">5 PRs<span>/month</span></div>
            </div>
            <ul className="plan-features">
              <li>GitHub OAuth + App integration</li>
              <li>Inline code comments</li>
              <li>Basic dashboard analytics</li>
              <li>Community support</li>
            </ul>
            {!isPro && (
              <div className="plan-card-badge">Current plan</div>
            )}
          </div>

          <div className={`card plan-card plan-card--pro ${isPro ? 'plan-card--current' : ''}`}>
            <div className="plan-card-header">
              <h2>Pro</h2>
              <div className="plan-price">Unlimited<span>PRs</span></div>
            </div>
            <ul className="plan-features">
              <li>Unlimited repository reviews</li>
              <li>Realtime progress updates</li>
              <li>Priority queue + faster turnaround</li>
              <li>Advanced AI review quality</li>
            </ul>
            {isPro ? (
              <div className="plan-actions">
                <div className="plan-card-badge plan-card-badge--pro">Current plan</div>
                <button
                  className="btn btn-outline"
                  onClick={handleManage}
                  disabled={isLoadingPortal}
                >
                  {isLoadingPortal ? 'Redirecting...' : 'Manage Subscription'}
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-upgrade"
                onClick={handleUpgrade}
                disabled={isLoadingCheckout}
              >
                {isLoadingCheckout ? 'Redirecting to Stripe...' : 'Upgrade to Pro'}
              </button>
            )}
          </div>
        </div>

        <p className="billing-note text-secondary">
          Payments are processed securely by <strong>Stripe</strong>. Cancel anytime and keep Pro access until billing period end.
        </p>
      </section>
    </AppShell>
  );
}
