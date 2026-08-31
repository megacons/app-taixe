import { useState } from 'react';
import { ArrowDownTrayIcon, EyeIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useApi } from '@/hooks/useApi';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import Pagination from '@/components/ui/Pagination';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import api from '@/lib/api';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import { saveWorkbook } from '@/lib/exportExcel';

const getImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

interface Trip {
  _id: string;
  trip_date: string;
  material_name: string;
  pickup_location: string;
  drop_location: string;
  income: number;
  expense: number;
  status: string;
  is_overtime: boolean;
  overtime_pay: number;
  trip_number: number;
  note: string;
  delivery_receipt: string | null;
  driver_id: { _id: string; full_name: string; employee_id: string } | null;
  vehicle_id: { _id: string; license_plate: string } | null;
}

const now = new Date();
const DAYS   = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ v: i + 1, l: `Tháng ${i + 1}` }));

const fmtDate = (tripDate: string) => {
  const d = new Date(tripDate);
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false });
};

export default function TripsPage() {
  const [page, setPage]         = useState(1);
  const [day, setDay]           = useState('');
  const [month, setMonth]       = useState('');
  const [year, setYear]         = useState('');
  const [driverId, setDriverId] = useState('');
  const [detail, setDetail]     = useState<Trip | null>(null);
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<Trip | null>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Build date param từ day+month+year nếu có đủ
  const dateParam = day && month && year
    ? `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    : '';

  const { data, loading } = useApi<any>('/trips', {
    page, limit: 20, sort: '-trip_date',
    ...(dateParam ? { date: dateParam } : {}),
    ...(!dateParam && month ? { month } : {}),
    ...(!dateParam && year  ? { year  } : {}),
    ...(driverId ? { driverId } : {}),
  });

  const { data: driverData } = useApi<any>('/drivers', { limit: 200 });
  const { data: oldestTrip } = useApi<any>('/trips', { limit: 1, sort: 'trip_date' });

  const trips: Trip[] = data?.trips ?? [];
  const pagination    = data?.pagination;
  const drivers       = driverData?.drivers ?? [];

  // Tính danh sách năm từ năm có chuyến đầu tiên đến hiện tại
  const oldestYear = oldestTrip?.trips?.[0]?.trip_date
    ? new Date(oldestTrip.trips[0].trip_date).getFullYear()
    : now.getFullYear();
  const YEARS = Array.from(
    { length: now.getFullYear() - oldestYear + 1 },
    (_, i) => now.getFullYear() - i
  );
  const totalOT       = trips.filter(t => t.is_overtime).length;

  const clearFilters = () => { setDay(''); setMonth(''); setYear(''); setDriverId(''); setPage(1); };

  /* ── Xuất Excel ── */
  const exportExcel = async () => {
    setExporting(true);
    try {
      // Lấy tất cả chuyến theo filter hiện tại (không phân trang)
      const res = await api.get('/trips', {
        params: { limit: 2000, sort: '-trip_date',
          ...(dateParam ? { date: dateParam } : {}),
          ...(!dateParam && month ? { month } : {}),
          ...(!dateParam && year  ? { year  } : {}),
          ...(driverId ? { driverId } : {}) },
      });
      const allTrips: Trip[] = res.data.data?.trips ?? [];

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Nam Thanh Transport';
      wb.created = new Date();
      const ws = wb.addWorksheet('Danh sách chuyến');

      ws.columns = [
        { key: 'stt',      width: 6  },
        { key: 'date',     width: 20 },
        { key: 'driver',   width: 20 },
        { key: 'vehicle',  width: 14 },
        { key: 'material', width: 16 },
        { key: 'pickup',   width: 28 },
        { key: 'drop',     width: 28 },
        { key: 'note',     width: 24 },
        { key: 'status',   width: 14 },
        { key: 'overtime', width: 10 },
      ];

      // Header
      const hRow = ws.addRow(['STT', 'Ngày giờ', 'Tài xế', 'Xe', 'Vật liệu', 'Nơi lấy', 'Nơi đổ', 'Ghi chú', 'Trạng thái', 'Tăng ca']);
      hRow.height = 22;
      hRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163797' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      // Data
      allTrips.forEach((t, i) => {
        const row = ws.addRow([
          i + 1,
          t.trip_date ? fmtDate(t.trip_date) : '—',
          t.driver_id?.full_name ?? '—',
          t.vehicle_id?.license_plate ?? '—',
          t.material_name ?? '—',
          t.pickup_location ?? '—',
          t.drop_location ?? '—',
          t.note ?? '',
          t.status === 'completed' ? 'Hoàn thành' : t.status === 'cancelled' ? 'Hủy' : 'Nháp',
          t.is_overtime ? 'Có' : '',
        ]);
        row.height = 18;
        const bg = i % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FF';
        row.eachCell({ includeEmpty: true }, cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.border = { top: { style: 'thin', color: { argb: 'FFE0E0E0' } }, bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } }, left: { style: 'thin', color: { argb: 'FFE0E0E0' } }, right: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
          cell.alignment = { vertical: 'middle' };
        });
        if (t.is_overtime) row.getCell(9).font = { color: { argb: 'FFEA580C' }, bold: true };
      });

      // Footer
      const fRow = ws.addRow([`Tổng: ${allTrips.length} chuyến`, '', '', '', '', '', '', '', `${allTrips.filter(t => t.is_overtime).length} tăng ca`]);
      fRow.height = 20;
      fRow.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        cell.font = { bold: true, size: 11 };
        cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      const label = dateParam ? dateParam : month && year ? `T${month}-${year}` : year ? year : 'all';
      await saveWorkbook(wb, `Chuyen_xe_${label}.xlsx`);
      toast.success('Đã xuất file Excel');
    } catch (e) {
      toast.error('Xuất Excel thất bại');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Chuyến xe</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pagination?.total ?? 0} chuyến</p>
        </div>
        <button onClick={exportExcel} disabled={exporting}
          className="btn-outline gap-2 text-sm disabled:opacity-50">
          <ArrowDownTrayIcon className="w-4 h-4" />
          {exporting ? 'Đang xuất...' : 'Xuất Excel'}
        </button>
      </div>

      {/* Summary cards — 2 card */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { label: 'Tổng chuyến', value: `${pagination?.total ?? 0} chuyến`, color: 'text-green-600', icon: '🚛' },
          { label: 'Tăng ca',     value: `${totalOT} chuyến`,               color: 'text-orange-500', icon: '🔥' },
        ].map(c => (
          <div key={c.label} className="card py-3 px-4 flex flex-col items-center text-center gap-1">
            <span className="text-xl">{c.icon}</span>
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className={`font-bold text-base ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Ngày</p>
            <select className="form-select h-9 text-sm w-24" value={day}
              onChange={e => { setDay(e.target.value); setPage(1); }}>
              <option value="">Tất cả</option>
              {DAYS.map(d => <option key={d} value={d}>{String(d).padStart(2,'0')}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Tháng</p>
            <select className="form-select h-9 text-sm w-32" value={month}
              onChange={e => { setMonth(e.target.value); setPage(1); }}>
              <option value="">Tất cả</option>
              {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Năm</p>
            <select className="form-select h-9 text-sm w-28" value={year}
              onChange={e => { setYear(e.target.value); setPage(1); }}>
              <option value="">Tất cả</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Tài xế</p>
            <select className="form-select h-9 text-sm" value={driverId}
              onChange={e => { setDriverId(e.target.value); setPage(1); }}>
              <option value="">Tất cả tài xế</option>
              {drivers.map((d: any) => (
                <option key={d._id} value={d._id}>{d.full_name}</option>
              ))}
            </select>
          </div>
          {(day || month || year || driverId) && (
            <button onClick={clearFilters} className="btn-outline h-9 text-sm px-3">Xóa bộ lọc</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10 text-center">STT</th>
                <th>Ngày</th>
                <th>Tài xế</th>
                <th>Xe</th>
                <th>Vật liệu</th>
                <th>Tuyến</th>
                <th>Ghi chú</th>
                <th>TT</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={9} className="text-center py-10 text-gray-400">Đang tải...</td></tr>}
              {!loading && trips.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <span className="text-4xl">🚛</span>
                    <p className="text-sm">Không có chuyến nào</p>
                  </div>
                </td></tr>
              )}
              {(() => {
                // Tính STT per ngày: reset về 1 khi qua ngày mới
                const dayCounters: Record<string, number> = {};
                const sttPerTrip = trips.map(t => {
                  const dateKey = t.trip_date ? t.trip_date.slice(0, 10) : 'unknown';
                  dayCounters[dateKey] = (dayCounters[dateKey] ?? 0) + 1;
                  return dayCounters[dateKey];
                });
                return trips.map((t, idx) => (
                <tr key={t._id} className={t.is_overtime ? 'bg-orange-50/40' : ''}>
                  <td className="text-center text-xs text-gray-400 font-medium">
                    {sttPerTrip[idx]}
                  </td>
                  <td className="text-xs text-gray-600 whitespace-nowrap">
                    {t.trip_date ? fmtDate(t.trip_date) : '—'}
                  </td>
                  <td>
                    <p className="text-sm font-medium text-gray-900">{t.driver_id?.full_name ?? '—'}</p>
                  </td>
                  <td className="text-xs font-bold text-primary">{t.vehicle_id?.license_plate ?? '—'}</td>
                  <td className="text-sm text-gray-700 max-w-[100px] truncate">{t.material_name}</td>
                  <td className="text-xs text-gray-500 max-w-[120px]">
                    <div className="truncate" title={t.pickup_location}>{t.pickup_location}</div>
                    <div className="truncate text-gray-400" title={t.drop_location}>→ {t.drop_location}</div>
                  </td>
                  <td className="text-xs text-gray-500 max-w-[120px]">
                    {t.note ? (
                      <span className="truncate block" title={t.note}>{t.note}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={t.status} />
                      {t.is_overtime && (
                        <span className="badge bg-orange-100 text-orange-700 text-[10px]">🔥 Tăng ca</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setDetail(t)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setEditTrip(t); setEditNote(t.note ?? ''); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-yellow-50 hover:text-yellow-600">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDelTarget(t)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
        {pagination && (
          <Pagination page={page} totalPages={pagination.totalPages}
            total={pagination.total} limit={20} onPageChange={setPage} />
        )}
      </div>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Chi tiết chuyến xe" size="md">
        {detail && (
          <div className="space-y-3 text-sm">
            {[
              ['Ngày', detail.trip_date ? fmtDate(detail.trip_date) : '—'],
              ['Tài xế',   detail.driver_id?.full_name ?? '—'],
              ['Biển số',  detail.vehicle_id?.license_plate ?? '—'],
              ['Vật liệu', detail.material_name],
              ['Nơi lấy',  detail.pickup_location],
              ['Nơi đổ',   detail.drop_location],
              ['Tăng ca',  detail.is_overtime ? `✅ +${new Intl.NumberFormat('vi-VN').format(detail.overtime_pay)}đ` : 'Không'],
              ['Ghi chú',  detail.note || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">{k}</span>
                <span className="font-medium text-gray-900 text-right max-w-[55%]">{v}</span>
              </div>
            ))}
            {detail.delivery_receipt && (() => {
              const imgUrl = getImageUrl(detail.delivery_receipt);
              return imgUrl ? (
                <div>
                  <p className="text-gray-500 mb-2">Ảnh biên nhận</p>
                  <div className="relative group cursor-zoom-in" onClick={() => setLightbox(imgUrl)}>
                    <img src={imgUrl} alt="Biên nhận"
                      className="w-full rounded-lg border border-gray-200 object-cover max-h-60 transition-opacity group-hover:opacity-90" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg">
                      <span className="bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full">🔍 Nhấn để xem to</span>
                    </div>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </Modal>

      {/* Lightbox */}
      {/* Modal sửa chuyến */}
      <Modal open={!!editTrip} onClose={() => setEditTrip(null)} title="Sửa chuyến xe" size="sm"
        footer={<>
          <button onClick={() => setEditTrip(null)} className="btn-outline text-sm px-4 py-2">Hủy</button>
          <button
            onClick={async () => {
              if (!editTrip) return;
              setEditSaving(true);
              try {
                await api.put(`/trips/${editTrip._id}`, { note: editNote });
                toast.success('Đã cập nhật chuyến xe');
                setEditTrip(null);
                refetch();
              } catch (e: any) {
                toast.error(e?.response?.data?.message ?? 'Cập nhật thất bại');
              } finally { setEditSaving(false); }
            }}
            disabled={editSaving}
            className="btn-primary text-sm px-5 py-2">
            {editSaving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </>}>
        {editTrip && (
          <div className="space-y-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
              <p><strong>{editTrip.driver_id?.full_name}</strong> · {editTrip.vehicle_id?.license_plate}</p>
              <p>{editTrip.trip_date ? fmtDate(editTrip.trip_date) : '—'} · {editTrip.material_name}</p>
            </div>
            <div>
              <label className="form-label">Ghi chú</label>
              <textarea
                className="form-input w-full resize-none"
                rows={3}
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="Ghi chú chuyến xe..."
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Xác nhận xóa */}
      <ConfirmDialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={async () => {
          if (!delTarget) return;
          setDelLoading(true);
          try {
            await api.delete(`/trips/${delTarget._id}`);
            toast.success('Đã xóa chuyến xe');
            setDelTarget(null);
            refetch();
          } catch (e: any) {
            toast.error(e?.response?.data?.message ?? 'Xóa thất bại');
          } finally { setDelLoading(false); }
        }}
        loading={delLoading}
        danger
        title="Xóa chuyến xe"
        message={`Xóa chuyến "${delTarget?.material_name ?? ''}" ngày ${delTarget?.trip_date ? fmtDate(delTarget.trip_date) : '—'} của ${delTarget?.driver_id?.full_name ?? '—'}? Thao tác không thể hoàn tác.`}
      />

      {lightbox && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
            onClick={() => setLightbox(null)}>
            <XMarkIcon className="w-5 h-5 text-white" />
          </button>
          <img src={lightbox} alt="Biên nhận phóng to"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

/* ── Helper functions ── */
async function saveEditTrip(tripId: string, note: string, setSaving: (v: boolean) => void, onSuccess: () => void) {
  setSaving(true);
  try {
    await (await import('@/lib/api')).default.put(`/trips/${tripId}`, { note });
    (await import('react-hot-toast')).default.success('Đã cập nhật chuyến xe');
    onSuccess();
  } catch (e: any) {
    (await import('react-hot-toast')).default.error(e?.response?.data?.message ?? 'Cập nhật thất bại');
  } finally {
    setSaving(false);
  }
}
