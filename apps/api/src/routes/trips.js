const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const mongoose = require('mongoose');
const { Trip, Driver, Vehicle, TripImage } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { upload, getFileUrl } = require('../middleware/upload');
const { calcOvertimeForTrip, calcDailyOvertime, getOvertimeConfig } = require('../utils/overtime');

/**
 * Lấy driverId từ user (driver tự xem, admin truyền qua param)
 */
async function resolveDriverId(req) {
  if (req.user.role === 'driver') {
    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver) throw { status: 404, message: 'Không tìm thấy thông tin tài xế' };
    return driver._id;
  }
  return req.query.driverId || req.body.driverId || null;
}

/* ─────────────────────────────────────────────
 * GET /trips/summary/daily
 * KPI hôm nay / ngày bất kỳ
 * ───────────────────────────────────────────── */
router.get('/summary/daily', authenticate, async (req, res, next) => {
  try {
    const driverId = await resolveDriverId(req);
    const dateStr = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

    const dayStart = new Date(dateStr + 'T00:00:00+07:00');
    const dayEnd   = new Date(dateStr + 'T23:59:59+07:00');

    const filter = {
      trip_date: { $gte: dayStart, $lte: dayEnd },
      status: { $ne: 'cancelled' },
    };
    if (driverId) filter.driver_id = driverId;

    const trips = await Trip.find(filter).lean();

    const totalTrips   = trips.length;
    const totalIncome  = trips.reduce((s, t) => s + (t.income  || 0), 0);
    const totalExpense = trips.reduce((s, t) => s + (t.expense || 0), 0);

    // Tính tăng ca: group theo từng tài xế, mỗi tài xế > threshold mới tính TC
    const { getOvertimeConfig } = require('../utils/overtime');
    const { threshold } = await getOvertimeConfig();
    const driverTripCount = {};
    trips.forEach(t => {
      const dId = t.driver_id?.toString() ?? 'unknown';
      driverTripCount[dId] = (driverTripCount[dId] ?? 0) + 1;
    });
    const overtimeTrips = Object.values(driverTripCount).reduce((s, c) => s + Math.max(0, c - threshold), 0);
    const overtimePay = 0; // Admin view: không tính tiền TC ở đây, chỉ đếm số chuyến TC

    res.json({
      success: true,
      data: {
        date: dateStr,
        total_trips:    totalTrips,
        total_income:   totalIncome,
        total_expense:  totalExpense,
        overtime_trips: overtimeTrips,
        overtime_pay:   overtimePay,
        work_hours:     0, // Will be calculated from attendance in Task 7
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
 * GET /trips
 * Danh sách chuyến (phân trang, lọc theo ngày/tháng)
 * ───────────────────────────────────────────── */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const {
      page = 1, limit = 50,
      date, month, year,
      status, sort = '-trip_date',
    } = req.query;

    const driverId = await resolveDriverId(req);
    const filter = {};

    if (driverId) filter.driver_id = driverId;
    if (status)   filter.status   = status;

    // Filter by date — dùng timezone Việt Nam (UTC+7)
    if (date) {
      const VN_OFFSET = 7 * 60 * 60 * 1000;
      const [dy, dm, dd] = date.split('-').map(Number);
      const dayStart = new Date(Date.UTC(dy, dm - 1, dd, 0, 0, 0) - VN_OFFSET);
      const dayEnd   = new Date(Date.UTC(dy, dm - 1, dd, 23, 59, 59) - VN_OFFSET);
      filter.trip_date = { $gte: dayStart, $lte: dayEnd };
    } else if (month && year) {
      // Dùng UTC offset thủ công: VN = UTC+7 = +7*60*60*1000 ms
      const VN_OFFSET = 7 * 60 * 60 * 1000;
      const fromUtc = Date.UTC(parseInt(year), parseInt(month) - 1, 1, 0, 0, 0) - VN_OFFSET;
      const nextM = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
      const nextY = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
      const toUtc = Date.UTC(nextY, nextM - 1, 1, 0, 0, 0) - VN_OFFSET;
      const from = new Date(fromUtc);
      const to   = new Date(toUtc);
      filter.trip_date = { $gte: from, $lt: to };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [trips, total] = await Promise.all([
      Trip.find(filter)
        .populate('driver_id', 'full_name employee_id')
        .populate('vehicle_id', 'license_plate')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Trip.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        trips,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
 * GET /trips/:id
 * ───────────────────────────────────────────── */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id)
      .populate('driver_id', 'full_name employee_id phone')
      .populate('vehicle_id', 'license_plate brand model');

    if (!trip) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy chuyến' });
    }

    // Driver chỉ xem được trip của mình
    if (req.user.role === 'driver') {
      const driver = await Driver.findOne({ user_id: req.user._id });
      if (!driver || trip.driver_id._id.toString() !== driver._id.toString()) {
        return res.status(403).json({ success: false, message: 'Không có quyền xem chuyến này' });
      }
    }

    res.json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
 * POST /trips
 * Tạo chuyến mới — tự động tính tăng ca
 * ───────────────────────────────────────────── */
router.post(
  '/',
  authenticate,
  authorize('driver', 'coordinator', 'manager'),
  [
    body('material_name').trim().notEmpty().withMessage('Tên vật liệu là bắt buộc'),
    body('pickup_location').trim().notEmpty().withMessage('Nơi lấy là bắt buộc'),
    body('drop_location').trim().notEmpty().withMessage('Nơi đổ là bắt buộc'),
    validate,
  ],
  async (req, res, next) => {
    try {
      // Xác định driver & vehicle
      let driverId, vehicleId;

      if (req.user.role === 'driver') {
        const driver = await Driver.findOne({ user_id: req.user._id }).populate('vehicle_id');
        if (!driver) {
          return res.status(400).json({ success: false, message: 'Không tìm thấy thông tin tài xế' });
        }
        driverId  = driver._id;
        vehicleId = driver.vehicle_id?._id;
      } else {
        driverId  = req.body.driver_id;
        vehicleId = req.body.vehicle_id;
      }

      if (!vehicleId) {
        return res.status(400).json({ success: false, message: 'Tài xế chưa được gán xe' });
      }

      // Xác định ngày chuyến
      const tripDate = req.body.trip_date
        ? new Date(req.body.trip_date)
        : new Date();

      if (isNaN(tripDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'trip_date không hợp lệ. Vui lòng gửi định dạng ISO 8601 (VD: 2026-08-21T09:00:00.000Z)',
        });
      }

      // Không cho phép tạo chuyến ngày tương lai
      const todayStr2 = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const tripStr   = tripDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      if (tripStr > todayStr2) {
        return res.status(400).json({
          success: false,
          message: `Không thể tạo chuyến cho ngày ${tripStr} vì ngày chưa đến. Chỉ được tạo chuyến hôm nay (${todayStr2}) hoặc ngày trước đó.`,
        });
      }

      const dateStr  = tripDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const dayStart = new Date(dateStr + 'T00:00:00+07:00');
      const dayEnd   = new Date(dateStr + 'T23:59:59+07:00');

      // Đếm số chuyến hôm nay để tính tăng ca
      const todayCount = await Trip.countDocuments({
        driver_id: driverId,
        trip_date: { $gte: dayStart, $lte: dayEnd },
        status:    { $ne: 'cancelled' },
      });

      const tripNumberToday = todayCount + 1; // chuyến mới là số thứ N+1
      const { isOvertime, overtimePay } = await calcOvertimeForTrip(tripNumberToday);

      const trip = await Trip.create({
        driver_id:           driverId,
        vehicle_id:          vehicleId,
        trip_date:           tripDate,
        material_name:       req.body.material_name,
        quantity:            req.body.quantity != null ? Number(req.body.quantity) : undefined,
        unit:                req.body.unit || undefined,
        pickup_location:     req.body.pickup_location,
        drop_location:       req.body.drop_location,
        income:              Number(req.body.income)  || 0,
        expense:             Number(req.body.expense) || 0,
        note:                req.body.note,
        delivery_receipt:    req.body.delivery_receipt || null,
        gps_latitude:        req.body.gps_latitude,
        gps_longitude:       req.body.gps_longitude,
        status:              'completed',
        trip_number:         tripNumberToday,
        is_overtime:         isOvertime,
        overtime_pay:        overtimePay,
        synced_from_offline: req.body.synced_from_offline || false,
      });

      // Sau khi tạo chuyến, recalculate is_overtime cho toàn bộ chuyến trong ngày
      // để xử lý trường hợp tạo nhiều chuyến gần nhau (race condition)
      const allTripsToday = await Trip.find({
        driver_id:  driverId,
        trip_date:  { $gte: dayStart, $lte: dayEnd },
        status:     { $ne: 'cancelled' },
        is_deleted: { $ne: true },
      }).sort('trip_date').lean();

      const { threshold: ot_threshold, rate: ot_rate } = await getOvertimeConfig();
      for (let i = 0; i < allTripsToday.length; i++) {
        const tripNum = i + 1;
        const isOT = tripNum > ot_threshold;
        if (allTripsToday[i].is_overtime !== isOT || allTripsToday[i].trip_number !== tripNum) {
          await Trip.findByIdAndUpdate(allTripsToday[i]._id, {
            $set: {
              trip_number:  tripNum,
              is_overtime:  isOT,
              overtime_pay: isOT ? ot_rate : 0,
            },
          });
        }
      }

      const updatedTrip = await Trip.findById(trip._id).lean();

      res.status(201).json({
        success: true,
        message: updatedTrip?.is_overtime
          ? `Lưu chuyến thành công! 🔥 Tăng ca chuyến ${updatedTrip.trip_number} (+${(updatedTrip.overtime_pay || 0).toLocaleString('vi-VN')}đ)`
          : 'Lưu chuyến thành công!',
        data: updatedTrip,
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────
 * PUT /trips/:id
 * Cập nhật chuyến (chỉ draft hoặc admin)
 * ───────────────────────────────────────────── */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy chuyến' });
    }

    // Tài xế chỉ sửa được trip chính mình và còn ở trạng thái draft
    if (req.user.role === 'driver') {
      const driver = await Driver.findOne({ user_id: req.user._id });
      if (!driver || trip.driver_id.toString() !== driver._id.toString()) {
        return res.status(403).json({ success: false, message: 'Không có quyền sửa chuyến này' });
      }
      if (trip.status !== 'draft') {
        return res.status(400).json({ success: false, message: 'Chỉ có thể sửa chuyến ở trạng thái nháp' });
      }
    }

    const allowed = [
      'material_name', 'pickup_location', 'drop_location',
      'quantity', 'unit',
      'income', 'expense', 'note', 'delivery_receipt',
      'gps_latitude', 'gps_longitude', 'status',
      'is_overtime',
    ];

    allowed.forEach(f => {
      if (req.body[f] !== undefined) trip[f] = req.body[f];
    });

    // Nếu thay đổi is_overtime → tính lại overtime_pay
    if (req.body.is_overtime !== undefined) {
      const driver = await Driver.findById(trip.driver_id);
      const rate = driver?.overtime_rate ?? 100000;
      trip.overtime_pay = req.body.is_overtime ? rate : 0;
    }

    await trip.save();

    res.json({ success: true, message: 'Cập nhật chuyến thành công', data: trip });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
 * DELETE /trips/:id  (soft delete)
 * ───────────────────────────────────────────── */
router.delete('/:id', authenticate, authorize('coordinator', 'manager'), async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: 'Không tìm thấy chuyến' });

    // Lưu thông tin trước khi xóa để tính lại OT
    const driverId = trip.driver_id;
    const tripDate = trip.trip_date;
    const dateStr = tripDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

    await trip.softDelete(req.user._id);

    // Tính lại is_overtime cho các chuyến còn lại trong ngày
    const dayStart = new Date(dateStr + 'T00:00:00+07:00');
    const dayEnd   = new Date(dateStr + 'T23:59:59+07:00');
    const remainingTrips = await Trip.find({
      driver_id: driverId,
      trip_date: { $gte: dayStart, $lte: dayEnd },
      status: { $ne: 'cancelled' },
      is_deleted: { $ne: true },
    }).sort('trip_date');

    const { getOvertimeConfig } = require('../utils/overtime');
    const { threshold, rate } = await getOvertimeConfig();

    // Cập nhật lại is_overtime và overtime_pay cho từng chuyến
    for (let i = 0; i < remainingTrips.length; i++) {
      const tripNum = i + 1;
      const isOT = tripNum > threshold;
      await Trip.findByIdAndUpdate(remainingTrips[i]._id, {
        $set: {
          is_overtime: isOT,
          overtime_pay: isOT ? rate : 0,
          trip_number: tripNum,
        },
      });
    }

    res.json({ success: true, message: 'Xóa chuyến thành công' });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
 * POST /trips/recalculate-overtime
 * Admin: tính lại is_overtime cho tất cả trips trong DB
 * ───────────────────────────────────────────── */
router.post('/recalculate-overtime', authenticate, authorize('coordinator', 'manager'), async (req, res, next) => {
  try {
    const { getOvertimeConfig } = require('../utils/overtime');
    const { threshold, rate } = await getOvertimeConfig();

    // Lấy tất cả trips chưa xóa, group theo driver + ngày
    const allTrips = await Trip.find({ is_deleted: { $ne: true }, status: { $ne: 'cancelled' } })
      .sort('trip_date')
      .lean();

    // Group by driver_id + dateStr
    const groups = {};
    allTrips.forEach(t => {
      const dateStr = new Date(t.trip_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const key = `${t.driver_id}_${dateStr}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    let updated = 0;
    for (const trips of Object.values(groups)) {
      for (let i = 0; i < trips.length; i++) {
        const tripNum = i + 1;
        const isOT = tripNum > threshold;
        if (trips[i].trip_number !== tripNum || trips[i].is_overtime !== isOT) {
          await Trip.findByIdAndUpdate(trips[i]._id, {
            $set: {
              trip_number:  tripNum,
              is_overtime:  isOT,
              overtime_pay: isOT ? rate : 0,
            },
          });
          updated++;
        }
      }
    }

    res.json({ success: true, message: `Đã recalculate ${updated} chuyến`, updated });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────
 * POST /trips/submit-daily
 * Tài xế chốt báo cáo ngày
 * ───────────────────────────────────────────── */
router.post('/submit-daily', authenticate, authorize('driver', 'coordinator', 'manager'), async (req, res, next) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ success: false, message: 'date là bắt buộc' });

    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver) return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });

    const dayStart = new Date(date + 'T00:00:00+07:00');
    const dayEnd   = new Date(date + 'T23:59:59+07:00');

    await Trip.updateMany(
      { driver_id: driver._id, trip_date: { $gte: dayStart, $lte: dayEnd }, status: 'draft' },
      { $set: { status: 'completed' } }
    );

    res.json({ success: true, message: 'Chốt báo cáo ngày thành công' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
