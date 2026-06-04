'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { loginUser, registerUser, logoutUser } from '@/lib/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Аварийный тайм-аут на 2 секунды для переключения загрузки, чтобы избежать вечного белого экрана
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 2000);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      clearTimeout(timeoutId);
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    setError(null);
    setLoading(true);
    const result = await loginUser(email, password);
    setLoading(false);

    if (!result.success) {
      setError(result.error);
    }

    return result;
  };

  const register = async (email, password) => {
    setError(null);
    setLoading(true);
    const result = await registerUser(email, password);
    setLoading(false);

    if (!result.success) {
      setError(result.error);
    }

    return result;
  };

  const logout = async () => {
    setError(null);
    const result = await logoutUser();

    if (!result.success) {
      setError(result.error);
    }

    return result;
  };

  const clearError = () => setError(null);

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth должен использоваться внутри AuthProvider');
  }

  return context;
}
