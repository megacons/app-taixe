import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';

const now = new Date();
const fmtVND = (v: number) => new Intl.NumberFormat('vi-VN').format(Math.round(v ?? 0));

export default function AdminSalaryDetail() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { driverId, driverName } = route.params as { driverId: string; driverName: string };

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [data,  setData]  = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async (m: number, y: number) => {
    setLoading(true);
    try {
      const res = await api.get('/drivers/salary/list', { params: { month: m, year: y } });
      const list: any[] = res.data.data?.drivers ?? [];
      const d = list.find(x => x._id === driverId);
      setData(d ?? null);
    } catch (_) {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(month, year); }, []);

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1)  { m = 12; y -= 1; }
    if (m > 12) { m = 1;  y += 1; }
    setMonth(m); setYear(y);
    load(m, y);
  };

  const base    = (data?.base_salary ?? 0) + (data?.position_allowance ?? 0) + (data?.fuel_allowance ?? 0);
  const otPay   = data?.overtime_pay_month ?? 0;
  const advance = data?.advance_month ?? 0;
  const total   = base + otPay - advance;

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle} numberOfLines={1}>Lương — {driverName}</Text>
      </View>

      {/* Month selector */}
      <View style={S.monthRow}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={S.monthBtn}>
          <Text style={S.monthArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={S.monthLabel}>Tháng {month}/{year}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={S.monthBtn}>
          <Text style={S.monthArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : !data ? (
        <View style={S.empty}>
          <Text style={{ fontSize: 36 }}>💸</Text>
          <Text style={S.emptyText}>Không có dữ liệu lương tháng {month}/{year}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={S.content}>
          {[
            { label: 'Lương cơ bản',   value: `${fmtVND(base)}đ`,    color: Colors.gray900 },
            { label: 'Chuyến tăng ca', value: `${data.overtime_trips_month ?? 0} chuyến`, color: Colors.warning },
            { label: 'Tiền tăng ca',   value: `${fmtVND(otPay)}đ`,   color: Colors.warning },
            { label: 'Tiền ứng',       value: `-${fmtVND(advance)}đ`, color: Colors.error },
          ].map(row => (
            <View key={row.label} style={S.row}>
              <Text style={S.rowLabel}>{row.label}</Text>
              <Text style={[S.rowValue, { color: row.color }]}>{row.value}</Text>
            </View>
          ))}
          <View style={S.divider} />
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>Tổng lương thực nhận</Text>
            <Text style={[S.totalValue, { color: total >= 0 ? Colors.primary : Colors.error }]}>
              {fmtVND(total)}đ
            </Text>
          </View>
          {(data.bank_account || data.bank_name) && (
            <View style={S.bankCard}>
              <Text style={S.bankTitle}>Thông tin ngân hàng</Text>
              <Text style={S.bankText}>🏦 {data.bank_name ?? '—'}</Text>
              <Text style={S.bankText}>💳 {data.bank_account ?? '—'}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: Colors.background },
  header:     { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  backBtn:    { width: 36, height: 36, justifyContent: 'center' },
  backIcon:   { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle:{ fontSize: 17, fontWeight: '700', color: Colors.white, flex: 1 },
  monthRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 20, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  monthBtn:   { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  monthArrow: { fontSize: 24, color: Colors.primary, fontWeight: '700' },
  monthLabel: { fontSize: 16, fontWeight: '700', color: Colors.gray900, minWidth: 120, textAlign: 'center' },
  content:    { padding: 16, gap: 0 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  rowLabel:   { fontSize: 15, color: Colors.gray600 },
  rowValue:   { fontSize: 15, fontWeight: '700' },
  divider:    { height: 2, backgroundColor: Colors.gray200, marginVertical: 8 },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  totalValue: { fontSize: 22, fontWeight: '800' },
  bankCard:   { backgroundColor: Colors.white, borderRadius: 14, padding: 16, marginTop: 16, gap: 6, borderWidth: 1, borderColor: Colors.border },
  bankTitle:  { fontSize: 13, fontWeight: '700', color: Colors.gray500, marginBottom: 4 },
  bankText:   { fontSize: 14, color: Colors.gray700 },
  empty:      { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText:  { fontSize: 14, color: Colors.gray500, textAlign: 'center' },
});
