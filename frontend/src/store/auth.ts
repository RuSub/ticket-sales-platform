import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import api from '../api/client';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  setUser: (user: User) => void;
  clearUser: () => void;
  fetchUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setUser: (user) =>
        set({ user, isAuthenticated: true, error: null }),

      clearUser: () =>
        set({ user: null, isAuthenticated: false, error: null }),

      fetchUser: async () => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.get('/auth/me');
          set({ user: data, isAuthenticated: true, error: null });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to fetch user';
          set({ error: message, isAuthenticated: false });
        } finally {
          set({ isLoading: false });
        }
      },

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          set({ user: data.user, isAuthenticated: true, error: null });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Login failed';
          set({ error: message, isAuthenticated: false });
          throw err;
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (email: string, password: string, name: string) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.post('/auth/register', { email, password, name });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          set({ user: data.user, isAuthenticated: true, error: null });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Registration failed';
          set({ error: message, isAuthenticated: false });
          throw err;
        } finally {
          set({ isLoading: false });
        }
      },

      logout: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, isAuthenticated: false, error: null });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
