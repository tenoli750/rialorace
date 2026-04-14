import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  getLoginSession,
  signInWithLoginId,
  signOutLoginSession,
  signUpWithLoginId
} from "../lib/supabase";

interface User {
  id: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  points: number;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePoints: (amount: number) => void;
  setPointsBalance: (points: number) => void;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [points, setPoints] = useState(1250);

  useEffect(() => {
    void refreshSession();
  }, []);

  const login = async (username: string, password: string) => {
    const session = await signInWithLoginId(username, password);
    if (!session) throw new Error("Login failed.");
    setUser({ id: session.accountId, username: session.loginId });
    setPoints(session.pointsBalance);
  };

  const signup = async (username: string, password: string) => {
    const session = await signUpWithLoginId(username, password);
    if (!session) throw new Error("Signup failed.");
    setUser({ id: session.accountId, username: session.loginId });
    setPoints(session.pointsBalance);
  };

  const logout = async () => {
    await signOutLoginSession();
    setUser(null);
    setPoints(1250);
  };

  const updatePoints = (amount: number) => {
    const newPoints = points + amount;
    setPoints(newPoints);
  };

  const setPointsBalance = (nextPoints: number) => {
    setPoints(nextPoints);
  };

  async function refreshSession() {
    const { session } = await getLoginSession();
    if (!session) {
      setUser(null);
      setPoints(1250);
      return;
    }
    setUser({ id: session.accountId, username: session.loginId });
    setPoints(session.pointsBalance);
  }

  return (
    <AuthContext.Provider value={{ user, points, login, signup, logout, updatePoints, setPointsBalance, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
