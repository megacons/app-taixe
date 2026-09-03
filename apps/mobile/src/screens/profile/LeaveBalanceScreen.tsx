import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

interface LeaveData {
  balance_days:  number;
  accrued_days:  number;
  used_days:     number;
  year:          number;
  hire_date:     string;
  leave_months:  number[];
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:  { bg: '#fef3c7', text: '#b45309', label: 'Chờ duyệt' },
  approved: { bg: '#d1fae5', text: '#065f46', label: 'Đã duyệt'  },
  rejected: { bg: '#fee2e2', text: '#991b1b', label: 'Từ chối'   },
};

const PAYLOAD_LABEL: Record<string, string> = {
  leave_type:  'Loại nghỉ',
  duration:    'Thời lượng',
  start_date:  'Ngày bắt đầu',
  end_date:    'Ngày kết thúc',
  start_time:  'Giờ bắt đầu',
  end_time:    'Giờ kết thúc',
  reason:      'Lý do',
  note:        'Ghi chú',
};

export default function LeaveBalanceScreen() {
  const navigation = useNavigation<any>();
  const [data,       setData]       = useState<LeaveData | null>(null);
  const [history,    setHistory]    = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected,   setSelected]   = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const [balRes, histRes] = await Promise.all([
        api.get('/requests/leave-balance'),
        api.get('/requests', { params: { type: 'leave', limit: 50 } }),
      ]);
      setData(balRes.data.data ?? null);
      const raw = histRes.data.data;
      setHistory(Array.isArray(raw) ? raw : (raw?.requests ?? []));
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.title}>Quản lý phép</Text>
        <TouchableOpacity style={S.requestBtn} onPress={() => navigation.navigate('LeaveRequest')}>
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
          {/* ── Thống kê ngày phép (gọn) ── */}
          {data && (
            <View style={S.heroCard}>
              <View style={S.heroTitleRow}>
                <Text style={S.heroEmoji}>🏖️</Text>
                <View>
                  <Text style={S.heroTitle}>Ngày phép năm {data.year}</Text>
                  <Text style={S.heroSub}>Tích lũy 1 ngày/tháng không nghỉ phép</Text>
                </View>
              </View>

              <View style={S.statsRow}>
                <View style={S.statItem}>
                  <Text style={[S.statNum, { color: '#fde68a' }]}>{data.balance_days ?? 0}</Text>
                  <Text style={S.statLabel}>Còn phép</Text>
                </View>
                <View style={S.statDivider} />
                <View style={S.statItem}>
                  <Text style={[S.statNum, { color: '#fca5a5' }]}>{data.used_days ?? 0}</Text>
                  <Text style={S.statLabel}>Đã nghỉ</Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Lịch sử yêu cầu ── */}
          <Text style={S.sectionTitle}>LỊCH SỬ YÊU CẦU NGHỈ</Text>
          {history.length === 0 ? (
            <View style={S.empty}>
              <Text style={{ fontSize: 40 }}>📅</Text>
              <Text style={S.emptyText}>Chưa có yêu cầu nghỉ nào</Text>
            </View>
          ) : (
            history.map(r => {
              const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;
              return (
                <TouchableOpacity
                  key={r._id}
                  style={S.histCard}
                  activeOpacity={0.75}
                  onPress={() => setSelected(r)}
                >
                  <View style={S.histLeft}>
                    <Text style={S.histType}>{r.payload?.leave_type ?? r.title}</Text>
                    <Text style={S.histDate}>
                      {String(r.payload?.start_date ?? '')}
                      {r.payload?.end_date && r.payload.end_date !== r.payload.start_date
                        ? ` → ${r.payload.end_date}` : ''}
                    </Text>
                    {r.payload?.reason
                      ? <Text style={S.histReason} numberOfLines={1}>{r.payload.reason}</Text>
                      : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[S.badge, { backgroundColor: st.bg }]}>
                      <Text style={[S.badgeText, { color: st.text }]}>{st.label}</Text>
                    </View>
                    <Text style={{ color: Colors.gray400, fontSize: 16 }}>›</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

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

      {/* ── Modal chi tiết yêu cầu ── */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            {/* Handle bar */}
            <View style={S.modalHandle} />

            {/* Header */}
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Chi tiết yêu cầu nghỉ</Text>
              <TouchableOpacity onPress={() => setSelected(null)} style={S.modalClose}>
                <Text style={{ fontSize: 20, color: Colors.gray500 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Status badge */}
                {(() => {
                  const st = STATUS_STYLE[selected.status] ?? STATUS_STYLE.pending;
                  return (
                    <View style={[S.modalStatusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[S.modalStatusText, { color: st.text }]}>{st.label}</Text>
                    </View>
                  );
                })()}

                {/* Tiêu đề */}
                <Text style={S.modalReqTitle}>{selected.title}</Text>

                {/* Ngày gửi */}
                <Text style={S.modalMeta}>
                  📅 {selected.created_at
                    ? format(parseISO(selected.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })
                    : '—'}
                </Text>

                {/* Divider */}
                <View style={S.divider} />

                {/* Payload fields */}
                {Object.entries(selected.payload ?? {}).map(([k, v]) => {
                  if (!v || k === 'attachments') return null;
                  return (
                    <View key={k} style={S.fieldRow}>
                      <Text style={S.fieldLabel}>{PAYLOAD_LABEL[k] ?? k.replace(/_/g, ' ')}</Text>
                      <Text style={S.fieldValue}>{String(v)}</Text>
                    </View>
                  );
                })}

                {/* Lý do từ chối nếu có */}
                {selected.status === 'rejected' && selected.rejection_reason && (
                  <View style={S.rejectBox}>
                    <Text style={S.rejectLabel}>Lý do từ chối</Text>
                    <Text style={S.rejectValue}>{selected.rejection_reason}</Text>
                  </View>
                )}

                <View style={{ height: 24 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  header:  { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  backIcon:{ fontSize: 22, color: '#fff', fontWeight: '700' },
  title:   { fontSize: 17, fontWeight: '700', color: '#fff' },
  requestBtn:     { backgroundColor: Colors.accent, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  requestBtnText: { fontSize: 13, fontWeight: '700', color: Colors.gray900 },

  content:      { padding: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },

  // Hero card
  heroCard:     { backgroundColor: Colors.primary, borderRadius: 16, padding: 20, marginBottom: 16 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  heroEmoji:    { fontSize: 36 },
  heroTitle:    { fontSize: 16, fontWeight: '800', color: '#fff' },
  heroSub:      { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  statsRow:    { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, overflow: 'hidden' },
  statItem:    { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 10 },
  statNum:     { fontSize: 28, fontWeight: '900', color: '#fff' },
  statLabel:   { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textAlign: 'center', marginTop: 2 },

  // History
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

  // Modal
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:       { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 40, maxHeight: '85%' },
  modalHandle:      { width: 40, height: 4, backgroundColor: Colors.gray200, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  modalTitle:       { fontSize: 16, fontWeight: '800', color: Colors.gray900 },
  modalClose:       { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  modalStatusBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  modalStatusText:  { fontSize: 12, fontWeight: '700' },
  modalReqTitle:    { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 4 },
  modalMeta:        { fontSize: 12, color: Colors.gray500, marginBottom: 12 },
  divider:          { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  fieldRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  fieldLabel:       { fontSize: 13, color: Colors.gray500, flex: 1 },
  fieldValue:       { fontSize: 13, fontWeight: '600', color: Colors.gray900, flex: 1, textAlign: 'right' },
  rejectBox:        { backgroundColor: '#fee2e2', borderRadius: 10, padding: 12, marginTop: 12 },
  rejectLabel:      { fontSize: 11, fontWeight: '700', color: '#991b1b', marginBottom: 4 },
  rejectValue:      { fontSize: 13, color: '#7f1d1d' },
});
