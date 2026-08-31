import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';

const GOOGLE_MAPS_API_KEY = 'AIzaSyB-qQR9kJXefBNKb9Y7qa3vphWCpLGP9HA';

export default function GPSMapScreen() {
  const navigation = useNavigation();
  const webViewRef = useRef<WebView>(null);

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [speed, setSpeed] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [trailCount, setTrailCount] = useState(0);
  const pingRef = useRef<NodeJS.Timer | null>(null);
  useEffect(() => {
    requestAndGetLocation();
    return () => { if (pingRef.current) clearInterval(pingRef.current as any); };
  }, []);

  const requestAndGetLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Cần quyền vị trí', 'Vui lòng cấp quyền truy cập vị trí.');
      setLoading(false);
      return;
    }
    await refreshLocation();
  };

  const refreshLocation = async () => {
    setLoading(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude, accuracy: acc, speed: spd } = loc.coords;
      const newLoc = { lat: latitude, lng: longitude };
      setLocation(newLoc);
      setAccuracy(acc ? Math.round(acc) : null);
      setSpeed(spd ? Math.round(spd * 3.6) : 0);

      // Update map
      webViewRef.current?.injectJavaScript(`
        if(window.updateLocation) {
          window.updateLocation(${latitude}, ${longitude});
        }
        true;
      `);
    } catch {
      Alert.alert('Lỗi', 'Không thể lấy vị trí.');
    } finally {
      setLoading(false);
    }
  };

  const pingGPS = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude, speed: spd, accuracy: acc } = loc.coords;
      setLocation({ lat: latitude, lng: longitude });
      setSpeed(spd ? Math.round(spd * 3.6) : 0);
      setAccuracy(acc ? Math.round(acc) : null);
      setTrailCount(c => c + 1);

      webViewRef.current?.injectJavaScript(`
        if(window.addTrailPoint) window.addTrailPoint(${latitude}, ${longitude});
        true;
      `);

      await api.post('/gps/ping', {
        latitude, longitude,
        speed: spd ? Math.round(spd * 3.6) : 0,
        accuracy: acc,
      });
    } catch (_) {}
  };

  const toggleTracking = async () => {
    if (tracking) {
      if (pingRef.current) clearInterval(pingRef.current as any);
      pingRef.current = null;
      setTracking(false);
    } else {
      setTracking(true);
      pingGPS();
      pingRef.current = setInterval(pingGPS, 30000) as any;
    }
  };

  // HTML cho bản đồ dùng OpenStreetMap + Leaflet (không cần API key)
  const mapHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #map { width:100%; height:100vh; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map').setView([10.7769, 106.7009], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  var marker = L.circleMarker([10.7769, 106.7009], {
    radius: 10,
    fillColor: '#163797',
    fillOpacity: 1,
    color: '#ffffff',
    weight: 3,
  }).addTo(map).bindPopup('Vị trí tài xế');

  var trail = [];
  var polyline = L.polyline([], { color: '#f8b30e', weight: 4, opacity: 0.8 }).addTo(map);

  window.updateLocation = function(lat, lng) {
    var pos = [lat, lng];
    marker.setLatLng(pos);
    map.panTo(pos);
  };

  window.addTrailPoint = function(lat, lng) {
    var pos = [lat, lng];
    marker.setLatLng(pos);
    map.panTo(pos);
    trail.push(pos);
    polyline.setLatLngs(trail);
  };
</script>
</body>
</html>
`;

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>GPS Tracking</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Map via WebView */}
      <View style={S.mapContainer}>
        {loading && !location && (
          <View style={S.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={S.loadingText}>Đang lấy vị trí...</Text>
          </View>
        )}
        <WebView
          ref={webViewRef}
          style={S.map}
          source={{ html: mapHtml }}
          originWhitelist={['*']}
          javaScriptEnabled
          onLoad={() => {
            if (location) {
              setTimeout(() => {
                webViewRef.current?.injectJavaScript(`
                  if(window.updateLocation) window.updateLocation(${location.lat}, ${location.lng});
                  true;
                `);
              }, 1000);
            }
          }}
        />
      </View>

      {/* Info panel */}
      <View style={S.infoPanel}>
        {/* Coordinates */}
        {location && (
          <View style={S.coordRow}>
            <Text style={S.coordLabel}>📍 Vị trí</Text>
            <Text style={S.coordValue}>
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </Text>
          </View>
        )}

        {/* Stats */}
        <View style={S.statsRow}>
          <View style={S.statBox}>
            <Text style={S.statIcon}>🚗</Text>
            <Text style={S.statValue}>{speed}</Text>
            <Text style={S.statLabel}>km/h</Text>
          </View>
          <View style={S.statBox}>
            <Text style={S.statIcon}>📡</Text>
            <Text style={S.statValue}>{accuracy ?? '—'}</Text>
            <Text style={S.statLabel}>m (±)</Text>
          </View>
          <View style={S.statBox}>
            <Text style={S.statIcon}>🗺️</Text>
            <Text style={S.statValue}>{trailCount}</Text>
            <Text style={S.statLabel}>điểm</Text>
          </View>
        </View>

        {/* Tracking toggle */}
        <View style={S.trackingRow}>
          <View style={S.trackingLeft}>
            <View style={[S.dot, tracking && S.dotActive]} />
            <Text style={S.trackingLabel}>
              {tracking ? '🔴 Đang theo dõi (30s/lần)' : '⚪ Chưa bật theo dõi'}
            </Text>
          </View>
          <Switch
            value={tracking}
            onValueChange={toggleTracking}
            trackColor={{ false: Colors.gray300, true: Colors.success + '80' }}
            thumbColor={tracking ? Colors.success : Colors.gray400}
          />
        </View>

        {/* Refresh */}
        <TouchableOpacity style={S.refreshBtn} onPress={refreshLocation}>
          <Text style={S.refreshText}>🔄 Cập nhật vị trí</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  backBtn:    { width: 36, height: 36, justifyContent: 'center' },
  backIcon:   { fontSize: 22, color: Colors.white },
  headerTitle:{ fontSize: 17, fontWeight: '700', color: Colors.white },

  mapContainer: { flex: 1, position: 'relative' },
  map:          { flex: 1 },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.gray100, zIndex: 10,
    justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loadingText: { fontSize: 14, color: Colors.gray500 },

  infoPanel: {
    backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 14, gap: 10,
  },
  coordRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.gray50, borderRadius: 8, padding: 10,
  },
  coordLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray600 },
  coordValue: { fontSize: 11, color: Colors.primary, fontFamily: 'monospace' },

  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: {
    flex: 1, backgroundColor: Colors.gray50, borderRadius: 10, padding: 10,
    alignItems: 'center', gap: 2,
  },
  statIcon:  { fontSize: 18 },
  statValue: { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  statLabel: { fontSize: 10, color: Colors.gray500, fontWeight: '600' },

  trackingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.gray50, borderRadius: 10, padding: 12,
  },
  trackingLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:          { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.gray400 },
  dotActive:    { backgroundColor: Colors.success },
  trackingLabel:{ fontSize: 13, fontWeight: '600', color: Colors.gray700 },

  refreshBtn: {
    backgroundColor: Colors.primary, borderRadius: 10, height: 44,
    justifyContent: 'center', alignItems: 'center',
  },
  refreshText: { fontSize: 14, fontWeight: '600', color: Colors.white },
});
