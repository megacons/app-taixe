import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';

export default function ChangePasswordScreen() {
  const navigation = useNavigation();
  const { logout } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!currentPassword) e.currentPassword = 'Nhập mật khẩu hiện tại';
    if (!newPassword || newPassword.length < 6) e.newPassword = 'Mật khẩu mới tối thiểu 6 ký tự';
    if (newPassword === currentPassword) e.newPassword = 'Mật khẩu mới phải khác mật khẩu hiện tại';
    if (newPassword !== confirmPassword) e.confirmPassword = 'Mật khẩu không khớp';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await api.put('/auth/change-password', { currentPassword, newPassword });
      Alert.alert('✅ Thành công', 'Đổi mật khẩu thành công! Vui lòng đăng nhập lại.', [
        { text: 'OK', onPress: () => logout() },
      ]);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể đổi mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Đổi mật khẩu</Text>
        <View style={{ width: 36 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <PasswordField
              label="Mật khẩu hiện tại"
              placeholder="Nhập mật khẩu đang dùng"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggle={() => setShowCurrent(!showCurrent)}
              error={errors.currentPassword}
            />
            <PasswordField
              label="Mật khẩu mới"
              placeholder="Tối thiểu 6 ký tự"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggle={() => setShowNew(!showNew)}
              error={errors.newPassword}
            />
            <PasswordField
              label="Xác nhận mật khẩu mới"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggle={() => setShowConfirm(!showConfirm)}
              error={errors.confirmPassword}
              isLast
            />
          </View>
          <TouchableOpacity style={styles.btn} onPress={handleSubmit} disabled={loading}>
            {loading
              ? <ActivityIndicator color={Colors.primary} />
              : <Text style={styles.btnText}>Đổi mật khẩu</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordField({ label, placeholder, value, onChange, show, onToggle, error, isLast }: any) {
  const inputRef = useRef<any>(null);

  const handleToggle = () => {
    // Blur trước, toggle state, rồi re-focus — trick iOS nhận secureTextEntry mới
    inputRef.current?.blur();
    onToggle();
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  return (
    <View style={[pStyles.group, !isLast && pStyles.groupBorder]}>
      <Text style={pStyles.label}>{label}</Text>
      <View style={pStyles.inputRow}>
        <TextInput
          ref={inputRef}
          style={pStyles.input}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          placeholder={placeholder ?? '••••••'}
          placeholderTextColor={Colors.gray400}
        />
        <TouchableOpacity
          onPress={handleToggle}
          style={pStyles.eye}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.6}
        >
          <Text style={{ fontSize: 20 }}>{show ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>
      {error && <Text style={pStyles.error}>{error}</Text>}
    </View>
  );
}

const pStyles = StyleSheet.create({
  group: { marginBottom: 4 },
  groupBorder: { paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 6, marginTop: 12 },
  inputRow: { flexDirection: 'row', borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.white, overflow: 'visible' },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.gray900 },
  eye: { paddingHorizontal: 14, paddingVertical: 12 },
  error: { fontSize: 12, color: Colors.error, marginTop: 4 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { fontSize: 22, color: Colors.gray700 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.gray900 },
  content: { padding: 16 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  btn: { backgroundColor: Colors.accent, borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
});
