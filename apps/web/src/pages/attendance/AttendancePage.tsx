import { useState, useCallback, useEffect } from 'react';
import {
  ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { format, parseISO, addWeeks, subWeeks, startOfWeek, endOfWeek } from 'date-fns';
import { vi } from 'date-fns/locale';
import api from '@/lib/api';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://192.168.88.181:5000';

function avatarSrc(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

function Avatar({ name, url, size = 8 }: { name: string; url?: string | null; size?: number }) {
  const src = avatarSrc(url);
  const [err, setErr] = useState(false);
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0`;
  if (src && !err) {
    return <img src={src} alt={name} className={`${cls} object-cover`} onError={() => setErr(true)} />;
  }
  return (
    <div className={`${cls} bg-primary/10 text-primary flex items-center justify-center text-xs font-bold`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

const getWeekRange = (base: Date) => {
  const mon = startOfWeek(base, { weekStartsOn: 1 });
  const sun = endOfWeek(base, { weekStartsOn: 1 });
  return { from: toDateStr(mon), to: toDateStr(sun), mon, sun };
};

const fmtTime = (iso?: string | null) => {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false,
  });
};

type AttStatus = 'none' | 'checked_in' | 'checked_out' | 'missing_in' | 'missing_out';

function getStatus(rec: any, dateStr: string): AttStatus {
  if (!rec) return 'none';
  const sessions: any[] = rec.sessions?.length > 0 ? rec.sessions : [];
  const hasIn  = sessions.some((s: any) => s.check_in_time)  || !!rec.check_in_time;
  const hasOut = sessions.some((s: any) => s.check_out_time) || !!rec.check_out_time;
  const today = toDateStr(new Date());
  if (dateStr < today) {
    if (!hasIn && !hasOut) return 'missing_in';
    if (hasIn && !hasOut)  return 'missing_out';
  }
  if (hasIn && hasOut)  return 'checked_out';
  if (hasIn && !hasOut) return 'checked_in';
  return 'none';
}

const STATUS_STYLE: Record<AttStatus, { bg: string; border: string; label: string }> = {
  checked_out: { bg: 'bg-green-50',  border: 'border-green-200',  label: '' },
  checked_in:  { bg: 'bg-yellow-50', border: 'border-yellow-200', label: '' },
  missing_out: { bg: 'bg-red-50',    border: 'border-red-200',    label: 'Thiếu ra' },
  missing_in:  { bg: 'bg-gray-100',  border: 'border-gray-200',   label: 'Chưa chấm' },
  none:        { bg: 'bg-white',     border: 'border-gray-100',   label: '' },
};

/* ── Popup chi tiết ô chấm công ── */
function AttendanceCellDetail({ rec, dateStr, sessions, onClose }: {
  rec: any; dateStr: string; sessions: any[]; onClose: () => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (lightbox) setLightbox(null); else onClose(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, lightbox]);

  const fmtDuration = (cin: any, cout: any) => {
    if (!cin || !cout) return null;
    const mins = Math.round((new Date(cout).getTime() - new Date(cin).getTime()) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
  };

  const totalMins = sessions.reduce((sum: number, s: any) => {
    if (!s.check_in_time || !s.check_out_time) return sum;
    return sum + Math.round((new Date(s.check_out_time).getTime() - new Date(s.check_in_time).getTime()) / 60000);
  }, 0);
  const totalH = Math.floor(totalMins / 60);
  const totalM = totalMins % 60;

  const displaySessions = sessions.length > 0
    ? sessions
    : [{ check_in_time: rec.check_in_time, check_out_time: rec.check_out_time, check_in_photo: rec.check_in_photo, check_in_addr: rec.check_in_addr }];

  const photoUrl = (url?: string | null) => {
    if (!url) return null;
    // Dùng relative path để đi qua Vite proxy /uploads → hoạt động cả local lẫn tunnel
    if (url.startsWith('http')) return url;
    return url.startsWith('/') ? url : `/${url}`;
  };

  return (
    <td className="p-0 border-0">
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h3 className="font-semibold text-gray-900">Chi tiết chấm công</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {format(parseISO(dateStr), 'EEEE, dd/MM/yyyy', { locale: vi })} &middot; Ca VP (08:00–17:00)
              </p>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {/* Tổng giờ làm */}
            {totalMins > 0 && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-lg">⏱</div>
                <div>
                  <p className="text-xs text-blue-500 font-medium">Tổng thời gian làm việc</p>
                  <p className="text-base font-bold text-blue-700">
                    {totalH > 0 ? `${totalH} giờ ${totalM} phút` : `${totalM} phút`}
                  </p>
                </div>
              </div>
            )}

            {/* Từng session */}
            {displaySessions.map((s: any, i: number) => (
              <div key={i} className="border border-gray-100 rounded-xl overflow-hidden">
                {displaySessions.length > 1 && (
                  <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500">
                    Ca {i + 1}
                  </div>
                )}
                <div className="p-4 space-y-3">
                  {/* Giờ vào / ra */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <p className="text-xs text-emerald-600 font-medium mb-1">🟢 Vào ca</p>
                      <p className="text-lg font-bold text-emerald-700">
                        {fmtTime(s.check_in_time) ?? '--:--'}
                      </p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-xs text-red-500 font-medium mb-1">🔴 Ra ca</p>
                      <p className="text-lg font-bold text-red-600">
                        {fmtTime(s.check_out_time) ?? '--:--'}
                      </p>
                    </div>
                  </div>

                  {/* Thời gian ca này */}
                  {s.check_in_time && s.check_out_time && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span>⏳</span>
                      <span>Thời gian: <strong className="text-gray-800">{fmtDuration(s.check_in_time, s.check_out_time)}</strong></span>
                    </div>
                  )}

                  {/* Địa điểm */}
                  {s.check_in_addr && (
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <span>📍</span>
                      <span className="flex-1">{s.check_in_addr}</span>
                    </div>
                  )}

                  {/* Hình ảnh chấm vào */}
                  {photoUrl(s.check_in_photo) && (
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-2">📷 Ảnh chấm vào</p>
                      <div className="relative group/img cursor-zoom-in"
                        onClick={() => setLightbox(photoUrl(s.check_in_photo)!)}>
                        <img
                          src={photoUrl(s.check_in_photo)!}
                          alt="Ảnh chấm vào"
                          className="w-full rounded-lg object-cover max-h-48 border border-gray-100 transition-opacity group-hover/img:opacity-80"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                          <span className="bg-black/60 text-white text-xs font-medium px-3 py-1.5 rounded-full">
                            Nhấn để xem to
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lightbox toàn màn hình */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
            onClick={() => setLightbox(null)}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightbox}
            alt="Ảnh chấm công"
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <p className="absolute bottom-4 text-white/50 text-xs">Nhấn bên ngoài hoặc ESC để đóng</p>
        </div>
      )}
    </td>
  );
}

/* ── Cell ── */
function AttendanceCell({ rec, dateStr }: { rec: any; dateStr: string }) {
  const [showDetail, setShowDetail] = useState(false);

  if (!rec) {
    const today = toDateStr(new Date());
    if (dateStr > today) {
      return <td className="px-1 py-1 border border-gray-100 bg-gray-50 min-w-[110px]" />;
    }
    return (
      <td className="px-1 py-1 border border-gray-100 bg-gray-50 min-w-[110px]">
        <div className="text-[10px] text-gray-400 text-center">—</div>
      </td>
    );
  }

  const status = getStatus(rec, dateStr);
  const st     = STATUS_STYLE[status];
  const sessions: any[] = rec.sessions?.length > 0 ? rec.sessions : [];
  const firstCin     = sessions[0]?.check_in_time  ?? rec.check_in_time;
  const lastCout     = sessions.filter((s: any) => s.check_out_time).slice(-1)[0]?.check_out_time ?? rec.check_out_time;
  const sessionCount = sessions.length;

  return (
    <>
      <td
        className={`relative px-1.5 py-1 border ${st.border} ${st.bg} min-w-[110px] max-w-[130px] group cursor-pointer`}
        onClick={() => setShowDetail(true)}
      >
        <div className="text-[10px] font-semibold text-gray-600 mb-0.5">Ca VP</div>
        <div className="flex items-center gap-1 text-[10px]">
          <span className="text-emerald-600 font-bold">{fmtTime(firstCin) ?? '--:--'}</span>
          <span className="text-gray-300">–</span>
          <span className="text-red-500 font-bold">{fmtTime(lastCout) ?? '--:--'}</span>
          {rec.check_in_photo && <span title="Có ảnh chấm vào">📷</span>}
        </div>
        {sessionCount > 1 && (
          <div className="text-[9px] text-blue-500 mt-0.5">{sessionCount} ca</div>
        )}
        {st.label && (
          <div className="text-[9px] text-red-400 mt-0.5">{st.label}</div>
        )}
        {/* Icon mắt khi hover */}
        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-sm">
          <div className="bg-white rounded-full p-1 shadow-md">
            <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
        </div>
      </td>
      {showDetail && (
        <AttendanceCellDetail
          rec={rec} dateStr={dateStr} sessions={sessions}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}

/* ── Main Page ── */
export default function AttendancePage() {
  const [weekBase,     setWeekBase]     = useState(new Date());
  const [data,         setData]         = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [searchInput,  setSearchInput]  = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [detailUser,   setDetailUser]   = useState<any>(null);
  const [detailData,   setDetailData]   = useState<any>(null);
  const [detailMonth,  setDetailMonth]  = useState('');

  const { from, to, mon, sun } = getWeekRange(weekBase);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/admin', { params: { from, to, status: statusFilter } });
      setData(res.data.data);
    } catch (_) {}
    finally { setLoading(false); }
  }, [from, to, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const prevWeek = () => setWeekBase(w => subWeeks(w, 1));
  const nextWeek = () => setWeekBase(w => addWeeks(w, 1));

  const users: any[] = (data?.users ?? []).filter((u: any) =>
    !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.employee_id ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const dates: string[] = data?.dates ?? [];
  const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  const loadDetail = async (userId: string, month: string) => {
    try {
      const res = await api.get(`/attendance/admin/user/${userId}`, { params: { month } });
      setDetailData(res.data.data);
    } catch (_) {}
  };

  const openDetail = (user: any) => {
    setDetailUser(user);
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setDetailMonth(m);
    loadDetail(user._id, m);
  };

  const weekLabel = `Tuần ${format(mon, 'w')}/${format(mon, 'yyyy')} (${format(mon, 'dd/MM')} – ${format(sun, 'dd/MM')})`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chấm công nhân viên</h1>
          <p className="text-sm text-gray-500 mt-0.5">Xem và theo dõi trạng thái chấm công theo tuần</p>
        </div>
        <button onClick={load} className="btn-outline gap-2 text-sm">
          <ArrowPathIcon className="w-4 h-4" /> Làm mới
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
          <button onClick={prevWeek} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-semibold text-gray-700 px-2 whitespace-nowrap">{weekLabel}</span>
          <button onClick={nextWeek} className="p-1 hover:bg-gray-100 rounded">
            <ChevronRightIcon className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); }} className="flex gap-2">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Tìm nhân viên..." className="form-input pl-9 w-48 text-sm" />
          </div>
          <button type="submit" className="btn-primary px-3 text-sm">Tìm</button>
        </form>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="form-select text-sm w-44">
          <option value="">Tất cả</option>
          <option value="active">Đang hoạt động</option>
        </select>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { bg: 'bg-white border border-gray-200',       label: 'Chưa đến ca' },
          { bg: 'bg-green-50 border border-green-200',   label: 'Đã ra ca' },
          { bg: 'bg-yellow-50 border border-yellow-200', label: 'Đang trong ca' },
          { bg: 'bg-red-50 border border-red-200',       label: 'Thiếu ra ca' },
          { bg: 'bg-gray-100 border border-gray-200',    label: 'Chưa chấm công' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`w-4 h-4 rounded ${l.bg}`} />
            <span className="text-gray-500">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase sticky left-0 bg-gray-50 z-10 min-w-[180px]">
                  Nhân viên
                </th>
                {dates.map((d, i) => {
                  const isToday = d === toDateStr(new Date());
                  const date    = parseISO(d);
                  return (
                    <th key={d} className={`px-2 py-2 text-center text-xs font-semibold min-w-[110px] ${
                      isToday ? 'text-primary bg-primary/5' : 'text-gray-500'
                    }`}>
                      <div>{DAY_LABELS[i] ?? format(date, 'EEE', { locale: vi })}</div>
                      <div className={`text-sm font-bold mt-0.5 ${isToday ? 'text-primary' : 'text-gray-700'}`}>
                        {format(date, 'd/M')}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 sticky left-0 bg-white">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
                        <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
                      </div>
                    </td>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-1 py-1 border border-gray-50">
                        <div className="h-10 bg-gray-50 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-400">
                    <div className="text-4xl mb-2">📋</div>
                    <p>Không có nhân viên nào</p>
                  </td>
                </tr>
              ) : users.map((u: any) => (
                <tr key={u._id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r border-gray-100">
                    <button onClick={() => openDetail(u)}
                      className="flex items-center gap-2.5 text-left w-full hover:opacity-80">
                      <Avatar name={u.name} url={u.avatar} size={8} />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{u.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {u.employee_id ? `${u.employee_id} · ` : ''}{u.department ?? u.position ?? ''}
                        </p>
                      </div>
                    </button>
                  </td>
                  {dates.map((d: string) => (
                    <AttendanceCell key={d} rec={u.attendance?.[d]} dateStr={d} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && users.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
            Tổng: <span className="font-semibold text-gray-700">{users.length}</span> nhân viên
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailUser && (
        <DetailModal
          detailUser={detailUser} detailData={detailData} detailMonth={detailMonth}
          onClose={() => setDetailUser(null)}
          onMonthChange={m => { setDetailMonth(m); loadDetail(detailUser._id, m); }}
        />
      )}
    </div>
  );
}

/* ── Detail Modal ── */
function DetailModal({ detailUser, detailData, detailMonth, onClose, onMonthChange }: {
  detailUser: any; detailData: any; detailMonth: string;
  onClose: () => void; onMonthChange: (m: string) => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Avatar name={detailUser.name} url={detailUser.avatar} size={10} />
            <div>
              <h3 className="font-bold text-gray-900">{detailUser.name}</h3>
              <p className="text-xs text-gray-400">
                {detailUser.employee_id ?? ''}{detailUser.department ? ` · ${detailUser.department}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={detailMonth}
              onChange={e => onMonthChange(e.target.value)}
              className="form-input text-sm py-1 w-36" />
            <button onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 text-lg leading-none">
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {!detailData ? (
            <div className="text-center text-gray-400 py-10">Đang tải...</div>
          ) : detailData.list.length === 0 ? (
            <div className="text-center text-gray-400 py-10">Chưa có dữ liệu tháng này</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-3 py-2 text-left font-semibold">Ngày</th>
                  <th className="px-3 py-2 text-left font-semibold">Vào ca</th>
                  <th className="px-3 py-2 text-left font-semibold">Ra ca</th>
                  <th className="px-3 py-2 text-left font-semibold">Số ca</th>
                  <th className="px-3 py-2 text-left font-semibold">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {detailData.list.map((r: any) => {
                  const sessions: any[] = r.sessions?.length > 0 ? r.sessions : [];
                  const firstCin = sessions[0]?.check_in_time ?? r.check_in_time;
                  const lastCout = sessions.filter((s: any) => s.check_out_time).slice(-1)[0]?.check_out_time ?? r.check_out_time;
                  const st = getStatus(r, r.date);
                  const stStyle = STATUS_STYLE[st];
                  return (
                    <tr key={r._id} className={stStyle.bg}>
                      <td className="px-3 py-2 font-medium text-gray-700">
                        {format(parseISO(r.date), 'EEE dd/MM', { locale: vi })}
                      </td>
                      <td className="px-3 py-2 text-emerald-600 font-semibold">{fmtTime(firstCin) ?? '—'}</td>
                      <td className="px-3 py-2 text-red-500 font-semibold">{fmtTime(lastCout) ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{sessions.length > 1 ? sessions.length : 1} ca</td>
                      <td className="px-3 py-2">
                        {st === 'checked_out' && <span className="badge bg-green-100 text-green-700">Hoàn thành</span>}
                        {st === 'checked_in'  && <span className="badge bg-yellow-100 text-yellow-700">Đang làm</span>}
                        {st === 'missing_out' && <span className="badge bg-red-100 text-red-600">Thiếu ra ca</span>}
                        {st === 'missing_in'  && <span className="badge bg-gray-100 text-gray-600">Chưa chấm</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
