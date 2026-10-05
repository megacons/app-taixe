const express = require('express');
const router = express.Router();
const { Notification } = require('../models');
const { authenticate } = require('../middleware/auth');
const https = require('https');

/* ── Expo Push Helper ── */
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
    hostname: 'exp.host', path: '/--/api/v2/push/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'Accept': 'application/json' },
  };
  return new Promise((resolve) => {
    const req = https.request(options, res => {
      let d = '';
      res.on('data', chunk => { d += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', err => { console.warn('[Expo Push] Error:', err.message); resolve(null); });
    req.write(payload);
    req.end();
  });
}

/**
 * GET /notifications
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 30, is_read, type } = req.query;
    const filter = { user_id: req.user._id };
    if (is_read !== undefined) filter.is_read = is_read === 'true';
    if (type) filter.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [notifications, total] = await Promise.all([
      Notification.find(filter).sort('-created_at').skip(skip).limit(parseInt(limit)).lean(),
      Notification.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        notifications,
        total,
        unread: await Notification.countDocuments({ user_id: req.user._id, is_read: false }),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /notifications/:id/read
 */
router.put('/:id/read', authenticate, async (req, res, next) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      { $set: { is_read: true, read_at: new Date() } },
      { new: true }
    );

    // Emit realtime cho admin biết người dùng đã đọc
    if (notif) {
      const io = req.app.get('io');
      if (io) {
        io.to('admin').emit('notification:read', {
          notification_id: String(notif._id),
          user_id:         String(notif.user_id),
          batch_id:        notif.data?.batch_id ?? null,
          read_at:         notif.read_at,
        });
      }
    }

    res.json({ success: true, message: 'Đã đọc thông báo' });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /notifications/read-all
 */
router.put('/read-all', authenticate, async (req, res, next) => {
  try {
    await Notification.updateMany(
      { user_id: req.user._id, is_read: false },
      { $set: { is_read: true, read_at: new Date() } }
    );
    res.json({ success: true, message: 'Đã đọc tất cả thông báo' });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /notifications/fcm-token
 * Lưu FCM token cho push notification
 */
router.put('/fcm-token', authenticate, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'token là bắt buộc' });

    const { User } = require('../models');
    await User.findByIdAndUpdate(req.user._id, { fcm_token: token });

    res.json({ success: true, message: 'Lưu FCM token thành công' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /notifications/broadcast
 * Admin gửi thông báo tới tất cả driver hoặc 1 driver cụ thể
 * Body: multipart/form-data với fields: title, message, type, target_driver_id, file (optional)
 */
router.post('/broadcast', authenticate, async (req, res, next) => {
  try {
    if (!['manager', 'coordinator', 'accountant'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền gửi thông báo' });
    }

    // Handle multipart (có file) hoặc JSON (không có file)
    const multer  = require('multer');
    const path    = require('path');
    const { v4: uuidv4 } = require('uuid');
    const fs      = require('fs');

    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const dir = './uploads/documents';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
      },
    });
    const upload = multer({
      storage,
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    }).single('file');

    await new Promise((resolve, reject) => {
      upload(req, res, err => {
        if (err) reject(err);
        else resolve(null);
      });
    });

    const { title, message, type = 'announcement', target_driver_id, target_user_id, target_ids } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, message: 'Tiêu đề là bắt buộc' });
    if (!message?.trim()) return res.status(400).json({ success: false, message: 'Nội dung là bắt buộc' });

    // Build attachment info nếu có file
    let attachment = null;
    if (req.file) {
      attachment = {
        url:           `/uploads/documents/${req.file.filename}`,
        original_name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
        mime_type:     req.file.mimetype,
        size:          req.file.size,
      };
    }

    const { User, Driver } = require('../models');
    let userIds = [];

    // Ưu tiên: danh sách nhiều người (multi-select)
    const idsArray = target_ids
      ? (Array.isArray(target_ids) ? target_ids : String(target_ids).split(',').filter(Boolean))
      : null;

    if (idsArray && idsArray.length > 0) {
      // Gửi tới danh sách cụ thể — mỗi id có thể là driver._id hoặc user._id
      // Phân loại: tìm drivers có _id trong list → lấy user_id; còn lại dùng trực tiếp
      const drivers = await Driver.find({ _id: { $in: idsArray } }).select('_id user_id').lean();
      const driverIdSet = new Set(drivers.map(d => d._id.toString()));
      const driverUserIds = drivers.map(d => d.user_id);
      const directUserIds = idsArray.filter(id => !driverIdSet.has(id));
      userIds = [...driverUserIds, ...directUserIds];
    } else if (target_user_id) {
      userIds = [target_user_id];
    } else if (target_driver_id) {
      const driver = await Driver.findById(target_driver_id).lean();
      if (!driver) return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế' });
      userIds = [driver.user_id];
    } else {
      const allUsers = await User.find({
        is_deleted: { $ne: true },
        status: 'active',
      }).select('_id').lean();
      userIds = allUsers.map(u => u._id);
    }

    if (!userIds.length) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy người nhận' });
    }

    const { v4: uuidv4_broadcast } = require('uuid');
    const batchId = uuidv4_broadcast();

    const notifications = userIds.map(uid => ({
      user_id:    uid,
      title:      title.trim(),
      message:    message.trim(),
      type,
      attachment: attachment || undefined,
      data: {
        sent_by:      req.user._id,
        sent_by_name: req.user.name,
        target_ids:   idsArray ?? null,
        batch_id:     batchId, // group key cho history
      },
    }));
    await Notification.insertMany(notifications);

    // Gửi Expo Push notification đến tất cả user nhận
    try {
      const { User } = require('../models');
      const usersWithToken = await User.find({
        _id:       { $in: userIds },
        fcm_token: { $ne: null, $exists: true },
      }).select('fcm_token').lean();
      const tokens = usersWithToken.map(u => u.fcm_token).filter(Boolean);
      if (tokens.length > 0) {
        const pushBody = message.trim().replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 100);
        await sendExpoPush(tokens, title.trim(), pushBody, { type: 'broadcast' });
        console.info(`[Push] Broadcast sent to ${tokens.length} devices`);
      }
    } catch (pushErr) {
      console.warn('[Push] Broadcast push failed:', pushErr.message);
    }

    try {
      const io = req.app.get('io');
      if (io) {
        userIds.forEach(uid => {
          io.to(`user_${uid}`).emit('notification', {
            title: title.trim(),
            message: message.trim(),
            type,
            has_attachment: !!attachment,
          });
        });
      }
    } catch (_) {}

    res.json({
      success: true,
      message: `Đã gửi thông báo tới ${userIds.length} người`,
      data: { sent_count: userIds.length, has_attachment: !!attachment },
    });
  } catch (err) { next(err); }
});

/**
 * GET /notifications/broadcast/history
 * Admin xem lịch sử thông báo đã gửi
 */
router.get('/broadcast/history', authenticate, async (req, res, next) => {
  try {
    if (!['manager', 'coordinator', 'accountant'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }
    const { page = 1, limit = 30 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const history = await Notification.aggregate([
      { $match: { 'data.sent_by': { $exists: true } } },
      { $sort: { created_at: -1 } },
      {
        $group: {
          _id:        { $ifNull: ['$data.batch_id', { title: '$title', message: '$message', minute: { $dateToString: { format: '%Y-%m-%dT%H:%M', date: '$created_at' } } }] },
          sent_count: { $sum: 1 },
          read_count: { $sum: { $cond: ['$is_read', 1, 0] } },
          created_at: { $first: '$created_at' },
          title:      { $first: '$title' },
          message:    { $first: '$message' },
          type:       { $first: '$type' },
          attachment: { $first: '$attachment' },
          sent_by:    { $first: '$data.sent_by_name' },
          target_ids: { $first: '$data.target_ids' },
          user_ids:   { $push: '$user_id' },
        },
      },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ]);

    // Resolve tên người nhận cho các thông báo gửi tới 1 hoặc vài người
    const { User } = require('../models');
    const result = await Promise.all(history.map(async h => {
      let sent_to_names = null;
      try {
        const { ObjectId } = require('mongoose').Types;
        const { Driver } = require('../models');
        const toObjIds = (arr) => arr.map(id => {
          try { return new ObjectId(String(id)); } catch { return null; }
        }).filter(Boolean);

        // Lấy user_ids thực tế từ notifications đã gửi
        const actualUserIds = h.user_ids && h.user_ids.length > 0 ? h.user_ids : [];

        if (actualUserIds.length > 0 && actualUserIds.length <= 50) {
          // Tìm tên qua User trực tiếp
          const users = await User.find({ _id: { $in: actualUserIds } }).select('name').lean();
          if (users.length > 0) {
            sent_to_names = users.map(u => u.name);
          } else {
            // Thử tìm qua Driver (user_id field)
            const drivers = await Driver.find({ user_id: { $in: actualUserIds } }).select('full_name').lean();
            if (drivers.length > 0) {
              sent_to_names = drivers.map(d => d.full_name);
            }
          }
        } else if (h.target_ids && h.target_ids.length > 0 && h.target_ids.length <= 50) {
          const ids = toObjIds(h.target_ids);
          const users = await User.find({ _id: { $in: ids } }).select('name').lean();
          if (users.length > 0) {
            sent_to_names = users.map(u => u.name);
          } else {
            const drivers = await Driver.find({ user_id: { $in: ids } }).select('full_name').lean();
            if (drivers.length > 0) sent_to_names = drivers.map(d => d.full_name);
          }
        }
      } catch (_) {}
      return { ...h, sent_to_names };
    }));

    res.json({ success: true, data: { history: result } });
  } catch (err) { next(err); }
});

/**
 * GET /notifications/broadcast/read-status?batchId=xxx
 * Lấy danh sách người nhận + trạng thái đã đọc/chưa đọc
 */
router.get('/broadcast/read-status', authenticate, async (req, res, next) => {
  try {
    if (!['manager', 'coordinator', 'accountant'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

    const { batchId, title, created_at } = req.query;
    if (!batchId && !title) {
      return res.status(400).json({ success: false, message: 'Cần batchId hoặc title' });
    }

    let filter = {};
    if (batchId) {
      filter = { 'data.batch_id': batchId, 'data.sent_by': { $exists: true } };
    } else {
      // Fallback: tìm theo title + thời gian gần nhau (±1 phút)
      const dt = created_at ? new Date(created_at) : new Date();
      const from = new Date(dt); from.setSeconds(0, 0);
      const to   = new Date(dt); to.setSeconds(59, 999);
      filter = { title, created_at: { $gte: from, $lte: to }, 'data.sent_by': { $exists: true } };
    }

    const notifs = await Notification.find(filter)
      .select('user_id is_read read_at')
      .lean();

    const { User } = require('../models');
    const { Driver } = require('../models');

    const userIds = notifs.map(n => n.user_id);
    const users   = await User.find({ _id: { $in: userIds } }).select('name').lean();
    const drivers = await Driver.find({ user_id: { $in: userIds } }).select('full_name user_id').lean();

    const nameMap = {};
    users.forEach(u  => { nameMap[u._id.toString()] = u.name; });
    drivers.forEach(d => {
      if (d.user_id) nameMap[d.user_id.toString()] = d.full_name;
    });

    const recipients = notifs.map(n => ({
      user_id: String(n.user_id),
      name:    nameMap[String(n.user_id)] ?? 'Không rõ',
      is_read: n.is_read,
      read_at: n.read_at ?? null,
    }));

    const read_count = recipients.filter(r => r.is_read).length;

    res.json({ success: true, data: { recipients, read_count, sent_count: recipients.length } });
  } catch (err) { next(err); }
});

/**
 * DELETE /notifications/broadcast/recall
 * Thu hồi thông báo — xóa tất cả notifications có cùng title+message+minute
 * Body: { title, message, created_at }
 */
router.delete('/broadcast/recall', authenticate, async (req, res, next) => {
  try {
    if (!['manager', 'coordinator', 'accountant'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }
    const { title, message, created_at } = req.body;
    if (!title || !message || !created_at) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin để thu hồi' });
    }

    // Tính khoảng thời gian trong cùng phút
    const dt = new Date(created_at);
    const from = new Date(dt); from.setSeconds(0, 0);
    const to   = new Date(dt); to.setSeconds(59, 999);

    const result = await Notification.deleteMany({
      title,
      message,
      created_at: { $gte: from, $lte: to },
    });

    res.json({ success: true, message: `Đã thu hồi ${result.deletedCount} thông báo` });
  } catch (err) { next(err); }
});

/**
 * POST /notifications/push-token
 * Lưu Expo Push Token của user (gọi sau khi đăng nhập)
 */
router.post('/push-token', authenticate, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

    const { User } = require('../models');
    await User.findByIdAndUpdate(req.user._id, { fcm_token: token });
    console.info(`[Push] Token saved for user ${req.user._id}: ${token.slice(0, 30)}...`);
    res.json({ success: true, message: 'Push token saved' });
  } catch (err) { next(err); }
});

module.exports = router;
