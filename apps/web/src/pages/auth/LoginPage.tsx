import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { TruckIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { useConfigStore } from '@/stores/configStore';
import toast from 'react-hot-toast';

interface LoginForm {
  phone: string;
  password: string;
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading } = useAuthStore();
  const { companyName, companySubtitle, logoUrl, fetchConfigs } = useConfigStore();
  const navigate = useNavigate();

  // Fetch config khi vào trang login (không cần auth)
  useState(() => { fetchConfigs(); });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    try {
      await login(data.phone, data.password);
      // Block driver / employee — chỉ dùng mobile
      const { user } = useAuthStore.getState();
      if (user?.role === 'driver' || user?.role === 'employee') {
        await useAuthStore.getState().logout();
        toast.error('Tài khoản này chỉ đăng nhập được trên Mobile App');
        return;
      }
      toast.success('Đăng nhập thành công!');
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Sai thông tin đăng nhập';
      toast.error(msg);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-primary px-8 py-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-accent rounded-2xl mb-4 overflow-hidden">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="w-full h-full object-contain" />
          ) : (
            <TruckIcon className="w-9 h-9 text-gray-900" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-white">{companyName}</h1>
        <p className="text-primary-200 text-sm mt-1">{companySubtitle}</p>
      </div>

      {/* Form */}
      <div className="px-8 py-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">Đăng nhập</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="form-label">Số điện thoại</label>
            <input
              {...register('phone', {
                required: 'Vui lòng nhập số điện thoại',
                pattern: {
                  value: /^[0-9]{9,11}$/,
                  message: 'Số điện thoại không hợp lệ',
                },
              })}
              type="tel"
              className="form-input"
              placeholder="Nhập số điện thoại"
              autoComplete="username"
            />
            {errors.phone && <p className="form-error">{errors.phone.message}</p>}
          </div>

          <div>
            <label className="form-label">Mật khẩu</label>
            <div className="relative">
              <input
                {...register('password', {
                  required: 'Vui lòng nhập mật khẩu',
                  minLength: { value: 6, message: 'Mật khẩu tối thiểu 6 ký tự' },
                })}
                type={showPassword ? 'text' : 'password'}
                className="form-input pr-10"
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <EyeSlashIcon className="w-4 h-4" />
                ) : (
                  <EyeIcon className="w-4 h-4" />
                )}
              </button>
            </div>
            {errors.password && <p className="form-error">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full py-3 text-base font-semibold mt-2"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Đang đăng nhập...
              </span>
            ) : (
              'Đăng nhập'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2024 Nam Thành Transport. All rights reserved.
        </p>
      </div>
    </div>
  );
}
