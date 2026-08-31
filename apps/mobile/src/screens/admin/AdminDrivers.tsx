import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, TextInput, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

const STATUS_COLOR: Record<string, string> = {
  active: Colors.success, inactive: Colors.gray400,
  on_leave: Colors.warning, suspended: Colors.error,
};
const STATUS_LABEL: Record<string, string> = {
  active: 'Hoạt động', inactive: 'Không HĐ',
  on_leave: 'Nghỉ phép', suspended: 'Đình chỉ',
};

export default function AdminDrivers() {
  const navigation = useNavigation<any>();
  const [drivers, setDrivers]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [total, setTotal]           = useState(0);

  const fetchDrivers = useCallback(async (q = '') => {
    try {
      const res = await api.get('/drivers', { params: { limit: 50, search: q } });
      setDrivers(res.data.data?.drivers ?? []);
      setTotal(res.data.data?.pagination?.total ?? 0);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDrivers(); }, []);

  const onRefresh = async () => { setRefreshing(true); await fetchDrivers(search); setRefreshing(false); };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Tài xế ({total})</Text>
      </View>

      {/* Search */}
      <View style={S.searchBox}>
        <Text style={S.searchIcon}>🔍</Text>
        <TextInput
          style={S.searchInput}
          value={search}
          onChangeText={v => { setSearch(v); fetchDrivers(v); }}
          placeholder="Tìm tên, SĐT..."
          placeholderTextColor={Colors.gray400}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={d => d._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={S.listContent}
          renderItem={({ item: d }) => (
            <View style={S.card}>
              <TouchableOpacity
                style={S.cardMain}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('AdminDriverDetail', { driverId: d._id })}
              >
                <View style={S.cardLeft}>
                  {(() => {
                    const avatarUrl = d.user_id?.avatar;
                    const fullUrl = avatarUrl ? (avatarUrl.startsWith('http') ? avatarUrl : `${BASE_URL}${avatarUrl}`) : null;
                    return fullUrl ? (
                      <Image source={{ uri: fullUrl }} style={S.avatarImg} />
                    ) : (
                      <View style={S.avatar}>
                        <Text style={S.avatarText}>{d.full_name?.charAt(0)?.toUpperCase()}</Text>
                      </View>
                    );
                  })()}
                  <View style={{ flex: 1 }}>
                    <Text style={S.name}>{d.full_name}</Text>
                    <Text style={S.phone}>{d.phone}</Text>
                    <Text style={S.plate}>🚛 {d.vehicle_id?.license_plate ?? 'Chưa gán xe'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
              <View style={{ alignItems: 'flex-end', gap: 4, justifyContent: 'center' }}>
                <View style={[S.statusBadge, { backgroundColor: STATUS_COLOR[d.status] + '20' }]}>
                  <Text style={[S.statusText, { color: STATUS_COLOR[d.status] }]}>
                    {STATUS_LABEL[d.status] ?? d.status}
                  </Text>
                </View>
                <Text style={S.empId}>{d.employee_id ?? ''}</Text>
                <TouchableOpacity
                  style={S.salaryBtn}
                  onPress={() => navigation.navigate('AdminSalaryDetail', { driverId: d._id, driverName: d.full_name })}
                  activeOpacity={0.75}
                >
                  <Text style={S.salaryBtnText}>💵 Lương</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={{ fontSize: 40 }}>👤</Text>
              <Text style={S.emptyText}>Không có tài xế</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  header:      { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn:     { width: 36, height: 36, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.white, flex: 1 },
  searchBox:   { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: Colors.white, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border },
  searchIcon:  { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, height: 40, fontSize: 14, color: Colors.gray900 },
  listContent: { padding: 12, paddingTop: 0, paddingBottom: 32 },
  card:        { backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cardMain:    { flex: 1, flexDirection: 'row', alignItems: 'center' },
  cardLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar:      { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarImg:   { width: 42, height: 42, borderRadius: 21 },
  avatarText:  { fontSize: 18, fontWeight: '700', color: Colors.white },
  name:        { fontSize: 14, fontWeight: '700', color: Colors.gray900 },
  phone:       { fontSize: 12, color: Colors.gray500, marginTop: 1 },
  plate:       { fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  empId:       { fontSize: 10, color: Colors.gray400 },
  arrow:       { fontSize: 20, color: Colors.gray300 },
  salaryBtn:   { backgroundColor: Colors.primary + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 2 },
  salaryBtnText: { fontSize: 11, color: Colors.primary, fontWeight: '700' },
  empty:       { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText:   { fontSize: 14, color: Colors.gray500 },
});
