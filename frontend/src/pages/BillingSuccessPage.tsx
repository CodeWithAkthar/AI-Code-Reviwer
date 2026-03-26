import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * BillingSuccessPage — shown after Stripe redirects the user back.
 *
 * IMPORTANT: This page does NOT set the user's plan to Pro.
 * That is done by the Stripe webhook on the backend.
 * This page just shows a confirmation message and refreshes the user
 * profile so the UI reflects the plan change if the webhook already fired.
 */
export function BillingSuccessPage() {
  const { refreshUser } = useAuth();

  useEffect(() => {
    // Give the webhook a moment to fire, then refresh the user's plan
    const t = setTimeout(() => refreshUser(), 2000);
    return () => clearTimeout(t);
  }, [refreshUser]);

  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: '80px' }}>
      <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
      <h1>You're now on Pro!</h1>
      <p className="text-secondary" style={{ marginTop: '8px' }}>
        Your subscription is active. Unlimited PR reviews are now enabled.
      </p>
      <Link
        to="/dashboard"
        style={{
          display: 'inline-block',
          marginTop: '32px',
          padding: '10px 24px',
          background: 'var(--color-accent)',
          color: 'white',
          borderRadius: '6px',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Go to Dashboard →
      </Link>
    </div>
  );
}
