import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TruckIcon, UsersIcon, DocumentTextIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';
import api from '@/lib/api';
import { format, subDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useSocket } from '@/hooks/useSocket';

interface KPI {
  total_trips_today: number;
  total_trips_month: number;
  pending_requests: number;
  total_income_month: number;
  total_expense_month: number;
  active_drivers: number;
}

/** Tính % thay đổi, trả về null nếu không có dữ liệu so sánh */
function calcDelta(current: number, prev: number | undefined): { pct: number; up: boolean } | null {
  if (prev === undefined || prev === null) return null;
  if (prev === 0 && current === 0) return null;
  if (prev === 0) return { pct: 100, up: true };
  const pct = Math.round(((current - prev) / prev) * 100);
  return { pct: Math.abs(pct), up: pct >= 0 };
}

interface ChartPoint {
  date: string;
  advance: number;
  expense: number;
  trips: number;
}

const fmtMoney = (v: number) =>
  v.toLocaleString('vi-VN');

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  try { return format(new Date(d), 'dd/MM/yyyy', { locale: vi }); }
  catch { return d; }
};

/** Chuyển path tương đối thành URL tuyệt đối */
const getImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmtMoney(p.value)}đ
        </p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [kpi, setKpi]           = useState<KPI | null>(null);
  const now = new Date();
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartMode, setChartMode] = useState<'week' | 'month' | 'year'>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [topDrivers, setTopDrivers] = useState<any[]>([]);

  // So sánh tháng
  const prevM = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const [compareMonth, setCompareMonth] = useState(prevM);
  const [compareYear,  setCompareYear]  = useState(prevY);
  const [kpiPrev,      setKpiPrev]      = useState<KPI | null>(null);
  const [loadingPrev,  setLoadingPrev]  = useState(false);

  // Modal chuyến hôm nay
  const [showTodayModal, setShowTodayModal]       = useState(false);
  const [todayTrips, setTodayTrips]               = useState<any[]>([]);
  const [todayModalLoading, setTodayModalLoading] = useState(false);
  const [selectedTrip, setSelectedTrip]           = useState<any | null>(null);
  const [lightbox, setLightbox]                   = useState<string | null>(null);

  // Modal quỹ đã cấp tháng
  const [showFundModal, setShowFundModal]         = useState(false);
  const [fundDrivers, setFundDrivers]             = useState<any[]>([]);
  const [fundLoading, setFundLoading]             = useState(false);
  const [selectedFundDriver, setSelectedFundDriver] = useState<any | null>(null);
  const [driverEntries, setDriverEntries]         = useState<any[]>([]); // flat list lần cấp (mới→cũ)
  const [splitLoading, setSplitLoading]           = useState<string | null>(null); // entryId đang tách
  const [driverDetailRows, setDriverDetailRows]   = useState<any[]>([]); // drill-down theo ngày (cũ→mới)
  const [driverEntriesTotals, setDriverEntriesTotals] = useState<any>(null);
  const [entriesLoading, setEntriesLoading]       = useState(false);

  // Modal tài xế đã chi tháng
  const [showExpenseModal, setShowExpenseModal]   = useState(false);
  const [expenseItems, setExpenseItems]           = useState<any[]>([]);
  const [expenseLoading, setExpenseLoading]       = useState(false);
  const [selectedExpense, setSelectedExpense]     = useState<any | null>(null);
  const [selectedFundEntry, setSelectedFundEntry] = useState<any | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadChart(weekOffset, chartMode);
  }, [weekOffset, chartMode]);

  // Load KPI tháng so sánh mỗi khi thay đổi
  useEffect(() => {
    const load = async () => {
      setLoadingPrev(true);
      try {
        const [monthRes, fundRes] = await Promise.all([
          api.get('/trips', { params: { month: compareMonth, year: compareYear, limit: 1 } }),
          api.get('/fund/drivers', { params: { month: compareMonth, year: compareYear } }),
        ]);
        const drivers: any[] = fundRes.data.data?.drivers ?? [];
        setKpiPrev({
          total_trips_today:   0,
          total_trips_month:   monthRes.data.data?.pagination?.total ?? 0,
          pending_requests:    0,
          total_income_month:  drivers.reduce((s: number, d: any) => s + (d.total_advance || 0), 0),
          total_expense_month: drivers.reduce((s: number, d: any) => s + (d.total_expense || 0), 0),
          active_drivers:      0,
        });
      } catch { setKpiPrev(null); }
      finally { setLoadingPrev(false); }
    };
    load();
  }, [compareMonth, compareYear]);

  const openTodayTripsModal = async () => {    setShowTodayModal(true);
    setTodayModalLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await api.get('/trips', { params: { date: today, limit: 200, sort: '-trip_date' } });
      setTodayTrips(res.data.data?.trips ?? []);
    } catch {
      setTodayTrips([]);
    } finally {
      setTodayModalLoading(false);
    }
  };

  const openFundModal = async () => {
    setShowFundModal(true);
    setSelectedFundDriver(null);
    setDriverEntries([]);
    setDriverDetailRows([]);
    setFundLoading(true);
    try {
      const nowMonth = now.getMonth() + 1;
      const nowYear  = now.getFullYear();
      const monthStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}`;

      // Lấy danh sách tài xế
      const driverRes = await api.get('/fund/drivers', { params: { month: nowMonth, year: nowYear } });
      const drivers: any[] = driverRes.data.data?.drivers ?? [];
      setFundDrivers(drivers);

      // Lấy từng yêu cầu tiền ứng đã duyệt — mỗi yêu cầu = 1 dòng (giống phần Chi)
      const allEntries: any[] = [];
      await Promise.all(drivers.map(async (d: any) => {
        try {
          const res = await api.get('/requests', {
            params: { type: 'salary_advance', status: 'approved', driverId: d.driver_id, limit: 200 },
          });
          const reqs: any[] = res.data.data?.requests ?? [];
          // Lọc theo tháng
          reqs
            .filter(r => r.created_at?.slice(0, 7) === monthStr)
            .forEach(r => allEntries.push({
              _id:         r._id,
              date:        r.payload?.date ?? r.created_at?.slice(0, 10) ?? '',
              advance:     r.payload?.amount ?? 0,
              note:        r.payload?.reason ?? r.payload?.purpose ?? r.title ?? '',
              driver_name: d.full_name,
              employee_id: d.employee_id,
              driver_id:   d.driver_id,
              title:       r.title,
              created_at:  r.created_at,
            }));
        } catch (_) {}
      }));

      // Sắp xếp mới nhất lên đầu
      allEntries.sort((a, b) => (b.date || b.created_at || '').localeCompare(a.date || a.created_at || ''));
      setDriverEntries(allEntries);
    } catch {
      setFundDrivers([]);
      setDriverEntries([]);
    } finally {
      setFundLoading(false);
    }
  };

  const openExpenseModal = async () => {
    setShowExpenseModal(true);
    setExpenseLoading(true);
    try {
      const nowMonth = now.getMonth() + 1;
      const nowYear  = now.getFullYear();
      const monthStr = `${nowYear}-${String(nowMonth).padStart(2, '0')}`;

      // Lấy danh sách tài xế active
      const driverRes = await api.get('/fund/drivers', { params: { month: nowMonth, year: nowYear } });
      const drivers: any[] = driverRes.data.data?.drivers ?? [];

      // Lấy từng expense request đã duyệt của từng tài xế trong tháng
      const allItems: any[] = [];
      await Promise.all(drivers.map(async (d: any) => {
        try {
          const res = await api.get('/requests', {
            params: { type: 'expense', status: 'approved', driverId: d.driver_id, limit: 200 },
          });
          const reqs: any[] = res.data.data?.requests ?? [];
          reqs
            .filter((r: any) => {
              // Lọc theo tháng dựa vào payload.date hoặc created_at
              const dateStr = r.payload?.date ?? r.created_at?.slice(0, 10) ?? '';
              return dateStr.startsWith(monthStr);
            })
            .forEach((r: any) => allItems.push({
              _id:         r._id,
              date:        r.payload?.date ?? r.created_at?.slice(0, 10) ?? '',
              amount:      r.payload?.amount ?? 0,
              note:        r.payload?.note ?? r.title ?? '',
              title:       r.title,
              driver_name: d.full_name,
              employee_id: d.employee_id,
            }));
        } catch (_) {}
      }));

      // Mới nhất lên đầu
      allItems.sort((a, b) => b.date.localeCompare(a.date));
      setExpenseItems(allItems);
    } catch {
      setExpenseItems([]);
    } finally {
      setExpenseLoading(false);
    }
  };

  const openDriverEntries = async (driver: any) => {    setSelectedFundDriver(driver);
    setEntriesLoading(true);
    try {
      // driver.month = "YYYY-MM", tách ra month và year riêng
      const [y, m] = (driver.month as string).split('-');
      const res = await api.get(`/fund/${driver.driver_id}/entries`, {
        params: { month: parseInt(m), year: parseInt(y) },
      });
      setDriverEntries((res.data.data?.rows ?? []).slice().sort((a: any, b: any) => b.date.localeCompare(a.date)));
      setDriverDetailRows(res.data.data?.rows ?? []); // giữ tăng dần cho cân đối lũy kế
      setDriverEntriesTotals(res.data.data?.totals ?? null);
    } catch {
      setDriverEntries([]);
      setDriverEntriesTotals(null);
    } finally {
      setEntriesLoading(false);
    }
  };

  const loadChart = async (offset: number, mode: 'week' | 'month' | 'year' = 'week') => {
    setChartLoading(true);
    try {
      const today = new Date();
      const points: ChartPoint[] = [];

      if (mode === 'week') {
        const dow = today.getDay();
        const daysSinceMonday = dow === 0 ? 6 : dow - 1;
        const monday = subDays(today, daysSinceMonday - offset * 7);
        const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
        for (let i = 0; i < 7; i++) {
          const d   = subDays(monday, -i);
          const str = d.toISOString().slice(0, 10);
          const label = `${DAY_LABELS[i]} ${format(d, 'dd/MM', { locale: vi })}`;
          try {
            const [fundRes, tripRes] = await Promise.all([
              api.get('/fund/summary/daily', { params: { date: str } }),
              api.get('/trips/summary/daily', { params: { date: str } }),
            ]);
            points.push({ date: label, advance: fundRes.data.data?.total_advance ?? 0, expense: fundRes.data.data?.total_expense ?? 0, trips: tripRes.data.data?.total_trips ?? 0 });
          } catch {
            points.push({ date: label, advance: 0, expense: 0, trips: 0 });
          }
        }
      } else if (mode === 'month') {
        const year  = today.getFullYear() + Math.floor((today.getMonth() + offset) / 12);
        const month = ((today.getMonth() + offset) % 12 + 12) % 12 + 1;
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          const str   = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const label = `${d}/${month}`;
          try {
            const [fundRes, tripRes] = await Promise.all([
              api.get('/fund/summary/daily', { params: { date: str } }),
              api.get('/trips/summary/daily', { params: { date: str } }),
            ]);
            points.push({ date: label, advance: fundRes.data.data?.total_advance ?? 0, expense: fundRes.data.data?.total_expense ?? 0, trips: tripRes.data.data?.total_trips ?? 0 });
          } catch {
            points.push({ date: label, advance: 0, expense: 0, trips: 0 });
          }
        }
      } else {
        // year mode
        const year = today.getFullYear() + offset;
        for (let m = 1; m <= 12; m++) {
          const label = `T${m}/${year}`;
          try {
            const [fundRes, tripRes] = await Promise.all([
              api.get('/fund/drivers', { params: { month: m, year } }),
              api.get('/trips', { params: { month: m, year, limit: 1 } }),
            ]);
            const drivers: any[] = fundRes.data.data?.drivers ?? [];
            points.push({
              date:    label,
              advance: drivers.reduce((s: number, d: any) => s + (d.total_advance || 0), 0),
              expense: drivers.reduce((s: number, d: any) => s + (d.total_expense || 0), 0),
              trips:   tripRes.data.data?.pagination?.total ?? 0,
            });
          } catch {
            points.push({ date: label, advance: 0, expense: 0, trips: 0 });
          }
        }
      }

      setChartData(points);
    } finally {
      setChartLoading(false);
    }
  };

  // Realtime: join admin room, cập nhật KPI khi có yêu cầu mới
  useSocket({
    rooms: ['join:admin'],
    events: {
      'new:request': () => { loadAll(); },
      'request:updated': () => { loadAll(); },
    },
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const nowMonth = new Date().getMonth() + 1;
      const nowYear  = new Date().getFullYear();

      const [todayRes, monthRes, driversRes, requestsRes, fundMonthRes] = await Promise.all([
        api.get('/trips/summary/daily', { params: { date: today } }),
        api.get('/trips', { params: { month: nowMonth, year: nowYear, limit: 1 } }),
        api.get('/drivers', { params: { status: 'active', limit: 1 } }),
        api.get('/requests', { params: { status: 'pending', limit: 1 } }),
        api.get('/fund/drivers', { params: { month: nowMonth, year: nowYear } }),
      ]);

      const monthTrips: any[] = monthRes.data.data?.trips ?? [];
      const fundDrivers: any[] = fundMonthRes.data.data?.drivers ?? [];
      const totalAdvanceMonth = fundDrivers.reduce((s: number, d: any) => s + (d.total_advance || 0), 0);
      const totalExpenseMonth = fundDrivers.reduce((s: number, d: any) => s + (d.total_expense || 0), 0);

      setKpi({
        total_trips_today:   todayRes.data.data?.total_trips    ?? 0,
        total_trips_month:   monthRes.data.data?.pagination?.total ?? monthTrips.length,
        pending_requests:    requestsRes.data.data?.pagination?.total ?? 0,
        total_income_month:  totalAdvanceMonth,
        total_expense_month: totalExpenseMonth,
        active_drivers:      driversRes.data.data?.pagination?.total ?? 0,
      });

      /* Top drivers this month */
      const driverMap = new Map<string, { name: string; income: number; trips: number }>();
      monthTrips.forEach((t: any) => {
        const id   = t.driver_id?._id ?? 'unknown';
        const name = t.driver_id?.full_name ?? '—';
        const cur  = driverMap.get(id) ?? { name, income: 0, trips: 0 };
        driverMap.set(id, { name, income: cur.income + (t.income || 0), trips: cur.trips + 1 });
      });
      const sorted = Array.from(driverMap.values()).sort((a, b) => b.trips - a.trips).slice(0, 5);
      setTopDrivers(sorted);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const KPI_CARDS = kpi ? [
    { label: 'Chuyến hôm nay',       value: kpi.total_trips_today,              prev: undefined,                        icon: TruckIcon,        color: 'bg-blue-50 text-blue-600',     unit: 'chuyến',  onClick: () => openTodayTripsModal(), hoverBorder: 'hover:border-blue-300' },
    { label: 'Tổng chuyến tháng',    value: kpi.total_trips_month,              prev: kpiPrev?.total_trips_month,       icon: TruckIcon,        color: 'bg-green-50 text-green-600',   unit: 'chuyến',  onClick: () => navigate('/trips'),    hoverBorder: 'hover:border-green-300' },
    { label: 'Tài xế hoạt động',     value: kpi.active_drivers,                 prev: undefined,                        icon: UsersIcon,        color: 'bg-purple-50 text-purple-600', unit: 'tài xế',  onClick: undefined,                   hoverBorder: '' },
    { label: 'Chờ duyệt',            value: kpi.pending_requests,               prev: undefined,                        icon: DocumentTextIcon, color: 'bg-yellow-50 text-yellow-600', unit: 'yêu cầu', onClick: () => navigate('/requests'),  hoverBorder: 'hover:border-yellow-300' },
    { label: 'Quỹ đã cấp tháng',     value: fmtMoney(kpi.total_income_month),   prev: kpiPrev?.total_income_month,      icon: BanknotesIcon,    color: 'bg-emerald-50 text-emerald-600', unit: 'đ',     onClick: () => openFundModal(),        hoverBorder: 'hover:border-emerald-300', rawValue: kpi.total_income_month },
    { label: 'Tài xế đã chi tháng',  value: fmtMoney(kpi.total_expense_month),  prev: kpiPrev?.total_expense_month,     icon: BanknotesIcon,    color: 'bg-red-50 text-red-500',       unit: 'đ',       onClick: () => openExpenseModal(),     hoverBorder: 'hover:border-red-300',    rawValue: kpi.total_expense_month },
  ] : [];

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {format(new Date(), 'EEEE, dd/MM/yyyy', { locale: vi })}
        </p>
      </div>

      {/* KPI Cards + Compare picker */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <p className="text-xs text-gray-500">Tháng hiện tại so với:</p>
        <div className="flex items-center gap-2">
          <select className="form-select text-xs py-1 h-8 w-28"
            value={compareMonth}
            onChange={e => setCompareMonth(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=>i+1).map(m=>(
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
          <select className="form-select text-xs py-1 h-8 w-24"
            value={compareYear}
            onChange={e => setCompareYear(Number(e.target.value))}>
            {Array.from({length:5},(_,i)=>now.getFullYear()-i).map(y=>(
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card animate-pulse h-24 bg-gray-50" />
            ))
          : KPI_CARDS.map(card => {
              const rawVal = (card as any).rawValue ?? (typeof card.value === 'number' ? card.value : null);
              const delta  = rawVal !== null && card.prev !== undefined
                ? calcDelta(rawVal, card.prev)
                : typeof card.value === 'number' && card.prev !== undefined
                  ? calcDelta(card.value, card.prev)
                  : null;
              return (
                <div
                  key={card.label}
                  className={`card py-4 px-4 flex flex-col gap-2 ${card.onClick ? `cursor-pointer hover:shadow-md ${card.hoverBorder} transition-all` : ''}`}
                  onClick={card.onClick}
                >
                  <div className={`w-9 h-9 rounded-lg ${card.color.split(' ')[0]} flex items-center justify-center`}>
                    <card.icon className={`w-5 h-5 ${card.color.split(' ')[1]}`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 leading-tight">{card.label}</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">
                      {card.value}
                      <span className="text-xs font-normal text-gray-400 ml-1">{card.unit}</span>
                    </p>
                    {/* Delta so sánh */}
                    {loadingPrev ? (
                      <div className="h-3.5 w-14 bg-gray-100 rounded animate-pulse mt-1" />
                    ) : delta ? (
                      <p className={`text-[11px] font-semibold mt-0.5 flex items-center gap-0.5 ${delta.up ? 'text-emerald-600' : 'text-red-500'}`}>
                        {delta.up ? '▲' : '▼'} {delta.pct}%
                        <span className="text-[10px] font-normal text-gray-400 ml-1">
                          so T{compareMonth}/{compareYear}
                        </span>
                      </p>
                    ) : card.prev !== undefined ? (
                      <p className="text-[11px] text-gray-400 mt-0.5">= Không đổi</p>
                    ) : null}
                  </div>
                </div>
              );
            })
        }
      </div>

      {/* Chart + Top Drivers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Revenue chart */}
        <div className="lg:col-span-2 card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">
              {chartMode === 'week' ? 'Quỹ tài xế theo tuần' : chartMode === 'month' ? 'Quỹ tài xế theo tháng' : 'Quỹ tài xế theo năm'}
            </h2>
            <div className="flex items-center gap-2">
              {/* Mode selector */}
              <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
                {(['week','month','year'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setChartMode(m); setWeekOffset(0); }}
                    className={`px-2.5 py-1 font-medium transition-colors ${chartMode === m ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    {m === 'week' ? 'Tuần' : m === 'month' ? 'Tháng' : 'Năm'}
                  </button>
                ))}
              </div>
              {/* Navigation */}
              <button
                onClick={() => setWeekOffset(w => w - 1)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors"
              >‹</button>
              <span className="text-xs text-gray-500 min-w-[130px] text-center">
                {(() => {
                  const today = new Date();
                  if (chartMode === 'week') {
                    const dow  = today.getDay();
                    const diff = dow === 0 ? 6 : dow - 1;
                    const mon  = subDays(today, diff - weekOffset * 7);
                    const sun  = subDays(mon, -6);
                    return `${format(mon, 'dd/MM')} – ${format(sun, 'dd/MM/yyyy')}`;
                  } else if (chartMode === 'month') {
                    const year  = today.getFullYear() + Math.floor((today.getMonth() + weekOffset) / 12);
                    const month = ((today.getMonth() + weekOffset) % 12 + 12) % 12 + 1;
                    return `Tháng ${month}/${year}`;
                  } else {
                    return `Năm ${today.getFullYear() + weekOffset}`;
                  }
                })()}
              </span>
              <button
                onClick={() => setWeekOffset(w => Math.min(0, w + 1))}
                disabled={weekOffset >= 0}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >›</button>
            </div>
          </div>
          {loading || chartLoading ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">Đang tải...</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  interval={chartMode === 'month' ? 4 : chartMode === 'year' ? 0 : 0}
                  angle={chartMode === 'month' ? -35 : 0}
                  textAnchor={chartMode === 'month' ? 'end' : 'middle'}
                  height={chartMode === 'month' ? 45 : 20}
                />
                <YAxis tickFormatter={v => fmtMoney(v)} tick={{ fontSize: 11 }} width={50} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="advance" name="Quỹ đã cấp" fill="#163797" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Tài xế đã chi" fill="#f8b30e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top drivers */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">Top tài xế tháng này</h2>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : topDrivers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-3">
              {topDrivers.map((d, i) => (
                <div key={d.name} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                    ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : 'bg-orange-50 text-orange-600'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{d.name}</p>
                    <p className="text-xs text-gray-400">{d.trips} chuyến</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>

    {/* ── Modals (rendered via Portal to avoid stacking context issues) ── */}
    {createPortal(
      <>
      {/* ── Modal: Chuyến hôm nay ── */}
      {showTodayModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <div className="bg-white w-full max-w-5xl mx-4 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <TruckIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Chuyến hôm nay</h2>
                  <p className="text-xs text-gray-400">{format(new Date(), 'EEEE, dd/MM/yyyy', { locale: vi })}</p>
                </div>
                {!todayModalLoading && (
                  <span className="text-sm text-gray-400 font-medium ml-1">
                    · {todayTrips.length} chuyến
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowTodayModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold transition-colors"
              >✕</button>
            </div>

            {/* Body */}
            <div className="overflow-auto flex-1">
              {todayModalLoading ? (
                <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                  <svg className="animate-spin w-5 h-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Đang tải...
                </div>
              ) : todayTrips.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <p className="text-5xl mb-3">🚛</p>
                  <p className="text-sm font-medium">Chưa có chuyến nào hôm nay</p>
                  <p className="text-xs mt-1">Các chuyến sẽ hiển thị khi tài xế ghi nhật trình</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {['STT', 'Tài xế', 'Xe', 'Tuyến đường', 'Vật liệu'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-100">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {todayTrips.map((t: any, i: number) => (
                      <tr
                        key={t._id}
                        className="hover:bg-blue-50/60 cursor-pointer transition-colors"
                        onClick={() => setSelectedTrip(t)}
                      >
                        <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{t.driver_id?.full_name ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{t.vehicle_id?.license_plate ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                          {t.pickup_location && t.drop_location
                            ? `${t.pickup_location} → ${t.drop_location}`
                            : t.pickup_location || t.drop_location || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{t.material_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-400">Nhấn vào chuyến để xem chi tiết</span>
              <button
                onClick={() => setShowTodayModal(false)}
                className="btn-outline text-sm px-4 py-1.5"
              >Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Chi tiết chuyến ── */}
      {selectedTrip && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Chi tiết chuyến</h3>
              <button
                onClick={() => setSelectedTrip(null)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold"
              >✕</button>
            </div>
            <div className="p-6 space-y-0 max-h-[70vh] overflow-y-auto">
              {[
                { label: 'Ngày', value: selectedTrip.trip_date ? (() => {
                    const d = new Date(selectedTrip.trip_date);
                    return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false });
                  })() : '—' },
                { label: 'Tài xế',     value: selectedTrip.driver_id?.full_name ?? '—' },
                { label: 'Biển số xe', value: selectedTrip.vehicle_id?.license_plate ?? '—' },
                { label: 'Nơi lấy',    value: selectedTrip.pickup_location ?? '—' },
                { label: 'Nơi đổ',     value: selectedTrip.drop_location ?? '—' },
                { label: 'Vật liệu',   value: selectedTrip.material_name ?? '—' },
                { label: 'Số lượng',   value: selectedTrip.quantity ? `${selectedTrip.quantity} ${selectedTrip.unit ?? ''}`.trim() : '—' },
                { label: 'Ghi chú',    value: selectedTrip.note || '—' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-start py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-500">{row.label}</span>
                  <span className="text-sm text-gray-900 font-semibold text-right max-w-[60%]">{row.value}</span>
                </div>
              ))}

              {/* Ảnh biên nhận */}
              {selectedTrip.delivery_receipt && (() => {
                const imgUrl = getImageUrl(selectedTrip.delivery_receipt);
                return imgUrl ? (
                  <div className="pt-3">
                    <p className="text-sm text-gray-500 mb-2">Ảnh biên nhận</p>
                    <div
                      className="relative group cursor-zoom-in"
                      onClick={() => setLightbox(imgUrl)}
                    >
                      <img
                        src={imgUrl}
                        alt="Biên nhận"
                        className="w-full rounded-xl border border-gray-200 object-cover max-h-64 transition-opacity group-hover:opacity-90"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="bg-black/50 text-white text-xs font-semibold px-3 py-1.5 rounded-full">🔍 Phóng to</span>
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedTrip(null)}
                className="btn-primary text-sm px-5 py-2"
              >Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ảnh biên nhận ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold transition-colors"
            onClick={() => setLightbox(null)}
          >✕</button>
          <img
            src={lightbox}
            alt="Biên nhận phóng to"
            className="max-w-[92vw] max-h-[92vh] rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── Modal: Quỹ đã cấp tháng — danh sách tài xế ── */}
      {showFundModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <div className="bg-white w-full max-w-3xl mx-4 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <BanknotesIcon className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Quỹ đã cấp tháng</h2>
                  <p className="text-xs text-gray-400">
                    Tháng {now.getMonth() + 1}/{now.getFullYear()} · {fundDrivers.length} tài xế
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFundModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold transition-colors"
              >✕</button>
            </div>

            {/* Body */}
            <div className="overflow-auto flex-1">
              {fundLoading ? (
                <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                  <svg className="animate-spin w-5 h-5 mr-2 text-emerald-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Đang tải...
                </div>
              ) : driverEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <p className="text-4xl mb-3">💰</p>
                  <p className="text-sm">Chưa có lần cấp tiền nào tháng này</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {['Ngày', 'Tài xế', 'Mã NV', 'Số tiền cấp', 'Ghi chú'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {driverEntries.map((row: any, i: number) => (
                      <tr key={`${row.driver_id}-${row.date}-${i}`}
                        className="hover:bg-emerald-50/40 cursor-pointer transition-colors"
                        onClick={() => setSelectedFundEntry(row)}>
                        <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">
                          {fmtDate(row.date || row.created_at)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{row.driver_name}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{row.employee_id ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-bold text-emerald-600 text-base">
                            {fmtMoney(row.advance)}đ
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {row.note ? <span className="text-sm">{row.note}</span> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-xs font-bold text-gray-700 uppercase">
                        Tổng cộng ({driverEntries.length} lần)
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-600 whitespace-nowrap text-base">
                        {fmtMoney(driverEntries.reduce((s: number, r: any) => s + r.advance, 0))}đ
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-400">
                {!fundLoading && `${driverEntries.length} lần cấp · Tháng ${now.getMonth() + 1}/${now.getFullYear()} · Nhấn vào hàng để xem chi tiết`}
              </span>
              <button onClick={() => setShowFundModal(false)} className="btn-outline text-sm px-4 py-1.5">Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Chi tiết quỹ từng ngày của 1 tài xế ── */}
      {selectedFundDriver && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60">
          <div className="bg-white w-full max-w-2xl mx-4 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedFundDriver(null)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors"
                >←</button>
                <div>
                  <h3 className="text-base font-bold text-gray-900">{selectedFundDriver.full_name}</h3>
                  <p className="text-xs text-gray-400">
                    {selectedFundDriver.employee_id} · {selectedFundDriver.license_plate} · Tháng {now.getMonth() + 1}/{now.getFullYear()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedFundDriver(null); setShowFundModal(false); }}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold"
              >✕</button>
            </div>

            {/* Summary strip */}
            {driverEntriesTotals && (
              <div className="grid grid-cols-3 divide-x divide-gray-100 bg-gray-50 border-b border-gray-100">
                {[
                  { label: 'Tổng cấp', value: fmtMoney(driverEntriesTotals.advance) + 'đ', cls: 'text-emerald-600' },
                  { label: 'Tài xế chi', value: fmtMoney(driverEntriesTotals.expense) + 'đ', cls: 'text-red-500' },
                  { label: 'Còn lại', value: fmtMoney(driverEntriesTotals.remaining) + 'đ', cls: driverEntriesTotals.remaining >= 0 ? 'text-blue-600' : 'text-red-600' },
                ].map(s => (
                  <div key={s.label} className="px-4 py-3 text-center">
                    <p className="text-xs text-gray-400 mb-0.5">{s.label}</p>
                    <p className={`text-base font-bold ${s.cls}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Body */}
            <div className="overflow-auto flex-1">
              {entriesLoading ? (
                <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                  <svg className="animate-spin w-5 h-5 mr-2 text-emerald-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Đang tải...
                </div>
              ) : driverDetailRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-sm">Chưa có giao dịch nào</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {['Ngày', 'Admin cấp', 'Tài xế chi', 'Ghi chú', 'Chuyến', 'Cân đối'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {driverDetailRows.map((row: any) => (
                      <tr key={row.date} className={row.advance > 0 ? 'bg-emerald-50/30' : ''}>
                        <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">
                          {fmtDate(row.date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.advance > 0
                            ? <span className="font-semibold text-emerald-600">+{fmtMoney(row.advance)}đ</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.expense > 0
                            ? <span className="text-red-500">-{fmtMoney(row.expense)}đ</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{row.note || '—'}</td>
                        <td className="px-4 py-3 text-center text-gray-600">
                          {row.trips > 0 ? (
                            <span>
                              {row.trips}
                              {row.overtime_trips > 0 && (
                                <span className="text-orange-500 text-xs ml-1">+{row.overtime_trips}OT</span>
                              )}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-semibold ${row.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            {fmtMoney(row.balance)}đ
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedFundDriver(null)}
                className="btn-primary text-sm px-5 py-2"
              >Đóng</button>
            </div>
          </div>
        </div>
      )}
      </>,
      document.body
    )}

    {createPortal(
      <>
      {/* ── Modal: Tài xế đã chi tháng ── */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <div className="bg-white w-full max-w-3xl mx-4 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                  <BanknotesIcon className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Tài xế đã chi tháng</h2>
                  <p className="text-xs text-gray-400">
                    Tháng {now.getMonth() + 1}/{now.getFullYear()}
                    {!expenseLoading && ` · ${expenseItems.length} yêu cầu chi`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExpenseModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold transition-colors"
              >✕</button>
            </div>

            {/* Body */}
            <div className="overflow-auto flex-1">
              {expenseLoading ? (
                <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                  <svg className="animate-spin w-5 h-5 mr-2 text-red-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Đang tải...
                </div>
              ) : expenseItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <p className="text-4xl mb-3">💸</p>
                  <p className="text-sm">Chưa có mục chi nào tháng này</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {['Ngày', 'Tài xế', 'Mã NV', 'Tiêu đề', 'Số tiền chi', 'Ghi chú'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {expenseItems.map((row: any, i: number) => (
                      <tr key={row._id ?? i} className="hover:bg-red-50/30 cursor-pointer transition-colors"
                        onClick={() => setSelectedExpense(row)}>
                        <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">
                          {fmtDate(row.date || row.created_at)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{row.driver_name}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{row.employee_id ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{row.title}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-bold text-red-500 text-base">
                            {fmtMoney(row.amount)}đ
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">{row.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-xs font-bold text-gray-700 uppercase">
                        Tổng cộng ({expenseItems.length} yêu cầu)
                      </td>
                      <td className="px-4 py-3 font-bold text-red-500 whitespace-nowrap text-base">
                        {fmtMoney(expenseItems.reduce((s: number, r: any) => s + r.amount, 0))}đ
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-400">Nhấn vào yêu cầu để xem chi tiết</span>
              <button onClick={() => setShowExpenseModal(false)} className="btn-outline text-sm px-4 py-1.5">Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Chi tiết yêu cầu chi ── */}
      {selectedExpense && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Chi tiết yêu cầu chi</h3>
              <button
                onClick={() => setSelectedExpense(null)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold"
              >✕</button>
            </div>
            <div className="p-6 space-y-0">
              {[
                { label: 'Tài xế',    value: selectedExpense.driver_name },
                { label: 'Mã NV',     value: selectedExpense.employee_id ?? '—' },
                { label: 'Ngày',      value: fmtDate(selectedExpense.date || selectedExpense.created_at) },
                { label: 'Tiêu đề',   value: selectedExpense.title },
                { label: 'Số tiền',   value: `${fmtMoney(selectedExpense.amount)}đ` },
                { label: 'Ghi chú',   value: selectedExpense.note || '—' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-start py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-500">{row.label}</span>
                  <span className={`text-sm font-semibold text-right max-w-[60%] ${row.label === 'Số tiền' ? 'text-red-500' : 'text-gray-900'}`}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setSelectedExpense(null)} className="btn-primary text-sm px-5 py-2">Đóng</button>
            </div>
          </div>
        </div>
      )}
      </>,
      document.body
    )}

    {/* ── Modal: Chi tiết lần cấp quỹ ── */}
    {createPortal(
      <>
      {selectedFundEntry && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Chi tiết lần cấp quỹ</h3>
              <button
                onClick={() => setSelectedFundEntry(null)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold"
              >✕</button>
            </div>
            <div className="p-6 space-y-0">
              {[
                { label: 'Tài xế',       value: selectedFundEntry.driver_name },
                { label: 'Mã NV',        value: selectedFundEntry.employee_id ?? '—' },
                { label: 'Ngày cấp',     value: fmtDate(selectedFundEntry.date || selectedFundEntry.created_at) },
                { label: 'Số tiền cấp',  value: `${fmtMoney(selectedFundEntry.advance)}đ`, highlight: 'emerald' },
                { label: 'Ghi chú',      value: selectedFundEntry.note || '—' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-start py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-500">{row.label}</span>
                  <span className={`text-sm font-semibold text-right max-w-[60%] ${
                    row.highlight === 'emerald' ? 'text-emerald-600' : 'text-gray-900'
                  }`}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setSelectedFundEntry(null)} className="btn-primary text-sm px-5 py-2">Đóng</button>
            </div>
          </div>
        </div>
      )}
      </>,
      document.body
    )}
    </>
  );
}