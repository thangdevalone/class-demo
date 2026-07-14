import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authAPI } from '../services/api';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'teacher' | 'student';
  avatar?: string;
  ermisUserId?: string;
  ermisToken?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('class-demo-token'),
  );
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      const savedToken = localStorage.getItem('class-demo-token');
      const savedUser = localStorage.getItem('class-demo-user');
      
      if (savedToken && savedUser) {
        try {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          // Verify token is still valid
          const res = await authAPI.me();
          setUser(res.data.user);
        } catch {
          // Token expired or invalid
          localStorage.removeItem('class-demo-token');
          localStorage.removeItem('class-demo-user');
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await authAPI.login({ username, password });
    const { token: newToken, user: newUser } = res.data;
    
    localStorage.setItem('class-demo-token', newToken);
    localStorage.setItem('class-demo-user', JSON.stringify(newUser));
    
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('class-demo-token');
    localStorage.removeItem('class-demo-user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
