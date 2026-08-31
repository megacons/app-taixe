const STATUS_MAP: Record<string, { label: string; className: string }> = {
  // Driver / Vehicle
  active:      { label: 'Hoạt động',  className: 'badge-success' },
  inactive:    { label: 'Không HĐ',   className: 'badge-gray' },
  on_leave:    { label: 'Nghỉ phép',  className: 'badge-warning' },
  suspended:   { label: 'Đình chỉ',   className: 'badge-danger' },
  maintenance: { label: 'Bảo dưỡng',  className: 'badge-warning' },
  broken:      { label: 'Hỏng',       className: 'badge-danger' },
  // Request
  pending:     { label: 'Chờ duyệt',  className: 'badge-warning' },
  approved:    { label: 'Đã duyệt',   className: 'badge-success' },
  rejected:    { label: 'Từ chối',    className: 'badge-danger' },
  completed:   { label: 'Hoàn thành', className: 'badge-info' },
  cancelled:   { label: 'Đã hủy',     className: 'badge-gray' },
  // Trip
  draft:       { label: 'Nháp',       className: 'badge-gray' },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, className: 'badge-gray' };
  return <span className={cfg.className}>{cfg.label}</span>;
}
