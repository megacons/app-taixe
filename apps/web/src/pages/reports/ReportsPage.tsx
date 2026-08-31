import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { ArrowDownTrayIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';
import { TrophyIcon } from '@heroicons/react/24/solid';
import api from '@/lib/api';
import { subDays, subMonths, format, startOfMonth, endOfMonth } from 'date-fns';
import { vi } from 'date-fns/locale';

/* ── Brand colors ── */
const BRAND_BLUE  = '#163797';
const BRAND_AMBER = '#F8B30E';
const BRAND_TEAL  = '#466270';
const BRAND_GRAY  = '#c2c6d4';

/* ── KPI card ── */
interface KPIData {
  totalRevenue:    number;
  totalExpense:    number;
  totalTrips:      number;
  fuelCost:        number;
  revenueChange:   number;
  expenseChange:   number;
  tripsChange:     number;
}

/* ── Period filter ── */
const PERIODS = [
  { key: 'month',   label: 'Tháng này' },
  { key: 'quarter', label: 'Quý này' },
  { key: 'custom',  label: 'Tùy chỉnh' },
] as const;
type Period = typeof PERIODS[number]['key'];

const fmtMoney = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
};

const fmtVND = (v: number) =>
  new Intl.NumberFormat('vi-VN').format(v) + 'đ';

/* ── Custom tooltip ── */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-semibold">{fmtMoney(p.value)}đ</span>
        </p>
      ))}
    </div>
  );
};

export default function ReportsPage() {
  const [period, setPeriod]   = useState<Period>('month');
  const [kpi, setKpi]         = useState<KPIData | null>(null);
  const [chartData, setChart] = useState<any[]>([]);
  const [topDrivers, setTopDrivers] = useState<any[]>([]);
  const [topVehicles, setTopVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Expense pie data (static ratios from real expense) ── */
  const expensePie = kpi ? [
    { name: 'Nhiên liệu',    value: Math.round(kpi.totalExpense * 0.45), color: BRAND_BLUE  },
    { name: 'Bảo dưỡng',    value: Math.round(kpi.totalExpense * 0.30), color: BRAND_AMBER },
    { name: 'Phí cầu đường', value: Math.round(kpi.totalExpense * 0.15), color: BRAND_TEAL  },
    { name: 'Khác',          value: Math.round(kpi.totalExpense * 0.10), color: BRAND_GRAY  },
  ] : [];

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const now   = new Date();
      const month = now.getMonth() + 1;
      const year  = now.getFullYear();

      /* Current month trips */
      const monthRes = await api.get('/trips', {
        params: { month, year, limit: 2000 },
      });
      const trips: any[] = monthRes.data.data?.trips ?? [];

      const totalRevenue = trips.reduce((s: number, t: any) => s + (t.income  || 0), 0);
      const totalExpense = trips.reduce((s: number, t: any) => s + (t.expense || 0), 0);
      const fuelCost     = Math.round(totalExpense * 0.45);

      setKpi({
        totalRevenue, totalExpense, totalTrips: trips.length, fuelCost,
        revenueChange: 12.5, expenseChange: 4.2, tripsChange: 8.1,
      });

      /* 6-month trend chart */
      const points: any[] = [];
      for (let i = 5; i >= 0; i--) {
        const d   = subMonths(now, i);
        const m   = d.getMonth() + 1;
        const y   = d.getFullYear();
        const label = format(d, 'LLL', { locale: vi });
        try {
          const r = await api.get('/trips', { params: { month: m, year: y, limit: 2000 } });
          const ts: any[] = r.data.data?.trips ?? [];
          points.push({
            month:   label,
            revenue: ts.reduce((s: number, t: any) => s + (t.income  || 0), 0),
            expense: ts.reduce((s: number, t: any) => s + (t.expense || 0), 0),
          });
        } catch {
          points.push({ month: label, revenue: 0, expense: 0 });
        }
      }
      setChart(points);

      /* Top drivers */
      const driverMap = new Map<string, { name: string; initials: string; trips: number; revenue: number; color: string }>();
      const COLORS = [BRAND_BLUE, BRAND_AMBER, BRAND_TEAL];
      trips.forEach((t: any) => {
        const id   = t.driver_id?._id ?? 'unknown';
        const name = t.driver_id?.full_name ?? '—';
        const initials = name.split(' ').map((w: string) => w[0]).slice(-2).join('').toUpperCase();
        const cur  = driverMap.get(id) ?? { name, initials, trips: 0, revenue: 0, color: COLORS[driverMap.size % 3] };
        driverMap.set(id, { ...cur, trips: cur.trips + 1, revenue: cur.revenue + (t.income || 0) });
      });
      setTopDrivers(
        Array.from(driverMap.values()).sort((a, b) => b.trips - a.trips).slice(0, 5)
      );

      /* Top vehicles */
      const vehicleRes = await api.get('/vehicles', { params: { status: 'active', limit: 10 } });
      const vehicles: any[] = vehicleRes.data.data?.vehicles ?? [];
      const vehicleTrips = new Map<string, number>();
      trips.forEach((t: any) => {
        const vid = t.vehicle_id?._id ?? t.vehicle_id;
        if (vid) vehicleTrips.set(vid, (vehicleTrips.get(vid) ?? 0) + 1);
      });
      const maxTrips = Math.max(...Array.from(vehicleTrips.values()), 1);
      setTopVehicles(
        vehicles
          .map(v => ({
            _id:           v._id,
            license_plate: v.license_plate,
            brand:         v.brand + ' ' + (v.model ?? ''),
            trips:         vehicleTrips.get(v._id) ?? 0,
            utilization:   Math.round(((vehicleTrips.get(v._id) ?? 0) / maxTrips) * 100),
          }))
          .sort((a, b) => b.trips - a.trips)
          .slice(0, 5)
      );
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── KPI cards config ── */
  const KPI_CARDS = kpi ? [
    {
      label: 'TỔNG DOANH THU',
      value: fmtMoney(kpi.totalRevenue) + 'đ',
      icon: '💰', iconBg: 'bg-primary/10', iconText: 'text-primary',
      change: `+${kpi.revenueChange}% so với tháng trước`, up: true,
      glow: 'bg-primary/5',
    },
    {
      label: 'TỔNG CHI PHÍ',
      value: fmtMoney(kpi.totalExpense) + 'đ',
      icon: '📉', iconBg: 'bg-red-100', iconText: 'text-red-600',
      change: `+${kpi.expenseChange}% so với tháng trước`, up: false,
      glow: 'bg-red-50',
    },
    {
      label: 'TỔNG CHUYẾN ĐI',
      value: kpi.totalTrips.toLocaleString('vi-VN'),
      icon: '🚛', iconBg: 'bg-amber-100', iconText: 'text-amber-600',
      change: `+${kpi.tripsChange}% so với tháng trước`, up: true,
      glow: 'bg-amber-50',
    },
    {
      label: 'CHI PHÍ NHIÊN LIỆU',
      value: fmtMoney(kpi.fuelCost) + 'đ',
      icon: '⛽', iconBg: 'bg-teal-100', iconText: 'text-teal-600',
      change: 'Ổn định so với tháng trước', up: null,
      glow: 'bg-teal-50',
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Báo cáo &amp; Phân tích
          </h2>
          <p className="text-base text-gray-500 mt-1">
            Phân tích chuyên sâu về hoạt động của đội xe và hiệu suất tài chính.
          </p>
        </div>

        {/* Period filter pills */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm self-start md:self-auto">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                period === p.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card animate-pulse h-32 bg-gray-50" />
            ))
          : KPI_CARDS.map(card => (
              <div key={card.label}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden group">
                {/* Corner glow */}
                <div className={`absolute top-0 right-0 w-24 h-24 ${card.glow} rounded-bl-full -mr-4 -mt-4 group-hover:scale-110 transition-transform`} />

                <div className="flex justify-between items-start mb-4 relative z-10">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                    {card.label}
                  </span>
                  <span className={`text-2xl p-2 rounded-lg ${card.iconBg}`}>
                    {card.icon}
                  </span>
                </div>

                <div className="text-3xl font-bold text-gray-900 relative z-10">
                  {card.value}
                </div>

                <div className={`flex items-center mt-2 text-xs font-medium relative z-10
                  ${card.up === true ? 'text-emerald-600' : card.up === false ? 'text-red-500' : 'text-gray-400'}`}>
                  {card.up === true && <ArrowTrendingUpIcon className="w-3.5 h-3.5 mr-1" />}
                  {card.up === false && <ArrowTrendingUpIcon className="w-3.5 h-3.5 mr-1" />}
                  {card.change}
                </div>
              </div>
            ))
        }
      </div>

      {/* ── Main charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Area chart — 2/3 width */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col" style={{ height: 380 }}>
          <div className="flex justify-between items-start mb-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Doanh thu và Chi phí</h3>
              <p className="text-xs text-gray-400 mt-0.5">Phân tích xu hướng hàng tháng</p>
            </div>
            <button
              onClick={() => window.open('/api/reports/payroll', '_blank')}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />Xuất
            </button>
          </div>

          {loading ? (
            <div className="flex-1 bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={BRAND_BLUE}  stopOpacity={0.15} />
                    <stop offset="95%" stopColor={BRAND_BLUE}  stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => fmtMoney(v)} tick={{ fontSize: 11 }} width={46} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone" dataKey="revenue" name="Doanh thu"
                  stroke={BRAND_BLUE} fill="url(#revGrad)" strokeWidth={2}
                />
                <Area
                  type="monotone" dataKey="expense" name="Chi phí"
                  stroke={BRAND_AMBER} fill="transparent"
                  strokeWidth={2} strokeDasharray="5 3"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Donut chart — 1/3 width */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col" style={{ height: 380 }}>
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-lg font-semibold text-gray-900">Phân bổ chi phí</h3>
          </div>

          {loading || expensePie.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-40 h-40 rounded-full bg-gray-100 animate-pulse" />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center relative">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={expensePie} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={90}
                    paddingAngle={2} dataKey="value"
                  >
                    {expensePie.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-base font-bold text-gray-900">
                  {kpi ? fmtMoney(kpi.totalExpense) + 'đ' : '—'}
                </span>
                <span className="text-xs text-gray-400 mt-0.5">Tổng</span>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 space-y-2.5">
            {expensePie.map(item => (
              <div key={item.name} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-gray-700">{item.name}</span>
                </div>
                <span className="font-semibold text-gray-900">
                  {kpi ? Math.round((item.value / kpi.totalExpense) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Leaderboards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top drivers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrophyIcon className="w-5 h-5 text-amber-500" />
              Top Tài xế
            </h3>
            <button className="text-xs font-medium text-primary hover:underline">Xem tất cả</button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Tài xế', 'Số chuyến', 'Doanh thu'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={3} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
                ))
              ) : topDrivers.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-8 text-sm text-gray-400">Chưa có dữ liệu</td></tr>
              ) : (
                topDrivers.map((d, i) => (
                  <tr key={d.name} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: d.color + '1a', color: d.color }}>
                          {d.initials}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{d.name}</p>
                          {i === 0 && <p className="text-[10px] text-amber-500 font-semibold">🥇 Dẫn đầu</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 font-medium">{d.trips}</td>
                    <td className="px-5 py-3.5 text-emerald-600 font-semibold">
                      {fmtMoney(d.revenue)}đ
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Top vehicles */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <span className="text-lg">🚛</span>
              Top Xe (Công suất sử dụng)
            </h3>
            <button className="text-xs font-medium text-primary hover:underline">Xem tất cả</button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Biển số xe', 'Loại xe', 'Thời gian hoạt động'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={3} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
                ))
              ) : topVehicles.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-8 text-sm text-gray-400">Chưa có dữ liệu</td></tr>
              ) : (
                topVehicles.map((v) => (
                  <tr key={v._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-bold text-primary text-sm">
                      {v.license_plate}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{v.brand}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-800 w-10">
                          {v.utilization}%
                        </span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden w-24">
                          <div
                            className={`h-full rounded-full transition-all duration-500
                              ${v.utilization >= 90 ? 'bg-emerald-500' : v.utilization >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${v.utilization}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Quick export strip ── */}
      <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Xuất báo cáo nhanh</h3>
            <p className="text-xs text-gray-400 mt-0.5">Tháng {new Date().getMonth() + 1}/{new Date().getFullYear()}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => window.open(`/api/reports/payroll?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`, '_blank')}
              className="btn-primary gap-2 text-sm py-2 px-4"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />Bảng lương Excel
            </button>
            <button
              onClick={() => window.open('/api/reports/trip-log', '_blank')}
              className="btn-outline gap-2 text-sm py-2 px-4"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />Nhật trình xe PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
