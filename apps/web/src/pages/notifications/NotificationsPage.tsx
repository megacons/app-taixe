import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import {
  BellIcon, PaperAirplaneIcon, UserGroupIcon,
  ClockIcon, CheckCircleIcon, PaperClipIcon, XMarkIcon,
  PencilIcon, TrashIcon, ArrowPathIcon, CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import Modal from '@/components/ui/Modal';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
const RichTextEditor = lazy(() => import('@/components/RichTextEditor'));

/* ── Helpers ── */
const getImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

const isImage  = (mime?: string) => !!mime?.includes('image');
const isPdf    = (mime?: string) => !!mime?.includes('pdf');
const isOffice = (mime?: string) =>
  !!(mime?.includes('word') || mime?.includes('document') ||
     mime?.includes('excel') || mime?.includes('sheet') ||
     mime?.includes('presentation') || mime?.includes('powerpoint'));

const getFileIcon = (mime: string) => {
  if (mime?.includes('pdf'))   return '📄';
  if (mime?.includes('word') || mime?.includes('document')) return '📝';
  if (mime?.includes('excel') || mime?.includes('sheet'))   return '📊';
  if (mime?.includes('image')) return '🖼️';
  return '📎';
};

const fmtFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
};

/* ── Types ── */
interface HistoryItem {
  title:      string;
  message:    string;
  sent_count: number;
  created_at: string;
  type?:      string;
  sent_by?:   string;
  attachment?: {
    url:           string;
    original_name: string;
    mime_type:     string;
    size:          number;
  } | null;
}

interface Driver {
  _id: string;
  full_name: string;
  phone: string;
  employee_id?: string;
}

interface StaffUser {
  _id: string;
  name: string;
  phone: string;
  role: string;
  employee_id?: string;
}

// Người nhận chung (tài xế + nhân viên/quản lý/điều phối)
interface Recipient {
  _id: string;
  label: string;         // tên hiển thị
  employee_id?: string;
  role: string;          // 'driver' | 'employee' | 'manager' | ...
}

const ROLE_LABEL_SHORT: Record<string, string> = {
  driver:      'Tài xế',
  employee:    'NV',
  coordinator: 'ĐP',
  accountant:  'KT',
  manager:     'QL',
};

const TYPE_OPTIONS = [
  { value: 'announcement',  label: '📢 Thông báo chung' },
  { value: 'salary',        label: '💵 Thông báo lương' },
  { value: 'system',        label: '🔔 Hệ thống' },
  { value: 'payment',       label: '💰 Thanh toán' },
  { value: 'trip_reminder', label: '🚛 Nhắc chuyến xe' },
  { value: 'discipline',    label: '⚠️ Kỷ luật' },
  { value: 'holiday',       label: '🎉 Nghỉ lễ' },
  { value: 'birthday',      label: '🎂 Sinh nhật' },
];

export default function NotificationsPage() {
  const [title, setTitle]     = useState('');
  const [message, setMessage] = useState('');
  const [type, setType]       = useState('announcement');
  const [sending, setSending] = useState(false);
  const [file, setFile]       = useState<File | null>(null);
  const fileInputRef          = useRef<HTMLInputElement>(null);
  const editFileInputRef      = useRef<HTMLInputElement>(null);

  const [history, setHistory]   = useState<HistoryItem[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [drivers, setDrivers]     = useState<Driver[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // Multi-select người nhận
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // rỗng = tất cả
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');

  // Edit modal state
  const [editItem, setEditItem]     = useState<HistoryItem | null>(null);
  const [editTitle, setEditTitle]   = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editFile, setEditFile]     = useState<File | null>(null);
  const [editSending, setEditSending] = useState(false);

  // Recall state
  const [recalling, setRecalling] = useState<string | null>(null); // created_at của item đang recall

  // File preview lightbox
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<{ url: string; mime: string; name: string } | null>(null);

  // Salary notification state
  const now = new Date();
  const [salaryMonth, setSalaryMonth] = useState(now.getMonth() + 1);
  const [salaryYear, setSalaryYear]   = useState(now.getFullYear());
  const [salaryDriverId, setSalaryDriverId] = useState('');
  const [salaryPreview, setSalaryPreview]   = useState<any | null>(null);
  const [salaryLoading, setSalaryLoading]   = useState(false);
  const [salarySending, setSalarySending]   = useState(false);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const res = await api.get('/notifications/broadcast/history');
      setHistory(res.data.data?.history ?? []);
    } catch { /* silent */ }
    finally { setHistLoading(false); }
  }, []);

  useEffect(() => {
    loadHistory();
    // Fetch tài xế
    api.get('/drivers', { params: { limit: 200, status: 'active' } })
      .then(r => {
        const drvList: Driver[] = r.data.data?.drivers ?? [];
        setDrivers(drvList);
        // Gộp vào recipients
        const drvRecipients: Recipient[] = drvList.map(d => ({
          _id: d._id, label: d.full_name, employee_id: d.employee_id, role: 'driver',
        }));
        setRecipients(prev => {
          const nonDriver = prev.filter(p => p.role !== 'driver');
          return [...nonDriver, ...drvRecipients].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
        });
      })
      .catch(() => {});
    // Fetch nhân viên / quản lý / điều phối / kế toán
    api.get('/users', { params: { limit: 200, status: 'active' } })
      .then(r => {
        const userList: StaffUser[] = r.data.data?.users ?? [];
        const staffRecipients: Recipient[] = userList.map(u => ({
          _id: u._id, label: u.name, employee_id: u.employee_id, role: u.role,
        }));
        setRecipients(prev => {
          const driverOnly = prev.filter(p => p.role === 'driver');
          return [...driverOnly, ...staffRecipients].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
        });
      })
      .catch(() => {});
  }, [loadHistory]);

  /* ── Mở preview file inline ── */
  const openFile = (att: { url: string; mime_type: string; original_name: string }) => {
    const url = getImageUrl(att.url);
    if (!url) return;
    if (isImage(att.mime_type)) {
      setLightbox(url);
    } else {
      setFilePreview({ url, mime: att.mime_type, name: att.original_name });
    }
  };

  /* ── Load salary preview ── */  const loadSalaryPreview = async (driverId: string, month: number, year: number) => {
    if (!driverId) { setSalaryPreview(null); return; }
    setSalaryLoading(true);
    try {
      const res = await api.get('/drivers/salary/list', { params: { month, year } });
      const list: any[] = res.data.data?.drivers ?? [];
      const d = list.find((x: any) => x._id === driverId);
      setSalaryPreview(d ?? null);
    } catch { setSalaryPreview(null); }
    finally { setSalaryLoading(false); }
  };

  /* ── Gửi thông báo lương ── */
  const handleSendSalary = async () => {
    if (!salaryDriverId) { toast.error('Vui lòng chọn nhân viên'); return; }
    if (!salaryPreview)  { toast.error('Chưa có dữ liệu lương để gửi'); return; }

    const fmtVND = (v: number) => new Intl.NumberFormat('vi-VN').format(Math.round(v ?? 0));
    const basePlusAllowance = (salaryPreview.base_salary ?? 0) + (salaryPreview.position_allowance ?? 0) + (salaryPreview.fuel_allowance ?? 0);
    const totalSalary = basePlusAllowance + (salaryPreview.overtime_pay_month ?? 0);

    const salaryTitle = `💵 Thông báo lương tháng ${salaryMonth}/${salaryYear}`;
    const salaryMessage = `
<div style="font-family: sans-serif; max-width: 500px;">
  <p style="font-size: 15px; color: #333;">Xin chào <strong>${salaryPreview.full_name}</strong>,</p>
  <p style="font-size: 14px; color: #555; margin-bottom: 12px;">Dưới đây là thông tin lương tháng <strong>${salaryMonth}/${salaryYear}</strong> của bạn:</p>

  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <tr style="background: #f0f4ff;">
      <td style="padding: 10px 14px; border: 1px solid #dde3f0; color: #555;">💼 Lương cơ bản + phụ cấp</td>
      <td style="padding: 10px 14px; border: 1px solid #dde3f0; text-align: right; font-weight: 600; color: #163797;">${fmtVND(basePlusAllowance)}đ</td>
    </tr>
    <tr>
      <td style="padding: 10px 14px; border: 1px solid #dde3f0; color: #555;">🔥 Chuyến tăng ca</td>
      <td style="padding: 10px 14px; border: 1px solid #dde3f0; text-align: right; font-weight: 600; color: #ea580c;">${salaryPreview.overtime_trips_month ?? 0} chuyến</td>
    </tr>
    <tr style="background: #f0f4ff;">
      <td style="padding: 10px 14px; border: 1px solid #dde3f0; color: #555;">💰 Tiền tăng ca</td>
      <td style="padding: 10px 14px; border: 1px solid #dde3f0; text-align: right; font-weight: 600; color: #ea580c;">${fmtVND(salaryPreview.overtime_pay_month ?? 0)}đ</td>
    </tr>
    <tr>
      <td style="padding: 10px 14px; border: 1px solid #dde3f0; color: #555;">💳 Tiền ứng (đã tạm ứng)</td>
      <td style="padding: 10px 14px; border: 1px solid #dde3f0; text-align: right; font-weight: 600; color: #dc2626;">-${fmtVND(salaryPreview.advance_month ?? 0)}đ</td>
    </tr>
    <tr style="background: #163797;">
      <td style="padding: 12px 14px; color: #fff; font-weight: 700; font-size: 15px;">🏆 TỔNG LƯƠNG</td>
      <td style="padding: 12px 14px; text-align: right; color: #fde68a; font-weight: 800; font-size: 16px;">${fmtVND(totalSalary - (salaryPreview.advance_month ?? 0))}đ</td>
    </tr>
  </table>

  <p style="margin-top: 16px; font-size: 13px; color: #888; border-top: 1px solid #eee; padding-top: 12px;">
    Mọi thắc mắc vui lòng liên hệ bộ phận kế toán.<br/>
    <em>Công ty TNHH Vận tải Nam Thành</em>
  </p>
</div>`.trim();

    setSalarySending(true);
    try {
      const fd = new FormData();
      fd.append('title',            salaryTitle);
      fd.append('message',          salaryMessage);
      fd.append('type',             'payment');
      fd.append('target_driver_id', salaryDriverId);

      const res = await api.post('/notifications/broadcast', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(res.data.message ?? 'Đã gửi thông báo lương');
      setSalaryDriverId('');
      setSalaryPreview(null);
      loadHistory();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Gửi thất bại');
    } finally {
      setSalarySending(false);
    }
  };

  /* ── Gửi mới ── */  const handleSend = async () => {
    if (!title.trim()) { toast.error('Vui lòng nhập tiêu đề'); return; }
    if (!message.trim()) { toast.error('Vui lòng nhập nội dung'); return; }
    if (type === 'discipline' && selectedIds.size !== 1) {
      toast.error('Kỷ luật phải chỉ định đúng 1 người cụ thể'); return;
    }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('title',   title.trim());
      fd.append('message', message.trim());
      fd.append('type',    type);
      if (selectedIds.size > 0) {
        // Gửi tới danh sách cụ thể
        fd.append('target_ids', Array.from(selectedIds).join(','));
      }
      // Nếu selectedIds rỗng → gửi tất cả (không append gì)
      if (file) fd.append('file', file);

      const res = await api.post('/notifications/broadcast', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(res.data.message ?? 'Đã gửi thông báo');
      setTitle(''); setMessage(''); setType('announcement');
      setSelectedIds(new Set());
      setFile(null);
      loadHistory();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Gửi thất bại');
    } finally {
      setSending(false);
    }
  };

  /* ── Thu hồi ── */
  const handleRecall = async (h: HistoryItem) => {
    if (!confirm(`Thu hồi thông báo "${h.title}"?\nThao tác này sẽ xóa thông báo khỏi tất cả thiết bị nhận.`)) return;
    setRecalling(h.created_at);
    try {
      await api.delete('/notifications/broadcast/recall', {
        data: { title: h.title, message: h.message, created_at: h.created_at },
      });
      toast.success('Đã thu hồi thông báo');
      loadHistory();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Thu hồi thất bại');
    } finally {
      setRecalling(null);
    }
  };

  /* ── Mở modal sửa+gửi lại ── */
  const openEdit = (h: HistoryItem) => {
    setEditItem(h);
    setEditTitle(h.title);
    setEditMessage(h.message);
    setEditFile(null);
  };

  /* ── Gửi lại sau khi sửa ── */
  const handleResend = async () => {
    if (!editTitle.trim()) { toast.error('Vui lòng nhập tiêu đề'); return; }
    if (!editMessage.trim()) { toast.error('Vui lòng nhập nội dung'); return; }
    setEditSending(true);
    try {
      const fd = new FormData();
      fd.append('title',   editTitle.trim());
      fd.append('message', editMessage.trim());
      fd.append('type',    editItem?.type ?? 'announcement');
      // Nếu có file mới đính kèm
      if (editFile) fd.append('file', editFile);

      const res = await api.post('/notifications/broadcast', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(res.data.message ?? 'Đã gửi lại thông báo');
      setEditItem(null);
      loadHistory();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Gửi lại thất bại');
    } finally {
      setEditSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Thông báo</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gửi thông báo tới tài xế</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Compose form ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <PaperAirplaneIcon className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-gray-900">Soạn thông báo</h2>
            </div>

            {/* Người nhận */}
            <div>
              <label className="form-label">
                Người nhận
                {type === 'discipline' && (
                  <span className="ml-2 text-xs text-red-500 font-normal">* Kỷ luật phải chỉ định 1 người</span>
                )}
              </label>

              {/* Trigger button */}
              <button
                type="button"
                onClick={() => setShowRecipientPicker(v => !v)}
                className="w-full flex items-center justify-between form-input text-left"
              >
                <span className="truncate text-sm text-gray-700">
                  {selectedIds.size === 0
                    ? '👥 Tất cả mọi người'
                    : selectedIds.size === 1
                    ? (() => { const r = recipients.find(x => selectedIds.has(x._id)); return r ? `${r.role === 'driver' ? '🚛' : '👤'} ${r.label}` : '1 người'; })()
                    : `✅ Đã chọn ${selectedIds.size} người`}
                </span>
                <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${showRecipientPicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown checkbox */}
              {showRecipientPicker && (
                <div className="mt-1 border border-gray-200 rounded-lg bg-white shadow-lg z-20 max-h-96 flex flex-col">
                  {/* Search */}
                  <div className="p-2 border-b border-gray-100">
                    <input
                      type="text"
                      placeholder="Tìm người..."
                      value={recipientSearch}
                      onChange={e => setRecipientSearch(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-primary"
                      autoFocus
                    />
                  </div>

                  {/* Bỏ chọn tất cả / Chọn hết */}
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50">
                    <button type="button" onClick={() => setSelectedIds(new Set())}
                      className="text-xs text-red-500 hover:text-red-700 font-medium">
                      Bỏ chọn tất cả
                    </button>
                    <span className="text-xs text-gray-400">{selectedIds.size} đã chọn</span>
                    <button type="button"
                      onClick={() => setSelectedIds(new Set(recipients.map(r => r._id)))}
                      className="text-xs text-primary hover:text-primary-800 font-medium">
                      Chọn hết
                    </button>
                  </div>

                  {/* List */}
                  <div className="overflow-y-auto flex-1">
                    {/* Nhóm Tài xế */}
                    {recipients.filter(r => r.role === 'driver' && r.label.toLowerCase().includes(recipientSearch.toLowerCase())).length > 0 && (
                      <>
                        <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase bg-gray-50 sticky top-0">🚛 Tài xế</div>
                        {recipients
                          .filter(r => r.role === 'driver' && r.label.toLowerCase().includes(recipientSearch.toLowerCase()))
                          .map(r => (
                            <label key={r._id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                              <input type="checkbox" className="w-4 h-4 rounded text-primary accent-primary cursor-pointer"
                                checked={selectedIds.has(r._id)}
                                onChange={e => {
                                  const next = new Set(selectedIds);
                                  e.target.checked ? next.add(r._id) : next.delete(r._id);
                                  setSelectedIds(next);
                                }} />
                              <span className="text-sm text-gray-700 flex-1">{r.label}</span>
                              {r.employee_id && <span className="text-xs text-gray-400">{r.employee_id}</span>}
                            </label>
                          ))}
                      </>
                    )}

                    {/* Nhóm Nhân viên/Quản lý */}
                    {recipients.filter(r => r.role !== 'driver' && r.label.toLowerCase().includes(recipientSearch.toLowerCase())).length > 0 && (
                      <>
                        <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase bg-gray-50 sticky top-0">👤 Nhân viên / Quản lý</div>
                        {recipients
                          .filter(r => r.role !== 'driver' && r.label.toLowerCase().includes(recipientSearch.toLowerCase()))
                          .map(r => (
                            <label key={r._id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                              <input type="checkbox" className="w-4 h-4 rounded text-primary accent-primary cursor-pointer"
                                checked={selectedIds.has(r._id)}
                                onChange={e => {
                                  const next = new Set(selectedIds);
                                  e.target.checked ? next.add(r._id) : next.delete(r._id);
                                  setSelectedIds(next);
                                }} />
                              <span className="text-sm text-gray-700 flex-1">{r.label}</span>
                              <span className="text-[10px] text-gray-400">[{ROLE_LABEL_SHORT[r.role] ?? r.role}]</span>
                            </label>
                          ))}
                      </>
                    )}

                    {recipients.filter(r => r.label.toLowerCase().includes(recipientSearch.toLowerCase())).length === 0 && (
                      <p className="text-center text-gray-400 text-sm py-4">Không tìm thấy</p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
                    <button type="button" onClick={() => setShowRecipientPicker(false)}
                      className="w-full text-sm text-white bg-primary rounded-lg py-1.5 hover:bg-primary-800 transition-colors">
                      Xong
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Loại */}
            <div>
              <label className="form-label">Loại thông báo</label>
              <select className="form-select w-full" value={type}
                onChange={e => {
                  const v = e.target.value;
                  setType(v);
                  if (v !== 'discipline') setSelectedIds(new Set());
                  if (v !== 'salary') { setSalaryDriverId(''); setSalaryPreview(null); }
                }}>
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* ── Chế độ Thông báo lương ── */}
            {type === 'salary' ? (
              <>
                <div>
                  <label className="form-label text-xs">Tháng / Năm</label>
                  <MonthYearPicker month={salaryMonth} year={salaryYear}
                    onChange={(m, y) => { setSalaryMonth(m); setSalaryYear(y); if (salaryDriverId) loadSalaryPreview(salaryDriverId, m, y); }} />
                </div>
                <div>
                  <label className="form-label">Nhân viên *</label>
                  <select className="form-select w-full" value={salaryDriverId}
                    onChange={e => { setSalaryDriverId(e.target.value); loadSalaryPreview(e.target.value, salaryMonth, salaryYear); }}>
                    <option value="">-- Chọn nhân viên --</option>
                    {drivers.map(d => <option key={d._id} value={d._id}>👤 {d.full_name}</option>)}
                  </select>
                </div>
                {salaryLoading && <p className="text-sm text-gray-400">Đang tải dữ liệu lương...</p>}
                {!salaryLoading && salaryPreview && (() => {
                  const fmtVND = (v: number) => new Intl.NumberFormat('vi-VN').format(Math.round(v ?? 0));
                  const base  = (salaryPreview.base_salary ?? 0) + (salaryPreview.position_allowance ?? 0) + (salaryPreview.fuel_allowance ?? 0);
                  const total = base + (salaryPreview.overtime_pay_month ?? 0);
                  return (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                      <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide mb-3">
                        Xem trước — {salaryPreview.full_name} · Tháng {salaryMonth}/{salaryYear}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Lương cơ bản',   value: `${fmtVND(base)}đ`,                                  color: 'text-gray-900' },
                          { label: 'Chuyến tăng ca', value: `${salaryPreview.overtime_trips_month ?? 0} chuyến`, color: 'text-orange-600' },
                          { label: 'Tiền tăng ca',   value: `${fmtVND(salaryPreview.overtime_pay_month ?? 0)}đ`, color: 'text-orange-600' },
                          { label: 'Tổng lương',     value: `${fmtVND(total)}đ`,                                 color: 'text-emerald-700' },
                        ].map(item => (
                          <div key={item.label} className="bg-white rounded-lg p-2.5 text-center shadow-sm">
                            <p className="text-xs text-gray-500 mb-0.5">{item.label}</p>
                            <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {!salaryLoading && salaryDriverId && !salaryPreview && (
                  <p className="text-sm text-gray-400 text-center py-1">Không có dữ liệu lương tháng này</p>
                )}
                <button onClick={handleSendSalary}
                  disabled={salarySending || !salaryDriverId || !salaryPreview || salaryLoading}
                  className="btn-primary w-full gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                  {salarySending
                    ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Đang gửi...</>
                    : <><PaperAirplaneIcon className="w-4 h-4" />Gửi thông báo lương</>}
                </button>
              </>
            ) : (
              <>
                {/* Tiêu đề */}
                <div>
                  <label className="form-label">Tiêu đề *</label>
                  <input type="text" className="form-input w-full"
                    placeholder="VD: Thông báo nghỉ lễ 2/9"
                    value={title} onChange={e => setTitle(e.target.value)} maxLength={100} />
                  <p className="text-xs text-gray-400 mt-1 text-right">{title.length}/100</p>
                </div>

                {/* Nội dung */}
                <div>
                  <label className="form-label">Nội dung *</label>
                  <Suspense fallback={<div className="h-48 border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 text-sm">Đang tải editor...</div>}>
                    <RichTextEditor
                      value={message}
                      onChange={setMessage}
                      placeholder="Nhập nội dung thông báo... (hỗ trợ định dạng văn bản, hình ảnh)"
                      minHeight={200}
                    />
                  </Suspense>
                </div>

                {/* Preview */}
                {(title || message) && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1">
                    <p className="text-xs text-primary font-semibold uppercase tracking-wide">Xem trước</p>
                    <div className="flex gap-3 mt-2">
                      <span className="text-xl mt-0.5">
                        {TYPE_OPTIONS.find(t => t.value === type)?.label.split(' ')[0] ?? '🔔'}
                      </span>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{title || '(tiêu đề)'}</p>
                        <div className="text-gray-600 text-sm mt-0.5 prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: message || '<span style="color:#9ca3af">(nội dung)</span>' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Recipient info */}
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  {selectedIds.size > 0 ? (
                    <><UserGroupIcon className="w-4 h-4 flex-shrink-0" />
                      <span>Gửi tới: <strong className="text-gray-700">{selectedIds.size} người đã chọn</strong></span></>
                  ) : (
                    <><UserGroupIcon className="w-4 h-4 flex-shrink-0" />
                      <span>Gửi tới: <strong className="text-gray-700">Tất cả {recipients.length} người</strong></span></>
                  )}
                </div>

                {/* File đính kèm */}
                <div>
                  <label className="form-label">File đính kèm <span className="text-gray-400 font-normal">(tùy chọn)</span></label>
                  <input ref={fileInputRef} type="file" className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    onChange={e => setFile(e.target.files?.[0] ?? null)} />
                  {file ? (
                    <div className="flex items-center gap-2 p-2.5 border border-primary/30 rounded-lg bg-primary/5">
                      <PaperClipIcon className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{(file.size/1024/1024).toFixed(1)}MB</span>
                      <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="text-gray-400 hover:text-red-500 transition-colors">
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-500 hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-2">
                      <PaperClipIcon className="w-4 h-4" />
                      Đính kèm file (PDF, Word, Excel, ảnh · tối đa 20MB)
                    </button>
                  )}
                </div>

                <button onClick={handleSend} disabled={sending || !title.trim() || !message.trim()}
                  className="btn-primary w-full gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                  {sending ? (
                    <span className="flex items-center gap-2 justify-center">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Đang gửi...
                    </span>
                  ) : (
                    <><PaperAirplaneIcon className="w-4 h-4" />Gửi thông báo</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── History ── */}
        <div className="lg:col-span-3">
          <div className="card p-0 overflow-hidden">
            <div className="card-header px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Lịch sử gửi</h2>
              </div>
              <button onClick={loadHistory} className="text-xs text-primary hover:underline">Tải lại</button>
            </div>

            {histLoading ? (
              <div className="py-12 text-center text-gray-400 text-sm">Đang tải...</div>
            ) : history.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
                <BellIcon className="w-12 h-12 opacity-30" />
                <p className="text-sm">Chưa gửi thông báo nào</p>
              </div>
            ) : (              <div className="divide-y divide-gray-100">
                {history.map((h, i) => (
                  <div key={i} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Title + badge */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">{h.title}</span>
                          <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                            <CheckCircleIcon className="w-3 h-3" />{h.sent_count} người
                          </span>
                          {h.type && h.type !== 'announcement' && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
                              {TYPE_OPTIONS.find(t => t.value === h.type)?.label ?? h.type}
                            </span>
                          )}
                        </div>

                        {/* Message */}
                        <div className="text-sm text-gray-600 line-clamp-2 prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: h.message }}
                        />

                        {/* File đính kèm */}
                        {h.attachment?.url && (
                          <button
                            onClick={() => openFile(h.attachment as any)}
                            className="mt-2 flex items-center gap-2 text-xs text-primary hover:underline"
                          >
                            <span>{getFileIcon(h.attachment.mime_type)}</span>
                            <span className="truncate max-w-[180px]">{h.attachment.original_name}</span>
                            <span className="text-gray-400 flex-shrink-0">({fmtFileSize(h.attachment.size)})</span>
                          </button>
                        )}

                        {/* Time + sender */}
                        <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                          <ClockIcon className="w-3 h-3" />
                          {h.created_at ? format(parseISO(h.created_at), 'HH:mm - dd/MM/yyyy', { locale: vi }) : '—'}
                          {h.sent_by && <span className="ml-1">· {h.sent_by}</span>}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Sửa + gửi lại */}
                        <button
                          onClick={() => openEdit(h)}
                          title="Sửa và gửi lại"
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        {/* Gửi lại ngay */}
                        <button
                          onClick={() => {
                            setEditItem(h);
                            setEditTitle(h.title);
                            setEditMessage(h.message);
                            setEditFile(null);
                            // Gửi lại không sửa
                            setTimeout(async () => {
                              const fd = new FormData();
                              fd.append('title', h.title);
                              fd.append('message', h.message);
                              fd.append('type', h.type ?? 'announcement');
                              try {
                                await api.post('/notifications/broadcast', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                                toast.success('Đã gửi lại thông báo');
                                loadHistory();
                              } catch { toast.error('Gửi lại thất bại'); }
                              setEditItem(null);
                            }, 0);
                          }}
                          title="Gửi lại ngay"
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                        >
                          <ArrowPathIcon className="w-4 h-4" />
                        </button>
                        {/* Thu hồi */}
                        <button
                          onClick={() => handleRecall(h)}
                          disabled={recalling === h.created_at}
                          title="Thu hồi thông báo"
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Sửa và gửi lại ── */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)}
        title="Sửa và gửi lại thông báo" size="md"
        footer={
          <>
            <button onClick={() => setEditItem(null)} className="btn-outline text-sm px-4 py-2">Hủy</button>
            <button onClick={handleResend} disabled={editSending || !editTitle.trim() || !editMessage.trim()}
              className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
              {editSending ? 'Đang gửi...' : <><PaperAirplaneIcon className="w-4 h-4 inline mr-1" />Gửi lại</>}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div>
            <label className="form-label">Tiêu đề *</label>
            <input type="text" className="form-input w-full"
              value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={100} />
            <p className="text-xs text-gray-400 mt-1 text-right">{editTitle.length}/100</p>
          </div>
          <div>
            <label className="form-label">Nội dung *</label>
            <Suspense fallback={<div className="h-40 border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 text-sm">Đang tải editor...</div>}>
              <RichTextEditor
                value={editMessage}
                onChange={setEditMessage}
                placeholder="Nhập nội dung thông báo..."
                minHeight={180}
              />
            </Suspense>
          </div>

          {/* File đính kèm cũ */}
          {editItem?.attachment?.url && !editFile && (
            <div className="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg bg-gray-50">
              <span>{getFileIcon(editItem.attachment.mime_type)}</span>
              <span className="text-sm text-gray-700 truncate flex-1">{editItem.attachment.original_name}</span>
              <span className="text-xs text-gray-400">{fmtFileSize(editItem.attachment.size)}</span>
              <span className="text-xs text-gray-400">(đính kèm cũ)</span>
            </div>
          )}

          {/* File mới */}
          <div>
            <label className="form-label">File đính kèm mới <span className="text-gray-400 font-normal">(tuỳ chọn — sẽ thay thế file cũ)</span></label>
            <input ref={editFileInputRef} type="file" className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              onChange={e => setEditFile(e.target.files?.[0] ?? null)} />
            {editFile ? (
              <div className="flex items-center gap-2 p-2.5 border border-primary/30 rounded-lg bg-primary/5">
                <PaperClipIcon className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm text-gray-700 truncate flex-1">{editFile.name}</span>
                <button onClick={() => { setEditFile(null); if (editFileInputRef.current) editFileInputRef.current.value = ''; }}
                  className="text-gray-400 hover:text-red-500">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => editFileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-500 hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-2">
                <PaperClipIcon className="w-4 h-4" />
                Đính kèm file mới
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Lightbox xem ảnh ── */}
      {lightbox && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
            onClick={() => setLightbox(null)}>
            <XMarkIcon className="w-5 h-5 text-white" />
          </button>
          <img src={lightbox} alt="File đính kèm"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* ── Modal xem file inline (PDF, Office, v.v.) ── */}
      {filePreview && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900/80">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg">{getFileIcon(filePreview.mime)}</span>
              <span className="text-white text-sm font-medium truncate max-w-[400px]">{filePreview.name}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <a href={filePreview.url} download={filePreview.name}
                className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                ⬇ Tải về
              </a>
              <button onClick={() => setFilePreview(null)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                <XMarkIcon className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Viewer */}
          <div className="flex-1 overflow-hidden">
            {isPdf(filePreview.mime) ? (
              /* PDF: render trực tiếp bằng browser */
              <iframe
                src={filePreview.url}
                className="w-full h-full border-0"
                title={filePreview.name}
              />
            ) : isOffice(filePreview.mime) ? (
              /* Word/Excel/PowerPoint: dùng Microsoft Office Online Viewer */
              <iframe
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(window.location.origin + filePreview.url)}`}
                className="w-full h-full border-0 bg-white"
                title={filePreview.name}
              />
            ) : (
              /* Fallback: hiển thị trong object tag */
              <object
                data={filePreview.url}
                type={filePreview.mime}
                className="w-full h-full"
              >
                <div className="flex flex-col items-center justify-center h-full text-white gap-4">
                  <span className="text-6xl">{getFileIcon(filePreview.mime)}</span>
                  <p className="text-sm text-gray-300">Không thể xem trực tiếp loại file này</p>
                  <a href={filePreview.url} download={filePreview.name}
                    className="btn-primary text-sm px-5 py-2">⬇ Tải về máy</a>
                </div>
              </object>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
