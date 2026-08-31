import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO, subDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import type { RootStackParamList } from '@/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Trip {
  _id: string;
  trip_date: string;
  material_name: string;
  pickup_location: string;
  drop_location: string;
  income: number;
  expense: number;
  is_overtime: boolean;
  overtime_pay: number;
  status: string;
  delivery_receipt: string | null;
}

interface DailySummary {
  total_trips: number;
  total_income: number;
  total_expense: number;
  overtime_trips: number;
  overtime_pay: number;
  work_hours: number;
}

interface HistoryDay {
  date: string;
  label: string;
  trips: number;
  expense: number;
  submitted: boolean;
}

export default function TripListScreen() {
  const navigation = useNavigation<Nav>();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchAll = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [tripsRes, summaryRes] = await Promise.all([
        api.get('/trips', { params: { date, limit: 50, sort: '-trip_date' } }),
        api.get('/trips/summary/daily', { params: { date } }),
      ]);
      setTrips(tripsRes.data.data?.trips || []);
      setSummary(summaryRes.data.data);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    const days: HistoryDay[] = [];
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = subDays(today, i);
      const dateStr = d.toISOString().slice(0, 10);
      try {
        const res = await api.get('/trips/summary/daily', { params: { date: dateStr } });
        const data = res.data.data;
        days.push({
          date: dateStr,
          label: i === 1 ? 'Hôm qua' : format(d, 'dd/MM', { locale: vi }),
          trips: data?.total_trips || 0,
          expense: data?.total_expense || 0,
          submitted: data?.total_trips > 0,
        });
      } catch (_) {
        days.push({ date: dateStr, label: format(d, 'dd/MM'), trips: 0, expense: 0, submitted: false });
      }
    }
    setHistory(days);
  }, []);

  useEffect(() => {
    fetchAll(selectedDate);
    fetchHistory();
  }, [selectedDate]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAll(selectedDate), fetchHistory()]);
    setRefreshing(false);
  };

  const handleSubmitReport = async () => {
    Alert.alert(
      'Gửi báo cáo ngày',
      `Xác nhận chốt báo cáo ngày ${format(parseISO(selectedDate), 'dd/MM/yyyy')}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Gửi',
          onPress: async () => {
            setSubmitting(true);
            try {
              await api.post('/trips/submit-daily', { date: selectedDate });
              Alert.alert('✅ Thành công', 'Báo cáo ngày đã được gửi!');
              fetchAll(selectedDate);
            } catch (err: any) {
              Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể gửi báo cáo.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const formatCurrency = (val: number) => {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}Mđ`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
    return `${val}đ`;
  };

  const filteredTrips = trips.filter(
    t =>
      !searchText ||
      t.material_name.toLowerCase().includes(searchText.toLowerCase()) ||
      t.pickup_location.toLowerCase().includes(searchText.toLowerCase()) ||
      t.drop_location.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nhật trình xe</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ─── TỔNG KẾT HÔM NAY ─── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tổng kết hôm nay</Text>
        </View>

        <View style={styles.summaryGrid}>
          {/* Số chuyến */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryIcon}>🚛</Text>
            <Text style={styles.summaryLabel}>Số chuyến</Text>
            <Text style={[styles.summaryValue, { color: Colors.primary }]}>
              {loading ? '...' : String(summary?.total_trips ?? 0).padStart(2, '0')}
            </Text>
          </View>

          {/* Tiền chi */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryIcon}>💸</Text>
            <Text style={styles.summaryLabel}>Tiền chi</Text>
            <Text style={[styles.summaryValue, { color: Colors.error }]}>
              {loading ? '...' : formatCurrency(summary?.total_expense ?? 0)}
            </Text>
          </View>

          {/* Tiền ứng trước - full width */}
          <View style={[styles.summaryCard, styles.summaryCardWide]}>
            <View style={styles.advanceLeft}>
              <View style={styles.advanceIconBox}>
                <Text style={{ fontSize: 20 }}>💼</Text>
              </View>
              <Text style={[styles.summaryLabel, { fontSize: 15, marginBottom: 0 }]}>Tiền ứng trước</Text>
            </View>
            <Text style={[styles.summaryValue, { color: Colors.accentDark, fontSize: 18 }]}>
              {loading ? '...' : formatCurrency(summary?.total_income ?? 0)}
            </Text>
          </View>
        </View>

        {/* ─── CHỐT BÁO CÁO NGÀY ─── */}
        <View style={styles.reportCard}>
          <Text style={styles.reportTitle}>Chốt báo cáo ngày</Text>

          {/* Tìm kiếm */}
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Tìm chuyến..."
              placeholderTextColor={Colors.gray400}
            />
          </View>

          {/* Overtime info */}
          {summary && summary.overtime_trips > 0 && (
            <View style={styles.overtimeBox}>
              <Text style={styles.overtimeText}>
                🔥 Tăng ca: {summary.overtime_trips} chuyến × 100,000đ = +{formatCurrency(summary.overtime_pay)}
              </Text>
            </View>
          )}

          {/* Trip list */}
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
          ) : filteredTrips.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🚛</Text>
              <Text style={styles.emptyText}>Chưa có chuyến nào hôm nay</Text>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => navigation.navigate('AddTrip')}
              >
                <Text style={styles.addBtnText}>+ Thêm chuyến đầu tiên</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredTrips.map((trip, idx) => (
              <TouchableOpacity
                key={trip._id}
                style={styles.tripItem}
                onPress={() => navigation.navigate('TripDetail', { tripId: trip._id })}
                activeOpacity={0.8}
              >
                <View style={styles.tripLeft}>
                  <View style={[styles.tripNumBadge, trip.is_overtime && styles.tripNumOT]}>
                    <Text style={styles.tripNum}>{idx + 1}</Text>
                  </View>
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripMaterial}>{trip.material_name}</Text>
                    <Text style={styles.tripRoute} numberOfLines={1}>
                      {trip.pickup_location} → {trip.drop_location}
                    </Text>
                    {trip.is_overtime && (
                      <View style={styles.otBadge}>
                        <Text style={styles.otBadgeText}>Tăng ca +100K</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.tripRight}>
                  <Text style={styles.tripIncome}>+{formatCurrency(trip.income)}</Text>
                  <Text style={styles.tripExpense}>-{formatCurrency(trip.expense)}</Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* ─── LỊCH SỬ 7 NGÀY ─── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Lịch sử 7 ngày qua</Text>
          <Text style={styles.seeAll}>Xem tất cả</Text>
        </View>

        {history.map(day => (
          <View
            key={day.date}
            style={[styles.historyItem, day.submitted && styles.historyItemDone]}
          >
            <View>
              <Text style={styles.historyDate}>{day.label}, {day.date.slice(5).split('-').reverse().join('/')}</Text>
              <Text style={styles.historyMeta}>{day.trips} chuyến • Chi {formatCurrency(day.expense)}</Text>
            </View>
            <View style={styles.historyRight}>
              <Text style={[styles.historyStatus, day.submitted && styles.historyStatusDone]}>
                {day.submitted ? 'Đã chốt' : 'Chưa chốt'}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          </View>
        ))}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Fixed submit button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleSubmitReport}
          disabled={submitting || (summary?.total_trips ?? 0) === 0}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <>
              <Text style={styles.submitIcon}>📤</Text>
              <Text style={styles.submitBtnText}>Gửi báo cáo ngày</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
  },
  backBtn:     { width: 36, height: 36, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  bellIcon: { fontSize: 22 },

  content: { paddingHorizontal: 16, paddingTop: 16 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.gray900 },
  seeAll: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  summaryCardWide: {
    flexBasis: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryIcon: { fontSize: 28, marginBottom: 6 },
  summaryLabel: { fontSize: 12, color: Colors.gray500, marginBottom: 4, fontWeight: '600' },
  summaryValue: { fontSize: 22, fontWeight: '700' },
  advanceLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  advanceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accent + '22',
    justifyContent: 'center',
    alignItems: 'center',
  },

  reportCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  reportTitle: { fontSize: 17, fontWeight: '700', color: Colors.gray900, marginBottom: 12 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.gray900 },

  overtimeBox: {
    backgroundColor: '#fff7ed',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  overtimeText: { fontSize: 13, fontWeight: '600', color: Colors.accentDark },

  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 14, color: Colors.gray500, marginBottom: 12 },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  tripItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  tripLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 10 },
  tripNumBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripNumOT: { backgroundColor: Colors.accent + '30' },
  tripNum: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  tripInfo: { flex: 1 },
  tripMaterial: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  tripRoute: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  otBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent + '25',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  otBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.accentDark },
  tripRight: { alignItems: 'flex-end', gap: 2 },
  tripIncome: { fontSize: 13, fontWeight: '700', color: Colors.success },
  tripExpense: { fontSize: 12, color: Colors.error },
  chevron: { fontSize: 18, color: Colors.gray300, marginLeft: 4 },

  historyItem: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: Colors.gray200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  historyItemDone: { borderLeftColor: Colors.success },
  historyDate: { fontSize: 14, fontWeight: '700', color: Colors.gray900 },
  historyMeta: { fontSize: 13, color: Colors.gray500, marginTop: 2 },
  historyRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyStatus: { fontSize: 13, fontWeight: '600', color: Colors.gray400 },
  historyStatusDone: { color: Colors.success },

  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 10,
    backgroundColor: 'transparent',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    height: 54,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitIcon: { fontSize: 18 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
