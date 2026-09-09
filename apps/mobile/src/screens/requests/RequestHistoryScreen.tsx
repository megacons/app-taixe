import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, ScrollView,
  Image, DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import type { RootStackParamList } from '@/navigation';
import { useSocket } from '@/hooks/useSocket';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/* ── Status config ── */
const STATUS: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  pending:   { label: 'Chờ duyệt',  bg: '#fdb716',         text: '#6b4b00', icon: '🕐' },
  approved:  { label: 'Đã duyệt',   bg: '#2e7d3218',       text: '#2E7D32', icon: '✅' },
  rejected:  { label: 'Từ chối',    bg: '#ffdad6',         text: '#93000a', icon: '❌' },
  completed: { label: 'Hoàn thành', bg: '#dbeafe',         text: '#1e40af', icon: '🎉' },
  cancelled: { label: 'Đã hủy',     bg: '#f3f4f6',         text: '#374151', icon: '🚫' },
};

/* ── Request type config ── */
const TYPE: Record<string, { label: string; icon: string }> = {
  purchase:               { label: 'Mua sắm vật tư',    icon: '🛒' },
  leave:                  { label: 'Nghỉ phép',         icon: '📅' },
  salary_advance:         { label: 'Tạm ứng lương',     icon: '💵' },
  expense:                { label: 'Thanh toán chi phí', icon: '💳' },
  additional_trip:        { label: 'Thêm số chuyến',    icon: '🚛' },
  attendance_adjustment:  { label: 'Đổi giờ',           icon: '🕐' },
  reward:                 { label: 'Khen thưởng',       icon: '🏆' },
  discipline:             { label: 'Kỷ luật',           icon: '⚠️' },
};

/* ── Filter chips ── */
const CHIPS = [
  { key: '',          label: 'Tất cả' },
  { key: 'pending',   label: 'Chờ duyệt' },
  { key: 'approved',  label: 'Đã duyệt' },
  { key: 'rejected',  label: 'Từ chối' },
];

/* ── Extra info rendered in card body ── */
function getBodyLines(type: string, payload: any): { icon?: string; text: string; highlight?: boolean }[] {
  if (!payload) return [];
  switch (type) {
    case 'purchase':
      return [
        { text: payload.detail ?? payload.description ?? '—' },
        { text: `Dự kiến: ${(payload.total_amount ?? payload.amount ?? 0).toLocaleString('vi-VN')} VNĐ`, highlight: true },
      ];
    case 'leave':
      return [
        { text: `Xin nghỉ ${payload.duration ?? ''} — ${payload.leave_type ?? ''}`.trim() },
        { icon: '📅', text: `${payload.start_date ?? '?'} – ${payload.end_date ?? payload.start_date ?? '?'}` },
      ];
    case 'salary_advance':
      return [
        { text: payload.reason ?? '—' },
        { text: `Số tiền: ${(payload.amount ?? 0).toLocaleString('vi-VN')} VNĐ`, highlight: true },
      ];
    case 'expense':
      return [
        { text: payload.note ?? payload.detail ?? '—' },
        { text: `Số tiền: ${(payload.amount ?? 0).toLocaleString('vi-VN')} VNĐ`, highlight: true },
      ];
    case 'additional_trip':
      return [
        { text: `${payload.pickup_location ?? ''} → ${payload.drop_location ?? ''}` },
        { text: `${payload.trip_count ?? 1} chuyến`, highlight: true },
      ];
    case 'attendance_adjustment':
      return [
        { text: payload.reason ?? '—' },
        { icon: '🕐', text: `${payload.check_in_time ?? '?'} – ${payload.check_out_time ?? '?'}` },
      ];
    default:
      return payload.reason ? [{ text: payload.reason }] : [];
  }
}

export default function RequestHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<any>();
  const { user }   = useAuthStore();

  const [items, setItems]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [statusFilter, setStatusFilter] = useState(route.params?.status ?? '');
  const [search, setSearch]           = useState('');

  const fetchRequests = useCallback(async (status = statusFilter) => {
    try {
      const params: any = { limit: 100 };
      if (status) params.status = status;
      const res = await api.get('/requests', { params });
      setItems(res.data.data?.requests ?? []);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchRequests(statusFilter); }, [statusFilter]);

  // Realtime: nhận socket event khi request của mình được duyệt/từ chối
  // → refresh danh sách + bridge vào DeviceEventEmitter để các màn hình khác cũng biết
  useSocket({
    userId: user?._id,
    events: {
      'request:approved': (data: any) => {
        fetchRequests(statusFilter);
        DeviceEventEmitter.emit('REQUEST_UPDATED', data);
      },
      'request:rejected': (data: any) => {
        fetchRequests(statusFilter);
        DeviceEventEmitter.emit('REQUEST_UPDATED', data);
      },
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRequests(statusFilter);
    setRefreshing(false);
  };

  /* ── Filter + search ── */
  const filtered = items.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.title?.toLowerCase().includes(q) ||
      item.request_number?.toLowerCase().includes(q) ||
      (TYPE[item.type]?.label ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* ── Header chuẩn ── */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Lịch sử yêu cầu</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Search ── */}
      <View style={S.searchRow}>
        <View style={S.searchBox}>
          <Text style={S.searchIcon}>🔍</Text>
          <TextInput
            style={S.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm kiếm yêu cầu..."
            placeholderTextColor={Colors.gray400}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={S.chipBar}
        style={{ flexGrow: 0 }}
        keyboardShouldPersistTaps="handled"
      >
        {CHIPS.map(chip => {
          const active = statusFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[S.chip, active && S.chipActive]}
              onPress={() => setStatusFilter(chip.key)}
              activeOpacity={0.8}
            >
              <Text style={[S.chipText, active && S.chipTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── List ── */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i._id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          contentContainerStyle={
            filtered.length === 0 ? S.emptyContainer : S.listContent
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <RequestCard
              item={item}
              onPress={() => navigation.navigate('RequestDetail', { requestId: item._id })}
            />
          )}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{ fontSize: 52 }}>📋</Text>
              <Text style={S.emptyTitle}>
                {search ? 'Không tìm thấy kết quả' : 'Chưa có yêu cầu nào'}
              </Text>
              <Text style={S.emptySub}>
                {search
                  ? 'Thử tìm kiếm với từ khóa khác'
                  : 'Các yêu cầu bạn gửi sẽ hiện ở đây'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

/* ═══════════════════════════════
 *  RequestCard component
 * ═══════════════════════════════ */
function RequestCard({ item, onPress }: { item: any; onPress: () => void }) {
  const st  = STATUS[item.status]  ?? STATUS.pending;
  const typ = TYPE[item.type]     ?? { label: item.type, icon: '📄' };
  const bodyLines = getBodyLines(item.type, item.payload ?? {});

  const dateStr = item.created_at
    ? format(parseISO(item.created_at), 'dd/MM/yyyy', { locale: vi })
    : '—';

  return (
    <TouchableOpacity style={C.card} onPress={onPress} activeOpacity={0.85}>
      {/* ── Card header ── */}
      <View style={C.cardHeader}>
        {/* Icon circle */}
        <View style={C.iconCircle}>
          <Text style={C.iconText}>{typ.icon}</Text>
        </View>

        {/* Title + date */}
        <View style={C.titleBlock}>
          <Text style={C.title} numberOfLines={1}>{item.title}</Text>
          <Text style={C.date}>{dateStr}</Text>
        </View>

        {/* Status badge */}
        <View style={[C.badge, { backgroundColor: st.bg }]}>
          <Text style={C.badgeIcon}>{st.icon}</Text>
          <Text style={[C.badgeText, { color: st.text }]}>{st.label}</Text>
        </View>
      </View>

      {/* ── Card body ── */}
      {bodyLines.length > 0 && (
        <View style={C.bodyBox}>
          {bodyLines.map((line, i) => (
            <View key={i} style={[i > 0 && { marginTop: 4 }]}>
              {line.icon ? (
                <View style={C.bodyIconRow}>
                  <Text style={C.bodyIcon}>{line.icon}</Text>
                  <Text style={[C.bodyText, C.bodyMuted]}>{line.text}</Text>
                </View>
              ) : line.highlight ? (
                <Text style={C.bodyHighlight}>{line.text}</Text>
              ) : (
                <Text style={C.bodyText} numberOfLines={2}>{line.text}</Text>
              )}
            </View>
          ))}

          {/* Rejection reason */}
        </View>
      )}
    </TouchableOpacity>
  );
}

/* ─────────────────────── Styles ─────────────────────── */
const PRIMARY   = '#002173';
const PRIMARY_C = '#163797';

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8FA' },

  /* Header chuẩn */
  header:      { backgroundColor: PRIMARY_C, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 },
  backBtn:     { width: 36, height: 36, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.white, textAlign: 'center' },

  /* Search */
  searchRow: { paddingHorizontal: 16, paddingVertical: 8 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  searchIcon:  { fontSize: 18, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.gray900 },

  /* Filter chips */
  chipBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 50, borderWidth: 1.5, borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    flexShrink: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  chipActive:     { backgroundColor: PRIMARY_C, borderColor: PRIMARY_C },
  chipText:       { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  chipTextActive: { color: Colors.white },

  /* List */
  listContent:    { padding: 16, paddingBottom: 32 },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray700 },
  emptySub:   { fontSize: 13, color: Colors.gray400 },
});

const C = StyleSheet.create({
  /* Card */
  card: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
    gap: 10,
  },

  /* Header row */
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#eeedf6',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  iconText: { fontSize: 22 },
  titleBlock: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '600', color: Colors.gray900, lineHeight: 24 },
  date:  { fontSize: 14, color: Colors.gray500 },

  /* Badge */
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 50,
    flexShrink: 0, alignSelf: 'flex-start',
  },
  badgeIcon: { fontSize: 12 },
  badgeText: { fontSize: 12, fontWeight: '600' },

  /* Body box */
  bodyBox: {
    backgroundColor: '#F7F8FA', borderRadius: 12, padding: 12, gap: 4,
  },
  bodyIconRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bodyIcon:     { fontSize: 14 },
  bodyText:     { fontSize: 15, color: Colors.gray900, lineHeight: 22 },
  bodyMuted:    { color: Colors.gray600 },
  bodyHighlight:{ fontSize: 15, fontWeight: '600', color: PRIMARY, marginTop: 4 },

  /* Rejection */
  rejectionBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#ffdad6', borderRadius: 8, padding: 8, marginTop: 6,
  },
  rejectionIcon:{ fontSize: 14, marginTop: 1 },
  rejectionText:{ fontSize: 13, color: '#93000a', flex: 1, lineHeight: 18 },
});
