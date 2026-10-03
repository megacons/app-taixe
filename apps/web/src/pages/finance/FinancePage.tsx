import { useState, useCallback, useEffect } from 'react';
import {
  ArrowDownTrayIcon, ArrowPathIcon,
  DocumentTextIcon, TableCellsIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { ArrowTrendingUpIcon } from '@heroicons/react/24/solid';
import api from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import Pagination from '@/components/ui/Pagination';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import MonthYearPicker from '@/components/ui/MonthYearPicker';

/* ── Payroll row type ── */
interface PayrollRow {
  driver_id:    string;
  employee_id:  string;
  full_name:    string;
  department:   string;
  license_plate:string;
  base_salary:  number; // = total_income (chuyến)
  overtime_pay: number;
  reimbursed:   number; // = total_expense
  advance:      number;
  net_salary:   number; // base + overtime + reimbursed - advance
  trips:        number;
  overtime_trips: number;
  status:       'approved' | 'pending' | 'rejected';
}

const fmtVND = (v: number) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(v));

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  approved: { label: 'Đã Duyệt', cls: 'bg-green-100 text-green-700' },
  pending:  { label: 'Chờ Duyệt', cls: 'bg-amber-100 text-amber-700' },
  rejected: { label: 'Từ Chối',  cls: 'bg-red-100 text-red-700' },
};

export default function FinancePage() {
  const now = new Date();
  const [month, setMonth]   = useState(String(now.getMonth() + 1));
  const [year, setYear]     = useState(String(now.getFullYear()));
  const [dept, setDept]     = useState('');
  const [page, setPage]     = useState(1);
  const [rows, setRows]     = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  /* ── Load payroll data ── */
  const loadPayroll = useCallback(async () => {
    setLoading(true);
    try {
      /* 1. Get all drivers */
      const driverRes = await api.get('/drivers', { params: { limit: 200, status: 'active' } });
      const drivers: any[] = driverRes.data.data?.drivers ?? [];

      /* 2. For each driver, get trips this month */
      const payrollRows: PayrollRow[] = [];

      for (const d of drivers) {
        const tripRes = await api.get('/trips', {
          params: { driverId: d._id, month, year, limit: 2000 },
        });
        const trips: any[] = tripRes.data.data?.trips ?? [];

        /* 3. Get advances & expenses approved this month */
        const reqRes = await api.get('/requests', {
          params: { driverId: d._id, status: 'approved', limit: 100 },
        });
        const reqs: any[] = reqRes.data.data?.requests ?? [];

        const totalIncome   = trips.reduce((s, t) => s + (t.income  || 0), 0);
        const totalExpense  = trips.reduce((s, t) => s + (t.expense || 0), 0);
        const overtripCount = trips.filter(t => t.is_overtime).length;
        const overtimePay   = trips.reduce((s, t) => s + (t.overtime_pay || 0), 0);

        const advanceTotal  = reqs
          .filter(r => r.type === 'salary_advance')
          .reduce((s, r) => s + (r.payload?.amount || 0), 0);

        const expenseTotal  = reqs
          .filter(r => r.type === 'expense')
          .reduce((s, r) => s + (r.payload?.amount || 0), 0);

        const netSalary = totalIncome + overtimePay + expenseTotal - advanceTotal;

        payrollRows.push({
          driver_id:     d._id,
          employee_id:   d.employee_id ?? '—',
          full_name:     d.full_name,
          department:    d.department ?? 'Vận chuyển',
          license_plate: d.vehicle_id?.license_plate ?? '—',
          base_salary:   totalIncome,
          overtime_pay:  overtimePay,
          reimbursed:    expenseTotal,
          advance:       advanceTotal,
          net_salary:    Math.max(0, netSalary),
          trips:         trips.length,
          overtime_trips: overtripCount,
          status:        'pending',
        });
      }

      /* 4. Filter by dept */
      const filtered = dept
        ? payrollRows.filter(r => r.department.toLowerCase().includes(dept.toLowerCase()))
        : payrollRows;

      setRows(filtered);
      setLastUpdated(new Date().toLocaleTimeString('vi-VN') + ' - ' + format(new Date(), 'dd/MM/yyyy', { locale: vi }));
    } catch {
      toast.error('Không thể tải dữ liệu lương');
    } finally {
      setLoading(false);
    }
  }, [month, year, dept]);

  useEffect(() => { loadPayroll(); }, [month, year]);

  /* ── Totals ── */
  const totals = rows.reduce(
    (acc, r) => ({
      base:      acc.base      + r.base_salary,
      overtime:  acc.overtime  + r.overtime_pay,
      reimb:     acc.reimb     + r.reimbursed,
      advance:   acc.advance   + r.advance,
      net:       acc.net       + r.net_salary,
    }),
    { base: 0, overtime: 0, reimb: 0, advance: 0, net: 0 }
  );

  /* ── Pagination ── */
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ── Export ── */
  const exportExcel = () =>
    window.open(`/api/reports/payroll?month=${month}&year=${year}`, '_blank');

  const exportPDF = () =>
    window.open(`/api/reports/trip-log?from=${year}-${String(month).padStart(2,'0')}-01`, '_blank');

  const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Tháng ${i + 1}` }));

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bảng Tính Lương Tài Xế</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Quản lý và đối soát lương nhân viên vận tải hàng tháng.
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <button onClick={exportPDF} className="btn-outline gap-2 text-sm py-2.5 px-4">
            <DocumentTextIcon className="w-4 h-4" />
            Xuất PDF
          </button>
          <button onClick={exportExcel} className="btn-primary gap-2 text-sm py-2.5 px-4">
            <TableCellsIcon className="w-4 h-4" />
            Xuất Excel (Đối soát)
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="card flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="form-label text-xs">Tháng lương</label>
          <MonthYearPicker
            month={Number(month)}
            year={Number(year)}
            onChange={(m, y) => { setMonth(String(m)); setYear(String(y)); setPage(1); }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="form-label text-xs">Bộ phận</label>
          <select className="form-select text-sm h-9 min-w-[180px]" value={dept}
            onChange={e => { setDept(e.target.value); setPage(1); }}>
            <option value="">Tất cả bộ phận</option>
            <option value="Vận chuyển">Vận chuyển</option>
            <option value="Giao hàng">Giao hàng nhanh</option>
          </select>
        </div>
        <button onClick={loadPayroll} disabled={loading}
          className="btn-primary text-sm h-9 px-5 gap-2">
          {loading
            ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
            : <span className="text-sm">🔍</span>
          }
          Lọc dữ liệu
        </button>
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 italic">
          {lastUpdated && `Cập nhật lúc: ${lastUpdated}`}
          <button onClick={loadPayroll} className="p-1.5 rounded-full hover:bg-primary/10 text-primary">
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Main table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {[
                  { label: 'Mã NV',               align: 'left'  },
                  { label: 'Họ và Tên Tài Xế',    align: 'left'  },
                  { label: 'Số chuyến',            align: 'right' },
                  { label: 'Lương Cơ Bản',         align: 'right' },
                  { label: 'Lương Tăng Ca',        align: 'right' },
                  { label: 'Chi Phí Hoàn Trả',      align: 'right' },
                  { label: 'Tổng Tạm Ứng',        align: 'right' },
                  { label: 'Thực Lĩnh',            align: 'right', highlight: true },
                  { label: 'Trạng Thái',           align: 'center' },
                ].map(h => (
                  <th key={h.label}
                    className={`px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap
                      text-${h.align} ${h.highlight ? 'bg-primary/5 text-primary' : ''}`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && rows.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-14">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <span className="text-4xl">💼</span>
                      <p className="text-sm">Không có dữ liệu lương</p>
                      <p className="text-xs">Chọn tháng/năm khác hoặc kiểm tra dữ liệu chuyến xe</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map(row => {
                  const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.pending;
                  return (
                    <tr key={row.driver_id} className="hover:bg-primary/[0.02] transition-colors">
                      <td className="px-5 py-4 text-sm text-gray-600 font-mono">
                        {row.employee_id}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-900">{row.full_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {row.department} · {row.license_plate}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-sm text-gray-700">{row.trips}</span>
                        {row.overtime_trips > 0 && (
                          <span className="ml-1 text-[10px] text-amber-600 font-semibold">
                            +{row.overtime_trips}TC
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right text-sm text-gray-700">
                        {fmtVND(row.base_salary)}
                      </td>
                      <td className="px-5 py-4 text-right text-sm text-teal-600 font-medium">
                        {row.overtime_pay > 0 ? fmtVND(row.overtime_pay) : '—'}
                      </td>
                      <td className="px-5 py-4 text-right text-sm text-gray-700">
                        {row.reimbursed > 0 ? fmtVND(row.reimbursed) : '0'}
                      </td>
                      <td className="px-5 py-4 text-right text-sm text-red-500">
                        {row.advance > 0 ? fmtVND(row.advance) : '0'}
                      </td>
                      <td className="px-5 py-4 text-right bg-primary/5">
                        <span className="text-base font-bold text-primary">
                          {fmtVND(row.net_salary)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* ── Footer totals row ── */}
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-primary text-white">
                  <td colSpan={3} className="px-5 py-4 font-bold text-sm uppercase">
                    Tổng Cộng Toàn Bộ Nhân Viên
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-sm">
                    {fmtVND(totals.base)}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-sm">
                    {fmtVND(totals.overtime)}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-sm">
                    {fmtVND(totals.reimb)}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-sm text-red-200">
                    {fmtVND(totals.advance)}
                  </td>
                  <td className="px-5 py-4 text-right bg-primary-900/30">
                    <span className="text-lg font-black">{fmtVND(totals.net)}</span>
                  </td>
                  <td className="px-5 py-4" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination
            page={page} totalPages={totalPages}
            total={rows.length} limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* ── Summary bento cards ── */}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1 */}
          <div className="card hover:shadow-md transition-shadow">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Tổng Quỹ Lương Cơ Bản</p>
            <h4 className="text-2xl font-bold text-primary mt-2">
              {fmtVND(totals.base)}{' '}
              <span className="text-sm font-normal text-gray-400">VND</span>
            </h4>
            <div className="mt-3 flex items-center gap-1 text-emerald-600 text-xs font-semibold">
              <ArrowTrendingUpIcon className="w-3.5 h-3.5" />
              +2.4% so với tháng trước
            </div>
          </div>

          {/* Card 2 */}
          <div className="card hover:shadow-md transition-shadow">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Chi Phí Tăng Ca</p>
            <h4 className="text-2xl font-bold text-teal-600 mt-2">
              {fmtVND(totals.overtime)}{' '}
              <span className="text-sm font-normal text-gray-400">VND</span>
            </h4>
            <div className="mt-3 flex items-center gap-1 text-red-500 text-xs font-semibold">
              <ArrowTrendingUpIcon className="w-3.5 h-3.5" />
              Cao điểm vận chuyển
            </div>
          </div>

          {/* Card 3 */}
          <div className="card hover:shadow-md transition-shadow">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Tổng Hoàn Chi (Reimb.)</p>
            <h4 className="text-2xl font-bold text-gray-800 mt-2">
              {fmtVND(totals.reimb)}{' '}
              <span className="text-sm font-normal text-gray-400">VND</span>
            </h4>
            <div className="mt-3 flex items-center gap-1 text-gray-400 text-xs">
              ⛽ Chủ yếu là hóa đơn xăng dầu
            </div>
          </div>

          {/* Card 4 — highlight */}
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-5 relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="absolute top-3 right-3 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all">
              <span className="text-5xl">💼</span>
            </div>
            <p className="text-xs text-primary font-semibold uppercase tracking-wide">
              Tổng Thực Chi Lương
            </p>
            <h4 className="text-2xl font-black text-primary mt-2">
              {fmtVND(totals.net)}{' '}
              <span className="text-sm font-normal">VND</span>
            </h4>
            <button
              onClick={() => toast.success('Đã gửi yêu cầu phê duyệt toàn bộ lương!')}
              className="mt-4 w-full py-2 bg-primary text-white rounded-lg text-sm font-semibold
                hover:bg-primary-800 transition-colors active:scale-95"
            >
              Phê Duyệt Toàn Bộ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
