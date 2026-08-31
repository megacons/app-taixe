import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Update this with your server IP for local network
const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async config => {
    const token = await AsyncStorage.getItem('@auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

// Flag để tránh nhiều request refresh cùng lúc
let isRefreshing = false;
let failedQueue: { resolve: (v: any) => void; reject: (e: any) => void }[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

// Response interceptor - auto refresh token
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    // Chỉ handle 401 và chưa retry
    if (error.response?.status === 401 && !originalRequest._retry) {

      // Nếu đang refresh thì queue request lại
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await AsyncStorage.getItem('@refresh_token');

        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        // Gọi refresh token endpoint
        const res = await axios.post(`${BASE_URL}/api/auth/refresh`, {
          refreshToken,
        });

        const { token: newToken, refreshToken: newRefreshToken } = res.data.data;

        // Lưu token mới
        await AsyncStorage.setItem('@auth_token', newToken);
        if (newRefreshToken) {
          await AsyncStorage.setItem('@refresh_token', newRefreshToken);
        }

        // Update default header
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;

        processQueue(null, newToken);
        isRefreshing = false;

        // Retry request gốc với token mới
        return api(originalRequest);

      } catch (refreshError) {
        // Refresh thất bại → logout
        processQueue(refreshError, null);
        isRefreshing = false;

        await AsyncStorage.multiRemove(['@auth_token', '@refresh_token', '@user']);

        // Thông báo cho app để navigate về Login
        // Import NavigationService nếu cần, hoặc dùng event
        const { DeviceEventEmitter } = require('react-native');
        DeviceEventEmitter.emit('TOKEN_EXPIRED');

        return Promise.reject(refreshError);
      }
    }

    // Xử lý message lỗi tiếng Việt
    if (error.response?.data?.message) {
      error.message = error.response.data.message;
    }

    return Promise.reject(error);
  }
);

export default api;
