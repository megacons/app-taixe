import { useEffect, useRef } from 'react';
import { fetchCompanyConfig } from './src/hooks/useCompanyConfig';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DeviceEventEmitter, AppState } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { io, Socket } from 'socket.io-client';
import Navigation from './src/navigation';
import { useAuthStore } from './src/stores/authStore';
import ErrorBoundary from './src/components/ErrorBoundary';
import {
  registerForPushNotifications,
  showLocalNotification,
} from './src/lib/notifications';

SplashScreen.preventAutoHideAsync();

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

export default function App() {
  const logout    = useAuthStore(s => s.logout);
  const user      = useAuthStore(s => s.user);
  const socketRef = useRef<Socket | null>(null);

  // ── Xin quyền local notification ──
  useEffect(() => {
    registerForPushNotifications();
    fetchCompanyConfig(); // load tên công ty
  }, []);

  // ── Socket.io ──
  const joinRooms = (socket: Socket, userId: string, role: string) => {
    socket.emit('join:user', userId);
    if (role !== 'driver') {
      socket.emit('join:admin');
      console.log('[Socket] Joined admin room');
    }
  };

  useEffect(() => {
    if (!user?._id) return;

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket = io(BASE_URL, {
      transports: ['polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      joinRooms(socket, user._id, user.role);
    });

    socket.on('connect_error', err => {
      console.warn('[Socket] Error:', err.message);
    });

    socket.on('reconnect', () => {
      joinRooms(socket, user._id, user.role);
    });

    // ── ADMIN: nhận yêu cầu mới từ tài xế ──
    socket.on('new:request', (data: any) => {
      if (user.role === 'driver') return;
      DeviceEventEmitter.emit('NEW_REQUEST', data);
      // Hiện local notification kể cả khi app background
      showLocalNotification(
        '🔔 Yêu cầu mới',
        `${data.driver_name ?? 'Tài xế'}: ${data.title ?? 'Có yêu cầu mới cần xử lý'}`,
        { type: 'new_request', request_id: data._id },
        'requests'
      );
    });

    socket.on('request:updated', (data: any) => {
      DeviceEventEmitter.emit('REQUEST_UPDATED', data ?? {});
    });

    // ── DRIVER: nhận kết quả duyệt ──
    socket.on('request:approved', (data: any) => {
      DeviceEventEmitter.emit('REQUEST_UPDATED', data);
      showLocalNotification(
        '✅ Yêu cầu được duyệt',
        `"${data.title ?? 'Yêu cầu của bạn'}" đã được duyệt`,
        { type: 'request_approved', request_id: data._id },
        'requests'
      );
    });

    socket.on('request:rejected', (data: any) => {
      DeviceEventEmitter.emit('REQUEST_UPDATED', data);
      showLocalNotification(
        '❌ Yêu cầu bị từ chối',
        `"${data.title ?? 'Yêu cầu của bạn'}" đã bị từ chối`,
        { type: 'request_rejected', request_id: data._id },
        'requests'
      );
    });

    // ── TẤT CẢ: nhận thông báo broadcast từ admin ──
    socket.on('notification', (data: any) => {
      DeviceEventEmitter.emit('REQUEST_UPDATED', {});
      if (data?.title) {
        showLocalNotification(
          data.title,
          data.message ?? data.body ?? '',
          { type: data.type ?? 'broadcast' },
          'default'
        );
      }
    });

    // Re-join khi app về foreground
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active' && socket.connected) {
        joinRooms(socket, user._id, user.role);
      }
    });

    return () => {
      appStateSub.remove();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?._id, user?.role]);

  // ── Auto logout khi token hết hạn ──
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('TOKEN_EXPIRED', async () => {
      await logout();
    });
    setTimeout(() => SplashScreen.hideAsync(), 1000);
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#163797" />
        <Navigation />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
