import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

const fmtDate = (v?: string) => {
  if (!v) return '—';
  try { return format(parseISO(v), 'dd/MM/yyyy', { locale: vi }); }
  catch { return v; }
};

export default function VehicleInfoScreen() {
  const navigation = useNavigation<any>();
  const [driver,    setDriver]    = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  const load = async () => {
    try {
      const res = await api.get('/drivers/profile/me');
      setDriver(res.data.data);
    } catch (_) {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const v = driver?.vehicle_id;

  const vehicleRows = v ? [
    { icon: '🚛', label: 'Biển số xe',       value: v.license_plate },
    { icon: '🏷️', label: 'Nhãn hiệu',        value: v.brand },
    { icon: '🔧', label: 'Model',             value: v.model },
    { icon: '📅', label: 'Năm sản xuất',     value: v.year ? String(v.year) : '—' },
    { icon: '🎨', label: 'Màu sắc',          value: v.color },
    { icon: '⚖️', label: 'Tải trọng',        value: v.capacity ? `${v.capacity} tấn` : '—' },
    { icon: '📋', label: 'Số khung',         value: v.chassis_number },
    { icon: '🔩', label: 'Số máy',           value: v.engine_number },
    { icon: '🛡️', label: 'Hạn đăng kiểm',  value: fmtDate(v.inspection_expiry) },
    { icon: '🛡️', label: 'Hạn bảo hiểm',   value: fmtDate(v.insurance_expiry) },
  ] : [];

  const licenseRows = driver ? [
    { icon: '📄', label: 'Số bằng lái',      value: driver.license_number },
    { icon: '🏆', label: 'Hạng bằng lái',   value: driver.license_class || driver.license_type },
    { icon: '📅', label: 'Ngày cấp',         value: fmtDate(driver.license_issue_date) },
    { icon: '⏳', label: 'Ngày hết hạn',    value: fmtDate(driver.license_expiry_date || driver.license_expiry) },
  ] : [];

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.title}>Thông tin xe & bằng lái</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          contentContainerStyle={S.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {/* Xe */}
          <Text style={S.sectionTitle}>🚛 Thông tin xe</Text>
          {!v ? (
            <View style={S.emptyCard}>
              <Text style={{ fontSize: 36 }}>🚛</Text>
              <Text style={S.emptyText}>Chưa được gán xe</Text>
            </View>
          ) : (
            <View style={S.card}>
              {vehicleRows.map((row, i) => (
                <View key={row.label} style={[S.row, i < vehicleRows.length - 1 && S.rowBorder]}>
                  <Text style={S.rowIcon}>{row.icon}</Text>
                  <View style={S.rowContent}>
                    <Text style={S.rowLabel}>{row.label}</Text>
                    <Text style={S.rowValue}>{row.value || '—'}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Bằng lái */}
          <Text style={[S.sectionTitle, { marginTop: 20 }]}>📄 Bằng lái xe</Text>
          <View style={S.card}>
            {licenseRows.map((row, i) => (
              <View key={row.label} style={[S.row, i < licenseRows.length - 1 && S.rowBorder]}>
                <Text style={S.rowIcon}>{row.icon}</Text>
                <View style={S.rowContent}>
                  <Text style={S.rowLabel}>{row.label}</Text>
                  <Text style={S.rowValue}>{row.value || '—'}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
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
  sectionTitle:{ fontSize: 13, fontWeight: '700', color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  card:        { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  emptyCard:   { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Colors.border },
  emptyText:   { fontSize: 14, color: Colors.gray500 },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  rowBorder:   { borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  rowIcon:     { fontSize: 20, width: 28 },
  rowContent:  { flex: 1 },
  rowLabel:    { fontSize: 12, color: Colors.gray500, fontWeight: '500' },
  rowValue:    { fontSize: 15, fontWeight: '600', color: Colors.gray900, marginTop: 2 },
});
