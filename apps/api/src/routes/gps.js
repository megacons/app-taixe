const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { GPSLog, Driver, Vehicle } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

/**
 * POST /gps/ping
 * Tài xế gửi vị trí GPS
 */
router.post(
  '/ping',
  authenticate,
  authorize('driver'),
  [
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude không hợp lệ'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude không hợp lệ'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const driver = await Driver.findOne({ user_id: req.user._id }).populate('vehicle_id');
      if (!driver) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });
      }

      // Chỉ ghi log nếu xe có bật GPS tracking
      if (driver.vehicle_id && !driver.vehicle_id.gps_enabled) {
        return res.json({
          success: true,
          message: 'GPS tracking tắt cho xe này',
          data: null,
        });
      }

      const log = await GPSLog.create({
        driver_id:   driver._id,
        vehicle_id:  driver.vehicle_id?._id,
        trip_id:     req.body.trip_id || null,
        latitude:    req.body.latitude,
        longitude:   req.body.longitude,
        accuracy:    req.body.accuracy,
        speed:       req.body.speed,
        heading:     req.body.heading,
        recorded_at: new Date(),
      });

      // Broadcast realtime qua Socket.io
      const io = req.app.get('io');
      if (io) {
        io.emit('gps:update', {
          driver_id:   driver._id,
          vehicle_id:  driver.vehicle_id?._id,
          license_plate: driver.vehicle_id?.license_plate,
          driver_name: driver.full_name,
          latitude:    log.latitude,
          longitude:   log.longitude,
          speed:       log.speed,
          recorded_at: log.recorded_at,
        });

        // Emit theo driver-specific room
        io.to(`driver:${driver._id}`).emit('gps:location', {
          latitude:  log.latitude,
          longitude: log.longitude,
          recorded_at: log.recorded_at,
        });
      }

      res.json({
        success: true,
        message: 'GPS ping thành công',
        data: {
          latitude:   log.latitude,
          longitude:  log.longitude,
          recorded_at: log.recorded_at,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /gps/history/:driverId
 * Lịch sử GPS của tài xế
 */
router.get(
  '/history/:driverId',
  authenticate,
  authorize('coordinator', 'accountant', 'manager'),
  async (req, res, next) => {
    try {
      const { from, to, limit = 500 } = req.query;

      const filter = { driver_id: req.params.driverId };

      if (from || to) {
        filter.recorded_at = {};
        if (from) filter.recorded_at.$gte = new Date(from);
        if (to)   filter.recorded_at.$lte = new Date(to);
      } else {
        // Mặc định lấy 24h gần nhất
        filter.recorded_at = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
      }

      const logs = await GPSLog.find(filter)
        .sort({ recorded_at: 1 })
        .limit(parseInt(limit))
        .select('latitude longitude speed heading accuracy recorded_at')
        .lean();

      res.json({
        success: true,
        data: {
          driver_id: req.params.driverId,
          total: logs.length,
          logs,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /gps/latest
 * Vị trí mới nhất của tất cả tài xế đang hoạt động
 */
router.get(
  '/latest',
  authenticate,
  authorize('coordinator', 'manager'),
  async (req, res, next) => {
    try {
      const since = new Date(Date.now() - 10 * 60 * 1000); // 10 phút gần nhất

      const latest = await GPSLog.aggregate([
        { $match: { recorded_at: { $gte: since } } },
        { $sort: { recorded_at: -1 } },
        {
          $group: {
            _id: '$driver_id',
            lastLog: { $first: '$$ROOT' },
          },
        },
        {
          $lookup: {
            from: 'drivers',
            localField: '_id',
            foreignField: '_id',
            as: 'driver',
          },
        },
        {
          $lookup: {
            from: 'vehicles',
            localField: 'lastLog.vehicle_id',
            foreignField: '_id',
            as: 'vehicle',
          },
        },
        {
          $project: {
            driver_id: '$_id',
            driver_name:   { $arrayElemAt: ['$driver.full_name', 0] },
            license_plate: { $arrayElemAt: ['$vehicle.license_plate', 0] },
            latitude:    '$lastLog.latitude',
            longitude:   '$lastLog.longitude',
            speed:       '$lastLog.speed',
            recorded_at: '$lastLog.recorded_at',
          },
        },
      ]);

      res.json({ success: true, data: { drivers: latest, total: latest.length } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
