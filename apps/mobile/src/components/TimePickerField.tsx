/**
 * TimePickerField — drum wheel picker
 * Style chuẩn: nền tối, 2 cột cuộn loop vô hạn, item active to + trắng + đậm,
 * các item khác nhỏ + xám mờ.
 * Dùng cho mọi nơi cần chọn giờ trong app.
 */
import { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  FlatList,
} from 'react-native';
import { Colors } from '@/constants/colors';

interface Props {
  label:     string;
  value:     string;   // "HH:MM"
  onChange:  (time: string) => void;
  required?: boolean;
  error?:    string;
}

/* ── constants ── */
const ITEM_H  = 48;
const VISIBLE = 7;                          // số hàng hiển thị
const PAD     = Math.floor(VISIBLE / 2);    // padding top/bottom = 3 items
const REPEAT  = 100;                        // lặp data để loop vô hạn

const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const makeLooped = (arr: number[]) =>
  Array.from({ length: REPEAT }, () => arr).flat();

/* ── single drum column ── */
function WheelColumn({
  items,
  selected,
  onSelect,
}: {
  items:    number[];
  selected: number;
  onSelect: (v: number) => void;
}) {
  const looped   = makeLooped(items);
  const midBlock = Math.floor(REPEAT / 2);
  const selIdx   = items.indexOf(selected >= 0 ? selected : 0);
  const initIdx  = midBlock * items.length + selIdx;

  const listRef = useRef<FlatList>(null);

  // Chỉ dùng onMomentumScrollEnd — tránh conflict với onScrollEndDrag
  const onScrollDone = useCallback((offsetY: number) => {
    const idx     = Math.round(offsetY / ITEM_H);
    const clamped = Math.max(0, Math.min(idx, looped.length - 1));
    const realIdx = ((clamped % items.length) + items.length) % items.length;
    onSelect(items[realIdx]);
  }, [items, looped, onSelect]);

  return (
    <View style={W.col}>
      {/* highlight ở đúng hàng giữa */}
      <View pointerEvents="none" style={W.highlight} />

      <FlatList
        ref={listRef}
        data={looped}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate={0.985}
        initialScrollIndex={initIdx}
        getItemLayout={(_, index) => ({
          length: ITEM_H, offset: ITEM_H * index, index,
        })}
        onMomentumScrollEnd={e => onScrollDone(e.nativeEvent.contentOffset.y)}
        style={{ height: ITEM_H * VISIBLE }}
        contentContainerStyle={{ paddingVertical: ITEM_H * PAD }}
        renderItem={({ item }) => {
          const realIdx = ((item % items.length) + items.length) % items.length;
          const val     = items[realIdx];
          const active  = val === selected;
          return (
            <View style={W.item}>
              <Text style={[W.text, active && W.textActive]}>
                {String(val).padStart(2, '0')}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

/* ── main component ── */
export default function TimePickerField({
  label, value, onChange, required, error,
}: Props) {
  const [show, setShow] = useState(false);

  const parse = (t: string) => {
    const [h, m] = (t || '').split(':');
    return { h: parseInt(h) || 0, m: parseInt(m) || 0 };
  };

  const [selH, setSelH] = useState(() => parse(value).h);
  const [selM, setSelM] = useState(() => parse(value).m);

  const openPicker = () => {
    const { h, m } = parse(value);
    setSelH(h); setSelM(m);
    setShow(true);
  };

  const handleConfirm = () => {
    onChange(`${String(selH).padStart(2, '0')}:${String(selM).padStart(2, '0')}`);
    setShow(false);
  };

  const displayValue = value || '--:--';

  return (
    <View style={S.wrapper}>
      <Text style={S.label}>
        {label}{required && <Text style={S.required}> *</Text>}
      </Text>

      <TouchableOpacity
        style={[S.input, error ? S.inputError : null]}
        onPress={openPicker}
        activeOpacity={0.8}
      >
        <Text style={S.clockIcon}>🕐</Text>
        <Text style={[S.valueText, !value && { color: Colors.gray400 }]}>
          {displayValue}
        </Text>
        <Text style={S.dropArrow}>▾</Text>
      </TouchableOpacity>
      {error ? <Text style={S.errorText}>{error}</Text> : null}

      <Modal visible={show} transparent animationType="fade">
        <View style={S.overlay}>
          <TouchableOpacity style={S.backdrop} onPress={() => setShow(false)} activeOpacity={1} />

          <View style={S.card}>
            {/* live display */}
            <View style={S.liveRow}>
              <Text style={S.liveText}>
                {String(selH).padStart(2, '0')}
                <Text style={S.liveColon}>:</Text>
                {String(selM).padStart(2, '0')}
              </Text>
            </View>

            {/* column labels */}
            <View style={S.labelsRow}>
              <Text style={S.colLabel}>Giờ</Text>
              <View style={{ width: 24 }} />
              <Text style={S.colLabel}>Phút</Text>
            </View>

            {/* drums */}
            <View style={S.drumsRow}>
              <WheelColumn items={HOURS}   selected={selH} onSelect={setSelH} />
              <Text style={S.colon}>:</Text>
              <WheelColumn items={MINUTES} selected={selM} onSelect={setSelM} />
            </View>

            {/* footer */}
            <View style={S.footer}>
              <TouchableOpacity style={S.cancelBtn} onPress={() => setShow(false)}>
                <Text style={S.cancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.confirmBtn} onPress={handleConfirm}>
                <Text style={S.confirmText}>Xác nhận</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ── drum styles ── */
const W = StyleSheet.create({
  col: { flex: 1, alignItems: 'center', position: 'relative' },
  highlight: {
    position:         'absolute',
    // Nằm chính giữa: (VISIBLE/2) * ITEM_H từ top
    top:              ITEM_H * PAD,
    left:             4, right: 4,
    height:           ITEM_H,
    backgroundColor:  'rgba(255,255,255,0.08)',
    borderTopWidth:   1,
    borderBottomWidth:1,
    borderColor:      'rgba(255,255,255,0.22)',
    borderRadius:     8,
    zIndex:           10,
  },
  item:       { height: ITEM_H, justifyContent: 'center', alignItems: 'center', width: '100%' },
  text:       { fontSize: 20, color: 'rgba(255,255,255,0.28)', fontWeight: '400' },
  textActive: { fontSize: 30, color: '#ffffff', fontWeight: '700' },
});

/* ── field + modal styles ── */
const S = StyleSheet.create({
  wrapper:   { flex: 1 },
  label:     { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  required:  { color: Colors.error },
  input:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: Colors.white, minHeight: 46 },
  inputError:{ borderColor: Colors.error },
  clockIcon: { fontSize: 16, marginRight: 8 },
  valueText: { flex: 1, fontSize: 15, color: Colors.gray900 },
  dropArrow: { fontSize: 13, color: Colors.gray500 },
  errorText: { fontSize: 12, color: Colors.error, marginTop: 4 },

  overlay:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  backdrop: { ...StyleSheet.absoluteFillObject },

  card: {
    backgroundColor: '#1c1c2e',
    borderRadius: 20,
    width: 300,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 14,
  },

  liveRow:   { alignItems: 'center', paddingTop: 20, paddingBottom: 4 },
  liveText:  { fontSize: 42, fontWeight: '800', color: '#fff', letterSpacing: 4 },
  liveColon: { color: 'rgba(255,255,255,0.5)' },

  labelsRow: { flexDirection: 'row', justifyContent: 'center', paddingBottom: 2 },
  colLabel:  { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5 },

  drumsRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  colon:     { fontSize: 28, fontWeight: '800', color: 'rgba(255,255,255,0.3)', marginHorizontal: 2, marginBottom: 4 },

  footer: {
    flexDirection: 'row', padding: 16, gap: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  cancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center' },
  confirmText:{ fontSize: 15, fontWeight: '700', color: '#fff' },
});
