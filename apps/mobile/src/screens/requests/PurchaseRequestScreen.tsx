import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { usePhotoWatermark } from '@/hooks/usePhotoWatermark';
import { format } from 'date-fns';

const PURCHASE_TYPES = [
  'Chọn loại vật tư...',
  'Phụ tùng xe',
  'Lốp xe',
  'Dầu nhớt',
  'Vật tư tiêu hao',
  'Dụng cụ sửa chữa',
  'Văn phòng phẩm',
  'Khác',
];

export default function PurchaseRequestScreen() {
  const navigation = useNavigation();

  const [date, setDate]               = useState(format(new Date(), 'dd/MM/yyyy'));
  const [purchaseType, setPurchaseType] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [quantity, setQuantity]       = useState('0');
  const [unitPrice, setUnitPrice]     = useState('0');
  const [detail, setDetail]           = useState('');
  const [images, setImages]           = useState<{ uri: string }[]>([]);
  const { applyWatermark, WatermarkView } = usePhotoWatermark(uri =>
    setImages(prev => [...prev, { uri }])
  );
  const [loading, setLoading]         = useState(false);
  const [errors, setErrors]           = useState<Record<string, string>>({});

  // Auto-calc total
  const totalAmount = Number(quantity || 0) * Number(unitPrice || 0);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!purchaseType || purchaseType === 'Chọn loại vật tư...')
      e.purchaseType = 'Vui lòng chọn loại vật tư';
    if (!quantity || Number(quantity) <= 0) e.quantity = 'Số lượng phải lớn hơn 0';
    if (!unitPrice || Number(unitPrice) <= 0) e.unitPrice = 'Đơn giá phải lớn hơn 0';
    if (!detail.trim()) e.detail = 'Vui lòng nhập nội dung chi tiết';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePickImage = () => {
    Alert.alert('Ảnh minh chứng', '', [
      {
        text: 'Chụp ảnh',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
          if (!r.canceled) await applyWatermark(r.assets[0].uri);
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
          if (!r.canceled)
            for (const a of r.assets) await applyWatermark(a.uri);
        },
      },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const removeImage = (idx: number) =>
    setImages(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post('/requests', {
        type:  'purchase',
        title: `Mua hàng - ${purchaseType}`,
        payload: {
          date,
          purchase_type: purchaseType,
          quantity:      Number(quantity),
          unit_price:    Number(unitPrice),
          total_amount:  totalAmount,
          detail,
        },
      });
      Alert.alert('✅ Đã gửi', 'Yêu cầu mua hàng đã được gửi!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể gửi yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  const setErr =
    (key: string, setter: (v: string) => void) => (v: string) => {
      setter(v);
      setErrors(e => ({ ...e, [key]: '' }));
    };

  const fmtMoney = (v: number) =>
    v > 0 ? new Intl.NumberFormat('vi-VN').format(v) + 'đ' : '—';

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Form Mua hàng</Text>
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

          {/* ══ Card 1: Thông tin mua hàng ══ */}
          <View style={S.card}>
            {/* Card title */}
            <View style={S.cardHeader}>
              <View style={S.cardIconCircle}>
                <Text style={S.cardIconText}>i</Text>
              </View>
              <Text style={S.cardTitle}>THÔNG TIN MUA HÀNG</Text>
            </View>
            <View style={S.divider} />

            {/* Ngày yêu cầu */}
            <Field label="Ngày yêu cầu *">
              <TextInput
                style={S.input}
                value={date}
                onChangeText={setErr('date', setDate)}
                placeholder="dd/mm/yyyy"
                placeholderTextColor={Colors.gray400}
                editable={false}
              />
            </Field>

            {/* Loại vật tư */}
            <Field label="Loại vật tư/phụ tùng *" error={errors.purchaseType}>
              <TouchableOpacity
                style={[S.input, S.selectRow, errors.purchaseType && S.inputErr]}
                onPress={() => setShowTypePicker(!showTypePicker)}
                activeOpacity={0.8}
              >
                <Text style={purchaseType && purchaseType !== 'Chọn loại vật tư...'
                  ? S.selectValue : S.selectPlaceholder}>
                  {purchaseType || 'Chọn loại vật tư...'}
                </Text>
                <Text style={S.selectArrow}>{showTypePicker ? '▴' : '▾'}</Text>
              </TouchableOpacity>
              {showTypePicker && (
                <View style={S.dropdown}>
                  {PURCHASE_TYPES.slice(1).map(t => (
                    <TouchableOpacity
                      key={t}
                      style={S.dropItem}
                      onPress={() => {
                        setPurchaseType(t);
                        setShowTypePicker(false);
                        setErrors(e => ({ ...e, purchaseType: '' }));
                      }}
                    >
                      <Text style={[S.dropItemText, t === purchaseType && S.dropItemActive]}>
                        {t}
                      </Text>
                      {t === purchaseType && <Text style={S.checkmark}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </Field>

            {/* Số lượng + Đơn giá — 2 cột */}
            <View style={S.row2}>
              <View style={{ flex: 1 }}>
                <Field label="Số lượng *" error={errors.quantity}>
                  <TextInput
                    style={[S.input, S.inputCenter, errors.quantity && S.inputErr]}
                    value={quantity}
                    onChangeText={setErr('quantity', v => setQuantity(v.replace(/[^0-9]/g, '')))}
                    keyboardType="numeric"
                    placeholderTextColor={Colors.gray400}
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Đơn giá dự kiến *" error={errors.unitPrice}>
                  <View style={[S.inputWithUnit, errors.unitPrice && S.inputErr]}>
                    <TextInput
                      style={[S.input, { flex: 1, borderWidth: 0, textAlign: 'right', paddingRight: 36 }]}
                      value={unitPrice}
                      onChangeText={setErr('unitPrice', v => setUnitPrice(v.replace(/[^0-9]/g, '')))}
                      keyboardType="numeric"
                      placeholderTextColor={Colors.gray400}
                    />
                    <Text style={S.unitText}>VNĐ</Text>
                  </View>
                </Field>
              </View>
            </View>

            {/* Thành tiền (auto) */}
            {totalAmount > 0 && (
              <View style={S.totalBox}>
                <Text style={S.totalLabel}>Thành tiền</Text>
                <Text style={S.totalValue}>{fmtMoney(totalAmount)}</Text>
              </View>
            )}
          </View>

          {/* ══ Card 2: Lý do & Ghi chú ══ */}
          <View style={S.card}>
            <View style={S.cardHeader}>
              <Text style={S.cardHeaderIcon}>☰</Text>
              <Text style={S.cardTitle}>LÝ DO &amp; GHI CHÚ</Text>
            </View>

            <Field label="Nội dung chi tiết *" error={errors.detail}>
              <TextInput
                style={[S.textarea, errors.detail && S.inputErr]}
                value={detail}
                onChangeText={setErr('detail', setDetail)}
                placeholder="Vd: Thay lốp sau xe 29H-123.45 tại trạm dừng..."
                placeholderTextColor={Colors.gray400}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </Field>
          </View>

          {/* ══ Card 3: Ảnh minh chứng ══ */}
          <View style={S.card}>
            <View style={S.cardHeader}>
              <Text style={S.cardHeaderIcon}>🖼️</Text>
              <Text style={S.cardTitle}>ẢNH MINH CHỨNG (NẾU CÓ)</Text>
            </View>

            {images.length === 0 ? (
              /* Upload box */
              <TouchableOpacity style={S.uploadBox} onPress={handlePickImage} activeOpacity={0.8}>
                <View style={S.uploadIconWrap}>
                  <Text style={{ fontSize: 28 }}>📷</Text>
                </View>
                <Text style={S.uploadLabel}>Chạm để chụp hoặc tải ảnh lên</Text>
                <Text style={S.uploadSub}>Hỗ trợ JPG, PNG (Max 5MB)</Text>
              </TouchableOpacity>
            ) : (
              /* Preview grid + add more */
              <View>
                <View style={S.previewGrid}>
                  {images.map((img, i) => (
                    <View key={i} style={S.previewItem}>
                      <Image source={{ uri: img.uri }} style={S.previewImg} resizeMode="cover" />
                      <TouchableOpacity style={S.removeBtn} onPress={() => removeImage(i)}>
                        <Text style={S.removeBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={S.addMoreBtn} onPress={handlePickImage}>
                    <Text style={S.addMoreIcon}>＋</Text>
                    <Text style={S.addMoreText}>Thêm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Fixed Footer ── */}
      <View style={S.footer}>
        <TouchableOpacity style={S.cancelBtn} onPress={() => navigation.goBack()} disabled={loading}>
          <Text style={S.cancelText}>Hủy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.submitBtn, loading && S.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.88}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <><Text style={{ fontSize: 16 }}>🚀</Text><Text style={S.submitText}> Gửi yêu cầu</Text></>
          )}
        </TouchableOpacity>
      </View>
      <WatermarkView />
    </SafeAreaView>  );
}

/* ── Shared Field wrapper ── */
function Field({
  label, error, children,
}: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={S.fieldGroup}>
      <Text style={S.label}>{label}</Text>
      {children}
      {error ? <Text style={S.errorText}>{error}</Text> : null}
    </View>
  );
}

/* ─────────────────────── Styles ─────────────────────── */
const BRAND      = '#163797';
const BRAND_DARK = '#001b63';

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f4f6' },

  /* Header */
  header: {
    backgroundColor: BRAND,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  backBtn:    { width: 36, height: 36, justifyContent: 'center' },
  backIcon:   { fontSize: 22, color: Colors.white },
  headerTitle:{ fontSize: 17, fontWeight: '700', color: Colors.white, flex: 1, textAlign: 'center' },

  /* Scroll */
  content: { padding: 16, gap: 14, paddingBottom: 32 },

  /* Card */
  card: {
    backgroundColor: Colors.white, borderRadius: 8, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
  },
  cardIconCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center',
  },
  cardIconText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  cardHeaderIcon: { fontSize: 18 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: Colors.gray800, letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: Colors.gray100, marginBottom: 14 },

  /* Fields */
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '500', color: Colors.gray500, marginBottom: 5 },
  input: {
    borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontSize: 14, color: Colors.gray900, backgroundColor: Colors.white,
  },
  inputCenter: { textAlign: 'center' },
  inputErr:    { borderColor: Colors.error },
  errorText:   { fontSize: 11, color: Colors.error, marginTop: 3 },
  textarea: {
    borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8,
    padding: 12, fontSize: 14, color: Colors.gray900,
    minHeight: 96, textAlignVertical: 'top',
  },

  /* Select */
  selectRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  selectValue:       { fontSize: 14, color: Colors.gray900, flex: 1 },
  selectPlaceholder: { fontSize: 14, color: Colors.gray400, flex: 1 },
  selectArrow:       { fontSize: 13, color: Colors.gray400 },
  dropdown: {
    marginTop: 4, backgroundColor: Colors.white, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.gray200, overflow: 'hidden',
    elevation: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8,
    zIndex: 100,
  },
  dropItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  dropItemText:   { fontSize: 14, color: Colors.gray800 },
  dropItemActive: { color: BRAND, fontWeight: '700' },
  checkmark:      { color: BRAND, fontSize: 14, fontWeight: '700' },

  /* 2-col row */
  row2: { flexDirection: 'row', gap: 12 },

  /* Input with unit label */
  inputWithUnit: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8,
    backgroundColor: Colors.white, overflow: 'hidden',
  },
  unitText: {
    fontSize: 11, fontWeight: '600', color: Colors.gray400,
    paddingRight: 10, position: 'absolute', right: 0,
  },

  /* Total box */
  totalBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: BRAND + '0d', borderRadius: 8, padding: 12, marginTop: 4,
  },
  totalLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  totalValue: { fontSize: 17, fontWeight: '800', color: BRAND },

  /* Upload */
  uploadBox: {
    borderWidth: 2, borderColor: '#e0e7ff', borderStyle: 'dashed',
    borderRadius: 8, backgroundColor: '#f5f7ff',
    paddingVertical: 28, alignItems: 'center', gap: 8,
  },
  uploadIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  uploadLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  uploadSub:   { fontSize: 11, color: Colors.gray400 },

  /* Image preview */
  previewGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  previewItem:  { position: 'relative' },
  previewImg:   {
    width: 80, height: 80, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.gray200,
  },
  removeBtn: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center',
  },
  removeBtnText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  addMoreBtn: {
    width: 80, height: 80, borderRadius: 8,
    borderWidth: 2, borderColor: Colors.gray300, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', gap: 2,
  },
  addMoreIcon: { fontSize: 22, color: Colors.gray400 },
  addMoreText: { fontSize: 10, color: Colors.gray400, fontWeight: '600' },

  /* Footer */
  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    paddingTop: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.gray100,
  },
  cancelBtn:  { flex: 1, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.gray300, justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.gray700 },
  submitBtn: {
    flex: 2, backgroundColor: Colors.primary, borderRadius: 12, height: 52,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  submitBtnDisabled: { opacity: 0.55 },
  submitText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
