import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
} from 'react-native';
import { Colors } from '@/constants/colors';
import {
  format, addMonths, subMonths,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
} from 'date-fns';
import { vi } from 'date-fns/locale';

interface Props {
  label:        string;
  value:        Date | null;
  onChange:     (date: Date) => void;
  required?:    boolean;
  error?:       string;
  compact?:     boolean;
  monthOnly?:   boolean;
  placeholder?: string;
}

const DOW       = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTHS_VN = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4',
                   'Tháng 5','Tháng 6','Tháng 7','Tháng 8',
                   'Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
const MONTHS_SHORT = ['Thg1','Thg2','Thg3','Thg4','Thg5','Thg6',
                      'Thg7','Thg8','Thg9','Thg10','Thg11','Thg12'];

const START_YEAR = 1900;
const END_YEAR   = new Date().getFullYear() + 20;
const YEARS      = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

type PickMode = 'day' | 'year' | 'month';

export default function DatePickerField({ label, value, onChange, required, error, compact, monthOnly, placeholder }: Props) {
  const effectiveValue = value ?? new Date();
  const [show,     setShow]     = useState(false);
  const [viewDate, setViewDate] = useState(effectiveValue);
  const [mode,     setMode]     = useState<PickMode>(monthOnly ? 'year' : 'day');
  const [selYear,  setSelYear]  = useState(effectiveValue.getFullYear());
  const yearScrollRef = useRef<ScrollView>(null);

  const ITEM_H = 46;

  const scrollToYear = (y: number) => {
    const idx = YEARS.indexOf(y);
    if (idx >= 0 && yearScrollRef.current) {
      const offset = Math.max(0, idx * ITEM_H - 90);
      yearScrollRef.current.scrollTo({ y: offset, animated: false });
    }
  };

  const displayValue = value === null
    ? null
    : monthOnly
      ? format(value, 'MM/yyyy', { locale: vi })
      : format(value, 'dd/MM/yyyy', { locale: vi });

  const openPicker = () => {
    setViewDate(effectiveValue);
    setSelYear(effectiveValue.getFullYear());
    setMode(monthOnly ? 'year' : 'day');
    setShow(true);
    // Scroll đến năm sau khi modal render
    setTimeout(() => scrollToYear(value.getFullYear()), 150);
  };

  const closePicker = () => { setShow(false); setMode(monthOnly ? 'year' : 'day'); };

  const handleSelectDay = (day: Date) => { onChange(day); closePicker(); };
  const handleToday = () => { onChange(new Date()); closePicker(); };

  const handleSelectYear = (y: number) => {
    setSelYear(y);
    setMode('month');
  };
  const handleSelectMonth = (m: number) => {
    const newDate = new Date(selYear, m, monthOnly ? 1 : viewDate.getDate());
    if (monthOnly) {
      onChange(newDate);
      closePicker();
    } else {
      setViewDate(newDate);
      setMode('day');
    }
  };

  // Build calendar grid
  const buildGrid = () => {
    const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
    const end   = endOfWeek(endOfMonth(viewDate),     { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  };

  const days       = buildGrid();
  const monthLabel = format(viewDate, 'MMMM yyyy', { locale: vi });

  return (
    <View style={[S.wrapper, compact && { flex: 1, marginBottom: 0 }]}>
      <Text style={S.label}>
        {label}{required && <Text style={S.required}> *</Text>}
      </Text>

      <TouchableOpacity style={[S.input, error ? S.inputError : null]} onPress={openPicker} activeOpacity={0.8}>
        <Text style={S.calIcon}>📅</Text>
        <Text style={[S.valueText, compact && { fontSize: 13 }, !displayValue && { color: Colors.gray400 }]} numberOfLines={1}>
          {displayValue ?? (placeholder ?? 'Chọn ngày')}
        </Text>
        <Text style={S.dropArrow}>▾</Text>
      </TouchableOpacity>
      {error ? <Text style={S.errorText}>{error}</Text> : null}

      <Modal visible={show} transparent animationType="fade">
        <View style={S.overlay}>
          <TouchableOpacity style={S.backdrop} onPress={closePicker} activeOpacity={1} />

          <View style={S.calendar}>
            {/* Selected date bar */}
            <View style={S.selectedBar}>
              <Text style={S.selectedValue}>{displayValue ?? (placeholder ?? 'Chọn ngày')}</Text>
            </View>

            {/* ── YEAR picker ── */}
            {mode === 'year' && (
              <>
                <View style={S.modeHeader}>
                  {!monthOnly && (
                    <TouchableOpacity onPress={() => setMode('day')}>
                      <Text style={S.modeBack}>← Quay lại</Text>
                    </TouchableOpacity>
                  )}
                  {monthOnly && <View style={{ width: 70 }} />}
                  <Text style={S.modeTitle}>Chọn năm</Text>
                  <View style={{ width: 70 }} />
                </View>
                <ScrollView
                  ref={yearScrollRef}
                  style={S.listScroll}
                  showsVerticalScrollIndicator={false}
                >
                  {YEARS.map(y => (
                    <TouchableOpacity
                      key={y}
                      style={[S.yearItem, y === selYear && S.yearItemActive]}
                      onPress={() => handleSelectYear(y)}
                    >
                      <Text style={[S.yearItemText, y === selYear && S.yearItemTextActive]}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                  <View style={{ height: 8 }} />
                </ScrollView>
              </>
            )}

            {/* ── MONTH picker (sau khi chọn năm) ── */}
            {mode === 'month' && (
              <>
                <View style={S.modeHeader}>
                  <TouchableOpacity onPress={() => setMode('year')}>
                    <Text style={S.modeBack}>← {selYear}</Text>
                  </TouchableOpacity>
                  <Text style={S.modeTitle}>{monthOnly ? 'Chọn tháng' : 'Chọn tháng'}</Text>
                  <View style={{ width: 70 }} />
                </View>
                <View style={S.monthGrid}>
                  {MONTHS_SHORT.map((m, i) => {
                    const active = selYear === viewDate.getFullYear() && i === viewDate.getMonth();
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[S.monthCell, active && S.monthCellActive]}
                        onPress={() => handleSelectMonth(i)}
                      >
                        <Text style={[S.monthCellText, active && S.monthCellTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── DAY grid ── */}
            {mode === 'day' && (
              <>
                <View style={S.monthNav}>
                  <TouchableOpacity style={S.navBtn} onPress={() => setViewDate(d => subMonths(d, 1))}>
                    <Text style={S.navArrow}>‹</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={S.monthTitleBtn}
                    onPress={() => {
                      const y = viewDate.getFullYear();
                      setSelYear(y);
                      setMode('year');
                      setTimeout(() => scrollToYear(y), 100);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={S.monthTitle}>{monthLabel}</Text>
                    <Text style={S.caret}>▾</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.navBtn} onPress={() => setViewDate(d => addMonths(d, 1))}>
                    <Text style={S.navArrow}>›</Text>
                  </TouchableOpacity>
                </View>

                <View style={S.dowRow}>
                  {DOW.map(d => (
                    <Text key={d} style={[S.dowCell, d === 'CN' && { color: Colors.error }]}>{d}</Text>
                  ))}
                </View>

                <View style={S.grid}>
                  {days.map((day, idx) => {
                    const inMonth  = isSameMonth(day, viewDate);
                    const selected = isSameDay(day, value);
                    const today    = isToday(day);
                    const isSun    = day.getDay() === 0;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[S.dayCell, selected && S.dayCellSelected, today && !selected && S.dayCellToday]}
                        onPress={() => handleSelectDay(day)}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          S.dayText,
                          !inMonth && S.dayTextOut,
                          selected && S.dayTextSelected,
                          today && !selected && S.dayTextToday,
                          isSun && !selected && { color: Colors.error },
                        ]}>
                          {format(day, 'd')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={S.footer}>
                  <TouchableOpacity onPress={handleToday} style={S.todayBtn}>
                    <Text style={S.todayText}>Hôm nay</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ─── Styles ──────────────────────────────────────────── */
const CELL = 40;

const S = StyleSheet.create({
  wrapper:   { marginBottom: 16 },
  label:     { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  required:  { color: Colors.error },
  input:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.gray300, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: Colors.white, minHeight: 46 },
  inputError:{ borderColor: Colors.error },
  calIcon:   { fontSize: 16, marginRight: 8 },
  valueText: { flex: 1, fontSize: 15, color: Colors.gray900 },
  dropArrow: { fontSize: 13, color: Colors.gray500 },
  errorText: { fontSize: 12, color: Colors.error, marginTop: 4 },

  overlay:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  backdrop: { ...StyleSheet.absoluteFillObject },

  calendar: { backgroundColor: Colors.white, borderRadius: 16, width: 308, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 10 },

  selectedBar:   { backgroundColor: Colors.primary, paddingVertical: 12, alignItems: 'center' },
  selectedValue: { fontSize: 18, fontWeight: '700', color: Colors.white, letterSpacing: 1 },

  /* Mode header */
  modeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  modeBack:   { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  modeTitle:  { fontSize: 14, fontWeight: '700', color: Colors.gray900 },

  /* Year list */
  listScroll: { maxHeight: 240 },
  yearItem:       { paddingVertical: 13, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.gray100, height: 46, justifyContent: 'center' },
  yearItemActive: { backgroundColor: Colors.primary + '12' },
  yearItemText:   { fontSize: 15, color: Colors.gray700, fontWeight: '500' },
  yearItemTextActive: { color: Colors.primary, fontWeight: '800', fontSize: 16 },

  /* Month grid */
  monthGrid:    { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  monthCell:    { width: '22%', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.gray200, alignItems: 'center', backgroundColor: Colors.white },
  monthCellActive:    { borderColor: Colors.primary, backgroundColor: Colors.primary },
  monthCellText:      { fontSize: 12, fontWeight: '600', color: Colors.gray700 },
  monthCellTextActive:{ color: Colors.white, fontWeight: '700' },

  /* Day calendar */
  monthNav:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 8 },
  navBtn:        { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  navArrow:      { fontSize: 22, color: Colors.primary, fontWeight: '700' },
  monthTitleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  monthTitle:    { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  caret:         { fontSize: 11, color: Colors.primary },

  dowRow:  { flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 4 },
  dowCell: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: Colors.gray500 },

  grid:              { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4 },
  dayCell:           { width: CELL, height: CELL, justifyContent: 'center', alignItems: 'center', borderRadius: CELL / 2, margin: 1 },
  dayCellSelected:   { backgroundColor: Colors.primary },
  dayCellToday:      { borderWidth: 1.5, borderColor: Colors.primary },
  dayText:           { fontSize: 14, color: Colors.gray800 },
  dayTextOut:        { color: Colors.gray300 },
  dayTextSelected:   { color: Colors.white, fontWeight: '700' },
  dayTextToday:      { color: Colors.primary, fontWeight: '700' },

  footer:   { borderTopWidth: 1, borderTopColor: Colors.gray100, padding: 10, alignItems: 'flex-start' },
  todayBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  todayText:{ fontSize: 14, fontWeight: '600', color: Colors.primary },
});
