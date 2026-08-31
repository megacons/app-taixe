import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  error?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  editable?: boolean;
  rightLabel?: string;
}

export default function FormField({
  label, value, onChangeText, placeholder, error,
  multiline = false, keyboardType = 'default', editable = true, rightLabel,
}: Props) {
  return (
    <View style={ff.group}>
      <Text style={ff.label}>{label}</Text>
      <View style={ff.inputWrap}>
        <TextInput
          style={[ff.input, multiline && ff.textarea, !editable && ff.disabled]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.gray400}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          keyboardType={keyboardType}
          editable={editable}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
        {rightLabel && (
          <View style={ff.rightLabel}>
            <Text style={ff.rightLabelText}>{rightLabel}</Text>
          </View>
        )}
      </View>
      {error && <Text style={ff.error}>{error}</Text>}
    </View>
  );
}

const ff = StyleSheet.create({
  group: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  inputWrap: { position: 'relative' },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.gray900,
    backgroundColor: '#f4f2fb',
  },
  textarea: { minHeight: 100, paddingTop: 12 },
  disabled: { opacity: 0.6 },
  rightLabel: { position: 'absolute', right: 12, top: '50%', marginTop: -9 },
  rightLabelText: { fontSize: 14, color: Colors.gray400 },
  error: { fontSize: 12, color: Colors.error, marginTop: 4 },
});
