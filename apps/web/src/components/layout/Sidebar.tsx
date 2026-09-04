import { NavLink, useNavigate } from 'react-router-dom';
import {
  HomeIcon,
  UsersIcon,
  TruckIcon,
  DocumentTextIcon,
  BanknotesIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ClipboardDocumentListIcon,
  ClipboardDocumentCheckIcon,
  BeakerIcon,
  CurrencyDollarIcon,
  BellIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { useConfigStore } from '@/stores/configStore';
import { usePendingRequests } from '@/hooks/usePendingRequests';
import toast from 'react-hot-toast';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  path: string;
  roles?: string[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: HomeIcon, path: '/dashboard' },
  {
    label: 'Nhân sự',
    icon: UsersIcon,
    path: '/accounts',
    roles: ['coordinator', 'accountant', 'manager'],
  },
  {
    label: 'Chấm công',
    icon: ClipboardDocumentCheckIcon,
    path: '/attendance',
    roles: ['coordinator', 'accountant', 'manager'],
  },
  { label: 'Chuyến xe', icon: ClipboardDocumentListIcon, path: '/trips' },
  { label: 'Yêu cầu', icon: DocumentTextIcon, path: '/requests' },
  {
    label: 'Quỹ tài xế',
    icon: BanknotesIcon,
    path: '/finance/fund',
    roles: ['coordinator', 'accountant', 'manager'],
  },
  {
    label: 'Lương tài xế',
    icon: CurrencyDollarIcon,
    path: '/salary',
    roles: ['coordinator', 'accountant', 'manager'],
  },
  {
    label: 'Thông báo',
    icon: BellIcon,
    path: '/notifications',
    roles: ['coordinator', 'accountant', 'manager'],
  },
  {
    label: 'Vật liệu',
    icon: BeakerIcon,
    path: '/config/materials',
    roles: ['coordinator', 'manager'],
  },
  {
    label: 'Xe',
    icon: TruckIcon,
    path: '/vehicles',
    roles: ['coordinator', 'manager'],
  },
  {
    label: 'Cài đặt',
    icon: Cog6ToothIcon,
    path: '/config/system',
    roles: ['manager'],
  },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore();
  const { companyName, companySubtitle, logoUrl } = useConfigStore();
  const { count: pendingCount } = usePendingRequests();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success('Đăng xuất thành công');
    navigate('/login');
  };

  const visibleItems = navItems.filter(
    item => !item.roles || (user && item.roles.includes(user.role))
  );

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo — nhấn về Dashboard */}
      <div
        className="flex items-center gap-3 px-4 py-5 border-b border-primary-800 cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => { navigate('/dashboard'); onClose(); }}
      >
        <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
          {logoUrl ? (
            <img src={logoUrl.startsWith('http') ? logoUrl : logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`}
              alt="logo" className="w-full h-full object-cover" />
          ) : (
            <TruckIcon className="w-5 h-5 text-gray-900" />
          )}
        </div>
        <div>
          <h1 className="font-bold text-white text-sm leading-tight">{companyName}</h1>
          <p className="text-primary-300 text-xs">{companySubtitle}</p>
        </div>
      </div>

      {/* User info — nhấn vào hồ sơ */}
      {user && (
        <div
          className="px-4 py-3 border-b border-primary-800 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => { navigate('/profile'); onClose(); }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-700 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">{user.name}</p>
              <p className="text-primary-300 text-xs capitalize">
                {user.role === 'driver'
                  ? 'Tài xế'
                  : user.role === 'coordinator'
                    ? 'Điều phối'
                    : user.role === 'accountant'
                      ? 'Kế toán'
                      : 'Quản lý'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-primary-200 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1">{item.label}</span>
            {/* Badge số yêu cầu chờ duyệt */}
            {item.path === '/requests' && pendingCount > 0 && (
              <span className="min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1.5 flex-shrink-0">
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-primary-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-primary-200 hover:bg-white/5 hover:text-white transition-colors"
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5" />
          Đăng xuất
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 flex-shrink-0 flex-col bg-primary h-full relative z-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-56 flex-col bg-primary transform transition-transform duration-200 ease-in-out lg:hidden flex ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
