const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { Vehicle, Driver } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

/**
 * GET /vehicles
 * Lấy danh sách xe
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
          { license_plate: { $regex: search, $options: 'i' } },
          { brand: { $regex: search, $options: 'i' } },
          { model: { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [vehicles, total] = await Promise.all([
        Vehicle.find(filter)
          .populate('assigned_driver', 'full_name phone employee_id')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Vehicle.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: {
          vehicles,
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
 * GET /vehicles/:id
 * Lấy chi tiết xe
 */
router.get(
  '/:id',
  authenticate,
  authorize('coordinator', 'accountant', 'manager'),
  async (req, res, next) => {
    try {
      const vehicle = await Vehicle.findById(req.params.id).populate(
        'assigned_driver',
        'full_name phone employee_id'
      );

      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy xe' });
      }

      res.json({ success: true, data: vehicle });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /vehicles
 * Thêm xe mới
 */
router.post(
  '/',
  authenticate,
  authorize('coordinator', 'manager'),
  [
    body('license_plate')
      .trim()
      .notEmpty()
      .withMessage('Biển số xe là bắt buộc')
      .matches(/^[0-9]{2}[A-Z]{1,2}-?[0-9]{4,5}$/)
      .withMessage('Biển số xe không hợp lệ (VD: 51C-12345)'),
    body('vehicle_type').optional().isIn(['truck', 'dump_truck', 'trailer', 'pickup', 'other']),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { license_plate } = req.body;

      // Check license plate unique
      const existing = await Vehicle.findOne({
        license_plate: license_plate.trim().toUpperCase().replace('-', ''),
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Biển số xe đã tồn tại',
        });
      }

      const vehicle = await Vehicle.create({
        ...req.body,
        license_plate: license_plate.trim().toUpperCase(),
      });

      res.status(201).json({
        success: true,
        message: 'Thêm xe thành công',
        data: vehicle,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /vehicles/:id
 * Cập nhật xe
 */
router.put(
  '/:id',
  authenticate,
  authorize('coordinator', 'manager'),
  async (req, res, next) => {
    try {
      const vehicle = await Vehicle.findById(req.params.id);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy xe' });
      }

      const allowedFields = [
        'vehicle_type', 'brand', 'model', 'year', 'capacity', 'status',
        'registration_date', 'insurance_expiry', 'last_maintenance',
        'next_maintenance', 'notes', 'gps_enabled',
      ];

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          vehicle[field] = req.body[field];
        }
      });

      // If license plate changed, check unique
      if (req.body.license_plate && req.body.license_plate !== vehicle.license_plate) {
        const existing = await Vehicle.findOne({
          license_plate: req.body.license_plate.trim().toUpperCase(),
          _id: { $ne: vehicle._id },
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            message: 'Biển số xe đã tồn tại',
          });
        }

        vehicle.license_plate = req.body.license_plate.trim().toUpperCase();
      }

      await vehicle.save();

      const updated = await Vehicle.findById(vehicle._id).populate(
        'assigned_driver',
        'full_name phone employee_id'
      );

      res.json({
        success: true,
        message: 'Cập nhật xe thành công',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /vehicles/:id
 * Xóa mềm xe
 */
router.delete(
  '/:id',
  authenticate,
  authorize('manager'),
  async (req, res, next) => {
    try {
      const vehicle = await Vehicle.findById(req.params.id);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy xe' });
      }

      // Check if vehicle has assigned driver
      if (vehicle.assigned_driver) {
        return res.status(400).json({
          success: false,
          message: 'Xe đang được gán cho tài xế. Vui lòng gỡ gán trước khi xóa.',
        });
      }

      await vehicle.softDelete(req.user._id);

      res.json({
        success: true,
        message: 'Xóa xe thành công',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /vehicles/:id/assign-driver
 * Gán tài xế cho xe
 */
router.post(
  '/:id/assign-driver',
  authenticate,
  authorize('coordinator', 'manager'),
  [
    body('driver_id').notEmpty().withMessage('driver_id là bắt buộc'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const vehicle = await Vehicle.findById(req.params.id);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy xe' });
      }

      const driver = await Driver.findById(req.body.driver_id);
      if (!driver) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });
      }

      // Release old vehicle from driver
      if (driver.vehicle_id) {
        await Vehicle.findByIdAndUpdate(driver.vehicle_id, { assigned_driver: null });
      }

      // Release old driver from vehicle
      if (vehicle.assigned_driver) {
        await Driver.findByIdAndUpdate(vehicle.assigned_driver, { vehicle_id: null });
      }

      vehicle.assigned_driver = driver._id;
      await vehicle.save();

      driver.vehicle_id = vehicle._id;
      await driver.save();

      res.json({
        success: true,
        message: 'Gán tài xế thành công',
        data: {
          vehicle_id: vehicle._id,
          driver_id: driver._id,
          license_plate: vehicle.license_plate,
          driver_name: driver.full_name,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /vehicles/:id/unassign-driver
 * Gỡ gán tài xế khỏi xe
 */
router.post(
  '/:id/unassign-driver',
  authenticate,
  authorize('coordinator', 'manager'),
  async (req, res, next) => {
    try {
      const vehicle = await Vehicle.findById(req.params.id);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy xe' });
      }

      if (!vehicle.assigned_driver) {
        return res.status(400).json({
          success: false,
          message: 'Xe chưa được gán cho tài xế nào',
        });
      }

      await Driver.findByIdAndUpdate(vehicle.assigned_driver, { vehicle_id: null });

      vehicle.assigned_driver = null;
      await vehicle.save();

      res.json({
        success: true,
        message: 'Gỡ gán tài xế thành công',
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
