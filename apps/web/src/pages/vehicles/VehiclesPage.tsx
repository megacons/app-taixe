import { useState } from 'react';
import { PlusIcon, MagnifyingGlassIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import Pagination from '@/components/ui/Pagination';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface Vehicle {
  _id: string;
  license_plate: string;
  vehicle_type: string;
  brand: string;
  model: string;
  year: number;
  capacity: number;
  status: string;
  assigned_driver: { _id: string; full_name: string; phone: string } | null;
  insurance_expiry: string;
  next_maintenance: string;
}

export default function VehiclesPage() {
  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<Vehicle | null>(null);
  const [delTarget, setDelTarget] = useState<Vehicle | null>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [saving, setSaving]       = useState(false);

  const { data, loading, refetch } = useApi<any>('/vehicles', { page, limit: 15, search, status: statusFilter });
  const vehicles: Vehicle[] = data?.vehicles ?? [];
  const pagination          = data?.pagination;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<any>();

  const openAdd = () => {
    setEditing(null);
    reset({ status: 'active', vehicle_type: 'dump_truck' });
    setShowForm(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditing(v);
    reset({
      license_plate:    v.license_plate,
      vehicle_type:     v.vehicle_type,
      brand:            v.brand,
      model:            v.model,
      year:             v.year,
      capacity:         v.capacity,
      status:           v.status,
      insurance_expiry: v.insurance_expiry?.slice(0, 10),
      next_maintenance: v.next_maintenance?.slice(0, 10),
    });
    setShowForm(true);
  };

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/vehicles/${editing._id}`, data);
        toast.success('Cập nhật xe thành công');
      } else {
        await api.post('/vehicles', data);
        toast.success('Thêm xe thành công');
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
      await api.delete(`/vehicles/${delTarget._id}`);
      toast.success('Đã xóa xe');
      setDelTarget(null);
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Xóa thất bại');
    } finally {
      setDelLoading(false);
    }
  };

  const TYPE_LABEL: Record<string, string> = {
    dump_truck: 'Xe ben', truck: 'Xe tải', trailer: 'Xe đầu kéo', pickup: 'Xe bán tải', other: 'Khác',
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Quản lý xe</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pagination?.total ?? 0} xe trong hệ thống</p>
        </div>
        <button onClick={openAdd} className="btn-primary gap-2 self-start sm:self-auto">
          <PlusIcon className="w-4 h-4" />Thêm xe
        </button>
      </div>

      <div className="card mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <form
            className="flex gap-2 flex-1"
            onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); }}
          >
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="form-input pl-9" placeholder="Tìm biển số, hãng xe..."
                value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary px-4">Tìm</button>
          </form>
          <select className="form-select w-full sm:w-40" value={statusFilter}
            onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="maintenance">Bảo dưỡng</option>
            <option value="inactive">Không HĐ</option>
          </select>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Biển số</th>
                <th>Tài xế</th>
                <th>Trạng thái</th>
                <th className="text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={4} className="text-center py-10 text-gray-400">Đang tải...</td></tr>}
              {!loading && vehicles.length === 0 && (
                <tr><td colSpan={4} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <span className="text-4xl">🚛</span>
                    <p className="text-sm">Chưa có xe nào</p>
                  </div>
                </td></tr>
              )}
              {vehicles.map(v => (
                <tr key={v._id}>
                  <td>
                    <span className="font-bold text-primary text-sm">{v.license_plate}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{v.brand}</p>
                  </td>
                  <td>
                    {v.assigned_driver ? (
                      <p className="text-sm font-medium text-gray-900">{v.assigned_driver.full_name}</p>
                    ) : (
                      <span className="text-gray-400 text-xs">Chưa gán</span>
                    )}
                  </td>
                  <td><StatusBadge status={v.status} /></td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(v)} title="Sửa"
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-yellow-50 hover:text-yellow-600">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDelTarget(v)} title="Xóa"
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600">
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
          <Pagination page={page} totalPages={pagination.totalPages}
            total={pagination.total} limit={15} onPageChange={setPage} />
        )}
      </div>

      {/* Form modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)}
        title={editing ? 'Cập nhật xe' : 'Thêm xe mới'} size="lg"
        footer={
          <>
            <button onClick={() => setShowForm(false)} className="btn-outline text-sm px-4 py-2">Hủy</button>
            <button onClick={handleSubmit(onSubmit)} disabled={saving} className="btn-primary text-sm px-5 py-2">
              {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm xe'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">Biển số *</label>
            <input {...register('license_plate', { required: 'Bắt buộc' })}
              className="form-input" placeholder="51C-12345" />
            {errors.license_plate && <p className="form-error">{errors.license_plate.message as string}</p>}
          </div>
          <div className="col-span-2">
            <label className="form-label">Hãng xe</label>
            <input {...register('brand')} className="form-input" placeholder="Hino, Hyundai..." />
          </div>
          <div className="col-span-2">
            <label className="form-label">Trạng thái</label>
            <select {...register('status')} className="form-select">
              <option value="active">Hoạt động</option>
              <option value="maintenance">Bảo dưỡng</option>
              <option value="inactive">Không hoạt động</option>
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={handleDelete}
        title="Xóa xe" danger loading={delLoading}
        message={`Xóa xe "${delTarget?.license_plate}"? Thao tác này không thể hoàn tác.`}
        confirmLabel="Xóa" />
    </div>
  );
}
