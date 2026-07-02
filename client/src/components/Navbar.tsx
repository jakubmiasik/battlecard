import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand-link">
          <span className="brand-mark">TB</span>
          <div>
            <div className="brand-title">Technology Battlecard</div>
            <div className="brand-subtitle">Weighted comparisons for modern platforms</div>
          </div>
        </Link>

        <div className="navbar-right">
          <div className="top-nav-links">
            <Link to="/" className={`top-nav-link ${location.pathname === '/' ? 'active' : ''}`}>
              Dashboard
            </Link>
            {isAdmin && (
              <Link to="/admin" className={`top-nav-link ${location.pathname.startsWith('/admin') ? 'active' : ''}`}>
                Admin
              </Link>
            )}
          </div>

          <div className="account-menu">
            <button className="account-trigger" onClick={() => setMenuOpen((value) => !value)}>
              <span className="account-avatar">{user?.displayName?.charAt(0) || 'U'}</span>
              <span>
                <strong>{user?.displayName}</strong>
                <small>{user?.role}</small>
              </span>
              <span aria-hidden="true">▾</span>
            </button>
            {menuOpen && (
              <div className="account-dropdown">
                <div className="account-dropdown-meta">
                  <strong>{user?.displayName}</strong>
                  <span>{user?.email}</span>
                </div>
                {isAdmin && (
                  <Link to="/admin" className="dropdown-link" onClick={() => setMenuOpen(false)}>
                    Open admin panel
                  </Link>
                )}
                <button className="dropdown-link danger" onClick={logout}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
