import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckIcon, XMarkIcon, ArrowLeftIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import api from '@/lib/api';
import StatusBadge from '@/components/ui/StatusBadge';
import { useAuthStore } from '@/stores/authStore';

const TYPE_LABEL: Record<string, string> = {
  salary_advance: 'Tạm ứng lương', leave: 'Nghỉ phép',
  expense: 'Chi phí', purchase: 'Mua hàng',
  additional_trip: 'Thêm chuyến', attendance_adjustment: 'Đổi giờ',
  reward: 'Khen thưởng', discipline: 'Kỷ luật',
};

const PAYLOAD_KEY_LABEL: Record<string, string> = {
  duration: 'Thời lượng', leave_type: 'Loại nghỉ phép',
  start_date: 'Ngày bắt đầu', end_date: 'Ngày kết thúc',
  start_time: 'Giờ bắt đầu', end_time: 'Giờ kết thúc',
  reason: 'Lý do', content: 'Nội dung', note: 'Ghi chú',
  amount: 'Số tiền', purpose: 'Mục đích', repay_date: 'Ngày hoàn trả',
  description: 'Mô tả', category: 'Danh mục', date: 'Ngày',
  check_in_time: 'Giờ vào', check_out_time: 'Giờ ra',
};

const fmtKey = (k: string) =>
  PAYLOAD_KEY_LABEL[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const fmtVal = (v: any) => {
  if (typeof v === 'number') return new Intl.NumberFormat('vi-VN').format(v) + (String(v).length > 3 ? 'đ' : '');
  if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/)) {
    try { return format(parseISO(v), 'dd/MM/yyyy', { locale: vi }); } catch { return v; }
  }
  return String(v ?? '—');
};

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [insufficientFund, setInsufficientFund] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get(`/requests/${id}`)
      .then(res => setRequest(res.data.data))
      .catch(() => toast.error('Không tải được yêu cầu'))
      .finally(() => setLoading(false));
  }, [id]);

  const canApprove = () => {
    if (!user || !request || request.status !== 'pending') return false;
    const FINANCIAL = ['salary_advance', 'expense', 'purchase', 'reward', 'discipline'];
    const OPERATIONAL = ['attendance_adjustment', 'leave', 'additional_trip'];
    if (user.role === 'coordinator' && FINANCIAL.includes(request.type)) return false;
    if (user.role === 'accountant' && OPERATIONAL.includes(request.type)) return false;
    return ['coordinator', 'accountant', 'manager'].includes(user.role);
  };

  const doApprove = async () => {
    if (!request) return;
    setActionLoading(true);
    try {
      const res = await api.put(`/requests/${request._id}/approve`, { comment: 'Admin duyệt' });
      setRequest((prev: any) => ({ ...prev, status: 'approved' }));

      const insuf = res.data?.insufficient_fund;
      if (insuf) {
        setInsufficientFund(insuf);
        toast('⚠️ Đã duyệt nhưng quỹ tài xế không đủ', { icon: '⚠️', style: { background: '#fef3c7', color: '#92400e' } });
      } else {
        toast.success('✅ Đã duyệt yêu cầu');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Duyệt thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const doReject = async () => {
    if (!request || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await api.put(`/requests/${request._id}/reject`, { rejection_reason: rejectReason });
      setRequest((prev: any) => ({ ...prev, status: 'rejected' }));
      setShowReject(false);
      toast.success('Đã từ chối yêu cầu');
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Đang tải...</div>
  );

  if (!request) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Không tìm thấy yêu cầu</div>
  );

  const payloadEntries = Object.entries(request.payload ?? {})
    .filter(([k]) => !['attachments'].includes(k));

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
          <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Chi tiết yêu cầu</h1>
          <p className="text-xs text-gray-400 mt-0.5">{TYPE_LABEL[request.type] ?? request.type}</p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {/* Cảnh báo quỹ không đủ */}
      {insufficientFund && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Quỹ tài xế không đủ</p>
            <p className="text-xs text-amber-700 mt-1">
              Yêu cầu đã được duyệt nhưng quỹ hiện tại chỉ còn{' '}
              <strong>{new Intl.NumberFormat('vi-VN').format(insufficientFund.current_balance)}đ</strong>,
              thiếu <strong>{new Intl.NumberFormat('vi-VN').format(insufficientFund.shortage)}đ</strong>.
            </p>
            <button
              onClick={() => navigate(`/finance/fund?driverId=${insufficientFund.driver_id}`)}
              className="mt-2 text-xs font-semibold text-amber-800 underline hover:text-amber-900"
            >
              → Nạp tiền vào quỹ ngay
            </button>
          </div>
        </div>
      )}

      {/* Thông tin chính */}
      <div className="card divide-y divide-gray-50">
        <div className="px-5 py-4">
          <h2 className="text-sm font-bold text-gray-900">{request.title}</h2>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span>👤 {request.created_by?.name ?? '—'}</span>
            <span>📞 {request.created_by?.phone ?? '—'}</span>
            <span>🕐 {request.created_at ? format(parseISO(request.created_at), 'dd/MM/yyyy HH:mm', { locale: vi }) : '—'}</span>
          </div>
        </div>

        {/* Payload */}
        {payloadEntries.length > 0 && (
          <div className="px-5 py-4 grid grid-cols-2 gap-3">
            {payloadEntries.map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-gray-400">{fmtKey(k)}</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5">{fmtVal(v)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Approved / Rejected info */}
        {request.status === 'approved' && request.approved_by && (
          <div className="px-5 py-4 bg-green-50">
            <p className="text-xs text-green-700">
              ✅ Duyệt bởi <strong>{request.approved_by?.name}</strong>
              {request.approved_at && ` · ${format(parseISO(request.approved_at), 'dd/MM/yyyy HH:mm', { locale: vi })}`}
            </p>
          </div>
        )}
        {request.status === 'rejected' && (
          <div className="px-5 py-4 bg-red-50">
            <p className="text-xs text-red-700">
              ❌ Từ chối{request.rejection_reason ? `: ${request.rejection_reason}` : ''}
            </p>
          </div>
        )}
      </div>

      {/* Lịch sử */}
      {request.history?.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Lịch sử</h3>
          <div className="space-y-2">
            {request.history.map((h: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-16 text-gray-400">{h.at ? format(parseISO(h.at), 'dd/MM HH:mm') : '—'}</span>
                <span className="font-medium text-gray-700">{h.action_by?.name ?? '—'}</span>
                <span>→ {h.action}</span>
                {h.comment && <span className="italic">"{h.comment}"</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {canApprove() && (
        <div className="flex gap-3">
          <button
            onClick={() => setShowReject(true)}
            className="flex-1 h-11 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
          >
            <XMarkIcon className="w-4 h-4" /> Từ chối
          </button>
          <button
            onClick={doApprove}
            disabled={actionLoading}
            className="flex-1 h-11 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <CheckIcon className="w-4 h-4" />
            {actionLoading ? 'Đang duyệt...' : 'Duyệt'}
          </button>
        </div>
      )}

      {/* Modal từ chối */}
      {showReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Từ chối yêu cầu</h3>
            <textarea
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
              rows={3}
              placeholder="Nhập lý do từ chối..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowReject(false)}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-medium">
                Hủy
              </button>
              <button onClick={doReject} disabled={!rejectReason.trim() || actionLoading}
                className="flex-1 h-10 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50">
                {actionLoading ? 'Đang xử lý...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
