import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import DatePickerField from '@/components/DatePickerField';
import MonthYearPicker from '@/components/MonthYearPicker';

const fmtVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v ?? 0) + 'đ';

const fmtDisplay = (v: string) => {
  const nums = v.replace(/[^0-9]/g, '');
  return nums ? new Intl.NumberFormat('vi-VN').format(Number(nums)) : '';
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: '#fef3c7', text: '#b45309', label: 'Chờ duyệt'  },
  approved:  { bg: '#d1fae5', text: '#065f46', label: 'Đã duyệt'   },
  rejected:  { bg: '#fee2e2', text: '#991b1b', label: 'Từ chối'    },
  completed: { bg: '#dbeafe', text: '#1e40af', label: 'Hoàn thành' },
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1); // unused, kept for reference

export default function FinanceScreen() {
  const navigation = useNavigation();
  const now = new Date();
  const [month, setMonth]         = useState(now.getMonth() + 1);
  const [year,  setYear]          = useState(now.getFullYear());
  const [fund,      setFund]      = useState({ total: 0, approved: 0 });
  const [items,     setItems]     = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm,  setShowForm]  = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;

      const [fundRes, reqRes] = await Promise.all([
        api.get('/fund/me/entries', { params: { month, year } }),
        api.get('/requests', { params: { type: 'expense', limit: 200 } }),
      ]);

      // Không dùng FundEntry totals nữa — chỉ dùng để compat

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

      setItems(filtered);

      // Tính tổng từ requests (không dùng FundEntry advance/remaining nữa)
      const totalAll      = filtered.reduce((s, r) => s + r.amount, 0);
      const totalApproved = filtered.filter(r => r.status === 'approved').reduce((s, r) => s + r.amount, 0);
      setFund({ total: totalAll, approved: totalApproved });
    } catch (_) {}
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Chi phí vận hành</Text>
        <TouchableOpacity style={S.addBtn} onPress={() => setShowForm(true)}>
          <Text style={S.addBtnText}>+ Yêu cầu hoàn chi</Text>
        </TouchableOpacity>
      </View>

      {/* Month selector */}
      <MonthYearPicker
        month={month}
        year={year}
        onChange={(m, y) => { setMonth(m); setYear(y); }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={S.content}
      >
        {/* Summary card */}
        <View style={S.summaryCard}>
          <View style={S.summaryItem}>
            <Text style={S.summaryLabel}>Tổng chi phí tháng {month}/{year}</Text>
            <Text style={[S.summaryValue, { color: Colors.error, fontSize: 16 }]}>{fmtVND(fund.total)}</Text>
          </View>
        </View>

        {/* List header */}
        <View style={S.listHeader}>
          <Text style={S.listTitle}>Chi phí tháng {month}/{year}</Text>
          <Text style={S.listCount}>{items.length} yêu cầu</Text>
        </View>

        {/* List */}
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={S.empty}>
            <Text style={{ fontSize: 40 }}>💸</Text>
            <Text style={S.emptyText}>Chưa có chi phí nào trong tháng</Text>
            <TouchableOpacity style={S.emptyBtn} onPress={() => setShowForm(true)}>
              <Text style={S.emptyBtnText}>+ Tạo yêu cầu hoàn chi</Text>
            </TouchableOpacity>
          </View>
        ) : (
          items.map(item => {
            const st = STATUS_STYLE[item.status] ?? STATUS_STYLE.pending;
            const dateStr = item.date
              ? format(parseISO(item.date + 'T00:00:00'), 'dd/MM/yyyy', { locale: vi })
              : '—';
            return (
              <TouchableOpacity
                key={String(item._id)}
                style={S.card}
                onPress={() => (navigation as any).navigate('RequestDetail', { requestId: item._id })}
                activeOpacity={0.75}
              >
                <View style={S.cardLeft}>
                  <View style={S.iconBox}>
                    <Text style={{ fontSize: 20 }}>💸</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.cardDate}>{dateStr}</Text>
                    {item.note ? (
                      <Text style={S.cardNote} numberOfLines={2}>{item.note}</Text>
                    ) : item.title ? (
                      <Text style={S.cardNote} numberOfLines={1}>{item.title}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={S.cardRight}>
                  <Text style={S.cardAmount}>{fmtVND(item.amount)}</Text>
                  <View style={[S.badge, { backgroundColor: st.bg }]}>
                    <Text style={[S.badgeText, { color: st.text }]}>{st.label}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Form yêu cầu chi */}
      {showForm && (
        <ExpenseForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); fetchData(); }}
        />
      )}
    </SafeAreaView>
  );
}

/* ─── ExpenseForm modal ──────────────────────────────── */
function ExpenseForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [date,    setDate]    = useState<Date | null>(null);
  const [amount,  setAmount]  = useState('');
  const [note,    setNote]    = useState('');
  const [image,   setImage]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState<Record<string, string>>({});

  const rawAmount = () => Number(amount.replace(/[^0-9]/g, ''));

  const pickImage = () => {
    Alert.alert('Thêm ảnh', 'Chọn nguồn ảnh', [
      {
        text: 'Chụp ảnh',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== 'granted') { Alert.alert('Cần quyền camera'); return; }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
          if (!result.canceled) setImage(result.assets[0].uri);
        },
      },
      {
        text: 'Chọn từ thư viện',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (perm.status !== 'granted') { Alert.alert('Cần quyền thư viện ảnh'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: false });
          if (!result.canceled) setImage(result.assets[0].uri);
        },
      },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!date)                           e.date   = 'Vui lòng chọn ngày';
    if (!amount || rawAmount() <= 0)     e.amount = 'Vui lòng nhập số tiền';
    if (!note.trim())                    e.note   = 'Ghi chú là bắt buộc';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      let imageUrl = null;
      if (image) {
        try {
          const fd = new FormData();
          fd.append('receipt', { uri: image, type: 'image/jpeg', name: `expense_${Date.now()}.jpg` } as any);
          const uploadRes = await api.post('/uploads/receipt', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
          imageUrl = uploadRes.data.data?.url ?? null;
        } catch (_) { /* ảnh upload fail — vẫn tiếp tục gửi yêu cầu */ }
      }

      await api.post('/requests', {
        type:  'expense',
        title: `Chi phí - ${format(date!, 'dd/MM/yyyy')}`,
        payload: {
          date:         format(date!, 'yyyy-MM-dd'),
          amount:       rawAmount(),
          note:         note.trim(),
          expense_type: 'Chi phí vận hành',
          ...(imageUrl ? { image_url: imageUrl } : {}),
        },
      });
      Alert.alert('✅ Đã gửi', 'Yêu cầu hoàn chi đã gửi, chờ admin duyệt.', [
        { text: 'OK', onPress: onSuccess },
      ]);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message ?? 'Không thể gửi yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={F.overlay}>
        <TouchableOpacity style={F.backdrop} onPress={onClose} activeOpacity={1} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={F.kavWrapper}
        >
          <View style={F.sheet}>
            <View style={F.header}>
              <TouchableOpacity onPress={onClose}>
                <Text style={F.cancelText}>Hủy</Text>
              </TouchableOpacity>
              <Text style={F.headerTitle}>Yêu cầu hoàn chi</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={F.content} keyboardShouldPersistTaps="handled">
              <DatePickerField label="Ngày" value={date} onChange={(d) => { setDate(d); setErrors(e => ({ ...e, date: '' })); }} required error={errors.date} />

              <View style={F.fieldGroup}>
                <Text style={F.label}>Số tiền cần chi <Text style={F.req}>*</Text></Text>
                <View style={[F.amountRow, errors.amount ? F.inputErr : null]}>
                  <TextInput
                    style={F.amountInput}
                    value={amount}
                    onChangeText={v => {
                      setAmount(fmtDisplay(v));
                      setErrors(e => ({ ...e, amount: '' }));
                    }}
                    placeholder="0"
                    placeholderTextColor={Colors.gray400}
                    keyboardType="numeric"
                    textAlign="right"
                  />
                  <Text style={F.unit}>VNĐ</Text>
                </View>
                {errors.amount ? <Text style={F.errText}>{errors.amount}</Text> : null}
                {rawAmount() > 0 && <Text style={F.amountPreview}>≈ {fmtVND(rawAmount())}</Text>}
              </View>

              <View style={F.fieldGroup}>
                <Text style={F.label}>
                  Ghi chú <Text style={F.req}>*</Text>
                  <Text style={F.reqNote}> (bắt buộc)</Text>
                </Text>
                <TextInput
                  style={[F.textarea, errors.note ? F.inputErr : null]}
                  value={note}
                  onChangeText={v => { setNote(v); setErrors(e => ({ ...e, note: '' })); }}
                  placeholder="Mô tả mục đích chi tiêu..."
                  placeholderTextColor={Colors.gray400}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                {errors.note ? <Text style={F.errText}>{errors.note}</Text> : null}
              </View>

              {/* Ảnh đính kèm — không bắt buộc */}
              <View style={F.fieldGroup}>
                <Text style={F.label}>Ảnh đính kèm <Text style={{ fontSize: 11, color: Colors.gray400, fontWeight: '400' }}>(không bắt buộc)</Text></Text>
                {image ? (
                  <View style={{ position: 'relative' }}>
                    <Image source={{ uri: image }} style={{ width: '100%', height: 180, borderRadius: 12, resizeMode: 'cover' }} />
                    <TouchableOpacity
                      style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' }}
                      onPress={() => setImage(null)}
                    >
                      <Text style={{ color: Colors.white, fontSize: 18, fontWeight: '700' }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{ borderWidth: 1.5, borderColor: Colors.gray300, borderRadius: 12, borderStyle: 'dashed', height: 100, justifyContent: 'center', alignItems: 'center', gap: 6 }}
                    onPress={pickImage}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 28 }}>📷</Text>
                    <Text style={{ fontSize: 13, color: Colors.gray500 }}>Nhấn để thêm ảnh</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>

            <View style={F.footer}>
              <TouchableOpacity
                style={[F.submitBtn, loading && F.submitDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.88}
              >
                {loading
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={F.submitText}>📤 Gửi yêu cầu</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ─── Styles ──────────────────────────────────────────── */
const S = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  header:      { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:     { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.white },
  addBtn:      { backgroundColor: Colors.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  addBtnText:  { fontSize: 13, fontWeight: '700', color: Colors.gray900 },

  monthWrap:   { display: 'none' } as any,
  monthScroll: {} as any,
  monthChip:   {} as any,
  monthChipActive:     {} as any,
  monthChipText:       {} as any,
  monthChipTextActive: {} as any,
  yearRow:     {} as any,
  yearChip:    {} as any,
  yearChipActive:  {} as any,
  yearText:    {} as any,
  yearTextActive: {} as any,

  content: { padding: 14 },

  summaryCard:    { backgroundColor: Colors.white, borderRadius: 14, padding: 16, flexDirection: 'row', borderWidth: 1, borderColor: Colors.border, marginBottom: 14 },
  summaryItem:    { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: Colors.gray100, marginHorizontal: 4 },
  summaryLabel:   { fontSize: 11, color: Colors.gray500, fontWeight: '600', marginBottom: 4 },
  summaryValue:   { fontSize: 13, fontWeight: '700', color: Colors.gray900 },

  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  listTitle:  { fontSize: 13, fontWeight: '700', color: Colors.gray700, textTransform: 'uppercase', letterSpacing: 0.4 },
  listCount:  { fontSize: 12, color: Colors.gray500 },

  card:      { backgroundColor: Colors.white, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cardLeft:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  iconBox:   { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.error + '12', justifyContent: 'center', alignItems: 'center' },
  cardDate:  { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  cardNote:  { fontSize: 11, color: Colors.gray500, marginTop: 2, fontStyle: 'italic' },
  cardRight: { alignItems: 'flex-end', gap: 5, marginLeft: 8 },
  cardAmount:{ fontSize: 14, fontWeight: '800', color: Colors.gray900 },
  badge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  empty:       { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText:   { fontSize: 14, color: Colors.gray500 },
  emptyBtn:    { backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  emptyBtnText:{ fontSize: 14, fontWeight: '700', color: Colors.white },
});

const F = StyleSheet.create({
  overlay:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  backdrop:  { ...StyleSheet.absoluteFillObject },
  kavWrapper:{ width: '92%', zIndex: 1 },
  sheet:     { backgroundColor: Colors.white, borderRadius: 20, width: '100%', maxHeight: '88%', overflow: 'hidden' },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.primary },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.white },
  cancelText:  { fontSize: 15, color: 'rgba(255,255,255,0.8)' },
  content:    { padding: 20 },
  fieldGroup: { marginBottom: 18 },
  label:      { fontSize: 14, fontWeight: '600', color: Colors.gray700, marginBottom: 8 },
  req:        { color: Colors.error },
  reqNote:    { fontSize: 12, color: Colors.gray400, fontWeight: '400' },
  errText:    { fontSize: 12, color: Colors.error, marginTop: 4 },
  amountRow:  { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: Colors.gray200, borderRadius: 12, backgroundColor: Colors.white, overflow: 'hidden', minHeight: 56 },
  inputErr:   { borderColor: Colors.error },
  amountInput:{ flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 22, fontWeight: '700', color: Colors.gray900 },
  unit:       { paddingRight: 16, fontSize: 14, fontWeight: '600', color: Colors.gray500 },
  amountPreview: { fontSize: 12, color: Colors.primary, marginTop: 4, fontWeight: '600' },
  textarea:   { borderWidth: 2, borderColor: Colors.gray200, borderRadius: 12, padding: 14, fontSize: 15, color: Colors.gray900, minHeight: 110, textAlignVertical: 'top', backgroundColor: Colors.white },
  footer:     { paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray100, backgroundColor: Colors.white },
  submitBtn:  { backgroundColor: Colors.primary, borderRadius: 12, height: 54, justifyContent: 'center', alignItems: 'center' },
  submitDisabled: { opacity: 0.55 },
  submitText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
