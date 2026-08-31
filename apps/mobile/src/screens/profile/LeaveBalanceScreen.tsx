import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

const MONTH_NAMES = ['Th1','Th2','Th3','Th4','Th5','Th6','Th7','Th8','Th9','Th10','Th11','Th12'];

interface LeaveData {
  balance_days:  number;
  accrued_days:  number;
  used_days:     number;
  year:          number;
  hire_date:     string;
  leave_months:  number[];
}

export default function LeaveBalanceScreen() {
  const navigation = useNavigation<any>();
  const [data,      setData]      = useState<LeaveData | null>(null);
  const [history,   setHistory]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  const load = useCallback(async () => {
    try {
      const [balRes, histRes] = await Promise.all([
        api.get('/requests/leave-balance'),
        api.get('/requests', { params: { type: 'leave', limit: 20 } }),
      ]);
      setData(balRes.data.data ?? null);
      const rawHistory = histRes.data.data;
      setHistory(
        Array.isArray(rawHistory)
          ? rawHistory
          : (rawHistory?.requests ?? [])
      );
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const currentMonth = new Date().getMonth(); // 0-indexed

  const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
    pending:  { bg: '#fef3c7', text: '#b45309', label: 'Chờ duyệt' },
    approved: { bg: '#d1fae5', text: '#065f46', label: 'Đã duyệt'  },
    rejected: { bg: '#fee2e2', text: '#991b1b', label: 'Từ chối'   },
  };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.title}>Quản lý phép</Text>
        <TouchableOpacity
          style={S.requestBtn}
          onPress={() => navigation.navigate('LeaveRequest')}
        >
          <Text style={S.requestBtnText}>+ Xin nghỉ</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          contentContainerStyle={S.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {/* ── Thống kê ngày phép ── */}
          {data && (
            <>
              <View style={S.heroCard}>
                {/* Title row */}
                <View style={S.heroTitleRow}>
                  <Text style={S.heroEmoji}>🏖️</Text>
                  <View>
                    <Text style={S.heroTitle}>Ngày phép năm {data.year}</Text>
                    <Text style={S.heroSub}>Tích lũy 1 ngày/tháng không nghỉ phép</Text>
                  </View>
                </View>

                {/* Stats table */}
                <View style={S.statsTable}>
                  {/* Top border */}
                  <View style={S.tableRow}>
                    <View style={[S.tableCell, S.tableCellFirst]}>
                      <Text style={S.statNum}>{String(data.accrued_days ?? 0)}</Text>
                      <Text style={S.statLabel}>Tổng tích lũy</Text>
                    </View>
                    <View style={S.tableCell}>
                      <Text style={[S.statNum, { color: '#fca5a5' }]}>{String(data.used_days ?? 0)}</Text>
                      <Text style={S.statLabel}>Đã nghỉ</Text>
                    </View>
                    <View style={[S.tableCell, S.tableCellLast]}>
                      <Text style={[S.statNum, { color: '#fde68a' }]}>{String(data.balance_days ?? 0)}</Text>
                      <Text style={S.statLabel}>Còn lại</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* ── Lịch tháng ── */}
              <Text style={S.sectionTitle}>THÁNG CÓ PHÉP</Text>
              <View style={S.monthGrid}>
                {MONTH_NAMES.map((name, i) => {
                  const hasLeave   = data.leave_months.includes(i);
                  const isCurrent  = i === currentMonth;
                  const isPast     = i < currentMonth;
                  return (
                    <View
                      key={i}
                      style={[
                        S.monthCell,
                        hasLeave   && S.monthCellLeave,
                        isCurrent  && S.monthCellCurrent,
                        !isPast && !isCurrent && S.monthCellFuture,
                      ]}
                    >
                      <Text style={[
                        S.monthName,
                        hasLeave   && S.monthNameLeave,
                        isCurrent  && S.monthNameCurrent,
                        !isPast && !isCurrent && S.monthNameFuture,
                      ]}>
                        {name}
                      </Text>
                      {hasLeave && <Text style={S.monthDot}>✕</Text>}
                      {!hasLeave && isPast && <Text style={S.monthDotGreen}>+1</Text>}
                    </View>
                  );
                })}
              </View>
              <Text style={S.monthLegend}>
                {'  '}<Text style={{ color: Colors.success }}>+1</Text>
                {' = tháng tích lũy phép    '}
                <Text style={{ color: Colors.error }}>✕</Text>
                {' = tháng đã có phép'}
              </Text>
            </>
          )}

          {/* ── Lịch sử yêu cầu ── */}
          <Text style={[S.sectionTitle, { marginTop: 20 }]}>LỊCH SỬ YÊU CẦU NGHỈ</Text>
          {history.length === 0 ? (
            <View style={S.empty}>
              <Text style={{ fontSize: 40 }}>📅</Text>
              <Text style={S.emptyText}>Chưa có yêu cầu nghỉ nào</Text>
            </View>
          ) : (
            history.map(r => {
              const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;
              return (
                <View key={r._id} style={S.histCard}>
                  <View style={S.histLeft}>
                    <Text style={S.histType}>{r.payload?.leave_type ?? r.title}</Text>
                    <Text style={S.histDate}>
                      {String(r.payload?.start_date ?? '')}{r.payload?.end_date && r.payload.end_date !== r.payload.start_date
                        ? ` → ${String(r.payload.end_date)}` : ''}
                    </Text>
                    {r.payload?.reason ? <Text style={S.histReason} numberOfLines={1}>{r.payload.reason}</Text> : null}
                  </View>
                  <View style={[S.badge, { backgroundColor: st.bg }]}>
                    <Text style={[S.badgeText, { color: st.text }]}>{st.label}</Text>
                  </View>
                </View>
              );
            })
          )}

          {/* Nút xin nghỉ phép */}
          <TouchableOpacity
            style={S.bigBtn}
            onPress={() => navigation.navigate('LeaveRequest')}
            activeOpacity={0.85}
          >
            <Text style={S.bigBtnText}>🏖️ Gửi yêu cầu nghỉ phép</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  header:  { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  backIcon:{ fontSize: 22, color: '#fff', fontWeight: '700' },
  title:   { fontSize: 17, fontWeight: '700', color: '#fff' },
  requestBtn:    { backgroundColor: Colors.accent, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  requestBtnText:{ fontSize: 13, fontWeight: '700', color: Colors.gray900 },

  content: { padding: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },

  heroCard:  { backgroundColor: Colors.primary, borderRadius: 16, padding: 20, marginBottom: 16 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  heroEmoji: { fontSize: 36 },
  heroTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  heroSub:   { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  statsTable: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  tableRow:   { flexDirection: 'row' },
  tableCell:  { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.25)' },
  tableCellFirst: { borderLeftWidth: 0 },
  tableCellLast:  {},
  statNum:   { fontSize: 28, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textAlign: 'center', marginTop: 2 },

  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  monthCell: { width: '22%', paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.success + '20', borderWidth: 1, borderColor: Colors.success + '40' },
  monthCellLeave:   { backgroundColor: Colors.error + '15', borderColor: Colors.error + '40' },
  monthCellCurrent: { borderWidth: 2, borderColor: Colors.primary },
  monthCellFuture:  { backgroundColor: Colors.gray100, borderColor: Colors.gray200 },
  monthName:       { fontSize: 12, fontWeight: '700', color: Colors.success },
  monthNameLeave:  { color: Colors.error },
  monthNameCurrent:{ color: Colors.primary },
  monthNameFuture: { color: Colors.gray400 },
  monthDot:        { fontSize: 10, color: Colors.error, fontWeight: '800', marginTop: 2 },
  monthDotGreen:   { fontSize: 10, color: Colors.success, fontWeight: '800', marginTop: 2 },
  monthLegend:     { fontSize: 11, color: Colors.gray500, textAlign: 'center', marginBottom: 4 },

  histCard:  { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  histLeft:  { flex: 1, marginRight: 10 },
  histType:  { fontSize: 14, fontWeight: '700', color: Colors.gray900 },
  histDate:  { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  histReason:{ fontSize: 11, color: Colors.gray400, marginTop: 2, fontStyle: 'italic' },
  badge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  bigBtn:    { backgroundColor: Colors.primary, borderRadius: 14, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  bigBtnText:{ fontSize: 16, fontWeight: '700', color: '#fff' },

  empty:     { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.gray500 },
});
