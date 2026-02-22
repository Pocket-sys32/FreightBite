import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearAuthToken, fetchCurrentDriver, loginDriverAccount } from '../lib/api';
import type { Driver } from '../lib/types';

interface AuthContextValue {
  driver: Driver | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshDriver: () => Promise<void>;
  setDriver: React.Dispatch<React.SetStateAction<Driver | null>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshDriver = useCallback(async () => {
    const current = await fetchCurrentDriver();
    setDriver(current);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshDriver();
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshDriver]);

  const signIn = useCallback(async (email: string, password: string) => {
    const nextDriver = await loginDriverAccount(email, password);
    setDriver(nextDriver);
  }, []);

  const signOut = useCallback(async () => {
    await clearAuthToken();
    setDriver(null);
  }, []);

  const value = useMemo(
    () => ({ driver, loading, signIn, signOut, refreshDriver, setDriver }),
    [driver, loading, signIn, signOut, refreshDriver]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
