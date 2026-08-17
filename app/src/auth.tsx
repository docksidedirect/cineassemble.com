import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { ApiError, api, type CreditSummary, type User } from "./api";

interface AuthContextValue {
  user: User | null;
  credits: CreditSummary | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const account = await api.me();
      setUser(account.user);
      setCredits(account.credits);
      const security = await api.csrf();
      api.setCsrf(security.csrfToken);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        api.clearCsrf();
        setUser(null);
        setCredits(null);
        return;
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => {
        setUser(null);
        setCredits(null);
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api.login({ email, password });
    api.setCsrf(result.csrfToken);
    setUser(result.user);
    const account = await api.me();
    setCredits(account.credits);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      api.clearCsrf();
      setUser(null);
      setCredits(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, credits, loading, signIn, signOut, refresh }),
    [credits, loading, refresh, signIn, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#08090c] text-zinc-100">
      <div className="flex items-center gap-3 text-sm text-zinc-400">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />
        Securing your workspace…
      </div>
    </div>
  );
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function AdminRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/studio" replace />;
  return <Outlet />;
}
