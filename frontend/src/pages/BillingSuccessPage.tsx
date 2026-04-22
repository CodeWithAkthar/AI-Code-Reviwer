import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/billing.css';

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
    <div className="billing-success-screen">
      <div className="billing-success-card card">
        <div className="billing-success-check">✓</div>
        <h1>You're on Pro!</h1>
        <p className="text-secondary">All your repos now get unlimited AI reviews.</p>
        <Link to="/dashboard" className="btn btn-primary billing-success-btn">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
