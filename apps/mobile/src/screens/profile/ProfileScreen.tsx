import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Alert, ActivityIndicator, RefreshControl,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import DatePickerField from '@/components/DatePickerField';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';
const NAVY  = '#163797';
const ORANGE = '#fbbd23';

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

/* ── Row nhấn để sửa ── */
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
        <View style={CS.empty}><ActivityIndicator color={Colors.primary} size="large" /><Text style={CS.hint}>Đang tải lên...</Text></View>
      ) : imgUri ? (
        <>
          <TouchableOpacity onPress={onView} activeOpacity={0.85}>
            <Image source={{ uri: imgUri }} style={CS.img} resizeMode="cover" />
            <View style={CS.badge}><Text style={CS.badgeText}>🔍 Xem to</Text></View>
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

/* ════════════════════════════════════════════ */
export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { user, logout, setUser } = useAuthStore();

  const [driver,          setDriver]          = useState<any>(null);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Editable fields
  const [dob,         setDob]         = useState<Date>(new Date(1990, 0, 1));
  const [hasDob,      setHasDob]      = useState(false);
  const [address,     setAddress]     = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankName,    setBankName]    = useState('');
  const [email,       setEmail]       = useState('');
  const [phone,       setPhone]       = useState('');

  // CCCD images
  const [imgFront,       setImgFront]       = useState<string | null>(null);
  const [imgBack,        setImgBack]        = useState<string | null>(null);
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack,  setUploadingBack]  = useState(false);
  const [lightbox,       setLightbox]       = useState<string | null>(null);

  // Edit modal
  const [editField, setEditField] = useState<'dob' | 'address' | 'bank' | 'phone' | 'email' | null>(null);
  const [editValue, setEditValue]  = useState('');
  const [editValue2, setEditValue2] = useState(''); // bankName khi edit 'bank'
  const [editDate,  setEditDate]  = useState<Date>(new Date(1990, 0, 1));

  const load = async () => {
    try {
      const res = await api.get('/drivers/profile/me');
      const d = res.data.data;
      setDriver(d);
      if (d.date_of_birth) { setDob(new Date(d.date_of_birth)); setHasDob(true); }
      setAddress(d.address ?? '');
      setBankAccount(d.bank_account ?? '');
      setBankName(d.bank_name ?? '');
      // Email từ driver profile (merged từ User model qua API)
      setEmail(d.email ?? (user as any)?.email ?? '');
      setPhone(d.phone ?? '');
      if (d.id_card_image)      setImgFront(toFull(d.id_card_image));
      if (d.id_card_image_back) setImgBack(toFull(d.id_card_image_back));
    } catch (_) {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  /* ── Avatar ── */
  const handlePickAvatar = () => {
    Alert.alert('Ảnh đại diện', '', [
      { text: 'Chụp ảnh', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return;
        const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1,1], quality: 0.85 });
        if (!r.canceled) uploadAvatar(r.assets[0].uri);
      }},
      { text: 'Chọn từ thư viện', onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        const r = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1,1], quality: 0.85 });
        if (!r.canceled) uploadAvatar(r.assets[0].uri);
      }},
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const uploadAvatar = async (uri: string) => {
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', { uri, type: 'image/jpeg', name: 'avatar.jpg' } as any);
      const res = await api.post('/drivers/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30000 });
      const rawUrl = res.data.data?.avatar ?? res.data.data?.url;
      if (rawUrl) {
        const full = (rawUrl.startsWith('http') ? rawUrl : `${BASE_URL}${rawUrl}`) + `?t=${Date.now()}`;
        setUser({ ...user!, avatar: full });
        Alert.alert('✅', 'Cập nhật ảnh thành công!');
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể cập nhật ảnh.');
    } finally { setAvatarUploading(false); }
  };

  /* ── Save field ── */
  const saveField = async (updates: Record<string, any>) => {
    setSaving(true);
    try { await api.put('/drivers/profile/me', updates); }
    catch (e: any) { Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể lưu'); }
    finally { setSaving(false); }
  };

  const openEdit = (field: typeof editField) => {
    if (field === 'dob') setEditDate(hasDob ? dob : new Date(1990, 0, 1));
    else if (field === 'address') setEditValue(address);
    else if (field === 'bank')     { setEditValue(bankAccount); setEditValue2(bankName); }
    else if (field === 'email')    setEditValue(email);
    else if (field === 'phone')   setEditValue(phone);
    setEditField(field);
  };

  const confirmEdit = async () => {
    if (editField === 'dob')     { setDob(editDate); setHasDob(true); await saveField({ date_of_birth: editDate.toISOString() }); }
    else if (editField === 'address') { setAddress(editValue.trim()); await saveField({ address: editValue.trim() }); }
    else if (editField === 'bank')     { setBankAccount(editValue.trim()); setBankName(editValue2.trim()); await saveField({ bank_account: editValue.trim(), bank_name: editValue2.trim() }); }
    else if (editField === 'email')    {
      const v = editValue.trim().toLowerCase();
      setEmail(v);
      await api.put('/auth/update-email', { email: v });
      setUser({ ...user!, email: v } as any);
    }
    else if (editField === 'phone')   { setPhone(editValue.trim()); await saveField({ phone: editValue.trim() }); }
    setEditField(null);
  };

  /* ── CCCD upload ── */
  const pickImage = (side: 'front' | 'back') => {
    Alert.alert(`CCCD — ${side === 'front' ? 'Mặt trước' : 'Mặt sau'}`, '', [
      { text: 'Chụp ảnh', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Cần quyền camera'); return; }
        const r = await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: false });
        if (!r.canceled && r.assets?.[0]?.uri) uploadImage(r.assets[0].uri, side);
      }},
      { text: 'Chọn từ thư viện', onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: false });
        if (!r.canceled && r.assets?.[0]?.uri) uploadImage(r.assets[0].uri, side);
      }},
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const uploadImage = async (uri: string, side: 'front' | 'back') => {
    if (side === 'front') setUploadingFront(true); else setUploadingBack(true);
    try {
      const fd = new FormData();
      fd.append('file', { uri, type: 'image/jpeg', name: `cccd_${side}_${Date.now()}.jpg` } as any);
      const res = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
      const rawUrl: string = res.data.data?.url ?? '';
      if (!rawUrl) { Alert.alert('Lỗi', 'Server không trả về URL ảnh'); return; }
      const full = `${toFull(rawUrl)}?t=${Date.now()}`;
      if (side === 'front') { setImgFront(full); await saveField({ id_card_image: rawUrl }); }
      else                  { setImgBack(full);  await saveField({ id_card_image_back: rawUrl }); }
      Alert.alert('✅', `Đã cập nhật ảnh CCCD ${side === 'front' ? 'mặt trước' : 'mặt sau'}!`);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể upload ảnh');
    } finally {
      if (side === 'front') setUploadingFront(false); else setUploadingBack(false);
    }
  };

  /* ── Logout ── */
  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const staticRows = driver ? [
    { icon: '👤', label: 'Họ và tên',    value: driver.full_name },
    { icon: '🚛', label: 'Biển số xe',   value: driver.vehicle_id?.license_plate },
    { icon: '💼', label: 'Mã nhân viên', value: driver.employee_id },
    { icon: '📆', label: 'Ngày vào làm', value: fmtDate(driver.hire_date || driver.join_date) },
  ] : [];

  const licensePlate = driver?.vehicle_id?.license_plate ?? '—';
  const employeeId   = driver?.employee_id ?? '—';

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.headerBtn}>
          <Text style={S.headerBtnIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Hồ sơ</Text>
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
          {/* Avatar card */}
          <View style={S.profileCard}>
            <View style={S.profileCardAccent} />
            <TouchableOpacity style={S.avatarWrapper} onPress={handlePickAvatar} disabled={avatarUploading} activeOpacity={0.85}>
              {user?.avatar ? (
                <Image
                  key={user.avatar}
                  source={{ uri: user.avatar.startsWith('http') ? user.avatar : `${BASE_URL}${user.avatar}` }}
                  style={S.avatar}
                  onError={() => {}}
                />
              ) : (
                <View style={S.avatarFallback}>
                  <Text style={S.avatarInitial}>{user?.name?.charAt(0)?.toUpperCase() ?? 'U'}</Text>
                </View>
              )}
              <View style={S.cameraBadge}>
                {avatarUploading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 12 }}>📷</Text>}
              </View>
            </TouchableOpacity>
            <Text style={S.driverName}>{user?.name ?? 'Tài xế'}</Text>
            <View style={S.badgesRow}>
              <View style={S.badgeGray}><Text style={S.badgeGrayText}>{employeeId}</Text></View>
              <View style={S.badgeOrange}>
                <Text style={S.badgeOrangeIcon}>🚛</Text>
                <Text style={S.badgeOrangeText}>{licensePlate}</Text>
              </View>
            </View>
          </View>

          {/* Thông tin + Chức năng gộp 1 card */}
          <Text style={S.sectionTitle}>THÔNG TIN CÁ NHÂN</Text>
          <View style={S.card}>
            {staticRows.map((row) => (
              <View key={row.label} style={[S.staticRow, S.rowBorder]}>
                <Text style={S.rowIcon}>{row.icon}</Text>
                <View style={S.rowContent}>
                  <Text style={S.rowLabel}>{row.label}</Text>
                  <Text style={S.rowValue}>{row.value || '—'}</Text>
                </View>
              </View>
            ))}
            <EditRow icon="📱" label="Số điện thoại"   value={phone || null}       onPress={() => openEdit('phone')} />
            <EditRow icon="🎂" label="Ngày sinh"        value={hasDob ? fmtDate(dob) : null} onPress={() => openEdit('dob')} />
            <EditRow icon="🏠" label="Địa chỉ thường trú" value={address || null}  onPress={() => openEdit('address')} />
            <EditRow icon="🏦" label="Tài khoản ngân hàng"
              value={bankAccount ? `${bankAccount}${bankName ? ` · ${bankName}` : ''}` : null}
              onPress={() => openEdit('bank')} />
            <EditRow icon="✉️" label="Email"
              value={email || null}
              onPress={() => openEdit('email')} />

            <TouchableOpacity style={[S.menuItem, S.menuItemBorder]} onPress={() => navigation.navigate('LeaveBalance')} activeOpacity={0.75}>
              <Text style={ER.icon}>📅</Text>
              <View style={{ flex: 1 }}>
                <Text style={S.menuTitle}>Quản lý phép</Text>
                <Text style={S.menuSub}>Đăng ký nghỉ, lịch nghỉ...</Text>
              </View>
              <Text style={{ fontSize: 18, color: Colors.gray300 }}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[S.menuItem, S.menuItemBorder]} onPress={() => navigation.navigate('Payslip')} activeOpacity={0.75}>
              <Text style={ER.icon}>💰</Text>
              <View style={{ flex: 1 }}>
                <Text style={S.menuTitle}>Phiếu lương</Text>
                <Text style={S.menuSub}>Chi tiết thu nhập hàng tháng</Text>
              </View>
              <Text style={{ fontSize: 18, color: Colors.gray300 }}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[S.menuItem, S.menuItemBorder]} onPress={() => navigation.navigate('ChangePassword')} activeOpacity={0.75}>
              <Text style={ER.icon}>🔒</Text>
              <View style={{ flex: 1 }}>
                <Text style={S.menuTitle}>Đổi mật khẩu</Text>
              </View>
              <Text style={{ fontSize: 18, color: Colors.gray300 }}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={S.menuItem} onPress={handleLogout} activeOpacity={0.75}>
              <Text style={ER.icon}>🚪</Text>
              <View style={{ flex: 1 }}>
                <Text style={[S.menuTitle, { color: Colors.error }]}>Đăng xuất</Text>
              </View>
            </TouchableOpacity>
          </View>

          <Text style={S.version}>v1.0.0</Text>
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* Edit modal */}
      <Modal visible={editField !== null} transparent animationType="slide">
        <View style={M.overlay}>
          <TouchableOpacity style={M.backdrop} onPress={() => setEditField(null)} activeOpacity={1} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <View style={M.sheet}>
              <View style={M.mHeader}>
                <TouchableOpacity onPress={() => setEditField(null)}><Text style={M.cancel}>Hủy</Text></TouchableOpacity>
                <Text style={M.mTitle}>
                  {editField === 'dob'     ? 'Ngày sinh'
                    : editField === 'address'  ? 'Địa chỉ'
                    : editField === 'phone'    ? 'Số điện thoại'
                    : editField === 'email'    ? 'Email'
                    : 'Tài khoản ngân hàng'}
                </Text>
                <TouchableOpacity onPress={confirmEdit} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={M.done}>Xong</Text>}
                </TouchableOpacity>
              </View>
              <View style={M.body}>
                {editField === 'dob' ? (
                  <DatePickerField label="" value={editDate} onChange={setEditDate} />
                ) : editField === 'email' ? (
                  <>
                    <TextInput
                      style={M.input} value={editValue} onChangeText={setEditValue} autoFocus
                      placeholder="Nhập địa chỉ email..."
                      placeholderTextColor={Colors.gray400}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    <Text style={{ fontSize: 11, color: Colors.gray400, marginTop: 4 }}>
                      📧 Email dùng để nhận OTP khi quên mật khẩu
                    </Text>
                  </>
                ) : editField === 'bank' ? (
                  <>
                    <Text style={M.fieldLabel}>Số tài khoản</Text>
                    <TextInput
                      style={[M.input, { marginBottom: 12 }]}
                      value={editValue} onChangeText={setEditValue} autoFocus
                      placeholder="Nhập số tài khoản..."
                      placeholderTextColor={Colors.gray400}
                      keyboardType="phone-pad"
                    />
                    <Text style={M.fieldLabel}>Ngân hàng</Text>
                    <TextInput
                      style={M.input}
                      value={editValue2} onChangeText={setEditValue2}
                      placeholder="Nhập tên ngân hàng..."
                      placeholderTextColor={Colors.gray400}
                    />
                    <Text style={M.suggestLabel}>Gợi ý:</Text>
                    <View style={M.suggestRow}>
                      {['Vietcombank','VietinBank','BIDV','Agribank','Techcombank','MB Bank','ACB','TPBank','VPBank','Sacombank','Khác'].map(b => (
                        <TouchableOpacity
                          key={b}
                          style={[M.suggestChip, editValue2 === b && M.suggestChipActive]}
                          onPress={() => setEditValue2(b)}
                        >
                          <Text style={[M.suggestChipText, editValue2 === b && M.suggestChipTextActive]}>{b}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : editField === 'bankName' ? (
                  <>
                    <TextInput
                      style={M.input} value={editValue} onChangeText={setEditValue} autoFocus
                      placeholder="Nhập tên ngân hàng..."
                      placeholderTextColor={Colors.gray400}
                    />
                    <Text style={M.suggestLabel}>Gợi ý:</Text>
                    <View style={M.suggestRow}>
                      {['Vietcombank','VietinBank','BIDV','Agribank','Techcombank','MB Bank','ACB','TPBank','VPBank','Sacombank','Khác'].map(b => (
                        <TouchableOpacity
                          key={b}
                          style={[M.suggestChip, editValue === b && M.suggestChipActive]}
                          onPress={() => setEditValue(b)}
                        >
                          <Text style={[M.suggestChipText, editValue === b && M.suggestChipTextActive]}>{b}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <TextInput
                    style={M.input} value={editValue} onChangeText={setEditValue} autoFocus
                    placeholder={editField === 'address' ? 'Nhập địa chỉ...' : editField === 'phone' ? 'Nhập số điện thoại...' : 'Nhập số tài khoản...'}
                    placeholderTextColor={Colors.gray400}
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

      {/* Lightbox CCCD */}
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
  safe:    { flex: 1, backgroundColor: '#faf8ff' },
  header:  { backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 14 },
  headerBtn:    { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerBtnIcon:{ fontSize: 22, color: '#fff' },
  headerTitle:  { fontSize: 19, fontWeight: '600', color: '#fff' },
  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 16 },

  profileCard:   { backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center', overflow: 'hidden', marginBottom: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  profileCardAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 70, backgroundColor: NAVY + '0d' },
  avatarWrapper: { position: 'relative', marginBottom: 12, zIndex: 1 },
  avatar:        { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#fff' },
  avatarFallback:{ width: 80, height: 80, borderRadius: 40, backgroundColor: NAVY, borderWidth: 3, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 30, fontWeight: '700', color: '#fff' },
  cameraBadge:   { position: 'absolute', bottom: 1, right: 1, width: 24, height: 24, borderRadius: 12, backgroundColor: NAVY, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  driverName:    { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  badgesRow:     { flexDirection: 'row', gap: 8 },
  badgeGray:     { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.gray100, borderRadius: 8 },
  badgeGrayText: { fontSize: 12, fontWeight: '500', color: Colors.gray600 },
  badgeOrange:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: ORANGE + '33', borderRadius: 8, borderWidth: 1, borderColor: ORANGE + '55' },
  badgeOrangeIcon:{ fontSize: 12 },
  badgeOrangeText:{ fontSize: 12, fontWeight: '700', color: '#b45309' },

  card:      { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  staticRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  rowIcon:   { fontSize: 20, width: 28 },
  rowContent:{ flex: 1 },
  rowLabel:  { fontSize: 12, color: Colors.gray500, fontWeight: '500' },
  rowValue:  { fontSize: 15, fontWeight: '600', color: Colors.gray900, marginTop: 2 },

  menuCard:  { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  menuItem:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  menuIconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#eef2ff', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  menuTitle: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  menuSub:   { fontSize: 12, color: Colors.gray500, marginTop: 1 },

  logoutBtn: { marginTop: 12, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#fee2e2' },
  logoutIcon:{ fontSize: 22 },
  logoutText:{ fontSize: 15, fontWeight: '600', color: Colors.error },

  version:   { textAlign: 'center', fontSize: 12, color: Colors.gray400, marginTop: 16 },
  lightbox:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  lbClose:   { position: 'absolute', top: 48, right: 20, zIndex: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
});

const M = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:    { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  mHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray200 },
  mTitle:   { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  cancel:   { fontSize: 15, color: Colors.gray500 },
  done:     { fontSize: 15, fontWeight: '700', color: Colors.primary },
  body:     { padding: 20 },
  input:    { borderWidth: 1.5, borderColor: Colors.gray200, borderRadius: 12, padding: 14, fontSize: 16, color: Colors.gray900, minHeight: 50 },
  saveBtn:  { marginTop: 16, backgroundColor: Colors.primary, borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  suggestLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray500, marginTop: 14, marginBottom: 8 },
  fieldLabel:   { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 6 },
  suggestRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestChip:  { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.gray200, backgroundColor: Colors.white },
  suggestChipActive:     { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' },
  suggestChipText:       { fontSize: 13, fontWeight: '500', color: Colors.gray700 },
  suggestChipTextActive: { color: Colors.primary, fontWeight: '700' },
});

