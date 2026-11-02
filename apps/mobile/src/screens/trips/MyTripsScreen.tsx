/**
 * MyTripsScreen — Xem số chuyến + gửi yêu cầu xóa
 *
 * Bộ lọc:
 *   - "Theo tháng": chọn tháng/năm → SectionList nhóm theo ngày
 *   - "Theo ngày":  chọn ngày cụ thể → FlatList
 *
 * Xóa nhiều chuyến:
 *   - Nhấn giữ 1 card → bật chế độ select
 *   - Tick chọn nhiều chuyến
 *   - Nhấn "Gửi yêu cầu xóa" → tạo Request type=trip_delete, chờ admin duyệt
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TouchableHighlight,
  FlatList, SectionList, ActivityIndicator, RefreshControl,
  Alert, Modal, TextInput, ScrollView, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import DatePickerField from '@/components/DatePickerField';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Lấy giờ hiện tại theo timezone VN mà không dùng toLocaleString (crash Hermes) */
function vnNow(): Date {
  // UTC offset VN = +7h
  const utcMs = Date.now() + 7 * 60 * 60 * 1000;
  return new Date(utcMs);
}

/** Date object → YYYY-MM-DD string (VN timezone) */
function toVNDateStr(date: Date): string {
  const utcMs = date.getTime() + 7 * 60 * 60 * 1000;
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const monthLabel = (m: number, y: number) => `Tháng ${m}/${y}`;

type FilterMode = 'month' | 'day';

// ─── component ──────────────────────────────────────────────────────────────

export default function MyTripsScreen() {
  const navigation = useNavigation<any>();

  // tính tháng/năm hiện tại an toàn
  const nowUTC  = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const curMonth = nowUTC.getUTCMonth() + 1;  // 1-12
  const curYear  = nowUTC.getUTCFullYear();

  // ── filter ────────────────────────────────────────────────────────────────
  const [mode, setMode]               = useState<FilterMode>('month');
  const [selMonth, setSelMonth]       = useState(curMonth);
  const [selYear,  setSelYear]        = useState(curYear);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [selDate,  setSelDate]        = useState<Date>(new Date());

  // ── data ──────────────────────────────────────────────────────────────────
  const [trips,      setTrips]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId,   setDriverId]   = useState<string | null>(null);

  // ── select mode ───────────────────────────────────────────────────────────
  const [selectMode,   setSelectMode]   = useState(false);
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());

  // ── delete request modal ──────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason,    setDeleteReason]    = useState('');
  const [submitting,      setSubmitting]      = useState(false);

  // ── resolve driverId ──────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/drivers/profile/me')
      .then(r => setDriverId(r.data.data?._id ?? null))
      .catch(() => {});
  }, []);

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchTrips = useCallback(async () => {
    try {
      const params: Record<string, any> = { limit: 500, sort: '-trip_date' };
      if (driverId) params.driver_id = driverId;

      if (mode === 'month') {
        params.month = selMonth;
        params.year  = selYear;
      } else {
        params.date = toVNDateStr(selDate);
      }

      const res = await api.get('/trips', { params });
      setTrips(res.data.data?.trips ?? []);
    } catch (_) {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [mode, selMonth, selYear, selDate, driverId]);

  useEffect(() => {
    setLoading(true);
    fetchTrips();
    // reset select khi đổi filter
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [fetchTrips]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTrips();
    setRefreshing(false);
  };

  // ── select helpers ────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // ── gửi yêu cầu xóa ──────────────────────────────────────────────────────
  const submitDeleteRequest = async () => {
    if (selectedIds.size === 0) return;
    if (!deleteReason.trim()) {
      Alert.alert('Thiếu lý do', 'Vui lòng nhập lý do xóa chuyến.');
      return;
    }
    setSubmitting(true);
    try {
      const tripIds = Array.from(selectedIds);
      const selectedTrips = trips.filter(t => tripIds.includes(t._id));
      const tripSummary = selectedTrips
        .map(t => `#${t.trip_number ?? '?'} ${t.pickup_location} → ${t.drop_location}`)
        .join(', ');

      await api.post('/requests', {
        type:    'trip_delete',
        title:   `Yêu cầu xóa ${tripIds.length} chuyến`,
        payload: {
          trip_ids:   tripIds,
          trip_count: tripIds.length,
          trip_summary: tripSummary,
          reason:     deleteReason.trim(),
          filter_mode: mode,
          filter_month: mode === 'month' ? selMonth : undefined,
          filter_year:  mode === 'month' ? selYear  : undefined,
          filter_date:  mode === 'day'   ? toVNDateStr(selDate) : undefined,
        },
      });

      setShowDeleteModal(false);
      setDeleteReason('');
      exitSelectMode();
      Alert.alert(
        '✅ Đã gửi yêu cầu',
        'Yêu cầu xóa chuyến đã gửi về admin. Chuyến sẽ bị xóa sau khi được duyệt.',
        [{ text: 'OK' }]
      );
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message ?? 'Không gửi được yêu cầu. Thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── derived ───────────────────────────────────────────────────────────────
  const overtimeCount = trips.filter(t => t.is_overtime).length;

  const sections = (() => {
    if (mode !== 'month') return [];
    const map: Record<string, any[]> = {};
    trips.forEach(t => {
      // Tính ngày VN từ UTC
      const utcMs = new Date(t.trip_date).getTime() + 7 * 60 * 60 * 1000;
      const d = new Date(utcMs);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, data]) => {
        const parts = dateKey.split('-').map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        const label = `${['CN','T2','T3','T4','T5','T6','T7'][d.getDay()]} ${format(d, 'dd/MM/yyyy', { locale: vi })}`;
        return { title: label, count: data.length, data };
      });
  })();

  // ─── sub-renders ──────────────────────────────────────────────────────────

  const SummaryCard = (
    <View style={S.summaryCard}>
      <View style={S.summaryItem}>
        <Text style={S.summaryBig}>{trips.length}</Text>
        <Text style={S.summaryLbl}>Tổng chuyến</Text>
      </View>
      <View style={S.summaryDiv} />
      <View style={S.summaryItem}>
        <Text style={[S.summaryBig, overtimeCount > 0 && { color: '#e67e22' }]}>
          {overtimeCount}
        </Text>
        <Text style={S.summaryLbl}>🔥 Tăng ca</Text>
      </View>
      <View style={S.summaryDiv} />
      <View style={S.summaryItem}>
        <Text style={[S.summaryBig, { color: Colors.primary }]}>
          {mode === 'month' ? sections.length : (trips.length > 0 ? 1 : 0)}
        </Text>
        <Text style={S.summaryLbl}>Ngày có chuyến</Text>
      </View>
    </View>
  );

  const EmptyView = (
    <View style={S.empty}>
      <Text style={S.emptyIcon}>🚚</Text>
      <Text style={S.emptyText}>Không có chuyến nào</Text>
    </View>
  );

  const renderTrip = (t: any, dayTrips?: any[]) => {
    const isOT      = t.is_overtime === true;
    const isSelected = selectedIds.has(t._id);

    // Giờ VN
    const utcMs = new Date(t.trip_date).getTime() + 7 * 60 * 60 * 1000;
    const dVN   = new Date(utcMs);
    const timeStr = `${String(dVN.getUTCHours()).padStart(2,'0')}:${String(dVN.getUTCMinutes()).padStart(2,'0')}`;

    return (
      <TouchableHighlight
        key={t._id}
        underlayColor={Colors.gray100}
        style={[S.card, isOT && S.cardOT, isSelected && S.cardSelected]}
        onPress={() => {
          if (selectMode) {
            toggleSelect(t._id);
          } else {
            navigation.navigate('TripDetail', { tripId: t._id });
          }
        }}
        onLongPress={() => {
          if (!selectMode) {
            setSelectMode(true);
            setSelectedIds(new Set([t._id]));
          }
        }}
      >
        <>
          {/* Checkbox */}
          {selectMode && (
            <View style={[S.checkbox, isSelected && S.checkboxActive]}>
              {isSelected && <Text style={S.checkmark}>✓</Text>}
            </View>
          )}

          {/* Số thứ tự */}
          {!selectMode && (
            <View style={[S.numBadge, isOT && { backgroundColor: '#e67e22' }]}>
              <Text style={S.numText}>{t.trip_number ?? '—'}</Text>
            </View>
          )}

          <View style={{ flex: 1, gap: 2 }}>
            <Text style={S.route} numberOfLines={1}>
              {t.pickup_location} → {t.drop_location}
            </Text>
            <Text style={S.material} numberOfLines={1}>
              {t.material_name}{t.quantity ? ` · ${t.quantity} ${t.unit ?? ''}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 1 }}>
              <Text style={S.time}>{timeStr}</Text>
              {isOT && <Text style={S.otBadge}>🔥 Tăng ca</Text>}
            </View>
          </View>

          {!selectMode && <Text style={S.arrow}>›</Text>}
        </>
      </TouchableHighlight>
    );
  };

  // ─── Month picker ─────────────────────────────────────────────────────────
  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
  const YEARS  = Array.from({ length: 5 }, (_, i) => curYear - i);

  const MonthPickerModal = (
    <Modal visible={showMonthPicker} transparent animationType="fade">
      <TouchableOpacity
        style={S.overlay}
        activeOpacity={1}
        onPress={() => setShowMonthPicker(false)}
      >
        <TouchableOpacity activeOpacity={1} style={S.pickerBox}>
          <Text style={S.pickerTitle}>Chọn tháng / năm</Text>

          {/* Năm */}
          <View style={S.pickerRow}>
            {YEARS.map(y => (
              <TouchableOpacity
                key={String(y)}
                style={[S.pickerItem, selYear === y && S.pickerItemActive]}
                onPress={() => setSelYear(y)}
              >
                <Text style={[S.pickerItemTxt, selYear === y && S.pickerItemTxtActive]}>
                  {y}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tháng */}
          <View style={[S.pickerRow, { flexWrap: 'wrap' }]}>
            {MONTHS.map(m => (
              <TouchableOpacity
                key={String(m)}
                style={[S.pickerItem, selMonth === m && S.pickerItemActive, { minWidth: 52 }]}
                onPress={() => setSelMonth(m)}
              >
                <Text style={[S.pickerItemTxt, selMonth === m && S.pickerItemTxtActive]}>
                  T{m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={S.pickerConfirm}
            onPress={() => setShowMonthPicker(false)}
          >
            <Text style={S.pickerConfirmTxt}>Xác nhận</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  // ─── Delete request modal ─────────────────────────────────────────────────
  const DeleteModal = (
    <Modal visible={showDeleteModal} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={S.overlay}>
        <View style={S.deleteBox}>
          <Text style={S.deleteTitle}>Gửi yêu cầu xóa chuyến</Text>
          <Text style={S.deleteSub}>
            Bạn chọn {selectedIds.size} chuyến. Admin sẽ xem xét và duyệt xóa.
          </Text>

          <Text style={S.deleteLabel}>
            Lý do xóa <Text style={{ color: Colors.error }}>*</Text>
          </Text>
          <TextInput
            style={S.deleteInput}
            placeholder="VD: Nhập sai lộ trình, trùng chuyến..."
            placeholderTextColor={Colors.gray400}
            multiline
            numberOfLines={3}
            value={deleteReason}
            onChangeText={setDeleteReason}
          />

          <View style={S.deleteActions}>
            <TouchableOpacity
              style={S.deleteCancelBtn}
              onPress={() => { setShowDeleteModal(false); setDeleteReason(''); }}
              disabled={submitting}
            >
              <Text style={S.deleteCancelTxt}>Huỷ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.deleteConfirmBtn, submitting && { opacity: 0.6 }]}
              onPress={submitDeleteRequest}
              disabled={submitting}
            >
              <Text style={S.deleteConfirmTxt}>
                {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  // ─── header label ─────────────────────────────────────────────────────────
  const headerSub = mode === 'month'
    ? monthLabel(selMonth, selYear)
    : (() => {
        try { return format(selDate, 'EEEE, dd/MM/yyyy', { locale: vi }); }
        catch { return toVNDateStr(selDate); }
      })();

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        {selectMode ? (
          /* Select mode header */
          <>
            <TouchableOpacity onPress={exitSelectMode} style={S.backBtn}>
              <Text style={S.backIcon}>✕</Text>
            </TouchableOpacity>
            <Text style={[S.headerTitle, { flex: 1 }]}>
              Đã chọn {selectedIds.size} chuyến
            </Text>
            <TouchableOpacity
              style={[S.selectAllBtn, selectedIds.size === trips.length && { backgroundColor: 'rgba(255,255,255,0.3)' }]}
              onPress={() => {
                if (selectedIds.size === trips.length) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(trips.map(t => t._id)));
                }
              }}
            >
              <Text style={S.selectAllTxt}>
                {selectedIds.size === trips.length ? 'Bỏ hết' : 'Chọn hết'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Normal header */
          <>
            <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
              <Text style={S.backIcon}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={S.headerTitle}>Số chuyến của tôi</Text>
              <Text style={S.headerSub}>{headerSub}</Text>
            </View>
            <View style={{ width: 40 }} />
          </>
        )}
      </View>

      {/* Bộ lọc — ẩn khi select mode */}
      {!selectMode && (
        <View style={S.filterBar}>
          <View style={S.modeToggle}>
            <TouchableOpacity
              style={[S.modeBtn, mode === 'month' && S.modeBtnActive]}
              onPress={() => setMode('month')}
            >
              <Text style={[S.modeTxt, mode === 'month' && S.modeTxtActive]}>Theo tháng</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.modeBtn, mode === 'day' && S.modeBtnActive]}
              onPress={() => setMode('day')}
            >
              <Text style={[S.modeTxt, mode === 'day' && S.modeTxtActive]}>Theo ngày</Text>
            </TouchableOpacity>
          </View>

          {mode === 'month' ? (
            <TouchableOpacity style={S.monthSelector} onPress={() => setShowMonthPicker(true)}>
              <Text style={S.monthSelectorTxt}>📅 {monthLabel(selMonth, selYear)}</Text>
              <Text style={S.monthSelectorArrow}>▾</Text>
            </TouchableOpacity>
          ) : (
            <View style={S.datePickerWrap}>
              <DatePickerField
                label="Chọn ngày"
                value={selDate}
                onChange={(d) => setSelDate(d)}
              />
            </View>
          )}
        </View>
      )}

      {/* Hint chọn khi chưa select */}
      {!selectMode && trips.length > 0 && (
        <View style={S.hintBar}>
          <Text style={S.hintTxt}>💡 Nhấn giữ 1 chuyến để chọn nhiều và gửi yêu cầu xóa</Text>
        </View>
      )}

      {/* Danh sách */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : mode === 'month' ? (
        <SectionList
          sections={sections}
          keyExtractor={t => t._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={S.listContent}
          ListHeaderComponent={SummaryCard}
          ListEmptyComponent={EmptyView}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={S.dayHeader}>
              <Text style={S.dayLabel}>{section.title}</Text>
              <View style={S.dayBadge}>
                <Text style={S.dayBadgeTxt}>{section.count} chuyến</Text>
              </View>
            </View>
          )}
          renderItem={({ item }) => renderTrip(item)}
        />
      ) : (
        <FlatList
          data={trips}
          keyExtractor={t => t._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={S.listContent}
          ListHeaderComponent={SummaryCard}
          ListEmptyComponent={EmptyView}
          renderItem={({ item }) => renderTrip(item)}
        />
      )}

      {/* Bottom bar khi select mode */}
      {selectMode && (
        <View style={S.bottomBar}>
          <TouchableOpacity
            style={[S.deleteBtn, selectedIds.size === 0 && { opacity: 0.4 }]}
            disabled={selectedIds.size === 0}
            onPress={() => setShowDeleteModal(true)}
          >
            <Text style={S.deleteBtnTxt}>
              🗑 Gửi yêu cầu xóa ({selectedIds.size})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {MonthPickerModal}
      {DeleteModal}
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header:       { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14, gap: 8 },
  backBtn:      { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backIcon:     { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: Colors.white },
  headerSub:    { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },

  selectAllBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  selectAllTxt: { fontSize: 13, color: Colors.white, fontWeight: '600' },

  filterBar:      { backgroundColor: Colors.white, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
  modeToggle:     { flexDirection: 'row', backgroundColor: Colors.gray100, borderRadius: 10, padding: 3, gap: 3 },
  modeBtn:        { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  modeBtnActive:  { backgroundColor: Colors.primary },
  modeTxt:        { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  modeTxtActive:  { color: Colors.white },

  monthSelector:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  monthSelectorTxt:   { fontSize: 14, fontWeight: '600', color: Colors.gray800 },
  monthSelectorArrow: { fontSize: 13, color: Colors.gray500 },
  datePickerWrap:     { paddingBottom: 2 },

  hintBar:  { backgroundColor: '#fffbea', paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f0e68c' },
  hintTxt:  { fontSize: 11, color: '#856404' },

  listContent: { padding: 14, paddingBottom: 100 },

  summaryCard:  { backgroundColor: Colors.white, borderRadius: 14, padding: 16, flexDirection: 'row', borderWidth: 1, borderColor: Colors.border, marginBottom: 14 },
  summaryItem:  { flex: 1, alignItems: 'center' },
  summaryDiv:   { width: 1, backgroundColor: Colors.gray100 },
  summaryBig:   { fontSize: 22, fontWeight: '800', color: Colors.primary },
  summaryLbl:   { fontSize: 11, color: Colors.gray500, fontWeight: '600', marginTop: 2 },

  dayHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, marginTop: 10 },
  dayLabel:     { fontSize: 13, fontWeight: '700', color: Colors.gray700 },
  dayBadge:     { backgroundColor: Colors.primary + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  dayBadgeTxt:  { fontSize: 11, color: Colors.primary, fontWeight: '600' },

  card:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  cardOT:       { borderColor: '#e67e2250', backgroundColor: '#fffbf0' },
  cardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  numBadge:     { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  numText:      { fontSize: 11, fontWeight: '800', color: Colors.white },

  checkbox:       { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: Colors.gray300, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkmark:      { fontSize: 13, color: Colors.white, fontWeight: '800' },

  route:    { fontSize: 13, fontWeight: '600', color: Colors.gray900 },
  material: { fontSize: 11, color: Colors.gray500 },
  time:     { fontSize: 11, color: Colors.gray400 },
  otBadge:  { fontSize: 10, color: '#e67e22', fontWeight: '700' },
  arrow:    { fontSize: 20, color: Colors.gray300 },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: Colors.gray500, textAlign: 'center' },

  // bottom bar
  bottomBar:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 28, borderTopWidth: 1, borderTopColor: Colors.border },
  deleteBtn:    { backgroundColor: '#e74c3c', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  deleteBtnTxt: { fontSize: 15, fontWeight: '700', color: Colors.white },

  // month picker modal
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  pickerBox:       { backgroundColor: Colors.white, borderRadius: 18, padding: 20, width: '88%', gap: 14 },
  pickerTitle:     { fontSize: 16, fontWeight: '700', color: Colors.gray900, textAlign: 'center' },
  pickerRow:       { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  pickerItem:      { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  pickerItemActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pickerItemTxt:       { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  pickerItemTxtActive: { color: Colors.white },
  pickerConfirm:       { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  pickerConfirmTxt:    { fontSize: 15, fontWeight: '700', color: Colors.white },

  // delete request modal
  deleteBox:        { backgroundColor: Colors.white, borderRadius: 18, padding: 20, width: '90%', gap: 12 },
  deleteTitle:      { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  deleteSub:        { fontSize: 13, color: Colors.gray500 },
  deleteLabel:      { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  deleteInput:      { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, fontSize: 13, color: Colors.gray900, minHeight: 80, textAlignVertical: 'top' },
  deleteActions:    { flexDirection: 'row', gap: 10 },
  deleteCancelBtn:  { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  deleteCancelTxt:  { fontSize: 14, fontWeight: '600', color: Colors.gray700 },
  deleteConfirmBtn: { flex: 2, backgroundColor: '#e74c3c', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  deleteConfirmTxt: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
