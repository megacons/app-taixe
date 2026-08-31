import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Hiển thị notification kể cả khi app đang foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

/**
 * Xin quyền notification
 * Local notifications hoạt động trong Expo Go (không cần build)
 */
export async function registerForPushNotifications(): Promise<void> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notif] Permission not granted');
    return;
  }

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
    });

    await Notifications.setNotificationChannelAsync('requests', {
      name: 'Yêu cầu tài xế',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500],
      lightColor: '#f8b30e',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  }

  console.log('[Notif] Permissions granted, local notifications ready');
}

/**
 * Hiển thị local notification ngay lập tức
 * Hoạt động trong Expo Go khi app đang mở hoặc background
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
        data:  data ?? {},
        color: '#163797',
        priority: Notifications.AndroidNotificationPriority.MAX,
        // iOS specific
        subtitle: data?.type ?? undefined,
      },
      trigger: null, // ngay lập tức
    });
    console.log('[Notif] Shown:', title);
  } catch (err) {
    console.warn('[Notif] Error:', err);
  }
}
