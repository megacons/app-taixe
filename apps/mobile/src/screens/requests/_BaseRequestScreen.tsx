/**
 * Base component dùng chung cho tất cả màn hình yêu cầu.
 * Mỗi màn hình request extend từ component này.
 */
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';

interface Props {
  title: string;
  children: React.ReactNode;
  onSubmit: () => void;
  loading?: boolean;
  canSubmit?: boolean;
}

export default function BaseRequestScreen({
  title, children, onSubmit, loading = false, canSubmit = true,
}: Props) {
  const navigation = useNavigation();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom action */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.cancelText}>Hủy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, (!canSubmit || loading) && styles.submitBtnDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={Colors.primary} size="small" />
            : <Text style={styles.submitText}>Gửi yêu cầu</Text>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Shared form components ───────────────────────────────────────────────────

export { default as FormField } from './_FormField';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, height: 56, backgroundColor: Colors.primary,
  },
  back: { fontSize: 22, color: Colors.white },
  title: { fontSize: 17, fontWeight: '700', color: Colors.white },
  content: { padding: 16 },
  bottomBar: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white,
  },
  cancelBtn: {
    flex: 1, height: 50, borderRadius: 12, borderWidth: 1.5,
    borderColor: Colors.gray300, justifyContent: 'center', alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.gray700 },
  submitBtn: {
    flex: 2, height: 50, borderRadius: 12,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
