import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '@/lib/api';

interface User {
  _id: string;
  name: string;
  phone: string;
  role: 'driver' | 'employee' | 'coordinator' | 'accountant' | 'manager';
  status: string;
  avatar: string | null;
  driver_id?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  setUser: (user: User) => void;
  setTokens: (token: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (phone: string, password: string) => {
    set({ isLoading: true });
    try {
      const res = await api.post('/auth/login', { phone, password });
      const { user, token, refreshToken } = res.data.data;

      // Store in AsyncStorage
      await AsyncStorage.setItem('@auth_token', token);
      await AsyncStorage.setItem('@refresh_token', refreshToken);
      await AsyncStorage.setItem('@user', JSON.stringify(user));

      set({
        user,
        token,
        refreshToken,
        isAuthenticated: true,
        isLoading: false,
      });

      // Set token in axios
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      const { refreshToken } = get();
      await api.post('/auth/logout', { refreshToken });
    } catch (_) {
      // Silent fail
    } finally {
      // Clear AsyncStorage
      await AsyncStorage.multiRemove(['@auth_token', '@refresh_token', '@user']);

      delete api.defaults.headers.common['Authorization'];
      set({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
      });
    }
  },

  loadStoredAuth: async () => {
    try {
      const [token, refreshToken, userJson] = await AsyncStorage.multiGet([
        '@auth_token',
        '@refresh_token',
        '@user',
      ]);

      if (token[1] && refreshToken[1] && userJson[1]) {
        const user = JSON.parse(userJson[1]);
        // Set ngay từ cache để UI hiện nhanh
        set({
          user,
          token: token[1],
          refreshToken: refreshToken[1],
          isAuthenticated: true,
        });
        api.defaults.headers.common['Authorization'] = `Bearer ${token[1]}`;

        // Fetch lại user mới nhất từ server (cập nhật avatar, name, v.v.)
        try {
          const res = await api.get('/auth/me');
          const freshUser = res.data.data ?? res.data.user;
          if (freshUser) {
            const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

            // Convert avatar relative → full URL
            if (freshUser.avatar && !freshUser.avatar.startsWith('http')) {
              freshUser.avatar = `${BASE_URL}${freshUser.avatar}`;
            }

            // Nếu server trả về cùng path với cache thì giữ cache URL (có ?t=)
            const cachedAvatar: string | null = user?.avatar ?? null;
            if (
              cachedAvatar &&
              freshUser.avatar &&
              cachedAvatar.split('?')[0] === freshUser.avatar.split('?')[0]
            ) {
              freshUser.avatar = cachedAvatar; // giữ ?t= để bypass image cache
            }

            set({ user: freshUser });
            await AsyncStorage.setItem('@user', JSON.stringify(freshUser));
          }
        } catch (_) {
          // Nếu fail (offline, token hết hạn) thì dùng cache
        }
      }
    } catch (_) {
      // Silent fail
    }
  },

  setUser: (user: User) => {
    set({ user });
    // Persist luôn vào AsyncStorage để reload không mất
    AsyncStorage.setItem('@user', JSON.stringify(user)).catch(() => {});
  },

  setTokens: (token: string, refreshToken: string) => {
    set({ token, refreshToken });
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  },
}));
