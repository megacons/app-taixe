import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, TextInput, Modal,
  ScrollView, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import DatePickerField from '@/components/DatePickerField';
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
  const [showAdd, setShowAdd]     = useState(false);
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

  const MONTHS_UNUSED = null; // replaced by MonthYearPicker

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Quỹ tài xế</Text>
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
                <TouchableOpacity
                  style={S.addBtn}
                  onPress={(e) => { e.stopPropagation?.(); setSelDriver(d); setShowAdd(true); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={S.addBtnText}>+ Nạp quỹ</Text>
                </TouchableOpacity>
              </View>

              <View style={S.fundRow}>
                <View style={S.fundItem}>
                  <Text style={S.fundLabel}>Tổng ứng</Text>
                  <Text style={[S.fundValue, { color: '#3b82f6' }]}>{fmtVND(d.total_advance)}đ</Text>
                </View>
                <View style={S.fundItem}>
                  <Text style={S.fundLabel}>Đã chi</Text>
                  <Text style={[S.fundValue, { color: Colors.error }]}>{fmtVND(d.total_expense)}đ</Text>
                </View>
                <View style={S.fundItem}>
                  <Text style={S.fundLabel}>Còn lại</Text>
                  <Text style={[S.fundValue, {
                    color: d.remaining >= 0 ? Colors.success : Colors.error,
                    fontWeight: '800',
                  }]}>
                    {fmtVND(d.remaining)}đ
                  </Text>
                </View>
              </View>

              <View style={S.tripsRow}>
                <Text style={S.tripsText}>🚛 {d.total_trips} chuyến</Text>
                {d.overtime_trips > 0 && (
                  <Text style={S.otText}>🔥 {d.overtime_trips} tăng ca</Text>
                )}
                <Text style={S.tapHint}>Xem chi tiền →</Text>
              </View>
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

      {/* Nạp quỹ modal */}
      {showAdd && selDriver && (
        <AddFundModal
          driver={selDriver}
          month={`${year}-${String(month).padStart(2, '0')}`}
          onClose={() => { setShowAdd(false); setSelDriver(null); }}
          onSuccess={() => { setShowAdd(false); setSelDriver(null); fetchDrivers(); }}
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

/* ─── AddFundModal ──────────────────────────────────────── */
function AddFundModal({ driver, month, onClose, onSuccess }: any) {
  const [date,    setDate]    = useState(new Date());
  const [advance, setAdvance] = useState('');
  const [note,    setNote]    = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const amt = Number(advance.replace(/\./g, '').replace(/[^0-9]/g, '')) || 0;
    if (amt <= 0) { Alert.alert('Lỗi', 'Vui lòng nhập số tiền'); return; }
    setLoading(true);
    try {
      await api.post(`/fund/${driver.driver_id}/entries`, {
        date: format(date, 'yyyy-MM-dd'),
        advance: amt,
        expense: 0,
        note,
      });
      Alert.alert('✅ Thành công', `Đã nạp ${new Intl.NumberFormat('vi-VN').format(amt)}đ cho ${driver.full_name}`);
      onSuccess();
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể nạp quỹ');
    } finally { setLoading(false); }
  };

  return (
    <Modal visible transparent animationType="slide">
      <View style={M.overlay}>
        <TouchableOpacity style={M.backdrop} onPress={onClose} activeOpacity={1} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: '100%' }}
          keyboardVerticalOffset={0}
        >
          <View style={M.sheet}>
            <View style={M.header}>
              <TouchableOpacity onPress={onClose}><Text style={M.cancel}>Hủy</Text></TouchableOpacity>
              <Text style={M.title}>Nạp quỹ</Text>
              <View style={{ width: 40 }} />
            </View>
            <ScrollView
              contentContainerStyle={M.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={M.driverInfo}>
                <Text style={M.driverName}>{driver.full_name}</Text>
                <Text style={M.driverPlate}>🚛 {driver.license_plate}</Text>
              </View>

              <DatePickerField label="Ngày *" value={date} onChange={setDate} required />

              <View style={M.fieldGroup}>
                <Text style={M.label}>Số tiền ứng (VNĐ) *</Text>
                <View style={M.amountRow}>
                  <TextInput
                    style={M.amountInput}
                    value={advance}
                    onChangeText={v => setAdvance(fmtDisplay(v))}
                    placeholder="0"
                    placeholderTextColor={Colors.gray400}
                    keyboardType="numeric"
                    textAlign="right"
                    returnKeyType="next"
                  />
                  <Text style={M.unit}>đ</Text>
                </View>
                {advance ? <Text style={M.amountPreview}>= {advance}đ</Text> : null}
              </View>

              <View style={M.fieldGroup}>
                <Text style={M.label}>Ghi chú</Text>
                <TextInput
                  style={M.textarea}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Ghi chú (tùy chọn)..."
                  placeholderTextColor={Colors.gray400}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  returnKeyType="done"
                />
              </View>

              <TouchableOpacity
                style={[M.btn, loading && { opacity: 0.55 }]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={M.btnText}>💰 Nạp quỹ</Text>
                }
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ─── FundEntriesModal — các lần chi tiền trong tháng ──── */
function FundEntriesModal({ driver, month, year, onClose }: any) {
  const [entries, setEntries] = useState<any[]>([]);
  const [totals,  setTotals]  = useState({ advance: 0, expense: 0, remaining: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;

        const [fundRes, reqRes] = await Promise.all([
          api.get(`/fund/${driver.driver_id}/entries`, { params: { month, year } }),
          api.get('/requests', {
            params: { type: 'expense', driverId: driver.driver_id, limit: 200 },
          }),
        ]);

        const data = fundRes.data.data ?? {};

        // Mỗi request = 1 dòng riêng, tất cả trạng thái
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

        setEntries(filtered);
        setTotals({
          advance:   data.totals?.advance   ?? 0,
          expense:   data.totals?.expense   ?? 0,
          remaining: data.totals?.remaining ?? 0,
        });
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, [driver.driver_id, month, year]);

  return (
    <Modal visible transparent animationType="slide">
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
                  <Text style={[T.statValue, { color: '#3b82f6' }]}>{fmtVND(totals.advance)}đ</Text>
                  <Text style={T.statLabel}>Tổng ứng</Text>
                </View>
                <View style={T.statDivider} />
                <View style={T.statItem}>
                  <Text style={[T.statValue, { color: Colors.error }]}>{fmtVND(totals.expense)}đ</Text>
                  <Text style={T.statLabel}>Đã chi</Text>
                </View>
                <View style={T.statDivider} />
                <View style={T.statItem}>
                  <Text style={[T.statValue, { color: totals.remaining >= 0 ? Colors.success : Colors.error }]}>
                    {fmtVND(totals.remaining)}đ
                  </Text>
                  <Text style={T.statLabel}>Còn lại</Text>
                </View>
              </View>

              {entries.length === 0 ? (
                <View style={T.empty}>
                  <Text style={{ fontSize: 40 }}>💸</Text>
                  <Text style={T.emptyText}>Chưa có lần chi nào trong tháng này</Text>
                </View>
              ) : (
                <ScrollView contentContainerStyle={T.content} showsVerticalScrollIndicator={false}>
                  <Text style={T.listHeader}>{entries.length} yêu cầu chi</Text>
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
  fundRow:     { flexDirection: 'row' },
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

const M = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.primary, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  title:      { fontSize: 16, fontWeight: '700', color: Colors.white },
  cancel:     { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  content:    { padding: 20 },
  driverInfo: { backgroundColor: Colors.primary + '0d', borderRadius: 12, padding: 12, marginBottom: 16 },
  driverName: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  driverPlate:{ fontSize: 12, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  fieldGroup: { marginBottom: 16 },
  label:      { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  amountRow:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.gray300, borderRadius: 10, backgroundColor: Colors.white, paddingRight: 12 },
  amountInput:{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 20, fontWeight: '700', color: Colors.primary },
  unit:       { fontSize: 14, color: Colors.gray400 },
  amountPreview: { fontSize: 12, color: Colors.primary, marginTop: 4 },
  textarea:   { borderWidth: 1.5, borderColor: Colors.gray300, borderRadius: 10, padding: 12, fontSize: 14, color: Colors.gray900, minHeight: 80, textAlignVertical: 'top' },
  footer:     { padding: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16 },
  btn:        { backgroundColor: Colors.primary, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center' },
  btnText:    { fontSize: 15, fontWeight: '700', color: Colors.white },
});

const T = StyleSheet.create({
  overlay:   { flex: 1, justifyContent: 'flex-end' },
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:     { backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', minHeight: '70%' },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.primary, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
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
