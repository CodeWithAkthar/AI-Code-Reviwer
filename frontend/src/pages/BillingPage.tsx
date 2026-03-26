import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/apiClient';
import '../styles/billing.css';

export function BillingPage() {
  const { user, refreshUser } = useAuth();
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPro = user?.plan === 'pro' || user?.plan === 'enterprise';

  // Re-fetch user on mount in case plan changed after Stripe webhook fired
  useEffect(() => { refreshUser(); }, [refreshUser]);

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

  return (
    <div className="billing-page page">
      <Link to="/dashboard" className="back-link">← Dashboard</Link>
      <h1>Billing</h1>

      {error && <div className="error-card">{error}</div>}

      <div className="plan-cards">
        {/* Free Tier */}
        <div className={`plan-card ${!isPro ? 'plan-card--current' : ''}`}>
          <div className="plan-card-header">
            <h2>Free</h2>
            <div className="plan-price">$0<span>/month</span></div>
          </div>
          <ul className="plan-features">
            <li>✅ 5 PR reviews per month</li>
            <li>✅ All AI models (Haiku / Sonnet)</li>
            <li>✅ Inline comments on GitHub</li>
            <li>❌ Real-time WebSocket updates</li>
            <li>❌ Priority queue</li>
          </ul>
          {!isPro && (
            <div className="plan-card-badge">Current Plan</div>
          )}
        </div>

        {/* Pro Tier */}
        <div className={`plan-card plan-card--pro ${isPro ? 'plan-card--current' : ''}`}>
          <div className="plan-card-header">
            <h2>Pro</h2>
            <div className="plan-price">$12<span>/month</span></div>
          </div>
          <ul className="plan-features">
            <li>✅ Unlimited PR reviews</li>
            <li>✅ All AI models</li>
            <li>✅ Inline comments on GitHub</li>
            <li>✅ Real-time WebSocket updates</li>
            <li>✅ Priority queue</li>
          </ul>
          {isPro ? (
            <div className="plan-actions">
              <div className="plan-card-badge plan-card-badge--pro">Current Plan</div>
              <button
                className="btn-portal"
                onClick={handleManage}
                disabled={isLoadingPortal}
              >
                {isLoadingPortal ? 'Redirecting...' : 'Manage Subscription'}
              </button>
            </div>
          ) : (
            <button
              className="btn-upgrade"
              onClick={handleUpgrade}
              disabled={isLoadingCheckout}
            >
              {isLoadingCheckout ? 'Redirecting to Stripe...' : '⚡ Upgrade to Pro'}
            </button>
          )}
        </div>
      </div>

      <p className="billing-note text-secondary">
        Payments are processed securely by <strong>Stripe</strong>. You can cancel anytime — you'll keep Pro until the end of your billing period.
      </p>
    </div>
  );
}
