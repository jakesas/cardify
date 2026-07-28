import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { initFirebase, loginEmail, registerEmail, loginGoogle, logoutUser, onAuthChange } from '../lib/firebase';
import type { User } from 'firebase/auth';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const a = initFirebase();
    if (!a) return;
    const unsub = onAuthChange((u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const login = async (email: string, password: string) => {
    await loginEmail(email, password);
  };

  const register = async (email: string, password: string) => {
    await registerEmail(email, password);
  };

  const loginWithGoogle = async () => {
    await loginGoogle();
  };

  const logout = async () => {
    await logoutUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
