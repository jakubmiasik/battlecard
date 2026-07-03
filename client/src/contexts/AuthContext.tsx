import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { authApi } from '../services/api';

interface AppUser {
  id: number;
  entraObjectId: string;
  email: string;
  displayName: string;
  role: 'admin' | 'explorer';
}

interface AuthContextType {
  user: AppUser | null;
  isAdmin: boolean;
  loading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      authApi
        .login()
        .then(setUser)
        .catch((err) => {
          if (err.message?.includes('blocked')) {
            setBlocked(true);
          }
          console.error(err);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const login = () => {
    instance.loginPopup({ scopes: ['openid', 'profile', 'email'] }).catch(console.error);
  };

  const logout = () => {
    setBlocked(false);
    instance.logoutPopup().then(() => setUser(null));
  };

  if (blocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem' }}>
        <h2>Account Blocked</h2>
        <p>Your account has been blocked by an administrator. Contact your admin for assistance.</p>
        <button onClick={logout} className="btn btn-primary">Sign Out</button>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, isAdmin: user?.role === 'admin', loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
