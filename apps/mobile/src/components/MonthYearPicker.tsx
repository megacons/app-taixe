/**
 * MonthYearPicker — 2 bước: chọn năm → chọn tháng
 * Hiển thị: ‹  Tháng 8/2026  ›
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
} from 'react-native';
import { Colors } from '@/constants/colors';

interface Props {
  month: number;   // 1-12
  year:  number;
  onChange: (month: number, year: number) => void;
}

const MONTHS_SHORT = ['Thg1','Thg2','Thg3','Thg4','Thg5','Thg6',
                      'Thg7','Thg8','Thg9','Thg10','Thg11','Thg12'];

const START_YEAR = new Date().getFullYear() - 5;
const END_YEAR   = new Date().getFullYear() + 20;
const YEARS      = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

type Step = 'year' | 'month';

export default function MonthYearPicker({ month, year, onChange }: Props) {
  const [show,    setShow]    = useState(false);
  const [step,    setStep]    = useState<Step>('year');
  const [selYear, setSelYear] = useState(year);

  const prev = () => {
    if (month === 1) onChange(12, year - 1);
    else onChange(month - 1, year);
  };
  const next = () => {
    if (month === 12) onChange(1, year + 1);
    else onChange(month + 1, year);
  };

  const openModal = () => {
    setSelYear(year);
    setStep('year');
    setShow(true);
  };

  const handleSelectYear = (y: number) => {
    setSelYear(y);
    setStep('month');
  };

  const handleSelectMonth = (m: number) => {
    onChange(m + 1, selYear); // m là 0-indexed
    setShow(false);
  };

  return (
    <>
      <View style={S.row}>
        <TouchableOpacity style={S.arrowBtn} onPress={prev}>
          <Text style={S.arrow}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity style={S.label} onPress={openModal} activeOpacity={0.75}>
          <Text style={S.labelText}>Tháng {month}/{year}</Text>
          <Text style={S.labelCaret}>▾</Text>
        </TouchableOpacity>

        <TouchableOpacity style={S.arrowBtn} onPress={next}>
          <Text style={S.arrow}>›</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={show} transparent animationType="fade">
        <View style={S.overlay}>
          <TouchableOpacity style={S.backdrop} onPress={() => setShow(false)} activeOpacity={1} />

          <View style={S.sheet}>

            {step === 'year' ? (
              <>
                {/* Header */}
                <View style={S.header}>
                  <Text style={S.headerTitle}>Chọn năm</Text>
                  <TouchableOpacity onPress={() => setShow(false)}>
                    <Text style={S.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Year list */}
                <ScrollView style={S.listScroll} showsVerticalScrollIndicator={false}>
                  {YEARS.map(y => (
                    <TouchableOpacity
                      key={y}
                      style={[S.yearItem, y === selYear && S.yearItemActive]}
                      onPress={() => handleSelectYear(y)}
                    >
                      <Text style={[S.yearItemText, y === selYear && S.yearItemTextActive]}>{y}</Text>
                      {y === selYear && <Text style={{ color: Colors.primary, fontWeight: '700' }}>›</Text>}
                    </TouchableOpacity>
                  ))}
                  <View style={{ height: 8 }} />
                </ScrollView>
              </>
            ) : (
              <>
                {/* Header */}
                <View style={S.header}>
                  <TouchableOpacity onPress={() => setStep('year')}>
                    <Text style={S.backBtn}>← {selYear}</Text>
                  </TouchableOpacity>
                  <Text style={S.headerTitle}>Chọn tháng</Text>
                  <TouchableOpacity onPress={() => setShow(false)}>
                    <Text style={S.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Month grid 4×3 */}
                <View style={S.monthGrid}>
                  {MONTHS_SHORT.map((m, i) => {
                    const active = selYear === year && (i + 1) === month;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[S.monthCell, active && S.monthCellActive]}
                        onPress={() => handleSelectMonth(i)}
                      >
                        <Text style={[S.monthText, active && S.monthTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Tháng hiện tại */}
                <TouchableOpacity
                  style={S.todayRow}
                  onPress={() => {
                    const n = new Date();
                    onChange(n.getMonth() + 1, n.getFullYear());
                    setShow(false);
                  }}
                >
                  <Text style={S.todayText}>Tháng hiện tại</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const S = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10 },
  arrowBtn:  { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  arrow:     { fontSize: 24, fontWeight: '700', color: Colors.primary },
  label:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: Colors.primary + '0d' },
  labelText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  labelCaret:{ fontSize: 11, color: Colors.primary },

  overlay:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  backdrop: { ...StyleSheet.absoluteFillObject },

  sheet: { backgroundColor: Colors.white, borderRadius: 16, width: 280, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 10 },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.primary },
  headerTitle: { fontSize: 15, fontWeight: '700', color: Colors.white, flex: 1, textAlign: 'center' },
  closeBtn:    { fontSize: 16, color: 'rgba(255,255,255,0.8)', paddingLeft: 8 },
  backBtn:     { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600', paddingRight: 8 },

  listScroll:        { maxHeight: 280 },
  yearItem:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  yearItemActive:    { backgroundColor: Colors.primary + '10' },
  yearItemText:      { fontSize: 15, color: Colors.gray700, fontWeight: '500' },
  yearItemTextActive:{ color: Colors.primary, fontWeight: '800', fontSize: 16 },

  monthGrid:       { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  monthCell:       { width: '22%', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.gray200, alignItems: 'center' },
  monthCellActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  monthText:       { fontSize: 12, fontWeight: '600', color: Colors.gray700 },
  monthTextActive: { color: Colors.white, fontWeight: '700' },

  todayRow: { borderTopWidth: 1, borderTopColor: Colors.gray100, paddingVertical: 12, alignItems: 'center' },
  todayText:{ fontSize: 14, fontWeight: '600', color: Colors.primary },
});
