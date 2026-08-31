import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(url: string, params?: Record<string, any>): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(url, { params })
      .then(res => { if (!cancelled) setData(res.data.data); })
      .catch(err => { if (!cancelled) setError(err.response?.data?.message ?? 'Lỗi kết nối'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, JSON.stringify(params), tick]);

  return { data, loading, error, refetch };
}
