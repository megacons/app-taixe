import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import MonthYearPicker from '@/components/MonthYearPicker';

const fmtVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v ?? 0) + 'đ';
const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('vi-VN'); } catch { return iso; }
};

export default function PayslipScreen() {
  const navigation = useNavigation<any>();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const [data,        setData]        = useState<any>(null);
  const [advances,    setAdvances]    = useState<any[]>([]); // từng lần ứng
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [showAdvance, setShowAdvance] = useState(false); // modal chi tiết ứng

  const load = useCallback(async () => {
    try {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;

      const [driverRes, tripsRes, advanceRes] = await Promise.all([
        api.get('/drivers/profile/me'),
        api.get('/trips', { params: { month, year, limit: 500 } }),
        // Lấy từng yêu cầu ứng lương đã duyệt trong tháng
        api.get('/requests', { params: { type: 'salary_advance', status: 'approved', limit: 100 } }),
      ]);

      const driver = driverRes.data.data;
      const trips: any[] = tripsRes.data.data?.trips ?? [];
      const allAdvanceReqs: any[] = advanceRes.data.data?.requests ?? [];

      // Lọc theo tháng
      const monthAdvances = allAdvanceReqs.filter(r =>
        r.created_at?.slice(0, 7) === monthStr
      );
      const totalAdvance = monthAdvances.reduce((s, r) => s + (r.payload?.amount ?? 0), 0);

      // Lấy expense requests đã duyệt trong tháng
      const expenseRes = await api.get('/requests', { params: { type: 'expense', status: 'approved', limit: 100 } });
      const allExpenseReqs: any[] = expenseRes.data.data?.requests ?? [];
      const monthExpenses = allExpenseReqs.filter(r => {
        const d = r.payload?.date ?? r.created_at?.slice(0, 10) ?? '';
        return d.startsWith(monthStr);
      });
      const totalExpense = monthExpenses.reduce((s, r) => s + (r.payload?.amount ?? 0), 0);

      // Tính tăng ca theo ngày (mỗi ngày > 4 chuyến)
      const dayMap: Record<string, number> = {};
      trips.forEach((t: any) => {
        const d = t.trip_date?.slice(0, 10) ?? '';
        dayMap[d] = (dayMap[d] ?? 0) + 1;
      });
      const otTrips = Object.values(dayMap).reduce((s: number, c: number) => s + Math.max(0, c - 4), 0);

      const baseSalary        = driver.base_salary ?? 0;
      const positionAllowance = driver.position_allowance ?? 0;
      const fuelAllowance     = driver.fuel_allowance ?? 0;
      const overtimeRate      = driver.overtime_rate ?? 0;
      const overtimePay       = otTrips * overtimeRate;
      const totalIncome       = baseSalary + positionAllowance + fuelAllowance + overtimePay;
      const netSalary         = totalIncome + totalExpense - totalAdvance;

      setAdvances(monthAdvances);
      setData({
        driver,
        month, year,
        totalTrips: trips.length,
        otTrips,
        baseSalary,
        positionAllowance,
        fuelAllowance,
        overtimeRate,
        overtimePay,
        totalIncome,
        totalAdvance,
        totalExpense,
        netSalary,
      });
    } catch (_) {}
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.title}>Phiếu lương</Text>
        <View style={{ width: 44 }} />
      </View>

      <MonthYearPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : !data ? (
        <View style={S.emptyWrap}>
          <Text style={{ fontSize: 44 }}>💰</Text>
          <Text style={S.emptyText}>Không có dữ liệu</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={S.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {/* Hero card */}
          <View style={S.heroCard}>
            <Text style={S.heroLabel}>Lương thực nhận tháng {month}/{year}</Text>
            <Text style={[S.heroAmount, { color: data.netSalary >= 0 ? Colors.success : Colors.error }]}>
              {fmtVND(data.netSalary)}
            </Text>
            <Text style={S.heroSub}>
              {data.driver.full_name} · {data.totalTrips} chuyến
            </Text>
          </View>

          {/* Card gộp: Thu nhập + Khấu trừ */}
          <Text style={S.sectionTitle}>CHI TIẾT LƯƠNG</Text>
          <View style={S.card}>
            <Row icon="💼" label="Lương cơ bản"           value={fmtVND(data.baseSalary)} />
            {data.positionAllowance > 0 && (
              <Row icon="🏅" label="Phụ cấp chức vụ"       value={fmtVND(data.positionAllowance)} />
            )}
            {data.fuelAllowance > 0 && (
              <Row icon="⛽" label="Phụ cấp xăng xe"       value={fmtVND(data.fuelAllowance)} />
            )}
            <Row icon="🔥" label={`Tăng ca (${data.otTrips} chuyến × ${fmtVND(data.overtimeRate)})`}
              value={fmtVND(data.overtimePay)} color={Colors.accentDark} />
            <Row icon="💰" label="Tổng thu nhập"           value={fmtVND(data.totalIncome)} bold />

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: Colors.gray200, marginHorizontal: 16, marginVertical: 4 }} />

            {/* Chi phí đã chi — hoàn trả */}
            {data.totalExpense > 0 && (
              <Row icon="💸" label="Chi phí đã chi (hoàn trả)"
                value={`+ ${fmtVND(data.totalExpense)}`} color={Colors.success} />
            )}

            {/* Tiền ứng — nhấn để xem chi tiết */}
            <TouchableOpacity onPress={() => advances.length > 0 && setShowAdvance(true)} activeOpacity={0.7}>
              <View style={R.row}>
                <Text style={R.icon}>💵</Text>
                <View style={{ flex: 1 }}>
                  <Text style={R.label}>
                    Tiền ứng ({advances.length} lần)
                  </Text>
                  {advances.length > 0 && (
                    <Text style={{ fontSize: 11, color: Colors.primary, marginTop: 2 }}>
                      Nhấn để xem chi tiết →
                    </Text>
                  )}
                </View>
                <Text style={[R.value, { color: Colors.error }]}>
                  {data.totalAdvance > 0 ? `- ${fmtVND(data.totalAdvance)}` : fmtVND(0)}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Tổng cuối */}
          <View style={S.netCard}>
            <View style={S.netRow}>
              <Text style={S.netLabel}>💸 Lương thực nhận</Text>
              <Text style={[S.netValue, { color: data.netSalary >= 0 ? Colors.success : Colors.error }]}>
                {fmtVND(data.netSalary)}
              </Text>
            </View>
            {data.netSalary < 0 && (
              <Text style={{ fontSize: 11, color: Colors.error, marginTop: 6, textAlign: 'center' }}>
                ⚠️ Tiền ứng vượt quá lương tháng
              </Text>
            )}
          </View>

          <Text style={S.note}>
            * Tăng ca: mỗi ngày chạy trên 4 chuyến, số chuyến dư tính tăng ca{'\n'}
            * Chi phí hoàn trả: các yêu cầu chi đã được duyệt trong tháng, cộng vào lương{'\n'}
            * Tiền ứng: chỉ tính các yêu cầu đã được duyệt
          </Text>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* Modal chi tiết tiền ứng */}
      <Modal visible={showAdvance} transparent animationType="fade">
        <View style={M.overlay}>
          <TouchableOpacity style={M.backdrop} onPress={() => setShowAdvance(false)} activeOpacity={1} />
          <View style={M.sheet}>
            <View style={M.sheetHeader}>
              <Text style={M.sheetTitle}>Chi tiết tiền ứng</Text>
              <TouchableOpacity onPress={() => setShowAdvance(false)} style={M.closeBtn}>
                <Text style={M.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={advances}
              keyExtractor={i => i._id}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item, index }) => (
                <View style={M.item}>
                  <View style={M.itemLeft}>
                    <Text style={M.itemIndex}>{index + 1}</Text>
                    <View>
                      <Text style={M.itemDate}>{fmtDate(item.created_at)}</Text>
                      <Text style={M.itemReason} numberOfLines={2}>
                        {item.payload?.reason ?? item.title ?? '—'}
                      </Text>
                    </View>
                  </View>
                  <Text style={M.itemAmount}>- {fmtVND(item.payload?.amount ?? 0)}</Text>
                </View>
              )}
              ListFooterComponent={() => (
                <View style={M.footer}>
                  <Text style={M.footerLabel}>Tổng tiền ứng</Text>
                  <Text style={M.footerValue}>
                    - {fmtVND(advances.reduce((s, r) => s + (r.payload?.amount ?? 0), 0))}
                  </Text>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ icon, label, value, color, bold }: {
  icon: string; label: string; value: string;
  color?: string; bold?: boolean;
}) {
  return (
    <View style={R.row}>
      <Text style={R.icon}>{icon}</Text>
      <Text style={R.label}>{label}</Text>
      <Text style={[R.value, color ? { color } : {}, bold ? { fontWeight: '800' } : {}]}>
        {value}
      </Text>
    </View>
  );
}

const R = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  icon:  { fontSize: 18, width: 28 },
  label: { flex: 1, fontSize: 14, color: Colors.gray700 },
  value: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
});

const M = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' },
  backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.01)' },
  sheet:       { backgroundColor: Colors.white, borderRadius: 20, width: '100%', maxHeight: '75%', overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  sheetTitle:  { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.gray100, justifyContent: 'center', alignItems: 'center' },
  closeText:   { fontSize: 14, color: Colors.gray600, fontWeight: '700' },
  item:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  itemLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  itemIndex:   { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.gray100, textAlign: 'center', lineHeight: 22, fontSize: 11, fontWeight: '700', color: Colors.gray500 },
  itemDate:    { fontSize: 13, fontWeight: '600', color: Colors.gray800 },
  itemReason:  { fontSize: 12, color: Colors.gray500, marginTop: 2, maxWidth: 200 },
  itemAmount:  { fontSize: 14, fontWeight: '700', color: Colors.error },
  footer:      { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.gray50, borderTopWidth: 2, borderTopColor: Colors.gray200 },
  footerLabel: { fontSize: 14, fontWeight: '700', color: Colors.gray800 },
  footerValue: { fontSize: 15, fontWeight: '900', color: Colors.error },
});

const S = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  header:      { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14 },
  backBtn:     { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  backIcon:    { fontSize: 22, color: '#fff', fontWeight: '700' },
  title:       { fontSize: 17, fontWeight: '700', color: '#fff' },
  content:     { padding: 16 },
  sectionTitle:{ fontSize: 11, fontWeight: '700', color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  card:        { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, marginBottom: 4 },
  heroCard:    { backgroundColor: Colors.primary, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20 },
  heroLabel:   { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  heroAmount:  { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  heroSub:     { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6 },
  netCard:     { backgroundColor: Colors.success + '10', borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: Colors.success + '30' },
  netRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel:    { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  netValue:    { fontSize: 20, fontWeight: '900' },
  note:        { fontSize: 11, color: Colors.gray400, textAlign: 'center', marginTop: 16, fontStyle: 'italic', lineHeight: 18 },
  emptyWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText:   { fontSize: 14, color: Colors.gray500 },
});
