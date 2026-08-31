import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { useCompanyConfig } from '@/hooks/useCompanyConfig';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

const ROLE_LABEL: Record<string, string> = {
  manager:     'Quản lý',
  coordinator: 'Điều phối',
  accountant:  'Kế toán',
};

const STATUS_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: '#fef3c7', text: '#b45309', label: 'Chờ duyệt' },
  approved:  { bg: '#d1fae5', text: '#065f46', label: 'Đã duyệt' },
  rejected:  { bg: '#fee2e2', text: '#991b1b', label: 'Từ chối' },
};

const TYPE_LABEL: Record<string, string> = {
  salary_advance: 'Tạm ứng', leave: 'Nghỉ phép',
  expense: 'Chi phí', purchase: 'Mua hàng',
  additional_trip: 'Thêm chuyến', attendance_adjustment: 'Đổi giờ',
};

export default function AdminMobileScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();
  const { companyName, logoUrl: companyLogoUrl } = useCompanyConfig();

  const [kpi, setKpi]             = useState({ drivers: 0, vehicles: 0, pending: 0, trips_today: 0 });
  const [requests, setRequests]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [driverRes, reqRes, tripRes] = await Promise.all([
        api.get('/drivers', { params: { limit: 1 } }),
        api.get('/requests', { params: { status: 'pending', limit: 20 } }),
        api.get('/trips/summary/daily', { params: { date: new Date().toISOString().slice(0, 10) } }),
      ]);

      setKpi({
        drivers:     driverRes.data.data?.pagination?.total ?? 0,
        vehicles:    0,
        pending:     reqRes.data.data?.pagination?.total ?? 0,
        trips_today: tripRes.data.data?.total_trips ?? 0,
      });
      setRequests(reqRes.data.data?.requests ?? []);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const handleApprove = async (id: string, title: string) => {
    Alert.alert('Duyệt yêu cầu', `Duyệt "${title}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: '✅ Duyệt',
        onPress: async () => {
          setApproving(id);
          try {
            await api.put(`/requests/${id}/approve`, { comment: 'Admin duyệt qua mobile' });
            setRequests(prev => prev.filter(r => r._id !== id));
            setKpi(k => ({ ...k, pending: Math.max(0, k.pending - 1) }));
          } catch (e: any) {
            Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể duyệt');
          } finally { setApproving(null); }
        },
      },
    ]);
  };

  const handleReject = async (id: string, title: string) => {
    Alert.alert('Từ chối', `Từ chối "${title}"?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: '❌ Từ chối',
        style: 'destructive',
        onPress: async () => {
          setApproving(id);
          try {
            await api.put(`/requests/${id}/reject`, { rejection_reason: 'Admin từ chối qua mobile' });
            setRequests(prev => prev.filter(r => r._id !== id));
            setKpi(k => ({ ...k, pending: Math.max(0, k.pending - 1) }));
          } catch (e: any) {
            Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thể từ chối');
          } finally { setApproving(null); }
        },
      },
    ]);
  };

  const fmtTime = (iso: string) => {
    try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: vi }); }
    catch { return '—'; }
  };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity style={S.headerLeft} onPress={() => navigation.navigate('Profile' as any)} activeOpacity={0.75}>
          <View style={S.logoBox}>
            {companyLogoUrl
              ? <Image source={{ uri: companyLogoUrl }} style={{ width: 36, height: 36, borderRadius: 10 }} resizeMode="contain" />
              : <Text style={{ fontSize: 18 }}>🚛</Text>
            }
          </View>
          <View>
            <Text style={S.brandName}>{companyName}</Text>
            <Text style={S.roleLabel}>{ROLE_LABEL[user?.role ?? ''] ?? 'Admin'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={S.logoutBtn} onPress={() => {
          Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Đăng xuất', style: 'destructive', onPress: logout },
          ]);
        }}>
          <Text style={S.logoutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={S.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.white} />}
      >
        {/* Welcome */}
        <Text style={S.welcome}>Xin chào, {user?.name} 👋</Text>

        {/* KPI Cards */}
        <View style={S.kpiGrid}>
          {[
            { icon: '👤', label: 'Tài xế', value: kpi.drivers, color: '#60a5fa' },
            { icon: '🚛', label: 'Chuyến hôm nay', value: kpi.trips_today, color: '#34d399' },
            { icon: '⏳', label: 'Chờ duyệt', value: kpi.pending, color: '#fbbf24' },
          ].map(k => (
            <View key={k.label} style={S.kpiCard}>
              <Text style={S.kpiIcon}>{k.icon}</Text>
              <Text style={[S.kpiValue, { color: k.color }]}>{k.value}</Text>
              <Text style={S.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* Pending requests */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>
            Yêu cầu chờ duyệt
            {kpi.pending > 0 && (
              <Text style={S.pendingBadge}> ({kpi.pending})</Text>
            )}
          </Text>

          {loading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 20 }} />
          ) : requests.length === 0 ? (
            <View style={S.empty}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text style={S.emptyText}>Không có yêu cầu nào chờ duyệt</Text>
            </View>
          ) : (
            requests.map(req => {
              const st = STATUS_COLOR[req.status] ?? STATUS_COLOR.pending;
              const isLoading = approving === req._id;
              return (
                <View key={req._id} style={S.reqCard}>
                  {/* Top row */}
                  <View style={S.reqTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={S.reqTitle} numberOfLines={1}>{req.title}</Text>
                      <Text style={S.reqMeta}>
                        {req.created_by?.name ?? '—'}  •  {fmtTime(req.created_at)}
                      </Text>
                    </View>
                    <View style={[S.typeBadge]}>
                      <Text style={S.typeBadgeText}>
                        {TYPE_LABEL[req.type] ?? req.type}
                      </Text>
                    </View>
                  </View>

                  {/* Amount if any */}
                  {req.payload?.amount > 0 && (
                    <Text style={S.reqAmount}>
                      💰 {new Intl.NumberFormat('vi-VN').format(req.payload.amount)}đ
                    </Text>
                  )}
                  {req.payload?.reason && (
                    <Text style={S.reqReason} numberOfLines={2}>{req.payload.reason}</Text>
                  )}

                  {/* Action buttons */}
                  <View style={S.reqActions}>
                    <TouchableOpacity
                      style={[S.rejectBtn, isLoading && { opacity: 0.5 }]}
                      onPress={() => handleReject(req._id, req.title)}
                      disabled={isLoading}
                    >
                      <Text style={S.rejectBtnText}>❌ Từ chối</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[S.approveBtn, isLoading && { opacity: 0.5 }]}
                      onPress={() => handleApprove(req._id, req.title)}
                      disabled={isLoading}
                    >
                      {isLoading
                        ? <ActivityIndicator size="small" color={Colors.white} />
                        : <Text style={S.approveBtnText}>✅ Duyệt</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Quick links */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Truy cập nhanh</Text>
          <View style={S.quickGrid}>
            {[
              { icon: '🔔', label: 'Thông báo', onPress: () => navigation.navigate('Notifications') },
              { icon: '🔒', label: 'Đổi mật khẩu', onPress: () => navigation.navigate('ChangePassword') },
            ].map(q => (
              <TouchableOpacity key={q.label} style={S.quickBtn} onPress={q.onPress}>
                <Text style={{ fontSize: 26 }}>{q.icon}</Text>
                <Text style={S.quickLabel}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.primary },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center',
  },
  brandName: { fontSize: 17, fontWeight: '800', color: Colors.white },
  roleLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  logoutText: { fontSize: 12, fontWeight: '600', color: Colors.white },

  content:    { paddingHorizontal: 16, paddingBottom: 32 },
  welcome:    { fontSize: 20, fontWeight: '700', color: Colors.white, marginTop: 4, marginBottom: 16 },

  kpiGrid:    { flexDirection: 'row', gap: 10, marginBottom: 20 },
  kpiCard:    {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14, padding: 14, alignItems: 'center', gap: 4,
  },
  kpiIcon:    { fontSize: 24 },
  kpiValue:   { fontSize: 22, fontWeight: '800' },
  kpiLabel:   { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textAlign: 'center' },

  section:       { marginBottom: 20 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: Colors.white, marginBottom: 12 },
  pendingBadge:  { color: Colors.accent },

  reqCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    marginBottom: 10, gap: 8,
  },
  reqTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reqTitle:  { fontSize: 14, fontWeight: '700', color: Colors.gray900 },
  reqMeta:   { fontSize: 11, color: Colors.gray500, marginTop: 2 },
  typeBadge: { backgroundColor: Colors.primary + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  reqAmount: { fontSize: 14, fontWeight: '700', color: Colors.success },
  reqReason: { fontSize: 12, color: Colors.gray500, fontStyle: 'italic' },

  reqActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rejectBtn: {
    flex: 1, height: 40, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.error, justifyContent: 'center', alignItems: 'center',
  },
  rejectBtnText: { fontSize: 13, fontWeight: '600', color: Colors.error },
  approveBtn: {
    flex: 1, height: 40, borderRadius: 10,
    backgroundColor: Colors.success, justifyContent: 'center', alignItems: 'center',
  },
  approveBtnText: { fontSize: 13, fontWeight: '600', color: Colors.white },

  empty:     { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },

  quickGrid: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14, padding: 16, alignItems: 'center', gap: 6,
  },
  quickLabel: { fontSize: 12, fontWeight: '600', color: Colors.white, textAlign: 'center' },
});
