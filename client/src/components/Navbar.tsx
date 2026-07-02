import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();

  return (
    <nav className="navbar">
      <Link to="/" style={{ color: 'white', textDecoration: 'none' }}>
        <h1>⚔️ Technology Battlecard</h1>
      </Link>
      <div className="navbar-right">
        {isAdmin && (
          <Link to="/admin" className="btn btn-white btn-sm">
            Admin Panel
          </Link>
        )}
        <span>{user?.displayName}</span>
        <span style={{ opacity: 0.7, fontSize: 12 }}>({user?.role})</span>
        <button className="btn btn-white btn-sm" onClick={logout}>
          Sign Out
        </button>
      </div>
    </nav>
  );
}
