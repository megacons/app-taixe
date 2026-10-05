import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, SectionList, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import DatePickerField from '@/components/DatePickerField';

export default function TodayTripsScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { user }   = useAuthStore();

  const initialDate = route.params?.date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const month: number | undefined = route.params?.month;
  const year:  number | undefined = route.params?.year;
  const isMonthMode = !route.params?.date && !!month;
  const isAdmin = user?.role !== 'driver';

  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(initialDate + 'T00:00:00'));
  const [currentDate, setCurrentDate] = useState<string>(initialDate);

  const [trips,     setTrips]     = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrips = useCallback(async (dateStr?: string) => {
    try {
      const params: any = { limit: 500, sort: '-trip_date' };
      if (isMonthMode) {
        params.month = month;
        params.year  = year;
      } else {
        params.date = dateStr ?? currentDate;
      }
      if (!isAdmin) {
        try {
          const driverRes = await api.get('/drivers/profile/me');
          const driverId  = driverRes.data.data?._id;
          if (driverId) params.driver_id = driverId;
        } catch (_) {}
      }
      const res = await api.get('/trips', { params });
      setTrips(res.data.data?.trips ?? []);
    } catch (_) {}
    finally { setLoading(false); }
  }, [currentDate, month, year, isAdmin, isMonthMode]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);
  const onRefresh = async () => { setRefreshing(true); await fetchTrips(); setRefreshing(false); };

  const headerLabel = (() => {
    if (isMonthMode) return `Tháng ${month}/${year}`;
    try {
      const d = new Date(currentDate + 'T00:00:00');
      return format(d, 'EEEE, dd/MM/yyyy', { locale: vi });
    } catch { return currentDate ?? ''; }
  })();

  const overtimeCount = trips.filter(t => t.is_overtime === true).length;

  // Build sections grouped by date (mới nhất lên đầu)
  const sections = (() => {
    if (!isMonthMode) return [];
    const map: Record<string, any[]> = {};
    trips.forEach(t => {
      const d = t.trip_date?.slice(0, 10) ?? '';
      if (!map[d]) map[d] = [];
      map[d].push(t);
    });
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a)) // mới nhất lên đầu
      .map(([dateKey, data]) => {
        const d = new Date(dateKey + 'T00:00:00');
        const label = isNaN(d.getTime())
          ? dateKey
          : `${['CN','T2','T3','T4','T5','T6','T7'][d.getDay()]} ${format(d, 'dd/MM/yyyy', { locale: vi })}`;
        return { title: label, count: data.length, data };
      });
  })();

  const SummaryHeader = (
    <View style={S.summaryCard}>
      <View style={S.summaryItem}>
        <Text style={S.summaryValue}>{trips.length}</Text>
        <Text style={S.summaryLabel}>Tổng chuyến</Text>
      </View>
      <View style={S.summaryDivider} />
      <View style={S.summaryItem}>
        <Text style={[S.summaryValue, { color: overtimeCount > 0 ? Colors.accentDark : Colors.gray400 }]}>
          {overtimeCount}
        </Text>
        <Text style={S.summaryLabel}>🔥 Tăng ca</Text>
      </View>
      {isAdmin && (
        <>
          <View style={S.summaryDivider} />
          <View style={S.summaryItem}>
            <Text style={[S.summaryValue, { color: Colors.primary, fontSize: 14 }]}>
              {[...new Set(trips.map(t => t.driver_id?._id))].length}
            </Text>
            <Text style={S.summaryLabel}>Tài xế</Text>
          </View>
        </>
      )}
    </View>
  );

  const renderTrip = (t: any, index: number, dayTrips?: any[]) => {
    // Dùng is_overtime từ DB — đã được tính đúng per driver khi tạo chuyến
    const isOT = t.is_overtime === true;
    // STT: tính riêng theo từng tài xế trong ngày
    const driverId = String(t.driver_id?._id ?? t.driver_id ?? '');
    const allForDay = dayTrips ?? trips;
    const sameDayDriverTrips = allForDay.filter(x => {
      const xId = String(x.driver_id?._id ?? x.driver_id ?? '');
      return xId === driverId;
    });
    // Sort cũ nhất trước để STT 1 = chuyến đầu tiên trong ngày
    const sorted = [...sameDayDriverTrips].sort(
      (a, b) => new Date(a.trip_date).getTime() - new Date(b.trip_date).getTime()
    );
    const stt = sorted.findIndex(x => x._id === t._id) + 1;
    return (
      <TouchableOpacity
        key={t._id}
        style={[S.card, isOT && S.cardOT]}
        onPress={() => navigation.navigate('TripDetail', { tripId: t._id })}
        activeOpacity={0.75}
      >
        <View style={[S.numBadge, isOT && { backgroundColor: Colors.accentDark }]}>
          <Text style={S.numText}>{stt}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {isAdmin && t.driver_id?.full_name && (
            <Text style={S.driverName}>{t.driver_id.full_name}</Text>
          )}
          <Text style={S.route} numberOfLines={1}>
            {t.pickup_location} → {t.drop_location}
          </Text>
          <Text style={S.material}>
            {t.material_name}{t.quantity ? ` · ${t.quantity} ${t.unit ?? ''}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={S.plate}>{t.vehicle_id?.license_plate ?? '—'}</Text>
          {isOT && <Text style={S.otBadge}>🔥 TC</Text>}
          <Text style={S.arrow}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyComponent = (
    <View style={S.empty}>
      <Text style={{ fontSize: 44 }}>🚛</Text>
      <Text style={S.emptyText}>
        {isMonthMode ? 'Không có chuyến nào trong tháng này' : 'Không có chuyến nào trong ngày này'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>{isMonthMode ? 'Chuyến trong tháng' : 'Chuyến trong ngày'}</Text>
          <Text style={S.headerSub}>{headerLabel}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Date picker — chỉ hiện khi không phải month mode */}
      {!isMonthMode && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
          <DatePickerField
            label="Chọn ngày"
            value={selectedDate}
            onChange={(d) => {
              setSelectedDate(d);
              const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
              setCurrentDate(dateStr);
              setLoading(true);
              fetchTrips(dateStr);
            }}
          />
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : isMonthMode ? (
        /* ── Chế độ tháng: SectionList nhóm theo ngày ── */
        <SectionList
          sections={sections}
          keyExtractor={t => t._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={S.listContent}
          ListHeaderComponent={SummaryHeader}
          ListEmptyComponent={EmptyComponent}
          renderSectionHeader={({ section }) => (
            <View style={S.dayHeader}>
              <Text style={S.dayLabel}>{section.title}</Text>
              <View style={S.dayBadge}>
                <Text style={S.dayBadgeText}>{section.count} chuyến</Text>
              </View>
            </View>
          )}
          renderItem={({ item: t, index, section }) =>
            renderTrip(t, index, section.data)
          }
          stickySectionHeadersEnabled={false}
        />
      ) : (
        /* ── Chế độ ngày: FlatList thẳng ── */
        <FlatList
          data={trips}
          keyExtractor={t => t._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={S.listContent}
          ListHeaderComponent={SummaryHeader}
          ListEmptyComponent={EmptyComponent}
          renderItem={({ item: t, index }) => renderTrip(t, index)}
        />
      )}
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  header:  { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14, gap: 8 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backIcon:{ fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.white },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },

  listContent: { padding: 14, paddingBottom: 32 },

  summaryCard:    { backgroundColor: Colors.white, borderRadius: 14, padding: 16, flexDirection: 'row', borderWidth: 1, borderColor: Colors.border, marginBottom: 14 },
  summaryItem:    { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: Colors.gray100 },
  summaryValue:   { fontSize: 22, fontWeight: '800', color: Colors.primary },
  summaryLabel:   { fontSize: 11, color: Colors.gray500, fontWeight: '600', marginTop: 2 },

  dayHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, marginTop: 10 },
  dayLabel:     { fontSize: 13, fontWeight: '700', color: Colors.gray700 },
  dayBadge:     { backgroundColor: Colors.primary + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  dayBadgeText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },

  card:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  cardOT:   { borderColor: Colors.accentDark + '40', backgroundColor: '#fffbf0' },

  numBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  numText:  { fontSize: 11, fontWeight: '800', color: Colors.white },

  driverName: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 1 },
  route:      { fontSize: 13, fontWeight: '600', color: Colors.gray900 },
  material:   { fontSize: 11, color: Colors.gray500, marginTop: 2 },
  plate:      { fontSize: 12, fontWeight: '700', color: Colors.primary },
  otBadge:    { fontSize: 10, color: Colors.accentDark, fontWeight: '700' },
  arrow:      { fontSize: 18, color: Colors.gray300 },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.gray500, textAlign: 'center' },
});
