/**
 * usePhotoWatermark
 * Hook tái sử dụng để chụp ảnh và tự động đóng dấu watermark:
 *   - Giờ:phút to + Ngày/thứ + Địa chỉ GPS
 *   - Brand "Nam Thành" góc phải
 *
 * Cách dùng:
 *   const { watermarkRef, pendingPhoto, applyWatermark, WatermarkView } = usePhotoWatermark(onDone);
 *   // Gọi applyWatermark(uri) khi có ảnh mới
 *   // Render <WatermarkView /> trong SafeAreaView (ẩn off-screen)
 *   // onDone(compositedUri) sẽ được gọi sau khi watermark xong
 */
import { useState, useRef, useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Location from 'expo-location';
import type { LocationObject } from 'expo-location';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Colors } from '@/constants/colors';
import { useCompanyConfig } from '@/hooks/useCompanyConfig';

interface PhotoMeta {
  uri:     string;
  time:    string;
  date:    string;
  weekday: string;
  coords:  string;
}

export function usePhotoWatermark(onDone: (uri: string) => void) {
  const [pendingPhoto, setPendingPhoto] = useState<PhotoMeta | null>(null);
  const watermarkRef = useRef<View>(null);
  const { companyName } = useCompanyConfig();

  const applyWatermark = async (rawUri: string) => {
    const now = new Date();
    let coords = '';

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let pos: LocationObject | null = null;
        try {
          pos = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
          ]) as Location.LocationObject;
        } catch {
          pos = await Location.getLastKnownPositionAsync();
        }

        if (pos) {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          try {
            const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
            if (results.length > 0) {
              const r = results[0];
              const parts = [
                r.street && r.streetNumber ? `${r.streetNumber} ${r.street}` : r.street,
                r.district ?? r.subregion,
                r.city ?? r.region,
              ].filter(Boolean);
              coords = parts.length > 0
                ? parts.join(', ')
                : `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            } else {
              coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            }
          } catch {
            coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
          }
        }
      }
    } catch (_) {}

    setPendingPhoto({
      uri:     rawUri,
      time:    format(now, 'HH:mm'),
      date:    format(now, 'dd/MM/yyyy'),
      weekday: format(now, 'EEEE', { locale: vi }),
      coords,
    });
  };

  useEffect(() => {
    if (!pendingPhoto || !watermarkRef.current) return;
    const timer = setTimeout(async () => {
      try {
        const composited = await captureRef(watermarkRef, { format: 'jpg', quality: 0.88 });
        onDone(composited);
      } catch {
        onDone(pendingPhoto.uri); // fallback ảnh gốc
      } finally {
        setPendingPhoto(null);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [pendingPhoto]);

  const WatermarkView = () => {
    if (!pendingPhoto) return null;
    return (
      <View
        ref={watermarkRef}
        collapsable={false}
        style={{ position: 'absolute', top: -9999, left: 0, width: 360, height: 480 }}
      >
        <Image
          source={{ uri: pendingPhoto.uri }}
          style={{ width: 360, height: 480 }}
          resizeMode="cover"
        />
        <View style={WM.box}>
          <View style={WM.left}>
            <Text style={WM.time}>{pendingPhoto.time}</Text>
          </View>
          <View style={WM.divider} />
          <View style={WM.right}>
            <Text style={WM.date}>{pendingPhoto.date}</Text>
            <Text style={WM.weekday}>{pendingPhoto.weekday}</Text>
            {pendingPhoto.coords ? (
              <Text style={WM.coords}>📍 {pendingPhoto.coords}</Text>
            ) : null}
          </View>
        </View>
        <View style={WM.brand}>
          <Text style={WM.brandText}>{companyName}</Text>
        </View>
      </View>
    );
  };

  return { watermarkRef, pendingPhoto, applyWatermark, WatermarkView };
}

const WM = StyleSheet.create({
  box: {
    position: 'absolute', bottom: 16, left: 12, right: 12,
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 6, padding: 10, alignItems: 'center', gap: 10,
  },
  left:      { justifyContent: 'center' },
  time:      { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  divider:   { width: 1.5, height: 48, backgroundColor: 'rgba(255,255,255,0.4)', marginHorizontal: 4 },
  right:     { flex: 1 },
  date:      { fontSize: 13, fontWeight: '700', color: '#fff' },
  weekday:   { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  coords:    { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  brand:     { position: 'absolute', bottom: 6, right: 12 },
  brandText: { fontSize: 10, fontWeight: '700', color: Colors.accent },
});
