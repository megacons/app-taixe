import { create } from 'zustand';
import axios from 'axios';
import api from '@/lib/api';

// Dùng axios thuần để gọi public endpoint (không cần auth token)
const publicApi = axios.create({ baseURL: '/api' });

interface ConfigState {
  companyName: string;
  companySubtitle: string;
  logoUrl: string | null;
  loaded: boolean;
  fetchConfigs: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  companyName:     'Nam Thành',
  companySubtitle: 'Quản lý vận chuyển',
  logoUrl:         null,
  loaded:          false,

  fetchConfigs: async () => {
    try {
      // Thử public endpoint trước (không cần auth — dùng được ở login page)
      let map: Record<string, any> = {};
      try {
        const res = await publicApi.get('/materials/configs/public');
        map = res.data.data?.map ?? {};
      } catch {
        // Fallback: dùng authenticated endpoint
        const res = await api.get('/materials/configs');
        map = res.data.data?.map ?? {};
      }
      set({
        companyName:     map.company_name     ?? 'Nam Thành',
        companySubtitle: map.company_subtitle ?? 'Quản lý vận chuyển',
        logoUrl:         map.logo_url         ?? null,
        loaded:          true,
      });
    } catch {
      set({ loaded: true });
    }
  },
}));
