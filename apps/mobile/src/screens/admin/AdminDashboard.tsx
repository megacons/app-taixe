import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, DeviceEventEmitter, Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { useCompanyConfig } from '@/hooks/useCompanyConfig';
import DatePickerField from '@/components/DatePickerField';
import api from '@/lib/api';

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

const fmtVND = (v: number) =>
  v.toLocaleString('vi-VN');

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const { logoUrl: companyLogoUrl } = useCompanyConfig();
  const navigation = useNavigation<any>();
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kpi, setKpi] = useState({
    trips_today: 0, active_drivers: 0, pending_requests: 0,
    total_advance_month: 0, total_expense_month: 0, overtime_today: 0,
    trips_month: 0,
  });
  const [recentTrips, setRecentTrips] = useState<any[]>([]);
  const [filterDate, setFilterDate]   = useState('');
  const [filterDateObj, setFilterDateObj] = useState<Date>(new Date());
  const [showDateFilter, setShowDateFilter] = useState(false);
  // Filter mode: 'none' | 'month' | 'day'
  const [filterMode, setFilterMode]   = useState<'none' | 'month' | 'day'>('none');
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear,  setFilterYear]  = useState(new Date().getFullYear());
  const [filterDay,   setFilterDay]   = useState(new Date().getDate());
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterDateValue, setFilterDateValue] = useState<Date>(new Date());
  const [filterDateSelected, setFilterDateSelected] = useState(false);
  const [filterDriverId, setFilterDriverId] = useState('');
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [driverList, setDriverList] = useState<any[]>([]);

  // Load danh sách tài xế cho filter
  useEffect(() => {
    api.get('/drivers', { params: { status: 'active', limit: 100 } })
      .then(r => setDriverList(r.data.data?.drivers ?? []))
      .catch(() => {});
  }, []);

  const fetchRecentTrips = async (date?: string, month?: number, year?: number, driverId?: string) => {
    try {
      const params: any = { limit: 200, sort: '-trip_date' };
      if (date) {
        params.date = date;
      } else if (month && year) {
        params.month = month;
        params.year  = year;
      }
      if (driverId) params.driverId = driverId;
      const res = await api.get('/trips', { params });
      setRecentTrips(res.data.data?.trips ?? []);
    } catch (_) {}
  };

  const applyFilter = (mode: 'none' | 'month' | 'day', d?: number, m?: number, y?: number, drvId?: string) => {
    setFilterMode(mode);
    setShowFilterModal(false);
    const dm = m ?? filterMonth;
    const dy = y ?? filterYear;
    const dd = d ?? filterDay;
    const drv = drvId ?? filterDriverId;
    if (mode === 'none' && !drv) {
      setFilterDate('');
      setFilterDriverId('');
      fetchRecentTrips(undefined, undefined, undefined, '');
    } else if (mode === 'none' && drv) {
      // Chỉ filter theo tài xế, không có ngày
      setFilterDate('');
      fetchRecentTrips(undefined, undefined, undefined, drv);
    } else if (mode === 'month') {
      setFilterDate(`T${dm}/${dy}`);
      fetchRecentTrips(undefined, dm, dy, drv);
    } else {
      const dateStr = `${dy}-${String(dm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      setFilterDate(`${String(dd).padStart(2, '0')}/${String(dm).padStart(2, '0')}/${dy}`);
      fetchRecentTrips(dateStr, undefined, undefined, drv);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const now   = new Date();

      const [todayRes, reqRes, driversRes, fundRes, tripsMonthRes] = await Promise.all([
        api.get('/trips/summary/daily', { params: { date: today } }),
        api.get('/requests', { params: { status: 'pending', limit: 1 } }),
        api.get('/drivers', { params: { status: 'active', limit: 1 } }),
        api.get('/fund/drivers', { params: { month: now.getMonth() + 1, year: now.getFullYear() } }),
        api.get('/trips', { params: { month: now.getMonth() + 1, year: now.getFullYear(), limit: 1 } }),
      ]);

      const fundDrivers: any[] = fundRes.data.data?.drivers ?? [];
      const totalAdvance  = fundDrivers.reduce((s: number, d: any) => s + (d.total_advance || 0), 0);
      const totalExpense  = fundDrivers.reduce((s: number, d: any) => s + (d.total_expense || 0), 0);

      setKpi({
        trips_today:          todayRes.data.data?.total_trips ?? 0,
        overtime_today:       todayRes.data.data?.overtime_trips ?? 0,
        active_drivers:       driversRes.data.data?.pagination?.total ?? 0,
        pending_requests:     reqRes.data.data?.pagination?.total ?? 0,
        total_advance_month:  totalAdvance,
        total_expense_month:  totalExpense,
        trips_month: tripsMonthRes?.data.data?.pagination?.total ?? 0,
      });

      // 10 chuyến gần nhất
      await fetchRecentTrips(filterDate || undefined);    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);

  // Realtime: tự refresh khi có request mới hoặc được update
  useEffect(() => {
    const subs = [
      DeviceEventEmitter.addListener('NEW_REQUEST',     () => {
        fetchData();
        // Tăng badge ngay lập tức không cần chờ API
        setKpi(prev => ({ ...prev, pending_requests: prev.pending_requests + 1 }));
      }),
      DeviceEventEmitter.addListener('REQUEST_UPDATED', () => fetchData()),
    ];
    return () => subs.forEach(s => s.remove());
  }, [fetchData]);

  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        {/* Avatar + tên — nhấn để vào hồ sơ/cài đặt */}
        <TouchableOpacity style={S.headerLeft} onPress={() => navigation.navigate('Profile')} activeOpacity={0.75}>
          <View style={S.avatarBox}>
            {user?.avatar ? (
              <Image
                source={{ uri: user.avatar.startsWith('http') ? user.avatar : `${BASE_URL}${user.avatar}` }}
                style={S.avatarImg}
              />
            ) : (
              <Text style={S.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={S.headerName}>{user?.name}</Text>
        </TouchableOpacity>
        {/* Logo công ty */}làm 
        <View style={S.logoBox}>
          {companyLogoUrl ? (
            <Image source={{ uri: companyLogoUrl }} style={S.logoImg} resizeMode="contain" />
          ) : (
            <Text style={{ fontSize: 22 }}>🚛</Text>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={S.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : (
          <>
            {/* KPI row */}
            <Text style={S.sectionTitle}>Hôm nay</Text>
            <View style={S.kpiRow}>
              {[
                { icon: '🚛', label: 'Số chuyến', value: String(kpi.trips_today), sub: kpi.overtime_today > 0 ? `+${kpi.overtime_today} tăng ca` : undefined, color: Colors.primary, onPress: () => navigation.navigate('TodayTrips') },
                { icon: '📊', label: 'Chuyến tháng', value: String(kpi.trips_month), color: Colors.success, onPress: undefined },
                { icon: '⏳', label: 'Chờ duyệt', value: String(kpi.pending_requests), color: Colors.warning, onPress: () => navigation.navigate('Requests') },
              ].map(k => (
                <TouchableOpacity
                  key={k.label}
                  style={S.kpiCard}
                  onPress={k.onPress}
                  activeOpacity={k.onPress ? 0.7 : 1}
                >
                  <Text style={S.kpiIcon}>{k.icon}</Text>
                  <Text style={[S.kpiValue, { color: k.color }]}>{k.value}</Text>
                  <Text style={S.kpiLabel}>{k.label}</Text>
                  {k.sub && <Text style={{ fontSize: 10, color: Colors.success, fontWeight: '700' }}>{k.sub}</Text>}
                  {k.onPress && <Text style={{ fontSize: 9, color: k.color, opacity: 0.6 }}>Xem →</Text>}
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick nav buttons */}
            <View style={S.navGrid}>
              {[
                { icon: '👤', label: 'Tài xế',    badge: 0,                          onPress: () => navigation.navigate('Drivers') },
                { icon: '📋', label: 'Yêu cầu',   badge: kpi.pending_requests,       onPress: () => navigation.navigate('Requests') },
                { icon: '💰', label: 'Quỹ',       badge: 0,                          onPress: () => navigation.navigate('Fund') },
                { icon: '🔔', label: 'Thông báo', badge: 0,                          onPress: () => navigation.navigate('Notifications') },
                { icon: '⚙️', label: 'Cài đặt',  badge: 0,                          onPress: () => navigation.navigate('Profile') },
              ].map(btn => (
                <TouchableOpacity key={btn.label} style={S.navBtn} onPress={btn.onPress} activeOpacity={0.75}>
                  <View style={{ position: 'relative' }}>
                    <Text style={S.navBtnIcon}>{btn.icon}</Text>
                    {btn.badge > 0 && (
                      <View style={S.navBtnBadge}>
                        <Text style={S.navBtnBadgeText}>{btn.badge > 99 ? '99+' : btn.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={S.navBtnLabel}>{btn.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Monthly fund summary */}
            <Text style={S.sectionTitle}>Chi phí tháng này</Text>
            <View style={S.monthCard}>
              <View style={S.monthRow}>
                <View style={S.monthLeft}>
                  <Text style={S.monthIcon}>💸</Text>
                  <Text style={S.monthLabel}>Tài xế đã chi</Text>
                </View>
                <Text style={[S.monthValue, { color: Colors.error }]}>{fmtVND(kpi.total_expense_month)}đ</Text>
              </View>
            </View>

            {/* Recent trips */}
            <View style={S.sectionHeader}>
              <Text style={S.sectionTitle}>Chuyến gần nhất</Text>
              <View style={S.filterRow}>
                {filterMode !== 'none' && (
                  <TouchableOpacity onPress={() => applyFilter('none')} style={S.clearBtn}>
                    <Text style={S.clearBtnText}>✕ {filterDate}</Text>
                  </TouchableOpacity>
                )}
                {filterDriverId !== '' && (
                  <TouchableOpacity onPress={() => { setFilterDriverId(''); fetchRecentTrips(filterMode === 'day' ? `${filterYear}-${String(filterMonth).padStart(2,'0')}-${String(filterDay).padStart(2,'0')}` : undefined, filterMode === 'month' ? filterMonth : undefined, filterMode === 'month' ? filterYear : undefined, ''); }} style={S.clearBtn}>
                    <Text style={S.clearBtnText}>✕ {driverList.find(d => d._id === filterDriverId)?.full_name}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={S.filterBtn} onPress={() => setShowFilterModal(true)}>
                  <Text style={S.filterBtnText}>⚙️ Lọc</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Filter modal */}
            <Modal visible={showFilterModal} transparent animationType="fade">
              <TouchableOpacity style={S.modalOverlay} activeOpacity={1} onPress={() => setShowFilterModal(false)}>
                <View style={S.filterModal}>
                  <Text style={S.filterTitle}>Lọc chuyến theo</Text>

                  {/* Mode selector */}
                  <View style={S.modeRow}>
                    {(['month', 'day'] as const).map(m => (
                      <TouchableOpacity key={m} style={[S.modeBtn, filterMode === m && S.modeBtnActive]}
                        onPress={() => { setFilterMode(m); setFilterDateSelected(false); }}>
                        <Text style={[S.modeBtnText, filterMode === m && S.modeBtnTextActive]}>
                          {m === 'month' ? '📆 Theo tháng' : '📅 Ngày cụ thể'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Dùng DatePickerField cho cả 2 mode */}
                  <DatePickerField
                    label={filterMode === 'month' ? 'Chọn tháng' : 'Chọn ngày'}
                    value={filterDateSelected ? filterDateValue : null}
                    placeholder={filterMode === 'month' ? 'Chọn tháng...' : 'Chọn ngày...'}
                    monthOnly={filterMode === 'month'}
                    onChange={(d) => {
                      setFilterDateValue(d);
                      setFilterDateSelected(true);
                      setFilterMonth(d.getMonth() + 1);
                      setFilterYear(d.getFullYear());
                      setFilterDay(d.getDate());
                    }}
                  />

                  {/* Filter theo tài xế — Dropdown */}
                  <View style={{ marginTop: 12 }}>
                    <Text style={[S.filterTitle, { fontSize: 13, marginBottom: 6 }]}>Tài xế</Text>
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        borderWidth: 1.5, borderColor: Colors.gray300, borderRadius: 10,
                        paddingHorizontal: 14, paddingVertical: 11, backgroundColor: Colors.white,
                      }}
                      onPress={() => setShowDriverPicker(!showDriverPicker)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 14, color: filterDriverId ? Colors.gray900 : Colors.gray400 }}>
                        {filterDriverId
                          ? driverList.find(d => d._id === filterDriverId)?.full_name ?? 'Tài xế'
                          : 'Tất cả tài xế'}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.gray500 }}>
                        {showDriverPicker ? '▲' : '▼'}
                      </Text>
                    </TouchableOpacity>
                    {showDriverPicker && (
                      <View style={{
                        borderWidth: 1.5, borderColor: Colors.gray200, borderRadius: 10,
                        backgroundColor: Colors.white, marginTop: 4,
                        maxHeight: 200, overflow: 'hidden',
                      }}>
                        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                          {[{ _id: '', full_name: 'Tất cả tài xế' }, ...driverList].map(drv => (
                            <TouchableOpacity
                              key={drv._id}
                              style={{
                                paddingHorizontal: 14, paddingVertical: 12,
                                borderBottomWidth: 1, borderBottomColor: Colors.gray100,
                                backgroundColor: filterDriverId === drv._id ? Colors.primary + '15' : Colors.white,
                              }}
                              onPress={() => { setFilterDriverId(drv._id); setShowDriverPicker(false); }}
                            >
                              <Text style={{
                                fontSize: 14,
                                color: filterDriverId === drv._id ? Colors.primary : Colors.gray800,
                                fontWeight: filterDriverId === drv._id ? '700' : '400',
                              }}>
                                {drv._id === '' ? '👥 ' : '👤 '}{drv.full_name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <View style={S.filterActions}>
                    <TouchableOpacity style={S.cancelBtn} onPress={() => {
                      setShowFilterModal(false);
                      setShowDriverPicker(false);
                    }}>
                      <Text style={S.cancelBtnText}>Hủy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[S.cancelBtn, { backgroundColor: Colors.gray100 }]} onPress={() => {
                      setFilterMode('none');
                      setFilterDriverId('');
                      setShowFilterModal(false);
                      setShowDriverPicker(false);
                      fetchRecentTrips();
                    }}>
                      <Text style={[S.cancelBtnText, { color: Colors.gray600 }]}>Xóa lọc</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.applyBtn}
                      onPress={() => applyFilter(filterMode, filterDay, filterMonth, filterYear, filterDriverId)}>
                      <Text style={S.applyBtnText}>Áp dụng</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </Modal>
            {recentTrips.length === 0 ? (
              <Text style={{ color: Colors.gray500, fontSize: 13, marginBottom: 16 }}>Chưa có chuyến nào</Text>
            ) : (() => {
                // Group trips theo ngày (mới nhất trên đầu)
                const map: Record<string, any[]> = {};
                recentTrips.forEach(t => {
                  const d = t.trip_date
                    ? new Date(t.trip_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
                    : 'unknown';
                  if (!map[d]) map[d] = [];
                  map[d].push(t);
                });
                const sections = Object.entries(map)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([dateKey, trips]) => {
                    const d = new Date(dateKey + 'T00:00:00');
                    const DAY = ['CN','T2','T3','T4','T5','T6','T7'];
                    const label = isNaN(d.getTime()) ? dateKey
                      : `${DAY[d.getDay()]} ${dateKey.split('-').reverse().join('/')}`;
                    const total = trips.length;
                    // Tính tăng ca đúng: nhóm theo từng tài xế, mỗi tài xế > 4 chuyến/ngày mới tính TC
                    const driverMap: Record<string, number> = {};
                    trips.forEach(t => {
                      const dId = t.driver_id?._id ?? t.driver_id ?? 'unknown';
                      driverMap[dId] = (driverMap[dId] ?? 0) + 1;
                    });
                    const otCount = Object.values(driverMap).reduce((s, c) => s + Math.max(0, c - 4), 0);
                    return { label, trips, total, otCount };
                  });
                return sections.map(({ label, trips, total, otCount }) => (
                  <View key={label} style={{ marginBottom: 12 }}>
                    {/* Day header */}
                    <View style={S.dayHeader}>
                      <Text style={S.dayLabel}>{label}</Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <View style={S.dayBadge}>
                          <Text style={S.dayBadgeText}>{total} chuyến</Text>
                        </View>
                        {otCount > 0 && (
                          <View style={[S.dayBadge, { backgroundColor: Colors.accentDark + '20' }]}>
                            <Text style={[S.dayBadgeText, { color: Colors.accentDark }]}>🔥 {otCount} TC</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {/* Trips in day — STT tính theo từng tài xế riêng */}
                    {(() => {
                      // Group theo driver, sort mỗi driver theo thời gian (cũ nhất = STT 1)
                      const driverTripsMap: Record<string, any[]> = {};
                      trips.forEach(t => {
                        const dId = t.driver_id?._id ?? t.driver_id ?? 'unknown';
                        if (!driverTripsMap[dId]) driverTripsMap[dId] = [];
                        driverTripsMap[dId].push(t);
                      });
                      // Sort mỗi driver's trips theo thời gian tăng dần (cũ → mới)
                      Object.values(driverTripsMap).forEach(arr =>
                        arr.sort((a, b) => new Date(a.trip_date).getTime() - new Date(b.trip_date).getTime())
                      );
                      // Map trip._id → stt (per driver)
                      const sttMap: Record<string, number> = {};
                      Object.entries(driverTripsMap).forEach(([dId, arr]) => {
                        arr.forEach((t, idx) => {
                          sttMap[t._id] = idx + 1; // STT 1-indexed, cũ nhất = 1
                        });
                      });
                      // Render: giữ thứ tự mới nhất trên đầu (theo API)
                      return trips.map((t) => {
                        const stt = sttMap[t._id] ?? 1;
                        const isOT = stt > 4;
                        return (
                        <TouchableOpacity
                          key={t._id}
                          style={[S.tripCard, isOT && S.tripCardOT]}
                          onPress={() => navigation.navigate('TripDetail', { tripId: t._id })}
                          activeOpacity={0.75}
                        >
                          <View style={[S.sttBadge, isOT && { backgroundColor: Colors.accentDark }]}>
                            <Text style={S.sttText}>{stt}</Text>
                          </View>
                          <View style={S.tripLeft}>
                            <View style={S.tripTopRow}>
                              <Text style={S.tripDriver}>{t.driver_id?.full_name ?? '—'}</Text>
                              {t.trip_date && (
                                <Text style={S.tripDate}>
                                  {new Date(t.trip_date).toLocaleTimeString('vi-VN', {
                                    timeZone: 'Asia/Ho_Chi_Minh',
                                    hour: '2-digit', minute: '2-digit', hour12: false,
                                  })}
                                </Text>
                              )}
                            </View>
                            <Text style={S.tripRoute} numberOfLines={1}>
                              {t.pickup_location} → {t.drop_location}
                            </Text>
                            <Text style={S.tripMaterial}>{t.material_name}</Text>
                          </View>
                          <View style={S.tripRight}>
                            <Text style={S.tripPlate}>{t.vehicle_id?.license_plate ?? '—'}</Text>
                            {isOT && <Text style={S.otBadge}>🔥 TC</Text>}
                          </View>
                        </TouchableOpacity>
                      );
                      });
                    })()}
                  </View>
                ));
              })()
            }
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  header:  { backgroundColor: Colors.primary, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarBox:  { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryDark, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg:  { width: 36, height: 36, borderRadius: 18 },
  avatarText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  headerName: { fontSize: 16, fontWeight: '700', color: Colors.white },
  logoBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  logoImg: { width: 40, height: 40, borderRadius: 10 },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.gray700, marginBottom: 10, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 8 },
  dateFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearBtn: { backgroundColor: Colors.primary + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  clearBtnText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  filterRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterBtn:     { backgroundColor: Colors.primary + '15', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  filterBtnText: { fontSize: 14, color: Colors.primary, fontWeight: '700' },
  clearBtn:      { backgroundColor: Colors.error + '15', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  clearBtnText:  { fontSize: 13, color: Colors.error, fontWeight: '700' },
  modalOverlay:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' },
  filterModal:   { backgroundColor: Colors.white, borderRadius: 20, width: '100%', padding: 20, paddingBottom: 24 },
  filterTitle:   { fontSize: 16, fontWeight: '700', color: Colors.gray900, marginBottom: 16, textAlign: 'center' },
  modeRow:       { flexDirection: 'row', gap: 10, marginBottom: 16 },
  modeBtn:       { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  modeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  modeBtnText:   { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  modeBtnTextActive: { color: Colors.primary },
  pickerSection: { marginBottom: 8 },
  pickerLabel:   { fontSize: 12, fontWeight: '600', color: Colors.gray500, marginBottom: 4 },
  filterActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn:     { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  applyBtn:      { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center' },
  applyBtnText:  { fontSize: 14, fontWeight: '700', color: Colors.white },
  kpiRow:  { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kpiCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 14, padding: 14, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  kpiIcon: { fontSize: 22 },
  kpiValue:{ fontSize: 20, fontWeight: '800' },
  kpiLabel:{ fontSize: 10, color: Colors.gray500, fontWeight: '600', textAlign: 'center' },
  navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16, marginTop: 4 },
  navBtn:  { flex: 1, minWidth: '18%', backgroundColor: Colors.white, borderRadius: 14, paddingVertical: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  navBtnIcon:  { fontSize: 22 },
  navBtnLabel: { fontSize: 10, color: Colors.gray600, fontWeight: '600', textAlign: 'center' },
  navBtnBadge: { position: 'absolute', top: -4, right: -8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: Colors.white },
  navBtnBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.white },
  monthCard:{ backgroundColor: Colors.white, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  monthLeft:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthIcon:{ fontSize: 18 },
  monthLabel:{ fontSize: 14, color: Colors.gray600 },
  monthValue:{ fontSize: 16, fontWeight: '700' },
  divider:  { height: 1, backgroundColor: Colors.gray100 },
  tripCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Colors.border },
  tripCardOT: { borderColor: Colors.accentDark + '40', backgroundColor: '#fffbf0' },
  sttBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  sttText:  { fontSize: 10, fontWeight: '800', color: Colors.white },
  dayHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, marginTop: 4 },
  dayLabel:     { fontSize: 13, fontWeight: '700', color: Colors.gray700 },
  dayBadge:     { backgroundColor: Colors.primary + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  dayBadgeText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  tripLeft: { flex: 1 },
  tripTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  tripDriver:{ fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  tripDate:  { fontSize: 11, color: Colors.gray500 },
  tripRoute: { fontSize: 11, color: Colors.gray500, marginTop: 1 },
  tripMaterial:{ fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  tripRight: { alignItems: 'flex-end', gap: 4 },
  tripPlate: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  otBadge:   { fontSize: 10, color: Colors.accentDark, fontWeight: '700' },
});
