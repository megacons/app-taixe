import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, RefreshControl, Modal,
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

const TYPE_ICON: Record<string, string> = {
  announcement: '📢', system: '🔔', payment: '💰',
  trip_reminder: '🚛', discipline: '⚠️', holiday: '🎉',
  salary: '💵', birthday: '🎂',
};

const stripHtml = (s: string) =>
  s ? s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() : '';

interface HistoryItem {
  title:         string;
  message:       string;
  sent_count:    number;
  created_at:    string;
  type?:         string;
  sent_by?:      string;
  target_ids?:   string[] | null;
  sent_to_names?: string[] | null;
}

interface Driver {
  _id: string;
  full_name: string;
  phone: string;
}

export default function AdminNotifications() {
  const navigation = useNavigation<any>();

  /* ── compose form ── */
  const [title,    setTitle]    = useState('');
  const [message,  setMessage]  = useState('');
  const [type,     setType]     = useState('announcement');
  const [targetId, setTargetId] = useState('');
  const [sending,  setSending]  = useState(false);

  /* ── data ── */
  const [drivers,    setDrivers]    = useState<Driver[]>([]);
  const [history,    setHistory]    = useState<HistoryItem[]>([]);
  const [histLoad,   setHistLoad]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* ── compose pickers ── */
  const [showTypePicker,   setShowTypePicker]   = useState(false);
  const [showDriverPicker, setShowDriverPicker] = useState(false);

  /* ── detail bottom sheet ── */
  const [detailItem, setDetailItem] = useState<HistoryItem | null>(null);

  /* ── edit modal ── */
  const [editItem,    setEditItem]    = useState<HistoryItem | null>(null);
  const [editTitle,   setEditTitle]   = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editTargetId, setEditTargetId] = useState(''); // '' = tất cả
  const [showEditDriverPicker, setShowEditDriverPicker] = useState(false);
  const [resending,   setResending]   = useState(false);

  /* ── recipients modal (từ detail) ── */
  const [recipientsOf, setRecipientsOf] = useState<HistoryItem | null>(null);

  /* ── delete ── */
  const [deleting, setDeleting] = useState(false);

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

  /* ── Gửi mới ── */
  const handleSend = async () => {
    if (!title.trim())   { Alert.alert('Lỗi', 'Vui lòng nhập tiêu đề'); return; }
    if (!message.trim()) { Alert.alert('Lỗi', 'Vui lòng nhập nội dung'); return; }
    if (type === 'discipline' && !targetId) {
      Alert.alert('Lỗi', 'Kỷ luật phải chỉ định 1 tài xế cụ thể'); return;
    }
    const targetName = targetId
      ? drivers.find(d => d._id === targetId)?.full_name ?? 'tài xế đã chọn'
      : `tất cả ${drivers.length} tài xế`;

    Alert.alert('Xác nhận gửi', `Gửi thông báo tới ${targetName}?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Gửi', onPress: async () => {
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
          } finally { setSending(false); }
        },
      },
    ]);
  };

  /* ── Mở edit modal ── */
  const openEdit = (h: HistoryItem) => {
    setEditItem(h);
    setEditTitle(h.title);
    setEditMessage(stripHtml(h.message));
    // Pre-populate người nhận: nếu gửi 1 người → set targetId, nhiều người hoặc tất cả → ''
    const firstTargetId = h.target_ids && h.target_ids.length === 1 ? h.target_ids[0] : '';
    setEditTargetId(firstTargetId);
    setShowEditDriverPicker(false);
    setDetailItem(null);
  };

  /* ── Gửi lại sau khi sửa ── */
  const handleResend = async () => {
    if (!editItem) return;
    if (!editTitle.trim())   { Alert.alert('Lỗi', 'Vui lòng nhập tiêu đề'); return; }
    if (!editMessage.trim()) { Alert.alert('Lỗi', 'Vui lòng nhập nội dung'); return; }

    const recipientLabel = editTargetId
      ? drivers.find(d => d._id === editTargetId)?.full_name ?? 'tài xế đã chọn'
      : `tất cả tài xế`;

    Alert.alert('Xác nhận gửi lại', `Gửi lại tới: ${recipientLabel}?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Gửi lại', onPress: async () => {
          setResending(true);
          try {
            const payload: any = {
              title:   editTitle.trim(),
              message: editMessage.trim(),
              type:    editItem.type ?? 'announcement',
            };
            if (editTargetId) {
              payload.target_driver_id = editTargetId;
            }
            const res = await api.post('/notifications/broadcast', payload);
            Alert.alert('✅ Thành công', res.data.message ?? 'Đã gửi lại thông báo');
            setEditItem(null);
            loadHistory();
          } catch (e: any) {
            Alert.alert('Lỗi', e?.response?.data?.message ?? 'Gửi lại thất bại');
          } finally { setResending(false); }
        },
      },
    ]);
  };

  /* ── Xóa thông báo ── */
  const handleDelete = (h: HistoryItem) => {
    Alert.alert(
      'Xóa thông báo',
      `Xóa thông báo "${h.title}"?\n\nHành động này sẽ xóa toàn bộ thông báo đã gửi cho tất cả người nhận.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa', style: 'destructive', onPress: async () => {
            setDeleting(true);
            setDetailItem(null);
            try {
              await api.delete('/notifications/broadcast/recall', {
                data: { title: h.title, message: h.message, created_at: h.created_at },
              });
              Alert.alert('✅ Đã xóa', 'Thông báo đã được xóa');
              loadHistory();
            } catch (e: any) {
              Alert.alert('Lỗi', e?.response?.data?.message ?? 'Xóa thất bại');
            } finally { setDeleting(false); }
          },
        },
      ]
    );
  };

  const selectedType   = TYPE_OPTIONS.find(t => t.value === type);
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
                  {type !== 'discipline' && (
                    <TouchableOpacity
                      style={[S.dropItem, !targetId && S.dropItemActive]}
                      onPress={() => { setTargetId(''); setShowDriverPicker(false); }}
                    >
                      <View style={S.dropAvatar}><Text style={{ fontSize: 14 }}>👥</Text></View>
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
                      <Text style={[S.dropText, targetId === d._id && S.dropTextActive]}>{d.full_name}</Text>
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
              <TouchableOpacity
                key={i}
                style={S.histItem}
                onPress={() => setDetailItem(h)}
                activeOpacity={0.75}
              >
                <View style={S.histTop}>
                  <Text style={S.histIcon}>{TYPE_ICON[h.type ?? ''] ?? '🔔'}</Text>
                  <Text style={S.histTitle} numberOfLines={1}>{h.title}</Text>
                  <TouchableOpacity
                    style={S.sentBadge}
                    onPress={(e) => { e.stopPropagation(); setRecipientsOf(h); }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={S.sentBadgeText}>
                      ✓ {(!h.target_ids || h.target_ids.length === 0) ? 'Tất cả' : `${h.sent_count} người`}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={S.histMsg} numberOfLines={2}>{stripHtml(h.message)}</Text>
                <View style={S.histFooter}>
                  <Text style={S.histTime}>
                    🕐 {h.created_at ? format(parseISO(h.created_at), 'HH:mm - dd/MM/yyyy', { locale: vi }) : '—'}
                  </Text>
                  <Text style={S.histDetail}>Xem chi tiết ›</Text>
                </View>
              </TouchableOpacity>
            ))
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ════════════════════════════════
          DETAIL BOTTOM SHEET
          ════════════════════════════════ */}
      <Modal visible={!!detailItem} transparent animationType="fade">
        <View style={D.overlay}>
          <TouchableOpacity style={D.backdrop} activeOpacity={1} onPress={() => setDetailItem(null)} />
          <View style={D.sheet}>
            {/* Header */}
            <View style={D.header}>
              <Text style={D.headerIcon}>{TYPE_ICON[detailItem?.type ?? ''] ?? '🔔'}</Text>
              <Text style={D.headerType} numberOfLines={1}>
                {TYPE_OPTIONS.find(t => t.value === detailItem?.type)?.label?.split(' ').slice(1).join(' ') ?? 'Thông báo'}
              </Text>
              <TouchableOpacity onPress={() => setDetailItem(null)} style={D.closeBtn}>
                <Text style={D.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={D.content} showsVerticalScrollIndicator={false}>
              {/* Tiêu đề */}
              <Text style={D.title}>{detailItem?.title}</Text>

              {/* Thời gian + người gửi */}
              <Text style={D.time}>
                🕐 {detailItem?.created_at
                  ? format(parseISO(detailItem.created_at), 'HH:mm - dd/MM/yyyy (EEEE)', { locale: vi })
                  : '—'}
              </Text>
              {detailItem?.sent_by && (
                <Text style={D.sender}>👤 Gửi bởi: <Text style={{ color: Colors.primary, fontWeight: '600' }}>{detailItem.sent_by}</Text></Text>
              )}

              {/* Người nhận */}
              <TouchableOpacity
                style={D.recipientRow}
                onPress={() => { setRecipientsOf(detailItem); setDetailItem(null); }}
                activeOpacity={0.7}
              >
                <Text style={D.recipientIcon}>👥</Text>
                <Text style={D.recipientText}>
                  {(!detailItem?.target_ids || detailItem.target_ids.length === 0)
                    ? `Tất cả (${detailItem?.sent_count ?? 0} người)`
                    : detailItem?.sent_to_names?.length
                      ? detailItem.sent_to_names.join(', ')
                      : `${detailItem?.sent_count ?? 0} người`}
                </Text>
                <Text style={D.recipientArrow}>›</Text>
              </TouchableOpacity>

              <View style={D.divider} />

              {/* Nội dung */}
              <Text style={D.message}>{stripHtml(detailItem?.message ?? '')}</Text>
            </ScrollView>

            {/* Action buttons */}
            <View style={D.actions}>
              <TouchableOpacity
                style={D.deleteBtn}
                onPress={() => detailItem && handleDelete(detailItem)}
                disabled={deleting}
                activeOpacity={0.8}
              >
                {deleting
                  ? <ActivityIndicator color={Colors.error} size="small" />
                  : <Text style={D.deleteBtnText}>🗑 Xóa</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={D.editBtn}
                onPress={() => detailItem && openEdit(detailItem)}
                activeOpacity={0.8}
              >
                <Text style={D.editBtnText}>✏️ Sửa & gửi lại</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════
          EDIT & RESEND MODAL
          ════════════════════════════════ */}
      <Modal visible={!!editItem} transparent animationType="fade">
        <View style={E.overlay}>
          <TouchableOpacity style={E.backdrop} activeOpacity={1} onPress={() => setEditItem(null)} />
          <KeyboardAvoidingView
            style={E.kavWrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={E.sheet}>
              {/* Header */}
              <View style={E.header}>
                <Text style={E.headerTitle}>✏️ Sửa & gửi lại</Text>
                <TouchableOpacity onPress={() => setEditItem(null)} style={E.closeBtn}>
                  <Text style={E.closeIcon}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={E.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Người nhận — có thể thay đổi */}
                <View style={E.field}>
                  <Text style={E.label}>Người nhận</Text>
                  <TouchableOpacity
                    style={E.picker}
                    onPress={() => setShowEditDriverPicker(v => !v)}
                    activeOpacity={0.8}
                  >
                    <View style={E.pickerLeft}>
                      <Text style={E.pickerIcon}>
                        {editTargetId ? '👤' : '👥'}
                      </Text>
                      <Text style={E.pickerText}>
                        {editTargetId
                          ? drivers.find(d => d._id === editTargetId)?.full_name ?? 'Tài xế đã chọn'
                          : `Tất cả tài xế (${drivers.length})`}
                      </Text>
                    </View>
                    <Text style={E.pickerArrow}>{showEditDriverPicker ? '▲' : '▼'}</Text>
                  </TouchableOpacity>

                  {showEditDriverPicker && (
                    <ScrollView style={E.dropdown} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      {/* Tất cả */}
                      <TouchableOpacity
                        style={[E.dropItem, !editTargetId && E.dropItemActive]}
                        onPress={() => { setEditTargetId(''); setShowEditDriverPicker(false); }}
                      >
                        <View style={E.dropAvatar}><Text style={{ fontSize: 14 }}>👥</Text></View>
                        <Text style={[E.dropText, !editTargetId && E.dropTextActive]}>
                          Tất cả tài xế ({drivers.length})
                        </Text>
                        {!editTargetId && <Text style={E.checkMark}>✓</Text>}
                      </TouchableOpacity>
                      {/* Từng tài xế */}
                      {drivers.map(d => (
                        <TouchableOpacity
                          key={d._id}
                          style={[E.dropItem, editTargetId === d._id && E.dropItemActive]}
                          onPress={() => { setEditTargetId(d._id); setShowEditDriverPicker(false); }}
                        >
                          <View style={[E.dropAvatar, editTargetId === d._id && { backgroundColor: Colors.primary }]}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: editTargetId === d._id ? Colors.white : Colors.primary }}>
                              {d.full_name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={[E.dropText, editTargetId === d._id && E.dropTextActive]}>
                            {d.full_name}
                          </Text>
                          {editTargetId === d._id && <Text style={E.checkMark}>✓</Text>}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>

                {/* Tiêu đề */}
                <View style={E.field}>
                  <Text style={E.label}>Tiêu đề <Text style={{ color: Colors.error }}>*</Text></Text>
                  <TextInput
                    style={E.input}
                    value={editTitle}
                    onChangeText={setEditTitle}
                    placeholder="Tiêu đề..."
                    placeholderTextColor={Colors.gray400}
                    maxLength={100}
                  />
                  <Text style={E.charCount}>{editTitle.length}/100</Text>
                </View>

                {/* Nội dung */}
                <View style={E.field}>
                  <Text style={E.label}>Nội dung <Text style={{ color: Colors.error }}>*</Text></Text>
                  <TextInput
                    style={[E.input, E.textarea]}
                    value={editMessage}
                    onChangeText={setEditMessage}
                    placeholder="Nội dung..."
                    placeholderTextColor={Colors.gray400}
                    multiline
                    textAlignVertical="top"
                    maxLength={5000}
                  />
                  <Text style={E.charCount}>{editMessage.length}/5000</Text>
                </View>
              </ScrollView>

              {/* Footer */}
              <View style={E.footer}>
                <TouchableOpacity style={E.cancelBtn} onPress={() => setEditItem(null)}>
                  <Text style={E.cancelBtnText}>Hủy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[E.sendBtn, (resending || !editTitle.trim() || !editMessage.trim()) && E.sendBtnDisabled]}
                  onPress={handleResend}
                  disabled={resending || !editTitle.trim() || !editMessage.trim()}
                  activeOpacity={0.8}
                >
                  {resending
                    ? <ActivityIndicator color={Colors.white} size="small" />
                    : <Text style={E.sendBtnText}>📨 Gửi lại</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ════════════════════════════════
          RECIPIENTS MODAL
          ════════════════════════════════ */}
      <Modal visible={!!recipientsOf} transparent animationType="fade">
        <TouchableOpacity style={RM.overlay} activeOpacity={1} onPress={() => setRecipientsOf(null)}>
          <View style={RM.sheet} onStartShouldSetResponder={() => true}>
            <View style={RM.header}>
              <Text style={RM.headerTitle}>Đã gửi tới</Text>
              <TouchableOpacity onPress={() => setRecipientsOf(null)} style={RM.closeBtn}>
                <Text style={RM.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={RM.notifTitle} numberOfLines={2}>"{recipientsOf?.title}"</Text>

            {recipientsOf?.sent_to_names && recipientsOf.sent_to_names.length > 0 ? (
              <ScrollView style={RM.list} showsVerticalScrollIndicator={false}>
                {recipientsOf.sent_to_names.map((name, i) => (
                  <View key={i} style={RM.row}>
                    <View style={RM.avatar}>
                      <Text style={RM.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={RM.name}>{name}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={RM.emptyBox}>
                <Text style={RM.emptyText}>
                  {recipientsOf && recipientsOf.sent_count > 0
                    ? `Đã gửi tới ${recipientsOf.sent_count} người (tất cả)`
                    : 'Không có thông tin người nhận'}
                </Text>
              </View>
            )}

            <View style={RM.footer}>
              <Text style={RM.footerText}>Tổng: {recipientsOf?.sent_count ?? 0} người nhận</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

/* ── Compose styles ── */
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

  dropdown:       { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, backgroundColor: Colors.white, marginTop: 4, maxHeight: 240, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
  dropItem:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  dropItemActive: { backgroundColor: Colors.primary + '0d' },
  dropAvatar:     { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary + '18', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  dropText:       { fontSize: 14, color: Colors.gray800, flex: 1 },
  dropTextActive: { color: Colors.primary, fontWeight: '600' },
  dropSub:        { fontSize: 11, color: Colors.gray400, marginTop: 1 },
  checkMark:      { fontSize: 14, color: Colors.primary, fontWeight: '700' },

  preview:        { marginHorizontal: 16, marginTop: 12, backgroundColor: Colors.primary + '08', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.primary + '25' },
  previewLabel:   { fontSize: 10, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  previewContent: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  previewIcon:    { fontSize: 22 },
  previewTitle:   { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  previewMsg:     { fontSize: 12, color: Colors.gray600, marginTop: 2 },

  sendBtn:         { margin: 16, marginTop: 14, backgroundColor: Colors.primary, borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnText:     { fontSize: 15, fontWeight: '700', color: Colors.white },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 4 },
  sectionTitle:  { fontSize: 14, fontWeight: '700', color: Colors.gray700, textTransform: 'uppercase', letterSpacing: 0.5 },

  histItem:     { backgroundColor: Colors.white, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  histTop:      { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  histIcon:     { fontSize: 16 },
  histTitle:    { fontSize: 14, fontWeight: '700', color: Colors.gray900, flex: 1 },
  sentBadge:    { backgroundColor: Colors.success + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  sentBadgeText:{ fontSize: 11, color: Colors.success, fontWeight: '700' },
  histMsg:      { fontSize: 13, color: Colors.gray600, lineHeight: 18 },
  histFooter:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  histTime:     { fontSize: 11, color: Colors.gray400 },
  histDetail:   { fontSize: 11, color: Colors.primary, fontWeight: '600' },

  empty:     { alignItems: 'center', paddingTop: 32, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.gray500 },
});

/* ── Detail sheet styles ── */
const D = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  sheet:    { backgroundColor: Colors.white, borderRadius: 20, width: '100%', maxHeight: '88%', overflow: 'hidden' },

  header:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.primary },
  headerIcon: { fontSize: 20 },
  headerType: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.9)', flex: 1 },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  closeIcon:  { color: Colors.white, fontSize: 14, fontWeight: '700' },

  content:      { padding: 20 },
  title:        { fontSize: 18, fontWeight: '800', color: Colors.gray900, lineHeight: 26, marginBottom: 8 },
  time:         { fontSize: 12, color: Colors.gray400, marginBottom: 4 },
  sender:       { fontSize: 12, color: Colors.gray400, marginBottom: 10 },
  recipientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary + '0a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  recipientIcon:{ fontSize: 16 },
  recipientText:{ fontSize: 13, color: Colors.gray700, flex: 1, fontWeight: '500' },
  recipientArrow:{ fontSize: 16, color: Colors.primary, fontWeight: '700' },
  divider:      { height: 1, backgroundColor: Colors.gray100, marginVertical: 16 },
  message:      { fontSize: 15, color: Colors.gray700, lineHeight: 24 },

  actions:       { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  deleteBtn:     { flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.error, justifyContent: 'center', alignItems: 'center' },
  deleteBtnText: { fontSize: 14, fontWeight: '700', color: Colors.error },
  editBtn:       { flex: 2, height: 46, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  editBtnText:   { fontSize: 14, fontWeight: '700', color: Colors.white },
});

/* ── Edit modal styles ── */
const E = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' },
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  kavWrapper: { width: '100%' },
  sheet:      { backgroundColor: Colors.white, borderRadius: 20, width: '100%', maxHeight: '85%', overflow: 'hidden' },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.gray100, justifyContent: 'center', alignItems: 'center' },
  closeIcon:   { fontSize: 12, fontWeight: '700', color: Colors.gray600 },

  content:        { padding: 16 },
  recipientBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginBottom: 4 },
  recipientLabel: { fontSize: 13, fontWeight: '700', color: '#1e40af' },
  recipientValue: { fontSize: 13, color: '#1d4ed8', flex: 1, flexWrap: 'wrap' },

  field:    { marginTop: 14 },
  label:    { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  input:    { borderWidth: 1.5, borderColor: Colors.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: Colors.gray900, backgroundColor: Colors.white },
  textarea: { minHeight: 120, textAlignVertical: 'top', paddingTop: 10 },
  charCount:{ fontSize: 11, color: Colors.gray400, textAlign: 'right', marginTop: 3 },

  picker:      { borderWidth: 1.5, borderColor: Colors.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: Colors.white, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  pickerIcon:  { fontSize: 16 },
  pickerText:  { fontSize: 14, color: Colors.gray900, flex: 1 },
  pickerArrow: { fontSize: 12, color: Colors.gray500 },
  dropdown:       { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, backgroundColor: Colors.white, marginTop: 4, maxHeight: 200, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
  dropItem:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  dropItemActive: { backgroundColor: Colors.primary + '0d' },
  dropAvatar:     { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary + '18', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  dropText:       { fontSize: 14, color: Colors.gray800, flex: 1 },
  dropTextActive: { color: Colors.primary, fontWeight: '600' },
  checkMark:      { fontSize: 14, color: Colors.primary, fontWeight: '700' },

  footer:      { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  cancelBtn:       { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  cancelBtnText:   { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  sendBtn:         { flex: 2, height: 46, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnText:     { fontSize: 14, fontWeight: '700', color: Colors.white },
});

/* ── Recipients modal styles ── */
const RM = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:       { backgroundColor: Colors.white, borderRadius: 20, width: '100%', maxHeight: '75%', overflow: 'hidden' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  closeBtn:    { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.gray100, justifyContent: 'center', alignItems: 'center' },
  closeIcon:   { fontSize: 12, fontWeight: '700', color: Colors.gray600 },
  notifTitle:  { fontSize: 12, color: Colors.gray500, fontStyle: 'italic', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  list:        { maxHeight: 300 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray50 },
  avatar:      { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primary + '18', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText:  { fontSize: 13, fontWeight: '700', color: Colors.primary },
  name:        { fontSize: 14, color: Colors.gray800, fontWeight: '500', flex: 1 },
  emptyBox:    { padding: 24, alignItems: 'center' },
  emptyText:   { fontSize: 14, color: Colors.gray500, textAlign: 'center' },
  footer:      { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.gray100, alignItems: 'center' },
  footerText:  { fontSize: 12, color: Colors.gray400 },
});
