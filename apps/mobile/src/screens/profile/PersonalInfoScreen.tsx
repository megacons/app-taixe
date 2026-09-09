import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert, Modal,
  Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import DatePickerField from '@/components/DatePickerField';

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

const fmtDate = (v?: string | Date | null) => {
  if (!v) return null;
  try {
    const d = typeof v === 'string' ? parseISO(v) : v;
    return format(d, 'dd/MM/yyyy', { locale: vi });
  } catch { return null; }
};

const toFull = (url?: string | null) => {
  if (!url) return null;
  return url.startsWith('http') ? url : `${BASE_URL}${url}`;
};

/* ── Row nhấn vào để sửa ── */
function EditRow({ icon, label, value, onPress }: {
  icon: string; label: string; value?: string | null; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={ER.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={ER.icon}>{icon}</Text>
      <View style={ER.content}>
        <Text style={ER.label}>{label}</Text>
        <Text style={[ER.value, !value && ER.empty]}>{value || 'Nhấn để nhập'}</Text>
      </View>
      <Text style={ER.arrow}>›</Text>
    </TouchableOpacity>
  );
}
const ER = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  icon:    { fontSize: 20, width: 28, marginRight: 14 },
  content: { flex: 1 },
  label:   { fontSize: 12, color: Colors.gray500, fontWeight: '500' },
  value:   { fontSize: 15, fontWeight: '600', color: Colors.gray900, marginTop: 2 },
  empty:   { color: Colors.gray400, fontWeight: '400' },
  arrow:   { fontSize: 20, color: Colors.gray300 },
});

/* ── Ô ảnh CCCD ── */
function CccdSlot({ label, imgUri, uploading, onPick, onView }: {
  label: string; imgUri: string | null;
  uploading: boolean; onPick: () => void; onView: () => void;
}) {
  return (
    <View style={CS.wrap}>
      <Text style={CS.label}>{label}</Text>
      {uploading ? (
        <View style={CS.empty}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={CS.hint}>Đang tải lên...</Text>
        </View>
      ) : imgUri ? (
        <>
          <TouchableOpacity onPress={onView} activeOpacity={0.85}>
            <Image source={{ uri: imgUri }} style={CS.img} resizeMode="cover" />
            <View style={CS.badge}>
              <Text style={CS.badgeText}>🔍 Xem to</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={CS.retake} onPress={onPick}>
            <Text style={CS.retakeText}>📷 Chụp lại</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={CS.empty} onPress={onPick} activeOpacity={0.8}>
          <Text style={{ fontSize: 40 }}>📷</Text>
          <Text style={CS.hint}>Nhấn để chụp</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const CS = StyleSheet.create({
  wrap:      { padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  label:     { fontSize: 13, fontWeight: '700', color: Colors.gray700, marginBottom: 8 },
  img:       { width: '100%', height: 180, borderRadius: 10 },
  badge:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.3)', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, paddingVertical: 5, alignItems: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty:     { borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.primary + '55', borderRadius: 10, paddingVertical: 28, alignItems: 'center', gap: 6, backgroundColor: Colors.primary + '05' },
  hint:      { fontSize: 14, fontWeight: '600', color: Colors.primary },
  retake:    { marginTop: 8, backgroundColor: Colors.gray100, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  retakeText:{ fontSize: 13, fontWeight: '600', color: Colors.gray700 },
});

/* ─────────────────────────────────────────── */
export default function PersonalInfoScreen() {
  const navigation = useNavigation<any>();
  const [driver,     setDriver]    = useState<any>(null);
  const [loading,    setLoading]   = useState(true);
  const [refreshing, setRefreshing]= useState(false);
  const [saving,     setSaving]    = useState(false);

  const [dob,         setDob]         = useState<Date>(new Date(1990, 0, 1));
  const [hasDob,      setHasDob]      = useState(false);
  const [address,     setAddress]     = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [phone,       setPhone]       = useState('');

  const [imgFront,  setImgFront]  = useState<string | null>(null);
  const [imgBack,   setImgBack]   = useState<string | null>(null);
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack,  setUploadingBack]  = useState(false);
  const [lightbox,  setLightbox]  = useState<string | null>(null);

  const [editField, setEditField] = useState<'dob' | 'address' | 'bank' | 'phone' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDate,  setEditDate]  = useState<Date>(new Date(1990, 0, 1));

  const load = async () => {
    try {
      const res = await api.get('/drivers/profile/me');
      const d = res.data.data;
      setDriver(d);
      if (d.date_of_birth) { setDob(new Date(d.date_of_birth)); setHasDob(true); }
      setAddress(d.address ?? '');
      setBankAccount(d.bank_account ?? '');
      setPhone(d.phone ?? '');
      if (d.id_card_image)      setImgFront(toFull(d.id_card_image));
      if (d.id_card_image_back) setImgBack(toFull(d.id_card_image_back));
    } catch (_) {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const saveField = async (updates: Record<string, any>) => {
    setSaving(true);
    try { await api.put('/drivers/profile/me', updates); }
    catch (e: any) { Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể lưu'); }
    finally { setSaving(false); }
  };

  const openEdit = (field: 'dob' | 'address' | 'bank' | 'phone') => {
    if (field === 'dob') setEditDate(hasDob ? dob : new Date(1990, 0, 1));
    else if (field === 'address') setEditValue(address);
    else if (field === 'bank')    setEditValue(bankAccount);
    else if (field === 'phone')   setEditValue(phone);
    setEditField(field);
  };

  const confirmEdit = async () => {
    if (editField === 'dob') {
      setDob(editDate); setHasDob(true);
      await saveField({ date_of_birth: editDate.toISOString() });
    } else if (editField === 'address') {
      setAddress(editValue.trim());
      await saveField({ address: editValue.trim() });
    } else if (editField === 'bank') {
      setBankAccount(editValue.trim());
      await saveField({ bank_account: editValue.trim() });
    } else if (editField === 'phone') {
      setPhone(editValue.trim());
      await saveField({ phone: editValue.trim() });
    }
    setEditField(null);
  };

  const pickImage = (side: 'front' | 'back') => {
    Alert.alert(`CCCD — ${side === 'front' ? 'Mặt trước' : 'Mặt sau'}`, '', [
      {
        text: 'Chụp ảnh',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Cần quyền camera'); return; }
          const r = await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: false });
          if (!r.canceled && r.assets?.[0]?.uri) uploadImage(r.assets[0].uri, side);
        },
      },
      {
        text: 'Chọn từ thư viện',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') return;
          const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: false });
          if (!r.canceled && r.assets?.[0]?.uri) uploadImage(r.assets[0].uri, side);
        },
      },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const uploadImage = async (uri: string, side: 'front' | 'back') => {
    if (side === 'front') setUploadingFront(true);
    else setUploadingBack(true);
    try {
      const fd = new FormData();
      fd.append('file', { uri, type: 'image/jpeg', name: `cccd_${side}_${Date.now()}.jpg` } as any);
      const res = await api.post('/uploads', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      const rawUrl: string = res.data.data?.url ?? '';
      if (!rawUrl) { Alert.alert('Lỗi', 'Server không trả về URL ảnh'); return; }

      const full = `${toFull(rawUrl)}?t=${Date.now()}`;
      if (side === 'front') {
        setImgFront(full);
        await saveField({ id_card_image: rawUrl });
      } else {
        setImgBack(full);
        await saveField({ id_card_image_back: rawUrl });
      }
      Alert.alert('✅', `Đã cập nhật ảnh CCCD ${side === 'front' ? 'mặt trước' : 'mặt sau'}!`);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể upload ảnh');
    } finally {
      if (side === 'front') setUploadingFront(false);
      else setUploadingBack(false);
    }
  };

  const staticRows = driver ? [
    { icon: '👤', label: 'Họ và tên',    value: driver.full_name },
    { icon: '🪪', label: 'Số CCCD',      value: driver.id_number || driver.id_card },
    { icon: '🚛', label: 'Biển số xe',   value: driver.vehicle_id?.license_plate },
    { icon: '💼', label: 'Mã nhân viên', value: driver.employee_id },
    { icon: '📆', label: 'Ngày vào làm', value: fmtDate(driver.hire_date || driver.join_date) },
  ] : [];

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.title}>Thông tin cá nhân</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          contentContainerStyle={S.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {/* Gộp chung cố định + có thể sửa */}
          <View style={S.card}>
            {staticRows.map((row, i) => (
              <View key={row.label} style={[S.staticRow, S.rowBorder]}>
                <Text style={S.rowIcon}>{row.icon}</Text>
                <View style={S.rowContent}>
                  <Text style={S.rowLabel}>{row.label}</Text>
                  <Text style={S.rowValue}>{row.value || '—'}</Text>
                </View>
              </View>
            ))}
            <EditRow icon="📱" label="Số điện thoại"
              value={phone || null} onPress={() => openEdit('phone')} />
            <EditRow icon="🎂" label="Ngày sinh"
              value={hasDob ? fmtDate(dob) : null} onPress={() => openEdit('dob')} />
            <EditRow icon="🏠" label="Địa chỉ thường trú"
              value={address || null} onPress={() => openEdit('address')} />
            <EditRow icon="🏦" label="Số tài khoản ngân hàng"
              value={bankAccount || null} onPress={() => openEdit('bank')} />
          </View>

          {/* Ảnh CCCD */}
          <Text style={S.sectionTitle}>ẢNH CCCD / CMT</Text>
          <View style={[S.card, { overflow: 'visible' }]}>
            <CccdSlot
              label="📸 Mặt trước"
              imgUri={imgFront}
              uploading={uploadingFront}
              onPick={() => pickImage('front')}
              onView={() => imgFront && setLightbox(imgFront)}
            />
            <CccdSlot
              label="📸 Mặt sau"
              imgUri={imgBack}
              uploading={uploadingBack}
              onPick={() => pickImage('back')}
              onView={() => imgBack && setLightbox(imgBack)}
            />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Edit modal */}
      <Modal visible={editField !== null} transparent animationType="fade">
        <View style={M.overlay}>
          <TouchableOpacity style={M.backdrop} onPress={() => setEditField(null)} activeOpacity={1} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <View style={M.sheet}>
              <View style={M.mHeader}>
                <TouchableOpacity onPress={() => setEditField(null)}>
                  <Text style={M.cancel}>Hủy</Text>
                </TouchableOpacity>
                <Text style={M.mTitle}>
                  {editField === 'dob' ? 'Ngày sinh'
                    : editField === 'address' ? 'Địa chỉ'
                    : editField === 'phone'   ? 'Số điện thoại'
                    : 'Số tài khoản'}
                </Text>
                <TouchableOpacity onPress={confirmEdit} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color={Colors.primary} />
                          : <Text style={M.done}>Xong</Text>}
                </TouchableOpacity>
              </View>
              <View style={M.body}>
                {editField === 'dob' ? (
                  <DatePickerField label="" value={editDate} onChange={setEditDate} />
                ) : (
                  <TextInput
                    style={M.input}
                    value={editValue}
                    onChangeText={setEditValue}
                    placeholder={
                      editField === 'address' ? 'Nhập địa chỉ thường trú...'
                        : editField === 'phone' ? 'Nhập số điện thoại...'
                        : 'Nhập số tài khoản...'
                    }
                    placeholderTextColor={Colors.gray400}
                    autoFocus
                    multiline={editField === 'address'}
                    keyboardType={editField === 'bank' || editField === 'phone' ? 'phone-pad' : 'default'}
                  />
                )}
                <TouchableOpacity style={M.saveBtn} onPress={confirmEdit} disabled={saving}>
                  <Text style={M.saveBtnText}>✓ Lưu</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Lightbox */}
      {lightbox && (
        <Modal visible transparent animationType="fade">
          <View style={S.lightbox}>
            <TouchableOpacity style={S.lbClose} onPress={() => setLightbox(null)}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, justifyContent: 'center' }} onPress={() => setLightbox(null)} activeOpacity={1}>
              <Image source={{ uri: lightbox }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  header:      { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14 },
  backBtn:     { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  backIcon:    { fontSize: 22, color: '#fff', fontWeight: '700' },
  title:       { fontSize: 17, fontWeight: '700', color: '#fff' },
  content:     { padding: 16 },
  sectionTitle:{ fontSize: 11, fontWeight: '700', color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 16 },
  card:        { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  staticRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  rowBorder:   { borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  rowIcon:     { fontSize: 20, width: 28 },
  rowContent:  { flex: 1 },
  rowLabel:    { fontSize: 12, color: Colors.gray500, fontWeight: '500' },
  rowValue:    { fontSize: 15, fontWeight: '600', color: Colors.gray900, marginTop: 2 },
  lightbox:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  lbClose:     { position: 'absolute', top: 48, right: 20, zIndex: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
});

const M = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.01)' },
  sheet:    { backgroundColor: Colors.white, borderRadius: 20, width: '100%', paddingBottom: 16, overflow: 'hidden' },
  mHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray200 },
  mTitle:   { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  cancel:   { fontSize: 15, color: Colors.gray500 },
  done:     { fontSize: 15, fontWeight: '700', color: Colors.primary },
  body:     { padding: 20 },
  input:    { borderWidth: 1.5, borderColor: Colors.gray200, borderRadius: 12, padding: 14, fontSize: 16, color: Colors.gray900, minHeight: 50 },
  saveBtn:  { marginTop: 16, backgroundColor: Colors.primary, borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
