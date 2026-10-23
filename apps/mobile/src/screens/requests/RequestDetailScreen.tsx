import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image, Modal, StatusBar, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  pending:   { label: 'Chờ duyệt',  bg: '#fef3c7', text: '#b45309' },
  approved:  { label: 'Đã duyệt',   bg: '#d1fae5', text: '#065f46' },
  rejected:  { label: 'Từ chối',    bg: '#fee2e2', text: '#991b1b' },
  completed: { label: 'Hoàn thành', bg: '#dbeafe', text: '#1e40af' },
  cancelled: { label: 'Đã hủy',     bg: '#f3f4f6', text: '#374151' },
};

const TYPE_MAP: Record<string, string> = {
  salary_advance:         'Tạm ứng lương',
  leave:                  'Nghỉ phép',
  expense:                'Thanh toán chi phí',
  purchase:               'Mua hàng',
  additional_trip:        'Thêm số chuyến',
  attendance_adjustment:  'Điều chỉnh giờ',
  reward:                 'Khen thưởng',
  discipline:             'Kỷ luật',
};

const ACTION_ICON: Record<string, string> = {
  created:   '📝',
  submitted: '📤',
  approved:  '✅',
  rejected:  '❌',
  completed: '🎉',
  cancelled: '🚫',
  updated:   '✏️',
};

export default function RequestDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { requestId } = route.params as { requestId: string };

  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  useEffect(() => {
    fetchDetail();
  }, [requestId]);

  const fetchDetail = async () => {
    try {
      const res = await api.get(`/requests/${requestId}`);
      setRequest(res.data.data);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải thông tin yêu cầu.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={S.safe} edges={['top']}>
        <Header title="Chi tiết yêu cầu" />
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!request) return null;

  const st  = STATUS_MAP[request.status] ?? STATUS_MAP.pending;
  const fmt = (d: string) => format(parseISO(d), 'HH:mm dd/MM/yyyy', { locale: vi });

  /* ── Build info rows from payload ── */
  const payloadRows = buildPayloadRows(request.type, request.payload ?? {});

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <Header title="Chi tiết yêu cầu" />

      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>

        {/* ── Status banner ── */}
        <View style={[S.statusBanner, { backgroundColor: st.bg }]}>
          <Text style={[S.statusBannerText, { color: st.text }]}>
            {TYPE_MAP[request.type] ?? request.type}  •  {st.label}
          </Text>
          {request.request_number && (
            <Text style={[S.statusBannerSub, { color: st.text + 'aa' }]}>
              #{request.request_number}
            </Text>
          )}
        </View>

        {/* ── Thông tin chung ── */}
        <View style={S.card}>
          <Text style={S.cardTitle}>Thông tin chung</Text>
          <InfoRow label="Tiêu đề"    value={request.title} />
          <InfoRow label="Người gửi"  value={request.created_by?.name ?? '—'} />
          <InfoRow label="Ngày gửi"   value={fmt(request.created_at)} />
          {request.approved_by && (
            <InfoRow label="Người duyệt" value={request.approved_by?.name ?? '—'} />
          )}
          {request.approved_at && (
            <InfoRow label="Ngày duyệt" value={fmt(request.approved_at)} />
          )}
          {request.rejection_reason && (
            <InfoRow label="Lý do từ chối" value={request.rejection_reason}
              valueStyle={{ color: Colors.error }} />
          )}
        </View>

        {/* ── Chi tiết yêu cầu (payload) ── */}
        {payloadRows.length > 0 && (
          <View style={S.card}>
            <Text style={S.cardTitle}>Chi tiết</Text>
            {payloadRows.map(r => (
              <InfoRow key={r.label} label={r.label} value={r.value}
                valueStyle={r.highlight ? { color: Colors.primary, fontWeight: '700' } : undefined} />
            ))}
          </View>
        )}

        {/* ── Ảnh đính kèm từ payload.image_url ── */}
        {request.payload?.image_url && (
          <View style={S.card}>
            <Text style={S.cardTitle}>Ảnh đính kèm</Text>
            <TouchableOpacity onPress={() => setLightboxUri(request.payload.image_url)} activeOpacity={0.85}>
              <Image
                source={{ uri: request.payload.image_url }}
                style={{ width: '100%', height: 220, borderRadius: 12, resizeMode: 'cover', marginTop: 8 }}
              />
              <View style={{ position: 'absolute', bottom: 16, left: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: '#fff', fontSize: 11 }}>🔍 Nhấn để xem</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Lightbox */}
        {lightboxUri && (
          <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
        )}

        {/* ── Đính kèm ── */}
        {request.attachments?.length > 0 && (
          <View style={S.card}>
            <Text style={S.cardTitle}>Đính kèm ({request.attachments.length})</Text>
            <View style={S.attachGrid}>
              {request.attachments.map((a: any, i: number) => (
                <View key={i} style={S.attachItem}>
                  <Image
                    source={{ uri: a.url?.startsWith('/uploads') ? `${process.env.API_URL}${a.url}` : a.url }}
                    style={S.attachImg}
                    resizeMode="cover"
                  />
                  <Text style={S.attachName} numberOfLines={1}>{a.filename ?? `File ${i + 1}`}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Timeline — chỉ hiện khi không còn pending ── */}
        {request.status !== 'pending' && (request.history?.length > 0 || request.timeline?.length > 0) && (
          <View style={S.card}>
            <Text style={S.cardTitle}>Lịch sử xử lý</Text>
            {(request.history ?? request.timeline ?? []).map((item: any, i: number, arr: any[]) => (
              <View key={i} style={S.timelineItem}>
                {/* Line connector */}
                <View style={S.timelineLeft}>
                  <View style={[S.timelineDot,
                    item.action === 'approved' && S.dotGreen,
                    item.action === 'rejected' && S.dotRed,
                  ]}>
                    <Text style={S.timelineDotIcon}>
                      {ACTION_ICON[item.action] ?? '•'}
                    </Text>
                  </View>
                  {i < arr.length - 1 && <View style={S.timelineLine} />}
                </View>

                <View style={S.timelineContent}>
                  <Text style={S.timelineAction}>
                    {actionLabel(item.action)}
                  </Text>
                  {item.action_by?.name || item.by?.name ? (
                    <Text style={S.timelineBy}>
                      bởi {item.action_by?.name ?? item.by?.name ?? '—'}
                    </Text>
                  ) : null}
                  {item.comment && (
                    <Text style={S.timelineComment}>"{item.comment}"</Text>
                  )}
                  <Text style={S.timelineTime}>
                    {item.at ? fmt(item.at) : fmt(item.created_at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── Header component ─── */
function Header({ title }: { title: string }) {
  const navigation = useNavigation();
  return (
    <View style={S.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
        <Text style={S.backIcon}>←</Text>
      </TouchableOpacity>
      <Text style={S.headerTitle}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

/* ─── InfoRow ─── */
function InfoRow({ label, value, valueStyle }: {
  label: string; value: string; valueStyle?: object;
}) {
  return (
    <View style={S.row}>
      <Text style={S.rowLabel}>{label}</Text>
      <Text style={[S.rowValue, valueStyle]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

/* ─── Build payload rows per request type ─── */
function buildPayloadRows(type: string, p: Record<string, any>): { label: string; value: string; highlight?: boolean }[] {
  const fmt = (v: number) =>
    v != null ? new Intl.NumberFormat('vi-VN').format(v) + 'đ' : '—';

  switch (type) {
    case 'salary_advance':
      return [
        { label: 'Loại',       value: p.type ?? '—' },
        { label: 'Số tiền',    value: fmt(p.amount), highlight: true },
        { label: 'Lý do',      value: p.reason ?? '—' },
      ];
    case 'leave':
      return [
        { label: 'Thời gian',  value: p.duration ?? '—' },
        { label: 'Loại phép',  value: p.leave_type ?? '—' },
        { label: 'Bắt đầu',   value: p.start_date ?? '—' },
        { label: 'Kết thúc',  value: p.end_date ?? p.start_date ?? '—' },
        { label: 'Lý do',     value: p.reason ?? '—' },
      ];
    case 'expense':
      return [
        { label: 'Loại chi phí', value: p.expense_type ?? '—' },
        { label: 'Số tiền',      value: fmt(p.amount), highlight: true },
        { label: 'Ghi chú',      value: p.note ?? p.detail ?? '—' },
      ];
    case 'purchase':
      return [
        { label: 'Loại',        value: p.purchase_type ?? '—' },
        { label: 'Sản phẩm',   value: p.product_name ?? '—' },
        { label: 'Số lượng',   value: String(p.quantity ?? '—') },
        { label: 'Đơn giá',    value: fmt(p.unit_price) },
        { label: 'Thành tiền', value: fmt(p.total_amount), highlight: true },
      ];
    case 'additional_trip':
      return [
        { label: 'Vật liệu',   value: p.material_name ?? '—' },
        { label: 'Nơi lấy',   value: p.pickup_location ?? '—' },
        { label: 'Nơi đổ',    value: p.drop_location ?? '—' },
        { label: 'Số chuyến', value: String(p.trip_count ?? '—'), highlight: true },
        { label: 'Thu',       value: fmt(p.income) },
        { label: 'Chi',       value: fmt(p.expense) },
      ];
    case 'attendance_adjustment':
      return [
        { label: 'Ngày',       value: p.date ?? '—' },
        { label: 'Giờ vào',   value: p.check_in_time ?? '—' },
        { label: 'Giờ ra',    value: p.check_out_time ?? '—' },
        { label: 'Lý do',     value: p.reason ?? '—' },
      ];
    case 'reward':
      return [
        { label: 'Loại',       value: p.type ?? '—' },
        { label: 'Số tiền',   value: fmt(p.amount), highlight: true },
        { label: 'Lý do',     value: p.reason ?? '—' },
      ];
    case 'discipline':
      return [
        { label: 'Loại',       value: p.type ?? '—' },
        { label: 'Tiền phạt', value: fmt(p.amount), highlight: true },
        { label: 'Lý do',     value: p.reason ?? '—' },
      ];
    default:
      return Object.entries(p).slice(0, 8).map(([k, v]) => ({
        label: k, value: String(v ?? '—'),
      }));
  }
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    created:   'Đã tạo yêu cầu',
    submitted: 'Đã gửi yêu cầu',
    approved:  'Đã duyệt',
    rejected:  'Đã từ chối',
    completed: 'Hoàn thành',
    cancelled: 'Đã hủy',
    updated:   'Đã cập nhật',
  };
  return map[action] ?? action;
}

/* ─────────────────────── Styles ─────────────────────── */
const S = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: Colors.background },
  header:     {
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  backBtn:    { width: 36, height: 36, justifyContent: 'center' },
  backIcon:   { fontSize: 22, color: Colors.white },
  headerTitle:{ fontSize: 17, fontWeight: '700', color: Colors.white, flex: 1, textAlign: 'center' },

  content:    { padding: 16, gap: 14 },

  statusBanner: {
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  statusBannerText: { fontSize: 15, fontWeight: '700' },
  statusBannerSub:  { fontSize: 12, marginTop: 2 },

  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.gray500,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },

  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  rowLabel: { fontSize: 13, color: Colors.gray500, flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '600', color: Colors.gray900, flex: 2, textAlign: 'right' },

  attachGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  attachItem: { width: 80, alignItems: 'center' },
  attachImg:  { width: 76, height: 76, borderRadius: 8, backgroundColor: Colors.gray100 },
  attachName: { fontSize: 10, color: Colors.gray500, marginTop: 4, width: 76, textAlign: 'center' },

  /* Timeline */
  timelineItem:    { flexDirection: 'row', gap: 12, marginBottom: 4 },
  timelineLeft:    { alignItems: 'center', width: 32 },
  timelineDot:     {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primary + '18',
    justifyContent: 'center', alignItems: 'center',
  },
  dotGreen:        { backgroundColor: Colors.successLight },
  dotRed:          { backgroundColor: Colors.errorLight },
  timelineDotIcon: { fontSize: 14 },
  timelineLine:    { width: 2, flex: 1, backgroundColor: Colors.gray200, marginTop: 4, marginBottom: 4, minHeight: 12 },
  timelineContent: { flex: 1, paddingBottom: 16 },
  timelineAction:  { fontSize: 14, fontWeight: '700', color: Colors.gray900 },
  timelineBy:      { fontSize: 12, color: Colors.gray500, marginTop: 1 },
  timelineComment: { fontSize: 12, color: Colors.gray600, fontStyle: 'italic', marginTop: 4,
    backgroundColor: Colors.gray50, borderRadius: 6, padding: 6 },
  timelineTime:    { fontSize: 11, color: Colors.gray400, marginTop: 4 },
});

function ImageLightbox({ uri, onClose }: { uri: string; onClose: () => void }) {
  const { width: SCREEN_W } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' }}>
        <TouchableOpacity
          style={{ position: 'absolute', top: 48, right: 20, zIndex: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}
          onPress={onClose}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, justifyContent: 'center' }} onPress={onClose} activeOpacity={1}>
          <Image source={{ uri }} style={{ width: SCREEN_W, height: SCREEN_W * 1.4 }} resizeMode="contain" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
