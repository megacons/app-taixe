import { useState } from 'react';
import { CheckIcon, XMarkIcon, EyeIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import { useSocket } from '@/hooks/useSocket';
import { usePendingRequests } from '@/hooks/usePendingRequests';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import Pagination from '@/components/ui/Pagination';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

const TYPE_LABEL: Record<string, string> = {
  salary_advance: 'Tạm ứng lương', leave: 'Nghỉ phép',
  expense: 'Chi phí', purchase: 'Mua hàng',
  additional_trip: 'Thêm chuyến', attendance_adjustment: 'Đổi giờ',
  reward: 'Khen thưởng', discipline: 'Kỷ luật',
};

// Dịch tên field trong payload sang tiếng Việt
const PAYLOAD_KEY_LABEL: Record<string, string> = {
  // Nghỉ phép
  duration:           'Thời lượng',
  leave_type:         'Loại nghỉ phép',
  start_date:         'Ngày bắt đầu',
  end_date:           'Ngày kết thúc',
  start_time:         'Giờ bắt đầu',
  end_time:           'Giờ kết thúc',
  reason:             'Lý do',
  content:            'Nội dung',
  note:               'Ghi chú',
  // Tạm ứng
  amount:             'Số tiền',
  purpose:            'Mục đích',
  repay_date:         'Ngày hoàn trả',
  // Chi phí / Mua hàng
  description:        'Mô tả',
  category:           'Danh mục',
  receipt:            'Biên lai',
  supplier:           'Nhà cung cấp',
  quantity:           'Số lượng',
  unit_price:         'Đơn giá',
  // Thêm chuyến
  trip_date:          'Ngày chuyến',
  pickup_location:    'Nơi lấy',
  drop_location:      'Nơi đổ',
  material:           'Vật liệu',
  vehicle:            'Xe',
  // Đổi giờ chấm công
  change_type:        'Loại thay đổi',
  date:               'Ngày',
  check_in_time:      'Giờ vào',
  check_out_time:     'Giờ ra',
  // Khen thưởng / Kỷ luật
  type:               'Loại',
  violation:          'Vi phạm',
  reward_type:        'Loại khen thưởng',
  penalty:            'Hình phạt',
  reward_amount:      'Tiền thưởng',
  penalty_amount:     'Số tiền phạt',
};

const fmtPayloadKey = (k: string) =>
  PAYLOAD_KEY_LABEL[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function RequestsPage() {
  const [page, setPage]         = useState(1);
  const [typeFilter, setType]   = useState('');
  const [statusFilter, setStatus] = useState('pending');
  const [detail, setDetail]     = useState<any>(null);
  const [approveTarget, setApproveTarget] = useState<any>(null);
  const [rejectTarget, setRejectTarget]   = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { refresh: refreshPendingCount } = usePendingRequests();

  const { register: regReject, handleSubmit: handleReject, reset: resetReject, formState: { errors: errReject } } = useForm<{ reason: string }>();

  // Realtime: join admin room, nhận new:request → toast + refetch
  useSocket({
    rooms: ['join:admin'],
    events: {
      'new:request': (data: any) => {
        toast(`🔔 Yêu cầu mới: ${data.driver_name} — ${data.title}`, {
          duration: 5000,
          icon: '📋',
        });
        refetch();
      },
      'request:updated': () => {
        refetch();
      },
      'request:approved': (data: any) => {
        toast.success(`✅ Đã duyệt: ${data.title}`, { duration: 3000 });
        refetch();
      },
      'request:rejected': (data: any) => {
        toast.error(`❌ Đã từ chối: ${data.title}`, { duration: 3000 });
        refetch();
      },
    },
  });

  const { data, loading, refetch } = useApi<any>('/requests', {
    page, limit: 15, type: typeFilter, status: statusFilter,
  });

  const requests    = data?.requests ?? [];
  const pagination  = data?.pagination;

  /* ── Approve ── */
  const doApprove = async (comment: string) => {
    if (!approveTarget) return;
    setActionLoading(true);
    try {
      const res = await api.put(`/requests/${approveTarget._id}/approve`, { comment });
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
              <a
                href={`/finance/fund`}
                onClick={() => toast.dismiss(t.id)}
                className="mt-1 text-xs font-bold text-amber-900 underline"
              >
                → Nạp tiền vào quỹ tài xế
              </a>
            </div>
          ),
          { duration: 8000, style: { background: '#fef3c7', color: '#92400e', maxWidth: 320 } }
        );
      } else {
        toast.success('Đã duyệt yêu cầu');
      }
      setApproveTarget(null);
      refetch();
      refreshPendingCount();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Duyệt thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  /* ── Reject ── */
  const doReject = async ({ reason }: { reason: string }) => {
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      await api.put(`/requests/${rejectTarget._id}/reject`, { rejection_reason: reason });
      toast.success('Đã từ chối yêu cầu');
      setRejectTarget(null);
      resetReject();
      refetch();
      refreshPendingCount();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Từ chối thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const pendingCount = requests.filter((r: any) => r.status === 'pending').length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Quản lý yêu cầu</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pagination?.total ?? 0} yêu cầu
            {statusFilter === 'pending' && pendingCount > 0 && (
              <span className="ml-2 badge badge-warning">{pendingCount} chờ duyệt</span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-5">
        <div className="flex flex-wrap gap-3">
          <select className="form-select w-44 text-sm" value={statusFilter}
            onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Tất cả trạng thái</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
          </select>
          <select className="form-select w-44 text-sm" value={typeFilter}
            onChange={e => { setType(e.target.value); setPage(1); }}>
            <option value="">Tất cả loại</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Loại</th>
                <th>Tiêu đề</th>
                <th>Người gửi</th>
                <th>Ngày gửi</th>
                <th>Trạng thái</th>
                <th className="text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">Đang tải...</td></tr>
              )}
              {!loading && requests.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <span className="text-4xl">📋</span>
                    <p className="text-sm">Không có yêu cầu nào</p>
                  </div>
                </td></tr>
              )}
              {requests.map((r: any) => (
                <tr key={r._id}>
                  <td className="text-xs text-gray-500 font-mono">{r.request_number ?? '—'}</td>
                  <td>
                    <span className="badge badge-info text-xs">
                      {TYPE_LABEL[r.type] ?? r.type}
                    </span>
                  </td>
                  <td className="text-sm font-medium text-gray-900 max-w-[200px] truncate">
                    {r.title}
                  </td>
                  <td>
                    <p className="text-sm text-gray-800">{r.created_by?.name ?? '—'}</p>
                  </td>
                  <td className="text-xs text-gray-500 whitespace-nowrap">
                    {r.created_at ? format(parseISO(r.created_at), 'dd/MM/yyyy HH:mm', { locale: vi }) : '—'}
                  </td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setDetail(r)} title="Xem"
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      {r.status === 'pending' && (
                        <>
                          <button onClick={() => setApproveTarget(r)} title="Duyệt"
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-green-50 hover:text-green-600">
                            <CheckIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => setRejectTarget(r)} title="Từ chối"
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && (
          <Pagination page={page} totalPages={pagination.totalPages}
            total={pagination.total} limit={15} onPageChange={setPage} />
        )}
      </div>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Chi tiết yêu cầu" size="md"
        footer={
          detail?.status === 'pending' ? (
            <>
              <button onClick={() => { setDetail(null); setRejectTarget(detail); }}
                className="btn-danger text-sm px-4 py-2">Từ chối</button>
              <button onClick={() => { setDetail(null); setApproveTarget(detail); }}
                className="btn-primary text-sm px-4 py-2">Duyệt</button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="badge badge-info">{TYPE_LABEL[detail.type] ?? detail.type}</span>
              <StatusBadge status={detail.status} />
            </div>
            {[
              ['Mã YC', detail.request_number],
              ['Tiêu đề', detail.title],
              ['Người gửi', detail.created_by?.name ?? '—'],
              ['Ngày gửi', detail.created_at ? format(parseISO(detail.created_at), 'dd/MM/yyyy HH:mm') : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">{k}</span>
                <span className="font-medium text-gray-900 text-right max-w-[55%]">{v}</span>
              </div>
            ))}
            {detail.payload && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Nội dung yêu cầu</p>
                {Object.entries(detail.payload).map(([k, v]: any) => (
                  <div key={k} className="flex justify-between border-b border-gray-50 pb-1.5 mb-1.5">
                    <span className="text-gray-500">{fmtPayloadKey(k)}</span>
                    <span className="font-medium text-gray-800 text-right max-w-[55%]">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
            {detail.rejection_reason && (
              <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100">
                <p className="text-xs font-semibold text-red-500 mb-1">Lý do từ chối</p>
                <p className="text-sm text-red-700">{detail.rejection_reason}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Approve confirm */}
      <Modal open={!!approveTarget} onClose={() => setApproveTarget(null)}
        title="Duyệt yêu cầu" size="sm"
        footer={
          <>
            <button onClick={() => setApproveTarget(null)} className="btn-outline text-sm px-4 py-2">Hủy</button>
            <button onClick={() => doApprove('')} disabled={actionLoading}
              className="btn-primary text-sm px-4 py-2">
              {actionLoading ? 'Đang duyệt...' : '✅ Xác nhận duyệt'}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Duyệt yêu cầu <strong>"{approveTarget?.title}"</strong>?<br />
          Tài xế sẽ nhận thông báo sau khi được duyệt.
        </p>
      </Modal>

      {/* Reject modal */}
      <Modal open={!!rejectTarget} onClose={() => { setRejectTarget(null); resetReject(); }}
        title="Từ chối yêu cầu" size="sm"
        footer={
          <>
            <button onClick={() => { setRejectTarget(null); resetReject(); }}
              className="btn-outline text-sm px-4 py-2">Hủy</button>
            <button onClick={handleReject(doReject)} disabled={actionLoading}
              className="btn-danger text-sm px-4 py-2">
              {actionLoading ? 'Đang xử lý...' : '❌ Từ chối'}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600 mb-3">
          Từ chối yêu cầu <strong>"{rejectTarget?.title}"</strong>?
        </p>
        <div>
          <label className="form-label">Lý do từ chối *</label>
          <textarea
            {...regReject('reason', { required: 'Vui lòng nhập lý do' })}
            rows={3}
            className="form-input resize-none"
            placeholder="Nhập lý do từ chối..."
          />
          {errReject.reason && <p className="form-error">{errReject.reason.message}</p>}
        </div>
      </Modal>
    </div>
  );
}
