import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

const TYPE_OPTIONS = [
  { value: 'announcement',  label: '📢 Thông báo chung' },
  { value: 'system',        label: '🔔 Hệ thống' },
  { value: 'payment',       label: '💰 Thanh toán' },
  { value: 'trip_reminder', label: '🚛 Nhắc chuyến xe' },
  { value: 'discipline',    label: '⚠️ Kỷ luật' },
  { value: 'holiday',       label: '🎉 Nghỉ lễ' },
];

interface HistoryItem {
  title: string;
  message: string;
  sent_count: number;
  created_at: string;
}

interface Driver {
  _id: string;
  full_name: string;
  phone: string;
}

export default function AdminNotifications() {
  const navigation = useNavigation<any>();
  /* ── form ── */
  const [title,    setTitle]    = useState('');
  const [message,  setMessage]  = useState('');
  const [type,     setType]     = useState('announcement');
  const [targetId, setTargetId] = useState('');   // '' = tất cả
  const [sending,  setSending]  = useState(false);

  /* ── data ── */
  const [drivers,  setDrivers]  = useState<Driver[]>([]);
  const [history,  setHistory]  = useState<HistoryItem[]>([]);
  const [histLoad, setHistLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* ── pickers ── */
  const [showTypePicker,   setShowTypePicker]   = useState(false);
  const [showDriverPicker, setShowDriverPicker] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get('/notifications/broadcast/history');
      setHistory(res.data.data?.history ?? []);
    } catch (_) {}
    finally { setHistLoad(false); }
  }, []);

  const loadDrivers = useCallback(async () => {
    try {
      const res = await api.get('/drivers', { params: { limit: 200, status: 'active' } });
      setDrivers(res.data.data?.drivers ?? []);
    } catch (_) {}
  }, []);

  useEffect(() => { loadHistory(); loadDrivers(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadHistory(), loadDrivers()]);
    setRefreshing(false);
  };

  const handleSend = async () => {
    if (!title.trim())   { Alert.alert('Lỗi', 'Vui lòng nhập tiêu đề'); return; }
    if (!message.trim()) { Alert.alert('Lỗi', 'Vui lòng nhập nội dung'); return; }

    if (type === 'discipline' && !targetId) {
      Alert.alert('Lỗi', 'Kỷ luật phải chỉ định 1 tài xế cụ thể');
      return;
    }

    const targetName = targetId
      ? drivers.find(d => d._id === targetId)?.full_name ?? 'tài xế đã chọn'
      : `tất cả ${drivers.length} tài xế`;

    Alert.alert(
      'Xác nhận gửi',
      `Gửi thông báo tới ${targetName}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Gửi',
          onPress: async () => {
            setSending(true);
            try {
              const payload: any = { title: title.trim(), message: message.trim(), type };
              if (targetId) payload.target_driver_id = targetId;
              const res = await api.post('/notifications/broadcast', payload);
              Alert.alert('✅ Thành công', res.data.message ?? 'Đã gửi thông báo');
              setTitle(''); setMessage(''); setType('announcement'); setTargetId('');
              loadHistory();
            } catch (e: any) {
              Alert.alert('Lỗi', e?.response?.data?.message ?? 'Gửi thất bại');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  const selectedType = TYPE_OPTIONS.find(t => t.value === type);
  const selectedDriver = drivers.find(d => d._id === targetId);

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Thông báo</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={S.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {/* ── Compose card ── */}
          <View style={S.card}>
            <View style={S.cardHeader}>
              <Text style={S.cardTitle}>📨 Soạn thông báo</Text>
            </View>

            {/* Người nhận */}
            <View style={S.field}>
              <Text style={S.label}>Người nhận</Text>
              <TouchableOpacity
                style={S.picker}
                onPress={() => { setShowDriverPicker(!showDriverPicker); setShowTypePicker(false); }}
              >
                <View style={S.pickerLeft}>
                  <Text style={S.pickerIcon}>{selectedDriver ? '👤' : (type === 'discipline' ? '⚠️' : '👥')}</Text>
                  <Text style={[S.pickerText, type === 'discipline' && !selectedDriver && { color: '#dc2626' }]}>
                    {selectedDriver
                      ? selectedDriver.full_name
                      : type === 'discipline'
                        ? 'Chọn tài xế bị kỷ luật *'
                        : `Tất cả tài xế (${drivers.length})`}
                  </Text>
                </View>
                <Text style={S.pickerArrow}>{showDriverPicker ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showDriverPicker && (
                <View style={S.dropdown}>
                  {/* Option: Tất cả — ẩn khi loại là kỷ luật */}
                  {type !== 'discipline' && (
                    <TouchableOpacity
                      style={[S.dropItem, !targetId && S.dropItemActive]}
                      onPress={() => { setTargetId(''); setShowDriverPicker(false); }}
                    >
                      <View style={S.dropAvatar}>
                        <Text style={{ fontSize: 14 }}>👥</Text>
                      </View>
                      <Text style={[S.dropText, !targetId && S.dropTextActive]}>
                        Tất cả tài xế ({drivers.length})
                      </Text>
                      {!targetId && <Text style={S.checkMark}>✓</Text>}
                    </TouchableOpacity>
                  )}
                  {type === 'discipline' && !targetId && (
                    <View style={[S.dropItem, { backgroundColor: '#fff3f3' }]}>
                      <Text style={{ fontSize: 12, color: '#dc2626', fontStyle: 'italic', flex: 1 }}>
                        ⚠️ Chọn 1 tài xế bị kỷ luật
                      </Text>
                    </View>
                  )}

                  {/* Từng tài xế — chỉ hiển thị tên */}
                  {drivers.map(d => (
                    <TouchableOpacity
                      key={d._id}
                      style={[S.dropItem, targetId === d._id && S.dropItemActive]}
                      onPress={() => { setTargetId(d._id); setShowDriverPicker(false); }}
                    >
                      <View style={[S.dropAvatar, targetId === d._id && { backgroundColor: Colors.primary }]}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: targetId === d._id ? Colors.white : Colors.primary }}>
                          {d.full_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[S.dropText, targetId === d._id && S.dropTextActive]}>
                        {d.full_name}
                      </Text>
                      {targetId === d._id && <Text style={S.checkMark}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Loại */}
            <View style={S.field}>
              <Text style={S.label}>Loại thông báo</Text>
              <TouchableOpacity
                style={S.picker}
                onPress={() => { setShowTypePicker(!showTypePicker); setShowDriverPicker(false); }}
              >
                <Text style={S.pickerText}>{selectedType?.label ?? '📢 Thông báo chung'}</Text>
                <Text style={S.pickerArrow}>{showTypePicker ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showTypePicker && (
                <View style={S.dropdown}>
                  {TYPE_OPTIONS.map(t => (
                    <TouchableOpacity
                      key={t.value}
                      style={[S.dropItem, type === t.value && S.dropItemActive]}
                      onPress={() => { setType(t.value); setShowTypePicker(false); }}
                    >
                      <Text style={[S.dropText, type === t.value && S.dropTextActive]}>{t.label}</Text>
                      {type === t.value && <Text style={{ color: Colors.primary }}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Tiêu đề */}
            <View style={S.field}>
              <Text style={S.label}>Tiêu đề *</Text>
              <TextInput
                style={S.input}
                value={title}
                onChangeText={setTitle}
                placeholder="VD: Thông báo nghỉ lễ 2/9"
                placeholderTextColor={Colors.gray400}
                maxLength={100}
                returnKeyType="next"
              />
              <Text style={S.charCount}>{title.length}/100</Text>
            </View>

            {/* Nội dung */}
            <View style={S.field}>
              <Text style={S.label}>Nội dung *</Text>
              <TextInput
                style={[S.input, S.textarea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Nhập nội dung thông báo..."
                placeholderTextColor={Colors.gray400}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={5000}
              />
              <Text style={S.charCount}>{message.length}/5000</Text>
            </View>

            {/* Preview */}
            {(title || message) ? (
              <View style={S.preview}>
                <Text style={S.previewLabel}>Xem trước</Text>
                <View style={S.previewContent}>
                  <Text style={S.previewIcon}>{selectedType?.label.split(' ')[0] ?? '🔔'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={S.previewTitle}>{title || '(tiêu đề)'}</Text>
                    <Text style={S.previewMsg}>{message || '(nội dung)'}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Send button */}
            <TouchableOpacity
              style={[S.sendBtn, (sending || !title.trim() || !message.trim()) && S.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending || !title.trim() || !message.trim()}
              activeOpacity={0.8}
            >
              {sending
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={S.sendBtnText}>📨 Gửi thông báo</Text>
              }
            </TouchableOpacity>
          </View>

          {/* ── History ── */}
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>Lịch sử gửi</Text>
          </View>

          {histLoad ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
          ) : history.length === 0 ? (
            <View style={S.empty}>
              <Text style={{ fontSize: 36 }}>🔔</Text>
              <Text style={S.emptyText}>Chưa có thông báo nào</Text>
            </View>
          ) : (
            history.map((h, i) => (
              <View key={i} style={S.histItem}>
                <View style={S.histTop}>
                  <Text style={S.histTitle} numberOfLines={1}>{h.title}</Text>
                  <View style={S.sentBadge}>
                    <Text style={S.sentBadgeText}>✓ {h.sent_count}</Text>
                  </View>
                </View>
                <Text style={S.histMsg} numberOfLines={2}>{h.message}</Text>
                <Text style={S.histTime}>
                  🕐 {h.created_at
                    ? format(parseISO(h.created_at), 'HH:mm - dd/MM/yyyy', { locale: vi })
                    : '—'}
                </Text>
              </View>
            ))
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  header:      { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn:     { width: 36, height: 36, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.white, flex: 1 },
  content:     { padding: 14, paddingBottom: 20 },

  card:        { backgroundColor: Colors.white, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  cardHeader:  { backgroundColor: Colors.primary + '0d', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  cardTitle:   { fontSize: 15, fontWeight: '700', color: Colors.gray900 },

  field:       { paddingHorizontal: 16, paddingTop: 14 },
  label:       { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  charCount:   { fontSize: 11, color: Colors.gray400, textAlign: 'right', marginTop: 3 },

  input:       { borderWidth: 1.5, borderColor: Colors.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: Colors.gray900, backgroundColor: Colors.white },
  textarea:    { minHeight: 100, textAlignVertical: 'top', paddingTop: 10 },

  picker:      { borderWidth: 1.5, borderColor: Colors.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: Colors.white, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  pickerIcon:  { fontSize: 16 },
  pickerText:  { fontSize: 14, color: Colors.gray900, flex: 1 },
  pickerArrow: { fontSize: 12, color: Colors.gray500 },

  dropdown:    { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, backgroundColor: Colors.white, marginTop: 4, maxHeight: 240, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
  dropItem:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  dropItemActive: { backgroundColor: Colors.primary + '0d' },
  dropAvatar:  { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary + '18', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  dropText:    { fontSize: 14, color: Colors.gray800, flex: 1 },
  dropTextActive: { color: Colors.primary, fontWeight: '600' },
  dropSub:     { fontSize: 11, color: Colors.gray400, marginTop: 1 },
  checkMark:   { fontSize: 14, color: Colors.primary, fontWeight: '700' },

  preview:     { marginHorizontal: 16, marginTop: 12, backgroundColor: Colors.primary + '08', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.primary + '25' },
  previewLabel:{ fontSize: 10, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  previewContent:{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  previewIcon: { fontSize: 22 },
  previewTitle:{ fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  previewMsg:  { fontSize: 12, color: Colors.gray600, marginTop: 2 },

  sendBtn:     { margin: 16, marginTop: 14, backgroundColor: Colors.primary, borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 4 },
  sectionTitle:  { fontSize: 14, fontWeight: '700', color: Colors.gray700, textTransform: 'uppercase', letterSpacing: 0.5 },

  histItem:  { backgroundColor: Colors.white, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  histTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  histTitle: { fontSize: 14, fontWeight: '700', color: Colors.gray900, flex: 1, marginRight: 8 },
  sentBadge: { backgroundColor: Colors.success + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  sentBadgeText: { fontSize: 11, color: Colors.success, fontWeight: '700' },
  histMsg:   { fontSize: 13, color: Colors.gray600, lineHeight: 18 },
  histTime:  { fontSize: 11, color: Colors.gray400, marginTop: 6 },

  empty:     { alignItems: 'center', paddingTop: 32, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.gray500 },
});
