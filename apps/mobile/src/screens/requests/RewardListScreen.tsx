import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import type { RootStackParamList } from '@/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Reward {
  _id: string;
  title: string;
  status: string;
  created_at: string;
  payload: {
    date?: string;
    type?: string;
    amount?: number;
    reason?: string;
  };
}

export default function RewardListScreen() {
  const navigation = useNavigation<Nav>();
  const [items, setItems]         = useState<Reward[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm]   = useState(false);

  const fetch = async () => {
    try {
      const res = await api.get('/requests', {
        params: { type: 'reward', limit: 100 },
      });
      setItems(res.data.data?.requests ?? []);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  };

  const fmtMoney = (v: number) =>
    v > 0 ? '+' + new Intl.NumberFormat('vi-VN').format(v) + 'đ' : '—';

  const TYPE_COLOR: Record<string, string> = {
    'Đạt KPI':        '#1565c0',
    'Vượt chỉ tiêu':  '#2e7d32',
    'Chuyên cần':     '#e65100',
    'Khác':           '#6d4c41',
  };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Khen thưởng</Text>
        {/* Nút thêm mới */}
        <TouchableOpacity
          style={S.addBtn}
          onPress={() => setShowForm(true)}
        >
          <Text style={S.addBtnText}>+ Yêu cầu</Text>
        </TouchableOpacity>
      </View>

      {/* Form modal overlay — slide up */}
      {showForm && (
        <RewardForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); fetch(); }}
        />
      )}

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={items.length === 0 ? S.emptyContainer : S.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const typeColor = TYPE_COLOR[item.payload?.type ?? ''] ?? Colors.primary;
            return (
              <TouchableOpacity
                style={S.card}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('RequestDetail', { requestId: item._id })}
              >
                {/* Left accent bar */}
                <View style={[S.accentBar, { backgroundColor: Colors.accent }]} />

                <View style={S.cardContent}>
                  {/* Top row: date + amount */}
                  <View style={S.cardTopRow}>
                    <Text style={S.cardDate}>
                      {item.payload?.date ??
                        format(parseISO(item.created_at), 'dd/MM/yyyy', { locale: vi })}
                    </Text>
                    <Text style={S.cardAmount}>{fmtMoney(item.payload?.amount ?? 0)}</Text>
                  </View>

                  {/* Title */}
                  <Text style={S.cardTitle} numberOfLines={1}>{item.title}</Text>

                  {/* Type badge */}
                  {item.payload?.type && (
                    <View style={[S.typeBadge, { backgroundColor: typeColor + '18' }]}>
                      <Text style={[S.typeBadgeText, { color: typeColor }]}>
                        🏆 {item.payload.type}
                      </Text>
                    </View>
                  )}

                  {/* Reason preview */}
                  {item.payload?.reason && (
                    <Text style={S.cardReason} numberOfLines={2}>
                      {item.payload.reason}
                    </Text>
                  )}
                </View>

                <Text style={S.chevron}>›</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{ fontSize: 52 }}>🏆</Text>
              <Text style={S.emptyTitle}>Chưa có khen thưởng</Text>
              <Text style={S.emptySub}>Các khen thưởng sẽ hiện ở đây</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

/* ─── Reward Form (inline modal) ─── */
function RewardForm({
  onClose, onSuccess,
}: { onClose: () => void; onSuccess: () => void }) {
  const [date, setDate]     = useState(format(new Date(), 'dd/MM/yyyy'));
  const [title, setTitle]   = useState('');
  const [type, setType]     = useState('Đạt KPI');
  const [showType, setShowType] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const REWARD_TYPES = ['Đạt KPI', 'Vượt chỉ tiêu', 'Chuyên cần', 'Khác'];

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim())                     e.title  = 'Vui lòng nhập tiêu đề';
    if (!amount || Number(amount) <= 0)    e.amount = 'Vui lòng nhập tiền thưởng';
    if (!reason.trim())                    e.reason = 'Vui lòng nhập lý do';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post('/requests', {
        type:  'reward',
        title,
        payload: { date, type, amount: Number(amount), reason },
      });
      onSuccess();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Không thể gửi yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  const setErr = (k: string) => (v: string) => {
    if (k === 'title')  setTitle(v);
    if (k === 'amount') setAmount(v.replace(/[^0-9]/g, ''));
    if (k === 'reason') setReason(v);
    setErrors(e => ({ ...e, [k]: '' }));
  };

  return (
    <View style={F.overlay}>
      <TouchableOpacity style={F.backdrop} onPress={onClose} activeOpacity={1} />
      <View style={F.sheet}>
        {/* Sheet header */}
        <View style={F.sheetHeader}>
          <Text style={F.sheetTitle}>Khen thưởng</Text>
          <TouchableOpacity onPress={onClose} style={F.closeBtn}>
            <Text style={F.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={F.formCard}>
          {/* Ngày */}
          <View style={F.fieldGroup}>
            <Text style={F.label}>Ngày <Text style={F.required}>*</Text></Text>
            <TextInput
              style={F.input}
              value={date}
              onChangeText={setDate}
              placeholder="dd/mm/yyyy"
              placeholderTextColor={Colors.gray400}
              editable={false}
            />
          </View>

          {/* Tiêu đề */}
          <View style={F.fieldGroup}>
            <Text style={F.label}>Tiêu đề <Text style={F.required}>*</Text></Text>
            <TextInput
              style={[F.input, errors.title && F.inputErr]}
              value={title}
              onChangeText={setErr('title')}
              placeholder="Nhập tiêu đề khen thưởng..."
              placeholderTextColor={Colors.gray400}
            />
            {errors.title ? <Text style={F.err}>{errors.title}</Text> : null}
          </View>

          {/* Loại */}
          <View style={F.fieldGroup}>
            <Text style={F.label}>Loại</Text>
            <TouchableOpacity
              style={[F.input, F.selectRow]}
              onPress={() => setShowType(!showType)}
              activeOpacity={0.8}
            >
              <Text style={F.selectText}>{type}</Text>
              <Text style={F.arrow}>{showType ? '▴' : '▾'}</Text>
            </TouchableOpacity>
            {showType && (
              <View style={F.dropdown}>
                {REWARD_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={F.dropItem}
                    onPress={() => { setType(t); setShowType(false); }}
                  >
                    <Text style={[F.dropText, t === type && F.dropActive]}>{t}</Text>
                    {t === type && <Text style={F.check}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Tiền thưởng */}
          <View style={F.fieldGroup}>
            <Text style={F.label}>
              Tiền thưởng (VNĐ) <Text style={F.required}>*</Text>
            </Text>
            <View style={F.amountRow}>
              <TextInput
                style={[F.amountInput, errors.amount && F.inputErr]}
                value={amount}
                onChangeText={setErr('amount')}
                placeholder="0"
                placeholderTextColor={Colors.gray400}
                keyboardType="numeric"
                textAlign="right"
              />
              <Text style={F.amountUnit}>đ</Text>
            </View>
            {errors.amount ? <Text style={F.err}>{errors.amount}</Text> : null}
          </View>

          {/* Lý do */}
          <View style={F.fieldGroup}>
            <Text style={F.label}>
              Lý do <Text style={F.required}>*</Text>
            </Text>
            <TextInput
              style={[F.textarea, errors.reason && F.inputErr]}
              value={reason}
              onChangeText={setErr('reason')}
              placeholder="Nhập lý do chi tiết..."
              placeholderTextColor={Colors.gray400}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {errors.reason ? <Text style={F.err}>{errors.reason}</Text> : null}
          </View>
        </View>

        {/* Submit */}
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
    </View>
  );
}

/* ─────────────────────── List Styles ─────────────────────── */
const S = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#f4f5f9' },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  backBtn:     { width: 36, height: 36, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.white, flex: 1, textAlign: 'center' },
  addBtn: {
    backgroundColor: Colors.accent, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: Colors.gray900 },

  listContent:   { padding: 16, paddingBottom: 32 },
  emptyContainer:{ flex: 1 },

  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  accentBar:   { width: 5, alignSelf: 'stretch' },
  cardContent: { flex: 1, padding: 14 },
  cardTopRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardDate:    { fontSize: 11, color: Colors.gray500 },
  cardAmount:  { fontSize: 15, fontWeight: '800', color: Colors.success },
  cardTitle:   { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 6 },
  typeBadge:   { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4 },
  typeBadgeText:{ fontSize: 11, fontWeight: '700' },
  cardReason:  { fontSize: 12, color: Colors.gray500, lineHeight: 17 },
  chevron:     { fontSize: 20, color: Colors.gray300, paddingHorizontal: 12 },

  empty:       { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100, gap: 8 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: Colors.gray700 },
  emptySub:    { fontSize: 13, color: Colors.gray400 },
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
    backgroundColor: '#f4f5f9',
    borderRadius: 20, width: '100%',
    maxHeight: '92%',
    paddingBottom: 8,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: Colors.primary,
  },
  sheetTitle:  { fontSize: 17, fontWeight: '600', color: Colors.white },
  closeBtn:    { width: 32, height: 32, justifyContent: 'center', alignItems: 'flex-end' },
  closeBtnText:{ fontSize: 18, color: 'rgba(255,255,255,0.8)' },

  formCard: {
    backgroundColor: Colors.white, borderRadius: 12,
    margin: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05, shadowRadius: 20, elevation: 3,
  },

  fieldGroup: { marginBottom: 16 },
  label:      { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  required:   { color: Colors.error },
  input: {
    borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.gray900, backgroundColor: Colors.white,
  },
  inputErr:   { borderColor: Colors.error },
  err:        { fontSize: 11, color: Colors.error, marginTop: 3 },
  textarea: {
    borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8,
    padding: 12, fontSize: 14, color: Colors.gray900,
    minHeight: 96, textAlignVertical: 'top',
  },

  selectRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectText:{ fontSize: 14, color: Colors.gray900, flex: 1 },
  arrow:     { fontSize: 13, color: Colors.gray400 },
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
  dropText:  { fontSize: 14, color: Colors.gray800 },
  dropActive:{ color: Colors.primary, fontWeight: '700' },
  check:     { color: Colors.primary, fontSize: 14, fontWeight: '700' },

  amountRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8,
    backgroundColor: Colors.white, paddingRight: 14,
  },
  amountInput: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.gray900, borderWidth: 0, textAlign: 'right',
  },
  amountUnit: { fontSize: 14, color: Colors.gray400, textDecorationLine: 'underline', textDecorationStyle: 'dotted' },

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
    flex: 2, backgroundColor: Colors.primary, borderRadius: 12, height: 52,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  submitDisabled: { opacity: 0.55 },
  submitText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
