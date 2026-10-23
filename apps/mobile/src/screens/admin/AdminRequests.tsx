import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, ScrollView,
  DeviceEventEmitter, Modal, TextInput, KeyboardAvoidingView, Platform, Image,
  StatusBar, useWindowDimensions,
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
  const [detailRequest, setDetailRequest] = useState<any | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

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
              <TouchableOpacity
                style={S.card}
                activeOpacity={0.85}
                onPress={() => setDetailRequest(req)}
              >
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
              </TouchableOpacity>
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

    {/* ── Modal chi tiết yêu cầu ── */}
    <Modal visible={!!detailRequest} transparent animationType="fade" onRequestClose={() => setDetailRequest(null)}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject }} activeOpacity={1} onPress={() => setDetailRequest(null)} />
        {detailRequest && (
          <View style={{ backgroundColor: Colors.white, borderRadius: 20, width: '100%', maxHeight: '85%', overflow: 'hidden' }}>
            {/* Header */}
            <View style={{ backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.white, flex: 1 }} numberOfLines={1}>{detailRequest.title}</Text>
              <TouchableOpacity onPress={() => setDetailRequest(null)}>
                <Text style={{ fontSize: 22, color: Colors.white, fontWeight: '700' }}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} showsVerticalScrollIndicator={false}>
              {/* Info rows */}
              {[
                ['Người gửi', detailRequest.created_by?.name ?? '—'],
                ['Loại', TYPE_LABEL[detailRequest.type] ?? detailRequest.type],
                ['Trạng thái', STATUS[detailRequest.status as keyof typeof STATUS]?.label ?? detailRequest.status],
                ['Ngày gửi', detailRequest.created_at ? format(parseISO(detailRequest.created_at), 'dd/MM/yyyy HH:mm', { locale: vi }) : '—'],
              ].map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray100 }}>
                  <Text style={{ fontSize: 13, color: Colors.gray500 }}>{k}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.gray900 }}>{v}</Text>
                </View>
              ))}

              {/* Payload */}
              {detailRequest.payload && Object.keys(detailRequest.payload).length > 0 && (
                <View style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.gray400, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Nội dung yêu cầu</Text>
                  {Object.entries(detailRequest.payload).map(([k, v]: any) => {
                    // Ẩn các field không cần hiển thị
                    if (['date', 'expense_type', 'image_url'].includes(k)) return null;

                    const keyLabel: Record<string, string> = {
                      amount: 'Số tiền', reason: 'Lý do', note: 'Ghi chú',
                      purpose: 'Mục đích', check_in_time: 'Giờ vào', check_out_time: 'Giờ ra',
                    };
                    const label = keyLabel[k] ?? k;
                    const display = typeof v === 'number' ? new Intl.NumberFormat('vi-VN').format(v) + (k === 'amount' ? 'đ' : '') : String(v);
                    return (
                      <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.gray50 }}>
                        <Text style={{ fontSize: 13, color: Colors.gray500, flex: 1 }}>{label}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.gray900, flex: 1.5, textAlign: 'right' }}>{display}</Text>
                      </View>
                    );
                  })}

                  {/* Ảnh đính kèm */}
                  {detailRequest.payload?.image_url && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.gray400, textTransform: 'uppercase', marginBottom: 6 }}>Ảnh đính kèm</Text>
                      <TouchableOpacity onPress={() => setLightboxUri(detailRequest.payload.image_url)} activeOpacity={0.85}>
                        <Image
                          source={{ uri: detailRequest.payload.image_url }}
                          style={{ width: '100%', height: 200, borderRadius: 12, resizeMode: 'cover' }}
                        />
                        <View style={{ position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ color: '#fff', fontSize: 11 }}>🔍 Nhấn để xem</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Actions nếu đang chờ duyệt */}
            {detailRequest.status === 'pending' && (
              <View style={{ flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: Colors.border }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#fee2e2', borderRadius: 12, height: 48, justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => { setDetailRequest(null); doReject(detailRequest._id, detailRequest.title); }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#991b1b' }}>❌ Từ chối</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: Colors.success, borderRadius: 12, height: 48, justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => { setDetailRequest(null); doApprove(detailRequest._id, detailRequest.title, detailRequest.type); }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.white }}>✅ Duyệt</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>

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
          <TouchableOpacity style={M.backdrop} onPress={() => setRejectTarget(null)} activeOpacity={1} />
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

    {/* Lightbox */}
    {lightboxUri && (
      <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    )}
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
  backdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.01)' },
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

function ImageLightbox({ uri, onClose }: { uri: string; onClose: () => void }) {
  const { width: SCREEN_W } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar hidden />
      <View style={LB.overlay}>
        <TouchableOpacity style={LB.closeBtn} onPress={onClose}>
          <Text style={LB.closeText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, justifyContent: 'center' }} onPress={onClose} activeOpacity={1}>
          <Image source={{ uri }} style={{ width: SCREEN_W, height: SCREEN_W * 1.4 }} resizeMode="contain" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const LB = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  closeBtn:  { position: 'absolute', top: 48, right: 20, zIndex: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  closeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
