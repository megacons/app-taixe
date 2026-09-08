import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format } from 'date-fns';
import DatePickerField from '@/components/DatePickerField';

const TYPES = ['Tạm ứng lương', 'Tạm ứng du lịch'];

/** Format số có dấu chấm ngàn: "2000000" → "2.000.000" */
const fmtNumber = (raw: string): string => {
  const nums = raw.replace(/\./g, '').replace(/[^0-9]/g, '');
  if (!nums) return '';
  return new Intl.NumberFormat('vi-VN').format(Number(nums));
};

/** Lấy số thuần từ chuỗi đã format */
const parseNumber = (display: string): number =>
  Number(display.replace(/\./g, '').replace(/[^0-9]/g, '')) || 0;

export default function SalaryAdvanceScreen() {
  const navigation = useNavigation();
  const [form, setForm] = useState({
    date: null as Date | null,
    title: '',
    type: TYPES[0],
    amount: '',
    reason: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<any>({});
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [amountDisplay, setAmountDisplay] = useState('');

  const validate = () => {
    const e: any = {};
    if (!form.date)             e.date   = 'Vui lòng chọn ngày';
    if (!form.title.trim())     e.title  = 'Vui lòng nhập tiêu đề';
    if (!form.amount || Number(form.amount) <= 0) e.amount = 'Vui lòng nhập số tiền hợp lệ';
    if (!form.reason.trim())    e.reason = 'Vui lòng nhập lý do';
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post('/requests', {
        type: 'salary_advance',
        title: form.title,
        payload: { date: format(form.date!, 'dd/MM/yyyy'), type: form.type, amount: Number(form.amount), reason: form.reason },
      });
      Alert.alert('✅ Đã gửi', 'Yêu cầu tạm ứng đã được gửi, chờ duyệt.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể gửi yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  const f = (k: string) => (v: string) => { setForm(x => ({ ...x, [k]: v })); setErrors((e: any) => ({ ...e, [k]: '' })); };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>←</Text></TouchableOpacity>
        <Text style={styles.title}>Tạm ứng lương</Text>
        <View style={{ width: 36 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <DatePickerField
            label="Ngày"
            value={form.date}
            onChange={(d) => { setForm(x => ({ ...x, date: d })); setErrors((e: any) => ({ ...e, date: '' })); }}
            required
            error={errors.date}
          />

          <Field label="Tiêu đề *" value={form.title} onChangeText={f('title')} placeholder="Nhập tiêu đề yêu cầu" error={errors.title} />

          {/* Số tiền — format có dấu chấm ngàn */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Số tiền tạm ứng (VNĐ) <Text style={{ color: Colors.error }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.amount && { borderColor: Colors.error }]}
              value={amountDisplay}
              onChangeText={v => {
                const formatted = fmtNumber(v);
                setAmountDisplay(formatted);
                setForm(x => ({ ...x, amount: String(parseNumber(formatted)) }));
                setErrors((e: any) => ({ ...e, amount: '' }));
              }}
              placeholder="VD: 2.000.000"
              placeholderTextColor={Colors.gray400}
              keyboardType="numeric"
              textAlignVertical="center"
            />
            {errors.amount && <Text style={styles.error}>{errors.amount}</Text>}
          </View>

          <Field label="Lý do *" value={form.reason} onChangeText={f('reason')} placeholder="Nhập lý do tạm ứng" multiline error={errors.reason} />
          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()} disabled={loading}>
          <Text style={styles.cancelText}>Hủy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color={Colors.white} size="small" /> : <><Text style={{ fontSize: 16 }}>🚀</Text><Text style={styles.submitText}> Gửi yêu cầu</Text></>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, error, multiline, keyboardType }: any) {
  // Tách dấu * ra khỏi label để tô đỏ
  const hasRequired = label.endsWith(' *') || label.endsWith('*');
  const cleanLabel  = label.replace(/\s*\*$/, '');
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>
        {cleanLabel}{hasRequired && <Text style={{ color: Colors.error }}> *</Text>}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.textarea]}
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={Colors.gray400} multiline={multiline}
        numberOfLines={multiline ? 4 : 1} keyboardType={keyboardType || 'default'}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56, backgroundColor: Colors.primary },
  back: { fontSize: 22, color: Colors.white },
  title: { fontSize: 17, fontWeight: '700', color: Colors.white, flex: 1, textAlign: 'center' },
  content: { padding: 16 },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  input: { backgroundColor: '#f4f2fb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.gray900, borderWidth: 2, borderColor: 'transparent' },
  textarea: { minHeight: 100, paddingTop: 12 },
  error: { fontSize: 12, color: Colors.error, marginTop: 4 },
  select: { backgroundColor: '#f4f2fb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectText: { fontSize: 15, color: Colors.gray900 },
  arrow: { color: Colors.gray500 },
  picker: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray200, overflow: 'hidden', marginTop: 4, elevation: 4 },
  pickerItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  pickerText: { fontSize: 15, color: Colors.gray900 },
  bottomBar: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white },
  cancelBtn: { flex: 1, height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.gray300, justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.gray700 },
  submitBtn: { flex: 2, height: 50, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
