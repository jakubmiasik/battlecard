import { useAuth } from '../contexts/AuthContext';
import { useIsAuthenticated } from '@azure/msal-react';
import { Navigate } from 'react-router-dom';

export default function LoginPage() {
  const { login } = useAuth();
  const isAuthenticated = useIsAuthenticated();

  if (isAuthenticated) return <Navigate to="/" />;

  return (
    <div className="login-page">
      <h1>⚔️ Technology Battlecard</h1>
      <p>Compare technologies with structured scoring and weighted criteria</p>
      <div className="login-card">
        <h2>Welcome</h2>
        <p style={{ marginBottom: 24, color: '#605e5c' }}>
          Sign in with your organization account to get started.
        </p>
        <button className="btn btn-primary" onClick={login} style={{ fontSize: 16, padding: '12px 32px' }}>
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}
