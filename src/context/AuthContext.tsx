import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { initFirebase, loginEmail, registerEmail, loginGoogle, loginGoogleSystemBrowser, loginGoogleRedirect, handleRedirectResult, logoutUser, onAuthChange } from '../lib/firebase';
import type { User } from 'firebase/auth';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithGoogleRedirect: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initFirebase().then(() => {
      handleRedirectResult().then((u) => {
        if (u) setUser(u);
      });
      const unsub = onAuthChange((u) => {
        setUser(u);
        setLoading(false);
      });
      return () => unsub();
    });
  }, []);

  const login = async (email: string, password: string) => {
    await loginEmail(email, password);
  };

  const register = async (email: string, password: string) => {
    await registerEmail(email, password);
  };

  const autoFallback = useRef(false);

  const loginWithGoogle = async () => {
    if (isTauri()) {
      await loginGoogleSystemBrowser();
      return;
    }
    if (autoFallback.current) {
      loginGoogleRedirect();
      return;
    }
    try {
      await loginGoogle();
    } catch (err) {
      autoFallback.current = true;
      loginGoogleRedirect();
    }
  };

  const loginWithGoogleRedirect = () => {
    loginGoogleRedirect();
  };

  const logout = async () => {
    await logoutUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, loginWithGoogleRedirect, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
