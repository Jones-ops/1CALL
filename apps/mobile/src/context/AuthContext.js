import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  saveSession,
  clearSession,
  restoreSession,
  getRefreshToken,
  setSessionExpiredHandler,
} from '../api/client';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [appConfig, setAppConfig] = useState({ mockMode: true, bannerText: null });

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    (async () => {
      api('/config', { auth: false })
        .then(setAppConfig)
        .catch(() => {});
      const s = await restoreSession();
      if (s?.user) setUser(s.user);
      setReady(true);
    })();
  }, []);

  const signIn = useCallback(async (email, password) => {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    await saveSession(data);
    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = await getRefreshToken();
    api('/auth/logout', {
      method: 'POST',
      body: { refreshToken: refreshToken || undefined },
      auth: false,
    }).catch(() => {});
    await clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, signIn, signOut, appConfig, isAdmin: user?.role === 'admin' }),
    [user, ready, signIn, signOut, appConfig],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
