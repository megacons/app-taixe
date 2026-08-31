import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  config => {
    const stored = localStorage.getItem('namthanh-auth');
    if (stored) {
      try {
        const { state } = JSON.parse(stored);
        if (state?.token) {
          config.headers.Authorization = `Bearer ${state.token}`;
        }
      } catch (_) {
        // ignore
      }
    }
    return config;
  },
  error => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const stored = localStorage.getItem('namthanh-auth');
        if (stored) {
          const { state } = JSON.parse(stored);
          if (state?.refreshToken) {
            const res = await axios.post('/api/auth/refresh', {
              refreshToken: state.refreshToken,
            });
            const { token } = res.data.data;

            // Update stored token
            const parsed = JSON.parse(stored);
            parsed.state.token = token;
            localStorage.setItem('namthanh-auth', JSON.stringify(parsed));

            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          }
        }
      } catch (_) {
        // Redirect to login
        localStorage.removeItem('namthanh-auth');
        window.location.href = '/login';
      }
    }

    const message = error.response?.data?.message || 'Có lỗi xảy ra';

    if (error.response?.status !== 401) {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default api;
