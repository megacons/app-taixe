import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '@/lib/api';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

const GOOGLE_MAPS_API_KEY = 'AIzaSyB-qQR9kJXefBNKb9Y7qa3vphWCpLGP9HA';

interface DriverLocation {
  driver_id: string;
  driver_name: string;
  license_plate: string;
  latitude: number;
  longitude: number;
  speed: number;
  recorded_at: string;
}

export default function GPSTrackingPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const socketRef = useRef<Socket | null>(null);

  const [drivers, setDrivers] = useState<DriverLocation[]>([]);
  const [selected, setSelected] = useState<DriverLocation | null>(null);
  const [connected, setConnected] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  /* ── Load Google Maps ── */
  useEffect(() => {
    if ((window as any).google?.maps) {
      initMap();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initGPSMap`;
    script.async = true;
    script.defer = true;

    (window as any).initGPSMap = () => {
      initMap();
      setMapLoaded(true);
    };

    document.head.appendChild(script);
    return () => {
      delete (window as any).initGPSMap;
    };
  }, []);

  /* ── Init map ── */
  const initMap = () => {
    if (!mapRef.current) return;
    mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
      zoom: 12,
      center: { lat: 10.7769, lng: 106.7009 }, // HCM
      mapTypeId: 'roadmap',
      mapTypeControl: false,
      streetViewControl: false,
    });
    setMapLoaded(true);
  };

  /* ── Socket.io realtime ── */
  useEffect(() => {
    const SOCKET_URL = import.meta.env.VITE_API_URL || '';
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join:admin');
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('gps:update', (data: DriverLocation) => {
      setDrivers(prev => {
        const idx = prev.findIndex(d => d.driver_id === data.driver_id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = data;
          return updated;
        }
        return [...prev, data];
      });
      updateMarker(data);
    });

    return () => { socket.disconnect(); };
  }, [mapLoaded]);

  /* ── Fetch latest positions on load ── */
  useEffect(() => {
    if (!mapLoaded) return;
    api.get('/gps/latest').then(res => {
      const locs: DriverLocation[] = res.data.data?.drivers ?? [];
      setDrivers(locs);
      locs.forEach(updateMarker);
    }).catch(() => {});
  }, [mapLoaded]);

  /* ── Update/create marker ── */
  const updateMarker = (data: DriverLocation) => {
    if (!mapInstance.current || !(window as any).google?.maps) return;
    const g = (window as any).google;

    const pos = { lat: data.latitude, lng: data.longitude };

    if (markersRef.current.has(data.driver_id)) {
      const marker = markersRef.current.get(data.driver_id);
      marker.setPosition(pos);
      marker.setTitle(`${data.driver_name} — ${data.speed} km/h`);
    } else {
      const marker = new g.maps.Marker({
        position: pos,
        map: mapInstance.current,
        title: `${data.driver_name} — ${data.speed} km/h`,
        icon: {
          path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: '#163797',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        label: {
          text: data.license_plate || data.driver_name?.charAt(0) || 'X',
          color: 'white',
          fontSize: '10px',
          fontWeight: 'bold',
        },
      });

      marker.addListener('click', () => setSelected(data));
      markersRef.current.set(data.driver_id, marker);
    }
  };

  const focusDriver = (d: DriverLocation) => {
    setSelected(d);
    mapInstance.current?.panTo({ lat: d.latitude, lng: d.longitude });
    mapInstance.current?.setZoom(16);
  };

  const fmtTime = (iso: string) => {
    try { return format(new Date(iso), 'HH:mm:ss', { locale: vi }); }
    catch { return '—'; }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">GPS Tracking</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Theo dõi vị trí tài xế realtime
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-400'}`} />
          <span className="text-sm text-gray-500">
            {connected ? 'Đang kết nối' : 'Mất kết nối'}
          </span>
          <span className="badge badge-info ml-2">{drivers.length} tài xế</span>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar — driver list */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">
          {drivers.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-3xl mb-2">🚛</p>
              <p className="text-sm text-gray-400">Chưa có tài xế nào</p>
              <p className="text-xs text-gray-300 mt-1">Tài xế cần bật tracking trên app</p>
            </div>
          ) : (
            drivers.map(d => (
              <button
                key={d.driver_id}
                onClick={() => focusDriver(d)}
                className={`text-left p-3 rounded-xl border transition-all ${
                  selected?.driver_id === d.driver_id
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-100 bg-white hover:border-primary/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
                    {d.driver_name?.charAt(0)?.toUpperCase() ?? 'X'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{d.driver_name}</p>
                    <p className="text-xs text-primary font-bold">{d.license_plate}</p>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>🚗 {d.speed ?? 0} km/h</span>
                  <span>🕐 {fmtTime(d.recorded_at)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative rounded-xl overflow-hidden border border-gray-200 shadow-sm">
          <div ref={mapRef} className="w-full h-full" style={{ minHeight: 400 }} />

          {/* Loading overlay */}
          {!mapLoaded && (
            <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Đang tải bản đồ...</p>
              </div>
            </div>
          )}

          {/* Selected driver info */}
          {selected && (
            <div className="absolute bottom-4 left-4 right-4 bg-white rounded-xl shadow-lg p-4 border border-gray-100">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-gray-900">{selected.driver_name}</p>
                  <p className="text-sm text-primary font-semibold">{selected.license_plate}</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg"
                >✕</button>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                {[
                  { label: 'Tốc độ', value: `${selected.speed ?? 0} km/h`, icon: '🚗' },
                  { label: 'Lat', value: selected.latitude.toFixed(5), icon: '📍' },
                  { label: 'Lng', value: selected.longitude.toFixed(5), icon: '📍' },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-500">{item.label}</p>
                    <p className="text-sm font-bold text-gray-900 font-mono">{item.value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Cập nhật lúc: {fmtTime(selected.recorded_at)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
