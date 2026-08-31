import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { useSocket } from '@/hooks/useSocket';
import toast from 'react-hot-toast';

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  // Lắng nghe yêu cầu mới từ bất kỳ trang nào
  useSocket({
    rooms: ['join:admin'],
    events: {
      'new:request': (data: any) => {
        toast(
          (t) => (
            <span
              className="cursor-pointer"
              onClick={() => { toast.dismiss(t.id); navigate('/requests'); }}
            >
              🔔 Yêu cầu mới: <strong>{data.driver_name ?? ''}</strong> — {data.title ?? ''}
              <span className="ml-2 text-xs opacity-70 underline">Xem ngay →</span>
            </span>
          ),
          {
            duration: 6000,
            icon: '📋',
            style: { background: '#1e293b', color: '#fff', fontWeight: '600', cursor: 'pointer' },
          }
        );
      },
    },
  });

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
