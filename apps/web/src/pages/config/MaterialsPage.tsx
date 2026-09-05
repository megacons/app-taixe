import { useState } from 'react';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface Material { _id: string; material_name: string; code: string; description: string; unit: string; status: string; category: string; }

export default function MaterialsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<Material | null>(null);
  const [delTarget, setDelTarget] = useState<Material | null>(null);
  const [saving, setSaving]     = useState(false);
  const [delLoading, setDelLoading] = useState(false);

  const { data, loading, refetch } = useApi<any>('/materials', { limit: 200 });
  const materials: Material[] = data?.materials ?? [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<any>();

  const openAdd = () => {
    setEditing(null);
    reset({ status: 'active', unit: 'chuyến', category: 'Đá xây dựng' });
    setShowForm(true);
  };

  const openEdit = (m: Material) => {
    setEditing(m);
    reset({ material_name: m.material_name, code: m.code, description: m.description, unit: m.unit, status: m.status, category: m.category });
    setShowForm(true);
  };

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/materials/${editing._id}`, data);
        toast.success('Cập nhật thành công');
      } else {
        await api.post('/materials', data);
        toast.success('Thêm vật liệu thành công');
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
      await api.delete(`/materials/${delTarget._id}`);
      toast.success('Đã xóa vật liệu');
      setDelTarget(null);
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Xóa thất bại');
    } finally {
      setDelLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Danh mục vật liệu</h1>
          <p className="text-sm text-gray-500 mt-0.5">{materials.length} loại vật liệu</p>
        </div>
        <button onClick={openAdd} className="btn-primary gap-2">
          <PlusIcon className="w-4 h-4" />Thêm vật liệu
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-container">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Tên vật liệu</th>
                <th>Mã</th>
                <th>Danh mục</th>
                <th>Trạng thái</th>
                <th className="text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Đang tải...</td></tr>}
              {!loading && materials.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <span className="text-4xl">🪨</span>
                    <p className="text-sm">Chưa có vật liệu nào</p>
                    <button onClick={openAdd} className="btn-primary text-xs px-3 py-1.5 mt-1">Thêm ngay</button>
                  </div>
                </td></tr>
              )}
              {materials.map(m => (
                <tr key={m._id}>
                  <td>
                    <p className="font-semibold text-sm text-gray-900">{m.material_name}</p>
                  </td>
                  <td className="text-sm text-gray-500 font-mono">{m.code || '—'}</td>
                  <td className="text-sm text-gray-600">{m.category || '—'}</td>
                  <td><StatusBadge status={m.status} /></td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg text-gray-400 hover:bg-yellow-50 hover:text-yellow-600"><PencilIcon className="w-4 h-4" /></button>
                      <button onClick={() => setDelTarget(m)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)}
        title={editing ? 'Cập nhật vật liệu' : 'Thêm vật liệu mới'} size="md"
        footer={
          <>
            <button onClick={() => setShowForm(false)} className="btn-outline text-sm px-4 py-2">Hủy</button>
            <button onClick={handleSubmit(onSubmit)} disabled={saving} className="btn-primary text-sm px-5 py-2">
              {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">Tên vật liệu *</label>
            <input {...register('material_name', { required: 'Bắt buộc' })} className="form-input" placeholder="VD: Đá 1x2" />
            {errors.material_name && <p className="form-error">{errors.material_name.message as string}</p>}
          </div>
          <div>
            <label className="form-label">Danh mục</label>
            <input {...register('category')} className="form-input" placeholder="Đá xây dựng" />
          </div>
          <div>
            <label className="form-label">Trạng thái</label>
            <select {...register('status')} className="form-select">
              <option value="active">Hoạt động</option>
              <option value="inactive">Không dùng</option>
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={handleDelete}
        title="Xóa vật liệu" danger loading={delLoading}
        message={`Xóa vật liệu "${delTarget?.material_name}"?`} confirmLabel="Xóa" />
    </div>
  );
}
