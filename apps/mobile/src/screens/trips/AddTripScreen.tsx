import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  KeyboardAvoidingView,
  Modal,
  StatusBar,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { captureRef } from 'react-native-view-shot';
import { Colors } from '@/constants/colors';
import { useCompanyConfig } from '@/hooks/useCompanyConfig';
import api from '@/lib/api';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import DatePickerField from '@/components/DatePickerField';

const OFFLINE_TRIPS_KEY = '@offline_trips';

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
            style={{ width: SCREEN_W, height: SCREEN_W * 1.4 }}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const LB = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  closeBtn:  { position: 'absolute', top: 48, right: 20, zIndex: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  closeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});

interface FormData {
  trip_date: Date;
  material_name: string;
  quantity: string;
  trip_count: string;   // số lượng chuyến (mặc định 1)
  unit: string;
  pickup_location: string;
  drop_location: string;
  note: string;
  gps_latitude: number | null;
  gps_longitude: number | null;
  delivery_receipt: string | null;
}

interface Material {
  _id: string;
  material_name: string;
}

// Chuyển "12,5" hoặc "12.5" về số float
const parseQuantity = (v: string): number => {
  const normalized = v.replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
};

export default function AddTripScreen() {
  const navigation = useNavigation();
  const { companyName } = useCompanyConfig();

  const [form, setForm] = useState<FormData>({
    trip_date: new Date(),          // mặc định = hôm nay
    material_name: '',
    quantity: '',
    trip_count: '1',                 // mặc định 1 chuyến
    unit: 'tấn',
    pickup_location: '',
    drop_location: '',
    note: '',
    gps_latitude: null,
    gps_longitude: null,
    delivery_receipt: null,
  });

  const [materials, setMaterials] = useState<Material[]>([]);
  const [showMaterials, setShowMaterials] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  // Watermark: lưu ảnh gốc + metadata để render vào hidden view rồi capture
  const [pendingPhoto, setPendingPhoto] = useState<{
    uri: string;
    time: string;
    date: string;
    weekday: string;
    coords: string;
  } | null>(null);
  const watermarkRef = useRef<View>(null);

  const applyWatermark = async (rawUri: string) => {
    const now = new Date();

    // Luôn fetch GPS mới nhất tại thời điểm chụp (tránh stale closure)
    let addressText = '';
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[GPS] permission status:', status);
      if (status === 'granted') {
        let pos: Location.LocationObject | null = null;
        try {
          pos = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Lowest,
              maximumAge: 60000,
            }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
          ]) as Location.LocationObject;
          console.log('[GPS] got position:', pos.coords.latitude, pos.coords.longitude);
        } catch (e) {
          console.log('[GPS] getCurrentPosition failed, trying lastKnown:', e);
          pos = await Location.getLastKnownPositionAsync();
          console.log('[GPS] lastKnown:', pos?.coords.latitude, pos?.coords.longitude);
        }

        if (pos) {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          try {
            const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
            console.log('[GPS] reverseGeocode results:', JSON.stringify(results[0]));
            if (results.length > 0) {
              const r = results[0];
              const parts = [
                r.street && r.streetNumber ? `${r.streetNumber} ${r.street}` : r.street,
                r.district ?? r.subregion,
                r.city ?? r.region,
              ].filter(Boolean);
              console.log('[GPS] address parts:', parts);
              addressText = parts.length > 0
                ? parts.join(', ')
                : `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            } else {
              addressText = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            }
          } catch (e) {
            console.log('[GPS] reverseGeocode error:', e);
            addressText = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
          }
          setForm(f => ({ ...f, gps_latitude: lat, gps_longitude: lon }));
        } else {
          console.log('[GPS] no position available');
          addressText = 'Không xác định vị trí';
        }
      } else {
        // Quyền bị từ chối — hướng dẫn user vào Settings
        Alert.alert(
          'Cần quyền vị trí',
          'Vui lòng cho phép truy cập vị trí trong Cài đặt để hiển thị địa chỉ trên ảnh.',
          [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
          ]
        );
        addressText = 'Chưa cấp quyền vị trí';
      }
    } catch (_) {
      addressText = 'Lỗi lấy vị trí';
    }

    setPendingPhoto({
      uri:     rawUri,
      time:    format(now, 'HH:mm'),
      date:    format(now, 'dd/MM/yyyy'),
      weekday: format(now, 'EEEE', { locale: vi }),
      coords:  addressText,
    });
  };

  useEffect(() => {
    fetchMaterials();
    getCurrentLocation();
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
      if (state.isConnected) syncOfflineTrips();
    });
    return () => unsub();
  }, []);

  // Khi pendingPhoto được render vào hidden view → capture thành ảnh có watermark
  useEffect(() => {
    if (!pendingPhoto || !watermarkRef.current) return;
    const timer = setTimeout(async () => {
      try {
        const composited = await captureRef(watermarkRef, { format: 'jpg', quality: 0.88 });
        setForm(f => ({ ...f, delivery_receipt: composited }));
        setErrors(e => ({ ...e, delivery_receipt: '' }));
      } catch (err) {
        // fallback: dùng ảnh gốc nếu watermark fail
        setForm(f => ({ ...f, delivery_receipt: pendingPhoto.uri }));
        setErrors(e => ({ ...e, delivery_receipt: '' }));
      } finally {
        setPendingPhoto(null);
      }
    }, 200); // đợi 1 frame render xong
    return () => clearTimeout(timer);
  }, [pendingPhoto]);

  const fetchMaterials = async () => {
    try {
      const res = await api.get('/materials', { params: { status: 'active', limit: 50 } });
      setMaterials(res.data.data?.materials || []);
    } catch (_) {}
  };

  const getCurrentLocation = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
        maximumAge: 60000,
      });
      setForm(f => ({
        ...f,
        gps_latitude:  loc.coords.latitude,
        gps_longitude: loc.coords.longitude,
      }));
    } catch (_) {
    } finally {
      setGpsLoading(false);
    }
  };

  const pickImage = async () => {
    Alert.alert('Ảnh biên nhận', '', [
      {
        text: 'Chụp ảnh',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert(
              'Cần quyền camera',
              'Vui lòng cấp quyền camera trong Cài đặt để chụp ảnh biên nhận.',
              [
                { text: 'Hủy', style: 'cancel' },
                { text: 'Mở Cài đặt', onPress: () => { const { Linking } = require('react-native'); Linking.openSettings(); } },
              ]
            );
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsEditing: false,
          });
          if (!result.canceled && result.assets?.[0]?.uri) {
            await applyWatermark(result.assets[0].uri);
          }
        },
      },
      {
        text: 'Chọn từ thư viện',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert(
              'Cần quyền thư viện ảnh',
              'Vui lòng cấp quyền truy cập thư viện ảnh trong Cài đặt.',
              [
                { text: 'Hủy', style: 'cancel' },
                { text: 'Mở Cài đặt', onPress: () => { const { Linking } = require('react-native'); Linking.openSettings(); } },
              ]
            );
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsEditing: false,
          });
          if (!result.canceled && result.assets?.[0]?.uri) {
            await applyWatermark(result.assets[0].uri);
          }
        },
      },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};

    // Không cho phép tạo chuyến ngày tương lai
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(form.trip_date);
    selected.setHours(0, 0, 0, 0);
    if (selected > today) {
      e.trip_date = 'Ngày chưa đến — chỉ được tạo chuyến hôm nay hoặc ngày trước';
    }

    if (!form.material_name.trim()) e.material_name = 'Vui lòng nhập tên vật liệu';
    if (!form.quantity.trim() || parseQuantity(form.quantity) <= 0)
      e.quantity = 'Vui lòng nhập số lượng đá';
    if (!form.pickup_location.trim()) e.pickup_location = 'Vui lòng nhập nơi lấy';
    if (!form.drop_location.trim())   e.drop_location   = 'Vui lòng nhập nơi đổ';
    if (!form.delivery_receipt)       e.delivery_receipt = 'Vui lòng chụp ảnh biên nhận';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const uploadReceipt = async (uri: string): Promise<string | null> => {
    try {
      const fd = new FormData();
      fd.append('receipt', {
        uri,
        type: 'image/jpeg',
        name: `receipt_${Date.now()}.jpg`,
      } as any);
      const res = await api.post('/uploads/receipt', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      // Trả về path tương đối — getImageUrl sẽ build full URL khi hiển thị
      return res.data.data?.url ?? null;
    } catch (err: any) {
      console.warn('Upload failed, saving URI locally:', err?.message);
      return null;
    }
  };

  const syncOfflineTrips = async () => {
    try {
      const stored = await AsyncStorage.getItem(OFFLINE_TRIPS_KEY);
      if (!stored) return;
      const trips: any[] = JSON.parse(stored);
      const failed: any[] = [];
      for (const trip of trips) {
        try {
          await api.post('/trips', { ...trip, synced_from_offline: true });
        } catch (_) {
          failed.push(trip);
        }
      }
      await (failed.length === 0
        ? AsyncStorage.removeItem(OFFLINE_TRIPS_KEY)
        : AsyncStorage.setItem(OFFLINE_TRIPS_KEY, JSON.stringify(failed)));
    } catch (_) {}
  };

  const saveOffline = async (tripData: any) => {
    const stored = await AsyncStorage.getItem(OFFLINE_TRIPS_KEY);
    const trips: any[] = stored ? JSON.parse(stored) : [];
    trips.push({ ...tripData, offline_id: Date.now() });
    await AsyncStorage.setItem(OFFLINE_TRIPS_KEY, JSON.stringify(trips));
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      // Kết hợp ngày từ DatePicker với giờ thực tế hiện tại
      const selectedDate = form.trip_date;
      const now = new Date();
      const tripDateTime = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
      );

      const tripCount = Math.max(1, parseInt(form.trip_count || '1', 10) || 1);

      const basePayload: any = {
        trip_date:       tripDateTime.toISOString(),
        material_name:   form.material_name,
        quantity:        parseQuantity(form.quantity),
        unit:            form.unit,
        pickup_location: form.pickup_location,
        drop_location:   form.drop_location,
        income:          0,
        expense:         0,
        note:            form.note,
        gps_latitude:    form.gps_latitude,
        gps_longitude:   form.gps_longitude,
        delivery_receipt: form.delivery_receipt,
      };

      if (!isOnline) {
        // Offline: lưu N chuyến
        for (let i = 0; i < tripCount; i++) {
          await saveOffline({ ...basePayload });
        }
        Alert.alert('Đã lưu offline', `${tripCount} chuyến sẽ được đồng bộ khi có mạng.`, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      // Upload ảnh 1 lần, dùng chung cho tất cả chuyến
      let receiptUrl = basePayload.delivery_receipt;
      if (form.delivery_receipt) {
        receiptUrl = await uploadReceipt(form.delivery_receipt) ?? form.delivery_receipt;
      }

      // Tạo N chuyến tuần tự (để tính đúng STT và tăng ca)
      for (let i = 0; i < tripCount; i++) {
        await api.post('/trips', { ...basePayload, delivery_receipt: receiptUrl });
      }

      const msg = tripCount > 1
        ? `✅ Đã lưu ${tripCount} chuyến xe!`
        : '✅ Đã lưu chuyến xe!';
      Alert.alert('Thành công', msg, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể lưu chuyến. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const setField = (key: keyof FormData, val: string) => {
    setForm(f => ({ ...f, [key]: val }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: '' }));
  };

  // Cho phép nhập cả dấu phẩy và dấu chấm cho số lượng
  const handleQuantityChange = (v: string) => {
    // Chỉ cho phép số, dấu chấm, dấu phẩy
    const filtered = v.replace(/[^0-9.,]/g, '');
    // Không cho nhiều hơn 1 dấu phân cách
    const parts = filtered.split(/[.,]/);
    if (parts.length > 2) return;
    setField('quantity', filtered);
  };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {!isOnline && (
        <View style={S.offlineBanner}>
          <Text style={S.offlineText}>⚠️ Không có kết nối — Sẽ lưu offline</Text>
        </View>
      )}

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Nhật trình xe</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={S.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Ngày — hiện sẵn hôm nay, user có thể đổi ── */}
          <DatePickerField
            label="Ngày"
            value={form.trip_date}
            onChange={d => setForm(f => ({ ...f, trip_date: d }))}
            required
            error={errors.trip_date}
          />

          {/* ── Tên vật liệu ── */}
          <Field label="Tên vật liệu *" error={errors.material_name}>
            <MaterialPicker
              materials={materials}
              value={form.material_name}
              onChange={v => setField('material_name', v)}
            />
          </Field>

          {/* ── Số lượng: + Đơn vị ── */}
          <Field label="Số lượng: *" error={errors.quantity}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Input số lượng */}
              <View style={[S.input, S.row, { paddingHorizontal: 0, flex: 2 }]}>
                <TextInput
                  style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: Colors.gray900, textAlign: 'right' }}
                  value={form.quantity}
                  onChangeText={handleQuantityChange}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.gray400}
                />
              </View>

              {/* Dropdown đơn vị */}
              <View style={{ flex: 1 }}>
                <UnitPicker
                  value={form.unit}
                  onChange={v => setField('unit', v)}
                />
              </View>
            </View>
            <Text style={S.hint}>VD: 12,5 tấn hoặc 8 m3</Text>
          </Field>

          {/* ── Số lượng chuyến ── */}
          <Field label="Số lượng chuyến" error={undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity
                style={S.countBtn}
                onPress={() => {
                  const n = Math.max(1, parseInt(form.trip_count || '1', 10) - 1);
                  setField('trip_count', String(n));
                }}
                activeOpacity={0.7}
              >
                <Text style={S.countBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={S.countInput}
                value={form.trip_count}
                onChangeText={v => {
                  const n = v.replace(/[^0-9]/g, '');
                  setField('trip_count', n || '1');
                }}
                keyboardType="number-pad"
                textAlign="center"
              />
              <TouchableOpacity
                style={S.countBtn}
                onPress={() => {
                  const n = Math.min(20, parseInt(form.trip_count || '1', 10) + 1);
                  setField('trip_count', String(n));
                }}
                activeOpacity={0.7}
              >
                <Text style={S.countBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </Field>

          {/* ── Nơi lấy ── */}
          <Field label="Nơi lấy *" error={errors.pickup_location}>
            <TextInput
              style={S.input}
              value={form.pickup_location}
              onChangeText={v => setField('pickup_location', v)}
              placeholder="Địa điểm lấy hàng"
              placeholderTextColor={Colors.gray400}
            />
          </Field>

          {/* ── Nơi đổ ── */}
          <Field label="Nơi đổ *" error={errors.drop_location}>
            <TextInput
              style={S.input}
              value={form.drop_location}
              onChangeText={v => setField('drop_location', v)}
              placeholder="Địa điểm đổ hàng"
              placeholderTextColor={Colors.gray400}
            />
          </Field>

          {/* ── Ghi chú ── */}
          <Field label="Ghi chú">
            <TextInput
              style={[S.input, { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }]}
              value={form.note}
              onChangeText={v => setField('note', v)}
              placeholder="Ghi chú thêm..."
              placeholderTextColor={Colors.gray400}
              multiline
              numberOfLines={3}
            />
          </Field>

          {/* ── Ảnh biên nhận ── */}
          <View style={S.fieldGroup}>
            <Text style={S.label}>Ảnh biên nhận <Text style={{ color: Colors.error }}>*</Text></Text>

            {form.delivery_receipt ? (
              <View style={{ gap: 8 }}>
                <TouchableOpacity onPress={() => setLightboxUri(form.delivery_receipt)} activeOpacity={0.85}>
                  <Image
                    source={{ uri: form.delivery_receipt }}
                    style={{ width: '100%', height: 200, borderRadius: 12 }}
                    resizeMode="cover"
                  />
                  <View style={S.tapHint}>
                    <Text style={S.tapHintText}>🔍 Nhấn để xem to</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={S.retakeBtn} onPress={pickImage}>
                  <Text style={S.retakeBtnText}>📷 Chụp lại</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[S.uploadBox, errors.delivery_receipt ? S.uploadBoxErr : null]}
                onPress={pickImage}
              >
                <Text style={{ fontSize: 36 }}>📷</Text>
                <Text style={S.uploadLabel}>Chụp ảnh biên nhận</Text>
                <Text style={S.uploadSub}>Bắt buộc để lưu chuyến</Text>
              </TouchableOpacity>
            )}

            {errors.delivery_receipt
              ? <Text style={S.errorText}>{errors.delivery_receipt}</Text>
              : null
            }
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Lightbox */}
      {lightboxUri && (
        <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
      )}

      {/* Hidden watermark compositor — off-screen, dùng để render rồi capture */}
      {pendingPhoto && (
        <View
          ref={watermarkRef}
          collapsable={false}
          style={{
            position: 'absolute',
            top: -9999,
            left: 0,
            width: 360,
            height: 480,
          }}
        >
          <Image
            source={{ uri: pendingPhoto.uri }}
            style={{ width: 360, height: 480 }}
            resizeMode="cover"
          />
          {/* Watermark box — góc dưới trái giống Timemark */}
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
          {/* Brand label */}
          <View style={WM.brand}>
            <Text style={WM.brandText}>{companyName}</Text>
          </View>
        </View>
      )}

      {/* Bottom bar */}
      <View style={S.bottomBar}>
        <TouchableOpacity style={S.cancelBtn} onPress={() => navigation.goBack()} disabled={loading}>
          <Text style={S.cancelText}>Hủy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.saveBtn, (!form.delivery_receipt || loading) && S.saveBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading || !form.delivery_receipt}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={Colors.white} size="small" />
            : <><Text style={{ fontSize: 16 }}>🚀</Text><Text style={S.saveText}> Lưu {parseInt(form.trip_count || '1', 10) > 1 ? `${form.trip_count} chuyến` : 'chuyến'}</Text></>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const hasRequired = label.endsWith(' *') || label.endsWith('*');
  const cleanLabel  = label.replace(/\s*\*$/, '');
  return (
    <View style={S.fieldGroup}>
      <Text style={S.label}>
        {cleanLabel}{hasRequired && <Text style={{ color: Colors.error }}> *</Text>}
      </Text>
      {children}
      {error ? <Text style={S.errorText}>{error}</Text> : null}
    </View>
  );
}

const S = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: Colors.white },
  offlineBanner: { backgroundColor: '#f59e0b', paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center' },
  offlineText:   { color: Colors.white, fontWeight: '600', fontSize: 13 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56, backgroundColor: Colors.primary },
  backBtn:     { width: 36, height: 36, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.white, textAlign: 'center' },

  content:    { padding: 16, paddingBottom: 32 },
  fieldGroup: { marginBottom: 18 },
  label:      { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  hint:       { fontSize: 11, color: Colors.gray400, marginTop: 4 },
  errorText:  { color: Colors.error, fontSize: 12, marginTop: 4 },

  input: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.gray900, backgroundColor: Colors.white,
  },
  row:         { flexDirection: 'row', alignItems: 'center' },
  inputText:   { flex: 1, fontSize: 15, color: Colors.gray900 },
  placeholder: { flex: 1, fontSize: 15, color: Colors.gray400 },
  dropArrow:   { fontSize: 14, color: Colors.gray500, paddingRight: 4 },
  unit:        { paddingRight: 14, fontSize: 13, color: Colors.gray500 },

  dropdown: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, backgroundColor: Colors.white,
    marginTop: 4, maxHeight: 200, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  dropItem:     { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  dropItemText: { fontSize: 15, color: Colors.gray900 },

  locBtn: { display: 'none' } as any,
  gpsBadge: { display: 'none' } as any,
  gpsText:  {} as any,

  uploadBox: {
    borderWidth: 2, borderColor: Colors.primary, borderStyle: 'dashed', borderRadius: 12,
    backgroundColor: 'rgba(22,55,151,0.03)', height: 140,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  uploadBoxErr: { borderColor: Colors.error },
  uploadLabel:  { fontSize: 14, fontWeight: '600', color: Colors.primary },
  uploadSub:    { fontSize: 12, color: Colors.gray500 },

  retakeBtn:     { backgroundColor: Colors.gray100, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  retakeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.gray700 },
  tapHint:       { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.35)', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, paddingVertical: 6, alignItems: 'center' },
  tapHintText:   { color: '#fff', fontSize: 12, fontWeight: '600' },

  bottomBar:  { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white },
  cancelBtn:  { flex: 1, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.gray300, justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.gray700 },
  saveBtn:    { flex: 2, height: 52, borderRadius: 12, backgroundColor: Colors.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  saveBtnDisabled: { opacity: 0.4 },
  saveText:   { fontSize: 15, fontWeight: '700', color: Colors.white },

  // Trip count picker
  countBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  countBtnText: { fontSize: 22, fontWeight: '700', color: Colors.white, lineHeight: 26 },
  countInput:   { width: 56, height: 40, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 10, fontSize: 18, fontWeight: '700', color: Colors.primary, textAlign: 'center' },

  // UnitPicker
  unitPickerBtn: {
    borderWidth: 1, borderColor: Colors.gray300, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 12,
    backgroundColor: Colors.white, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    minHeight: 48,
  },
  unitPickerBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '08' },
  unitPickerText:      { fontSize: 15, fontWeight: '700', color: Colors.primary },
  unitDropdown: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10,
    backgroundColor: Colors.white, marginTop: 4, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  unitOption: {
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  unitOptionActive: { backgroundColor: Colors.primary + '10' },
  unitOptionText:   { fontSize: 15, color: Colors.gray800 },
  unitOptionTextActive: { color: Colors.primary, fontWeight: '700' },
  unitCustomInput: {
    borderWidth: 1, borderColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: Colors.gray900, marginTop: 6,
    backgroundColor: Colors.white,
  },
  dropItemSelected: { backgroundColor: Colors.primary + '10' },
  dropItemTextSelected: { color: Colors.primary, fontWeight: '700' },
});

/* ── Watermark styles ── */
const WM = StyleSheet.create({
  box: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    gap: 10,
  },
  left:    { justifyContent: 'center' },
  time:    { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  divider: { width: 1.5, height: 48, backgroundColor: 'rgba(255,255,255,0.4)', marginHorizontal: 4 },
  right:   { flex: 1 },
  date:    { fontSize: 13, fontWeight: '700', color: '#fff' },
  weekday: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  coords:  { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  brand:   { position: 'absolute', bottom: 6, right: 12 },
  brandText:{ fontSize: 10, fontWeight: '700', color: Colors.accent },
});

/* ── MaterialPicker component ── */
function MaterialPicker({
  materials,
  value,
  onChange,
}: {
  materials: Material[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');

  // Nếu value không nằm trong danh mục → đang ở custom mode
  const isCustomValue = value && !materials.find(m => m.material_name === value);

  const handleSelect = (name: string) => {
    if (name === '__other__') {
      setCustomMode(true);
      setCustomText('');
      onChange('');
      setOpen(false);
    } else {
      setCustomMode(false);
      onChange(name);
      setOpen(false);
    }
  };

  const displayLabel = customMode || isCustomValue
    ? (value || 'Nhập tên vật liệu...')
    : (value || 'Chọn vật liệu...');

  return (
    <View>
      {/* Nút mở dropdown */}
      <TouchableOpacity
        style={[S.input, S.row]}
        onPress={() => { setOpen(!open); setCustomMode(false); }}
        activeOpacity={0.8}
      >
        <Text style={value ? S.inputText : S.placeholder} numberOfLines={1}>
          {displayLabel}
        </Text>
        <Text style={S.dropArrow}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>

      {/* Dropdown list */}
      {open && (
        <View style={S.dropdown}>
          {materials.map(m => (
            <TouchableOpacity
              key={m._id}
              style={[S.dropItem, value === m.material_name && S.dropItemSelected]}
              onPress={() => handleSelect(m.material_name)}
            >
              <Text style={[S.dropItemText, value === m.material_name && S.dropItemTextSelected]}>
                {m.material_name}
              </Text>
              {value === m.material_name && (
                <Text style={{ color: Colors.primary, fontSize: 14 }}>✓</Text>
              )}
            </TouchableOpacity>
          ))}

          {/* Option "Khác" — nhập tự do */}
          <TouchableOpacity
            style={[S.dropItem, { borderBottomWidth: 0, backgroundColor: Colors.accent + '15' }]}
            onPress={() => handleSelect('__other__')}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.accentDark }}>
              ✏️ Khác (nhập tự do)
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input tự do khi chọn "Khác" hoặc value không có trong danh mục */}
      {(customMode || isCustomValue) && (
        <TextInput
          style={[S.input, { marginTop: 8, borderColor: Colors.primary, borderWidth: 1.5 }]}
          value={customMode ? customText : value}
          onChangeText={v => {
            if (customMode) {
              setCustomText(v);
              onChange(v);
            } else {
              onChange(v);
            }
          }}
          placeholder="Nhập tên vật liệu khác..."
          placeholderTextColor={Colors.gray400}
          autoFocus
        />
      )}
    </View>
  );
}

/* ── UnitPicker component ── */
const UNITS = ['tấn', 'm3', 'khác'];

function UnitPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [customUnit, setCustomUnit] = useState(
    UNITS.includes(value) ? '' : value
  );

  const displayValue = value || 'tấn';
  const isCustom = !UNITS.slice(0, 2).includes(value);

  const handleSelect = (u: string) => {
    if (u === 'khác') {
      onChange('khác');
      setOpen(false);
    } else {
      onChange(u);
      setOpen(false);
    }
  };

  return (
    <View>
      <TouchableOpacity
        style={[S.unitPickerBtn, open && S.unitPickerBtnActive]}
        onPress={() => setOpen(!open)}
        activeOpacity={0.8}
      >
        <Text style={S.unitPickerText}>
          {isCustom && value !== 'khác' ? value : displayValue}
        </Text>
        <Text style={{ fontSize: 12, color: Colors.gray500 }}>
          {open ? '▴' : '▾'}
        </Text>
      </TouchableOpacity>

      {open && (
        <View style={S.unitDropdown}>
          {UNITS.map(u => (
            <TouchableOpacity
              key={u}
              style={[S.unitOption, value === u && S.unitOptionActive]}
              onPress={() => handleSelect(u)}
            >
              <Text style={[S.unitOptionText, value === u && S.unitOptionTextActive]}>
                {u === 'khác' ? '✏️ Khác...' : u}
              </Text>
              {value === u && <Text style={{ color: Colors.primary }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input đơn vị tuỳ chỉnh khi chọn "khác" */}
      {(value === 'khác' || isCustom) && (
        <TextInput
          style={S.unitCustomInput}
          value={isCustom && value !== 'khác' ? value : customUnit}
          onChangeText={v => {
            setCustomUnit(v);
            onChange(v.trim());
          }}
          placeholder="Nhập đơn vị (VD: chuyến, bao...)"
          placeholderTextColor={Colors.gray400}
          autoFocus={value === 'khác'}
        />
      )}
    </View>
  );
}
