const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { Trip, Driver, Vehicle, Request, DriverFinance, SystemConfig } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { calcDailyOvertime } = require('../utils/overtime');

// ─── Helper: format tiền VNĐ ───────────────────────────────────
const fmtMoney = v => (v || 0).toLocaleString('vi-VN');

// ─── Helper: lấy config tăng ca ─────────────────────────────────
async function getOvertimeConfig() {
  const [thr, rate] = await Promise.all([
    SystemConfig.findOne({ key: 'overtime_threshold' }),
    SystemConfig.findOne({ key: 'overtime_rate' }),
  ]);
  return { threshold: thr?.value ?? 4, rate: rate?.value ?? 100_000 };
}

/**
 * GET /reports/driver-monthly?driverId=&month=&year=
 * Xuất Excel sổ tài xế theo tháng
 */
router.get(
  '/driver-monthly',
  authenticate,
  authorize('accountant', 'manager'),
  async (req, res, next) => {
    try {
      const { driverId, month, year } = req.query;
      if (!driverId || !month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Cần truyền driverId, month, year',
        });
      }

      const driver = await Driver.findById(driverId).populate('vehicle_id', 'license_plate');
      if (!driver) return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });

      const nm_r = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
      const ny_r  = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
      const from = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`);
      const to   = new Date(`${ny_r}-${String(nm_r).padStart(2, '0')}-01T00:00:00+07:00`);

      const trips = await Trip.find({
        driver_id: driverId,
        trip_date: { $gte: from, $lt: to },
        status:    { $ne: 'cancelled' },
      }).sort('trip_date').lean();

      const requests = await Request.find({
        driver_id: driver._id,
        status:    'approved',
        type:      { $in: ['salary_advance', 'expense'] },
        created_at: { $gte: from, $lt: to },
      }).lean();

      const config = await getOvertimeConfig();

      // Tổng hợp
      const totalTrips   = trips.length;
      const { overtimeTrips, overtimePay } = await calcDailyOvertime(totalTrips);
      const totalIncome  = trips.reduce((s, t) => s + (t.income  || 0), 0);
      const totalExpense = trips.reduce((s, t) => s + (t.expense || 0), 0);
      const advances     = requests.filter(r => r.type === 'salary_advance');
      const expenses     = requests.filter(r => r.type === 'expense');
      const totalAdvance = advances.reduce((s, r) => s + (r.payload?.amount || 0), 0);
      const totalExpReq  = expenses.reduce((s, r) => s + (r.payload?.amount || 0), 0);
      const balance      = totalAdvance - totalExpReq;

      // ─── Build Excel ────────────────────────────────────────────
      const wb  = new ExcelJS.Workbook();
      wb.creator = 'Nam Thanh Transport';
      const ws  = wb.addWorksheet('Sổ tài xế');

      // Styles
      const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163797' } };
      const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      const accentFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8B30E' } };
      const thinBorder = {
        top:    { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left:   { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right:  { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };

      // ── Title ──
      ws.mergeCells('A1:J1');
      const titleCell = ws.getCell('A1');
      titleCell.value = 'CÔNG TY TNHH VẬN TẢI NAM THÀNH';
      titleCell.font  = { bold: true, size: 14, color: { argb: 'FF163797' } };
      titleCell.alignment = { horizontal: 'center' };

      ws.mergeCells('A2:J2');
      const subTitle = ws.getCell('A2');
      subTitle.value = `SỔ THEO DÕI TÀI XẾ — THÁNG ${month}/${year}`;
      subTitle.font  = { bold: true, size: 12 };
      subTitle.alignment = { horizontal: 'center' };

      // ── Info ──
      ws.getCell('A4').value = 'Tài xế:';  ws.getCell('B4').value = driver.full_name;
      ws.getCell('A5').value = 'Biển số:'; ws.getCell('B5').value = driver.vehicle_id?.license_plate ?? '—';
      ws.getCell('A6').value = 'Mã NV:';   ws.getCell('B6').value = driver.employee_id ?? '—';
      ['A4','A5','A6'].forEach(c => { ws.getCell(c).font = { bold: true }; });

      // ── Column headers (row 8) ──
      const headers = [
        { header: 'STT',        key: 'stt',       width: 5 },
        { header: 'Ngày',       key: 'date',       width: 12 },
        { header: 'Vật liệu',   key: 'material',   width: 16 },
        { header: 'Nơi lấy',    key: 'pickup',     width: 20 },
        { header: 'Nơi đổ',     key: 'drop',       width: 20 },
        { header: 'Thu (đ)',     key: 'income',     width: 14 },
        { header: 'Chi (đ)',     key: 'expense',    width: 14 },
        { header: 'Tăng ca',    key: 'overtime',   width: 10 },
        { header: 'OT Pay (đ)', key: 'ot_pay',     width: 14 },
        { header: 'Ghi chú',    key: 'note',       width: 20 },
      ];

      ws.columns = headers;
      const headerRow = ws.getRow(8);
      headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value  = h.header;
        cell.fill   = headerFill;
        cell.font   = headerFont;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder;
      });
      headerRow.height = 22;

      // ── Data rows ──
      trips.forEach((t, idx) => {
        const row = ws.addRow({
          stt:      idx + 1,
          date:     new Date(t.trip_date).toLocaleDateString('vi-VN'),
          material: t.material_name,
          pickup:   t.pickup_location,
          drop:     t.drop_location,
          income:   t.income || 0,
          expense:  t.expense || 0,
          overtime: t.is_overtime ? 'Có' : '',
          ot_pay:   t.overtime_pay || 0,
          note:     t.note || '',
        });

        row.eachCell(cell => {
          cell.border = thinBorder;
          cell.font   = { size: 10 };
        });

        // Highlight overtime rows
        if (t.is_overtime) {
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
          });
        }

        // Number format
        ['income','expense','ot_pay'].forEach(k => {
          const col = headers.findIndex(h => h.key === k) + 1;
          row.getCell(col).numFmt = '#,##0';
          row.getCell(col).alignment = { horizontal: 'right' };
        });
      });

      // ── Summary row ──
      const summaryRow = ws.addRow({
        stt: '', date: 'TỔNG CỘNG', material: '',
        pickup: '', drop: '',
        income:  totalIncome,
        expense: totalExpense,
        overtime: `${overtimeTrips} chuyến`,
        ot_pay:  overtimePay,
        note: '',
      });
      summaryRow.eachCell(cell => {
        cell.fill   = accentFill;
        cell.font   = { bold: true, size: 10 };
        cell.border = thinBorder;
      });
      ['income','expense','ot_pay'].forEach(k => {
        const col = headers.findIndex(h => h.key === k) + 1;
        summaryRow.getCell(col).numFmt = '#,##0';
        summaryRow.getCell(col).alignment = { horizontal: 'right' };
      });

      // ── Financial summary ──
      const fRow = ws.rowCount + 2;
      const summaryItems = [
        ['Tổng số chuyến',     `${totalTrips} chuyến`],
        ['Số chuyến tăng ca',  `${overtimeTrips} chuyến`],
        ['Phụ cấp tăng ca',    fmtMoney(overtimePay) + 'đ'],
        ['Tổng tiền ứng trước', fmtMoney(totalAdvance) + 'đ'],
        ['Tổng chi phí',       fmtMoney(totalExpReq) + 'đ'],
        ['Còn lại (ứng - chi)', fmtMoney(balance) + 'đ'],
      ];

      summaryItems.forEach(([label, value], i) => {
        ws.getCell(`A${fRow + i}`).value = label;
        ws.getCell(`B${fRow + i}`).value = value;
        ws.getCell(`A${fRow + i}`).font  = { bold: true, size: 10 };
        ws.getCell(`B${fRow + i}`).font  = { size: 10 };
        if (label === 'Còn lại (ứng - chi)') {
          ws.getCell(`B${fRow + i}`).font = {
            bold: true, size: 11,
            color: { argb: balance >= 0 ? 'FF2E7D32' : 'FFD32F2F' },
          };
        }
      });

      // Send file
      const filename = `so-tai-xe-${driver.full_name.replace(/\s/g, '-')}-T${month}-${year}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /reports/trip-log?vehicleId=&from=&to=
 * Xuất PDF nhật trình xe (HTML → trả về HTML để print)
 */
router.get(
  '/trip-log',
  authenticate,
  authorize('coordinator', 'accountant', 'manager'),
  async (req, res, next) => {
    try {
      const { vehicleId, from, to, driverId } = req.query;

      const tripFilter = { status: { $ne: 'cancelled' } };
      if (vehicleId) tripFilter.vehicle_id = vehicleId;
      if (driverId)  tripFilter.driver_id  = driverId;
      if (from || to) {
        tripFilter.trip_date = {};
        if (from) tripFilter.trip_date.$gte = new Date(String(from));
        if (to)   tripFilter.trip_date.$lte = new Date(String(to));
      }

      const trips = await Trip.find(tripFilter)
        .populate('driver_id',  'full_name employee_id')
        .populate('vehicle_id', 'license_plate brand model')
        .sort('trip_date')
        .limit(500)
        .lean();

      if (trips.length === 0) {
        return res.status(404).json({ success: false, message: 'Không có chuyến nào trong khoảng thời gian này' });
      }

      const vehicle = trips[0] && trips[0].vehicle_id;
      const driver  = trips[0] && trips[0].driver_id;

      const fromLabel = from ? new Date(String(from)).toLocaleDateString('vi-VN') : '';
      const toLabel   = to   ? new Date(String(to)).toLocaleDateString('vi-VN')   : '';
      const dateRange = fromLabel && toLabel
        ? `${fromLabel} – ${toLabel}`
        : fromLabel || toLabel || 'Tất cả';

      const totalIncome  = trips.reduce((s, t) => s + (t.income  || 0), 0);
      const totalExpense = trips.reduce((s, t) => s + (t.expense || 0), 0);
      const overtimeCount = trips.filter(t => t.is_overtime).length;

      // Build HTML
      const rows = trips.map((t, i) => `
        <tr class="${i % 2 === 0 ? '' : 'alt'} ${t.is_overtime ? 'ot' : ''}">
          <td>${i + 1}</td>
          <td>${new Date(t.trip_date).toLocaleDateString('vi-VN')}</td>
          <td>${t.material_name}</td>
          <td>${t.pickup_location}</td>
          <td>${t.drop_location}</td>
          <td class="num">${(t.income  || 0).toLocaleString('vi-VN')}</td>
          <td class="num">${(t.expense || 0).toLocaleString('vi-VN')}</td>
          <td class="center">${t.is_overtime ? '✓' : ''}</td>
          <td>${t.note || ''}</td>
        </tr>`).join('');

      const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8"/>
<title>Nhật trình xe</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; font-size: 12px; color: #000; padding: 20px; }
  .header { text-align: center; margin-bottom: 16px; }
  .header h1 { font-size: 16px; font-weight: bold; text-transform: uppercase; }
  .header h2 { font-size: 13px; margin-top: 4px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 11px; }
  .meta span { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #163797; color: white; padding: 6px 4px; font-weight: bold; text-align: center; border: 1px solid #ccc; }
  td { padding: 5px 4px; border: 1px solid #ddd; }
  tr.alt td { background: #f9f9f9; }
  tr.ot td { background: #fff8e1; }
  .num { text-align: right; }
  .center { text-align: center; }
  .summary { margin-top: 16px; border: 2px solid #163797; padding: 10px; border-radius: 4px; }
  .summary h3 { color: #163797; margin-bottom: 8px; font-size: 12px; }
  .sum-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #eee; }
  .sum-row:last-child { border-bottom: none; font-weight: bold; font-size: 13px; color: #163797; }
  .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 11px; }
  .footer div { text-align: center; }
  @media print {
    .no-print { display: none; }
    body { padding: 10px; }
  }
</style>
</head>
<body>
<div class="header">
  <h1>Công ty TNHH Vận tải Nam Thành</h1>
  <h2>NHẬT TRÌNH XE — ${dateRange}</h2>
</div>
<div class="meta">
  <div>Biển số xe: <span>${vehicle?.license_plate ?? '—'}</span> &nbsp; ${vehicle?.brand ?? ''} ${vehicle?.model ?? ''}</div>
  <div>Tài xế: <span>${driver?.full_name ?? '—'}</span></div>
  <div>Ngày in: <span>${new Date().toLocaleDateString('vi-VN')}</span></div>
</div>
<table>
  <thead>
    <tr>
      <th>STT</th><th>Ngày</th><th>Vật liệu</th><th>Nơi lấy</th><th>Nơi đổ</th>
      <th>Thu (đ)</th><th>Chi (đ)</th><th>Tăng ca</th><th>Ghi chú</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr style="background:#163797;color:white;font-weight:bold">
      <td colspan="5" style="text-align:center;color:white;border-color:#fff">TỔNG CỘNG</td>
      <td class="num" style="color:white;border-color:#fff">${totalIncome.toLocaleString('vi-VN')}</td>
      <td class="num" style="color:white;border-color:#fff">${totalExpense.toLocaleString('vi-VN')}</td>
      <td class="center" style="color:white;border-color:#fff">${overtimeCount}</td>
      <td style="color:white;border-color:#fff"></td>
    </tr>
  </tbody>
</table>
<div class="summary">
  <h3>Tổng kết</h3>
  <div class="sum-row"><span>Tổng số chuyến</span><span>${trips.length} chuyến</span></div>
  <div class="sum-row"><span>Chuyến tăng ca</span><span>${overtimeCount} chuyến</span></div>
  <div class="sum-row"><span>Tổng thu</span><span>${totalIncome.toLocaleString('vi-VN')}đ</span></div>
  <div class="sum-row"><span>Tổng chi</span><span>${totalExpense.toLocaleString('vi-VN')}đ</span></div>
  <div class="sum-row"><span>Còn lại</span><span>${(totalIncome - totalExpense).toLocaleString('vi-VN')}đ</span></div>
</div>
<div class="footer">
  <div><p>Người lập</p><br/><br/><p>.....................</p></div>
  <div><p>Tài xế</p><br/><br/><p>.....................</p></div>
  <div><p>Kế toán</p><br/><br/><p>.....................</p></div>
  <div><p>Quản lý</p><br/><br/><p>.....................</p></div>
</div>
<script class="no-print">window.onload = () => window.print();</script>
</body></html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /reports/payroll?month=&year=
 * Bảng lương tổng hợp tất cả tài xế trong tháng
 */
router.get(
  '/payroll',
  authenticate,
  authorize('accountant', 'manager'),
  async (req, res, next) => {
    try {
      const { month, year } = req.query;
      if (!month || !year) {
        return res.status(400).json({ success: false, message: 'Cần truyền month, year' });
      }

      const nm_r2 = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
      const ny_r2  = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
      const from = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`);
      const to   = new Date(`${ny_r2}-${String(nm_r2).padStart(2, '0')}-01T00:00:00+07:00`);

      const drivers = await Driver.find({ status: 'active' }).populate('vehicle_id', 'license_plate').lean();
      const config  = await getOvertimeConfig();

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Nam Thanh Transport';
      const ws = wb.addWorksheet(`Bảng lương T${month}-${year}`);

      const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163797' } };
      const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      const thinBorder = {
        top:    { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left:   { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right:  { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };

      ws.mergeCells('A1:I1');
      ws.getCell('A1').value = `BẢNG LƯƠNG THÁNG ${month}/${year} — CÔNG TY VẬN TẢI NAM THÀNH`;
      ws.getCell('A1').font  = { bold: true, size: 14, color: { argb: 'FF163797' } };
      ws.getCell('A1').alignment = { horizontal: 'center' };

      ws.columns = [
        { header: 'STT',         width: 5  },
        { header: 'Tài xế',      width: 20 },
        { header: 'Biển số',     width: 12 },
        { header: 'Tổng chuyến', width: 13 },
        { header: 'Tăng ca',     width: 10 },
        { header: 'OT Pay (đ)',  width: 14 },
        { header: 'Tiền ứng (đ)',width: 14 },
        { header: 'Tiền chi (đ)',width: 14 },
        { header: 'Còn lại (đ)', width: 14 },
      ];

      const hRow = ws.getRow(3);
      ws.columns.forEach((col, i) => {
        const cell = hRow.getCell(i + 1);
        cell.value = col.header;
        cell.fill  = headerFill;
        cell.font  = headerFont;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder;
      });
      hRow.height = 22;

      for (let i = 0; i < drivers.length; i++) {
        const d = drivers[i];
        const trips = await Trip.find({ driver_id: d._id, trip_date: { $gte: from, $lt: to }, status: { $ne: 'cancelled' } }).lean();
        const reqs  = await Request.find({ driver_id: d._id, status: 'approved', type: { $in: ['salary_advance', 'expense'] }, created_at: { $gte: from, $lt: to } }).lean();

        const totalTrips   = trips.length;
        const { overtimeTrips, overtimePay } = await calcDailyOvertime(totalTrips);
        const advances     = reqs.filter(r => r.type === 'salary_advance').reduce((s, r) => s + (r.payload?.amount || 0), 0);
        const expenses     = reqs.filter(r => r.type === 'expense').reduce((s, r) => s + (r.payload?.amount || 0), 0);
        const balance      = advances - expenses;

        const row = ws.addRow([
          i + 1,
          d.full_name,
          (d.vehicle_id && d.vehicle_id.license_plate) ? d.vehicle_id.license_plate : '—',
          totalTrips,
          overtimeTrips,
          overtimePay,
          advances,
          expenses,
          balance,
        ]);

        row.eachCell(cell => {
          cell.border = thinBorder;
          cell.font = { size: 10 };
        });
        [6, 7, 8, 9].forEach(col => {
          row.getCell(col).numFmt = '#,##0';
          row.getCell(col).alignment = { horizontal: 'right' };
        });
        if (balance < 0) {
          row.getCell(9).font = { bold: true, color: { argb: 'FFD32F2F' }, size: 10 };
        }
      }

      const filename = `bang-luong-T${month}-${year}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
