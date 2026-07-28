import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { authApi } from "@/services/api";

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  loginWithDemo: (email: string, name: string) => Promise<void>;
  loginWithGoogle: (
    googleId: string,
    email: string,
    name: string,
    avatar?: string,
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("adaptime-token");
    if (savedToken) {
      authApi
        .getMe(savedToken)
        .then((userData) => {
          setUser(userData);
          setToken(savedToken);
        })
        .catch(() => {
          localStorage.removeItem("adaptime-token");
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const loginWithDemo = useCallback(async (email: string, name: string) => {
    const result = await authApi.demoLogin({ email, name });
    localStorage.setItem("adaptime-token", result.token);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const loginWithGoogle = useCallback(
    async (googleId: string, email: string, name: string, avatar?: string) => {
      const result = await authApi.googleLogin({
        googleId,
        email,
        name,
        avatar,
      });
      localStorage.setItem("adaptime-token", result.token);
      setToken(result.token);
      setUser(result.user);
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("adaptime-token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, loginWithDemo, loginWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
