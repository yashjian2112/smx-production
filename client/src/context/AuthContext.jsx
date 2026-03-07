import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const API = '/api';

function getStoredToken() {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(getStoredToken);
  const [loading, setLoading] = useState(!!getStoredToken());

  const setToken = (t) => {
    if (t) localStorage.setItem('token', t);
    else localStorage.removeItem('token');
    setTokenState(t);
  };

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [token]);

  const login = async (username, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const api = (path, options = {}) => {
    const headers = { ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API}${path}`, { ...options, headers });
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, api, isAdmin: user?.role === 'admin', isSupervisor: user?.role === 'supervisor', isEmployee: user?.role === 'employee' }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
