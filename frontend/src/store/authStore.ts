import { create } from 'zustand';
import api, { _setAuthStoreRef } from '../api/axios';
import type { User, LoginResponse } from '../types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  checkAuth: () => Promise<void>;
  login: (email: string, password: string, captchaToken?: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) =>
    set({ user, isAuthenticated: !!user }),

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<{ success: boolean; user: User }>('/auth/me');
      set({ user: res.data.user, isAuthenticated: true });
    } catch {
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (email, password, captchaToken) => {
    const res = await api.post<LoginResponse>('/auth/login', { email, password, captchaToken });
    if (res.data.user) {
      set({ user: res.data.user, isAuthenticated: true });
    }
    return res.data;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },
}));

// Wire the store reference into axios so the 401 interceptor can call setUser(null).
_setAuthStoreRef(useAuthStore);
