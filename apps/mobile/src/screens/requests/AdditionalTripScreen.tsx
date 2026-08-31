import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format } from 'date-fns';
import DatePickerField from '@/components/DatePickerField';

export default function AdditionalTripScreen() {
  const navigation = useNavigation();
  const [form, setForm] = useState({
    date: format(new Date(), 'dd/MM/yyyy'),
    material_name: '',
    pickup_location: '',
    drop_location: '',
    trip_count: '1',
    income: '0',
    expense: '0',
    note: '',
    gps_latitude: null as number | null,
    gps_longitude: null as number | null,
  });
  const [materials, setMaterials] = useState<any[]>([]);
  const [showMat, setShowMat] = useState(false);
  const [weighTickets, setWeighTickets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchMaterials();
    getLocation();
  }, []);

  const fetchMaterials = async () => {
    try {
      const res = await api.get('/materials', { params: { status: 'active', limit: 50 } });
      setMaterials(res.data.data?.materials || []);
    } catch (_) {}
  };

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    setForm(f => ({ ...f, gps_latitude: loc.coords.latitude, gps_longitude: loc.coords.longitude }));
  };

  const pickWeighTicket = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.8 });
    if (!result.canceled) setWeighTickets(p => [...p, ...result.assets.map(a => a.uri)]);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.material_name.trim()) e.material_name = 'Vui lòng nhập tên vật liệu';
    if (!form.pickup_location.trim()) e.pickup_location = 'Vui lòng nhập nơi lấy';
    if (!form.drop_location.trim()) e.drop_location = 'Vui lòng nhập nơi đổ';
    if (!form.trip_count || Number(form.trip_count) <= 0) e.trip_count = 'Số chuyến phải lớn hơn 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const f = (k: string) => (v: string) => { setForm(x => ({ ...x, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post('/requests', {
        type: 'additional_trip',
        title: `Thêm số chuyến - ${form.date}`,
        payload: { ...form, trip_count: Number(form.trip_count), income: Number(form.income), expense: Number(form.expense) },
      });
      Alert.alert('✅ Đã gửi', 'Yêu cầu thêm số chuyến đã được gửi, chờ duyệt.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể gửi yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={S.back}>←</Text></TouchableOpacity>
        <Text style={S.title}>Thêm số chuyến</Text>
        <View style={{ width: 36 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={S.content} keyboardShouldPersistTaps="handled">
          <F label="Ngày *" value={form.date} onChangeText={f('date')} />

          <View style={S.fieldGroup}>
            <Text style={S.label}>Tên vật liệu <Text style={{ color: Colors.error }}>*</Text></Text>
            <TouchableOpacity style={S.select} onPress={() => setShowMat(!showMat)}>
              <Text style={form.material_name ? S.selectText : S.placeholder}>{form.material_name || 'Chọn vật liệu...'}</Text>
              <Text style={S.arrow}>▾</Text>
            </TouchableOpacity>
            {showMat && materials.length > 0 && (
              <View style={S.dropdown}>
                {materials.map(m => (
                  <TouchableOpacity key={m._id} style={S.dropItem} onPress={() => { f('material_name')(m.material_name); setShowMat(false); }}>
                    <Text style={S.dropText}>{m.material_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput style={[S.input, { marginTop: 6 }, errors.material_name && S.inputErr]} value={form.material_name} onChangeText={f('material_name')} placeholder="Hoặc nhập thủ công..." placeholderTextColor={Colors.gray400} />
            {errors.material_name && <Text style={S.err}>{errors.material_name}</Text>}
          </View>

          <F label="Nơi lấy *" value={form.pickup_location} onChangeText={f('pickup_location')} placeholder="Nhập địa điểm lấy hàng" error={errors.pickup_location} />
          <F label="Nơi đổ *" value={form.drop_location} onChangeText={f('drop_location')} placeholder="Nhập địa điểm đổ hàng" error={errors.drop_location} />

          <View style={S.row3}>
            <View style={{ flex: 1 }}>
              <F label="Số chuyến *" value={form.trip_count} onChangeText={f('trip_count')} keyboardType="numeric" error={errors.trip_count} />
            </View>
            <View style={{ flex: 1 }}>
              <F label="Thu (đ)" value={form.income} onChangeText={f('income')} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <F label="Chi (đ)" value={form.expense} onChangeText={f('expense')} keyboardType="numeric" />
            </View>
          </View>

          {form.gps_latitude && (
            <View style={S.gpsBox}>
              <Text style={S.gpsText}>📡 GPS: {form.gps_latitude.toFixed(5)}, {form.gps_longitude?.toFixed(5)}</Text>
              <TouchableOpacity onPress={getLocation}><Text style={S.gpsRefresh}>🔄</Text></TouchableOpacity>
            </View>
          )}

          <F label="Ghi chú" value={form.note} onChangeText={f('note')} placeholder="Ghi chú thêm..." multiline />

          <View style={S.fieldGroup}>
            <Text style={S.label}>Phiếu cân</Text>
            <TouchableOpacity style={S.attachBtn} onPress={pickWeighTicket}>
              <Text style={S.attachIcon}>📎</Text>
              <Text style={S.attachLabel}>Tải lên phiếu cân</Text>
            </TouchableOpacity>
            {weighTickets.length > 0 && <Text style={S.attachCount}>✅ {weighTickets.length} phiếu đã chọn</Text>}
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={S.footer}>
        <TouchableOpacity style={S.cancelBtn} onPress={() => navigation.goBack()} disabled={loading}>
          <Text style={S.cancelText}>Hủy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.submitBtn} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color={Colors.white} size="small" /> : <><Text style={{ fontSize: 16 }}>🚀</Text><Text style={S.submitText}> Gửi yêu cầu</Text></>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function F({ label, value, onChangeText, placeholder, error, multiline, keyboardType }: any) {
  return (
    <View style={S.fieldGroup}>
      <Text style={S.label}>
        {label.replace(/\s*\*$/, '')}
        {(label.endsWith(' *') || label.endsWith('*')) && <Text style={{ color: Colors.error }}> *</Text>}
      </Text>
      <TextInput style={[S.input, multiline && S.textarea, error && S.inputErr]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={Colors.gray400} multiline={multiline} numberOfLines={multiline ? 3 : 1} keyboardType={keyboardType || 'default'} textAlignVertical={multiline ? 'top' : 'center'} />
      {error && <Text style={S.err}>{error}</Text>}
    </View>
  );
}

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7fa' },
  header: { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { fontSize: 22, color: Colors.white }, title: { fontSize: 17, fontWeight: '700', color: Colors.white, flex: 1, textAlign: 'center' },
  content: { padding: 16 },
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: Colors.gray900, backgroundColor: Colors.white },
  textarea: { minHeight: 80, paddingTop: 12 },
  inputErr: { borderColor: Colors.error },
  err: { fontSize: 12, color: Colors.error, marginTop: 4 },
  select: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Colors.white },
  selectText: { fontSize: 14, color: Colors.gray900 },
  placeholder: { fontSize: 14, color: Colors.gray400 },
  arrow: { fontSize: 14, color: Colors.gray500 },
  dropdown: { marginTop: 4, backgroundColor: Colors.white, borderRadius: 8, borderWidth: 1, borderColor: Colors.gray200, overflow: 'hidden', elevation: 4 },
  dropItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  dropText: { fontSize: 14, color: Colors.gray800 },
  row3: { flexDirection: 'row', gap: 8 },
  gpsBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Colors.infoLight, borderRadius: 8, padding: 10, marginBottom: 14 },
  gpsText: { fontSize: 12, color: Colors.info, flex: 1 },
  gpsRefresh: { fontSize: 18 },
  attachBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: Colors.gray300, borderStyle: 'dashed', borderRadius: 8, padding: 14 },
  attachIcon: { fontSize: 18 }, attachLabel: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  attachCount: { fontSize: 12, color: Colors.success, marginTop: 8, textAlign: 'center' },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white },
  cancelBtn: { flex: 1, height: 50, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.gray300, justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.gray700 },
  submitBtn: { flex: 2, height: 50, borderRadius: 8, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
