import { useState, useEffect } from 'react';

const BASE_URL = process.env.API_URL || 'http://192.168.88.181:5000';

let cachedName: string | null = null;
let cachedSubtitle: string | null = null;
let cachedLogoUrl: string | null = null;
let fetchPromise: Promise<void> | null = null; // prevent duplicate fetches
const listeners: Array<() => void> = [];

const notify = () => listeners.forEach(fn => fn());

export async function fetchCompanyConfig() {
  if (fetchPromise) return fetchPromise;
  fetchPromise = (async () => {
    try {
      const url = `${BASE_URL}/api/materials/configs/public`;
      console.log('[Config] Fetching:', url);
      const res = await fetch(url);
      const json = await res.json();
      console.log('[Config] Response:', JSON.stringify(json?.data?.map));
      const map = json?.data?.map ?? {};
      cachedName     = map.company_name     ?? cachedName     ?? 'Nam Thành';
      cachedSubtitle = map.company_subtitle ?? cachedSubtitle ?? 'Hệ thống quản lý vận chuyển đá';
      if (map.logo_url && map.logo_url !== '') {
        const raw: string = map.logo_url;
        cachedLogoUrl = raw.startsWith('http') ? raw : `${BASE_URL}${raw}`;
        console.log('[Config] Logo URL:', cachedLogoUrl);
      }
      notify();
    } catch (e) {
      console.log('[Config] Fetch error:', e);
    } finally {
      fetchPromise = null;
    }
  })();
  return fetchPromise;
}

export function useCompanyConfig() {
  const [name,     setName]     = useState<string>(cachedName     ?? 'Nam Thành');
  const [subtitle, setSubtitle] = useState<string>(cachedSubtitle ?? 'Hệ thống quản lý vận chuyển đá');
  const [logoUrl,  setLogoUrl]  = useState<string | null>(cachedLogoUrl);

  useEffect(() => {
    const update = () => {
      setName(cachedName ?? 'Nam Thành');
      setSubtitle(cachedSubtitle ?? 'Hệ thống quản lý vận chuyển đá');
      setLogoUrl(cachedLogoUrl);
    };

    listeners.push(update);

    // Fetch ngay khi mount nếu chưa có data
    if (!cachedName) {
      fetchCompanyConfig();
    }

    return () => {
      const idx = listeners.indexOf(update);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return { companyName: name, companySubtitle: subtitle, logoUrl };
}
