import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  useWindowDimensions,
  Alert,
  ActivityIndicator,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import { captureRef } from 'react-native-view-shot';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { RootStackParamList } from '@/navigation';
import { useCompanyConfig } from '@/hooks/useCompanyConfig';

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// 14 function buttons
// Buttons cho tài xế (driver)
const FUNCTIONS_DRIVER = [
  { id: 'add_trip',   label: 'Nhật trình xe', icon: '🚛', route: 'AddTrip',         color: Colors.primary },
  { id: 'finance',    label: 'Quỹ',            icon: '💰', route: 'Finance',          color: Colors.primary },
  { id: 'salary',     label: 'Tạm ứng',        icon: '💵', route: 'SalaryAdvance',    color: Colors.primary },
  { id: 'reward',     label: 'Khen thưởng',   icon: '🏆', route: 'RewardList',       color: Colors.primary },
  { id: 'discipline', label: 'Kỷ luật',       icon: '⚠️', route: 'DisciplineList',   color: '#c0392b' },
  { id: 'attendance', label: 'Đổi giờ',       icon: '🕐', route: 'AttendanceAdjust', color: Colors.primary },
  { id: 'leave',      label: 'Nghỉ phép',     icon: '🏖️', route: 'LeaveRequest',     color: Colors.primary },
  { id: 'history',    label: 'Lịch sử',       icon: '📅', route: 'RequestHistory',   color: Colors.primary },
  { id: 'profile',    label: 'Hồ sơ',         icon: '👤', route: 'Profile',          color: Colors.primary },
];

// Buttons cho nhân viên (employee) — thay Nhật trình xe bằng Chấm công
const FUNCTIONS_EMPLOYEE = [
  { id: 'attendance_checkin', label: 'Chấm công',  icon: '📍', route: 'Attendance',       color: Colors.success },
  { id: 'adj_time',           label: 'Đổi giờ',    icon: '🕐', route: 'AttendanceAdjust', color: Colors.primary },
  { id: 'salary',             label: 'Tạm ứng',    icon: '💵', route: 'SalaryAdvance',    color: Colors.primary },
  { id: 'reward',             label: 'Khen thưởng', icon: '🏆', route: 'RewardList',      color: Colors.primary },
  { id: 'discipline',         label: 'Kỷ luật',    icon: '⚠️', route: 'DisciplineList',  color: '#c0392b' },
  { id: 'leave',              label: 'Nghỉ phép',  icon: '🏖️', route: 'LeaveRequest',    color: Colors.primary },
  { id: 'history',            label: 'Lịch sử',    icon: '📅', route: 'RequestHistory',  color: Colors.primary },
  { id: 'profile',            label: 'Hồ sơ',      icon: '👤', route: 'Profile',          color: Colors.primary },
];

// Fake weekly chart data — will be replaced by API
const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const CHART_HEIGHTS = [40, 65, 50, 85, 70, 95, 30]; // %

interface DailySummary {
  total_trips: number;
  total_income: number;
  total_expense: number;
  overtime_trips: number;
  overtime_pay: number;
  work_hours: number;
}

export default function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuthStore();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const [summary, setSummary]             = useState<DailySummary | null>(null);
  const [refreshing, setRefreshing]       = useState(false);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [weeklyData, setWeeklyData]       = useState<{ day: string; trips: number; height: number; dateStr: string; isFuture: boolean }[]>([]);
  const [monthlyTrips, setMonthlyTrips]   = useState(0);
  const [fundRemaining, setFundRemaining] = useState<number | null>(null);
  const [licensePlate, setLicensePlate]   = useState<string>('---');
  const [vehicleStatus, setVehicleStatus] = useState<string>('active');
  const [weekOffset, setWeekOffset]       = useState(0);
  const { companyName, logoUrl: companyLogoUrl } = useCompanyConfig();
  const FUNCTIONS = user?.role === 'employee' ? FUNCTIONS_EMPLOYEE : FUNCTIONS_DRIVER;

  const fetchDailySummary = useCallback(async () => {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const res = await api.get('/trips/summary/daily', { params: { date: today } });
      setSummary(res.data.data);
    } catch (_) {}
  }, []);

  // Lấy biển số xe được admin gán
  const fetchLicensePlate = useCallback(async () => {
    try {
      const res = await api.get('/drivers/profile/me');
      const plate  = res.data.data?.vehicle_id?.license_plate;
      const status = res.data.data?.vehicle_id?.status;
      setLicensePlate(plate || '---');
      setVehicleStatus(status || 'active');
    } catch (_) {}
  }, []);

  // Lấy dữ liệu 7 ngày của tuần (có offset để xem tuần trước)
  const fetchWeeklyData = useCallback(async (offset = 0) => {
    try {
      const dayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      let maxTrips = 1;
      const results = [];

      let driverId: string | null = null;
      try {
        const driverRes = await api.get('/drivers/profile/me');
        driverId = driverRes.data.data?._id ?? null;
      } catch (_) {}

      const today      = new Date();
      const todayStr   = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const dayOfWeek  = today.getDay();
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      // T2 của tuần hiện tại + offset tuần
      const weekMonday = new Date(today);
      weekMonday.setDate(today.getDate() - daysSinceMonday + offset * 7);

      for (let i = 0; i < 7; i++) {
        const d = new Date(weekMonday);
        d.setDate(weekMonday.getDate() + i);
        const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        const label   = dayLabels[d.getDay()];
        const isFuture = dateStr > todayStr;

        if (isFuture) {
          results.push({ day: label, trips: 0, dateStr, isFuture: true });
          continue;
        }
        try {
          const params: any = { date: dateStr };
          if (driverId) params.driverId = driverId;
          const r = await api.get('/trips/summary/daily', { params });
          const trips = r.data.data?.total_trips ?? 0;
          results.push({ day: label, trips, dateStr, isFuture: false });
          if (trips > maxTrips) maxTrips = trips;
        } catch {
          results.push({ day: label, trips: 0, dateStr, isFuture: false });
        }
      }

      const withHeight = results.map(r => ({
        ...r,
        height: (!r.isFuture && maxTrips > 0)
          ? Math.max(8, Math.round((r.trips / maxTrips) * 100))
          : 4,
      }));
      setWeeklyData(withHeight);
    } catch (_) {}
  }, []);

  // Lấy tổng chuyến tháng của tài xế hiện tại
  const fetchMonthlyTrips = useCallback(async () => {
    try {
      const now = new Date();
      // Lấy driverId
      let driverId: string | null = null;
      try {
        const driverRes = await api.get('/drivers/profile/me');
        driverId = driverRes.data.data?._id ?? null;
      } catch (_) {}

      const params: any = {
        month: now.getMonth() + 1,
        year:  now.getFullYear(),
        limit: 1,
      };
      if (driverId) params.driverId = driverId;

      const monthRes = await api.get('/trips', { params });
      setMonthlyTrips(monthRes.data.data?.pagination?.total ?? 0);
    } catch (_) {}
  }, []);

  // Lấy quỹ còn lại
  const fetchFundRemaining = useCallback(async () => {
    try {
      const now = new Date();
      const res = await api.get('/fund/me/entries', {
        params: { month: now.getMonth() + 1, year: now.getFullYear() },
      });
      const totals = res.data.data?.totals;
      if (totals) setFundRemaining(totals.expense ?? 0);
    } catch (_) {}
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications', { params: { limit: 1 } });
      setUnreadCount(res.data.data?.unread ?? 0);
    } catch (_) {}
  }, []);

  // Refresh badge mỗi khi màn hình được focus (quay lại từ NotificationsScreen)
  useFocusEffect(
    useCallback(() => {
      fetchUnreadCount();
    }, [fetchUnreadCount])
  );

  useEffect(() => {
    fetchDailySummary();
    fetchWeeklyData(0);
    fetchMonthlyTrips();
    fetchFundRemaining();
    fetchUnreadCount();
    fetchLicensePlate();

    // Realtime: lắng nghe notification mới → tăng badge ngay lập tức
    let socket: any = null;
    try {
      const { io } = require('socket.io-client');
      const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';
      socket = io(BASE_URL, { transports: ['websocket', 'polling'], reconnectionAttempts: 5 });
      socket.on('connect', () => {
        const { useAuthStore } = require('@/stores/authStore');
        const userId = useAuthStore.getState().user?._id;
        if (userId) socket.emit('join:user', userId);
      });
      socket.on('notification', () => {
        setUnreadCount(prev => prev + 1);
      });
    } catch (_) {}

    // Lắng nghe khi user đọc thông báo → giảm badge
    const notifReadSub = DeviceEventEmitter.addListener('NOTIF_READ', () => {
      fetchUnreadCount();
    });

    return () => {
      if (socket) socket.disconnect();
      notifReadSub.remove();
    };
  }, []);

  // Khi đổi tuần
  useEffect(() => {
    fetchWeeklyData(weekOffset);
  }, [weekOffset]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchDailySummary(),
      fetchWeeklyData(weekOffset),
      fetchMonthlyTrips(),
      fetchFundRemaining(),
      fetchUnreadCount(),
      fetchLicensePlate(),
    ]);
    setRefreshing(false);
  };

  const formatCurrency = (val: number) => {
    const abs = Math.abs(val);
    const formatted = new Intl.NumberFormat('vi-VN').format(abs);
    return `${val < 0 ? '-' : ''}${formatted}đ`;
  };

  const handleNav = (route: string) => {
    if (route === 'Trips') {
      navigation.navigate('Main' as any);
    } else if (route === 'AddTrip') {
      // Kiểm tra xe trước khi tạo nhật trình
      if (licensePlate === '---' || !licensePlate) {
        Alert.alert(
          '⚠️ Chưa có xe',
          'Bạn chưa được gán xe. Vui lòng liên hệ quản lý để được phân công xe trước khi tạo nhật trình.',
          [{ text: 'Đã hiểu', style: 'default' }]
        );
        return;
      }
      if (vehicleStatus === 'maintenance') {
        Alert.alert(
          '🔧 Xe đang bảo dưỡng',
          `Xe ${licensePlate} đang trong quá trình bảo dưỡng. Vui lòng liên hệ quản lý để được hỗ trợ.`,
          [{ text: 'Đã hiểu', style: 'default' }]
        );
        return;
      }
      if (vehicleStatus === 'inactive' || vehicleStatus === 'broken') {
        Alert.alert(
          '⛔ Xe không hoạt động',
          `Xe ${licensePlate} hiện không hoạt động. Vui lòng liên hệ quản lý để được hỗ trợ.`,
          [{ text: 'Đã hiểu', style: 'default' }]
        );
        return;
      }
      navigation.navigate(route as any);
    } else {
      navigation.navigate(route as any);
    }
  };

  const chartBarWidth = (SCREEN_WIDTH - 32 - 6 * 8) / 7;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* ─── HEADER ─── */}
      <View style={styles.header}>
        {/* Brand + notification */}
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <View style={styles.logoBox}>
              {companyLogoUrl ? (
                <Image source={{ uri: companyLogoUrl }} style={styles.logoImage} resizeMode="contain" />
              ) : (
                <Text style={styles.logoText}>🚛</Text>
              )}
            </View>
            <Text style={styles.brandName}>{companyName}</Text>
          </View>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Text style={styles.notifIcon}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Driver info card */}
        <TouchableOpacity
          style={styles.driverCard}
          onPress={() => navigation.navigate('Profile' as any)}
          activeOpacity={0.85}
        >
          <View style={styles.avatarContainer}>
            {user?.avatar ? (
              <Image
                key={user.avatar}
                source={{ uri: user.avatar.startsWith('http') ? user.avatar : `${BASE_URL}${user.avatar}` }}
                style={styles.avatar}
                onError={() => {}}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{user?.name?.charAt(0)?.toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.onlineIndicator} />
          </View>
          <View style={styles.driverInfo}>
            <Text style={styles.driverName}>{user?.name || 'Tài xế'}</Text>
            <Text style={styles.licensePlate}>
              Biển số: <Text style={styles.licensePlateValue}>{licensePlate}</Text>
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ─── KPI CARDS ─── */}
        {user?.role !== 'employee' ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Chỉ số vận hành hôm nay</Text>
            </View>
            <View style={styles.kpiRow}>
              <KPICard
                icon="🚛"
                label="Số chuyến hôm nay"
                value={String(summary?.total_trips ?? 0)}
                sub={summary && summary.overtime_trips > 0 ? `+${summary.overtime_trips} tăng ca` : undefined}
                onPress={() => navigation.navigate('TodayTrips' as any)}
              />
              <KPICard
                icon="📦"
                label="Tổng chuyến tháng"
                value={String(monthlyTrips)}
                onPress={() => {
                  const now = new Date();
                  navigation.navigate('TodayTrips' as any, {
                    month: now.getMonth() + 1,
                    year:  now.getFullYear(),
                  });
                }}
              />
              <KPICard
                icon="💸"
                label="Đã chi"
                value={fundRemaining === null ? '—' : formatCurrency(fundRemaining)}
                valueColor={Colors.error}
                onPress={() => navigation.navigate('Finance' as any)}
              />
            </View>
          </>
        ) : (
          <EmployeeKPICard onPress={() => navigation.navigate('Attendance' as any)} />
        )}

        {/* ─── WEEKLY CHART — chỉ hiển thị cho tài xế ─── */}
        {user?.role !== 'employee' && (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Số chuyến 7 ngày</Text>
            <View style={styles.weekNav}>
              <TouchableOpacity
                style={styles.weekNavBtn}
                onPress={() => setWeekOffset(w => w - 1)}
              >
                <Text style={styles.weekNavArrow}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.weekNavLabel}>
                {(() => {
                  const today = new Date();
                  const dow   = today.getDay();
                  const diff  = dow === 0 ? 6 : dow - 1;
                  const mon   = new Date(today);
                  mon.setDate(today.getDate() - diff + weekOffset * 7);
                  const sun   = new Date(mon);
                  sun.setDate(mon.getDate() + 6);
                  const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
                  return `${fmt(mon)} - ${fmt(sun)}`;
                })()}
              </Text>
              <TouchableOpacity
                style={[styles.weekNavBtn, weekOffset >= 0 && styles.weekNavBtnDisabled]}
                onPress={() => { if (weekOffset < 0) setWeekOffset(w => w + 1); }}
                disabled={weekOffset >= 0}
              >
                <Text style={[styles.weekNavArrow, weekOffset >= 0 && { color: Colors.gray300 }]}>›</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.chartTotal}>
              {weeklyData.reduce((s, d) => s + d.trips, 0)}
            </Text>
          </View>

          {/* Bars — số chuyến hiển thị bên trong cột, căn trên */}
          <View style={styles.chartBody}>
            {(weeklyData.length > 0
              ? weeklyData
              : ['T2','T3','T4','T5','T6','T7','CN'].map(day => ({ day, trips: 0, height: 4, dateStr: '', isFuture: false }))
            ).map((item, i) => {
              const isToday  = item.dateStr === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
              const isFuture = (item as any).isFuture;
              const barH = Math.max(item.height, 20);
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.barWrapper}
                  onPress={() => {
                    if (!isFuture && item.dateStr)
                      navigation.navigate('TodayTrips' as any, { date: item.dateStr });
                  }}
                  activeOpacity={isFuture ? 1 : 0.7}
                >
                  <View style={[
                    styles.bar,
                    { height: `${barH}%` },
                    isToday  && styles.barActive,
                    isFuture && { opacity: 0.2 },
                  ]}>
                    {item.trips > 0 && (
                      <Text style={[
                        styles.barInsideLabel,
                        isToday && { color: Colors.gray900 },
                      ]}>
                        {item.trips}
                      </Text>
                    )}
                  </View>
                  <Text style={[
                    styles.barLabel,
                    isToday  && { color: Colors.accentDark, fontWeight: '800' },
                    isFuture && { opacity: 0.4 },
                  ]}>
                    {item.day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        )}

        {/* ─── FUNCTION BUTTONS ─── */}
        <View style={styles.gridContainer}>
          {FUNCTIONS.map(fn => (
            <TouchableOpacity
              key={fn.id}
              style={styles.gridItem}
              onPress={() => handleNav(fn.route)}
              activeOpacity={0.75}
            >
              <View style={[styles.iconCircle, fn.id === 'discipline' && styles.iconCircleRed]}>
                <Text style={styles.gridIcon}>{fn.icon}</Text>
              </View>
              <Text style={styles.gridLabel} numberOfLines={2}>
                {fn.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function KPICard({ icon, label, value, sub, valueColor, onPress }: {
  icon: string; label: string; value: string; sub?: string;
  valueColor?: string; onPress?: () => void;
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={kpiStyles.card} onPress={onPress} activeOpacity={0.75}>
      <Text style={kpiStyles.icon}>{icon}</Text>
      <Text style={kpiStyles.label}>{label}</Text>
      <Text
        style={[kpiStyles.value, valueColor ? { color: valueColor } : {}]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >{value}</Text>
      {sub && <Text style={kpiStyles.sub}>{sub}</Text>}
      {onPress && <Text style={{ fontSize: 10, color: Colors.primary, marginTop: 2 }}>→</Text>}
    </Wrapper>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 3,
  },
  icon: { fontSize: 22, marginBottom: 4 },
  label: { fontSize: 11, color: Colors.gray500, textAlign: 'center', fontWeight: '500' },
  value: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginTop: 2 },
  sub: { fontSize: 10, color: Colors.success, marginTop: 2, fontWeight: '600' },
});

// KPI card đặc biệt cho nhân viên — hiển thị trạng thái chấm công hôm nay
function EmployeeKPICard({ onPress }: { onPress: () => void }) {
  const { companyName } = useCompanyConfig();
  const [status,       setStatus]       = useState<'none' | 'checked_in' | 'checked_out'>('none');
  const [checkInTime,  setCheckInTime]  = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [checking,     setChecking]     = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; time: string; date: string; weekday: string; coords: string } | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ uri: string; address: string } | null>(null);
  const watermarkRef = useRef<View>(null);

  const loadToday = () => {
    api.get('/attendance/today').then(r => {
      const d = r.data.data;
      if (!d) { setStatus('none'); return; }
      const sessions = d.sessions?.length > 0 ? d.sessions : null;
      const openSession = sessions?.find((s: any) => s.check_in_time && !s.check_out_time);
      const firstCin = sessions?.[0]?.check_in_time ?? d.check_in_time;
      const lastCout = sessions ? sessions.filter((s: any) => s.check_out_time).slice(-1)[0]?.check_out_time : d.check_out_time;
      if (openSession || d.status === 'checked_in') { setStatus('checked_in'); setCheckInTime(firstCin); setCheckOutTime(null); }
      else if (lastCout || d.status === 'checked_out') { setStatus('checked_out'); setCheckInTime(firstCin); setCheckOutTime(lastCout); }
      else setStatus('none');
    }).catch(() => {});
  };

  useEffect(() => { loadToday(); }, []);

  // Watermark → submit
  useEffect(() => {
    if (!pendingPhoto || !watermarkRef.current) return;
    const t = setTimeout(async () => {
      try {
        const composited = await captureRef(watermarkRef, { format: 'jpg', quality: 0.88 });
        await doCheckIn(composited);
      } catch { await doCheckIn(pendingPhoto.uri); }
      finally { setPendingPhoto(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [pendingPhoto]);

  const applyWatermark = async (rawUri: string) => {
    const now = new Date();
    let addressText = '';
    try {
      const { status: ps } = await Location.requestForegroundPermissionsAsync();
      if (ps === 'granted') {
        let pos: Location.LocationObject | null = null;
        try {
          pos = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, maximumAge: 30000 }),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('t')), 10000)),
          ]) as Location.LocationObject;
        } catch { pos = await Location.getLastKnownPositionAsync(); }
        if (pos) {
          try {
            const results = await Location.reverseGeocodeAsync({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
            if (results.length > 0) {
              const rg = results[0];
              // Build địa chỉ đầy đủ: số nhà + đường + phường/xã + quận/huyện + tỉnh/thành
              const parts = [
                rg.streetNumber && rg.street ? `${rg.streetNumber} ${rg.street}` : rg.street,
                rg.subregion ?? rg.district,
                rg.city ?? rg.region,
              ].filter(Boolean);
              if (parts.length > 0) {
                addressText = parts.join(', ');
              } else {
                // Dùng name nếu có (tên địa danh)
                addressText = rg.name ?? rg.formattedAddress ?? `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
              }
            } else {
              addressText = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
            }
          } catch {
            addressText = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          }
        } else {
          addressText = 'Không xác định vị trí';
        }
      } else {
        addressText = 'Chưa cấp quyền vị trí';
      }
    } catch {
      addressText = 'Lỗi lấy vị trí';
    }
    // Hiện preview với địa chỉ để user xác nhận trước khi gửi
    setPreviewPhoto({ uri: rawUri, address: addressText });
    setChecking(false);
  };

  // User xác nhận từ preview → tạo watermark và gửi
  const confirmCheckIn = () => {
    if (!previewPhoto) return;
    setChecking(true);
    const now = new Date();
    setPendingPhoto({
      uri:     previewPhoto.uri,
      time:    format(now, 'HH:mm'),
      date:    format(now, 'dd/MM/yyyy'),
      weekday: format(now, 'EEEE', { locale: vi }),
      coords:  previewPhoto.address,
    });
    setPreviewPhoto(null);
  };

  const doCheckIn = async (photoUri: string) => {
    try {
      const fd = new FormData();
      fd.append('photo', { uri: photoUri, type: 'image/jpeg', name: 'checkin.jpg' } as any);
      if (pendingPhoto?.coords) {
        fd.append('address', pendingPhoto.coords);
      }
      await api.post('/attendance/checkin', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30000 });
      const addr = pendingPhoto?.coords;
      Alert.alert('✅ Chấm vào thành công!', addr ? `📍 ${addr}` : 'Chấm công thành công');
      loadToday();
    } catch (e: any) { Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể chấm vào'); }
    finally { setChecking(false); }
  };

  const handleCheckIn = () => {
    Alert.alert('Chấm vào ca', 'Chọn cách chụp ảnh xác nhận', [
      { text: 'Chụp ảnh', onPress: async () => {
        const { status: cs } = await Camera.requestCameraPermissionsAsync();
        if (cs !== 'granted') { Alert.alert('Cần quyền camera'); return; }
        const res = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.85 });
        if (!res.canceled) { setChecking(true); await applyWatermark(res.assets[0].uri); }
      }},
      { text: 'Chọn ảnh', onPress: async () => {
        const res = await ImagePicker.launchImageLibraryAsync({ allowsEditing: false, quality: 0.85 });
        if (!res.canceled) { setChecking(true); await applyWatermark(res.assets[0].uri); }
      }},
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const handleCheckOut = () => {
    Alert.alert('Chấm ra ca', 'Xác nhận chấm ra ca?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xác nhận', onPress: async () => {
        setChecking(true);
        try {
          await api.post('/attendance/checkout');
          Alert.alert('✅ Chấm ra thành công!');
          loadToday();
        } catch (e: any) { Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể chấm ra'); }
        finally { setChecking(false); }
      }},
    ]);
  };

  const fmtT = (iso?: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
  };

  const checkedIn = status === 'checked_in';

  return (
    <>
      <View style={[empKpiStyles.card, { borderColor: checkedIn ? Colors.error : Colors.success }]}>
        <View style={empKpiStyles.row}>
          <Text style={empKpiStyles.shiftName}>Ca VP</Text>
          <Text style={empKpiStyles.shiftHours}>08:00 – 17:00</Text>
        </View>
        {(checkInTime || checkOutTime) && (
          <Text style={empKpiStyles.sub}>
            {[
              checkInTime  ? `Vào ${fmtT(checkInTime)}`  : null,
              checkOutTime ? `Ra ${fmtT(checkOutTime)}`   : null,
            ].filter(Boolean).join(' · ')}
          </Text>
        )}

        {/* Hiện địa chỉ realtime sau khi chụp — trước khi gửi */}
        {previewPhoto && (
          <View style={empKpiStyles.addrPreview}>
            <Text style={empKpiStyles.addrIcon}>📍</Text>
            <Text style={empKpiStyles.addrText} numberOfLines={2}>{previewPhoto.address}</Text>
          </View>
        )}

        <View style={empKpiStyles.actionRow}>
          <TouchableOpacity
            style={[empKpiStyles.pill, checkedIn
              ? { backgroundColor: '#ffecec', borderColor: Colors.error }
              : { backgroundColor: '#edfaf5', borderColor: Colors.success }]}
            onPress={checkedIn ? handleCheckOut : (previewPhoto ? confirmCheckIn : handleCheckIn)}
            disabled={checking}
            activeOpacity={0.8}
          >
            {checking
              ? <ActivityIndicator color={checkedIn ? Colors.error : Colors.success} size="small" />
              : previewPhoto
              ? <Text style={[empKpiStyles.pillText, { color: Colors.success }]}>✅ Xác nhận gửi</Text>
              : <Text style={[empKpiStyles.pillText, { color: checkedIn ? Colors.error : Colors.success }]}>
                  {checkedIn ? 'Ra ca' : 'Vào ca'}
                </Text>
            }
          </TouchableOpacity>
          {previewPhoto ? (
            <TouchableOpacity
              style={[empKpiStyles.gpsBtn, { borderColor: Colors.error }]}
              onPress={() => { setPreviewPhoto(null); setChecking(false); }}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[empKpiStyles.gpsBtn, { borderColor: Colors.success }]} onPress={onPress} activeOpacity={0.8}>
              <Text style={{ fontSize: 18 }}>📍</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {/* Hidden watermark compositor */}
      {pendingPhoto && (
        <View ref={watermarkRef} collapsable={false}
          style={{ position: 'absolute', top: -9999, left: 0, width: 360, height: 480 }}
        >
          <Image source={{ uri: pendingPhoto.uri }} style={{ width: 360, height: 480 }} resizeMode="cover" />
          <View style={WM.box}>
            <View style={WM.left}><Text style={WM.time}>{pendingPhoto.time}</Text></View>
            <View style={WM.divider} />
            <View style={WM.right}>
              <Text style={WM.date}>{pendingPhoto.date}</Text>
              <Text style={WM.weekday}>{pendingPhoto.weekday}</Text>
              {pendingPhoto.coords ? <Text style={WM.coords}>📍 {pendingPhoto.coords}</Text> : null}
            </View>
          </View>
          <View style={WM.brand}><Text style={WM.brandText}>{companyName}</Text></View>
        </View>
      )}
    </>
  );
}

const WM = StyleSheet.create({
  box:       { position: 'absolute', bottom: 16, left: 12, right: 12, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 6, padding: 10, alignItems: 'center', gap: 10 },
  left:      { justifyContent: 'center' },
  time:      { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  divider:   { width: 1.5, height: 48, backgroundColor: 'rgba(255,255,255,0.4)', marginHorizontal: 4 },
  right:     { flex: 1 },
  date:      { fontSize: 13, fontWeight: '700', color: '#fff' },
  weekday:   { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  coords:    { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  brand:     { position: 'absolute', bottom: 6, right: 12 },
  brandText: { fontSize: 10, fontWeight: '700', color: '#fbbd23' },
});

const empKpiStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  shiftName:  { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  shiftHours: { fontSize: 13, color: Colors.gray500 },
  sub:        { fontSize: 12, color: Colors.gray500, marginBottom: 4 },
  actionRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  pill: {
    flex: 1,
    borderRadius: 30,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: 'center',
  },
  pillText:   { fontSize: 15, fontWeight: '700' },
  gpsBtn: {
    width: 44, height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  addrPreview: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.gray50, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.success + '40',
  },
  addrIcon:    { fontSize: 13, marginTop: 1 },
  addrText:    { flex: 1, fontSize: 12, color: Colors.gray700, lineHeight: 18 },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.primary },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingBottom: 16 },

  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, marginBottom: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox: { width: 36, height: 36, backgroundColor: Colors.accent, borderRadius: 10, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  logoText: { fontSize: 18 },
  logoImage: { width: 36, height: 36, borderRadius: 10 },
  brandName: { fontSize: 20, fontWeight: '800', color: Colors.white },
  notifBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  notifIcon: { fontSize: 20 },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2 },
  badgeText: { color: Colors.white, fontSize: 9, fontWeight: '700' },

  driverCard: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  avatarContainer: { position: 'relative', marginRight: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2.5, borderColor: Colors.accent },
  avatarFallback: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primaryDark, borderWidth: 2.5, borderColor: Colors.accent, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 22, fontWeight: '700', color: Colors.white },
  onlineIndicator: { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.success, borderWidth: 2, borderColor: Colors.primary },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 18, fontWeight: '700', color: Colors.white },
  licensePlate: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 3, fontWeight: '500' },
  licensePlateValue: { color: Colors.accent, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success, marginRight: 6 },
  statusText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },

  scrollView: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },

  sectionHeader: { marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray900 },

  kpiRow: { flexDirection: 'row', marginBottom: 16 },

  chartCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  chartTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  chartTotal: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  weekNav:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekNavBtn:      { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.gray100, justifyContent: 'center', alignItems: 'center' },
  weekNavBtnDisabled: { opacity: 0.4 },
  weekNavArrow:    { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 22 },
  weekNavLabel:    { fontSize: 12, fontWeight: '600', color: Colors.gray600, minWidth: 76, textAlign: 'center' },
  chartLabelRow: { flexDirection: 'row', marginBottom: 2 },
  chartLabelCell: { flex: 1, alignItems: 'center' },
  chartBody: { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 4, marginTop: 0 },
  barWrapper: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 2 },
  bar: { width: '100%', backgroundColor: Colors.primary, borderRadius: 4, opacity: 0.75, overflow: 'hidden' },
  barActive: { opacity: 1, backgroundColor: Colors.accent },
  barLabel: { fontSize: 10, color: Colors.gray500, fontWeight: '600' },
  barInsideLabel: {
    fontSize: 10, fontWeight: '800', color: Colors.white,
    textAlign: 'center', paddingTop: 3, width: '100%',
  },

  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: {
    width: '22%',
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 110,
    justifyContent: 'center',
    gap: 8,
  },
  iconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(22,55,151,0.08)', justifyContent: 'center', alignItems: 'center' },
  iconCircleRed: { backgroundColor: 'rgba(192,57,43,0.1)' },
  gridIcon: { fontSize: 26 },
  gridLabel: { fontSize: 11, fontWeight: '600', color: Colors.gray900, textAlign: 'center', lineHeight: 15 },
});


