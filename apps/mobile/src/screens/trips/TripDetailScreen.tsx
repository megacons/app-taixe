import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, Alert, Modal, StatusBar,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

/** Chuyển path tương đối "/uploads/..." thành URL tuyệt đối */
const getImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://')) return url;
  return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

/** Lightbox xem ảnh full-screen */
function ImageLightbox({ uri, onClose }: { uri: string; onClose: () => void }) {
  const { width: SCREEN_W } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar hidden />
      <View style={LB.overlay}>
        <TouchableOpacity style={LB.closeBtn} onPress={onClose}>
          <Text style={LB.closeText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, justifyContent: 'center' }} onPress={onClose} activeOpacity={1}>
          <Image
            source={{ uri }}
            style={{ width: SCREEN_W, height: SCREEN_W * 1.3 }}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const LB = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 48, right: 20, zIndex: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  closeText:{ color: '#fff', fontSize: 18, fontWeight: '700' },
});

export default function TripDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { tripId } = route.params;
  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/trips/${tripId}`)
      .then(res => setTrip(res.data.data))
      .catch(() => Alert.alert('Lỗi', 'Không thể tải thông tin chuyến.'))
      .finally(() => setLoading(false));
  }, [tripId]);

  if (loading) return (
    <SafeAreaView style={styles.safe}>
      <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
    </SafeAreaView>
  );

  if (!trip) return null;

  const formatMoney = (v: number) =>
    new Intl.NumberFormat('vi-VN').format(v) + 'đ';

  const rows = [
    { label: 'Ngày', value: (() => {
        const d = new Date(trip.trip_date);
        return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false });
      })() },
    { label: 'Vật liệu', value: trip.material_name },
    { label: 'Nơi lấy', value: trip.pickup_location },
    { label: 'Nơi đổ', value: trip.drop_location },
    { label: 'Ghi chú', value: trip.note || '—' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Chi tiết chuyến</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Info card */}
        <View style={styles.card}>
          {rows.map(row => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={[styles.rowValue, row.color ? { color: row.color } : {}]}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Ảnh biên nhận */}
        {trip.delivery_receipt && (() => {
          const imgUri = getImageUrl(trip.delivery_receipt);
          return imgUri ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Ảnh biên nhận</Text>
              <TouchableOpacity onPress={() => setLightboxUri(imgUri)} activeOpacity={0.85}>
                <Image
                  source={{ uri: imgUri }}
                  style={styles.receiptImg}
                  resizeMode="cover"
                  onError={() => {}}
                />
                <View style={styles.tapHint}>
                  <Text style={styles.tapHintText}>🔍 Nhấn để xem to</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : null;
        })()}

        {/* Lightbox */}
        {lightboxUri && (
          <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { fontSize: 22, color: Colors.gray700 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.gray900 },
  content: { padding: 16, gap: 12 },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  otBadge: { backgroundColor: Colors.accent + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  otText: { fontSize: 13, fontWeight: '700', color: Colors.accentDark },
  statusBadge: { backgroundColor: Colors.gray100, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  statusDone: { backgroundColor: Colors.successLight },
  statusText: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  rowLabel: { fontSize: 14, color: Colors.gray500, fontWeight: '500' },
  rowValue: { fontSize: 14, color: Colors.gray900, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  receiptImg: { width: '100%', height: 220, borderRadius: 10 },
  tapHint:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.35)', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, paddingVertical: 6, alignItems: 'center' },
  tapHintText:{ color: '#fff', fontSize: 12, fontWeight: '600' },
  gpsText: { fontSize: 14, color: Colors.info },
});
