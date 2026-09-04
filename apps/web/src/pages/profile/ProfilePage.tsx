import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { EyeIcon, EyeSlashIcon, BellIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';

const ROLE_LABEL: Record<string, string> = {
  manager: 'Quản lý', coordinator: 'Điều phối',
  accountant: 'Kế toán', employee: 'Nhân viên', driver: 'Tài xế',
};

const TYPE_ICON: Record<string, string> = {
  announcement: '📢', system: '🔔', payment: '💰',
  trip_reminder: '🚛', discipline: '⚠️', holiday: '🎉',
  request_approved: '✅', request_rejected: '❌',
};

const getImageUrl = (url: string | null | undefined) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<'profile' | 'notifications'>(
    searchParams.get('tab') === 'notifications' ? 'notifications' : 'profile'
  );
  const [saving, setSaving] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<any | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  const { register: regProfile, handleSubmit: submitProfile, reset, formState: { errors: errProfile } } = useForm<any>();
  const { register: regPwd, handleSubmit: submitPwd, reset: resetPwd, formState: { errors: errPwd } } = useForm<any>();

  useEffect(() => {
    // Load profile
    api.get('/users/me').then(res => {
      const u = res.data.data;
      reset({ name: u.name, email: u.email ?? '' });
      if (u.avatar) setAvatarPreview(getImageUrl(u.avatar));
    }).catch(() => {});

    // Load notifications
    if (tab === 'notifications') loadNotifications();
  }, []);

  useEffect(() => {
    if (tab === 'notifications') loadNotifications();
  }, [tab]);

  const loadNotifications = async () => {
    setNotifLoading(true);
    try {
      // Admin/coordinator/accountant xem lịch sử broadcast đã gửi
      // Driver/employee xem thông báo nhận được
      const isAdmin = ['manager', 'coordinator', 'accountant'].includes(user?.role ?? '');
      if (isAdmin) {
        const res = await api.get('/notifications/broadcast/history', { params: { limit: 50 } });
        const history = res.data.data?.history ?? [];
        // Map sang format notification để hiển thị chung
        setNotifications(history.map((h: any, i: number) => ({
          _id: `hist-${i}`,
          title: h.title,
          message: h.message,
          type: h.type ?? 'announcement',
          is_read: true,
          created_at: h.created_at,
          attachment: h.attachment,
          sent_count: h.sent_count,
          sent_by: h.sent_by,
        })));
      } else {
        const res = await api.get('/notifications', { params: { limit: 50 } });
        setNotifications(res.data.data?.notifications ?? []);
      }
    } catch (_) {}
    finally { setNotifLoading(false); }
  };

  const markRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(ns => ns.map(n => n._id === id ? { ...n, is_read: true } : n));
    } catch (_) {}
  };

  const onSaveProfile = async (data: any) => {
    setSaving(true);
    try {
      const res = await api.put('/users/me', { name: data.name, email: data.email });
      const updated = res.data.data;
      setUser({ ...user!, name: updated.name, email: updated.email });
      toast.success('Đã cập nhật thông tin');
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Cập nhật thất bại');
    } finally { setSaving(false); }
  };

  const onChangePwd = async (data: any) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp'); return;
    }
    setSaving(true);
    try {
      await api.put('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success('Đã đổi mật khẩu');
      resetPwd();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Đổi mật khẩu thất bại');
    } finally { setSaving(false); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Ảnh quá lớn, tối đa 5MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data.data?.url;
      if (url) {
        await api.put('/users/me', { avatar: url });
        setUser({ ...user!, avatar: url });
        toast.success('Đã cập nhật ảnh đại diện');
      }
    } catch {
      toast.error('Upload ảnh thất bại');
    } finally { setAvatarUploading(false); }
  };

  const avatarUrl = avatarPreview ?? getImageUrl(user?.avatar);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Hồ sơ cá nhân</h1>
        <p className="text-sm text-gray-500 mt-0.5">Quản lý thông tin và mật khẩu của bạn</p>
      </div>

      {/* Avatar + info card */}
      <div className="card p-6 flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <input ref={avatarRef} type="file" className="hidden"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={handleAvatarUpload} />
          <div
            onClick={() => avatarRef.current?.click()}
            className="w-20 h-20 rounded-full overflow-hidden bg-primary flex items-center justify-center cursor-pointer ring-2 ring-primary/20 hover:ring-primary/50 transition-all relative group"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-white">{user?.name?.charAt(0).toUpperCase()}</span>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
              <span className="text-white text-xs font-semibold">
                {avatarUploading ? '...' : '📷'}
              </span>
            </div>
          </div>
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900">{user?.name}</p>
          <p className="text-sm text-gray-500">{user?.phone}</p>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary mt-1 inline-block">
            {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'profile',       label: '👤 Thông tin' },
          { key: 'notifications', label: `🔔 Thông báo${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Thông tin */}
      {tab === 'profile' && (
        <div className="space-y-5">
          {/* Thông tin cơ bản */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900 text-sm">Thông tin cơ bản</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="form-label">Họ tên</label>
                <input {...regProfile('name', { required: 'Bắt buộc' })} className="form-input" />
                {errProfile.name && <p className="form-error">{errProfile.name.message as string}</p>}
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="form-label">Số điện thoại</label>
                <input value={user?.phone ?? ''} disabled className="form-input opacity-60 cursor-not-allowed" />
                <p className="text-xs text-gray-400 mt-1">Không thể thay đổi SĐT</p>
              </div>
              <div className="col-span-2">
                <label className="form-label">Email <span className="text-gray-400 font-normal text-xs">(dùng để nhận OTP quên mật khẩu)</span></label>
                <input {...regProfile('email')} type="email" className="form-input" placeholder="example@gmail.com" />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={submitProfile(onSaveProfile)} disabled={saving}
                className="btn-primary text-sm px-5 py-2">
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>

          {/* Đổi mật khẩu */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900 text-sm">Đổi mật khẩu</h2>
            <div className="space-y-3">
              <div>
                <label className="form-label">Mật khẩu hiện tại</label>
                <div className="relative">
                  <input {...regPwd('currentPassword', { required: 'Bắt buộc' })}
                    type={showPwd ? 'text' : 'password'} className="form-input pr-10" />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                {errPwd.currentPassword && <p className="form-error">{errPwd.currentPassword.message as string}</p>}
              </div>
              <div>
                <label className="form-label">Mật khẩu mới</label>
                <div className="relative">
                  <input {...regPwd('newPassword', { required: 'Bắt buộc', minLength: { value: 6, message: 'Tối thiểu 6 ký tự' } })}
                    type={showNewPwd ? 'text' : 'password'} className="form-input pr-10" />
                  <button type="button" onClick={() => setShowNewPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showNewPwd ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                {errPwd.newPassword && <p className="form-error">{errPwd.newPassword.message as string}</p>}
              </div>
              <div>
                <label className="form-label">Xác nhận mật khẩu mới</label>
                <input {...regPwd('confirmPassword', { required: 'Bắt buộc' })}
                  type="password" className="form-input" />
                {errPwd.confirmPassword && <p className="form-error">{errPwd.confirmPassword.message as string}</p>}
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={submitPwd(onChangePwd)} disabled={saving}
                className="btn-primary text-sm px-5 py-2">
                {saving ? 'Đang lưu...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Thông báo */}
      {tab === 'notifications' && (
        <div className="card p-0 overflow-hidden">
          {notifLoading ? (
            <div className="py-12 text-center text-gray-400 text-sm">Đang tải...</div>
          ) : notifications.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
              <BellIcon className="w-12 h-12 opacity-30" />
              <p className="text-sm">Chưa có thông báo nào</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map(n => (
                <div key={n._id}
                  onClick={() => { setSelectedNotif(n); if (!n.is_read) markRead(n._id); }}
                  className={`px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors flex gap-4 ${!n.is_read ? 'bg-primary/5 border-l-4 border-primary' : ''}`}>
                  <span className="text-2xl flex-shrink-0 mt-0.5">{TYPE_ICON[n.type] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-gray-900 truncate">{n.title}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {n.sent_count && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                            ✓ {n.sent_count} người
                          </span>
                        )}
                        {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5 line-clamp-2 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: n.message }}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {n.created_at ? format(parseISO(n.created_at), 'HH:mm - dd/MM/yyyy', { locale: vi }) : '—'}
                      {n.sent_by && <span className="ml-1">· {n.sent_by}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal chi tiết thông báo */}
      {selectedNotif && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
          onClick={() => setSelectedNotif(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">{TYPE_ICON[selectedNotif.type] ?? '🔔'}</span>
                <h3 className="font-bold text-gray-900 text-base">{selectedNotif.title}</h3>
              </div>
              <button onClick={() => setSelectedNotif(null)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-gray-400">
                🕐 {selectedNotif.created_at ? format(parseISO(selectedNotif.created_at), 'HH:mm - dd/MM/yyyy (EEEE)', { locale: vi }) : '—'}
              </p>
              <div className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: selectedNotif.message }}
              />
              {selectedNotif.attachment?.url && (
                <a href={selectedNotif.attachment.url.startsWith('/') ? selectedNotif.attachment.url : `/${selectedNotif.attachment.url}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 mt-3 p-3 border border-primary/20 rounded-xl bg-primary/5 text-sm text-primary hover:bg-primary/10 transition-colors">
                  📎 {selectedNotif.attachment.original_name}
                </a>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setSelectedNotif(null)} className="btn-primary text-sm px-5 py-2">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
