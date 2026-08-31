import { useEffect, useState, useRef } from 'react';
import { CheckIcon, PencilIcon, XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useConfigStore } from '@/stores/configStore';

/* ── Tab definitions ── */
const TABS = [
  { id: 'company',  label: 'Thông tin công ty', icon: '🏢' },
  { id: 'overtime', label: 'Lương & Tăng ca',   icon: '💰' },
  { id: 'gps',      label: 'GPS',               icon: '📍' },
  { id: 'approval', label: 'Quy trình duyệt',   icon: '✅' },
  { id: 'notif',    label: 'Thông báo',          icon: '🔔' },
] as const;

type TabId = typeof TABS[number]['id'];

interface Config {
  key: string;
  value: any;
  description: string;
  data_type: string;
  category: string;
}

interface CompanyForm {
  company_name: string;
}

export default function SystemConfigPage() {
  const [activeTab, setActiveTab] = useState<TabId>('company');
  const [configs, setConfigs]     = useState<Config[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editKey, setEditKey]     = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving]       = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview]     = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { fetchConfigs: refreshGlobalConfig, logoUrl } = useConfigStore();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } =
    useForm<CompanyForm>();

  useEffect(() => { fetchConfigs(); }, []);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/materials/configs');
      const all: Config[] = res.data.data?.configs ?? [];
      setConfigs(all);

      // Populate company form
      const map = all.reduce<Record<string, any>>((acc, c) => ({ ...acc, [c.key]: c.value }), {});
      reset({
        company_name: map.company_name ?? 'Nam Thành Transport',
      });
    } catch {
      toast.error('Không thể tải cấu hình');
    } finally {
      setLoading(false);
    }
  };

  /* ── Save company info ── */
  const onSaveCompany = async (data: CompanyForm) => {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(data).map(([key, value]) =>
          api.put(`/materials/configs/${key}`, { value })
        )
      );
      toast.success('Lưu thông tin công ty thành công');
      fetchConfigs();
      refreshGlobalConfig(); // đồng bộ Sidebar + Header
    } catch {
      toast.error('Không thể lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  /* ── Upload logo ── */
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('File quá lớn, tối đa 2MB'); return; }

    // Preview ngay
    const reader = new FileReader();
    reader.onload = ev => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data.data?.url;
      if (url) {
        await api.put('/materials/configs/logo_url', { value: url });
        toast.success('Đã cập nhật logo');
        refreshGlobalConfig();
      }
    } catch {
      toast.error('Upload logo thất bại');
      setLogoPreview(null);
    } finally {
      setLogoUploading(false);
    }
  };

  /* ── Inline edit config ── */
  const startEdit = (c: Config) => {
    setEditKey(c.key);
    setEditValue(String(c.value));
  };

  const saveEdit = async (key: string) => {
    setSaving(true);
    try {
      const cfg = configs.find(c => c.key === key);
      let val: any = editValue;
      if (cfg?.data_type === 'number') val = Number(editValue);

      await api.put(`/materials/configs/${key}`, { value: val });
      toast.success('Cập nhật thành công');
      setEditKey(null);
      fetchConfigs();
    } catch {
      toast.error('Lỗi cập nhật');
    } finally {
      setSaving(false);
    }
  };

  /* ── Filter configs by category ── */
  const configsByCategory = (category: string) =>
    configs.filter(c => c.category === category);

  const formatValue = (c: Config) => {
    if (c.data_type === 'number' && c.key.includes('rate'))
      return new Intl.NumberFormat('vi-VN').format(Number(c.value)) + 'đ';
    if (c.data_type === 'number' && c.key.includes('interval'))
      return `${Number(c.value) / 1000}s`;
    return String(c.value);
  };

  return (
    <div className="space-y-0">
      {/* ── Page title ── */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">Cài đặt hệ thống</h2>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">

        {/* ── Left: Settings sidebar tabs ── */}
        <aside className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Cài đặt</h3>
            </div>
            <div className="flex flex-row md:flex-col overflow-x-auto md:overflow-visible">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium
                    border-l-4 transition-colors whitespace-nowrap md:whitespace-normal
                    ${activeTab === tab.id
                      ? 'bg-primary/8 border-primary text-primary font-semibold'
                      : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                  <span className="text-base flex-shrink-0">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Right: Content panel ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* ═══ Tab: Thông tin công ty ═══ */}
          {activeTab === 'company' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Thông tin công ty</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Cập nhật thông tin cơ bản và logo của doanh nghiệp.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Logo upload (placeholder) */}
                <div className="lg:col-span-1">
                  <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                    Logo công ty
                  </label>
                  <input ref={logoInputRef} type="file" className="hidden"
                    accept=".png,.jpg,.jpeg,.webp"
                    onChange={handleLogoUpload} />
                  <div
                    onClick={() => logoInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center bg-white hover:bg-gray-50 transition-colors cursor-pointer group">
                    <div className="w-24 h-24 mb-4 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                      {logoPreview || logoUrl ? (
                        <img
                          src={logoPreview ?? (logoUrl?.startsWith('/') ? logoUrl : `/${logoUrl}`)}
                          alt="logo"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-4xl">🚛</span>
                      )}
                    </div>
                    {logoUploading ? (
                      <span className="text-xs text-gray-400">Đang tải lên...</span>
                    ) : (
                      <>
                        <span className="text-2xl text-gray-400 group-hover:text-primary transition-colors">☁️</span>
                        <span className="text-xs font-semibold text-primary mt-2">Tải logo mới</span>
                        <span className="text-xs text-gray-400 mt-1 text-center">PNG, JPG tối đa 2MB</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Form fields */}
                <div className="lg:col-span-2 space-y-4">
                  <div>
                    <label className="form-label text-xs">Tên công ty</label>
                    <input
                      {...register('company_name', { required: 'Bắt buộc' })}
                      className="form-input"
                      placeholder="Tên công ty..."
                    />
                    {errors.company_name && (
                      <p className="form-error">{errors.company_name.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-6 flex justify-end gap-3 pt-6 border-t border-gray-100">
                <button
                  onClick={() => fetchConfigs()}
                  className="btn-outline text-sm px-5 py-2"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSubmit(onSaveCompany)}
                  disabled={saving || !isDirty}
                  className="btn-primary text-sm px-5 py-2"
                >
                  {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </div>
          )}

          {/* ═══ Tab: Lương & Tăng ca ═══ */}
          {activeTab === 'overtime' && (
            <ConfigSection
              title="Lương & Tăng ca"
              description="Cấu hình ngưỡng tăng ca và mức phụ cấp theo chuyến."
              configs={configsByCategory('salary')}
              editKey={editKey}
              editValue={editValue}
              setEditValue={setEditValue}
              onEdit={startEdit}
              onSave={saveEdit}
              onCancel={() => setEditKey(null)}
              saving={saving}
              formatValue={formatValue}
              loading={loading}
            />
          )}

          {/* ═══ Tab: GPS ═══ */}
          {activeTab === 'gps' && (
            <ConfigSection
              title="Cấu hình GPS"
              description="Thiết lập khoảng thời gian ping GPS và cài đặt theo dõi."
              configs={configsByCategory('gps')}
              editKey={editKey}
              editValue={editValue}
              setEditValue={setEditValue}
              onEdit={startEdit}
              onSave={saveEdit}
              onCancel={() => setEditKey(null)}
              saving={saving}
              formatValue={formatValue}
              loading={loading}
            />
          )}

          {/* ═══ Tab: Quy trình duyệt ═══ */}
          {activeTab === 'approval' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Quy trình duyệt</h3>
              <p className="text-sm text-gray-500 mb-6">
                Phân quyền phê duyệt các loại yêu cầu theo vai trò.
              </p>
              <ApprovalMatrix />
            </div>
          )}

          {/* ═══ Tab: Thông báo ═══ */}
          {activeTab === 'notif' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Thông báo</h3>
              <p className="text-sm text-gray-500 mb-6">
                Cấu hình Firebase FCM và kênh gửi thông báo.
              </p>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                <InformationCircleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Cấu hình Firebase FCM</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Để bật push notification cho mobile app, cần cấu hình
                    <code className="bg-amber-100 px-1 rounded font-mono mx-1">FIREBASE_PROJECT_ID</code>,
                    <code className="bg-amber-100 px-1 rounded font-mono mx-1">FIREBASE_PRIVATE_KEY</code> và
                    <code className="bg-amber-100 px-1 rounded font-mono mx-1">FIREBASE_CLIENT_EMAIL</code> trong
                    file <code className="bg-amber-100 px-1 rounded font-mono">apps/api/.env</code>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Info note ── */}
        </div>
      </div>
    </div>
  );
}

/* ─── ConfigSection: inline edit rows ─── */
function ConfigSection({
  title, description, configs, editKey, editValue, setEditValue,
  onEdit, onSave, onCancel, saving, formatValue, loading,
}: {
  title: string;
  description: string;
  configs: Config[];
  editKey: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onEdit: (c: Config) => void;
  onSave: (key: string) => void;
  onCancel: () => void;
  saving: boolean;
  formatValue: (c: Config) => string;
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-6">{description}</p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-gray-50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-400">Chưa có cấu hình. Chạy seed để tạo dữ liệu mặc định.</p>
          <pre className="text-xs text-gray-400 mt-2 bg-gray-50 rounded-lg p-3 inline-block">
            cd apps/api && npm run seed
          </pre>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {configs.map(cfg => (
            <div key={cfg.key}
              className="flex items-center justify-between py-4 gap-4 group">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{cfg.description}</p>
              </div>

              {editKey === cfg.key ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input
                    type={cfg.data_type === 'number' ? 'number' : 'text'}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="form-input h-8 text-sm w-36 py-0"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') onSave(cfg.key);
                      if (e.key === 'Escape') onCancel();
                    }}
                  />
                  <button
                    onClick={() => onSave(cfg.key)}
                    disabled={saving}
                    className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100"
                  >
                    <CheckIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onCancel}
                    className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-semibold text-sm text-primary bg-primary/8 px-3 py-1 rounded-lg">
                    {formatValue(cfg)}
                  </span>
                  <button
                    onClick={() => onEdit(cfg)}
                    className="p-1.5 rounded-lg text-gray-300 hover:bg-yellow-50 hover:text-yellow-600 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── ApprovalMatrix ─── */
const APPROVAL_RULES = [
  { type: 'Tạm ứng lương', financial: true,  operational: false },
  { type: 'Thanh toán chi phí', financial: true,  operational: false },
  { type: 'Mua hàng',      financial: true,  operational: false },
  { type: 'Nghỉ phép',     financial: false, operational: true  },
  { type: 'Đổi giờ',       financial: false, operational: true  },
  { type: 'Thêm chuyến',   financial: false, operational: true  },
  { type: 'Khen thưởng',   financial: true,  operational: true  },
  { type: 'Kỷ luật',       financial: true,  operational: true  },
];

function ApprovalMatrix() {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Loại yêu cầu
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Điều phối
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Kế toán
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Quản lý
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {APPROVAL_RULES.map(rule => (
            <tr key={rule.type} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{rule.type}</td>
              <td className="px-4 py-3 text-center">
                {rule.operational ? (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs">✓</span>
                ) : (
                  <span className="text-gray-200">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                {rule.financial ? (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs">✓</span>
                ) : (
                  <span className="text-gray-200">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs">✓</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
