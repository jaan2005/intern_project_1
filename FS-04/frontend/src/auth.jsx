import { createContext, useContext, useEffect, useState } from 'react';
import { TOKEN_KEY, api, getToken } from './api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me/').then((d) => setUser(d.user)).catch(() => {}).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('pm-logout', onLogout);
    return () => window.removeEventListener('pm-logout', onLogout);
  }, []);

  const authenticate = async (path, body) => {
    const d = await api(path, { method: 'POST', body });
    localStorage.setItem(TOKEN_KEY, d.token);
    setUser(d.user);
    return d.user;
  };
  const value = {
    user, ready,
    login: (b) => authenticate('/auth/login/', b),
    register: (b) => authenticate('/auth/register/', b),
    logout: () => { localStorage.removeItem(TOKEN_KEY); setUser(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
