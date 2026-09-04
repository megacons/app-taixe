import { Bars3Icon, BellIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { useConfigStore } from '@/stores/configStore';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user } = useAuthStore();
  const { companyName } = useConfigStore();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Fetch unread notification count
    const fetchNotifications = async () => {
      try {
        const res = await api.get('/notifications?is_read=false&limit=1');
        setUnreadCount(res.data.data?.total || 0);
      } catch (_) {
        // Silent fail
      }
    };

    if (user) fetchNotifications();
  }, [user]);

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 flex-shrink-0 relative z-0">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
      >
        <Bars3Icon className="w-5 h-5" />
      </button>

      <div className="hidden lg:block">
        <h2 className="text-sm font-semibold text-gray-700">
          {companyName} - Hệ thống quản lý vận chuyển đá
        </h2>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Notifications */}
        <button
          onClick={() => navigate('/profile?tab=notifications')}
          className="relative p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <BellIcon className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* User avatar — click để vào hồ sơ */}
        <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate('/profile')}>
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-semibold overflow-hidden">
            {user?.avatar ? (
              <img src={user.avatar.startsWith('http') ? user.avatar : user.avatar.startsWith('/') ? user.avatar : `/${user.avatar}`}
                alt="avatar" className="w-full h-full object-cover" />
            ) : (
              user?.name?.charAt(0).toUpperCase()
            )}
          </div>
          <span className="hidden sm:block text-sm font-medium text-gray-700">{user?.name}</span>
        </div>
      </div>
    </header>
  );
}
