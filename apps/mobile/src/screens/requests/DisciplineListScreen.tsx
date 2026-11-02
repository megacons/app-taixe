import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput,
  Image, Platform, Modal, ScrollView, Linking, useWindowDimensions,
  Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import RenderHtml from 'react-native-render-html';
import type { RootStackParamList } from '@/navigation';

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
const isHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);

type Nav = NativeStackNavigationProp<RootStackParamList>;

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

const getFileIcon = (mime?: string) => {
  if (!mime) return '📎';
  if (mime.includes('pdf'))   return '📄';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('excel') || mime.includes('sheet'))   return '📊';
  if (mime.includes('image')) return '🖼️';
  return '📎';
};

const fmtSize = (b: number) => {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)}KB`;
  return `${b}B`;
};
const SEVERITY: Record<string, { color: string; bg: string; barColor: string; icon: string }> = {
  'Cảnh báo 1':         { color: '#b45309', bg: '#fef3c7', barColor: '#f59e0b', icon: '⚠️' },
  'Cảnh báo 2':         { color: '#c2410c', bg: '#ffedd5', barColor: '#f97316', icon: '🔶' },
  'Vi phạm hành chính': { color: '#7c3aed', bg: '#ede9fe', barColor: '#8b5cf6', icon: '📋' },
  'Vi phạm nội quy':    { color: '#1d4ed8', bg: '#dbeafe', barColor: '#3b82f6', icon: '🔵' },
  'Cắt chức':           { color: '#9f1239', bg: '#ffe4e6', barColor: '#e11d48', icon: '🔻' },
  'Sa thải':            { color: '#dc2626', bg: '#fee2e2', barColor: '#dc2626', icon: '🚫' },
  'Khác':               { color: '#374151', bg: '#f3f4f6', barColor: '#9ca3af', icon: '📌' },
};

const getSeverity = (type?: string) =>
  type ? (SEVERITY[type] ?? SEVERITY['Khác']) : SEVERITY['Khác'];

/* ═══════════════════════════════════════════════════════════
 *  LIST SCREEN
 * ═══════════════════════════════════════════════════════════ */
export default function DisciplineListScreen() {
  const navigation    = useNavigation<Nav>();
  const { user }      = useAuthStore();

  const [items, setItems]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<any | null>(null);
  const { width } = useWindowDimensions();

  const markRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setItems(prev => prev.map(i => i._id === id ? { ...i, is_read: true } : i));
    } catch (_) {}
  };

  const fetchList = async () => {
    try {
      // Lấy thông báo kỷ luật — filter server + client để chắc chắn
      const notifRes = await api.get('/notifications', {
        params: { type: 'discipline', limit: 100 },
      });

      const all: any[] = notifRes.data.data?.notifications ?? [];
      // Filter thêm phía client phòng server chưa filter
      const notifs = all
        .filter((n: any) => n.type === 'discipline')
        .map((n: any) => ({
          _id:        n._id,
          source:     'notification',
          title:      n.title,
          created_at: n.created_at,
          date:       n.created_at?.slice(0, 10),
          type:       'Kỷ luật',
          amount:     0,
          reason:     n.message ?? '',
          is_read:    n.is_read,
          attachment: n.attachment ?? null,
        }));

      notifs.sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
      setItems(notifs);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchList();
    setRefreshing(false);
  };

  // items.length dùng trực tiếp

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={S.header}>
        <View style={S.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
            <Text style={S.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={S.headerTitle}>Kỷ luật</Text>
        </View>
      </View>

      {/* Form overlay đã bỏ — kỷ luật chỉ do admin gửi */}

      {/* Summary banner */}
      {!loading && items.length > 0 && (
        <View style={S.summaryBanner}>
          <Text style={S.summaryText}>
            {items.length} thông báo kỷ luật
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i._id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          contentContainerStyle={items.length === 0 ? S.emptyContainer : S.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const sev = getSeverity(item.type);
            return (
              <TouchableOpacity
                style={[S.card, !item.is_read && S.cardUnread]}
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedNotif(item);
                  if (!item.is_read) markRead(item._id);
                }}
              >
                <View style={[S.severityBar, { backgroundColor: sev.barColor }]} />
                <View style={S.cardContent}>
                  <View style={S.cardTopRow}>
                    <Text style={S.cardDate}>
                      {item.date
                        ? format(new Date(item.date + 'T00:00:00'), 'dd/MM/yyyy', { locale: vi })
                        : format(parseISO(item.created_at), 'dd/MM/yyyy', { locale: vi })}
                    </Text>
                    {!item.is_read && (
                      <View style={S.unreadDot} />
                    )}
                  </View>

                  <Text style={S.cardTitle} numberOfLines={1}>{item.title}</Text>

                  <View style={[S.typeBadge, { backgroundColor: sev.bg }]}>
                    <Text style={[S.typeBadgeText, { color: sev.color }]}>
                      {sev.icon} {item.type}
                    </Text>
                  </View>

                  {item.reason ? (
                    <Text style={S.cardReason} numberOfLines={2}>{stripHtml(item.reason)}</Text>
                  ) : null}
                </View>
                <Text style={S.chevron}>›</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{ fontSize: 52 }}>✅</Text>
              <Text style={S.emptyTitle}>Không có kỷ luật nào</Text>
              <Text style={S.emptySub}>Bạn đang thực hiện rất tốt!</Text>
            </View>
          }
        />
      )}
      {/* Modal chi tiết thông báo kỷ luật */}
      {selectedNotif && (
        <Modal visible transparent animationType="fade">
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' }}>
            <TouchableOpacity
              style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.01)' } as any}
              onPress={() => setSelectedNotif(null)}
              activeOpacity={1}
            />
            <View style={N.sheet}>
              <View style={N.header}>
                <Text style={N.headerIcon}>⚠️</Text>
                <Text style={N.headerTitle}>Thông báo kỷ luật</Text>
                <TouchableOpacity onPress={() => setSelectedNotif(null)} style={N.closeBtn}>
                  <Text style={N.closeIcon}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={N.content} showsVerticalScrollIndicator={false}>
                <Text style={N.title}>{selectedNotif.title}</Text>
                <Text style={N.time}>
                  🕐 {format(parseISO(selectedNotif.created_at), 'HH:mm - dd/MM/yyyy (EEEE)', { locale: vi })}
                </Text>
                <View style={N.divider} />
                {selectedNotif.reason ? (
                  isHtml(selectedNotif.reason) ? (
                    <RenderHtml
                      contentWidth={width - 40}
                      source={{ html: selectedNotif.reason }}
                      tagsStyles={{
                        p:      { fontSize: 15, color: Colors.gray700, lineHeight: 22, marginBottom: 8 },
                        strong: { fontWeight: '700', color: Colors.gray900 },
                        em:     { fontStyle: 'italic' },
                        ul:     { paddingLeft: 16 },
                        li:     { fontSize: 15, color: Colors.gray700, lineHeight: 22 },
                        h1:     { fontSize: 17, fontWeight: '700', color: Colors.gray900, marginBottom: 6 },
                        h2:     { fontSize: 16, fontWeight: '700', color: Colors.gray900, marginBottom: 4 },
                        h3:     { fontSize: 15, fontWeight: '600', color: Colors.gray900, marginBottom: 4 },
                      }}
                    />
                  ) : (
                    <Text style={N.message}>{selectedNotif.reason}</Text>
                  )
                ) : null}

                {/* File đính kèm */}
                {selectedNotif.attachment?.url && (
                  <TouchableOpacity
                    style={N.attachment}
                    onPress={() => {
                      const url = selectedNotif.attachment.url.startsWith('http')
                        ? selectedNotif.attachment.url
                        : `${BASE_URL}${selectedNotif.attachment.url}`;
                      Linking.openURL(url);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 26 }}>
                      {getFileIcon(selectedNotif.attachment.mime_type)}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={N.attachName} numberOfLines={2}>
                        {selectedNotif.attachment.original_name}
                      </Text>
                      <Text style={N.attachMeta}>
                        {fmtSize(selectedNotif.attachment.size)} · Nhấn để mở
                      </Text>
                    </View>
                    <Text style={N.attachArrow}>↗</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  FORM (bottom sheet) — theo đúng UI reference
 * ═══════════════════════════════════════════════════════════ */
const DISCIPLINE_TYPES = [
  'Vi phạm hành chính',
  'Vi phạm nội quy',
  'Cảnh báo 1',
  'Cảnh báo 2',
  'Cắt chức',
  'Sa thải',
  'Khác',
];

function DisciplineForm({
  onClose, onSuccess,
}: { onClose: () => void; onSuccess: () => void }) {
  const [date, setDate]     = useState(format(new Date(), 'dd/MM/yyyy'));
  const [title, setTitle]   = useState('');
  const [type, setType]     = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [penalty, setPenalty] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!date.trim())                       e.date   = 'Vui lòng nhập ngày';
    if (!title.trim())                      e.title  = 'Vui lòng nhập tiêu đề';
    if (!penalty || Number(penalty) < 0)   e.penalty= 'Vui lòng nhập tiền phạt';
    if (!reason.trim())                     e.reason = 'Vui lòng nhập lý do';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const clearErr = (key: string) =>
    setErrors(e => ({ ...e, [key]: '' }));

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post('/requests', {
        type:  'discipline',
        title,
        payload: {
          date,
          type:   type || 'Khác',
          amount: Number(penalty),
          reason,
        },
      });
      onSuccess();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Không thể gửi yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={F.overlay}>
      <TouchableOpacity style={F.backdrop} onPress={onClose} activeOpacity={1} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={F.sheet}>
        {/* Sheet header — deep navy */}
        <View style={F.sheetHeader}>
          <TouchableOpacity onPress={onClose} style={F.headerBack}>
            <Text style={F.headerBackIcon}>←</Text>
          </TouchableOpacity>
          <Text style={F.sheetTitle}>Kỷ luật</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* ── Form card ── */}
        <View style={F.formCard}>
          {/* Ngày */}
          <View style={F.fieldGroup}>
            <Text style={F.label}>Ngày <Text style={F.req}>*</Text></Text>
            <TextInput
              style={[F.input, errors.date && F.inputErr]}
              value={date}
              onChangeText={v => { setDate(v); clearErr('date'); }}
              placeholder="dd/mm/yyyy"
              placeholderTextColor={Colors.gray400}
            />
            {errors.date ? <Text style={F.err}>{errors.date}</Text> : null}
          </View>

          {/* Tiêu đề */}
          <View style={F.fieldGroup}>
            <Text style={F.label}>Tiêu đề <Text style={F.req}>*</Text></Text>
            <TextInput
              style={[F.input, errors.title && F.inputErr]}
              value={title}
              onChangeText={v => { setTitle(v); clearErr('title'); }}
              placeholder="Nhập tiêu đề kỷ luật"
              placeholderTextColor={Colors.gray400}
            />
            {errors.title ? <Text style={F.err}>{errors.title}</Text> : null}
          </View>

          {/* Loại */}
          <View style={F.fieldGroup}>
            <Text style={F.label}>Loại</Text>
            <TouchableOpacity
              style={[F.input, F.selectRow]}
              onPress={() => setShowTypePicker(!showTypePicker)}
              activeOpacity={0.8}
            >
              <Text style={[F.selectValue, !type && F.selectPlaceholder]}>
                {type || 'Chọn loại kỷ luật'}
              </Text>
              <Text style={F.selectArrow}>{showTypePicker ? '▴' : '▾'}</Text>
            </TouchableOpacity>
            {showTypePicker && (
              <View style={F.dropdown}>
                {DISCIPLINE_TYPES.map(t => {
                  const sev = getSeverity(t);
                  return (
                    <TouchableOpacity
                      key={t}
                      style={F.dropItem}
                      onPress={() => { setType(t); setShowTypePicker(false); }}
                    >
                      <View style={F.dropItemLeft}>
                        <Text style={{ fontSize: 16 }}>{sev.icon}</Text>
                        <Text style={[F.dropText, t === type && F.dropActive]}>{t}</Text>
                      </View>
                      {t === type && <Text style={F.check}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Tiền phạt */}
          <View style={F.fieldGroup}>
            <Text style={F.label}>Tiền phạt <Text style={F.req}>*</Text></Text>
            <View style={[F.amountRow, errors.penalty && F.inputErr]}>
              <TextInput
                style={F.amountInput}
                value={penalty}
                onChangeText={v => { setPenalty(v.replace(/[^0-9]/g, '')); clearErr('penalty'); }}
                placeholder="0"
                placeholderTextColor={Colors.gray400}
                keyboardType="numeric"
                textAlign="right"
              />
              <Text style={F.amountUnit}>VNĐ</Text>
            </View>
            {errors.penalty ? <Text style={F.err}>{errors.penalty}</Text> : null}
          </View>

          {/* Lý do */}
          <View style={F.fieldGroup}>
            <Text style={F.label}>Lý do <Text style={F.req}>*</Text></Text>
            <TextInput
              style={[F.textarea, errors.reason && F.inputErr]}
              value={reason}
              onChangeText={v => { setReason(v); clearErr('reason'); }}
              placeholder="Nhập lý do chi tiết..."
              placeholderTextColor={Colors.gray400}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
            {errors.reason ? <Text style={F.err}>{errors.reason}</Text> : null}
          </View>
        </View>

        {/* Submit button */}
        <View style={F.footer}>
          <TouchableOpacity style={F.cancelBtn} onPress={onClose} disabled={loading}>
            <Text style={F.cancelText}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[F.submitBtn, loading && F.submitDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <><Text style={{ fontSize: 16 }}>🚀</Text><Text style={F.submitText}> Gửi yêu cầu</Text></>
            )}
          </TouchableOpacity>
        </View>
      </View>
      </TouchableWithoutFeedback>
    </View>
  );
}

/* ─────────────────────── List Styles ─────────────────────── */
const DEEP_NAVY = '#002173';

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7fe' },

  /* Header — matches UI reference exactly */
  header: {
    backgroundColor: DEEP_NAVY,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn:    { width: 34, height: 34, justifyContent: 'center', borderRadius: 17 },
  backIcon:   { fontSize: 22, color: Colors.white },
  headerTitle:{ fontSize: 17, fontWeight: '600', color: Colors.white },

  headerAvatar: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  headerAvatarFallback: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarInitial: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  locationBtn:{ padding: 4 },

  summaryBanner: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#fecaca',
  },
  summaryText: {
    fontSize: 13, fontWeight: '600', color: Colors.error, textAlign: 'center',
  },

  listContent:    { padding: 16, paddingBottom: 32 },
  emptyContainer: { flex: 1 },

  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  severityBar:   { width: 5, alignSelf: 'stretch' },
  cardContent:   { flex: 1, padding: 14 },
  cardTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardDate:      { fontSize: 11, color: Colors.gray500 },
  cardPenalty:   { fontSize: 14, fontWeight: '700', color: Colors.gray600 },
  penaltyRed:    { color: Colors.error },
  cardTitle:     { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 6 },
  typeBadge:     { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  cardReason:    { fontSize: 12, color: Colors.gray500, lineHeight: 17 },
  chevron:       { fontSize: 20, color: Colors.gray300, paddingHorizontal: 12 },

  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100, gap: 8 },
  emptyTitle:{ fontSize: 16, fontWeight: '700', color: Colors.gray700 },
  emptySub:  { fontSize: 13, color: Colors.gray400 },

  cardUnread:    { borderWidth: 1.5, borderColor: Colors.error + '40' },
  notifBadge:    { backgroundColor: Colors.error + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  notifBadgeText:{ fontSize: 10, fontWeight: '700', color: Colors.error },
  newBadge:      { backgroundColor: Colors.error, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeText:  { fontSize: 10, fontWeight: '700', color: '#fff' },
  unreadDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
});

/* ─────────────────────── Form Styles ─────────────────────── */
const F = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)', padding: 20,
  },
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'transparent',
  },
  sheet: {
    backgroundColor: Colors.gray50,
    borderRadius: 20, width: '100%',
    maxHeight: '92%',
    paddingBottom: 8,
    overflow: 'hidden',
  },
  sheetHeader: {
    backgroundColor: DEEP_NAVY,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 15,
  },
  headerBack:    { width: 40, height: 40, justifyContent: 'center' },
  headerBackIcon:{ fontSize: 22, color: Colors.white },
  sheetTitle:    { fontSize: 17, fontWeight: '600', color: Colors.white },

  /* Form card — white, rounded-2xl */
  formCard: {
    backgroundColor: Colors.white,
    borderRadius: 16, margin: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05, shadowRadius: 20, elevation: 3,
    borderWidth: 1, borderColor: Colors.gray100,
  },

  fieldGroup: { marginBottom: 18 },
  label:      { fontSize: 13, fontWeight: '700', color: Colors.gray700, marginBottom: 6 },
  req:        { color: Colors.error },
  input: {
    height: 48, borderWidth: 1, borderColor: Colors.gray300,
    borderRadius: 8, paddingHorizontal: 14,
    fontSize: 14, color: Colors.gray900, backgroundColor: Colors.white,
  },
  inputErr:   { borderColor: Colors.error },
  err:        { fontSize: 11, color: Colors.error, marginTop: 3 },
  textarea: {
    borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8,
    padding: 12, fontSize: 14, color: Colors.gray900,
    minHeight: 110, textAlignVertical: 'top',
  },

  selectRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectValue:      { fontSize: 14, color: Colors.gray900, flex: 1 },
  selectPlaceholder:{ color: Colors.gray400 },
  selectArrow:      { fontSize: 14, color: Colors.gray400 },

  dropdown: {
    marginTop: 4, backgroundColor: Colors.white, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.gray200, overflow: 'hidden',
    elevation: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8,
  },
  dropItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  dropItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  dropText:     { fontSize: 14, color: Colors.gray800 },
  dropActive:   { color: DEEP_NAVY, fontWeight: '700' },
  check:        { color: DEEP_NAVY, fontSize: 14, fontWeight: '700' },

  amountRow: {
    height: 48, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8,
    backgroundColor: Colors.white, paddingRight: 14,
    overflow: 'hidden',
  },
  amountInput: {
    flex: 1, paddingHorizontal: 14,
    fontSize: 14, color: Colors.gray900,
    borderWidth: 0,
  },
  amountUnit: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },

  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.gray100,
    backgroundColor: Colors.white,
  },
  cancelBtn:  { flex: 1, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.gray300, justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.gray700 },
  submitBtn: {
    flex: 2, backgroundColor: DEEP_NAVY, borderRadius: 12, height: 52,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  submitDisabled: { opacity: 0.55 },
  submitText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});

/* ─────────────────── Notification Detail Modal Styles ─────────────────── */
const N = StyleSheet.create({
  sheet:   { backgroundColor: Colors.white, borderRadius: 20, width: '100%', maxHeight: '80%', overflow: 'hidden' },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: DEEP_NAVY },
  headerIcon: { fontSize: 20 },
  headerTitle:{ flex: 1, fontSize: 16, fontWeight: '700', color: Colors.white },
  closeBtn:   { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  closeIcon:  { color: Colors.white, fontSize: 14, fontWeight: '700' },
  content: { padding: 20 },
  title:   { fontSize: 18, fontWeight: '800', color: Colors.gray900, lineHeight: 26 },
  time:    { fontSize: 12, color: Colors.gray400, marginTop: 8 },
  divider: { height: 1, backgroundColor: Colors.gray100, marginVertical: 16 },
  message: { fontSize: 15, color: Colors.gray700, lineHeight: 24 },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, backgroundColor: Colors.primary + '08', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.primary + '25' },
  attachName: { fontSize: 13, fontWeight: '600', color: Colors.gray900 },
  attachMeta: { fontSize: 11, color: Colors.primary, marginTop: 3 },
  attachArrow:{ fontSize: 18, color: Colors.primary, fontWeight: '700' },
});
