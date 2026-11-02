const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { Request, RequestHistory, Notification, Driver } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const https = require('https');

/* ── Expo Push Helper ─────────────────────────────────── */
async function sendExpoPush(tokens, title, body, data = {}) {
  const valid = (tokens || []).filter(t => t && String(t).startsWith('ExponentPushToken'));
  if (valid.length === 0) return;

  const messages = valid.map(to => ({
    to,
    title,
    body,
    data,
    sound:     'default',
    priority:  'high',
    channelId: 'requests',
    ttl:       86400,
    badge:     1,
  }));

  const payload = JSON.stringify(messages);
  const options = {
    hostname: 'exp.host',
    path:     '/--/api/v2/push/send',
    method:   'POST',
    headers:  {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Accept':         'application/json',
    },
  };

  return new Promise((resolve) => {
    const req = https.request(options, res => {
      let d = '';
      res.on('data', chunk => { d += chunk; });
      res.on('end', () => {
        console.info('[Expo Push] Sent to', valid.length, 'devices');
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.on('error', err => {
      console.warn('[Expo Push] Error:', err.message);
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
}

const REQUEST_TYPES = [
  'salary_advance', 'reward', 'discipline',
  'attendance_adjustment', 'leave', 'expense',
  'purchase', 'additional_trip', 'trip_delete',
];

/**
 * GET /requests
 * Danh sách yêu cầu — tài xế xem của mình, admin xem tất cả
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 50, type, status, driverId } = req.query;

    const filter = {};
    if (type)   filter.type   = type;
    if (status) filter.status = status;

    if (req.user.role === 'driver' || req.user.role === 'employee' || req.user.role === 'coordinator') {
      // User thường chỉ xem được requests của chính mình
      filter.created_by = req.user._id;
    } else if (driverId) {
      const driver = await Driver.findById(driverId);
      if (driver) filter.created_by = driver.user_id;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [requests, total] = await Promise.all([
      Request.find(filter)
        .populate('created_by', 'name phone')
        .populate('approved_by', 'name')
        .sort('-created_at')
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Request.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        requests,
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

/**
 * GET /requests/leave-balance
 * Tính số ngày phép còn lại trong năm của tài xế
 * Logic: mỗi tháng không có leave request được duyệt = +1 ngày tích lũy, reset đầu năm
 */
router.get('/leave-balance', authenticate, async (req, res, next) => {
  try {
    const { parse, isAfter, isBefore, startOfMonth, endOfMonth, getMonth, getYear, differenceInMonths } = require('date-fns');

    const driver = await Driver.findOne({ user_id: req.user._id }).lean();
    if (!driver) {
      return res.json({ success: true, data: { balance_days: 0, accrued_days: 0, used_days: 0, year: new Date().getFullYear(), hire_date: null, leave_months: [] } });
    }

    const hireDate = driver.hire_date ?? driver.join_date ?? new Date(new Date().getFullYear(), 0, 1);
    const hireDateObj = hireDate instanceof Date ? hireDate : new Date(hireDate);

    const now       = new Date();
    const thisYear  = getYear(now);
    const yearStart = new Date(thisYear, 0, 1);
    const calcFrom  = isAfter(hireDateObj, yearStart) ? hireDateObj : yearStart;

    // Lấy tất cả leave requests đã duyệt của driver trong năm nay
    const approved = await Request.find({
      driver_id: driver._id,
      type:      'leave',
      status:    'approved',
    }).lean();

    // Parse start_date (dd/MM/yyyy) sang Date để xác định tháng
    const approvedMonths = new Set();
    approved.forEach(r => {
      const sd = r.payload?.start_date;
      if (!sd) return;
      try {
        const d = parse(sd, 'dd/MM/yyyy', new Date());
        if (getYear(d) === thisYear) {
          approvedMonths.add(getMonth(d)); // 0-indexed
        }
      } catch (_) {}
    });

    // Đếm số tháng từ calcFrom đến tháng trước hiện tại mà không có phép
    let accruedDays = 0;
    const startMonth = getMonth(calcFrom);
    const startYear  = getYear(calcFrom);
    const currentMonth = getMonth(now);

    for (let m = 0; m < currentMonth; m++) {
      // Bỏ qua tháng trước khi vào làm
      if (thisYear === startYear && m < startMonth) continue;
      if (!approvedMonths.has(m)) accruedDays++;
    }

    // Đếm số ngày đã nghỉ phép năm được duyệt
    let usedDays = 0;
    approved.forEach(r => {
      const sd = r.payload?.start_date;
      const ed = r.payload?.end_date;
      if (!sd) return;
      try {
        const d = parse(sd, 'dd/MM/yyyy', new Date());
        if (getYear(d) !== thisYear) return;
        // Chỉ tính "Nghỉ phép năm"
        if (r.payload?.leave_type !== 'Nghỉ phép năm') return;
        const dur = r.payload?.duration ?? 'Trong ngày';
        if (dur === 'Nhiều ngày' && ed) {
          try {
            const endD = parse(ed, 'dd/MM/yyyy', new Date());
            const days = Math.round((endD.getTime() - d.getTime()) / 86400000) + 1;
            usedDays += days;
          } catch { usedDays += 1; }
        } else if (dur === '1/2 ngày') {
          usedDays += 0.5;
        } else if (dur === '1/4 ngày') {
          usedDays += 0.25;
        } else if (dur === '3/4 ngày') {
          usedDays += 0.75;
        } else {
          usedDays += 1;
        }
      } catch (_) {}
    });

    res.json({
      success: true,
      data: {
        balance_days:   Math.max(0, accruedDays - usedDays),
        accrued_days:   accruedDays,
        used_days:      usedDays,
        year:           thisYear,
        hire_date:      hireDateObj,
        leave_months:   Array.from(approvedMonths),
      },
    });
  } catch (err) { next(err); }
});

/**
 * GET /requests/:id
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('created_by', 'name phone avatar')
      .populate('approved_by', 'name phone');

    if (!request) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu' });
    }

    // Tài xế/Nhân viên/Điều phối chỉ xem được request của mình
    const isRegularUser = ['driver', 'employee', 'coordinator'].includes(req.user.role);
    if (isRegularUser && request.created_by._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem yêu cầu này' });
    }

    // Lấy lịch sử
    const history = await RequestHistory.find({ request_id: request._id })
      .populate('action_by', 'name')
      .sort('created_at')
      .lean();

    res.json({ success: true, data: { ...request.toObject(), history } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /requests
 * Tài xế tạo yêu cầu mới
 */
router.post(
  '/',
  authenticate,
  authorize('driver', 'coordinator', 'manager'),
  [
    body('type').isIn(REQUEST_TYPES).withMessage('Loại yêu cầu không hợp lệ'),
    body('title').trim().notEmpty().withMessage('Tiêu đề là bắt buộc'),
    body('payload').notEmpty().withMessage('Payload là bắt buộc'),
    validate,
  ],
  async (req, res, next) => {
    try {
      // Tìm driver liên quan
      const driver = await Driver.findOne({ user_id: req.user._id });

      const request = await Request.create({
        type:       req.body.type,
        title:      req.body.title,
        created_by: req.user._id,
        driver_id:  driver?._id,
        payload:    req.body.payload,
        status:     'pending',
        timeline: [{
          action: 'created',
          by:     req.user._id,
          at:     new Date(),
        }],
      });

      // Emit realtime cho admin
      const io = req.app.get('io');
      if (io) {
        const payload = {
          _id:         request._id,
          type:        request.type,
          title:       request.title,
          status:      'pending',
          driver_name: driver?.full_name ?? req.user.name ?? 'Tài xế',
          created_at:  new Date(),
        };
        io.to('admin').emit('new:request', payload);
        console.info('[Socket] Emitted new:request to admin room:', payload.title);
      }

      // Gửi Expo Push đến tất cả admin/coordinator/accountant
      try {
        const { User } = require('../models');
        const admins = await User.find({
          role:       { $in: ['manager', 'coordinator', 'accountant'] },
          fcm_token:  { $ne: null },
        }).select('fcm_token').lean();
        const tokens = admins.map(a => a.fcm_token).filter(Boolean);
        console.info(`[Push] Found ${admins.length} admins, ${tokens.length} with tokens`);
        tokens.forEach((t, i) => console.info(`[Push] Token ${i+1}: ${String(t).slice(0,40)}...`));
        const typeName = {
          salary_advance: 'Tạm ứng lương', expense: 'Chi phí',
          leave: 'Nghỉ phép', purchase: 'Mua hàng',
          additional_trip: 'Thêm chuyến', attendance_adjustment: 'Điều chỉnh công',
          trip_delete: 'Xóa chuyến',
        }[request.type] ?? 'Yêu cầu';
        await sendExpoPush(
          tokens,
          `🔔 Yêu cầu mới — ${typeName}`,
          `${driver?.full_name ?? 'Tài xế'}: ${request.title}`,
          { type: 'new_request', request_id: String(request._id) }
        );
      } catch (pushErr) {
        console.warn('[Push] Failed:', pushErr.message);
      }

      res.status(201).json({
        success: true,
        message: 'Gửi yêu cầu thành công. Đang chờ duyệt.',
        data: request,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /requests/:id/approve
 * Duyệt yêu cầu — coordinator duyệt vận hành, accountant duyệt tài chính, manager duyệt tất cả
 */
router.put(
  '/:id/approve',
  authenticate,
  authorize('coordinator', 'accountant', 'manager'),
  async (req, res, next) => {
    try {
      const request = await Request.findById(req.params.id)
        .populate('created_by', 'name fcm_token');

      if (!request) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu' });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Yêu cầu đang ở trạng thái "${request.status}", không thể duyệt`,
        });
      }

      // Kiểm tra phân quyền theo loại yêu cầu
      const FINANCIAL_TYPES = ['salary_advance', 'expense', 'purchase', 'reward', 'discipline'];
      const OPERATIONAL_TYPES = ['attendance_adjustment', 'leave', 'additional_trip', 'trip_delete'];

      if (req.user.role === 'coordinator' && FINANCIAL_TYPES.includes(request.type)) {
        return res.status(403).json({
          success: false,
          message: 'Điều phối không có quyền duyệt yêu cầu tài chính',
        });
      }
      if (req.user.role === 'accountant' && OPERATIONAL_TYPES.includes(request.type)) {
        return res.status(403).json({
          success: false,
          message: 'Kế toán không có quyền duyệt yêu cầu vận hành',
        });
      }

      const oldStatus = request.status;
      request.status      = 'approved';
      request.approved_by = req.user._id;
      request.approved_at = new Date();

      request.timeline.push({
        action:  'approved',
        by:      req.user._id,
        at:      new Date(),
        comment: req.body.comment,
      });

      await request.save();

      // ── Khi duyệt yêu cầu xóa chuyến (trip_delete) → soft delete các trip ──
      if (request.type === 'trip_delete') {
        try {
          const { Trip } = require('../models');
          const tripIds = request.payload?.trip_ids ?? [];
          if (tripIds.length > 0) {
            await Trip.updateMany(
              { _id: { $in: tripIds } },
              { $set: { deleted_at: new Date(), status: 'cancelled' } }
            );
            console.info(`[trip_delete] Soft-deleted ${tripIds.length} trips on approve`);
          }
        } catch (delErr) {
          console.warn('[trip_delete] Error deleting trips:', delErr.message);
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      // ── Khi duyệt yêu cầu chi (expense) → check balance + tự động tạo FundEntry ──
      if (request.type === 'expense' && request.driver_id) {
        try {
          const mongoose = require('mongoose');
          const FundEntry = mongoose.models.FundEntry;

          if (FundEntry) {
            const amount = request.payload?.amount ?? 0;
            const expenseDate = request.payload?.date
              ?? new Date().toISOString().slice(0, 10);
            const month = expenseDate.slice(0, 7); // 'YYYY-MM'

            // ── Check balance trước khi duyệt ──────────────────────────────
            const allEntries = await FundEntry.find({
              driver_id: request.driver_id,
              month,
            }).lean();
            const totalAdvance = allEntries.reduce((s, e) => s + (e.advance || 0), 0);
            const totalExpense = allEntries.reduce((s, e) => s + (e.expense || 0), 0);
            const currentBalance = totalAdvance - totalExpense;

            if (currentBalance < amount) {
              // Vẫn duyệt được nhưng trả về warning để frontend hiển thị
              request._insufficientFund = true;
              request._balanceInfo = {
                current_balance: currentBalance,
                required: amount,
                shortage: amount - currentBalance,
                driver_id: String(request.driver_id),
              };
            }
            // ───────────────────────────────────────────────────────────────

            // Tìm entry ngày đó, cộng dồn nếu có
            const existing = await FundEntry.findOne({
              driver_id: request.driver_id,
              date:      expenseDate,
            });

            if (existing) {
              existing.expense += amount;
              if (request.payload?.note) {
                existing.note = existing.note
                  ? `${existing.note}; ${request.payload.note}`
                  : request.payload.note;
              }
              await existing.save();
            } else {
              await FundEntry.create({
                driver_id:  request.driver_id,
                date:       expenseDate,
                month,
                advance:    0,
                expense:    amount,
                note:       request.payload?.note ?? request.title ?? '',
                created_by: req.user._id,
              });
            }
          }
        } catch (fundErr) {
          console.warn('FundEntry create error:', fundErr.message);
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      // Ghi RequestHistory
      await RequestHistory.create({
        request_id: request._id,
        type:       request.type,
        action:     'approved',
        old_status: oldStatus,
        new_status: 'approved',
        comment:    req.body.comment,
        action_by:  req.user._id,
      });

      // Tạo Notification cho tài xế
      if (request.driver_id) {
        const driver = await Driver.findById(request.driver_id);
        if (driver) {
          await Notification.create({
            user_id:   request.created_by._id,
            driver_id: driver._id,
            title:     '✅ Yêu cầu đã được duyệt',
            message:   `Yêu cầu "${request.title}" đã được duyệt.`,
            type:      'request_approved',
            data:      { request_id: request._id, type: request.type },
          });
        }
      }

      // Push FCM notification (nếu có token)
      const fcmToken = request.created_by?.fcm_token;
      if (fcmToken) {
        await sendFCMNotification(req.app, fcmToken, {
          title:   '✅ Yêu cầu được duyệt',
          body:    `"${request.title}" đã được duyệt.`,
          data:    { request_id: request._id.toString(), type: request.type },
        });
      }

      // Socket.io realtime
      const io = req.app.get('io');
      if (io) {
        // Emit cho user biết request của họ được duyệt
        const ownerId = request.created_by?._id ?? request.created_by;
        io.to(`user_${ownerId}`).emit('request:approved', {
          _id:   request._id,
          type:  request.type,
          title: request.title,
        });
        // Emit cho admin room cập nhật list
        io.to('admin').emit('request:updated', {
          _id:    request._id,
          status: 'approved',
        });
      }

      // Gửi Expo Push đến tài xế
      try {
        const { User } = require('../models');
        const owner = await User.findById(request.created_by).select('fcm_token').lean();
        if (owner?.fcm_token) {
          await sendExpoPush(
            [owner.fcm_token],
            '✅ Yêu cầu được duyệt',
            `"${request.title}" đã được duyệt.`,
            { type: 'request_approved', request_id: String(request._id) }
          );
        }
      } catch (_) {}

      res.json({
        success: true,
        message: 'Duyệt yêu cầu thành công',
        data: request,
        insufficient_fund: request._insufficientFund ? {
          warning:         'Quỹ tài xế không đủ để chi',
          current_balance: request._balanceInfo.current_balance,
          required:        request._balanceInfo.required,
          shortage:        request._balanceInfo.shortage,
          driver_id:       request._balanceInfo.driver_id,
        } : null,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /requests/:id/reject
 * Từ chối yêu cầu
 */
router.put(
  '/:id/reject',
  authenticate,
  authorize('coordinator', 'accountant', 'manager'),
  [
    body('rejection_reason').trim().notEmpty().withMessage('Lý do từ chối là bắt buộc'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const request = await Request.findById(req.params.id)
        .populate('created_by', 'name fcm_token');

      if (!request) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu' });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Yêu cầu đang ở trạng thái "${request.status}", không thể từ chối`,
        });
      }

      const oldStatus = request.status;
      request.status           = 'rejected';
      request.rejection_reason = req.body.rejection_reason;

      request.timeline.push({
        action:  'rejected',
        by:      req.user._id,
        at:      new Date(),
        comment: req.body.rejection_reason,
      });

      await request.save();

      await RequestHistory.create({
        request_id: request._id,
        type:       request.type,
        action:     'rejected',
        old_status: oldStatus,
        new_status: 'rejected',
        comment:    req.body.rejection_reason,
        action_by:  req.user._id,
      });

      // Notification
      if (request.driver_id) {
        const driver = await Driver.findById(request.driver_id);
        if (driver) {
          await Notification.create({
            user_id:   request.created_by._id,
            driver_id: driver._id,
            title:     '❌ Yêu cầu bị từ chối',
            message:   `Yêu cầu "${request.title}" bị từ chối. Lý do: ${req.body.rejection_reason}`,
            type:      'request_rejected',
            data:      { request_id: request._id, type: request.type },
          });
        }
      }

      // FCM
      const fcmToken = request.created_by?.fcm_token;
      if (fcmToken) {
        await sendFCMNotification(req.app, fcmToken, {
          title: '❌ Yêu cầu bị từ chối',
          body:  `"${request.title}" bị từ chối: ${req.body.rejection_reason}`,
          data:  { request_id: request._id.toString(), type: request.type },
        });
      }

      const io = req.app.get('io');
      if (io) {
        const ownerId = request.created_by?._id ?? request.created_by;
        io.to(`user_${ownerId}`).emit('request:rejected', {
          _id:    request._id,
          type:   request.type,
          title:  request.title,
          reason: req.body.rejection_reason,
        });
        io.to('admin').emit('request:updated', {
          _id:    request._id,
          status: 'rejected',
        });
      }

      // Gửi Expo Push đến tài xế
      try {
        const { User } = require('../models');
        const owner = await User.findById(request.created_by).select('fcm_token').lean();
        if (owner?.fcm_token) {
          await sendExpoPush(
            [owner.fcm_token],
            '❌ Yêu cầu bị từ chối',
            `"${request.title}" bị từ chối.${req.body.rejection_reason ? ` Lý do: ${req.body.rejection_reason}` : ''}`,
            { type: 'request_rejected', request_id: String(request._id) }
          );
        }
      } catch (_) {}

      res.json({
        success: true,
        message: 'Từ chối yêu cầu thành công',
        data: request,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /requests/:id
 * Admin cập nhật payload của request (sửa số tiền sai)
 */
router.put(
  '/:id',
  authenticate,
  authorize('coordinator', 'accountant', 'manager'),
  async (req, res, next) => {
    try {
      const request = await Request.findById(req.params.id);
      if (!request) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu' });
      }
      if (req.body.payload) {
        request.payload = { ...request.payload, ...req.body.payload };
      }
      if (req.body.title) request.title = req.body.title;
      await request.save();
      res.json({ success: true, message: 'Cập nhật thành công', data: request });
    } catch (err) { next(err); }
  }
);

/**
 * GET /requests/pending/count
 * Đếm số yêu cầu chờ duyệt (cho dashboard admin)
 */
router.get('/pending/count', authenticate, authorize('coordinator', 'accountant', 'manager'), async (req, res, next) => {
  try {
    const count = await Request.countDocuments({ status: 'pending' });
    res.json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
});

/* ─── Helper: Send FCM ─── */
async function sendFCMNotification(app, token, { title, body, data }) {
  try {
    const admin = app.get('firebaseAdmin');
    if (!admin || !token) return;

    await admin.messaging().send({
      token,
      notification: { title, body },
      data: data || {},
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  } catch (err) {
    console.warn('FCM send error:', err.message);
  }
}

/**
 * DELETE /requests/:id
 * Xóa 1 yêu cầu (chỉ manager/coordinator, hoặc chính chủ nếu còn pending)
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu' });

    const isAdmin = ['manager', 'coordinator', 'accountant'].includes(req.user.role);
    const isOwner = request.created_by?.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Không có quyền xóa' });
    }

    // Chủ sở hữu chỉ xóa được khi còn pending
    if (!isAdmin && isOwner && request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Chỉ có thể xóa yêu cầu đang chờ duyệt' });
    }

    await request.deleteOne();

    // ── Nếu xóa expense đã approved → rollback FundEntry ──
    if (request.type === 'expense' && request.status === 'approved' && request.driver_id) {
      try {
        const mongoose = require('mongoose');
        const FundEntry = mongoose.models.FundEntry;
        if (FundEntry) {
          const amount = request.payload?.amount ?? 0;
          const expenseDate = request.payload?.date ?? new Date().toISOString().slice(0, 10);
          const entry = await FundEntry.findOne({ driver_id: request.driver_id, date: expenseDate });
          if (entry) {
            entry.expense = Math.max(0, entry.expense - amount);
            await entry.save();
          }
        }
      } catch (e) {
        console.warn('FundEntry rollback error:', e.message);
      }
    }

    res.json({ success: true, message: 'Đã xóa yêu cầu' });
  } catch (err) { next(err); }
});

module.exports = router;
