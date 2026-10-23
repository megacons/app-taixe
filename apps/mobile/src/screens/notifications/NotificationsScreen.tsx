import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, ScrollView,
  DeviceEventEmitter, Linking, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import RenderHtml from 'react-native-render-html';

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

const isHtmlContent = (msg: string) => /<[a-z][\s\S]*>/i.test(msg);

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

const fmtFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
};

const getFileIcon = (mime: string) => {
  if (mime?.includes('pdf'))   return '📄';
  if (mime?.includes('word') || mime?.includes('document')) return '📝';
  if (mime?.includes('excel') || mime?.includes('sheet'))   return '📊';
  if (mime?.includes('image')) return '🖼️';
  return '📎';
};

interface Notif {
  _id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  data?: {
    sent_by_name?: string;
    sent_by?: string;
    [key: string]: any;
  } | null;
  attachment?: {
    url: string;
    original_name: string;
    mime_type: string;
    size: number;
  } | null;
}

const TYPE_ICON: Record<string, string> = {
  request_approved: '✅',
  request_rejected: '❌',
  payment:          '💰',
  system:           '🔔',
  announcement:     '📢',
  trip_reminder:    '🚛',
  discipline:       '⚠️',
  holiday:          '🎉',
  birthday:         '🎂',
};

const TYPE_LABEL: Record<string, string> = {
  request_approved: 'Yêu cầu được duyệt',
  request_rejected: 'Yêu cầu bị từ chối',
  payment:          'Thanh toán',
  system:           'Hệ thống',
  announcement:     'Thông báo chung',
  trip_reminder:    'Nhắc chuyến xe',
  discipline:       'Kỷ luật',
  holiday:          'Nghỉ lễ',
  birthday:         'Sinh nhật',
};

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const [notifs,     setNotifs]     = useState<Notif[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected,   setSelected]   = useState<Notif | null>(null);

  const fetchNotifs = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/notifications', {
        params: { limit: 50 },
        timeout: 8000,
      });
      setNotifs(res.data.data?.notifications || []);
    } catch (_) {
      // Giữ data cũ nếu có lỗi
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifs(ns => ns.map(n => n._id === id ? { ...n, is_read: true } : n));
      DeviceEventEmitter.emit('NOTIF_READ');
    } catch (_) {}
  };

  const handlePress = (item: Notif) => {
    setSelected(item);
    if (!item.is_read) markRead(item._id);
  };

  useEffect(() => { fetchNotifs(); }, []);

  useEffect(() => {
    const s1 = DeviceEventEmitter.addListener('REQUEST_UPDATED', () => fetchNotifs());
    const s2 = DeviceEventEmitter.addListener('NEW_REQUEST',     () => fetchNotifs());
    return () => { s1.remove(); s2.remove(); };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifs(false);
    setRefreshing(false);
  };

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.title}>Thông báo</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={item => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={notifs.length === 0 ? S.emptyContainer : undefined}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[S.item, !item.is_read && S.itemUnread]}
              onPress={() => handlePress(item)}
              activeOpacity={0.75}
            >
              <Text style={S.itemIcon}>{TYPE_ICON[item.type] || '🔔'}</Text>
              <View style={S.itemContent}>
                <Text style={S.itemTitle}>{item.title}</Text>
                <Text style={S.itemMsg} numberOfLines={2}>{stripHtml(item.message)}</Text>
                {item.attachment?.url && (
                  <View style={S.attachBadge}>
                    <Text style={S.attachBadgeText}>
                      {getFileIcon(item.attachment.mime_type)} {item.attachment.original_name}
                    </Text>
                  </View>
                )}
                <Text style={S.itemTime}>
                  {format(parseISO(item.created_at), 'HH:mm - dd/MM/yyyy', { locale: vi })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {!item.is_read && <View style={S.unreadDot} />}
                <Text style={S.readMore}>›</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{ fontSize: 48 }}>🔔</Text>
              <Text style={S.emptyText}>Chưa có thông báo</Text>
            </View>
          }
        />
      )}

      {/* Detail modal */}
      {selected && (
        <Modal visible transparent animationType="fade">
          <View style={D.overlay}>
            <TouchableOpacity style={D.backdrop} onPress={() => setSelected(null)} activeOpacity={1} />
            <View style={D.sheet}>
              {/* Header modal */}
              <View style={D.header}>
                <View style={D.headerLeft}>
                  <Text style={D.headerIcon}>{TYPE_ICON[selected.type] || '🔔'}</Text>
                  <Text style={D.headerType}>{TYPE_LABEL[selected.type] || 'Thông báo'}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelected(null)} style={D.closeBtn}>
                  <Text style={D.closeIcon}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                contentContainerStyle={D.content}
                showsVerticalScrollIndicator={false}
              >
                {/* Tiêu đề */}
                <Text style={D.title}>{selected.title}</Text>

                {/* Thời gian + người gửi */}
                <Text style={D.time}>
                  🕐 {format(parseISO(selected.created_at), 'HH:mm - dd/MM/yyyy (EEEE)', { locale: vi })}
                </Text>
                {selected.data?.sent_by_name && (
                  <View style={D.senderRow}>
                    <Text style={D.senderIcon}>👤</Text>
                    <Text style={D.senderLabel}>Gửi bởi: </Text>
                    <Text style={D.senderName}>{selected.data.sent_by_name}</Text>
                  </View>
                )}

                {/* Divider */}
                <View style={D.divider} />

                {/* Nội dung đầy đủ */}
                {selected.message ? (
                  isHtmlContent(selected.message) ? (
                    <RenderHtml
                      contentWidth={width - 40}
                      source={{ html: selected.message }}
                      tagsStyles={{
                        p:          { fontSize: 15, color: Colors.gray700, lineHeight: 22, marginBottom: 8 },
                        h1:         { fontSize: 17, fontWeight: '700', color: Colors.gray900, marginBottom: 6 },
                        h2:         { fontSize: 16, fontWeight: '700', color: Colors.gray900, marginBottom: 4 },
                        h3:         { fontSize: 15, fontWeight: '600', color: Colors.gray900, marginBottom: 4 },
                        ul:         { paddingLeft: 16 },
                        ol:         { paddingLeft: 16 },
                        li:         { fontSize: 15, color: Colors.gray700, lineHeight: 22, marginBottom: 4 },
                        blockquote: { paddingLeft: 12, color: Colors.gray500, borderLeftWidth: 3, borderLeftColor: Colors.gray300 },
                        a:          { color: Colors.primary },
                        strong:     { fontWeight: '700', color: Colors.gray900 },
                        em:         { fontStyle: 'italic' },
                        img:        { borderRadius: 8, marginVertical: 8 },
                        td:         { fontSize: 14, color: Colors.gray700, padding: 6 },
                        th:         { fontSize: 14, fontWeight: '700', color: Colors.gray900, padding: 6 },
                      }}
                    />
                  ) : (
                    <Text style={D.message}>{selected.message}</Text>
                  )
                ) : null}

                {/* File đính kèm */}
                {selected.attachment?.url && (
                  <TouchableOpacity
                    style={D.attachment}
                    onPress={() => {
                      const url = selected.attachment!.url.startsWith('http')
                        ? selected.attachment!.url
                        : `${BASE_URL}${selected.attachment!.url}`;
                      Linking.openURL(url);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={D.attachIcon}>
                      {getFileIcon(selected.attachment.mime_type)}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={D.attachName} numberOfLines={2}>
                        {selected.attachment.original_name}
                      </Text>
                      <Text style={D.attachSize}>
                        {fmtFileSize(selected.attachment.size)} · Nhấn để mở
                      </Text>
                    </View>
                    <Text style={D.attachArrow}>↗</Text>
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

const S = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.primary, gap: 8 },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backIcon:{ fontSize: 22, color: Colors.white, fontWeight: '700' },
  title:   { fontSize: 17, fontWeight: '700', color: Colors.white },
  unreadHint: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  item:       { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray100, backgroundColor: Colors.white },
  itemUnread: { backgroundColor: Colors.primary + '06', borderLeftWidth: 3, borderLeftColor: Colors.primary },
  itemIcon:   { fontSize: 22, marginRight: 12, marginTop: 2 },
  itemContent:{ flex: 1 },
  itemTitle:  { fontSize: 14, fontWeight: '700', color: Colors.gray900 },
  itemMsg:    { fontSize: 13, color: Colors.gray600, marginTop: 2, lineHeight: 18 },
  itemTime:   { fontSize: 11, color: Colors.gray400, marginTop: 4 },
  unreadDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  readMore:   { fontSize: 20, color: Colors.gray300, fontWeight: '300' },

  emptyContainer: { flex: 1 },
  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyText: { fontSize: 15, color: Colors.gray500, marginTop: 12 },

  attachBadge:     { flexDirection: 'row', alignItems: 'center', marginTop: 4, backgroundColor: Colors.primary + '10', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  attachBadgeText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
});

const D = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.01)' },
  sheet:    { backgroundColor: Colors.white, borderRadius: 20, width: '100%', maxHeight: '90%', overflow: 'hidden' },

  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.primary },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerIcon: { fontSize: 20 },
  headerType: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  closeIcon:  { color: Colors.white, fontSize: 14, fontWeight: '700' },

  content:  { padding: 20 },
  title:    { fontSize: 18, fontWeight: '800', color: Colors.gray900, lineHeight: 26 },
  time:     { fontSize: 12, color: Colors.gray400, marginTop: 8 },
  senderRow:  { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  senderIcon: { fontSize: 12, marginRight: 4 },
  senderLabel:{ fontSize: 12, color: Colors.gray400 },
  senderName: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  divider:  { height: 1, backgroundColor: Colors.gray100, marginVertical: 16 },
  message:  { fontSize: 15, color: Colors.gray700, lineHeight: 24 },

  attachment: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, backgroundColor: Colors.primary + '08', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.primary + '25' },
  attachIcon: { fontSize: 28 },
  attachName: { fontSize: 13, fontWeight: '600', color: Colors.gray900, lineHeight: 18 },
  attachSize: { fontSize: 11, color: Colors.primary, marginTop: 3, fontWeight: '500' },
  attachArrow:{ fontSize: 18, color: Colors.primary, fontWeight: '700' },
});
 