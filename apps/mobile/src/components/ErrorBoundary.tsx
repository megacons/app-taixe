import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

interface State { hasError: boolean; error: string; componentStack: string; }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '', componentStack: '' };
  }

  static getDerivedStateFromError(error: any): Partial<State> {
    return { hasError: true, error: error?.message ?? String(error) };
  }

  componentDidCatch(error: any, info: any) {
    console.error('[ErrorBoundary] Caught error:', error?.message);
    console.error('[ErrorBoundary] Component stack:', info?.componentStack);
    this.setState({ componentStack: info?.componentStack ?? '' });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={S.container}>
          <Text style={S.emoji}>⚠️</Text>
          <Text style={S.title}>Có lỗi xảy ra</Text>
          <Text style={S.error}>{this.state.error}</Text>
          {this.state.componentStack ? (
            <Text style={S.stack} numberOfLines={8}>
              {this.state.componentStack.trim()}
            </Text>
          ) : null}
          <TouchableOpacity
            style={S.btn}
            onPress={() => this.setState({ hasError: false, error: '', componentStack: '' })}
          >
            <Text style={S.btnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const S = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 24 },
  emoji:      { fontSize: 48, marginBottom: 16 },
  title:      { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  error:      { fontSize: 13, color: '#ef4444', textAlign: 'center', marginBottom: 12, fontFamily: 'monospace' },
  stack:      { fontSize: 10, color: '#666', backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, width: '100%', marginBottom: 16 },
  btn:        { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
});
