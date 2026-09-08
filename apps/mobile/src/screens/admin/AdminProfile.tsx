import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { useCompanyConfig } from '@/hooks/useCompanyConfig';
import api from '@/lib/api';
import { useState } from 'react';

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

const ROLE_LABEL: Record<string, string> = {
  manager: 'Quản lý', coordinator: 'Điều phối', accountant: 'Kế toán',
};

export default function AdminProfile() {
  const navigation = useNavigation<any>();
  const { user, logout, setUser } = useAuthStore();
  const { companyName } = useCompanyConfig();
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ]);
  };

  const handlePickAvatar = () => {
    Alert.alert('Ảnh đại diện', 'Chọn nguồn ảnh', [
      { text: 'Chụp ảnh', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Cần quyền camera'); return; }
        const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1,1], quality: 0.85 });
        if (!r.canceled) uploadAvatar(r.assets[0].uri);
      }},
      { text: 'Chọn từ thư viện', onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Cần quyền thư viện ảnh'); return; }
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
      const res = await api.post('/drivers/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      const rawUrl = res.data.data?.avatar ?? res.data.data?.url;
      if (rawUrl) {
        const full = (rawUrl.startsWith('http') ? rawUrl : `${BASE_URL}${rawUrl}`) + `?t=${Date.now()}`;
        setUser({ ...user!, avatar: full });
        Alert.alert('✅', 'Cập nhật ảnh thành công!');
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể cập nhật ảnh.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const MENU = [
    {
      title: 'Tài khoản',
      items: [
        { icon: '🔒', label: 'Đổi mật khẩu', onPress: () => navigation.navigate('ChangePassword') },
        { icon: '🔔', label: 'Thông báo',    onPress: () => navigation.navigate('Notifications') },
      ],
    },
    {
      title: 'Hệ thống',
      items: [
        { icon: '🌐', label: 'Web Admin', sub: 'localhost:3000', onPress: () => {} },
      ],
    },
  ];

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Cài đặt</Text>
      </View>

      <ScrollView contentContainerStyle={S.content}>
        {/* User card */}
        <View style={S.userCard}>
          <TouchableOpacity onPress={handlePickAvatar} disabled={avatarUploading} activeOpacity={0.8} style={S.userAvatarBox}>
            {user?.avatar ? (
              <Image
                source={{ uri: user.avatar.startsWith('http') ? user.avatar : `${BASE_URL}${user.avatar}` }}
                style={S.userAvatarImg}
              />
            ) : (
              <View style={S.userAvatar}>
                <Text style={S.userAvatarText}>{user?.name?.charAt(0)?.toUpperCase()}</Text>
              </View>
            )}
            <View style={S.cameraBadge}>
              {avatarUploading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 10 }}>📷</Text>}
            </View>
          </TouchableOpacity>
          <View>
            <Text style={S.userName}>{user?.name}</Text>
            <Text style={S.userRole}>{ROLE_LABEL[user?.role ?? ''] ?? 'Admin'}</Text>
            <Text style={S.userPhone}>{user?.phone}</Text>
          </View>
        </View>

        {/* Menu sections */}
        {MENU.map(section => (
          <View key={section.title} style={S.section}>
            <Text style={S.sectionTitle}>{section.title}</Text>
            <View style={S.menuCard}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[S.menuItem, idx < section.items.length - 1 && S.menuItemBorder]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <Text style={S.menuIcon}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={S.menuLabel}>{item.label}</Text>
                    {(item as any).sub && <Text style={S.menuSub}>{(item as any).sub}</Text>}
                  </View>
                  <Text style={S.menuArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <TouchableOpacity style={S.logoutBtn} onPress={handleLogout}>
          <Text style={S.logoutText}>🚪 Đăng xuất</Text>
        </TouchableOpacity>

        <Text style={S.version}>v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#f4f5f9' },
  header:      { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn:     { width: 36, height: 36, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.white, flex: 1 },
  content:     { padding: 16, gap: 16, paddingBottom: 32 },
  userCard:       { backgroundColor: Colors.primary, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  userAvatarBox:  { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', position: 'relative' },
  userAvatar:     { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center' },
  userAvatarImg:  { width: 60, height: 60, borderRadius: 30 },
  userAvatarText: { fontSize: 26, fontWeight: '700', color: Colors.gray900 },
  cameraBadge:    { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.white },
  userName:    { fontSize: 18, fontWeight: '700', color: Colors.white },
  userRole:    { fontSize: 13, color: Colors.accent, fontWeight: '600', marginTop: 2 },
  userPhone:   { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  section:     { gap: 8 },
  sectionTitle:{ fontSize: 11, fontWeight: '700', color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: 4 },
  menuCard:    { backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  menuItem:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  menuIcon:    { fontSize: 20 },
  menuLabel:   { fontSize: 15, fontWeight: '500', color: Colors.gray900 },
  menuSub:     { fontSize: 11, color: Colors.gray500, marginTop: 1 },
  menuArrow:   { fontSize: 20, color: Colors.gray300 },
  logoutBtn:   { backgroundColor: Colors.white, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.error + '40' },
  logoutText:  { fontSize: 15, fontWeight: '600', color: Colors.error },
  version:     { textAlign: 'center', fontSize: 12, color: Colors.gray400, marginTop: 8 },
});
