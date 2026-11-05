import React, { useState, useCallback } from 'react';
import { ArrowDownTrayIcon, DocumentTextIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { saveWorkbook } from '@/lib/exportExcel';
import { useApi } from '@/hooks/useApi';
import Modal from '@/components/ui/Modal';
import DateInput from '@/components/ui/DateInput';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import api from '@/lib/api';

/* ── helpers ── */
const fmtVND = (v: number) =>
  v ? new Intl.NumberFormat('vi-VN').format(v) : '—';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ v: i + 1, l: `Tháng ${i + 1}` }));

/* ── Export Excel theo format mẫu (có màu - dùng ExcelJS) ── */
async function exportFundExcel(params: {
  driverName: string;
  licensePlate: string;
  month: string;
  year: string;
  rows: DayRow[];
  requests: any[];
  totals: { advance: number; expense: number; remaining: number };
}) {
  const { driverName, licensePlate, month, year, rows, requests, totals } = params;

  type ExcelRow = { date: string; expense: number; note: string };
  const allRows: ExcelRow[] = [];
  requests
    .filter((r: any) => r.status === 'approved')  // chỉ xuất đã duyệt
    .forEach(r => {
    const date   = r.payload?.date ?? r.date ?? r.created_at?.slice(0, 10) ?? '';
    const amount = r.payload?.amount ?? r.amount ?? r.expense ?? 0;
    const note   = r.payload?.note ?? r.note ?? r.title ?? '';
    if (amount > 0) allRows.push({ date, expense: amount, note });
  });
  allRows.sort((a, b) => a.date.localeCompare(b.date));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nam Thanh Transport';
  wb.created = new Date();
  const ws = wb.addWorksheet(`Chi phí T${month}-${year}`);
  ws.columns = [
    { key: 'bsx', width: 14 }, { key: 'name', width: 22 }, { key: 'date', width: 14 },
    { key: 'expense', width: 20 }, { key: 'note', width: 50 },
  ];

  // Row 1: Tên tài xế
  const r1 = ws.addRow(['', '', '', '', `TÀI XẾ ${driverName.toUpperCase()}`]);
  r1.height = 22;
  r1.getCell(5).font      = { bold: true, size: 14, color: { argb: 'FF8B0000' } };
  r1.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.addRow([]); // Row 2 trống

  // Row 3: Header
  const hRow = ws.addRow(['BSX', 'Tên tài xế', 'Ngày tháng', 'Chi phí', 'Ghi chú']);
  hRow.height = 20;
  hRow.eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    cell.font      = { bold: true, size: 11, color: { argb: 'FF1F3864' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Data rows
  allRows.forEach((r, i) => {
    const row = ws.addRow([
      licensePlate,
      driverName,
      r.date ? format(new Date(r.date + 'T00:00:00'), 'd/M/yyyy') : '',
      r.expense > 0 ? r.expense : null,
      r.note,
    ]);
    row.height = 18;
    const bgColor = i % 2 === 0 ? 'FFFFFFFF' : 'FFF2F8FF';
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = { top: { style: 'thin', color: { argb: 'FFE0E0E0' } }, bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } }, left: { style: 'thin', color: { argb: 'FFE0E0E0' } }, right: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
      if (col === 4) { cell.numFmt = '#,##0'; cell.font = { color: { argb: 'FFCC0000' } }; cell.alignment = { horizontal: 'right' }; }
    });
  });

  // Dòng Tổng Cộng
  const tRow = ws.addRow(['Tổng Cộng', '', '', totals.expense, '']);
  tRow.height = 20;
  tRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    cell.font   = { bold: true, size: 11 };
    cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
    if (col === 4) { cell.numFmt = '#,##0'; cell.font = { bold: true, color: { argb: 'FFCC0000' } }; cell.alignment = { horizontal: 'right' }; }
  });

  await saveWorkbook(wb, `ChiPhi_${driverName.replace(/\s/g, '_')}_T${month}_${year}.xlsx`);
  toast.success('Đã xuất file Excel');
}

/* ── types ── */
interface DriverSummary {
  driver_id: string;
  full_name: string;
  employee_id: string;
  license_plate: string;
  phone: string;
  total_advance: number;
  total_expense: number;
  remaining: number;
  total_trips: number;
  overtime_trips: number;
}

interface DayRow {
  date: string;
  advance: number;
  expense: number;
  balance: number;
  note: string;
  trips: number;
  overtime_trips: number;
  entry_id: string | null;
}

interface FundDetail {
  driver: { _id: string; full_name: string; employee_id: string; license_plate: string };
  month: string;
  rows: DayRow[];
  totals: {
    advance: number; expense: number; remaining: number;
    trips: number; overtime_trips: number;
  };
}

/* ══════════════════════════════════════════════════════
 *  MAIN PAGE
 * ══════════════════════════════════════════════════════ */
export default function DriverFundPage() {
  const now = new Date();
  const [month, setMonth]       = useState(String(now.getMonth() + 1));
  const [year, setYear]         = useState(String(now.getFullYear()));
  const [selected, setSelected] = useState<DriverSummary | null>(null);
  const [detail, setDetail]     = useState<FundDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editRow, setEditRow]         = useState<DayRow | null>(null);
  const [delRow, setDelRow]           = useState<DayRow | null>(null);
  const [delLoading, setDelLoading]   = useState(false);
  const [viewExpenses, setViewExpenses]       = useState<DriverSummary | null>(null);
  const [expenses, setExpenses]               = useState<any[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [editExpense, setEditExpense]         = useState<any | null>(null);
  const [reqList, setReqList]   = useState<any[]>([]);
  const [reqLoading, setReqLoading] = useState(false);

  const { data, loading, refetch } = useApi<any>('/fund/drivers', { month, year });
  const drivers: DriverSummary[] = data?.drivers ?? [];

  const loadDetail = useCallback(async (d: DriverSummary) => {
    setSelected(d);
    setDetailLoading(true);
    try {
      // Load song song: entries (cho totals) + requests (cho từng dòng)
      const [entryRes, reqRes] = await Promise.all([
        api.get(`/fund/${d.driver_id}/entries`, { params: { month, year } }),
        api.get(`/fund/${d.driver_id}/requests`, { params: { month, year } }),
      ]);
      setDetail(entryRes.data.data);
      setReqList(reqRes.data.data?.requests ?? []);
    } catch {
      toast.error('Không thể tải chi tiết');
    } finally {
      setDetailLoading(false);
    }
  }, [month, year]);

  const handleDelete = async () => {
    if (!delRow?.entry_id) return;
    setDelLoading(true);
    try {
      await api.delete(`/fund/entries/${delRow.entry_id}`);
      toast.success('Đã xóa');
      setDelRow(null);
      if (selected) loadDetail(selected);
      refetch();
    } catch { toast.error('Xóa thất bại'); }
    finally { setDelLoading(false); }
  };

  // Load yêu cầu chi của tài xế
  const loadExpenses = useCallback(async (d: DriverSummary) => {
    setExpensesLoading(true);
    try {
      const res = await api.get('/requests', {
        params: { type: 'expense', driverId: d.driver_id, limit: 100 },
      });
      setExpenses(res.data.data?.requests ?? []);
    } catch { setExpenses([]); }
    finally { setExpensesLoading(false); }
  }, []);

  // Khi click "Xem YC chi"
  const handleViewExpenses = (d: DriverSummary) => {
    setViewExpenses(d);
    loadExpenses(d);
  };

  const handleApproveExpense = async (id: string) => {
    try {
      const res = await api.put(`/requests/${id}/approve`, { comment: 'Admin duyệt' });
      const insuf = res.data?.insufficient_fund;
      if (insuf) {
        toast(
          (t) => (
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-amber-800">⚠️ Đã duyệt — quỹ không đủ</p>
              <p className="text-xs text-amber-700">
                Còn lại: <strong>{new Intl.NumberFormat('vi-VN').format(insuf.current_balance)}đ</strong>
                , thiếu: <strong>{new Intl.NumberFormat('vi-VN').format(insuf.shortage)}đ</strong>
              </p>
              <button
                onClick={() => { toast.dismiss(t.id); setQuickFundDriver(viewExpenses); setShowAdd(true); }}
                className="mt-1 text-xs font-bold text-amber-900 underline text-left"
              >
                → Nạp tiền ngay
              </button>
            </div>
          ),
          { duration: 8000, style: { background: '#fef3c7', color: '#92400e', maxWidth: 320 } }
        );
      } else {
        toast.success('✅ Đã duyệt — tiền chi đã được cập nhật vào quỹ');
      }
      if (viewExpenses) loadExpenses(viewExpenses);
      if (selected && selected.driver_id === viewExpenses?.driver_id) loadDetail(selected);
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Duyệt thất bại');
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Chi Phí Tài Xế</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Theo dõi và duyệt các yêu cầu hoàn chi phí vận hành của tài xế theo tháng
          </p>
        </div>
        <MonthYearPicker
          month={Number(month)}
          year={Number(year)}
          onChange={(m, y) => { setMonth(String(m)); setYear(String(y)); setDetail(null); }}
        />
      </div>

      <div className="flex gap-5 flex-col xl:flex-row">
        {/* ── Left: Danh sách tài xế ── */}
        <div className="xl:w-80 flex-shrink-0">
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {drivers.length} tài xế
              </p>
            </div>
            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Đang tải...</div>
            ) : drivers.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Không có tài xế</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {drivers.map(d => (
                  <div key={d.driver_id}
                    className={`border-l-4 transition-colors
                      ${selected?.driver_id === d.driver_id
                        ? 'bg-primary/5 border-l-primary'
                        : 'border-l-transparent hover:bg-gray-50'}`}>

                    {/* Info row — click để xem chi tiết */}
                    <div
                      onClick={() => loadDetail(d)}
                      className="w-full text-left px-4 pt-3 pb-1 cursor-pointer">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{d.full_name}</p>
                          <p className="text-xs text-primary font-bold mt-0.5">{d.license_plate}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-red-500">
                            {fmtVND(d.total_expense)}đ
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">tổng chi phí</p>
                        </div>
                      </div>
                      <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                        <span>🚛 {d.total_trips} chuyến</span>
                        {d.overtime_trips > 0 && <span>🔥 {d.overtime_trips} tăng ca</span>}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 px-4 pb-3 mt-1">
                      <button
                        type="button"
                        onClick={() => handleViewExpenses(d)}
                        className="flex-1 text-[11px] font-semibold py-1.5 rounded-lg
                          border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors flex items-center justify-center gap-1">
                        <DocumentTextIcon className="w-3 h-3" />
                        Xem YC chi
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!detail || selected?.driver_id !== d.driver_id) {
                            toast.error('Hãy mở chi tiết tài xế này trước khi xuất Excel');
                            return;
                          }
                          await exportFundExcel({
                            driverName: d.full_name,
                            licensePlate: d.license_plate,
                            month, year,
                            rows: detail.rows,
                            requests: reqList,
                            totals: detail.totals,
                          });
                        }}
                        className="flex-1 text-[11px] font-semibold py-1.5 rounded-lg
                          border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1">
                        <ArrowDownTrayIcon className="w-3 h-3" />
                        Xuất Excel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Bảng chi tiết theo ngày ── */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="card flex flex-col items-center justify-center py-20 text-gray-400">
              <span className="text-5xl mb-4">👈</span>
              <p className="text-sm">Chọn tài xế để xem chi tiết quỹ</p>
            </div>
          ) : detailLoading ? (
            <div className="card py-20 text-center text-gray-400 text-sm">Đang tải...</div>
          ) : detail ? (
            <div className="card p-0 overflow-hidden">
              {/* Toolbar */}
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900">{detail.driver.full_name}</span>
                  <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {detail.driver.license_plate}
                  </span>
                  <span className="text-xs text-gray-500">Tháng {month}/{year}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={async () => {
                      if (!detail) return;
                      await exportFundExcel({
                        driverName: detail.driver.full_name,
                        licensePlate: detail.driver.license_plate,
                        month, year,
                        rows: detail.rows,
                        requests: reqList,
                        totals: detail.totals,
                      });
                    }}
                    className="btn-outline gap-1.5 text-xs py-1.5 px-3">
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    Xuất Excel
                  </button>
                </div>
              </div>

              {/* Summary totals */}
              {detail && (
                <div className="flex gap-6 px-5 py-3 border-b border-gray-100 bg-white text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Tổng chi phí</span>
                    <p className="font-bold text-red-500">{new Intl.NumberFormat('vi-VN').format(detail.totals.expense)}đ</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Đã duyệt hoàn trả</span>
                    <p className="font-bold text-emerald-600">
                      {new Intl.NumberFormat('vi-VN').format(
                        reqList.filter((r: any) => r.status === 'approved').reduce((s: number, r: any) => s + r.amount, 0)
                      )}đ
                    </p>
                  </div>
                  <div className="ml-auto text-xs text-gray-400 self-center">
                    🚛 {detail.totals.trips} chuyến · 🔥 {detail.totals.overtime_trips} tăng ca
                  </div>
                </div>
              )}

              {/* Bảng từng yêu cầu chi */}
              <div className="overflow-x-auto">
                {reqLoading ? (
                  <div className="py-12 text-center text-gray-400 text-sm">Đang tải...</div>
                ) : reqList.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">
                    <p className="text-3xl mb-2">💸</p>
                    <p className="text-sm">Chưa có yêu cầu chi nào trong tháng này</p>
                  </div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-primary text-white">
                        {['STT', 'Ngày', 'Số tiền', 'Ghi chú / Mục đích', 'Trạng thái', ''].map((h, i) => (
                          <th key={i} className="px-4 py-2.5 text-left font-semibold border-r border-primary-700/50 last:border-0 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reqList.map((r: any, idx: number) => {
                        const ST: Record<string, { bg: string; text: string; label: string }> = {
                          approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Đã duyệt' },
                          pending:  { bg: 'bg-yellow-100',  text: 'text-yellow-700',  label: 'Chờ duyệt' },
                          rejected: { bg: 'bg-red-100',     text: 'text-red-600',     label: 'Từ chối' },
                        };
                        const st = ST[r.status] ?? ST.pending;
                        return (
                          <tr key={r._id} className={`border-b border-gray-100 hover:bg-gray-50/60 ${r.status === 'rejected' ? 'bg-red-50/60 opacity-75' : idx % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                            <td className="px-4 py-2.5 border-r border-gray-100 text-gray-400 w-10 text-center">{idx + 1}</td>
                            <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 whitespace-nowrap">
                              {r.date ? format(new Date(r.date + 'T00:00:00'), 'EEE dd/MM/yyyy', { locale: vi }) : '—'}
                            </td>
                            <td className="px-4 py-2.5 border-r border-gray-100 text-right font-semibold whitespace-nowrap">
                              <span className={r.status === 'rejected' ? 'line-through text-gray-400' : 'text-red-600'}>
                                {r.amount > 0 ? `${new Intl.NumberFormat('vi-VN').format(r.amount)}đ` : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 break-words" style={{ wordBreak: 'break-word', maxWidth: '300px' }}>
                              {r.note || r.title || '—'}
                            </td>
                            <td className="px-4 py-2.5 border-r border-gray-100">
                              <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                                {st.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex gap-1 justify-center">
                                <button
                                  onClick={() => setEditExpense(r)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:bg-yellow-50 hover:text-yellow-600 transition-colors"
                                  title="Sửa"
                                >
                                  <PencilIcon className="w-3.5 h-3.5" />
                                </button>
                                {(r.status === 'pending' || r.status === 'approved') && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Xóa yêu cầu "${r.title}"?`)) return;
                                      try {
                                        await api.delete(`/requests/${r._id}`);
                                        toast.success('Đã xóa yêu cầu');
                                        if (selected) loadDetail(selected);
                                        refetch();
                                        // Reload reqList
                                        if (selected) {
                                          const reqRes = await api.get(`/fund/${selected.driver_id}/requests`, { params: { month, year } });
                                          setReqList(reqRes.data.data?.requests ?? []);
                                        }
                                      } catch { toast.error('Xóa thất bại'); }
                                    }}
                                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    title="Xóa"
                                  >
                                    <TrashIcon className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-primary text-white font-bold text-xs">
                        <td colSpan={2} className="px-4 py-2.5">TỔNG ĐÃ DUYỆT ({reqList.filter((r: any) => r.status === 'approved').length} yêu cầu)</td>
                        <td className="px-4 py-2.5 text-right">
                          {new Intl.NumberFormat('vi-VN').format(
                            reqList.filter((r: any) => r.status === 'approved').reduce((s: number, r: any) => s + r.amount, 0)
                          )}đ
                        </td>
                        <td className="px-4 py-2.5 opacity-75 text-[10px]">
                          {reqList.filter((r: any) => r.status === 'pending').length} chờ duyệt · {reqList.filter((r: any) => r.status === 'rejected').length} từ chối (không tính vào tổng)
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Modals ── */}
      {delRow && (
        <Modal open title="Xóa dòng quỹ" size="sm" onClose={() => setDelRow(null)}
          footer={
            <>
              <button onClick={() => setDelRow(null)} className="btn-outline text-sm px-4 py-2">Hủy</button>
              <button onClick={handleDelete} disabled={delLoading} className="btn-danger text-sm px-4 py-2">
                {delLoading ? 'Đang xóa...' : 'Xóa'}
              </button>
            </>
          }>
          <p className="text-sm text-gray-600">
            Xóa dòng ngày <b>{delRow.date}</b>?
            {delRow.expense > 0 && (
              <span className="ml-1 text-red-500"> Tiền chi: {fmtVND(delRow.expense)}đ</span>
            )}
          </p>
        </Modal>
      )}

      {/* ── Modal: Xem yêu cầu chi của tài xế ── */}
      {viewExpenses && (
        <Modal
          open
          title={`Yêu cầu chi — ${viewExpenses.full_name} (${viewExpenses.license_plate})`}
          size="xl"
          onClose={() => setViewExpenses(null)}
        >
          {expensesLoading ? (
            <div className="py-10 text-center text-gray-400 text-sm">Đang tải...</div>
          ) : expenses.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">
              <p className="text-3xl mb-2">💸</p>
              Chưa có yêu cầu chi nào
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {/* Tổng hợp */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Tổng yêu cầu', value: expenses.length, unit: 'YC', color: 'text-gray-900' },
                  { label: 'Tổng tiền chi', value: new Intl.NumberFormat('vi-VN').format(expenses.reduce((s, e) => s + (e.payload?.amount ?? 0), 0)), unit: 'đ', color: 'text-red-600' },
                  { label: 'Đã duyệt', value: expenses.filter(e => e.status === 'approved').length, unit: 'YC', color: 'text-green-600' },
                ].map(c => (
                  <div key={c.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                    <p className={`text-lg font-bold ${c.color}`}>{c.value}<span className="text-xs font-normal ml-0.5">{c.unit}</span></p>
                  </div>
                ))}
              </div>

              {/* Danh sách */}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    {['Ngày', 'Tiêu đề', 'Số tiền', 'Ghi chú', 'Trạng thái', 'Thao tác'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 border-b border-gray-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {expenses.map(e => {
                    const stMap: Record<string, { bg: string; text: string; label: string }> = {
                      pending:   { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Chờ duyệt' },
                      approved:  { bg: 'bg-green-100', text: 'text-green-700', label: 'Đã duyệt' },
                      rejected:  { bg: 'bg-red-100',   text: 'text-red-700',   label: 'Từ chối' },
                      completed: { bg: 'bg-blue-100',  text: 'text-blue-700',  label: 'Hoàn thành' },
                    };
                    const st = stMap[e.status] ?? stMap.pending;
                    return (
                      <tr key={e._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                          {e.payload?.date ?? e.created_at?.slice(0,10) ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-gray-900">{e.title}</td>
                        <td className="px-3 py-2.5 font-bold text-red-600 whitespace-nowrap">
                          {e.payload?.amount ? new Intl.NumberFormat('vi-VN').format(e.payload.amount) + 'đ' : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs break-words" style={{ wordBreak: 'break-word', maxWidth: '200px' }}>
                          {e.payload?.note || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${st.bg} ${st.text}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            {/* Admin có thể sửa số tiền khi tài xế điền sai */}
                            <button
                              onClick={() => setEditExpense(e)}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-yellow-50 hover:text-yellow-600 transition-colors"
                              title="Sửa">
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                            {/* Duyệt nếu đang pending */}
                            {e.status === 'pending' && (
                              <button
                                onClick={() => handleApproveExpense(e._id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors"
                                title="Duyệt">
                                ✅
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {/* ── Modal: Sửa yêu cầu chi (admin fix số tiền sai) ── */}
      {editExpense && (
        <EditExpenseModal
          expense={editExpense}
          onClose={() => setEditExpense(null)}
          onSuccess={() => {
            setEditExpense(null);
            if (viewExpenses) loadExpenses(viewExpenses);
          }}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
 *  EditExpenseModal — Admin sửa số tiền yêu cầu chi sai
 * ══════════════════════════════════════════════════════ */
function EditExpenseModal({
  expense, onClose, onSuccess,
}: { expense: any; onClose: () => void; onSuccess: () => void }) {
  const [saving, setSaving] = useState(false);
  const [amountDisplay, setAmountDisplay] = useState(
    expense.payload?.amount
      ? new Intl.NumberFormat('vi-VN').format(expense.payload.amount)
      : ''
  );

  const formatInput = (val: string) => {
    const nums = val.replace(/\./g, '').replace(/[^0-9]/g, '');
    if (!nums) return '';
    return new Intl.NumberFormat('vi-VN').format(Number(nums));
  };

  const rawNum = (display: string) =>
    Number(display.replace(/\./g, '').replace(/[^0-9]/g, '')) || 0;

  const { register, handleSubmit } = useForm({
    defaultValues: {
      note: expense.payload?.note ?? '',
      date: expense.payload?.date ?? expense.created_at?.slice(0, 10) ?? '',
    },
  });

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      await api.put(`/requests/${expense._id}`, {
        payload: {
          ...expense.payload,
          amount: rawNum(amountDisplay),
          note:   data.note,
          date:   data.date,
        },
      });
      toast.success('Đã cập nhật yêu cầu chi');
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Cập nhật thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="Sửa yêu cầu chi" size="sm" onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-outline text-sm px-4 py-2">Hủy</button>
          <button onClick={handleSubmit(onSubmit)} disabled={saving} className="btn-primary text-sm px-4 py-2">
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </>
      }>
      <div className="space-y-4">
        {/* Info */}
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">Yêu cầu</p>
          <p className="text-sm font-semibold text-gray-900">{expense.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Trạng thái: <span className={`font-bold ${
              expense.status === 'approved' ? 'text-green-600' :
              expense.status === 'rejected' ? 'text-red-500' : 'text-amber-600'
            }`}>
              {expense.status === 'approved' ? 'Đã duyệt' :
               expense.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
            </span>
          </p>
        </div>

        {/* Ngày */}
        <div>
          <label className="form-label">Ngày</label>
          <DateInput {...register('date')} />
        </div>

        {/* Số tiền */}
        <div>
          <label className="form-label">Số tiền (VNĐ) *</label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={amountDisplay}
              onChange={e => setAmountDisplay(
                (() => {
                  const nums = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
                  return nums ? new Intl.NumberFormat('vi-VN').format(Number(nums)) : '';
                })()
              )}
              className="form-input text-right text-lg font-bold text-red-600 pr-10"
              placeholder="390.000"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">đ</span>
          </div>
          {amountDisplay && (
            <p className="text-xs text-red-500 mt-1 text-right">= {amountDisplay}đ</p>
          )}
        </div>

        {/* Ghi chú */}
        <div>
          <label className="form-label">Ghi chú / Lý do chi</label>
          <textarea {...register('note')} rows={3}
            className="form-input resize-none"
            placeholder="Mô tả chi tiết..." />
        </div>
      </div>
    </Modal>
  );
}
