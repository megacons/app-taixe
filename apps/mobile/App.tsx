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

const TYPE_LABEL: Record<string, string> = {
  salary_advance:          'Tạm ứng lương',
  expense:                 'Chi phí',
  leave:                   'Nghỉ phép',
  purchase:                'Mua hàng',
  additional_trip:         'Thêm chuyến',
  attendance_adjustment:   'Điều chỉnh công',
  announcement:            'Thông báo',
  discipline:              'Kỷ luật',
  holiday:                 'Nghỉ lễ',
};

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
    socket.on('new:request', async (data: any) => {
      if (user.role === 'driver') return;
      // Chỉ show local khi foreground — background đã có Expo Push
      if (AppState.currentState === 'active') {
        const typeName = TYPE_LABEL[data.type] ?? data.type ?? 'Yêu cầu';
        await showLocalNotification(
          `🔔 Yêu cầu mới — ${typeName}`,
          `${data.driver_name ?? 'Tài xế'}: ${data.title}`,
          { type: 'new_request', ...data }
        );
      }
      DeviceEventEmitter.emit('NEW_REQUEST', data);
    });

    socket.on('request:updated', (data: any) => {
      DeviceEventEmitter.emit('REQUEST_UPDATED', data ?? {});
    });

    // ── DRIVER: nhận kết quả duyệt ──
    socket.on('request:approved', async (data: any) => {
      // Chỉ show local notification khi app foreground — background đã có Expo Push
      if (AppState.currentState === 'active') {
        await showLocalNotification(
          '✅ Yêu cầu được duyệt',
          `"${data.title}" đã được duyệt.`,
          { type: 'request_approved', ...data }
        );
      }
      DeviceEventEmitter.emit('REQUEST_UPDATED', data);
    });

    socket.on('request:rejected', async (data: any) => {
      if (AppState.currentState === 'active') {
        await showLocalNotification(
          '❌ Yêu cầu bị từ chối',
          `"${data.title}" bị từ chối.${data.reason ? ` Lý do: ${data.reason}` : ''}`,
          { type: 'request_rejected', ...data }
        );
      }
      DeviceEventEmitter.emit('REQUEST_UPDATED', data);
    });

    // ── TẤT CẢ: nhận thông báo broadcast từ admin ──
    socket.on('notification', async (data: any) => {
      // Chỉ show khi foreground — background đã có Expo Push từ server
      if (AppState.currentState !== 'active') return;
      const title = data?.title ?? 'Thông báo mới';
      const body  = data?.message
        ? String(data.message).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 120)
        : 'Bạn có thông báo mới';
      await showLocalNotification(title, body, { type: data?.type ?? 'announcement', ...data });
      DeviceEventEmitter.emit('REQUEST_UPDATED', {});
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
