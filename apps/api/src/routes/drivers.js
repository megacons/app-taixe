const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, query, param } = require('express-validator');
const { Driver, User, Vehicle } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { upload: generalUpload, avatarUpload, getFileUrl } = require('../middleware/upload');
/**
 * GET /drivers
 * Lấy danh sách tài xế (có phân trang, lọc, tìm kiếm)
 */
router.get(
  '/',
  authenticate,
  authorize('coordinator', 'accountant', 'manager'),
  async (req, res, next) => {
    try {
      const {
        page = 1,
        limit = 20,
        search = '',
        status = '',
        sort = '-created_at',
      } = req.query;

      const filter = {};
      if (status) filter.status = status;
      if (search) {
        filter.$or = [
          { full_name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { employee_id: { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [drivers, total] = await Promise.all([
        Driver.find(filter)
          .populate('vehicle_id', 'license_plate brand model')
          .populate('user_id', 'phone status avatar email')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Driver.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: {
          drivers,
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
  }
);

/**
 * GET /drivers/:id
 * Lấy chi tiết tài xế
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    // Tài xế chỉ xem được hồ sơ của mình
    if (req.user.role === 'driver') {
      const driver = await Driver.findOne({ user_id: req.user._id })
        .populate('vehicle_id', 'license_plate brand model status')
        .populate('user_id', 'phone status avatar');

      if (!driver) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin tài xế' });
      }
      return res.json({ success: true, data: driver });
    }

    const driver = await Driver.findById(req.params.id)
      .populate('vehicle_id', 'license_plate brand model status')
      .populate('user_id', 'phone status avatar email');

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });
    }

    res.json({ success: true, data: driver });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /drivers
 * Thêm tài xế mới (tự động tạo User account)
 */
router.post(
  '/',
  authenticate,
  authorize('coordinator', 'manager'),
  [
    body('full_name').trim().notEmpty().withMessage('Họ tên là bắt buộc'),
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Số điện thoại là bắt buộc')
      .matches(/^[0-9]{9,11}$/)
      .withMessage('Số điện thoại không hợp lệ'),
    body('password')
      .optional()
      .isLength({ min: 6 })
      .withMessage('Mật khẩu tối thiểu 6 ký tự'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const {
        full_name,
        phone,
        password = '123456',
        employee_id,
        license_number,
        license_type,
        license_expiry,
        id_card,
        date_of_birth,
        address,
        department,
        position,
        join_date,
        vehicle_id,
        emergency_contact,
      } = req.body;

      // Check phone unique
      const existingUser = await User.findOne({ phone: phone.trim() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Số điện thoại đã được sử dụng',
        });
      }

      // Create User account
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);

      const user = await User.create({
        name: full_name,
        phone: phone.trim(),
        password: hashedPassword,
        role: 'driver',
        status: 'active',
      });

      // Auto-generate employee_id nếu không truyền vào: TX + timestamp 4 số cuối
      let finalEmployeeId = employee_id;
      if (!finalEmployeeId) {
        const count = await Driver.countDocuments();
        finalEmployeeId = `TX${String(count + 1).padStart(3, '0')}`;
        // Đảm bảo unique
        while (await Driver.findOne({ employee_id: finalEmployeeId })) {
          finalEmployeeId = `TX${Date.now().toString().slice(-4)}`;
        }
      } else {
        // Check employee_id unique nếu user truyền vào
        const existingDriver = await Driver.findOne({ employee_id: finalEmployeeId });
        if (existingDriver) {
          return res.status(400).json({ success: false, message: 'Mã nhân viên đã tồn tại' });
        }
      }

      const driver = await Driver.create({
        user_id: user._id,
        full_name,
        phone: phone.trim(),
        employee_id: finalEmployeeId,
        license_number,
        license_type,
        license_expiry,
        id_card,
        date_of_birth,
        address,
        department: department || 'Vận chuyển',
        position: position || 'Tài xế',
        join_date: new Date(), // luôn là ngày tạo tài khoản
        vehicle_id: vehicle_id || null,
        emergency_contact,
        status: 'active',
      });

      // Update user with driver_id
      await User.findByIdAndUpdate(user._id, { driver_id: driver._id });

      // If vehicle assigned, update vehicle
      if (vehicle_id) {
        await Vehicle.findByIdAndUpdate(vehicle_id, { assigned_driver: driver._id });
      }

      const populatedDriver = await Driver.findById(driver._id)
        .populate('vehicle_id', 'license_plate brand model')
        .populate('user_id', 'phone status');

      res.status(201).json({
        success: true,
        message: 'Thêm tài xế thành công',
        data: populatedDriver,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /drivers/:id
 * Cập nhật thông tin tài xế
 */
router.put(
  '/:id',
  authenticate,
  authorize('coordinator', 'manager'),
  async (req, res, next) => {
    try {
      const driver = await Driver.findById(req.params.id);
      if (!driver) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });
      }

      const allowedFields = [
        'full_name', 'phone', 'employee_id', 'license_number',
        'license_type', 'license_expiry', 'id_card', 'date_of_birth',
        'address', 'department', 'position', 'join_date', 'status',
        'emergency_contact',
      ];

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          driver[field] = req.body[field];
        }
      });

      // Handle vehicle assignment change
      if (req.body.vehicle_id !== undefined) {
        const oldVehicleId = driver.vehicle_id?.toString();
        const newVehicleId = req.body.vehicle_id;

        // Remove from old vehicle
        if (oldVehicleId && oldVehicleId !== newVehicleId) {
          await Vehicle.findByIdAndUpdate(oldVehicleId, { assigned_driver: null });
        }

        // Assign to new vehicle
        if (newVehicleId) {
          await Vehicle.findByIdAndUpdate(newVehicleId, { assigned_driver: driver._id });
        }

        driver.vehicle_id = newVehicleId || null;
      }

      // Update user name + email if changed
      if (req.body.full_name || req.body.email !== undefined) {
        const userUpdate = {};
        if (req.body.full_name) userUpdate.name = req.body.full_name;
        if (req.body.email !== undefined) userUpdate.email = req.body.email ? req.body.email.toLowerCase().trim() : null;
        await User.findByIdAndUpdate(driver.user_id, userUpdate);
      }

      await driver.save();

      const updated = await Driver.findById(driver._id)
        .populate('vehicle_id', 'license_plate brand model')
        .populate('user_id', 'phone status avatar email');

      res.json({
        success: true,
        message: 'Cập nhật tài xế thành công',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /drivers/:id
 * Xóa mềm tài xế
 */
router.delete(
  '/:id',
  authenticate,
  authorize('manager'),
  async (req, res, next) => {
    try {
      const driver = await Driver.findById(req.params.id);
      if (!driver) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });
      }

      // Hard delete driver và user liên kết để tránh trùng SĐT khi tạo lại
      const userId = driver.user_id;

      // Release vehicle trước
      if (driver.vehicle_id) {
        await Vehicle.findByIdAndUpdate(driver.vehicle_id, { assigned_driver: null });
      }

      // Xóa hẳn driver và user khỏi DB
      await driver.deleteOne();
      if (userId) {
        await User.findByIdAndDelete(userId);
      }

      res.json({
        success: true,
        message: 'Xóa tài xế thành công',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /drivers/:id/assign-vehicle
 * Gán xe cho tài xế
 */
router.post(
  '/:id/assign-vehicle',
  authenticate,
  authorize('coordinator', 'manager'),
  [
    body('vehicle_id').notEmpty().withMessage('vehicle_id là bắt buộc'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const driver = await Driver.findById(req.params.id);
      if (!driver) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });
      }

      const vehicle = await Vehicle.findById(req.body.vehicle_id);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy xe' });
      }

      // Check if vehicle already assigned to someone else
      if (vehicle.assigned_driver && vehicle.assigned_driver.toString() !== driver._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Xe đã được gán cho tài xế khác',
        });
      }

      // Release old vehicle
      if (driver.vehicle_id) {
        await Vehicle.findByIdAndUpdate(driver.vehicle_id, { assigned_driver: null });
      }

      driver.vehicle_id = vehicle._id;
      await driver.save();

      vehicle.assigned_driver = driver._id;
      await vehicle.save();

      res.json({
        success: true,
        message: 'Gán xe thành công',
        data: {
          driver_id: driver._id,
          vehicle_id: vehicle._id,
          license_plate: vehicle.license_plate,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /drivers/profile/me
 * Tài xế lấy hồ sơ cá nhân của mình
 */
router.get('/profile/me', authenticate, authorize('driver'), async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user_id: req.user._id })
      .populate('vehicle_id', 'license_plate brand model year color capacity chassis_number engine_number inspection_expiry insurance_expiry next_maintenance')
      .lean();
    if (!driver) return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });
    // Merge email từ User vào response
    res.json({ success: true, data: { ...driver, email: req.user.email ?? null } });
  } catch (err) { next(err); }
});

/**
 * PUT /drivers/profile/me
 * Tài xế cập nhật hồ sơ cá nhân
 */
router.put('/profile/me', authenticate, authorize('driver'), async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ tài xế' });
    }

    // Tài xế chỉ được cập nhật một số field nhất định
    const driverAllowed = [
      'address', 'emergency_contact',
      'date_of_birth', 'bank_account', 'bank_name',
      'id_card_image', 'id_card_image_back',
      'phone',
    ];
    driverAllowed.forEach(field => {
      if (req.body[field] !== undefined) {
        driver[field] = req.body[field];
      }
    });

    await driver.save();

    res.json({
      success: true,
      message: 'Cập nhật hồ sơ thành công',
      data: driver,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /drivers/avatar
 * Upload avatar cho tài xế
 */
router.post(
  '/avatar',
  authenticate,
  ...avatarUpload.single('avatar'),  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh' });
      }

      const avatarUrl = getFileUrl(req.file);

      await User.findByIdAndUpdate(req.user._id, { avatar: avatarUrl });

      res.json({
        success: true,
        message: 'Cập nhật avatar thành công',
        data: { avatar: avatarUrl },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
/**
 * GET /drivers/salary/list?month=M&year=Y
 * Lấy danh sách lương + tính chuyến tăng ca trong tháng
 */
router.get('/salary/list', authenticate, authorize('coordinator', 'accountant', 'manager'), async (req, res, next) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    const drivers = await Driver.find({})
      .populate('vehicle_id', 'license_plate')
      .populate('user_id', 'avatar')
      .select('full_name phone employee_id status base_salary position_allowance fuel_allowance overtime_rate salary_note vehicle_id bank_account bank_name user_id')
      .sort('full_name')
      .lean();

    const { Trip, SystemConfig, Request } = require('../models');

    const nextMonth1 = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
    const nextYear1  = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
    const from = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`);
    const to   = new Date(`${nextYear1}-${String(nextMonth1).padStart(2, '0')}-01T00:00:00+07:00`);

    // Aggregate: group by (driver_id, ngày) → tính số chuyến tăng ca mỗi ngày
    const tripAgg = await Trip.aggregate([
      { $match: { trip_date: { $gte: from, $lt: to }, status: { $ne: 'cancelled' }, is_deleted: { $ne: true } } },
      {
        $group: {
          _id: {
            driver_id: '$driver_id',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$trip_date' } },
          },
          daily_trips: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.driver_id',
          days: { $push: { day: '$_id.day', trips: '$daily_trips' } },
          total_trips: { $sum: '$daily_trips' },
        },
      },
    ]);

    const thresholdDoc = await SystemConfig.findOne({ key: 'overtime_threshold' });
    const threshold    = thresholdDoc?.value ?? 4;

    // Map driverId → total_trips (vẫn dùng aggregation để đếm tổng chuyến)
    const tripCountMap = {};
    tripAgg.forEach(row => {
      tripCountMap[row._id.toString()] = row.total_trips;
    });

    // Đếm overtime từ field is_overtime trong DB (đồng bộ với sửa thủ công)
    const overtimeTripsData = await Trip.find({
      trip_date: { $gte: from, $lt: to },
      status: { $ne: 'cancelled' },
      is_overtime: true,
    }).lean();

    // Map driverId → { overtime_trips, overtime_pay }
    const overtimeMap = {};
    overtimeTripsData.forEach(t => {
      const dId = t.driver_id?.toString();
      if (!dId) return;
      if (!overtimeMap[dId]) overtimeMap[dId] = { overtime_trips: 0, overtime_pay: 0 };
      overtimeMap[dId].overtime_trips += 1;
      overtimeMap[dId].overtime_pay += t.overtime_pay || 0;
    });

    // Gắn kết quả tăng ca vào từng driver + tính tiền ứng và tiền chi đã duyệt trong tháng
    // Lấy tất cả salary_advance approved trong tháng của tất cả driver cùng lúc
    const advanceReqs = await Request.find({
      type:       'salary_advance',
      status:     'approved',
      created_at: { $gte: from, $lt: to },
    }).lean();

    // Lấy tất cả expense approved (không giới hạn tháng created_at vì ngày chi là payload.date)
    const expenseReqs = await Request.find({
      type:   'expense',
      status: 'approved',
    }).lean();

    // Map userId → tổng advance
    const advanceMap = {};
    advanceReqs.forEach(r => {
      const uid = r.created_by?.toString();
      if (uid) {
        advanceMap[uid] = (advanceMap[uid] ?? 0) + (r.payload?.amount ?? 0);
      }
    });

    // Map userId → tổng expense trong tháng (lọc theo payload.date)
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const expenseMap = {};
    expenseReqs.forEach(r => {
      const payloadDate = r.payload?.date ?? '';
      if (!payloadDate.startsWith(monthStr)) return;
      const uid = r.created_by?.toString();
      if (uid) {
        expenseMap[uid] = (expenseMap[uid] ?? 0) + (r.payload?.amount ?? 0);
      }
    });

    // Lấy tất cả leave requests approved để tính ngày nghỉ trong tháng
    const { parse: dateParse } = require('date-fns');
    const leaveReqs = await Request.find({
      type:   'leave',
      status: 'approved',
    }).lean();

    // Map driverId → số ngày nghỉ trong tháng (theo payload.start_date)
    const leaveMap = {}; // driverId → số ngày nghỉ
    leaveReqs.forEach(r => {
      const dId = r.driver_id?.toString();
      if (!dId) return;
      const sd = r.payload?.start_date; // dd/MM/yyyy
      if (!sd) return;
      try {
        const startDate = dateParse(sd, 'dd/MM/yyyy', new Date());
        // Kiểm tra thuộc tháng/năm đang xem
        const startMonthStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
        if (startMonthStr !== monthStr) return;
        // Tính số ngày nghỉ
        const dur = r.payload?.duration ?? 'Trong ngày';
        let days = 1;
        if (dur === 'Nhiều ngày' && r.payload?.end_date) {
          try {
            const endDate = dateParse(r.payload.end_date, 'dd/MM/yyyy', new Date());
            days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
          } catch { days = 1; }
        } else if (dur === '1/2 ngày') {
          days = 0.5;
        } else if (dur === '1/4 ngày') {
          days = 0.25;
        } else if (dur === '3/4 ngày') {
          days = 0.75;
        }
        leaveMap[dId] = (leaveMap[dId] ?? 0) + days;
      } catch (_) {}
    });

    const result = drivers.map(d => {
      const dId          = d._id.toString();
      const ot           = overtimeMap[dId] ?? { overtime_trips: 0, overtime_pay: 0 };
      const total_trips  = tripCountMap[dId] ?? 0;
      const uid          = d.user_id?._id?.toString() ?? d.user_id?.toString();
      const advance_month  = advanceMap[uid] ?? 0;
      const expense_month  = expenseMap[uid] ?? 0;
      const leave_days_month = leaveMap[dId] ?? 0;

      // Tính tiền trừ nghỉ phép:
      // Số ngày công trong tháng = số ngày thực của tháng (28/29/30/31)
      const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      // Lương sau nghỉ = base_salary / daysInMonth * (daysInMonth - leave_days)
      const base = d.base_salary ?? 0;
      const leave_deduction = leave_days_month > 0
        ? Math.round(base / daysInMonth * leave_days_month)
        : 0;

      return {
        ...d,
        total_trips_month:    total_trips,
        overtime_trips_month: ot.overtime_trips,
        overtime_pay_month:   ot.overtime_pay,
        advance_month,
        expense_month,
        leave_days_month,
        leave_deduction,
        days_in_month: daysInMonth,
      };
    });

    res.json({ success: true, data: { drivers: result, month, year } });
  } catch (err) { next(err); }
});

/**
 * PUT /drivers/:id/salary
 * Cập nhật lương cơ bản của tài xế
 */
router.put('/:id/salary', authenticate, authorize('accountant', 'manager'), async (req, res, next) => {
  try {
    const { base_salary, position_allowance, fuel_allowance, overtime_rate, note } = req.body;
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });

    if (base_salary        !== undefined) driver.base_salary        = Number(base_salary);
    if (position_allowance !== undefined) driver.position_allowance = Number(position_allowance);
    if (fuel_allowance     !== undefined) driver.fuel_allowance     = Number(fuel_allowance);
    if (overtime_rate      !== undefined) driver.overtime_rate      = Number(overtime_rate);
    if (note               !== undefined) driver.salary_note        = note;

    await driver.save();
    res.json({ success: true, message: 'Cập nhật lương thành công', data: driver });
  } catch (err) { next(err); }
});

module.exports = router;
