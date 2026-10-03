import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import MonthYearPicker from '@/components/MonthYearPicker';

const fmtVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v);
const fmtDisplay = (v: string) => {
  const nums = v.replace(/\./g, '').replace(/[^0-9]/g, '');
  return nums ? new Intl.NumberFormat('vi-VN').format(Number(nums)) : '';
};

export default function AdminFund() {
  const navigation = useNavigation<any>();
  const now = new Date();
  const [month, setMonth]         = useState(now.getMonth() + 1);
  const [year,  setYear]          = useState(now.getFullYear());
  const [drivers, setDrivers]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showEntries, setShowEntries] = useState(false);
  const [selDriver, setSelDriver] = useState<any>(null);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await api.get('/fund/drivers', { params: { month, year } });
      setDrivers(res.data.data?.drivers ?? []);
    } catch (_) {}
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { fetchDrivers(); }, [month, year]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDrivers();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Chi phí tài xế</Text>
      </View>

      {/* Month/Year selector */}
      <MonthYearPicker
        month={month}
        year={year}
        onChange={(m, y) => { setMonth(m); setYear(y); }}
      />

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={d => d.driver_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={S.listContent}
          renderItem={({ item: d }) => (
            <TouchableOpacity
              style={S.card}
              activeOpacity={0.85}
              onPress={() => { setSelDriver(d); setShowEntries(true); }}
            >
              <View style={S.cardTop}>
                <View style={S.avatar}>
                  <Text style={S.avatarText}>{d.full_name?.charAt(0)?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.name}>{d.full_name}</Text>
                  <Text style={S.plate}>🚛 {d.license_plate}</Text>
                </View>
              </View>

              <View style={S.fundRow}>
                <View style={S.fundItem}>
                  <Text style={S.fundLabel}>Tổng chi phí</Text>
                  <Text style={[S.fundValue, { color: Colors.error }]}>{fmtVND(d.total_expense)}đ</Text>
                </View>
                <View style={S.fundItem}>
                  <Text style={S.fundLabel}>Số chuyến</Text>
                  <Text style={[S.fundValue, { color: Colors.primary }]}>{d.total_trips} chuyến</Text>
                </View>
                {d.overtime_trips > 0 && (
                  <View style={S.fundItem}>
                    <Text style={S.fundLabel}>Tăng ca</Text>
                    <Text style={[S.fundValue, { color: Colors.accentDark }]}>🔥 {d.overtime_trips}</Text>
                  </View>
                )}
              </View>

              <Text style={S.tapHint}>Xem chi tiết →</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{ fontSize: 40 }}>💼</Text>
              <Text style={S.emptyText}>Không có dữ liệu</Text>
            </View>
          }
        />
      )}

      {/* Xem các lần chi tiền modal */}
      {showEntries && selDriver && (
        <FundEntriesModal
          driver={selDriver}
          month={month}
          year={year}
          onClose={() => { setShowEntries(false); setSelDriver(null); }}
        />
      )}
    </SafeAreaView>
  );
}

/* ─── FundEntriesModal — các lần chi tiền trong tháng ──── */
function FundEntriesModal({ driver, month, year, onClose }: any) {
  const [entries, setEntries] = useState<any[]>([]);
  const [totals,  setTotals]  = useState({ total: 0, approved: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;
        const reqRes = await api.get('/requests', {
          params: { type: 'expense', driverId: driver.driver_id, limit: 200 },
        });

        const allReqs: any[] = reqRes.data.data?.requests ?? [];
        const filtered = allReqs
          .filter(r => {
            const d = r.payload?.date ?? r.created_at?.slice(0, 10) ?? '';
            return d.startsWith(monthStr);
          })
          .map(r => ({
            _id:    r._id,
            date:   r.payload?.date ?? r.created_at?.slice(0, 10) ?? '',
            amount: r.payload?.amount ?? 0,
            note:   r.payload?.note ?? '',
            title:  r.title ?? '',
            status: r.status,
          }))
          .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

        const totalAll      = filtered.reduce((s, r) => s + r.amount, 0);
        const totalApproved = filtered.filter(r => r.status === 'approved').reduce((s, r) => s + r.amount, 0);
        setEntries(filtered);
        setTotals({ total: totalAll, approved: totalApproved });
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, [driver.driver_id, month, year]);

  return (
    <Modal visible transparent animationType="fade">
      <View style={T.overlay}>
        <TouchableOpacity style={T.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={T.sheet}>
          {/* Header */}
          <View style={T.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={T.cancel}>← Đóng</Text>
            </TouchableOpacity>
            <Text style={T.title} numberOfLines={1}>{driver.full_name}</Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Sub-header */}
          <View style={T.subHeader}>
            <Text style={T.subInfo}>🚛 {driver.license_plate}</Text>
            <Text style={T.subInfo}>Tháng {month}/{year}</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ flex: 1, marginTop: 40 }} />
          ) : (
            <>
              {/* Stats */}
              <View style={T.statsBar}>
                <View style={T.statItem}>
                  <Text style={[T.statValue, { color: Colors.error }]}>{fmtVND(totals.total)}đ</Text>
                  <Text style={T.statLabel}>Tổng chi phí</Text>
                </View>
                <View style={T.statDivider} />
                <View style={T.statItem}>
                  <Text style={[T.statValue, { color: Colors.success }]}>{fmtVND(totals.approved)}đ</Text>
                  <Text style={T.statLabel}>Đã duyệt hoàn trả</Text>
                </View>
              </View>

              {entries.length === 0 ? (
                <View style={T.empty}>
                  <Text style={{ fontSize: 40 }}>💸</Text>
                  <Text style={T.emptyText}>Chưa có lần chi nào trong tháng này</Text>
                </View>
              ) : (
                <ScrollView contentContainerStyle={T.content} showsVerticalScrollIndicator={false}>
                  <Text style={T.listHeader}>{entries.length} yêu cầu hoàn chi</Text>
                  {entries.map((e, idx) => {
                    const d = e.date ? new Date(e.date + 'T00:00:00') : null;
                    const dayLabel = d && !isNaN(d.getTime())
                      ? `${['CN','T2','T3','T4','T5','T6','T7'][d.getDay()]} ${format(d, 'dd/MM/yyyy', { locale: vi })}`
                      : e.date ?? '—';
                    const ST: Record<string, { bg: string; text: string; label: string }> = {
                      approved: { bg: '#d1fae5', text: '#065f46', label: 'Đã duyệt'  },
                      pending:  { bg: '#fef3c7', text: '#b45309', label: 'Chờ duyệt' },
                      rejected: { bg: '#fee2e2', text: '#991b1b', label: 'Từ chối'   },
                    };
                    const st = ST[e.status] ?? ST.pending;
                    return (
                      <View key={String(e._id ?? idx)} style={T.entryRow}>
                        <View style={T.entryIcon}>
                          <Text style={{ fontSize: 18 }}>💸</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={T.entryDate}>{dayLabel}</Text>
                          {e.note ? (
                            <Text style={T.entryNote} numberOfLines={2}>{e.note}</Text>
                          ) : e.title ? (
                            <Text style={T.entryNote} numberOfLines={1}>{e.title}</Text>
                          ) : null}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 3 }}>
                          <Text style={T.entryAmount}>-{fmtVND(e.amount)}đ</Text>
                          <View style={[T.badge, { backgroundColor: st.bg }]}>
                            <Text style={[T.badgeText, { color: st.text }]}>{st.label}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                  <View style={{ height: 20 }} />
                </ScrollView>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ─── Styles ─────────────────────────────────────────────── */
const S = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  header:      { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn:     { width: 36, height: 36, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.white, flex: 1 },
  monthRow:    { display: 'none' } as any,
  monthScroll: {} as any,
  monthChip:   {} as any,
  monthChipActive: {} as any,
  monthChipText:   {} as any,
  monthChipTextActive: {} as any,
  yearRow:     {} as any,
  yearChip:    {} as any,
  yearChipActive: {} as any,
  yearText:    {} as any,
  yearTextActive: {} as any,
  listContent: { padding: 12, paddingBottom: 32 },
  card:        { backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  cardTop:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { fontSize: 16, fontWeight: '700', color: Colors.white },
  name:        { fontSize: 14, fontWeight: '700', color: Colors.gray900 },
  plate:       { fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 1 },
  addBtn:      { backgroundColor: Colors.primary, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  addBtnText:  { fontSize: 11, fontWeight: '700', color: Colors.white },
  fundRow:     { flexDirection: 'row', gap: 8 },
  fundItem:    { flex: 1, alignItems: 'center' },
  fundLabel:   { fontSize: 10, color: Colors.gray500, fontWeight: '600' },
  fundValue:   { fontSize: 13, fontWeight: '700', marginTop: 2 },
  tripsRow:    { flexDirection: 'row', gap: 12, alignItems: 'center' },
  tripsText:   { fontSize: 12, color: Colors.gray600 },
  otText:      { fontSize: 12, color: Colors.accentDark, fontWeight: '600' },
  tapHint:     { fontSize: 11, color: Colors.primary, marginLeft: 'auto', fontWeight: '600' },
  empty:       { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText:   { fontSize: 14, color: Colors.gray500 },
});

const T = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.65)' },
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  sheet:      { backgroundColor: Colors.background, borderRadius: 20, width: '100%', maxHeight: '90%', overflow: 'hidden' },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.primary },
  title:     { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  cancel:    { fontSize: 13, color: 'rgba(255,255,255,0.85)', width: 60 },
  subHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Colors.primary + '18', paddingHorizontal: 16, paddingVertical: 8 },
  subInfo:   { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  statsBar:    { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  statItem:    { flex: 1, alignItems: 'center', paddingVertical: 10 },
  statValue:   { fontSize: 14, fontWeight: '800', color: Colors.primary },
  statLabel:   { fontSize: 10, color: Colors.gray500, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 8 },

  content:    { padding: 14, paddingBottom: 8 },
  listHeader: { fontSize: 12, fontWeight: '700', color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  entryRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  entryIcon:  { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.error + '15', justifyContent: 'center', alignItems: 'center' },
  entryDate:  { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  entryNote:  { fontSize: 11, color: Colors.gray500, marginTop: 2, fontStyle: 'italic' },
  entryAmount:{ fontSize: 15, fontWeight: '800', color: Colors.error },
  badge:      { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText:  { fontSize: 10, fontWeight: '700' },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText:  { fontSize: 14, color: Colors.gray500, textAlign: 'center' },
});


