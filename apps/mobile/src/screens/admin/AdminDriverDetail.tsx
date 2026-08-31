import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import MonthYearPicker from '@/components/MonthYearPicker';

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

const fmtVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v ?? 0);

const STATUS_COLOR: Record<string, string> = {
  active: Colors.success, inactive: Colors.gray400,
  on_leave: Colors.warning, suspended: Colors.error,
};
const STATUS_LABEL: Record<string, string> = {
  active: 'Hoạt động', inactive: 'Không HĐ',
  on_leave: 'Nghỉ phép', suspended: 'Đình chỉ',
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function AdminDriverDetail() {
  const navigation  = useNavigation<any>();
  const route       = useRoute<any>();
  const { driverId } = route.params as { driverId: string };

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const [driver,     setDriver]     = useState<any>(null);
  const [fund,       setFund]       = useState<any>(null);
  const [trips,      setTrips]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [driverRes, fundRes, tripsRes] = await Promise.all([
        api.get(`/drivers/${driverId}`),
        api.get(`/fund/drivers`, { params: { month, year } }),
        api.get('/trips', { params: { driver_id: driverId, month, year, limit: 200, sort: '-trip_date' } }),
      ]);

      setDriver(driverRes.data.data?.driver ?? driverRes.data.data);

      // Lấy fund của đúng driver này
      const allDriversFund = fundRes.data.data?.drivers ?? [];
      const myFund = allDriversFund.find((d: any) => d.driver_id === driverId);
      setFund(myFund ?? { total_advance: 0, total_expense: 0, remaining: 0, total_trips: 0, overtime_trips: 0 });

      setTrips(tripsRes.data.data?.trips ?? []);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [driverId, month, year]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = async () => { setRefreshing(true); await fetchAll(); setRefreshing(false); };

  // Group trips by day
  const groupByDay = () => {
    const map: Record<string, any[]> = {};
    trips.forEach(t => {
      const day = t.trip_date?.slice(0, 10) ?? 'Không rõ';
      if (!map[day]) map[day] = [];
      map[day].push(t);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a)); // mới nhất lên đầu
  };

  if (loading) return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Chi tiết tài xế</Text>
        <View style={{ width: 40 }} />
      </View>
      <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle} numberOfLines={1}>{driver?.full_name ?? 'Chi tiết tài xế'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ── Profile card ── */}
        <View style={S.profileCard}>
          {(() => {
            const avatarUrl = driver?.user_id?.avatar;
            const fullUrl = avatarUrl ? (avatarUrl.startsWith('http') ? avatarUrl : `${BASE_URL}${avatarUrl}`) : null;
            return fullUrl ? (
              <Image source={{ uri: fullUrl }} style={S.avatarLargeImg} />
            ) : (
              <View style={S.avatarLarge}>
                <Text style={S.avatarText}>{driver?.full_name?.charAt(0)?.toUpperCase()}</Text>
              </View>
            );
          })()}
          <Text style={S.driverName}>{driver?.full_name}</Text>
          <View style={[S.statusBadge, { backgroundColor: (STATUS_COLOR[driver?.status] ?? Colors.gray400) + '20' }]}>
            <Text style={[S.statusText, { color: STATUS_COLOR[driver?.status] ?? Colors.gray400 }]}>
              {STATUS_LABEL[driver?.status] ?? driver?.status}
            </Text>
          </View>
        </View>

        {/* ── Info card ── */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Thông tin</Text>
          <View style={S.infoCard}>
            {[
              { icon: '🪪', label: 'Mã NV',      value: driver?.employee_id ?? '—' },
              { icon: '📱', label: 'Điện thoại', value: driver?.phone ?? '—' },
              { icon: '🚛', label: 'Biển số',    value: driver?.vehicle_id?.license_plate ?? 'Chưa gán xe' },
              { icon: '📅', label: 'Ngày vào',   value: driver?.hire_date ? format(parseISO(driver.hire_date), 'dd/MM/yyyy', { locale: vi }) : '—' },
              { icon: '📍', label: 'Địa chỉ',    value: driver?.address ?? '—' },
            ].map(row => (
              <View key={row.label} style={S.infoRow}>
                <Text style={S.infoIcon}>{row.icon}</Text>
                <Text style={S.infoLabel}>{row.label}</Text>
                <Text style={S.infoValue} numberOfLines={1}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Month selector ── */}
        <MonthYearPicker
          month={month}
          year={year}
          onChange={(m, y) => { setMonth(m); setYear(y); }}
        />

        {/* ── Fund card ── */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Quỹ tháng {month}/{year}</Text>
          <View style={S.fundCard}>
            <View style={S.fundRow}>
              <View style={S.fundItem}>
                <Text style={S.fundLabel}>Tổng ứng</Text>
                <Text style={[S.fundValue, { color: '#3b82f6' }]}>{fmtVND(fund?.total_advance ?? 0)}đ</Text>
              </View>
              <View style={S.fundItem}>
                <Text style={S.fundLabel}>Đã chi</Text>
                <Text style={[S.fundValue, { color: Colors.error }]}>{fmtVND(fund?.total_expense ?? 0)}đ</Text>
              </View>
              <View style={S.fundItem}>
                <Text style={S.fundLabel}>Còn lại</Text>
                <Text style={[S.fundValue, { color: (fund?.remaining ?? 0) >= 0 ? Colors.success : Colors.error, fontWeight: '800' }]}>
                  {fmtVND(fund?.remaining ?? 0)}đ
                </Text>
              </View>
            </View>
            <View style={S.fundFooter}>
              <Text style={S.tripsText}>🚛 {fund?.total_trips ?? 0} chuyến</Text>
              {(fund?.overtime_trips ?? 0) > 0 && (
                <Text style={S.otText}>🔥 {fund.overtime_trips} tăng ca</Text>
              )}
            </View>
          </View>
        </View>

        {/* ── Trips ── */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Chuyến tháng {month}/{year}</Text>
          {trips.length === 0 ? (
            <View style={S.empty}>
              <Text style={{ fontSize: 32 }}>🚛</Text>
              <Text style={S.emptyText}>Chưa có chuyến nào</Text>
            </View>
          ) : (
            groupByDay().map(([day, dayTrips]) => {
              const isOT  = dayTrips.length > 4;
              const date  = new Date(day + 'T00:00:00');
              const label = isNaN(date.getTime())
                ? day
                : `${['CN','T2','T3','T4','T5','T6','T7'][date.getDay()]} - ${format(date, 'dd/MM/yyyy', { locale: vi })}`;

              return (
                <View key={day} style={S.dayGroup}>
                  {/* Day header */}
                  <View style={S.dayHeader}>
                    <Text style={S.dayLabel}>{label}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <View style={S.dayCountBadge}>
                        <Text style={S.dayCount}>{dayTrips.length} chuyến</Text>
                      </View>
                      {isOT && (
                        <View style={S.otBadge}>
                          <Text style={S.otBadgeText}>🔥 {dayTrips.length - 4} TC</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Trip rows */}
                  {dayTrips.map((t, idx) => {
                    const isOTTrip = idx >= 4;
                    return (
                      <TouchableOpacity
                        key={t._id}
                        style={[S.tripRow, isOTTrip && S.tripRowOT]}
                        onPress={() => navigation.navigate('TripDetail', { tripId: t._id })}
                        activeOpacity={0.7}
                      >
                        <View style={[S.tripNumBadge, isOTTrip && { backgroundColor: Colors.accentDark }]}>
                          <Text style={S.tripNum}>{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={S.tripRoute} numberOfLines={1}>
                            {t.pickup_location} → {t.drop_location}
                          </Text>
                          <Text style={S.tripMaterial}>
                            {t.material_name}{t.quantity ? ` · ${t.quantity} ${t.unit ?? ''}` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <Text style={S.tripPlate}>{t.vehicle_id?.license_plate ?? '—'}</Text>
                          {isOTTrip && <Text style={S.otLabel}>🔥 TC</Text>}
                          <Text style={S.tripArrow}>›</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── Styles ─────────────────────────────────────────── */
const S = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  header:      { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14 },
  backBtn:     { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.white, textAlign: 'center' },

  profileCard: { alignItems: 'center', backgroundColor: Colors.white, padding: 20, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  avatarLarge:    { width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarLargeImg: { width: 68, height: 68, borderRadius: 34 },
  avatarText:     { fontSize: 28, fontWeight: '800', color: Colors.white },
  driverName:  { fontSize: 20, fontWeight: '800', color: Colors.gray900 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  statusText:  { fontSize: 12, fontWeight: '700' },

  section:      { paddingHorizontal: 14, paddingTop: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  infoCard:  { backgroundColor: Colors.white, borderRadius: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.border },
  infoRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  infoIcon:  { fontSize: 15, marginRight: 10, width: 24 },
  infoLabel: { fontSize: 13, color: Colors.gray500, width: 90 },
  infoValue: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.gray900, textAlign: 'right' },

  monthScroll:     { gap: 6, paddingBottom: 6 },
  monthChip:       { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.gray200 },
  monthChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  monthChipText:   { fontSize: 12, fontWeight: '600', color: Colors.gray600 },
  monthChipTextActive: { color: Colors.primary },
  yearRow:         { flexDirection: 'row', gap: 6, marginTop: 6 },
  yearChip:        { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray200 },
  yearChipActive:  { borderColor: Colors.primary, backgroundColor: Colors.primary },
  yearText:        { fontSize: 11, fontWeight: '600', color: Colors.gray600 },
  yearTextActive:  { color: Colors.white },

  fundCard:   { backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  fundRow:    { flexDirection: 'row', marginBottom: 10 },
  fundItem:   { flex: 1, alignItems: 'center' },
  fundLabel:  { fontSize: 10, color: Colors.gray500, fontWeight: '600' },
  fundValue:  { fontSize: 13, fontWeight: '700', marginTop: 2 },
  fundFooter: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: Colors.gray100, paddingTop: 8 },
  tripsText:  { fontSize: 12, color: Colors.gray600 },
  otText:     { fontSize: 12, color: Colors.accentDark, fontWeight: '600' },

  dayGroup:      { marginBottom: 10 },
  dayHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  dayLabel:      { fontSize: 12, fontWeight: '700', color: Colors.gray700 },
  dayCountBadge: { backgroundColor: Colors.primary + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  dayCount:      { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  otBadge:       { backgroundColor: Colors.accentDark + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  otBadgeText:   { fontSize: 11, color: Colors.accentDark, fontWeight: '700' },

  tripRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: 10, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: Colors.border },
  tripRowOT:    { borderColor: Colors.accentDark + '40', backgroundColor: '#fffbf0' },
  tripNumBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  tripNum:      { fontSize: 10, fontWeight: '800', color: Colors.white },
  tripRoute:    { fontSize: 12, fontWeight: '600', color: Colors.gray900 },
  tripMaterial: { fontSize: 11, color: Colors.gray500, marginTop: 1 },
  tripPlate:    { fontSize: 11, fontWeight: '700', color: Colors.primary },
  otLabel:      { fontSize: 10, color: Colors.accentDark, fontWeight: '700' },
  tripArrow:    { fontSize: 18, color: Colors.gray300 },

  empty:     { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, color: Colors.gray400 },
});
