import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import DatePickerField from '@/components/DatePickerField';
import TimePickerField from '@/components/TimePickerField';

const CHANGE_TYPES = [
  { value: 'start', label: 'Đổi giờ bắt đầu' },
  { value: 'end',   label: 'Đổi giờ kết thúc' },
  { value: 'shift', label: 'Đổi ca làm việc' },
];

export default function AttendanceAdjustScreen() {
  const navigation = useNavigation();

  const [changeType, setChangeType]     = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [date, setDate]                 = useState<Date | null>(null);
  const [checkInTime, setCheckInTime]   = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [reason, setReason]             = useState('');
  const [loading, setLoading]           = useState(false);
  const [errors, setErrors]             = useState<Record<string, string>>({});

  /* ── Current trip context ── */
  const [currentTrip, setCurrentTrip]   = useState<any>(null);

  useEffect(() => {
    api.get('/trips', { params: { limit: 1 } })
      .then(res => {
        const trips = res.data.data?.trips ?? [];
        if (trips.length > 0) setCurrentTrip(trips[0]);
      })
      .catch(() => {});
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!changeType)          e.changeType   = 'Vui lòng chọn loại đổi giờ';
    if (!date)                e.date         = 'Vui lòng chọn ngày';
    if (!checkInTime)         e.checkInTime  = 'Vui lòng chọn giờ vào';
    if (!reason.trim())       e.reason       = 'Vui lòng nhập lý do';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const typeLabel = CHANGE_TYPES.find(t => t.value === changeType)?.label ?? changeType;
      await api.post('/requests', {
        type:  'attendance_adjustment',
        title: `Điều chỉnh giờ - ${typeLabel}`,
        payload: {
          change_type:    changeType,
          date:           date!.toISOString().slice(0, 10),
          check_in_time:  checkInTime,
          check_out_time: checkOutTime,
          reason,
        },
      });
      Alert.alert('✅ Đã gửi', 'Yêu cầu đổi giờ đã được gửi, chờ duyệt.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể gửi yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  const selectedTypeLabel = CHANGE_TYPES.find(t => t.value === changeType)?.label ?? '';

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* ── Header (light bg như UI reference) ── */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Đổi giờ</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Context card chuyến hiện tại ── */}
          {/* ── Form card ── */}
          <View style={S.card}>
            <Text style={S.cardTitle}>Chi tiết yêu cầu</Text>

            {/* Loại đổi giờ */}
            <View style={S.fieldGroup}>
              <Text style={S.label}>
                Loại đổi giờ <Text style={S.req}>*</Text>
              </Text>
              <TouchableOpacity
                style={[S.select, errors.changeType ? S.inputErr : null]}
                onPress={() => setShowTypePicker(!showTypePicker)}
                activeOpacity={0.8}
              >
                <Text style={[S.selectText, !changeType && S.placeholder]}>
                  {selectedTypeLabel || 'Chọn loại thay đổi...'}
                </Text>
                <Text style={S.arrow}>{showTypePicker ? '▴' : '▾'}</Text>
              </TouchableOpacity>
              {showTypePicker && (
                <View style={S.dropdown}>
                  {CHANGE_TYPES.map(t => (
                    <TouchableOpacity
                      key={t.value}
                      style={S.dropItem}
                      onPress={() => {
                        setChangeType(t.value);
                        setShowTypePicker(false);
                        setErrors(e => ({ ...e, changeType: '' }));
                      }}
                    >
                      <Text style={[S.dropText, t.value === changeType && S.dropActive]}>
                        {t.label}
                      </Text>
                      {t.value === changeType && <Text style={{ color: Colors.primary }}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {errors.changeType ? <Text style={S.errText}>{errors.changeType}</Text> : null}
            </View>

            {/* Ngày */}
            <DatePickerField
              label="Ngày"
              value={date}
              onChange={(d) => { setDate(d); setErrors((e: any) => ({ ...e, date: '' })); }}
              required
              error={errors.date}
            />

            {/* Giờ vào + Giờ ra — 2 cột */}
            <View style={S.timeRow}>
              <View style={{ flex: 1 }}>
                <TimePickerField
                  label="Giờ vào"
                  value={checkInTime}
                  onChange={v => { setCheckInTime(v); setErrors(e => ({ ...e, checkInTime: '' })); }}
                  required
                  error={errors.checkInTime}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <TimePickerField
                  label="Giờ ra"
                  value={checkOutTime}
                  onChange={setCheckOutTime}
                />
              </View>
            </View>

            {/* Lý do */}
            <View style={S.fieldGroup}>
              <Text style={S.label}>
                Lý do thay đổi <Text style={S.req}>*</Text>
              </Text>
              <TextInput
                style={[S.textarea, errors.reason ? S.inputErr : null]}
                value={reason}
                onChangeText={v => { setReason(v); setErrors(e => ({ ...e, reason: '' })); }}
                placeholder="VD: Kẹt xe, sự cố phương tiện, chờ bốc xếp lâu..."
                placeholderTextColor={Colors.gray400}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              {errors.reason ? <Text style={S.errText}>{errors.reason}</Text> : null}
              <Text style={S.hint}>Cung cấp chi tiết để điều phối viên duyệt nhanh hơn.</Text>
            </View>
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={S.footer}>
        <TouchableOpacity style={S.cancelBtn} onPress={() => navigation.goBack()} disabled={loading}>
          <Text style={S.cancelText}>Hủy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.submitBtn, loading && S.submitDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.88}
        >
          {loading
            ? <ActivityIndicator color={Colors.white} size="small" />
            : <><Text style={{ fontSize: 16 }}>🚀</Text><Text style={S.submitText}>Gửi yêu cầu</Text></>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const PRIMARY = '#163797';

const S = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#f7f8fa' },

  header: {
    backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, height: 56,
  },
  backBtn:     { width: 36, height: 36, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.white, textAlign: 'center' },

  content: { padding: 16, gap: 14, paddingBottom: 32 },

  tripCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.gray200,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  tripRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tripIcon:    { fontSize: 18 },
  tripTitle:   { fontSize: 14, fontWeight: '600', color: Colors.gray900, flex: 1 },
  runBadge:    { backgroundColor: PRIMARY + '15', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  runBadgeText:{ fontSize: 11, fontWeight: '700', color: PRIMARY },
  tripInfo:    { gap: 3 },
  tripRoute:   { fontSize: 13, color: Colors.gray600 },
  tripMaterial:{ fontSize: 12, color: Colors.gray400 },

  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.gray200,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: Colors.gray900, marginBottom: 16 },

  fieldGroup: { marginBottom: 14 },
  label:      { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 7 },
  req:        { color: Colors.error },
  hint:       { fontSize: 11, color: Colors.gray400, marginTop: 5 },
  errText:    { fontSize: 12, color: Colors.error, marginTop: 4 },

  select: {
    height: 50, borderWidth: 1.5, borderColor: Colors.gray300,
    borderRadius: 10, paddingHorizontal: 14, backgroundColor: Colors.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  selectText:  { fontSize: 15, color: Colors.gray900, flex: 1 },
  placeholder: { color: Colors.gray400 },
  arrow:       { fontSize: 13, color: Colors.gray500 },
  inputErr:    { borderColor: Colors.error },

  dropdown: {
    marginTop: 4, backgroundColor: Colors.white, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.gray200, overflow: 'hidden',
    elevation: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8,
  },
  dropItem:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  dropText:  { fontSize: 15, color: Colors.gray800 },
  dropActive:{ color: PRIMARY, fontWeight: '700' },

  timeRow: { flexDirection: 'row', alignItems: 'flex-start' },

  textarea: {
    borderWidth: 1.5, borderColor: Colors.gray300, borderRadius: 10,
    padding: 13, fontSize: 15, color: Colors.gray900,
    minHeight: 100, textAlignVertical: 'top', backgroundColor: Colors.white,
  },

  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    paddingTop: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.gray200,
  },
  cancelBtn:  { flex: 1, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.gray300, justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.gray700 },
  submitBtn: {
    flex: 2, backgroundColor: PRIMARY, borderRadius: 12, height: 52,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  submitDisabled: { opacity: 0.55 },
  submitText:     { fontSize: 15, fontWeight: '600', color: Colors.white },
});
