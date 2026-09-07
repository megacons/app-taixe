import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';

let _count = 0;
const listeners = new Set<(n: number) => void>();

function notify(n: number) {
  _count = n;
  listeners.forEach(fn => fn(n));
}

async function fetchCount() {
  try {
    const res = await api.get('/requests', { params: { status: 'pending', limit: 1 } });
    notify(res.data.data?.pagination?.total ?? 0);
  } catch { /* silent */ }
}

const TYPE_LABEL: Record<string, string> = {
  salary_advance:        'Tạm ứng lương',
  expense:               'Chi phí',
  leave:                 'Nghỉ phép',
  purchase:              'Mua hàng',
  additional_trip:       'Thêm chuyến',
  attendance_adjustment: 'Đổi giờ công',
  reward:                'Khen thưởng',
  discipline:            'Kỷ luật',
};

/** Hook dùng trong bất kỳ component nào để lấy số pending realtime */
export function usePendingRequests() {
  const [count, setCount] = useState(_count);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    // Sync count hiện tại
    setCount(_count);
    listeners.add(setCount);

    // Fetch ngay lần đầu
    fetchCount();

    // Lazy init socket — chỉ khi hook được mount (user đã đăng nhập)
    let socket: any = null;
    try {
      import('socket.io-client').then(({ io }) => {
        const SOCKET_URL = (import.meta as any).env?.VITE_API_URL || '/';
        socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
        socketRef.current = socket;
        socket.emit('join:admin');

        socket.on('new:request', (data: any) => {
          fetchCount();
        });

        socket.on('request:approved', () => fetchCount());
        socket.on('request:rejected', () => fetchCount());
      }).catch(() => {/* socket optional */});
    } catch { /* socket optional */ }

    return () => {
      listeners.delete(setCount);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const refresh = useCallback(() => fetchCount(), []);

  return { count, refresh };
}
