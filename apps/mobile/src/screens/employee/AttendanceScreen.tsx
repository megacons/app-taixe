import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useAuthStore } from '@/stores/authStore';

const TABS = ['Vào/Ra', 'Bảng công'] as const;
type Tab = typeof TABS[number];

export default function AttendanceScreen() {
  const navigation = useNavigation<any>();
  const { user }   = useAuthStore();

  const [tab,        setTab]        = useState<Tab>('Vào/Ra');
  const [today,      setToday]      = useState<any>(null);
  const [list,       setList]       = useState<any[]>([]);
  const [summary,    setSummary]    = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );

  const load = useCallback(async () => {
    try {
      const [todayRes, listRes] = await Promise.all([
        api.get('/attendance/today'),
        api.get('/attendance/list', { params: { month } }),
      ]);
      setToday(todayRes.data.data);
      setList(listRes.data.data?.list ?? []);
      setSummary(listRes.data.data?.summary ?? null);
    } catch (_) {}
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const changeMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    let nm = m + delta, ny = y;
    if (nm < 1)  { nm = 12; ny -= 1; }
    if (nm > 12) { nm = 1;  ny += 1; }
    setMonth(`${ny}-${String(nm).padStart(2, '0')}`);
  };

  const fmtTime = (d?: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  };

  const fmtHours = (h: number) => {
    const hrs  = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return `${hrs} giờ ${mins} phút`;
  };

  // Group list theo ngày
  const grouped: Record<string, any[]> = {};
  list.forEach(a => {
    if (!grouped[a.date]) grouped[a.date] = [];
    grouped[a.date].push(a);
  });

  const monthParts   = month.split('-');
  const monthDisplay = `${monthParts[1]}/${monthParts[0]}`;

  // Trạng thái hôm nay
  const rawSessions: any[] = today?.sessions ?? [];
  const sessions: any[] = rawSessions.length > 0
    ? rawSessions
    : (today?.check_in_time
        ? [{ check_in_time: today.check_in_time, check_out_time: today.check_out_time }]
        : []);
  const openSession   = sessions.find((s: any) => s.check_in_time && !s.check_out_time);
  const checkedIn     = !!openSession;
  const everCheckedIn = sessions.length > 0;
  const allClosed     = everCheckedIn && !openSession;
  const statusColor   = checkedIn ? Colors.success : allClosed ? Colors.error : Colors.gray300;

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>Chấm công</Text>
          <View style={S.monthRow}>
            <TouchableOpacity onPress={() => changeMonth(-1)}>
              <Text style={S.monthArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={S.monthLabel}>{monthDisplay}</Text>
            <TouchableOpacity onPress={() => changeMonth(1)}>
              <Text style={S.monthArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={S.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[S.tabBtn, tab === t && S.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[S.tabText, tab === t && S.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} /> : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={S.content}
        >

          {/* ── Tab Vào/Ra ── */}
          {tab === 'Vào/Ra' && (
            <View style={{ paddingHorizontal: 16 }}>

              {/* Card hôm nay */}
              <View style={[S.todayCard, { borderLeftColor: statusColor }]}>
                <Text style={S.todayTitle}>
                  Hôm nay, {format(new Date(), 'dd/MM', { locale: vi })}
                </Text>

                {/* Badge trạng thái */}
                <View style={[S.statusBadge, { backgroundColor: statusColor + '18' }]}>
                  <View style={[S.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[S.statusBadgeText, { color: statusColor }]}>
                    {checkedIn ? 'Đang trong ca' : allClosed ? 'Đã ra ca' : 'Chưa chấm công'}
                  </Text>
                </View>

                {/* Danh sách sessions hôm nay */}
                {sessions.length > 0 ? (
                  <View style={S.sessionsBox}>
                    {sessions.map((s: any, i: number) => (
                      <View key={i}>
                        <View style={[S.logRow, { borderLeftWidth: 3, borderLeftColor: Colors.success, marginBottom: 4 }]}>
                          <View style={[S.logIcon, { backgroundColor: Colors.success + '20' }]}>
                            <Text style={{ fontSize: 15 }}>🟢</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={S.logName}>
                              Vào ca{sessions.length > 1 ? ` (${i + 1})` : ''}
                            </Text>
                            <Text style={S.logShift}>
                              {s.check_in_addr ? `📍 ${s.check_in_addr}` : 'Ca VP (08:00-17:00)'}
                            </Text>
                          </View>
                          <Text style={[S.logTime, { color: Colors.success }]}>
                            {fmtTime(s.check_in_time)}
                          </Text>
                        </View>
                        <View style={[S.logRow, {
                          borderLeftWidth: 3,
                          borderLeftColor: s.check_out_time ? Colors.error : Colors.gray300,
                          marginBottom: 4,
                        }]}>
                          <View style={[S.logIcon, { backgroundColor: (s.check_out_time ? Colors.error : Colors.gray300) + '20' }]}>
                            <Text style={{ fontSize: 15 }}>{s.check_out_time ? '🔴' : '⏸️'}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={S.logName}>
                              Ra ca{sessions.length > 1 ? ` (${i + 1})` : ''}
                            </Text>
                            <Text style={S.logShift}>Ca VP (08:00-17:00)</Text>
                          </View>
                          <Text style={[S.logTime, { color: s.check_out_time ? Colors.error : Colors.gray400 }]}>
                            {s.check_out_time ? fmtTime(s.check_out_time) : '—'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={S.emptyToday}>
                    <Text style={S.emptyTodayText}>Chưa có dữ liệu chấm công hôm nay</Text>
                  </View>
                )}
              </View>

              {/* Lịch sử các ngày trước (bỏ hôm nay) */}
              {Object.entries(grouped)
                .filter(([date]) => date !== new Date().toISOString().slice(0, 10))
                .map(([date, records]) => {
                  const d        = parseISO(date);
                  const dayLabel = format(d, 'EEEE, dd/MM', { locale: vi });
                  return (
                    <View key={date} style={S.dayGroup}>
                      <Text style={S.dayHeader}>{dayLabel}</Text>
                      {records.map((r, ri) => {
                        const rSessions: any[] = r.sessions?.length > 0
                          ? r.sessions
                          : (r.check_in_time ? [{ check_in_time: r.check_in_time, check_out_time: r.check_out_time }] : []);
                        return rSessions.map((s: any, si: number) => (
                          <View key={`${ri}-${si}`}>
                            {s.check_in_time && (
                              <View style={[S.logRow, { borderLeftWidth: 3, borderLeftColor: Colors.success }]}>
                                <View style={[S.logIcon, { backgroundColor: Colors.success + '20' }]}>
                                  <Text style={{ fontSize: 16 }}>🟢</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={S.logName}>{user?.name}</Text>
                                  <Text style={S.logShift}>
                                    Vào ca{rSessions.length > 1 ? ` (${si + 1})` : ''} · {r.shift_name ?? 'Ca VP'}
                                  </Text>
                                </View>
                                <Text style={[S.logTime, { color: Colors.success }]}>
                                  {fmtTime(s.check_in_time)}
                                </Text>
                              </View>
                            )}
                            {s.check_out_time && (
                              <View style={[S.logRow, { borderLeftWidth: 3, borderLeftColor: Colors.error }]}>
                                <View style={[S.logIcon, { backgroundColor: Colors.error + '20' }]}>
                                  <Text style={{ fontSize: 16 }}>🔴</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={S.logName}>{user?.name}</Text>
                                  <Text style={S.logShift}>
                                    Ra ca{rSessions.length > 1 ? ` (${si + 1})` : ''} · {r.shift_name ?? 'Ca VP'}
                                  </Text>
                                </View>
                                <Text style={[S.logTime, { color: Colors.error }]}>
                                  {fmtTime(s.check_out_time)}
                                </Text>
                              </View>
                            )}
                          </View>
                        ));
                      })}
                    </View>
                  );
                })}
            </View>
          )}

          {/* ── Tab Bảng công ── */}
          {tab === 'Bảng công' && (
            <>
              {summary ? (
                <>
                  <SummaryGroup rows={[
                    { label: 'Ngày công thực tế',  value: `${summary.work_days} công`,   arrow: true },
                    { label: 'Giờ công thực tế',   value: fmtHours(summary.total_hours), arrow: true },
                    { label: 'Số giờ làm dư giờ',  value: `${summary.over_hours_h} giờ ${summary.over_hours_m} phút` },
                    { label: 'Số giờ làm thêm',    value: `${summary.overtime_h} giờ ${summary.overtime_m} phút` },
                    { label: 'Số phút đi làm sớm', value: `${summary.early_in_mins} phút` },
                  ]} />
                  <SummaryGroup rows={[
                    { label: 'Giờ công tiêu chuẩn',                   value: `${summary.standard_hours} giờ` },
                    { label: 'Số ngày nghỉ tiêu chuẩn',               value: `${summary.standard_off_days} ngày` },
                    { label: 'Số ngày nghỉ không lương (chính thức)', value: `${summary.unpaid_off_days} ngày` },
                    { label: 'Công chuẩn',                            value: `${summary.working_days_month} ngày` },
                    { label: 'Số ngày công nghỉ lễ',                  value: `${summary.holiday_days} ngày` },
                    { label: 'Tổng công tính lương',                   value: `${summary.total_payroll_days} ngày`, bold: true },
                  ]} />
                  <SummaryGroup rows={[
                    { label: 'Số giờ về sớm',          value: `${summary.early_out_h} giờ ${summary.early_out_m} phút`,                    arrow: true },
                    { label: 'Số giờ đi muộn',         value: `${summary.late_in_h} giờ ${summary.late_in_m} phút`,                        arrow: true },
                    { label: 'Số giờ đi muộn, về sớm', value: `${summary.late_early_combined_h} giờ ${summary.late_early_combined_m} phút`, arrow: true },
                  ]} />
                  <SummaryGroup rows={[
                    { label: 'Số lần quên checkin',              value: String(summary.forgot_checkin),  arrow: true, valueColor: summary.forgot_checkin  > 0 ? Colors.warning : undefined },
                    { label: 'Số lần quên checkout',             value: String(summary.forgot_checkout), arrow: true, valueColor: summary.forgot_checkout > 0 ? Colors.warning : undefined },
                    { label: 'Số lần quên checkin và checkout',  value: String(summary.forgot_both),     arrow: true, valueColor: summary.forgot_both     > 0 ? Colors.warning : undefined },
                  ]} />
                </>
              ) : (
                <View style={{ alignItems: 'center', marginTop: 40 }}>
                  <Text style={{ color: Colors.gray400, fontSize: 14 }}>Chưa có dữ liệu tháng này</Text>
                </View>
              )}
            </>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ── Styles ── */
const S = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: Colors.background },
  header:         { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  backBtn:        { width: 36, height: 36, justifyContent: 'center' },
  backIcon:       { fontSize: 22, color: Colors.white, fontWeight: '700' },
  headerTitle:    { fontSize: 17, fontWeight: '700', color: Colors.white },
  monthRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  monthArrow:     { fontSize: 18, color: 'rgba(255,255,255,0.8)', fontWeight: '700' },
  monthLabel:     { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },

  tabBar:         { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBtn:         { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:   { borderBottomColor: Colors.primary },
  tabText:        { fontSize: 14, fontWeight: '600', color: Colors.gray500 },
  tabTextActive:  { color: Colors.primary },

  content:        { paddingTop: 8, paddingBottom: 32 },

  todayCard:      { backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4 },
  todayTitle:     { fontSize: 12, fontWeight: '700', color: Colors.gray500, marginBottom: 10, textTransform: 'uppercase' },

  statusBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 12 },
  statusDot:      { width: 8, height: 8, borderRadius: 4 },
  statusBadgeText:{ fontSize: 12, fontWeight: '700' },

  sessionsBox:    { marginBottom: 4 },
  emptyToday:     { paddingVertical: 12, alignItems: 'center' },
  emptyTodayText: { fontSize: 13, color: Colors.gray400 },

  statusRow:      { flexDirection: 'row', marginBottom: 14 },
  timeBox:        { flex: 1, alignItems: 'center', gap: 4 },
  timeDivider:    { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  timeLabel:      { fontSize: 12, color: Colors.gray500, fontWeight: '600' },
  timeValue:      { fontSize: 20, fontWeight: '800' },

  dayGroup:       { marginBottom: 8 },
  dayHeader:      { fontSize: 12, fontWeight: '700', color: Colors.gray500, paddingVertical: 8, textTransform: 'capitalize' },
  logRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 12, padding: 12, marginBottom: 4, gap: 10, borderWidth: 1, borderColor: Colors.border },
  logIcon:        { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  logName:        { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  logShift:       { fontSize: 11, color: Colors.gray500, marginTop: 2 },
  logTime:        { fontSize: 15, fontWeight: '800' },
});

/* ── SummaryGroup ── */
type SummaryRow = { label: string; value: string; arrow?: boolean; bold?: boolean; valueColor?: string };

function SummaryGroup({ rows }: { rows: SummaryRow[] }) {
  return (
    <View style={SG.card}>
      {rows.map((row, i) => (
        <View key={i} style={[SG.row, i < rows.length - 1 && SG.rowBorder]}>
          <Text style={SG.label}>{row.label}</Text>
          <View style={SG.right}>
            <Text style={[SG.value, row.bold && { fontWeight: '800' }, row.valueColor ? { color: row.valueColor } : {}]}>
              {row.value}
            </Text>
            {row.arrow && <Text style={SG.arrow}>›</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

const SG = StyleSheet.create({
  card:      { backgroundColor: Colors.white, marginBottom: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border },
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  label:     { fontSize: 14, color: Colors.gray600, flex: 1, marginRight: 12 },
  right:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value:     { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  arrow:     { fontSize: 16, color: Colors.gray300, marginLeft: 2 },
});
