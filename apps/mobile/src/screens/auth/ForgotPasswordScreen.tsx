import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';

type Step = 'phone' | 'otp' | 'newPassword';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();

  const [step,         setStep]         = useState<Step>('phone');
  const [email,        setEmail]        = useState('');
  const [otp,          setOtp]          = useState(['', '', '', '', '', '']);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [sentVia,     setSentVia]     = useState('');
  const [resetToken,   setResetToken]   = useState('');
  const [newPassword,  setNewPassword]  = useState('');
  const [confirmPass,  setConfirmPass]  = useState('');
  const [showNew,      setShowNew]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,      setLoading]      = useState(false);

  const [countdown,    setCountdown]    = useState(0);

  const otpRefs = useRef<(TextInput | null)[]>([]);

  /* ── Bước 1: Gửi OTP ── */
  const handleSendOtp = async () => {
    if (!email.trim() || !email.includes('@')) return Alert.alert('Lỗi', 'Vui lòng nhập email hợp lệ');
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      const { maskedEmail: masked, emailSent, otp: devOtp } = res.data;
      setMaskedEmail(masked ?? email);
      setStep('otp');
      startCountdown();
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể gửi OTP');
    } finally {
      setLoading(false);
    }
  };
  const startCountdown = () => {
    setCountdown(60);
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(id); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  /* ── Bước 2: Xác minh OTP ── */
  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length < 6) return Alert.alert('Lỗi', 'Vui lòng nhập đủ 6 số OTP');
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { email: email.trim().toLowerCase(), otp: code });
      setResetToken(res.data.resetToken);
      setStep('newPassword');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Mã OTP không đúng');
    } finally {
      setLoading(false);
    }
  };

  /* ── Bước 3: Đặt mật khẩu mới ── */
  const handleResetPassword = async () => {
    if (newPassword.length < 6) return Alert.alert('Lỗi', 'Mật khẩu tối thiểu 6 ký tự');
    if (newPassword !== confirmPass) return Alert.alert('Lỗi', 'Mật khẩu xác nhận không khớp');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        resetToken,
        newPassword,
      });
      Alert.alert('✅ Thành công', 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập.', [
        { text: 'Đăng nhập', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể đặt lại mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  /* ── OTP input handler ── */
  const handleOtpChange = (val: string, idx: number) => {
    if (val.length > 1) {
      // Paste toàn bộ OTP
      const digits = val.replace(/\D/g, '').slice(0, 6).split('');
      const next = [...otp];
      digits.forEach((d, i) => { if (i < 6) next[i] = d; });
      setOtp(next);
      otpRefs.current[Math.min(digits.length, 5)]?.focus();
      return;
    }
    const next = [...otp];
    next[idx] = val;
    setOtp(next);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKeyPress = (key: string, idx: number) => {
    if (key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  /* ── STEP TITLES ── */
  const STEPS = [
    { key: 'phone',       label: 'Nhập Email' },
    { key: 'otp',         label: 'Nhập OTP' },
    { key: 'newPassword', label: 'Mật khẩu mới' },
  ];
  const currentStep = STEPS.findIndex(s => s.key === step);

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Quên mật khẩu</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={S.content} keyboardShouldPersistTaps="handled">

          {/* Step indicator */}
          <View style={S.stepRow}>
            {STEPS.map((s, i) => (
              <View key={s.key} style={S.stepWrap}>
                <View style={[S.stepDot, i <= currentStep && S.stepDotActive]}>
                  {i < currentStep
                    ? <Text style={S.stepCheck}>✓</Text>
                    : <Text style={[S.stepNum, i === currentStep && S.stepNumActive]}>{i + 1}</Text>
                  }
                </View>
                <Text style={[S.stepLabel, i === currentStep && S.stepLabelActive]}>{s.label}</Text>
                {i < STEPS.length - 1 && <View style={[S.stepLine, i < currentStep && S.stepLineActive]} />}
              </View>
            ))}
          </View>

          {/* ── Bước 1: Nhập SĐT ── */}
          {step === 'phone' && (
            <View style={S.card}>
              <Text style={S.cardTitle}>Nhập email</Text>
              <Text style={S.cardSub}>Nhập email liên kết với tài khoản để nhận mã OTP</Text>

              <Text style={S.label}>Email <Text style={S.req}>*</Text></Text>
              <TextInput
                style={S.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Nhập địa chỉ email của bạn"
                placeholderTextColor={Colors.gray400}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
              />

              <TouchableOpacity style={[S.btn, loading && S.btnDisabled]} onPress={handleSendOtp} disabled={loading} activeOpacity={0.85}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={S.btnText}>📧 Gửi mã OTP</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* ── Bước 2: Nhập OTP ── */}
          {step === 'otp' && (
            <View style={S.card}>
              <Text style={S.cardTitle}>Nhập mã OTP</Text>
              <Text style={S.cardSub}>
                {sentVia === 'email'
                  ? `Mã OTP 6 số đã gửi về email\n`
                  : `Mã OTP 6 số đã được gửi\n`}
                <Text style={{ fontWeight: '700', color: Colors.gray900 }}>
                  {maskedEmail || phone}
                </Text>
              </Text>

              <View style={S.otpRow}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={r => { otpRefs.current[i] = r; }}
                    style={[S.otpCell, digit && S.otpCellFilled]}
                    value={digit}
                    onChangeText={v => handleOtpChange(v, i)}
                    onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
                    keyboardType="number-pad"
                    maxLength={6}
                    textAlign="center"
                    selectTextOnFocus
                  />
                ))}
              </View>

              <TouchableOpacity style={[S.btn, loading && S.btnDisabled]} onPress={handleVerifyOtp} disabled={loading} activeOpacity={0.85}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={S.btnText}>Xác nhận OTP</Text>
                }
              </TouchableOpacity>

              {/* Gửi lại */}
              <TouchableOpacity
                style={[S.resendBtn, countdown > 0 && S.resendBtnDisabled]}
                onPress={countdown === 0 ? handleSendOtp : undefined}
                disabled={countdown > 0}
              >
                <Text style={[S.resendText, countdown > 0 && S.resendTextDisabled]}>
                  {countdown > 0 ? `Gửi lại sau ${countdown}s` : 'Gửi lại OTP'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Bước 3: Mật khẩu mới ── */}
          {step === 'newPassword' && (
            <View style={S.card}>
              <Text style={S.cardTitle}>Đặt mật khẩu mới</Text>
              <Text style={S.cardSub}>Mật khẩu tối thiểu 6 ký tự</Text>

              <Text style={S.label}>Mật khẩu mới <Text style={S.req}>*</Text></Text>
              <View style={S.passRow}>
                <TextInput
                  style={[S.input, { flex: 1, marginBottom: 0 }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Nhập mật khẩu mới"
                  placeholderTextColor={Colors.gray400}
                  secureTextEntry={!showNew}
                  autoFocus
                />
                <TouchableOpacity style={S.eyeBtn} onPress={() => setShowNew(v => !v)}>
                  <Text style={S.eyeIcon}>{showNew ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={[S.label, { marginTop: 14 }]}>Xác nhận mật khẩu <Text style={S.req}>*</Text></Text>
              <View style={S.passRow}>
                <TextInput
                  style={[S.input, { flex: 1, marginBottom: 0 }]}
                  value={confirmPass}
                  onChangeText={setConfirmPass}
                  placeholder="Nhập lại mật khẩu"
                  placeholderTextColor={Colors.gray400}
                  secureTextEntry={!showConfirm}
                />
                <TouchableOpacity style={S.eyeBtn} onPress={() => setShowConfirm(v => !v)}>
                  <Text style={S.eyeIcon}>{showConfirm ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[S.btn, loading && S.btnDisabled, { marginTop: 20 }]} onPress={handleResetPassword} disabled={loading} activeOpacity={0.85}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={S.btnText}>🔒 Đặt lại mật khẩu</Text>
                }
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  header:      { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14 },
  backBtn:     { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  backIcon:    { fontSize: 22, color: '#fff', fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  content: { padding: 20, paddingBottom: 40 },

  /* Step indicator */
  stepRow:       { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', marginBottom: 28, gap: 0 },
  stepWrap:      { alignItems: 'center', position: 'relative', flex: 1 },
  stepDot:       { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: Colors.gray300, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  stepDotActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  stepNum:       { fontSize: 13, fontWeight: '700', color: Colors.gray400 },
  stepNumActive: { color: '#fff' },
  stepCheck:     { fontSize: 14, color: '#fff', fontWeight: '800' },
  stepLabel:     { fontSize: 10, color: Colors.gray400, marginTop: 4, textAlign: 'center', fontWeight: '500' },
  stepLabelActive:{ color: Colors.primary, fontWeight: '700' },
  stepLine:      { position: 'absolute', top: 16, left: '50%', right: '-50%', height: 2, backgroundColor: Colors.gray200, zIndex: -1 },
  stepLineActive:{ backgroundColor: Colors.primary },

  /* Card */
  card:     { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardTitle:{ fontSize: 18, fontWeight: '800', color: Colors.gray900, marginBottom: 6 },
  cardSub:  { fontSize: 13, color: Colors.gray500, lineHeight: 20, marginBottom: 20 },

  /* Field */
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  req:   { color: Colors.error },
  input: { borderWidth: 1.5, borderColor: Colors.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.gray900, backgroundColor: '#fafafa', marginBottom: 16 },

  passRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.gray200, borderRadius: 12, backgroundColor: '#fafafa', marginBottom: 0, overflow: 'hidden' },
  eyeBtn:  { width: 44, justifyContent: 'center', alignItems: 'center' },
  eyeIcon: { fontSize: 18 },

  /* Button */
  btn:        { backgroundColor: Colors.primary, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 4, flexDirection: 'row', gap: 8 },
  btnDisabled:{ opacity: 0.55 },
  btnText:    { fontSize: 15, fontWeight: '700', color: '#fff' },

  /* OTP */
  otpRow:      { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 24 },
  otpCell:     { width: 46, height: 56, borderRadius: 12, borderWidth: 2, borderColor: Colors.gray200, backgroundColor: '#fafafa', fontSize: 22, fontWeight: '800', color: Colors.gray900 },
  otpCellFilled:{ borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },

  /* Resend */
  resendBtn:        { marginTop: 16, alignItems: 'center', padding: 8 },
  resendBtnDisabled:{ opacity: 0.5 },
  resendText:       { fontSize: 14, fontWeight: '600', color: Colors.primary },
  resendTextDisabled:{ color: Colors.gray400 },
});
