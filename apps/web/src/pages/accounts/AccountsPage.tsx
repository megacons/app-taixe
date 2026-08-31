import { useState, useCallback } from 'react';
import {
  PlusIcon, MagnifyingGlassIcon, PencilIcon, TrashIcon, TruckIcon,
  EyeIcon, EyeSlashIcon,
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
import { useAuthStore } from '@/stores/authStore';

const getImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

/* ── types ── */
interface Account {
  _id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  status: string;
  last_login: string | null;
  employee_id: string | null;
  branch: string | null;
  department: string | null;
  position: string | null;
  join_date: string | null;
}

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
  user_id: { phone: string; status: string; avatar: string | null; email?: string } | null;
}

const ROLE_LABEL: Record<string, string> = {
  manager:     'Quản lý',
  coordinator: 'Điều phối',
  accountant:  'Kế toán',
  driver:      'Tài xế',
  employee:    'Nhân viên',
};

const ROLE_COLOR: Record<string, string> = {
  manager:     'bg-purple-100 text-purple-700',
  coordinator: 'bg-blue-100   text-blue-700',
  accountant:  'bg-emerald-100 text-emerald-700',
  driver:      'bg-orange-100  text-orange-700',
  employee:    'bg-gray-100    text-gray-700',
};

/* ══════════════════════════
 *  TAB: Nhân viên (Staff)
 * ══════════════════════════ */
function StaffTab({ canEdit = true, isCoordinator = false }: { canEdit?: boolean; isCoordinator?: boolean }) {
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatus]   = useState('');
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState<Account | null>(null);
  const [delTarget, setDelTarget]   = useState<Account | null>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [showPwd, setShowPwd]       = useState(false);

  const { data, loading, refetch } = useApi<any>('/users', {
    page, limit: 15, search, status: statusFilter,
  });
  const { user: currentUser } = useAuthStore();

  const accounts: Account[] = data?.users ?? [];
  const pagination           = data?.pagination;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<any>();

  const openAdd = () => {
    setEditing(null);
    setShowPwd(false);
    reset({ role: 'coordinator', status: 'active', password: '', name: '', phone: '', email: '' });
    setShowForm(true);
  };

  const openEdit = (a: Account) => {
    setEditing(a);
    setShowPwd(false);
    reset({
      name: a.name, phone: a.phone, email: a.email ?? '',
      role: a.role, status: a.status, password: '',
      employee_id: a.employee_id ?? '',
      branch:      a.branch      ?? '',
      department:  a.department  ?? '',
      position:    a.position    ?? '',
      join_date:   a.join_date   ? a.join_date.slice(0, 10) : '',
    });
    setShowForm(true);
  };

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/users/${editing._id}`, data);
        toast.success('Cập nhật tài khoản thành công');
      } else {
        await api.post('/users', data);
        toast.success('Tạo tài khoản thành công');
      }
      setShowForm(false);
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    setDelLoading(true);
    try {
      await api.delete(`/users/${delTarget._id}`);
      toast.success('Đã xóa tài khoản');
      setDelTarget(null);
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Xóa thất bại');
    } finally {
      setDelLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setSearch(searchInput); setPage(1); };

  return (
    <div className="space-y-4">
      {/* Toolbar + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Tìm tên, SĐT, email..."
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
              className="form-input pl-9 w-full" />
          </div>
          <button type="submit" className="btn-primary px-4">Tìm</button>
        </form>
        <select value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(1); }} className="form-select w-full sm:w-40">
          <option value="">Tất cả trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="inactive">Không HĐ</option>
          <option value="suspended">Đình chỉ</option>
        </select>
        {canEdit && (
          <button onClick={openAdd} className="btn-primary gap-2 whitespace-nowrap">
            <PlusIcon className="w-4 h-4" /> Thêm tài khoản
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Tên nhân viên', 'Mã nhân viên', 'Số điện thoại', 'Nhóm truy cập', 'Chi nhánh', 'Phòng ban', 'Chức danh', 'Ngày vào làm', 'Trạng thái', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 10 }).map((_, j) => (
                  <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                ))}</tr>
              )) : accounts.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">
                  <p className="text-3xl mb-2">👥</p><p>Chưa có tài khoản nào</p>
                </td></tr>
              ) : accounts.map(a => (
                <tr key={a._id} className="hover:bg-gray-50 transition-colors">
                  {/* Tên nhân viên */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {a.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 whitespace-nowrap">{a.name}</p>
                        <p className="text-xs text-gray-400">{a.email ?? ''}</p>
                      </div>
                    </div>
                  </td>
                  {/* Mã nhân viên */}
                  <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{a.employee_id ?? '—'}</td>
                  {/* Số điện thoại */}
                  <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{a.phone ?? '—'}</td>
                  {/* Nhóm truy cập */}
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${ROLE_COLOR[a.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_LABEL[a.role] ?? a.role}
                    </span>
                  </td>
                  {/* Chi nhánh */}
                  <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap max-w-[140px] truncate">{a.branch ?? '—'}</td>
                  {/* Phòng ban */}
                  <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{a.department ?? '—'}</td>
                  {/* Chức danh */}
                  <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{a.position ?? '—'}</td>
                  {/* Ngày vào làm */}
                  <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                    {a.join_date ? format(parseISO(a.join_date), 'dd/MM/yyyy', { locale: vi }) : '—'}
                  </td>
                  {/* Trạng thái */}
                  <td className="px-4 py-3.5"><StatusBadge status={a.status} /></td>
                  {/* Thao tác */}
                  <td className="px-4 py-3.5">
                    {canEdit && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(a)} title="Sửa" className="p-1.5 rounded-lg text-gray-500 hover:bg-yellow-50 hover:text-yellow-600 transition-colors">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDelTarget(a)} title="Xóa" className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} limit={15} onPageChange={setPage} />}
      </div>

      {/* Form Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)}
        title={editing ? 'Cập nhật tài khoản' : 'Thêm tài khoản mới'} size="lg"
        footer={<>
          <button onClick={() => setShowForm(false)} className="btn-outline text-sm px-4 py-2">Hủy</button>
          <button onClick={handleSubmit(onSubmit)} disabled={saving} className="btn-primary text-sm px-5 py-2">
            {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Tạo tài khoản'}
          </button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">Họ tên <span className="text-red-500">*</span></label>
            <input {...register('name', { required: 'Bắt buộc' })} className="form-input" placeholder="Nguyễn Văn A" />
            {errors.name && <p className="form-error">{errors.name.message as string}</p>}
          </div>
          <div>
            <label className="form-label">Số điện thoại <span className="text-red-500">*</span></label>
            <input {...register('phone', { required: 'Bắt buộc' })} className="form-input" placeholder="0901234567" />
            {errors.phone && <p className="form-error">{errors.phone.message as string}</p>}
          </div>
          <div>
            <label className="form-label">{editing ? 'Mật khẩu' : 'Mật khẩu *'}</label>
            <div className="relative">
              <input {...register('password', { required: !editing ? 'Bắt buộc' : false, minLength: { value: 6, message: 'Tối thiểu 6 ký tự' } })}
                type={showPwd ? 'text' : 'password'} autoComplete="new-password" className="form-input pr-10"
                placeholder={editing ? 'Để trống nếu không đổi' : 'Tối thiểu 6 ký tự'} />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPwd ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="form-error">{errors.password.message as string}</p>}
          </div>
          <div>
            <label className="form-label">Vai trò <span className="text-red-500">*</span></label>
            <select {...register('role', { required: 'Bắt buộc' })} className="form-select"
              disabled={!!editing && editing._id === currentUser?._id}>
              <option value="coordinator">Điều phối</option>
              {!isCoordinator && <option value="manager">Quản lý</option>}
              <option value="employee">Nhân viên</option>
            </select>
            {editing && editing._id === currentUser?._id && (
              <p className="text-xs text-gray-400 mt-1">Không thể tự thay đổi vai trò của mình</p>
            )}
          </div>
          <div>
            <label className="form-label">Trạng thái</label>
            <select {...register('status')} className="form-select">
              <option value="active">Hoạt động</option>
              <option value="inactive">Không hoạt động</option>
              <option value="suspended">Đình chỉ</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="form-label">Email <span className="text-gray-400 text-xs">(nhận OTP quên mật khẩu)</span></label>
            <input {...register('email')} type="email" className="form-input" placeholder="example@gmail.com" />
          </div>

          {/* ── Thông tin nhân viên ── */}
          <div className="col-span-2 border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Thông tin nhân viên</p>
          </div>
          <div>
            <label className="form-label">Mã nhân viên</label>
            <input {...register('employee_id')} className="form-input" placeholder="Tự sinh nếu để trống (NT001...)" />
          </div>
          <div>
            <label className="form-label">Ngày vào làm</label>
            <input {...register('join_date')} type="date" className="form-input" />
          </div>
          <div>
            <label className="form-label">Chi nhánh</label>
            <input {...register('branch')} className="form-input" placeholder="Tổng Kho Nam Thành" />
          </div>
          <div>
            <label className="form-label">Phòng ban</label>
            <input {...register('department')} className="form-input" placeholder="Kinh doanh" />
          </div>
          <div className="col-span-2">
            <label className="form-label">Chức danh</label>
            <input {...register('position')} className="form-input" placeholder="Nhân viên kế toán" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={handleDelete}
        loading={delLoading} danger title="Xóa tài khoản"
        message={`Xóa tài khoản "${delTarget?.name}"? Tài khoản sẽ không thể đăng nhập.`} />
    </div>
  );
}

/* ══════════════════════════
 *  TAB: Tài xế (Drivers)
 * ══════════════════════════ */
function DriversTab({ canEdit = true, canAdd = true }: { canEdit?: boolean; canAdd?: boolean }) {
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [delTarget, setDelTarget] = useState<Driver | null>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Driver | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [assignVehicle, setAssignVehicle] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [viewDriver, setViewDriver] = useState<any | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const { data, loading, refetch } = useApi<any>('/drivers', {
    page, limit: 15, search, status: statusFilter,
  });

  const drivers: Driver[]  = data?.drivers ?? [];
  const pagination         = data?.pagination;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<any>();

  const openAdd = () => { setEditing(null); setShowPwd(false); reset({ status: 'active', position: 'Tài xế', department: 'Vận chuyển' }); setShowForm(true); };

  const openView = async (id: string) => {
    setViewLoading(true);
    setViewDriver(null);
    try {
      const res = await api.get(`/drivers/${id}`);
      setViewDriver(res.data.data);
    } catch (_) {}
    finally { setViewLoading(false); }
  };  const openEdit = (d: Driver) => {
    setEditing(d);
    setShowPwd(false);
    reset({
      full_name: d.full_name, phone: d.phone,
      email: (d as any).user_id?.email ?? (d as any).email ?? '',
      password: '', employee_id: d.employee_id,
      department: d.department, position: d.position,
      join_date: d.join_date ? d.join_date.slice(0, 10) : '',
      status: d.status, address: '',
    });
    setShowForm(true);
  };

  const onSubmit = async (data: any) => {
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

  const openAssign = useCallback(async (d: Driver) => {
    setAssignTarget(d);
    setAssignVehicle(d.vehicle_id?._id ?? '');
    const res = await api.get('/vehicles', { params: { status: 'active', limit: 100 } });
    setVehicles(res.data.data?.vehicles ?? []);
  }, []);

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

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setSearch(searchInput); setPage(1); };

  return (
    <div className="space-y-4">
      {/* Toolbar + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="form-input pl-9" placeholder="Tìm theo tên, SĐT, mã NV..."
              value={searchInput} onChange={e => setSearchInput(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary px-4">Tìm</button>
        </form>
        <select className="form-select w-full sm:w-40" value={statusFilter}
          onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tất cả trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="inactive">Không HĐ</option>
          <option value="on_leave">Nghỉ phép</option>
          <option value="suspended">Đình chỉ</option>
        </select>
        {canAdd && (
          <button onClick={openAdd} className="btn-primary gap-2 whitespace-nowrap">
            <PlusIcon className="w-4 h-4" /> Thêm tài xế
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Tài xế</th><th>Mã NV</th><th>Xe được gán</th>
                <th>Ngày vào</th><th>Trạng thái</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={6} className="text-center py-10 text-gray-400">Đang tải...</td></tr>}
              {!loading && drivers.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <span className="text-4xl">👤</span><p className="text-sm">Chưa có tài xế nào</p>
                  </div>
                </td></tr>
              )}
              {drivers.map(d => (
                <tr key={d._id}>
                  <td>
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => openView(d._id)}>
                      {(() => {
                        const avatarUrl = getImageUrl(d.user_id?.avatar);
                        return avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={d.full_name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            onError={e => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style');
                            }}
                          />
                        ) : null;
                      })()}
                      <div className={`w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${d.user_id?.avatar ? 'hidden' : ''}`}>
                        {d.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{d.full_name}</p>
                        {d.vehicle_id && (
                          <p className="text-xs font-bold text-primary mt-0.5">{d.vehicle_id.license_plate}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="text-sm text-gray-600">{d.employee_id ?? '—'}</td>
                  <td>
                    {d.vehicle_id
                      ? <span className="badge badge-info">{d.vehicle_id.license_plate}</span>
                      : <span className="text-gray-400 text-xs">Chưa gán</span>}
                  </td>
                  <td className="text-sm text-gray-600">
                    {d.join_date ? format(parseISO(d.join_date), 'dd/MM/yyyy', { locale: vi }) : '—'}
                  </td>
                  <td><StatusBadge status={d.status} /></td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      {/* Gán xe — coordinator và accountant cũng được phép */}
                      <button onClick={() => openAssign(d)} title="Gán xe"
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                        <TruckIcon className="w-4 h-4" />
                      </button>
                      {canEdit && (<>
                        <button onClick={() => openEdit(d)} title="Sửa"
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-yellow-50 hover:text-yellow-600 transition-colors">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDelTarget(d)} title="Xóa"
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} limit={15} onPageChange={setPage} />}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)}
        title={editing ? 'Cập nhật tài xế' : 'Thêm tài xế mới'} size="lg"
        footer={<>
          <button onClick={() => setShowForm(false)} className="btn-outline text-sm px-4 py-2">Hủy</button>
          <button onClick={handleSubmit(onSubmit)} disabled={saving} className="btn-primary text-sm px-5 py-2">
            {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm tài xế'}
          </button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">Họ tên *</label>
            <input {...register('full_name', { required: 'Bắt buộc' })} className="form-input" placeholder="Nguyễn Văn A" />
            {errors.full_name && <p className="form-error">{errors.full_name.message as string}</p>}
          </div>
          <div>
            <label className="form-label">Số điện thoại *</label>
            <input {...register('phone', { required: 'Bắt buộc' })} className="form-input" placeholder="0901234567" />
            {errors.phone && <p className="form-error">{errors.phone.message as string}</p>}
          </div>
          <div>
            <label className="form-label">{editing ? 'Mật khẩu mới' : 'Mật khẩu *'}</label>
            <div className="relative">
              <input {...register('password', { required: !editing ? 'Bắt buộc' : false })}
                type={showPwd ? 'text' : 'password'} autoComplete="new-password" className="form-input pr-10"
                placeholder={editing ? 'Để trống nếu không đổi' : 'Tối thiểu 6 ký tự'} />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPwd ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="form-error">{errors.password.message as string}</p>}
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
            <label className="form-label">Email <span className="text-gray-400 text-xs font-normal">(dùng để nhận OTP quên mật khẩu)</span></label>
            <input {...register('email')} type="email" className="form-input" placeholder="example@gmail.com" />
          </div>
        </div>
      </Modal>

      {/* Assign vehicle */}
      <Modal open={!!assignTarget} onClose={() => setAssignTarget(null)}
        title={`Gán xe cho ${assignTarget?.full_name ?? ''}`} size="sm"
        footer={<>
          <button onClick={() => setAssignTarget(null)} className="btn-outline text-sm px-4 py-2">Hủy</button>
          <button onClick={handleAssign} disabled={!assignVehicle || assignLoading} className="btn-primary text-sm px-4 py-2">
            {assignLoading ? 'Đang gán...' : 'Gán xe'}
          </button>
        </>}>
        <div>
          <label className="form-label">Chọn xe</label>
          <select className="form-select" value={assignVehicle} onChange={e => setAssignVehicle(e.target.value)}>
            <option value="">-- Chọn xe --</option>
            {vehicles.map(v => (
              <option key={v._id} value={v._id}>
                {v.license_plate} — {v.brand} {v.model}{v.assigned_driver ? ' (Đã có tài xế)' : ''}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={handleDelete}
        title="Xóa tài xế" message={`Bạn có chắc muốn xóa tài xế "${delTarget?.full_name}"?`}
        confirmLabel="Xóa" danger loading={delLoading} />

      {/* Modal xem thông tin tài xế */}
      <Modal open={!!viewDriver || viewLoading} onClose={() => setViewDriver(null)}
        title="Thông tin tài xế" size="md"
        footer={<button onClick={() => setViewDriver(null)} className="btn-primary text-sm px-5 py-2">Đóng</button>}>
        {viewLoading ? (
          <div className="py-10 text-center text-gray-400 text-sm">Đang tải...</div>
        ) : viewDriver ? (
          <div className="space-y-0">
            {/* Avatar + tên */}
            <div className="flex items-center gap-4 mb-5 p-4 bg-gray-50 rounded-xl">
              {(() => {
                const url = getImageUrl(viewDriver.user_id?.avatar);
                return url ? (
                  <img src={url} alt={viewDriver.full_name}
                    className="w-16 h-16 rounded-full object-cover border-2 border-white shadow" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold shadow">
                    {viewDriver.full_name?.charAt(0).toUpperCase()}
                  </div>
                );
              })()}
              <div>
                <p className="text-lg font-bold text-gray-900">{viewDriver.full_name}</p>
                <p className="text-sm text-gray-500">{viewDriver.phone}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${
                  viewDriver.status === 'active' ? 'bg-green-100 text-green-700' :
                  viewDriver.status === 'inactive' ? 'bg-gray-100 text-gray-600' :
                  viewDriver.status === 'on_leave' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-600'
                }`}>
                  {viewDriver.status === 'active' ? 'Hoạt động' :
                   viewDriver.status === 'inactive' ? 'Không HĐ' :
                   viewDriver.status === 'on_leave' ? 'Nghỉ phép' : 'Đình chỉ'}
                </span>
              </div>
            </div>

            {/* Thông tin chi tiết */}
            {[
              { label: 'Mã nhân viên', value: viewDriver.employee_id ?? '—' },
              { label: 'Xe được gán',  value: viewDriver.vehicle_id?.license_plate ?? 'Chưa gán' },
              { label: 'Ngày vào làm', value: viewDriver.join_date ? new Date(viewDriver.join_date).toLocaleDateString('vi-VN') : '—' },
              { label: 'Email',        value: viewDriver.user_id?.email ?? viewDriver.email ?? '—' },
              { label: 'Ngân hàng',    value: viewDriver.bank_name ? `${viewDriver.bank_name} — ${viewDriver.bank_account ?? ''}` : '—' },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-start py-2.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-500">{row.label}</span>
                <span className="text-sm font-semibold text-gray-900 text-right max-w-[60%]">{row.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ══════════════════════════
 *  MAIN PAGE
 * ══════════════════════════ */
const TABS = [
  { key: 'staff',   label: '👔 Nhân viên', roles: ['coordinator', 'manager'] },
  { key: 'drivers', label: '🚛 Tài xế',    roles: ['coordinator', 'accountant', 'manager'] },
];

export default function AccountsPage() {
  const { user } = useAuthStore();
  // Nếu user không phải manager → chỉ thấy tab Tài xế, mặc định active tab đó
  const defaultTab = (user?.role === 'manager' || user?.role === 'coordinator') ? 'staff' : 'drivers';
  const [activeTab, setActiveTab] = useState(defaultTab);

  const visibleTabs = TABS.filter(t => t.roles.includes(user?.role ?? ''));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Nhân sự</h1>
        <p className="text-sm text-gray-500 mt-0.5">Quản lý tài khoản nhân viên và tài xế</p>
      </div>

      {/* Tab bar */}
      {visibleTabs.length > 1 && (
        <div className="flex gap-1 border-b border-gray-200">
          {visibleTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'staff'   && <StaffTab canEdit={user?.role === 'manager' || user?.role === 'coordinator'} isCoordinator={user?.role === 'coordinator'} />}
      {activeTab === 'drivers' && <DriversTab canEdit={user?.role === 'manager' || user?.role === 'coordinator'} canAdd={user?.role === 'manager' || user?.role === 'coordinator'} />}
    </div>
  );
}
