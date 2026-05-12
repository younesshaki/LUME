import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  checkExistingSession,
  logout,
  type AuthUser,
} from "../lib/authService";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const nextUser = await checkExistingSession();
    setUser(nextUser);
    setLoading(false);
    return nextUser;
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void checkExistingSession().then((nextUser) => {
      if (cancelled) return;
      setUser(nextUser);
      setLoading(false);
    });

    if (!isSupabaseConfigured) {
      return () => {
        cancelled = true;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ user, loading, refresh, signOut }),
    [loading, refresh, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return value;
}

