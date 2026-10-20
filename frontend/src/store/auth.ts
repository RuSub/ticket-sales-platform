import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthResponse, User } from '../types';
import api from '../api/client';
import { getErrorMessage } from '../utils/errors';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  fetchUser: () => Promise<void>;
  setSession: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
}

function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
          storeTokens(data.accessToken, data.refreshToken);
          set({ user: data.user, isAuthenticated: true, error: null });
        } catch (error) {
          set({
            error: getErrorMessage(error, 'Не удалось войти'),
            isAuthenticated: false,
            user: null,
          });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (email, password, name) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.post<AuthResponse>('/auth/register', {
            email,
            password,
            fullName: name,
          });
          storeTokens(data.accessToken, data.refreshToken);
          set({ user: data.user, isAuthenticated: true, error: null });
        } catch (error) {
          set({
            error: getErrorMessage(error, 'Не удалось зарегистрироваться'),
            isAuthenticated: false,
            user: null,
          });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      fetchUser: async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
          set({ user: null, isAuthenticated: false, isLoading: false, error: null });
          return;
        }

        set({ isLoading: true });
        try {
          const { data } = await api.get<User>('/auth/me');
          set({ user: data, isAuthenticated: true, error: null });
        } catch {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          set({ user: null, isAuthenticated: false });
        } finally {
          set({ isLoading: false });
        }
      },

      setSession: async (accessToken, refreshToken) => {
        storeTokens(accessToken, refreshToken);
        await get().fetchUser();
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
    },
  ),
);
