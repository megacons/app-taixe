import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { usePhotoWatermark } from '@/hooks/usePhotoWatermark';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { format } from 'date-fns';

const EXPENSE_TYPES = ['Xăng dầu', 'Cầu đường', 'Sửa chữa', 'Ăn uống', 'Khác'];

export default function ExpenseRequestScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();

  const [date, setDate]             = useState(format(new Date(), 'dd/MM/yyyy'));
  const [expenseType, setExpenseType] = useState(EXPENSE_TYPES[0]);
  const [showPicker, setShowPicker] = useState(false);
  const [amount, setAmount]         = useState('');
  const [detail, setDetail]         = useState('');
  const [receipts, setReceipts]     = useState<{ uri: string }[]>([]);
  const { applyWatermark, WatermarkView } = usePhotoWatermark(uri =>
    setReceipts(prev => [...prev, { uri }])
  );
  const [loading, setLoading]       = useState(false);
  const [errors, setErrors]         = useState<Record<string, string>>({});

  /* ── Validate ── */
  const validate = () => {
    const e: Record<string, string> = {};
    if (!amount || Number(amount) <= 0) e.amount = 'Vui lòng nhập số tiền hợp lệ';
    if (!detail.trim())                 e.detail = 'Vui lòng nhập nội dung chi tiết';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ── Camera / Library ── */
  const handlePickReceipt = () => {
    Alert.alert('Chứng từ kèm theo', 'Chọn nguồn ảnh', [
      {
        text: 'Chụp ảnh',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Cần quyền camera', 'Vui lòng cấp quyền camera trong Cài đặt.');
            return;
          }
          const r = await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: true });
          if (!r.canceled) addReceipts(r.assets);
        },
      },
      {
        text: 'Chọn từ thư viện',
        onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            quality: 0.85,
          });
          if (!r.canceled) addReceipts(r.assets);
        },
      },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const addReceipts = async (assets: ImagePicker.ImagePickerAsset[]) => {
    for (const a of assets) await applyWatermark(a.uri);
  };

  const removeReceipt = (idx: number) =>
    setReceipts(prev => prev.filter((_, i) => i !== idx));

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post('/requests', {
        type:  'expense',
        title: `Thanh toán chi phí - ${expenseType}`,
        payload: {
          date,
          expense_type: expenseType,
          amount:       Number(amount),
          detail,
        },
      });
      Alert.alert('✅ Đã gửi', 'Yêu cầu thanh toán đã được gửi!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể gửi yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  /* ── Helpers ── */
  const setFieldErr = (key: string) => (val: string) => {
    if (key === 'amount') setAmount(val.replace(/[^0-9]/g, ''));
    else if (key === 'detail') setDetail(val);
    setErrors(e => ({ ...e, [key]: '' }));
  };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Thanh toán chi phí</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={S.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ══ Section 1: Thông tin chung ══ */}
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionIcon}>ℹ️</Text>
              <Text style={S.sectionTitle}>Thông tin chung</Text>
            </View>

            {/* Ngày thanh toán */}
            <View style={S.fieldGroup}>
              <Text style={S.label}>
                Ngày thanh toán <Text style={S.required}>*</Text>
              </Text>
              <View style={S.inputWithIcon}>
                <Text style={S.inputIcon}>📅</Text>
                <TextInput
                  style={S.inputInner}
                  value={date}
                  onChangeText={setDate}
                  placeholder="dd/mm/yyyy"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
            </View>

            {/* Loại chi phí */}
            <View style={S.fieldGroup}>
              <Text style={S.label}>
                Loại chi phí <Text style={S.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={S.inputWithIcon}
                onPress={() => setShowPicker(!showPicker)}
                activeOpacity={0.8}
              >
                <Text style={S.inputIcon}>🏢</Text>
                <Text style={[S.inputInner, { flex: 1, textAlignVertical: 'center', paddingTop: 0 }]}>
                  {expenseType}
                </Text>
                <Text style={S.dropArrow}>{showPicker ? '▴' : '▾'}</Text>
              </TouchableOpacity>
              {showPicker && (
                <View style={S.dropdown}>
                  {EXPENSE_TYPES.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={S.dropItem}
                      onPress={() => { setExpenseType(t); setShowPicker(false); }}
                    >
                      <Text style={[S.dropItemText, t === expenseType && S.dropItemActive]}>
                        {t}
                      </Text>
                      {t === expenseType && <Text style={S.checkMark}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* ══ Section 2: Chi tiết ══ */}
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionIcon}>📄</Text>
              <Text style={S.sectionTitle}>Chi tiết</Text>
            </View>

            {/* Số tiền */}
            <View style={S.fieldGroup}>
              <Text style={S.label}>
                Số tiền <Text style={S.required}>*</Text>
              </Text>
              <View style={[S.inputWithIcon, errors.amount && S.inputError]}>
                <Text style={S.inputIcon}>💳</Text>
                <TextInput
                  style={[S.inputInner, { textAlign: 'right', flex: 1 }]}
                  value={amount}
                  onChangeText={setFieldErr('amount')}
                  placeholder="0"
                  placeholderTextColor={Colors.gray400}
                  keyboardType="numeric"
                />
                <Text style={S.unitLabel}>VNĐ</Text>
              </View>
              {errors.amount ? <Text style={S.errorText}>{errors.amount}</Text> : null}
            </View>

            {/* Nội dung chi tiết */}
            <View style={S.fieldGroup}>
              <Text style={S.label}>
                Nội dung chi tiết <Text style={S.required}>*</Text>
              </Text>
              <TextInput
                style={[S.textarea, errors.detail && S.inputError]}
                value={detail}
                onChangeText={setFieldErr('detail')}
                placeholder="Nhập nội dung..."
                placeholderTextColor={Colors.gray400}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              {errors.detail ? <Text style={S.errorText}>{errors.detail}</Text> : null}
            </View>
          </View>

          {/* ══ Section 3: Chứng từ kèm theo ══ */}
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionIcon}>🔗</Text>
              <Text style={S.sectionTitle}>Chứng từ kèm theo</Text>
            </View>
            <Text style={S.sectionSub}>
              Vui lòng chụp ảnh hóa đơn, biên lai để đối chiếu.
            </Text>

            {/* Camera button */}
            <TouchableOpacity
              style={S.cameraBox}
              onPress={handlePickReceipt}
              activeOpacity={0.8}
            >
              <View style={S.cameraIconCircle}>
                <Text style={{ fontSize: 24 }}>📷</Text>
              </View>
              <Text style={S.cameraLabel}>Chụp ảnh hóa đơn/chứng từ</Text>
            </TouchableOpacity>

            {/* Preview grid */}
            {receipts.length > 0 && (
              <View style={S.previewGrid}>
                {receipts.map((r, i) => (
                  <View key={i} style={S.previewItem}>
                    <Image source={{ uri: r.uri }} style={S.previewImg} resizeMode="cover" />
                    <TouchableOpacity style={S.removeBtn} onPress={() => removeReceipt(i)}>
                      <Text style={S.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {/* Add more button */}
                <TouchableOpacity style={S.addMoreBtn} onPress={handlePickReceipt}>
                  <Text style={S.addMoreIcon}>＋</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Fixed Footer ── */}
      <View style={S.footer}>
        <TouchableOpacity
          style={[S.submitBtn, loading && S.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.88}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <>
              <Text style={S.submitBtnIcon}>📤</Text>
              <Text style={S.submitBtnText}>Gửi yêu cầu thanh toán</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      <WatermarkView />
    </SafeAreaView>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */
const BRAND = Colors.primary;   // #163797
const BRAND_DARK = Colors.primaryDark; // #0f2870

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#faf8ff' },

  /* Header */
  header: {
    backgroundColor: BRAND,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  backBtn:    { width: 36, height: 36, justifyContent: 'center' },
  backIcon:   { fontSize: 22, color: Colors.white },
  headerTitle:{ fontSize: 17, fontWeight: '700', color: Colors.white, flex: 1, textAlign: 'center' },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
  },
  headerAvatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarInitial: { color: Colors.white, fontWeight: '700', fontSize: 15 },

  /* Scroll */
  content: { padding: 16, gap: 16, paddingBottom: 32 },

  /* Section — dotted border like UI reference */
  section: {
    backgroundColor: Colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND,
    borderStyle: 'dotted',
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionIcon:  { fontSize: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: BRAND },
  sectionSub:   { fontSize: 12, color: Colors.gray500, marginBottom: 14, marginTop: -8 },

  /* Field */
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '500', color: Colors.gray600, marginBottom: 6 },
  required: { color: Colors.error },

  /* Input with leading icon */
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: 8,
    backgroundColor: Colors.white,
    minHeight: 44,
    paddingHorizontal: 10,
    gap: 8,
  },
  inputError: { borderColor: Colors.error },
  inputIcon:  { fontSize: 18, width: 24, textAlign: 'center' },
  inputInner: {
    flex: 1, fontSize: 14, color: Colors.gray900,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  dropArrow:  { fontSize: 13, color: Colors.gray500, paddingLeft: 4 },
  unitLabel:  { fontSize: 13, color: Colors.gray400, paddingLeft: 4 },

  /* Dropdown */
  dropdown: {
    marginTop: 4,
    backgroundColor: Colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gray200,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  dropItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  dropItemText:   { fontSize: 14, color: Colors.gray800 },
  dropItemActive: { color: BRAND, fontWeight: '700' },
  checkMark:      { color: BRAND, fontSize: 14, fontWeight: '700' },

  /* Textarea */
  textarea: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: Colors.gray900,
    backgroundColor: Colors.white,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  errorText: { fontSize: 12, color: Colors.error, marginTop: 4 },

  /* Camera upload box */
  cameraBox: {
    borderWidth: 2,
    borderColor: BRAND + '80',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 24,
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    gap: 10,
  },
  cameraIconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: BRAND,
    justifyContent: 'center', alignItems: 'center',
  },
  cameraLabel: { fontSize: 13, fontWeight: '600', color: BRAND },

  /* Receipt preview */
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  previewItem: { position: 'relative' },
  previewImg: {
    width: 76, height: 76, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.gray200,
  },
  removeBtn: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.error,
    justifyContent: 'center', alignItems: 'center',
  },
  removeBtnText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  addMoreBtn: {
    width: 76, height: 76, borderRadius: 8,
    borderWidth: 2, borderColor: Colors.gray300,
    borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
  },
  addMoreIcon: { fontSize: 24, color: Colors.gray400 },

  /* Footer */
  footer: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    paddingTop: 12,
    backgroundColor: 'rgba(250,248,255,0.92)',
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  submitBtn: {
    backgroundColor: BRAND,
    borderRadius: 50,
    height: 54,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.55 },
  submitBtnIcon: { fontSize: 18 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white, letterSpacing: 0.2 },
});
