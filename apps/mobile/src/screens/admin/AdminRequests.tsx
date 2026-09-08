import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, ScrollView,
  DeviceEventEmitter, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useSocket } from '@/hooks/useSocket';

const STATUS = {
  pending:   { bg: '#fef3c7', text: '#b45309', label: 'Chờ duyệt' },
  approved:  { bg: '#d1fae5', text: '#065f46', label: 'Đã duyệt' },
  rejected:  { bg: '#fee2e2', text: '#991b1b', label: 'Từ chối' },
  completed: { bg: '#dbeafe', text: '#1e40af', label: 'Hoàn thành' },
};

const TYPE_LABEL: Record<string, string> = {
  salary_advance: 'Tạm ứng', leave: 'Nghỉ phép',
  expense: 'Chi phí', purchase: 'Mua hàng',
  additional_trip: 'Thêm chuyến', attendance_adjustment: 'Đổi giờ',
  reward: 'Khen thưởng', discipline: 'Kỷ luật',
};

const FILTERS = [
  { key: '',         label: 'Tất cả' },
  { key: 'pending',  label: '⏳ Chờ duyệt' },
  { key: 'approved', label: '✅ Đã duyệt' },
  { key: 'rejected', label: '❌ Từ chối' },
];

export default function AdminRequests() {
  const navigation = useNavigation<any>();
  const [requests, setRequests]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [approving, setApproving] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchRequests = useCallback(async (status = statusFilter) => {
    try {
      const params: any = { limit: 50 };
      if (status) params.status = status;
      const res = await api.get('/requests', { params });
      setRequests(res.data.data?.requests ?? []);
    } catch (_) {}
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchRequests(statusFilter); }, [statusFilter]);

  // Realtime: join admin room, nhận new:request + request:updated → refresh + bridge
  useSocket({
    rooms: ['join:admin'],
    events: {
      'new:request': (data: any) => {
        fetchRequests(statusFilter);
        DeviceEventEmitter.emit('NEW_REQUEST', data);
      },
      'request:updated': (data: any) => {
        fetchRequests(statusFilter);
        DeviceEventEmitter.emit('REQUEST_UPDATED', data);
      },
    },
  });

  const onRefresh = async () => { setRefreshing(true); await fetchRequests(statusFilter); setRefreshing(false); };

  const doApprove = async (id: string, title: string, type: string) => {
    Alert.alert('Duyệt yêu cầu', `Duyệt "${title}"?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: '✅ Duyệt', onPress: async () => {
        setApproving(id);
        try {
          const res = await api.put(`/requests/${id}/approve`, { comment: 'Admin duyệt' });
          setRequests(prev => prev.filter(r => r._id !== id));

          // Check quỹ không đủ sau khi duyệt expense
          const insuf = res.data?.insufficient_fund;
          if (insuf && type === 'expense') {
            const shortage = new Intl.NumberFormat('vi-VN').format(insuf.shortage);
            const balance  = new Intl.NumberFormat('vi-VN').format(insuf.current_balance);
            Alert.alert(
              '⚠️ Quỹ tài xế không đủ',
              `Đã duyệt thành công.\n\nQuỹ hiện tại: ${balance}đ\nThiếu: ${shortage}đ\n\nBạn có muốn nạp tiền vào quỹ ngay không?`,
              [
                { text: 'Để sau', style: 'cancel' },
                { text: '💰 Nạp tiền ngay', onPress: () => navigation.navigate('Fund') },
              ]
            );
          }
        } catch (e: any) { Alert.alert('Lỗi', e?.response?.data?.message ?? 'Thất bại'); }
        finally { setApproving(null); }
      }},
    ]);
  };

  const doReject = async (id: string, title: string) => {
    setRejectTarget({ id, title });
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setApproving(rejectTarget.id);
    try {
      await api.put(`/requests/${rejectTarget.id}/reject`, {
        rejection_reason: rejectReason.trim() || 'Admin từ chối',
      });
      setRequests(prev => prev.filter(r => r._id !== rejectTarget.id));
      setRejectTarget(null);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Thất bại');
    } finally {
      setApproving(null);
    }
  };

  return (
    <>
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Quản lý yêu cầu</Text>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.filterBar} contentContainerStyle={S.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[S.chip, statusFilter === f.key && S.chipActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[S.chipText, statusFilter === f.key && S.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} /> : (
        <FlatList
          data={requests}
          keyExtractor={r => r._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={S.listContent}
          renderItem={({ item: req }) => {
            const st = STATUS[req.status as keyof typeof STATUS] ?? STATUS.pending;
            const isLoading = approving === req._id;
            return (
              <View style={S.card}>
                <View style={S.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.reqTitle} numberOfLines={1}>{req.title}</Text>
                    <Text style={S.reqMeta}>
                      {req.created_by?.name ?? '—'}  •  {req.created_at ? format(parseISO(req.created_at), 'dd/MM/yyyy', { locale: vi }) : '—'}
                    </Text>
                  </View>
                  <View style={[S.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[S.statusText, { color: st.text }]}>{st.label}</Text>
                  </View>
                </View>

                <View style={S.tagRow}>
                  <View style={S.typeBadge}>
                    <Text style={S.typeBadgeText}>{TYPE_LABEL[req.type] ?? req.type}</Text>
                  </View>
                  {req.payload?.amount > 0 && (
                    <Text style={S.amount}>💰 {new Intl.NumberFormat('vi-VN').format(req.payload.amount)}đ</Text>
                  )}
                </View>

                {req.payload?.reason && (
                  <Text style={S.reason} numberOfLines={2}>{req.payload.reason}</Text>
                )}

                {req.status === 'pending' && (
                  <View style={S.actions}>
                    <TouchableOpacity
                      style={[S.rejectBtn, isLoading && { opacity: 0.5 }]}
                      onPress={() => doReject(req._id, req.title)}
                      disabled={isLoading}
                    >
                      <Text style={S.rejectText}>❌ Từ chối</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[S.approveBtn, isLoading && { opacity: 0.5 }]}
                      onPress={() => doApprove(req._id, req.title, req.type)}
                      disabled={isLoading}
                    >
                      {isLoading
                        ? <ActivityIndicator size="small" color={Colors.white} />
                        : <Text style={S.approveText}>✅ Duyệt</Text>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{ fontSize: 40 }}>📋</Text>
              <Text style={S.emptyText}>Không có yêu cầu nào</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>

    {/* ── Modal nhập lý do từ chối ── */}
    <Modal
      visible={!!rejectTarget}
      transparent
      animationType="fade"
      onRequestClose={() => setRejectTarget(null)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={M.overlay}>
          <View style={M.sheet}>
            <Text style={M.title}>Lý do từ chối</Text>
            <Text style={M.subtitle} numberOfLines={2}>
              "{rejectTarget?.title}"
            </Text>
            <TextInput
              style={M.input}
              placeholder="Nhập lý do từ chối (không bắt buộc)..."
              placeholderTextColor={Colors.gray400}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoFocus
            />
            <View style={M.actions}>
              <TouchableOpacity
                style={M.cancelBtn}
                onPress={() => setRejectTarget(null)}
              >
                <Text style={M.cancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[M.rejectBtn, approving ? { opacity: 0.6 } : {}]}
                onPress={confirmReject}
                disabled={!!approving}
              >
                {approving
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={M.rejectText}>❌ Xác nhận từ chối</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}

const S = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  header:      { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn:     { width: 36, height: 36, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.white, flex: 1 },
  filterBar:   { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 52 },
  filterContent:{ paddingHorizontal: 12, paddingVertical: 6, gap: 8, paddingRight: 20 },
  chip:        { height: 32, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 8, borderWidth: 1.5, borderColor: Colors.gray200, backgroundColor: Colors.white },
  chipActive:  { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  chipText:    { fontSize: 12, fontWeight: '600', color: Colors.gray600 },
  chipTextActive:{ color: Colors.primary },
  listContent: { padding: 12, paddingBottom: 32 },
  card:        { backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reqTitle:    { fontSize: 14, fontWeight: '700', color: Colors.gray900 },
  reqMeta:     { fontSize: 11, color: Colors.gray500, marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  tagRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge:   { backgroundColor: Colors.primary + '12', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText:{ fontSize: 11, fontWeight: '700', color: Colors.primary },
  amount:      { fontSize: 13, fontWeight: '700', color: Colors.success },
  reason:      { fontSize: 12, color: Colors.gray500, fontStyle: 'italic' },
  actions:     { flexDirection: 'row', gap: 8 },
  rejectBtn:   { flex: 1, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.error, justifyContent: 'center', alignItems: 'center' },
  rejectText:  { fontSize: 13, fontWeight: '600', color: Colors.error },
  approveBtn:  { flex: 1, height: 40, borderRadius: 10, backgroundColor: Colors.success, justifyContent: 'center', alignItems: 'center' },
  approveText: { fontSize: 13, fontWeight: '600', color: Colors.white },
  empty:       { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText:   { fontSize: 14, color: Colors.gray500 },
});

const M = StyleSheet.create({
  overlay:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:     { backgroundColor: '#fff', borderRadius: 20, width: '100%', padding: 20, paddingBottom: 24 },
  title:     { fontSize: 17, fontWeight: '800', color: Colors.gray900, marginBottom: 6 },
  subtitle:  { fontSize: 13, color: Colors.gray500, marginBottom: 14, fontStyle: 'italic' },
  input:     { borderWidth: 1.5, borderColor: Colors.gray200, borderRadius: 10, padding: 12, fontSize: 14, color: Colors.gray900, minHeight: 80, textAlignVertical: 'top', backgroundColor: '#fafafa', marginBottom: 16 },
  actions:   { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, height: 46, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.gray300, justifyContent: 'center', alignItems: 'center' },
  cancelText:{ fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  rejectBtn: { flex: 2, height: 46, borderRadius: 10, backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center' },
  rejectText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
});
