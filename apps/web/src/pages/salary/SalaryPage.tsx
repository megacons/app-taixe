import { useEffect, useState, useCallback } from 'react';
import {
  PencilSquareIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import ExcelJS from 'exceljs';
import { useAuthStore } from '@/stores/authStore';
import { saveAs } from 'file-saver';
import { saveWorkbook } from '@/lib/exportExcel';

/* ── helpers ─────────────────────────────── */
const fmtVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v ?? 0);

/** Nhập số → format có dấu chấm kiểu vi-VN */
const toDisplay = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('vi-VN').format(Number(digits));
};
const toNumber = (display: string) => Number(display.replace(/\D/g, '')) || 0;

/* ── constants ──────────────────────────── */
const STATUS_LABEL: Record<string, string> = {
  active: 'Hoạt động', inactive: 'Không HĐ',
  on_leave: 'Nghỉ phép', suspended: 'Đình chỉ',
};
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-gray-100 text-gray-500',
  on_leave: 'bg-yellow-100 text-yellow-700',
  suspended: 'bg-red-100 text-red-600',
};

/* ── types ─────────────────────────────── */
interface Driver {
  _id: string;
  full_name: string;
  phone: string;
  employee_id?: string;
  status: string;
  base_salary: number;
  position_allowance: number;
  fuel_allowance: number;
  overtime_rate: number;
  salary_note?: string;
  user_id?: { avatar?: string | null } | null;
  // computed from API
  total_trips_month: number;
  overtime_trips_month: number;
  overtime_pay_month: number;
  advance_month: number;
  expense_month: number;
  bank_account?: string;
  bank_name?: string;
}

interface EditForm {
  base_salary: string;
  position_allowance: string;
  fuel_allowance: string;
  overtime_rate: string;
  note: string;
}

const getImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

/* ── component ─────────────────────────── */
export default function SalaryPage() {
  const now = new Date();
  const { user } = useAuthStore();
  const canEdit = user?.role === 'manager' || user?.role === 'coordinator' || user?.role === 'accountant';
  const [month, setMonth]     = useState(now.getMonth() + 1);
  const [year, setYear]       = useState(now.getFullYear());
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  // Modal danh sách lần ứng tiền
  const [advanceDriver, setAdvanceDriver]     = useState<Driver | null>(null);
  const [advanceList, setAdvanceList]         = useState<any[]>([]);
  const [advanceLoading, setAdvanceLoading]   = useState(false);
  const [deletingAdvance, setDeletingAdvance] = useState<string | null>(null);
  const [editId, setEditId]   = useState<string | null>(null);
  const [form, setForm]       = useState<EditForm>({
    base_salary: '', position_allowance: '', fuel_allowance: '', overtime_rate: '', note: '',
  });
  const [saving, setSaving] = useState(false);

  const loadDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/drivers/salary/list', { params: { month, year } });
      setDrivers(res.data.data?.drivers ?? []);
    } catch {
      toast.error('Không tải được danh sách lương');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { loadDrivers(); }, [loadDrivers]);

  const openEdit = (d: Driver) => {
    setEditId(d._id);
    setForm({
      base_salary:        toDisplay(String(d.base_salary ?? 0)),
      position_allowance: toDisplay(String(d.position_allowance ?? 0)),
      fuel_allowance:     toDisplay(String(d.fuel_allowance ?? 0)),
      overtime_rate:      toDisplay(String(d.overtime_rate ?? 0)),
      note:               d.salary_note ?? '',
    });
  };

  const cancelEdit = () => setEditId(null);

  /* ── Mở modal lần ứng tiền ── */
  const openAdvanceModal = async (d: Driver) => {
    setAdvanceDriver(d);
    setAdvanceLoading(true);
    setAdvanceList([]);
    try {
      const res = await api.get('/requests', {
        params: { type: 'salary_advance', status: 'approved', driverId: d._id, limit: 100 },
      });
      // Lọc theo tháng
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const all: any[] = res.data.data?.requests ?? [];
      const filtered = all.filter(r => {
        const d = r.created_at?.slice(0, 7);
        return d === monthStr;
      });
      setAdvanceList(filtered);
    } catch { setAdvanceList([]); }
    finally { setAdvanceLoading(false); }
  };

  /* ── Xóa 1 lần ứng tiền ── */
  const deleteAdvance = async (requestId: string) => {
    if (!confirm('Xóa lần ứng tiền này?')) return;
    setDeletingAdvance(requestId);
    try {
      await api.delete(`/requests/${requestId}`);
      setAdvanceList(prev => prev.filter(r => r._id !== requestId));
      toast.success('Đã xóa lần ứng tiền');
      loadDrivers();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Xóa thất bại');
    } finally {
      setDeletingAdvance(null);
    }
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      await api.put(`/drivers/${id}/salary`, {
        base_salary:        toNumber(form.base_salary),
        position_allowance: toNumber(form.position_allowance),
        fuel_allowance:     toNumber(form.fuel_allowance),
        overtime_rate:      toNumber(form.overtime_rate),
        note:               form.note,
      });
      toast.success('Cập nhật lương thành công');
      setEditId(null);
      loadDrivers();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Cập nhật thất bại');
    } finally {
      setSaving(false);
    }
  };

  const resetSalary = async (id: string, name: string) => {
    if (!confirm(`Đặt lại lương của ${name} về 0?`)) return;
    setSaving(true);
    try {
      await api.put(`/drivers/${id}/salary`, {
        base_salary: 0, position_allowance: 0, fuel_allowance: 0, overtime_rate: 0, note: '',
      });
      toast.success('Đã đặt lại lương');
      loadDrivers();
    } catch {
      toast.error('Thất bại');
    } finally {
      setSaving(false);
    }
  };

  const setMoney = (field: keyof EditForm, raw: string) =>
    setForm(f => ({ ...f, [field]: toDisplay(raw) }));

  /* ── Export Excel ── */
  const exportExcel = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Nam Thanh Transport';
    wb.created = new Date();
    const ws = wb.addWorksheet(`Lương T${month}-${year}`);

    ws.columns = [
      { key: 'name',     width: 22 },
      { key: 'base',     width: 20 },
      { key: 'ot_pay',   width: 20 },
      { key: 'ot_trips', width: 14 },
      { key: 'expense',  width: 20 },
      { key: 'advance',  width: 20 },
      { key: 'total',    width: 20 },
      { key: 'stk',      width: 20 },
      { key: 'bank',     width: 18 },
    ];

    // Header
    const hRow = ws.addRow(['Tên tài xế', 'Lương cơ bản (đ)', 'Lương tăng ca (đ)', 'Số chuyến TC', 'Tiền đã chi (đ)', 'Tiền ứng (đ)', 'Tổng lương (đ)', 'STK', 'Ngân hàng']);
    hRow.height = 20;
    hRow.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Data rows
    filtered.forEach((d, i) => {
      const basePlusAllowance = (d.base_salary ?? 0) + (d.position_allowance ?? 0) + (d.fuel_allowance ?? 0);
      const totalSalary = basePlusAllowance + (d.overtime_pay_month ?? 0) + (d.expense_month ?? 0) - (d.advance_month ?? 0);
      const bgColor = i % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FF';

      const row = ws.addRow([
        d.full_name,
        d.base_salary ?? 0,
        d.overtime_pay_month ?? 0,
        d.overtime_trips_month ?? 0,
        d.expense_month ?? 0,
        d.advance_month ?? 0,
        totalSalary,
        d.bank_account ?? '',
        d.bank_name ?? '',
      ]);
      row.height = 18;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.border = { top: { style: 'thin', color: { argb: 'FFE0E0E0' } }, bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } }, left: { style: 'thin', color: { argb: 'FFE0E0E0' } }, right: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
        if (col === 2) { cell.numFmt = '#,##0'; cell.font = { color: { argb: 'FF1F497D' }, bold: true }; cell.alignment = { horizontal: 'right' }; }
        if (col === 3) { cell.numFmt = '#,##0'; cell.font = { color: { argb: (d.overtime_pay_month ?? 0) > 0 ? 'FFB45309' : 'FF666666' } }; cell.alignment = { horizontal: 'right' }; }
        if (col === 4) { cell.alignment = { horizontal: 'center' }; }
        if (col === 5) { cell.numFmt = '#,##0'; cell.font = { color: { argb: 'FF006600' } }; cell.alignment = { horizontal: 'right' }; }
        if (col === 6) { cell.numFmt = '#,##0'; cell.font = { color: { argb: 'FFCC0000' } }; cell.alignment = { horizontal: 'right' }; }
        if (col === 7) { cell.numFmt = '#,##0'; cell.font = { bold: true, color: { argb: 'FF006600' } }; cell.alignment = { horizontal: 'right' }; }
      });
    });

    // Dòng tổng
    const tRow = ws.addRow([
      'Tổng cộng',
      filtered.reduce((s, d) => s + (d.base_salary ?? 0), 0),
      filtered.reduce((s, d) => s + (d.overtime_pay_month ?? 0), 0),
      filtered.reduce((s, d) => s + (d.overtime_trips_month ?? 0), 0),
      filtered.reduce((s, d) => s + (d.expense_month ?? 0), 0),
      filtered.reduce((s, d) => s + (d.advance_month ?? 0), 0),
      totalGrand,
      '', '',
    ]);
    tRow.height = 20;
    tRow.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE599' } };
      cell.font   = { bold: true, size: 11 };
      cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
      if (col === 2 || col === 3 || col === 5 || col === 6 || col === 7) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' }; }
      if (col === 4) { cell.alignment = { horizontal: 'center' }; }
    });

    await saveWorkbook(wb, `Luong_TaiXe_T${month}_${year}.xlsx`);
    toast.success('Đã xuất file Excel');
  };

  const filtered = drivers.filter(d =>
    d.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (d.phone ?? '').includes(search) ||
    (d.employee_id ?? '').toLowerCase().includes(search.toLowerCase())
  );

  /* live total while editing */
  const liveBase = toNumber(form.base_salary) + toNumber(form.position_allowance) + toNumber(form.fuel_allowance);
  const totalBase        = filtered.reduce((s, d) => s + (d.base_salary ?? 0), 0);
  const totalOvertimePay = filtered.reduce((s, d) => s + (d.overtime_pay_month ?? 0), 0);
  const totalAdvance     = filtered.reduce((s, d) => s + (d.advance_month ?? 0), 0);
  const totalExpense     = filtered.reduce((s, d) => s + (d.expense_month ?? 0), 0);
  const totalGrand       = totalBase + totalOvertimePay + totalExpense - totalAdvance;

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Lương tài xế</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Lương cơ bản + phụ cấp + tiền tăng ca (mỗi ngày &gt; 4 chuyến tính tăng ca)
          </p>
        </div>
        {/* Month picker + Export */}
        <div className="flex items-center gap-2 self-start">
          <MonthYearPicker
            month={month}
            year={year}
            onChange={(m, y) => { setMonth(m); setYear(y); }}
          />
          <button
            onClick={exportExcel}
            disabled={loading || filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card py-4 px-5">
          <p className="text-xs text-gray-500 mb-1">Tổng tài xế</p>
          <p className="text-2xl font-bold text-gray-900">
            {filtered.length} <span className="text-sm font-normal text-gray-400">người</span>
          </p>
        </div>
        <div className="card py-4 px-5">
          <p className="text-xs text-gray-500 mb-1">Tổng lương + phụ cấp</p>
          <p className="text-2xl font-bold text-primary">
            {fmtVND(totalBase)}<span className="text-sm font-normal text-gray-400 ml-1">đ</span>
          </p>
        </div>
        <div className="card py-4 px-5">
          <p className="text-xs text-gray-500 mb-1">Tổng tiền tăng ca</p>
          <p className="text-2xl font-bold text-amber-600">
            {fmtVND(totalOvertimePay)}<span className="text-sm font-normal text-gray-400 ml-1">đ</span>
          </p>
        </div>
        <div className="card py-4 px-5 border-primary/30 bg-primary/5">
          <p className="text-xs text-gray-500 mb-1">Tổng chi lương tháng</p>
          <p className="text-2xl font-bold text-primary">
            {fmtVND(totalGrand)}<span className="text-sm font-normal text-gray-400 ml-1">đ</span>
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="card p-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm tên, SĐT, mã NV..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9 w-full sm:w-72"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left   text-xs font-semibold text-gray-500 uppercase tracking-wide">Tài xế</th>
                <th className="px-4 py-3 text-left   text-xs font-semibold text-gray-500 uppercase tracking-wide">Trạng thái</th>
                <th className="px-4 py-3 text-right  text-xs font-semibold text-gray-500 uppercase tracking-wide">Lương cơ bản</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-amber-600 uppercase tracking-wide">Chuyến TC</th>
                <th className="px-4 py-3 text-right  text-xs font-semibold text-gray-500   uppercase tracking-wide">Đơn giá TC</th>
                <th className="px-4 py-3 text-right  text-xs font-semibold text-amber-600 uppercase tracking-wide">Tiền TC</th>
                <th className="px-4 py-3 text-right  text-xs font-semibold text-emerald-600 uppercase tracking-wide">Tiền đã chi</th>
                <th className="px-4 py-3 text-right  text-xs font-semibold text-red-500   uppercase tracking-wide">Tiền ứng</th>
                <th className="px-4 py-3 text-right  text-xs font-semibold text-primary  uppercase tracking-wide">Tổng lương</th>
                {canEdit && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Sửa</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 11 }).map((__, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-gray-400">
                    <p className="text-3xl mb-2">👤</p>
                    <p>Không tìm thấy tài xế</p>
                  </td>
                </tr>
              ) : (
                filtered.map(d => {
                  const isEditing   = editId === d._id;
                  const basePlusAllowance = (d.base_salary ?? 0) + (d.position_allowance ?? 0) + (d.fuel_allowance ?? 0);
                  const totalSalary = basePlusAllowance + (d.overtime_pay_month ?? 0) + (d.expense_month ?? 0) - (d.advance_month ?? 0);
                  const liveOvertimePay = toNumber(form.overtime_rate) * (d.overtime_trips_month ?? 0);
                  const liveTotal   = liveBase + liveOvertimePay + (d.expense_month ?? 0) - (d.advance_month ?? 0);

                  return (
                    <tr key={d._id} className={`hover:bg-gray-50 transition-colors ${isEditing ? 'bg-blue-50/40' : ''}`}>
                      {/* Tài xế */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {(() => {
                            const avatarUrl = getImageUrl(d.user_id?.avatar);
                            return avatarUrl ? (
                              <img src={avatarUrl} alt={d.full_name}
                                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {d.full_name.charAt(0).toUpperCase()}
                              </div>
                            );
                          })()}
                          <div>
                            <p className="font-semibold text-gray-900">{d.full_name}</p>
                          </div>
                        </div>
                      </td>

                      {/* Trạng thái */}
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLOR[d.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABEL[d.status] ?? d.status}
                        </span>
                      </td>

                      {/* Lương cơ bản */}
                      <td className="px-4 py-3.5 text-right">
                        {isEditing ? (
                          <input type="text" inputMode="numeric" className="input text-right w-32"
                            value={form.base_salary} onChange={e => setMoney('base_salary', e.target.value)} placeholder="0" />
                        ) : (
                          <span className="font-semibold text-gray-900">{fmtVND(d.base_salary)}đ</span>
                        )}
                      </td>

                      {/* PC chức vụ — ẩn */}
                      {/* PC xăng — ẩn */}
                      {/* Đơn giá tăng ca — ẩn */}

                      {/* Số chuyến tăng ca — chỉ đọc, tính từ trips */}
                      <td className="px-4 py-3.5 text-center">
                        {(d.overtime_trips_month ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 font-bold text-sm px-2.5 py-0.5 rounded-full border border-amber-200">
                            🔥 {d.overtime_trips_month}
                          </span>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>

                      {/* Đơn giá tăng ca */}
                      <td className="px-4 py-3.5 text-right">
                        {isEditing ? (
                          <input type="text" inputMode="numeric" className="input text-right w-28"
                            value={form.overtime_rate} onChange={e => setMoney('overtime_rate', e.target.value)} placeholder="0" />
                        ) : (
                          <span className="text-gray-600">{fmtVND(d.overtime_rate ?? 0)}đ</span>
                        )}
                      </td>

                      {/* Tiền tăng ca — tính tự động */}
                      <td className="px-4 py-3.5 text-right">
                        <span className={`font-semibold ${(d.overtime_pay_month ?? 0) > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                          {fmtVND(d.overtime_pay_month ?? 0)}đ
                        </span>
                      </td>

                      {/* Tiền đã chi — hoàn trả vào lương */}
                      <td className="px-4 py-3.5 text-right">
                        {(d.expense_month ?? 0) > 0 ? (
                          <span className="font-semibold text-emerald-600">
                            +{fmtVND(d.expense_month)}đ
                          </span>
                        ) : (
                          <span className="text-gray-300">0đ</span>
                        )}
                      </td>

                      {/* Tiền ứng — click để xem chi tiết */}
                      <td className="px-4 py-3.5 text-right">
                        {(d.advance_month ?? 0) > 0 ? (
                          <button
                            onClick={() => openAdvanceModal(d)}
                            className="font-semibold text-red-500 hover:text-red-700 hover:underline transition-colors"
                            title="Nhấn để xem các lần ứng tiền"
                          >
                            -{fmtVND(d.advance_month)}đ
                          </button>
                        ) : (
                          <span className="text-gray-300">0đ</span>
                        )}
                      </td>

                      {/* Tổng lương */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-bold text-primary">
                          {fmtVND(isEditing ? liveTotal : totalSalary)}đ
                        </span>
                      </td>

                      {/* Ghi chú — ẩn */}

                      {/* Thao tác */}
                      {canEdit && (
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          {isEditing ? (
                            <>
                              <button onClick={() => saveEdit(d._id)} disabled={saving}
                                className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors" title="Lưu">
                                <CheckCircleIcon className="w-4 h-4" />
                              </button>
                              <button onClick={cancelEdit}
                                className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors" title="Hủy">
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => openEdit(d)}
                                className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors" title="Sửa lương">
                                <PencilSquareIcon className="w-4 h-4" />
                              </button>
                              <button onClick={() => resetSalary(d._id, d.full_name)}
                                className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Đặt lại về 0">
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Footer */}
            {!loading && filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-800 text-sm">
                  <td colSpan={2} className="px-4 py-3">Tổng cộng ({filtered.length} tài xế)</td>
                  <td className="px-4 py-3 text-right">{fmtVND(filtered.reduce((s, d) => s + (d.base_salary ?? 0), 0))}đ</td>
                  <td className="px-4 py-3 text-center text-amber-600">
                    {filtered.reduce((s, d) => s + (d.overtime_trips_month ?? 0), 0)} chuyến
                  </td>
                  <td />
                  <td className="px-4 py-3 text-right text-amber-600">{fmtVND(totalOvertimePay)}đ</td>
                  <td className="px-4 py-3 text-right text-emerald-600">+{fmtVND(totalExpense)}đ</td>
                  <td className="px-4 py-3 text-right text-red-500">-{fmtVND(totalAdvance)}đ</td>
                  <td className="px-4 py-3 text-right text-primary">{fmtVND(totalGrand)}đ</td>
                  {canEdit && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Chú thích */}
      <div className="text-xs text-gray-400 space-y-0.5">
        <p>* <span className="font-semibold text-amber-600">Chuyến tăng ca</span>: mỗi ngày tài xế chạy trên 4 chuyến, mỗi chuyến dư tính là 1 chuyến TC.</p>
        <p>* <span className="font-semibold">Tiền TC</span> = Số chuyến TC trong tháng × Đơn giá TC của tài xế.</p>
        <p>* Đơn giá TC mặc định 0đ — admin đặt riêng cho từng tài xế.</p>
      </div>
    </div>

      {/* ── Modal: Danh sách lần ứng tiền ── */}
      {advanceDriver && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 text-base">
                  Tiền ứng — {advanceDriver.full_name}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Tháng {month}/{year} · Đã duyệt
                </p>
              </div>
              <button onClick={() => setAdvanceDriver(null)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold">✕</button>
            </div>

            <div className="overflow-auto flex-1">
              {advanceLoading ? (
                <div className="py-12 text-center text-gray-400 text-sm">Đang tải...</div>
              ) : advanceList.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  <p className="text-3xl mb-2">💵</p>
                  Không có lần ứng nào được duyệt tháng này
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['STT', 'Ngày gửi', 'Số tiền', 'Lý do', 'Trạng thái', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-100">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {advanceList.map((r, i) => (
                      <tr key={r._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-red-500 whitespace-nowrap">
                          {new Intl.NumberFormat('vi-VN').format(r.payload?.amount ?? 0)}đ
                        </td>
                        <td className="px-4 py-3 text-gray-600 break-words" style={{ wordBreak: 'break-word', maxWidth: '220px' }}>
                          {r.payload?.reason ?? r.title ?? '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="badge bg-green-100 text-green-700">Đã duyệt</span>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => deleteAdvance(r._id)}
                            disabled={deletingAdvance === r._id}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                            title="Xóa lần ứng này"
                          >
                            {deletingAdvance === r._id
                              ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                              : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            }
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-xs font-bold text-gray-700">
                        Tổng ({advanceList.length} lần đã duyệt)
                      </td>
                      <td className="px-4 py-3 font-bold text-red-500">
                        {new Intl.NumberFormat('vi-VN').format(
                          advanceList.reduce((s, r) => s + (r.payload?.amount ?? 0), 0)
                        )}đ
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setAdvanceDriver(null)} className="btn-primary text-sm px-5 py-2">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
