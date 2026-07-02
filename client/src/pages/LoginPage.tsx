import { Navigate } from 'react-router-dom';
import { useIsAuthenticated } from '@azure/msal-react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const isAuthenticated = useIsAuthenticated();

  if (isAuthenticated) return <Navigate to="/" />;

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-copy">
          <span className="eyebrow">Technology Battlecard</span>
          <h1>Structured technology decisions, designed for fast alignment.</h1>
          <p>
            Compare platforms with consistent criteria, reusable reference answers, category weighting, and presentation-ready results.
          </p>
          <div className="tag-row">
            <span className="tag">Earthy teal UI</span>
            <span className="tag">Weighted scoring</span>
            <span className="tag">Admin-managed questions</span>
          </div>
        </section>

        <section className="login-card card">
          <div className="brand-mark large">TB</div>
          <h2>Welcome back</h2>
          <p className="muted">Sign in with your Microsoft account to access saved comparisons and admin tools.</p>
          <button className="btn btn-primary btn-block" onClick={login}>
            Sign in with Microsoft
          </button>
        </section>
      </div>
    </div>
  );
}
