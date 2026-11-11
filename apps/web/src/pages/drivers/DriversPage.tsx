import { useState, useCallback, useEffect } from 'react';
import {
  PlusIcon, MagnifyingGlassIcon, PencilIcon,
  TrashIcon, TruckIcon,
} from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import api from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import Pagination from '@/components/ui/Pagination';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateInput from '@/components/ui/DateInput';

interface Driver {
  _id: string;
  full_name: string;
  phone: string;
  email?: string;
  employee_id: string;
  position: string;
  department: string;
  join_date: string;
  status: string;
  vehicle_id: { _id: string; license_plate: string } | null;
  user_id: { phone: string; status: string; avatar: string | null };
}

interface DriverFormData {
  full_name: string;
  phone: string;
  email: string;
  password: string;
  employee_id: string;
  license_number: string;
  license_type: string;
  department: string;
  position: string;
  join_date: string;
  status: string;
  address: string;
}

export default function DriversPage() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<Driver | null>(null);
  const [delTarget, setDelTarget] = useState<Driver | null>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Driver | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [assignVehicle, setAssignVehicle] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [saving, setSaving]     = useState(false);

  // Ngày nghỉ tháng hiện tại — map driverId → số ngày nghỉ
  const [leaveMap, setLeaveMap] = useState<Record<string, number>>({});
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();

  useEffect(() => {
    // Lấy leave requests approved tháng hiện tại để hiển thị ngày nghỉ
    api.get('/drivers/salary/list', { params: { month: curMonth, year: curYear } })
      .then(res => {
        const map: Record<string, number> = {};
        (res.data.data?.drivers ?? []).forEach((d: any) => {
          if (d.leave_days_month > 0) map[d._id] = d.leave_days_month;
        });
        setLeaveMap(map);
      })
      .catch(() => {});
  }, []);

  const { data, loading, refetch } = useApi<any>('/drivers', {
    page, limit: 15, search, status: statusFilter,
  });

  const drivers: Driver[]   = data?.drivers ?? [];
  const pagination          = data?.pagination;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<DriverFormData>();

  /* ── Open form ── */
  const openAdd = () => { setEditing(null); reset({ status: 'active', position: 'Tài xế', department: 'Vận chuyển' }); setShowForm(true); };
  const openEdit = (d: Driver) => {
    setEditing(d);
    reset({
      full_name:      d.full_name,
      phone:          d.phone,
      email:          (d as any).user_id?.email ?? (d as any).email ?? '',
      password:       '',
      employee_id:    d.employee_id,
      department:     d.department,
      position:       d.position,
      join_date:      d.join_date ? d.join_date.slice(0, 10) : '',
      status:         d.status,
      address:        '',
    });
    setShowForm(true);
  };

  /* ── Save ── */
  const onSubmit = async (data: DriverFormData) => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/drivers/${editing._id}`, data);
        toast.success('Cập nhật tài xế thành công');
      } else {
        await api.post('/drivers', data);
        toast.success('Thêm tài xế thành công');
      }
      setShowForm(false);
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!delTarget) return;
    setDelLoading(true);
    try {
      await api.delete(`/drivers/${delTarget._id}`);
      toast.success('Đã xóa tài xế');
      setDelTarget(null);
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Xóa thất bại');
    } finally {
      setDelLoading(false);
    }
  };

  /* ── Assign vehicle ── */
  const openAssign = async (d: Driver) => {
    setAssignTarget(d);
    setAssignVehicle(d.vehicle_id?._id ?? '');
    const res = await api.get('/vehicles', { params: { status: 'active', limit: 100 } });
    setVehicles(res.data.data?.vehicles ?? []);
  };

  const handleAssign = async () => {
    if (!assignTarget || !assignVehicle) return;
    setAssignLoading(true);
    try {
      await api.post(`/drivers/${assignTarget._id}/assign-vehicle`, { vehicle_id: assignVehicle });
      toast.success('Gán xe thành công');
      setAssignTarget(null);
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Gán xe thất bại');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Quản lý tài xế</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pagination?.total ?? 0} tài xế trong hệ thống
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary gap-2 self-start sm:self-auto">
          <PlusIcon className="w-4 h-4" />
          Thêm tài xế
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="card mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="form-input pl-9"
                placeholder="Tìm theo tên, SĐT, mã NV..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary px-4">Tìm</button>
          </form>
          <select
            className="form-select w-full sm:w-40"
            value={statusFilter}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="inactive">Không HĐ</option>
            <option value="on_leave">Nghỉ phép</option>
            <option value="suspended">Đình chỉ</option>
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card p-0 overflow-hidden">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Tài xế</th>
                <th>Mã NV</th>
                <th>Xe được gán</th>
                <th>Ngày vào</th>
                <th>Ngày nghỉ T{curMonth}/{curYear}</th>
                <th>Trạng thái</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-400">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!loading && drivers.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <span className="text-4xl">👤</span>
                      <p className="text-sm">Chưa có tài xế nào</p>
                    </div>
                  </td>
                </tr>
              )}
              {drivers.map(d => (
                <tr key={d._id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {d.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{d.full_name}</p>
                        <p className="text-xs text-gray-500">{d.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-sm text-gray-600">{d.employee_id ?? '—'}</td>
                  <td>
                    {d.vehicle_id ? (
                      <span className="badge badge-info">{d.vehicle_id.license_plate}</span>
                    ) : (
                      <span className="text-gray-400 text-xs">Chưa gán</span>
                    )}
                  </td>
                  <td className="text-sm text-gray-600">
                    {d.join_date ? format(parseISO(d.join_date), 'dd/MM/yyyy', { locale: vi }) : '—'}
                  </td>
                  <td className="text-center">
                    {leaveMap[d._id] ? (
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1">
                        🏖️ {leaveMap[d._id]} ngày
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td><StatusBadge status={d.status} /></td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openAssign(d)}
                        title="Gán xe"
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                      >
                        <TruckIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(d)}
                        title="Sửa"
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-yellow-50 hover:text-yellow-600 transition-colors"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDelTarget(d)}
                        title="Xóa"
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && (
          <Pagination
            page={page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={15}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* ── Add/Edit modal ── */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Cập nhật tài xế' : 'Thêm tài xế mới'}
        size="lg"
        footer={
          <>
            <button onClick={() => setShowForm(false)} className="btn-outline text-sm px-4 py-2">
              Hủy
            </button>
            <button
              onClick={handleSubmit(onSubmit)}
              disabled={saving}
              className="btn-primary text-sm px-5 py-2"
            >
              {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm tài xế'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">Họ tên *</label>
            <input
              {...register('full_name', { required: 'Bắt buộc' })}
              className="form-input"
              placeholder="Nguyễn Văn A"
            />
            {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
          </div>
          <div>
            <label className="form-label">Số điện thoại *</label>
            <input
              {...register('phone', { required: 'Bắt buộc' })}
              className="form-input"
              placeholder="0901234567"
            />
            {errors.phone && <p className="form-error">{errors.phone.message}</p>}
          </div>
          <div>
            <label className="form-label">{editing ? 'Mật khẩu mới (bỏ trống = giữ nguyên)' : 'Mật khẩu *'}</label>
            <input
              {...register('password', { required: !editing ? 'Bắt buộc' : false })}
              type="password"
              className="form-input"
              placeholder={editing ? '••••••' : 'Tối thiểu 6 ký tự'}
            />
            {errors.password && <p className="form-error">{errors.password.message}</p>}
          </div>
          <div>
            <label className="form-label">Mã nhân viên</label>
            <input {...register('employee_id')} className="form-input" placeholder="TX001" />
          </div>
          <div>
            <label className="form-label">Số GPLX</label>
            <input {...register('license_number')} className="form-input" placeholder="B1-123456" />
          </div>
          <div>
            <label className="form-label">Hạng GPLX</label>
            <input {...register('license_type')} className="form-input" placeholder="C, D, E..." />
          </div>
          <div>
            <label className="form-label">Phòng ban</label>
            <input {...register('department')} className="form-input" placeholder="Vận chuyển" />
          </div>
          <div>
            <label className="form-label">Chức vụ</label>
            <input {...register('position')} className="form-input" placeholder="Tài xế" />
          </div>
          <div>
            <label className="form-label">Ngày vào làm</label>
            <DateInput {...register('join_date')} />
          </div>
          <div>
            <label className="form-label">Trạng thái</label>
            <select {...register('status')} className="form-select">
              <option value="active">Hoạt động</option>
              <option value="inactive">Không hoạt động</option>
              <option value="on_leave">Nghỉ phép</option>
              <option value="suspended">Đình chỉ</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="form-label">Địa chỉ</label>
            <input {...register('address')} className="form-input" placeholder="Địa chỉ thường trú" />
          </div>
          <div className="col-span-2">
            <label className="form-label">Email <span className="text-gray-400 text-xs font-normal">(dùng để nhận OTP quên mật khẩu)</span></label>
            <input
              {...register('email')}
              type="email"
              className="form-input"
              placeholder="example@gmail.com"
            />
          </div>
        </div>
      </Modal>

      {/* ── Assign vehicle modal ── */}
      <Modal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        title={`Gán xe cho ${assignTarget?.full_name ?? ''}`}
        size="sm"
        footer={
          <>
            <button onClick={() => setAssignTarget(null)} className="btn-outline text-sm px-4 py-2">Hủy</button>
            <button
              onClick={handleAssign}
              disabled={!assignVehicle || assignLoading}
              className="btn-primary text-sm px-4 py-2"
            >
              {assignLoading ? 'Đang gán...' : 'Gán xe'}
            </button>
          </>
        }
      >
        <div>
          <label className="form-label">Chọn xe</label>
          <select
            className="form-select"
            value={assignVehicle}
            onChange={e => setAssignVehicle(e.target.value)}
          >
            <option value="">-- Chọn xe --</option>
            {vehicles.map(v => (
              <option key={v._id} value={v._id}>
                {v.license_plate} — {v.brand} {v.model}
                {v.assigned_driver ? ' (Đã có tài xế)' : ''}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={handleDelete}
        title="Xóa tài xế"
        message={`Bạn có chắc muốn xóa tài xế "${delTarget?.full_name}"? Thao tác này không thể hoàn tác.`}
        confirmLabel="Xóa"
        danger
        loading={delLoading}
      />
    </div>
  );
}
