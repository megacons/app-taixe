import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Cấu hình handler — hiển thị notification kể cả khi app foreground
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

/**
 * Đăng ký push notification, xin quyền, lấy Expo Push Token
 * Trả về token string hoặc null nếu thất bại
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Chỉ hoạt động trên thiết bị thật (không phải simulator)
  if (!Device.isDevice) {
    console.warn('[Notif] Push notifications only work on physical devices');
    return null;
  }

  // Xin quyền
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowDisplayInCarPlay: false,
        allowCriticalAlerts: false,
        provideAppNotificationSettings: false,
        allowProvisional: false,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notif] Permission denied');
    return null;
  }

  // Tạo notification channels cho Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Nam Thành',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#163797',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });

    await Notifications.setNotificationChannelAsync('requests', {
      name: 'Yêu cầu tài xế',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500],
      lightColor: '#f8b30e',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  // Lấy Expo Push Token
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('[Notif] No projectId found in app config');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    console.log('[Notif] Expo Push Token:', token.slice(0, 30) + '...');
    return token;
  } catch (err) {
    console.warn('[Notif] Failed to get push token:', err);
    return null;
  }
}

/**
 * Hiển thị local notification ngay lập tức
 * Dùng khi cần show notification trong foreground (không qua server)
 */
export async function showLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
  channelId = 'requests'
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        data: data ?? {},
        color: '#163797',
        priority: Notifications.AndroidNotificationPriority.MAX,
        subtitle: data?.type ?? undefined,
      },
      trigger: null, // ngay lập tức
    });
  } catch (err) {
    console.warn('[Notif] Error showing local notification:', err);
  }
}
