const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const mongoose = require('mongoose');
const { Driver, Trip, Request, SystemConfig } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ─── Model nhỏ cho Fund Entry (lưu inline vào collection riêng) ───────────────
const fundEntrySchema = new mongoose.Schema({
  driver_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true, index: true },
  date:         { type: String, required: true },           // 'YYYY-MM-DD'
  month:        { type: String, required: true, index: true }, // 'YYYY-MM'
  advance:      { type: Number, default: 0 },               // tiền ứng (admin cấp)
  expense:      { type: Number, default: 0 },               // tiền chi (tài xế báo)
  note:         { type: String, default: '' },              // ghi chú
  trips:        { type: Number, default: 0 },               // số chuyến ngày đó
  overtime_trips: { type: Number, default: 0 },             // chuyến tăng ca
  created_by:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const FundEntry = mongoose.models.FundEntry
  || mongoose.model('FundEntry', fundEntrySchema);

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /fund/me/entries?month=&year=
 * Tài xế tự lấy quỹ của mình (dùng cho mobile app)
 */
router.get('/me/entries', authenticate, authorize('driver'), async (req, res, next) => {
  try {
    const { Driver } = require('../models');
    const driver = await Driver.findOne({ user_id: req.user._id })
      .populate('vehicle_id', 'license_plate brand model')
      .lean();

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });
    }

    const { month, year } = req.query;
    const now = new Date();
    const m = month ? String(month).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');
    const y = year  ? String(year)  : String(now.getFullYear());
    const monthStr = `${y}-${m}`;

    // Lấy fund entries
    const entries = await FundEntry.find({
      driver_id: driver._id,
      month:     monthStr,
    }).sort('date').lean();

    // Tổng hợp
    const totalAdvance = entries.reduce((s, e) => s + (e.advance || 0), 0);
    const totalExpense = entries.reduce((s, e) => s + (e.expense || 0), 0);

    // Lấy trips tháng này
    const from = new Date(`${monthStr}-01T00:00:00.000Z`);
    const to   = new Date(from); to.setMonth(to.getMonth() + 1);
    const trips = await Trip.countDocuments({
      driver_id: driver._id,
      trip_date: { $gte: from, $lt: to },
      status:    { $ne: 'cancelled' },
    });

    res.json({
      success: true,
      data: {
        driver: {
          _id:           driver._id,
          full_name:     driver.full_name,
          employee_id:   driver.employee_id,
          license_plate: driver.vehicle_id?.license_plate ?? '—',
        },
        month: monthStr,
        entries,
        totals: {
          advance:  totalAdvance,
          expense:  totalExpense,
          remaining: totalAdvance - totalExpense,
          trips,
        },
      },
    });
  } catch (err) { next(err); }
});

/**
 * GET /fund/drivers
 * Lấy danh sách tài xế + tổng hợp quỹ tháng
 */
router.get('/drivers', authenticate, authorize('coordinator', 'accountant', 'manager'), async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month ? String(month).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');
    const y = year  ? String(year)  : String(now.getFullYear());
    const monthStr = `${y}-${m}`;

    const drivers = await Driver.find({ status: 'active' })
      .populate('vehicle_id', 'license_plate')
      .populate('user_id', 'name phone')
      .lean();

    const result = await Promise.all(drivers.map(async d => {
      const from = new Date(`${monthStr}-01T00:00:00.000Z`);
      const to   = new Date(from); to.setMonth(to.getMonth() + 1);
      const dateFrom = `${monthStr}-01`;
      const dateTo   = `${monthStr}-31`;

      // Query theo date range để tránh lỗi month field không khớp
      const entries = await FundEntry.find({
        driver_id: d._id,
        date: { $gte: dateFrom, $lte: dateTo },
      }).lean();
      const totalAdvance = entries.reduce((s, e) => s + (e.advance || 0), 0);
      const totalExpense = entries.reduce((s, e) => s + (e.expense || 0), 0);
      const remaining    = totalAdvance - totalExpense;

      // Tổng chuyến tháng
      const trips = await Trip.countDocuments({ driver_id: d._id, trip_date: { $gte: from, $lt: to }, status: { $ne: 'cancelled' } });
      const overtimeTrips = await Trip.countDocuments({ driver_id: d._id, trip_date: { $gte: from, $lt: to }, is_overtime: true });

      return {
        driver_id:      d._id,
        employee_id:    d.employee_id,
        full_name:      d.full_name,
        license_plate:  d.vehicle_id?.license_plate ?? '—',
        phone:          d.phone,
        total_advance:  totalAdvance,
        total_expense:  totalExpense,
        remaining,
        total_trips:    trips,
        overtime_trips: overtimeTrips,
        month:          monthStr,
      };
    }));

    res.json({ success: true, data: { drivers: result, month: monthStr } });
  } catch (err) { next(err); }
});

/**
 * GET /fund/:driverId/entries?month=YYYY-MM
 * Lấy chi tiết từng dòng (theo ngày) của 1 tài xế
 * Driver chỉ xem được của mình, admin xem được tất cả
 */
router.get('/:driverId/entries', authenticate, async (req, res, next) => {
  try {
    // Kiểm tra quyền: driver chỉ được xem của mình
    if (req.user.role === 'driver') {
      const { Driver } = require('../models');
      const driver = await Driver.findOne({ user_id: req.user._id });
      if (!driver || driver._id.toString() !== req.params.driverId) {
        return res.status(403).json({
          success: false,
          message: 'Không có quyền xem quỹ của tài xế khác',
        });
      }
    }
    const { month, year } = req.query;
    const now = new Date();
    const m = month ? String(month).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');
    const y = year  ? String(year)  : String(now.getFullYear());
    const monthStr = `${y}-${m}`;

    const driver = await Driver.findById(req.params.driverId)
      .populate('vehicle_id', 'license_plate brand model')
      .lean();
    if (!driver) return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });

    const dateFrom = `${monthStr}-01`;
    const dateTo   = `${monthStr}-31`;

    // Lấy tất cả entries tháng này (query theo date để tránh lỗi month field)
    const entries = await FundEntry.find({
      driver_id: req.params.driverId,
      date: { $gte: dateFrom, $lte: dateTo },
    }).sort('date').lean();

    // Lấy trips theo ngày để fill vào bảng
    const from = new Date(`${monthStr}-01T00:00:00.000Z`);
    const to   = new Date(from); to.setMonth(to.getMonth() + 1);
    const trips = await Trip.find({
      driver_id: req.params.driverId,
      trip_date: { $gte: from, $lt: to },
      status:    { $ne: 'cancelled' },
    }).lean();

    // Group trips by date
    const tripsByDate = {};
    trips.forEach((t) => {
      const d = t.trip_date.toISOString().slice(0, 10);
      if (!tripsByDate[d]) tripsByDate[d] = [];
      tripsByDate[d].push(t);
    });

    // Build daily rows — CHỈ hiện ngày có dữ liệu (có entry hoặc có chuyến)
    const allDates = new Set([
      ...entries.map(e => e.date),
      ...Object.keys(tripsByDate),
    ]);

    const sortedDates = Array.from(allDates).sort();
    const rows = [];
    let runningBalance = 0;

    // Tính balance tích lũy từ đầu tháng
    const daysInMonth = new Date(parseInt(y), parseInt(m), 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr  = `${monthStr}-${String(day).padStart(2, '0')}`;
      const entry    = entries.find(e => e.date === dateStr);
      const dayTrips = tripsByDate[dateStr] || [];
      const advance  = entry?.advance || 0;
      const expense  = entry?.expense || 0;
      runningBalance += advance - expense;

      // Chỉ push vào rows nếu có dữ liệu
      if (advance > 0 || expense > 0 || dayTrips.length > 0) {
        const dayOT = dayTrips.filter(t => t.is_overtime).length;
        rows.push({
          date:           dateStr,
          advance,
          expense,
          balance:        runningBalance,
          note:           entry?.note || '',
          trips:          dayTrips.length,
          overtime_trips: dayOT,
          entry_id:       entry?._id || null,
        });
      }
    }

    // Totals
    const totalAdvance  = rows.reduce((s, r) => s + r.advance, 0);
    const totalExpense  = rows.reduce((s, r) => s + r.expense, 0);
    const totalTrips    = trips.length;
    const totalOT       = trips.filter(t => t.is_overtime).length;

    res.json({
      success: true,
      data: {
        driver: {
          _id:           driver._id,
          full_name:     driver.full_name,
          employee_id:   driver.employee_id,
          license_plate: driver.vehicle_id?.license_plate ?? '—',
        },
        month:          monthStr,
        rows,
        totals: { advance: totalAdvance, expense: totalExpense, remaining: totalAdvance - totalExpense, trips: totalTrips, overtime_trips: totalOT },
      },
    });
  } catch (err) { next(err); }
});

/**
 * GET /fund/all-advances?month=M&year=Y
 * Trả về TẤT CẢ FundEntry có advance > 0 trong tháng, KHÔNG group theo ngày
 * Mỗi lần cấp = 1 dòng riêng
 */
router.get('/all-advances', authenticate, authorize('coordinator', 'accountant', 'manager'), async (req, res, next) => {
  try {
    const { Driver } = require('../models');
    const now    = new Date();
    const month  = req.query.month  ?? (now.getMonth() + 1);
    const year   = req.query.year   ?? now.getFullYear();
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    // Lấy tất cả entries có advance > 0 trong tháng
    const entries = await FundEntry.find({
      month:   monthStr,
      advance: { $gt: 0 },
    }).sort('-date').lean();

    // Populate driver info
    const driverIds = [...new Set(entries.map(e => e.driver_id.toString()))];
    const drivers = await Driver.find({ _id: { $in: driverIds } })
      .select('_id full_name employee_id')
      .lean();
    const driverMap = Object.fromEntries(drivers.map(d => [d._id.toString(), d]));

    const result = entries.map(e => ({
      _id:         e._id,
      date:        e.date,
      advance:     e.advance,
      note:        e.note,
      driver_id:   e.driver_id,
      driver_name: driverMap[e.driver_id.toString()]?.full_name ?? '—',
      employee_id: driverMap[e.driver_id.toString()]?.employee_id ?? '—',
      created_at:  e.created_at,
    }));

    res.json({ success: true, data: { entries: result, month: monthStr } });
  } catch (err) { next(err); }
});

/**
 * POST /fund/:driverId/entries
 * Thêm/cập nhật dòng quỹ cho 1 ngày (admin điền tiền ứng hoặc tài xế báo chi)
 */
router.post('/:driverId/entries',
  authenticate,
  authorize('coordinator', 'accountant', 'manager'),
  [
    body('date').notEmpty().withMessage('date là bắt buộc (YYYY-MM-DD)'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { date, advance = 0, expense = 0, note = '' } = req.body;
      const month = date.slice(0, 7); // 'YYYY-MM'

      // Luôn tạo entry mới — mỗi lần cấp là 1 dòng riêng
      const entry = await FundEntry.create({
        driver_id:  req.params.driverId,
        date,
        month,
        advance:    Number(advance),
        expense:    Number(expense),
        note,
        created_by: req.user._id,
      });

      res.status(201).json({ success: true, message: 'Đã thêm vào quỹ', data: entry });
    } catch (err) { next(err); }
  }
);

/**
 * POST /fund/entries/:entryId/split
 * Tách 1 entry bị gộp thành nhiều entries riêng dựa theo ghi chú phân cách bởi ";"
 * Body: { parts: [{ advance, note }] } — tổng advance phải = entry.advance
 */
router.post('/entries/:entryId/split', authenticate, authorize('coordinator', 'accountant', 'manager'), async (req, res, next) => {
  try {
    const entry = await FundEntry.findById(req.params.entryId);
    if (!entry) return res.status(404).json({ success: false, message: 'Không tìm thấy entry' });

    const parts = req.body.parts; // [{ advance, note }]
    if (!parts || !Array.isArray(parts) || parts.length < 2) {
      return res.status(400).json({ success: false, message: 'Cần ít nhất 2 phần để tách' });
    }

    // Kiểm tra tổng advance
    const totalParts = parts.reduce((s, p) => s + Number(p.advance ?? 0), 0);
    if (Math.abs(totalParts - entry.advance) > 1) {
      return res.status(400).json({ success: false, message: `Tổng tiền các phần (${totalParts}) phải bằng tổng gốc (${entry.advance})` });
    }

    // Tạo các entries mới
    const newEntries = await FundEntry.insertMany(parts.map(p => ({
      driver_id: entry.driver_id,
      date:      entry.date,
      month:     entry.month,
      advance:   Number(p.advance ?? 0),
      expense:   0,
      note:      p.note ?? '',
    })));

    // Xóa entry cũ
    await entry.deleteOne();

    res.json({ success: true, message: `Đã tách thành ${newEntries.length} lần cấp`, data: newEntries });
  } catch (err) { next(err); }
});

/**
 * PUT /fund/entries/:entryId
 * Chỉnh sửa 1 dòng quỹ
 */
router.put('/entries/:entryId', authenticate, authorize('accountant', 'manager'), async (req, res, next) => {
  try {
    const entry = await FundEntry.findByIdAndUpdate(
      req.params.entryId,
      { $set: { advance: req.body.advance, expense: req.body.expense, note: req.body.note } },
      { new: true }
    );
    if (!entry) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

/**
 * DELETE /fund/entries/:entryId
 */
router.delete('/entries/:entryId', authenticate, authorize('manager'), async (req, res, next) => {
  try {
    await FundEntry.findByIdAndDelete(req.params.entryId);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) { next(err); }
});

/**
 * GET /fund/summary/daily?date=YYYY-MM-DD
 * Tổng hợp quỹ toàn bộ tài xế trong 1 ngày (cho Dashboard chart)
 */
router.get('/summary/daily', authenticate, authorize('coordinator', 'accountant', 'manager'), async (req, res, next) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);

    const agg = await FundEntry.aggregate([
      { $match: { date: dateStr } },
      {
        $group: {
          _id:          null,
          total_advance: { $sum: '$advance' },
          total_expense: { $sum: '$expense' },
        },
      },
    ]);

    const row = agg[0] ?? { total_advance: 0, total_expense: 0 };
    res.json({
      success: true,
      data: {
        date:          dateStr,
        total_advance: row.total_advance,
        total_expense: row.total_expense,
      },
    });
  } catch (err) { next(err); }
});

/**
 * GET /fund/:driverId/export?month=YYYY-MM
 * Xuất Excel quỹ tài xế theo định dạng mẫu
 */
router.get('/:driverId/export', authenticate, authorize('coordinator', 'accountant', 'manager'), async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const { month, year } = req.query;
    const now = new Date();
    const m   = month ? String(month).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');
    const y   = year  ? String(year)  : String(now.getFullYear());
    const monthStr = `${y}-${m}`;
    const monthNum = parseInt(m);

    // Lấy driver
    const { Driver } = require('../models');
    const driver = await Driver.findById(req.params.driverId)
      .populate('vehicle_id', 'license_plate')
      .lean();
    if (!driver) return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });

    // Lấy entries
    const entries = await FundEntry.find({ driver_id: driver._id, month: monthStr }).sort('date').lean();

    // Lấy trips theo ngày
    const from = new Date(`${monthStr}-01T00:00:00.000Z`);
    const to   = new Date(from); to.setMonth(to.getMonth() + 1);
    const trips = await Trip.find({
      driver_id: driver._id,
      trip_date: { $gte: from, $lt: to },
      status:    { $ne: 'cancelled' },
    }).lean();

    // Group trips by date
    const tripsByDate = {};
    trips.forEach(t => {
      const d = t.trip_date?.toISOString?.().slice(0, 10) ?? '';
      if (!tripsByDate[d]) tripsByDate[d] = 0;
      tripsByDate[d]++;
    });

    // Build daily rows cho toàn bộ tháng
    const daysInMonth = new Date(parseInt(y), monthNum, 0).getDate();
    const rows = [];
    let balance = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
      const entry   = entries.find(e => e.date === dateStr);
      const advance = entry?.advance ?? 0;
      const expense = entry?.expense ?? 0;
      const note    = entry?.note    ?? '';
      const totalTrips    = tripsByDate[dateStr] ?? 0;
      const overtimeTrips = Math.max(0, totalTrips - 4);
      balance += advance - expense;

      rows.push({
        date:          `${monthNum}/${day}/${String(y).slice(-2)}`,
        license_plate: driver.vehicle_id?.license_plate ?? '—',
        advance,
        expense,
        balance,
        note,
        totalTrips:    totalTrips  || '',
        overtimeTrips: overtimeTrips || '',
      });
    }

    // Tổng cộng
    const sumAdvance = entries.reduce((s, e) => s + (e.advance || 0), 0);
    const sumExpense = entries.reduce((s, e) => s + (e.expense || 0), 0);
    const sumTrips   = trips.length;
    const sumOT      = Object.values(tripsByDate).reduce((s, c) => s + Math.max(0, c - 4), 0);

    // Build Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Nam Thanh Transport';
    const ws = wb.addWorksheet(`Tháng ${monthNum}`);

    // ── Màu sắc ──
    const BLUE   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163797' } };
    const YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8B30E' } };
    const GRAY   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    const WHITE  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    const whiteFont  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    const boldFont   = { bold: true, size: 11 };
    const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const rightAlign  = { horizontal: 'right',  vertical: 'middle' };
    const border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };

    // ── Dòng tiêu đề tháng ──
    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `Tháng ${monthNum}`;
    titleCell.font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill  = BLUE;
    titleCell.alignment = centerAlign;
    ws.getRow(1).height = 28;

    // ── Dòng tên tài xế ──
    ws.mergeCells('A2:I2');
    const nameCell = ws.getCell('A2');
    nameCell.value = `TÀI XẾ ${driver.full_name?.toUpperCase() ?? ''}`;
    nameCell.font  = { bold: true, size: 13 };
    nameCell.fill  = YELLOW;
    nameCell.alignment = centerAlign;
    ws.getRow(2).height = 24;

    // ── Header ──
    const headers = [
      'BSX', 'Ngày tháng', 'Tiền ứng', 'Tiền chi', 'Tiền còn lại',
      'Ghi chú', 'Tổng Số Chuyến', 'Số Chuyến tính tăng ca', '',
    ];
    const headerRow = ws.getRow(3);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value     = h;
      cell.font      = whiteFont;
      cell.fill      = BLUE;
      cell.alignment = centerAlign;
      cell.border    = border;
    });
    headerRow.height = 40;

    // ── Data rows ──
    const fmtNum = v => v ? new Intl.NumberFormat('vi-VN').format(v) : '';
    rows.forEach((r, idx) => {
      const row = ws.getRow(4 + idx);
      const vals = [
        r.license_plate,
        r.date,
        r.advance ? fmtNum(r.advance) : '',
        r.expense ? fmtNum(r.expense) : '',
        r.balance ? fmtNum(r.balance) : '',
        r.note,
        r.totalTrips,
        r.overtimeTrips,
        '',
      ];
      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value     = v;
        cell.border    = border;
        cell.alignment = ci >= 2 && ci <= 4 ? rightAlign : { vertical: 'middle', wrapText: true };
        cell.font      = { size: 10 };
        if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      });
      row.height = 18;
    });

    // ── Dòng tổng cộng ──
    const totalRowIdx = 4 + rows.length;
    const totalRow = ws.getRow(totalRowIdx);
    const totalVals = ['Tổng Cộng', '', fmtNum(sumAdvance), fmtNum(sumExpense), fmtNum(balance), '', sumTrips, sumOT, ''];
    totalVals.forEach((v, ci) => {
      const cell = totalRow.getCell(ci + 1);
      cell.value     = v;
      cell.font      = { bold: true, size: 11 };
      cell.fill      = GRAY;
      cell.border    = border;
      cell.alignment = ci >= 2 && ci <= 4 ? rightAlign : centerAlign;
    });
    totalRow.height = 22;

    // ── Column widths ──
    ws.columns = [
      { width: 13 }, // BSX
      { width: 12 }, // Ngày
      { width: 14 }, // Tiền ứng
      { width: 14 }, // Tiền chi
      { width: 16 }, // Còn lại
      { width: 36 }, // Ghi chú
      { width: 16 }, // Tổng chuyến
      { width: 22 }, // Tăng ca
      { width: 4  },
    ];

    // ── Xuất file ──
    const filename = `Quy_${driver.full_name?.replace(/\s+/g, '_')}_T${monthNum}_${y}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

/**
 * GET /fund/:driverId/requests?month=M&year=Y
 * Lấy từng yêu cầu chi riêng lẻ (expense requests) của tài xế trong tháng
 */
router.get('/:driverId/requests', authenticate, async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month ? String(month).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');
    const y = year  ? String(year)  : String(now.getFullYear());
    const monthStr = `${y}-${m}`;

    const { Request } = require('../models');

    // Lấy tất cả expense requests của driver này trong tháng
    const driver = await Driver.findById(req.params.driverId).lean();
    if (!driver) return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });

    const requests = await Request.find({
      driver_id: driver._id,
      type:      'expense',
    }).sort('-created_at').lean();

    // Lọc theo tháng dựa vào payload.date hoặc created_at
    const filtered = requests.filter(r => {
      const d = r.payload?.date ?? r.created_at?.toISOString().slice(0, 10) ?? '';
      return d.startsWith(monthStr);
    });

    // Lấy FundEntry để tính balance chạy
    const entries = await FundEntry.find({
      driver_id: driver._id,
      month:     monthStr,
    }).sort('date').lean();
    const totalAdvance = entries.reduce((s, e) => s + (e.advance || 0), 0);
    const totalExpense = entries.reduce((s, e) => s + (e.expense || 0), 0);

    res.json({
      success: true,
      data: {
        requests: filtered.map(r => ({
          _id:    r._id,
          date:   r.payload?.date ?? r.created_at?.toISOString().slice(0, 10),
          amount: r.payload?.amount ?? 0,
          note:   r.payload?.note ?? r.title ?? '',
          status: r.status,
          title:  r.title,
        })),
        totals: {
          advance:   totalAdvance,
          expense:   totalExpense,
          remaining: totalAdvance - totalExpense,
        },
      },
    });
  } catch (err) { next(err); }
});

/**
 * GET /fund/:driverId/advances?month=M&year=Y
 * Lấy tất cả lần nạp tiền (FundEntry.advance > 0) của tài xế trong tháng
 */
router.get('/:driverId/advances', authenticate, authorize('coordinator', 'accountant', 'manager'), async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month ? String(month).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');
    const y = year  ? String(year)  : String(now.getFullYear());
    const monthStr = `${y}-${m}`;
    const dateFrom = `${monthStr}-01`;
    const dateTo   = `${monthStr}-31`;

    const entries = await FundEntry.find({
      driver_id: req.params.driverId,
      advance:   { $gt: 0 },
      date:      { $gte: dateFrom, $lte: dateTo },
    }).sort('-date').lean();

    res.json({
      success: true,
      data: {
        advances: entries.map(e => ({
          _id:        e._id,
          date:       e.date,
          advance:    e.advance,
          note:       e.note ?? '',
          created_at: e.created_at,
        })),
        total: entries.reduce((s, e) => s + e.advance, 0),
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
