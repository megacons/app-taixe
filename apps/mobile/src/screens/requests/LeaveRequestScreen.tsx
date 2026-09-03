import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
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
import DatePickerField from '@/components/DatePickerField';
import TimePickerField from '@/components/TimePickerField';

const DURATIONS = [
  { key: '1/2 ngày',   label: '1/2 ngày' },
  { key: 'Trong ngày', label: 'Trong ngày' },
  { key: 'Nhiều ngày', label: 'Nhiều ngày' },
];

const LEAVE_TYPES = [
  'Nghỉ phép năm',
  'Nghỉ ốm',
  'Nghỉ việc riêng',
  'Nghỉ không lương',
  'Nghỉ thai sản',
];

export default function LeaveRequestScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();

  const [duration, setDuration]               = useState('Trong ngày');
  const [leaveType, setLeaveType]             = useState(LEAVE_TYPES[0]);
  const [showLeaveTypePicker, setShowLeaveTypePicker] = useState(false);
  const [startDate, setStartDate]             = useState<Date | null>(null);
  const [endDate, setEndDate]                 = useState<Date | null>(null);
  const [startTime, setStartTime]             = useState('');
  const [endTime, setEndTime]                 = useState('');
  const [reason, setReason]                   = useState('');
  const [content, setContent]                 = useState('');
  const [attachments, setAttachments]         = useState<{ uri: string; name: string }[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [errors, setErrors]                   = useState<Record<string, string>>({});

  // Leave balance không cần trong form này (đã có màn hình LeaveBalanceScreen)


  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const showEndDate  = duration === 'Nhiều ngày';
  // Show time pickers for "1/2 ngày"
  const showTimePick = duration === '1/2 ngày';

  /* ─── Validation ─── */
  const validate = () => {
    const e: Record<string, string> = {};
    if (!startDate)                          e.startDate  = 'Vui lòng nhập ngày bắt đầu';
    if (showEndDate && !endDate)             e.endDate    = 'Vui lòng nhập ngày kết thúc';
    if (showTimePick && !startTime.trim())   e.startTime  = 'Vui lòng nhập giờ bắt đầu';
    if (showTimePick && !endTime.trim())     e.endTime    = 'Vui lòng nhập giờ kết thúc';
    if (!reason.trim())                      e.reason     = 'Vui lòng nhập lý do';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ─── Pick attachments ─── */
  const pickAttachment = async () => {
    Alert.alert('Đính kèm', '', [
      {
        text: 'Chụp ảnh',
        onPress: async () => {
          const r = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!r.canceled) addAssets(r.assets);
        },
      },
      {
        text: 'Chọn từ thư viện',
        onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            allowsMultipleSelection: true,
            quality: 0.8,
          });
          if (!r.canceled) addAssets(r.assets);
        },
      },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const addAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    const newFiles = assets.map(a => ({
      uri: a.uri,
      name: a.fileName || `file_${Date.now()}.jpg`,
    }));
    setAttachments(prev => [...prev, ...newFiles]);
  };

  const removeAttachment = (idx: number) =>
    setAttachments(prev => prev.filter((_, i) => i !== idx));

  /* ─── Submit ─── */
  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post('/requests', {
        type: 'leave',
        title: `Xin nghỉ phép - ${duration}`,
        payload: {
          duration,
          leave_type:  leaveType,
          start_date:  startDate ? format(startDate, 'dd/MM/yyyy') : '',
          end_date:    endDate ? format(endDate, 'dd/MM/yyyy') : (startDate ? format(startDate, 'dd/MM/yyyy') : ''),
          start_time:  startTime,
          end_time:    endTime,
          reason,
          content,
        },
      });
      Alert.alert('✅ Đã gửi', 'Yêu cầu nghỉ phép đã được gửi, chờ duyệt.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể gửi yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  const setErr = (key: string) => (v: string) => {
    if (key === 'startTime') setStartTime(v);
    else if (key === 'endTime') setEndTime(v);
    else if (key === 'reason') setReason(v);
    setErrors(e => ({ ...e, [key]: '' }));
  };

  /* ─── UI ─── */
  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>

        <Text style={S.headerTitle}>Nghỉ phép</Text>
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
          {/* ── Section 1: Thời gian nghỉ ── */}
          <View style={S.section}>
            <Text style={S.sectionTitle}>Thời gian nghỉ</Text>
            <TouchableOpacity
              style={S.select}
              onPress={() => setShowDurationPicker(!showDurationPicker)}
              activeOpacity={0.8}
            >
              <Text style={S.selectText}>{duration}</Text>
              <Text style={S.selectArrow}>{showDurationPicker ? '▴' : '▾'}</Text>
            </TouchableOpacity>
            {showDurationPicker && (
              <View style={S.pickerDropdown}>
                {DURATIONS.map(d => (
                  <TouchableOpacity
                    key={d.key}
                    style={S.pickerItem}
                    onPress={() => { setDuration(d.key); setShowDurationPicker(false); }}
                  >
                    <Text style={[S.pickerItemText, d.key === duration && S.pickerItemActive]}>
                      {d.label}
                    </Text>
                    {d.key === duration && <Text style={S.checkMark}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* ── Section 2: Chi tiết phép ── */}
          <View style={S.section}>
            <Text style={S.sectionTitle}>Chi tiết phép</Text>

            {/* Ngày bắt đầu / kết thúc — hàng ngang */}
            <View style={S.rowHalf}>
              <DatePickerField
                label="Ngày bắt đầu"
                value={startDate}
                onChange={(d) => { setStartDate(d); setErrors(e => ({ ...e, startDate: '' })); }}
                required
                error={errors.startDate}
                compact
                placeholder="Chọn ngày"
              />
              {showEndDate && (
                <DatePickerField
                  label="Ngày kết thúc"
                  value={endDate}
                  onChange={(d) => { setEndDate(d); setErrors(e => ({ ...e, endDate: '' })); }}
                  required
                  error={errors.endDate}
                  compact
                  placeholder="Chọn ngày"
                />
              )}
            </View>

            {/* Giờ bắt đầu / kết thúc — chỉ khi chọn "1/2 ngày" */}
            {showTimePick && (
              <View style={S.rowHalf}>
                <TimePickerField
                  label="Từ giờ"
                  value={startTime}
                  onChange={v => { setStartTime(v); setErrors(e => ({ ...e, startTime: '' })); }}
                  required
                  error={errors.startTime}
                />
                <TimePickerField
                  label="Đến giờ"
                  value={endTime}
                  onChange={v => { setEndTime(v); setErrors(e => ({ ...e, endTime: '' })); }}
                  required
                  error={errors.endTime}
                />
              </View>
            )}

            {/* Loại phép — dropdown */}
            <View style={S.fieldGroup}>
              <Text style={S.label}>Loại phép</Text>
              <TouchableOpacity
                style={S.select}
                onPress={() => setShowLeaveTypePicker(!showLeaveTypePicker)}
                activeOpacity={0.8}
              >
                <Text style={S.selectText}>{leaveType}</Text>
                <Text style={S.selectArrow}>{showLeaveTypePicker ? '▴' : '▾'}</Text>
              </TouchableOpacity>
              {showLeaveTypePicker && (
                <View style={S.pickerDropdown}>
                  {LEAVE_TYPES.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={S.pickerItem}
                      onPress={() => {
                        setLeaveType(t);
                        setShowLeaveTypePicker(false);
                      }}
                    >
                      <Text style={[S.pickerItemText, t === leaveType && S.pickerItemActive]}>
                        {t}
                      </Text>
                      {t === leaveType && <Text style={S.checkMark}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Lý do */}
            <View style={S.fieldGroup}>
              <Text style={S.label}>
                Lý do <Text style={S.required}>*</Text>
              </Text>
              <TextInput
                style={[S.input, S.inputMulti, errors.reason && S.inputError]}
                value={reason}
                onChangeText={setErr('reason')}
                placeholder="Nhập lý do chi tiết..."
                placeholderTextColor={Colors.gray400}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              {errors.reason ? <Text style={S.errorText}>{errors.reason}</Text> : null}
            </View>
          </View>

          {/* ── Section 3: Đính kèm ── */}
          <View style={S.section}>
            <Text style={S.sectionTitle}>Đính kèm</Text>

            <TouchableOpacity style={S.attachBtn} onPress={pickAttachment} activeOpacity={0.8}>
              <Text style={S.attachIcon}>📎</Text>
              <Text style={S.attachBtnText}>Chọn file / Chụp ảnh</Text>
            </TouchableOpacity>

            {attachments.length > 0 && (
              <View style={S.previewGrid}>
                {attachments.map((file, idx) => (
                  <View key={idx} style={S.previewItem}>
                    <Image source={{ uri: file.uri }} style={S.previewImg} />
                    <TouchableOpacity
                      style={S.removeBtn}
                      onPress={() => removeAttachment(idx)}
                    >
                      <Text style={S.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                    <Text style={S.previewName} numberOfLines={1}>{file.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Fixed footer ── */}
      <View style={S.footer}>
        <TouchableOpacity
          style={S.cancelBtn}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={S.cancelBtnText}>Hủy</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.submitBtn, loading && S.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <>
              <Text style={S.submitIcon}>📤</Text>
              <Text style={S.submitText}>Gửi yêu cầu</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */
const LB = StyleSheet.create({
  card:      { backgroundColor: Colors.primary, borderRadius: 16, padding: 16, margin: 16, marginBottom: 8 },
  titleRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  icon:      { fontSize: 26 },
  title:     { fontSize: 14, fontWeight: '700', color: '#fff' },
  sub:       { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  statsRow:  { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 12 },
  stat:      { flex: 1, alignItems: 'center', gap: 4 },
  statNum:   { fontSize: 26, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  divider:   { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 },
});

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7fa' },

  /* Header */
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backIcon: { fontSize: 22, color: Colors.white },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.white, flex: 1, textAlign: 'center' },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
  },
  headerAvatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarInitial: { color: Colors.white, fontWeight: '700', fontSize: 15 },

  /* Scroll content */
  content: { padding: 16, gap: 14, paddingBottom: 32 },

  /* Section card */
  section: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ececec',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 16,
  },

  /* Duration chips — 2-column */
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    width: '47%',
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.gray300,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '09',
  },
  chipText: { fontSize: 13, fontWeight: '500', color: Colors.gray600 },
  chipTextActive: { color: Colors.primary, fontWeight: '700' },

  /* Form fields */
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 7 },
  required: { color: Colors.error },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.gray900,
    backgroundColor: Colors.white,
    minHeight: 46,
  },
  inputMulti: { minHeight: 90, paddingTop: 12 },
  inputError: { borderColor: Colors.error },
  errorText: { fontSize: 12, color: Colors.error, marginTop: 5 },

  /* Row of two date/time fields */
  rowHalf: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },

  /* Dropdown select */
  select: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    minHeight: 46,
  },
  selectText: { fontSize: 14, color: Colors.gray900 },
  selectArrow: { fontSize: 14, color: Colors.gray500 },

  pickerDropdown: {
    marginTop: 4,
    backgroundColor: Colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    zIndex: 100,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  pickerItemText: { fontSize: 14, color: Colors.gray800 },
  pickerItemActive: { color: Colors.primary, fontWeight: '700' },
  checkMark: { color: Colors.primary, fontSize: 14, fontWeight: '700' },

  /* Attachment */
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary + '60',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 16,
    backgroundColor: Colors.primary + '04',
  },
  attachIcon: { fontSize: 20 },
  attachBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },

  /* Preview grid */
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  previewItem: { width: 80, alignItems: 'center' },
  previewImg: {
    width: 72, height: 72, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.gray200,
    backgroundColor: Colors.gray100,
  },
  removeBtn: {
    position: 'absolute',
    top: -6, right: -6,
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  previewName: {
    fontSize: 10, color: Colors.gray500, marginTop: 4,
    textAlign: 'center', width: 72,
  },

  /* Footer */
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    backgroundColor: Colors.white,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.gray300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: Colors.gray700 },
  submitBtn: {
    flex: 2,
    height: 52,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.55 },
  submitIcon: { fontSize: 16 },
  submitText: { fontSize: 15, fontWeight: '600', color: Colors.white },
});
