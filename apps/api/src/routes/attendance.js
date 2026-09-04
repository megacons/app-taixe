const express = require('express');
const router  = express.Router();
const { Attendance } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { attendanceUpload, getFileUrl } = require('../middleware/upload');

// Multer middleware cho ảnh chấm công (Cloudinary)
const upload = attendanceUpload.single('photo');
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * POST /attendance/checkin
 * Chấm vào ca — kèm ảnh. Cho phép chấm vào lại nhiều lần trong ngày.
 */
router.post('/checkin', authenticate, async (req, res, next) => {
  try {
    await new Promise((resolve, reject) => {
      const [multerMw, cloudinaryMw] = upload;
      multerMw(req, res, (err) => {
        if (err) return reject(err);
        cloudinaryMw(req, res, (err2) => err2 ? reject(err2) : resolve(null));
      });
    });

    const date = req.body.date || todayStr();
    let photoUrl = null;
    if (req.file) photoUrl = getFileUrl(req.file);

    // Location metadata (optional)
    const latitude  = req.body.latitude  ? parseFloat(req.body.latitude)  : null;
    const longitude = req.body.longitude ? parseFloat(req.body.longitude) : null;
    const address   = req.body.address   || null;

    let att = await Attendance.findOne({ user_id: req.user._id, date });

    if (att) {
      // Kiểm tra session đang mở (check_in nhưng chưa check_out)
      // Fallback cho dữ liệu cũ: nếu sessions rỗng, dùng status tổng hợp
      let openSession = null;
      if (att.sessions && att.sessions.length > 0) {
        openSession = att.sessions.find(s => s.check_in_time && !s.check_out_time);
      } else if (att.check_in_time && !att.check_out_time) {
        // Dữ liệu cũ: đang trong ca (check_in có, check_out chưa)
        return res.status(400).json({ success: false, message: 'Bạn đang trong ca, hãy chấm ra trước' });
      }
      // Nếu có open session → không cho checkin thêm
      if (openSession) {
        return res.status(400).json({ success: false, message: 'Bạn đang trong ca, hãy chấm ra trước' });
      }

      // Tạo session mới (cho phép vào lại sau khi đã ra)
      att.sessions.push({
        check_in_time:  new Date(),
        check_out_time: null,
        check_in_photo: photoUrl,
        check_in_lat:   latitude,
        check_in_lng:   longitude,
        check_in_addr:  address,
      });
      att.status         = 'checked_in';
      // Cập nhật fields tổng hợp (compat)
      if (!att.check_in_time) {
        att.check_in_time  = new Date();
        att.check_in_photo = photoUrl;
        att.check_in_lat   = latitude;
        att.check_in_lng   = longitude;
        att.check_in_addr  = address;
      }
      await att.save();
      return res.json({ success: true, message: 'Chấm vào ca thành công', data: att });
    }

    // Tạo mới
    att = await Attendance.create({
      user_id:        req.user._id,
      date,
      sessions: [{
        check_in_time:  new Date(),
        check_out_time: null,
        check_in_photo: photoUrl,
        check_in_lat:   latitude,
        check_in_lng:   longitude,
        check_in_addr:  address,
      }],
      check_in_time:  new Date(),
      check_in_photo: photoUrl,
      check_in_lat:   latitude,
      check_in_lng:   longitude,
      check_in_addr:  address,
      status:         'checked_in',
    });

    res.json({ success: true, message: 'Chấm vào ca thành công', data: att });
  } catch (err) { next(err); }
});

/**
 * POST /attendance/checkout
 * Chấm ra ca — đóng session đang mở
 */
router.post('/checkout', authenticate, async (req, res, next) => {
  try {
    const date = req.body.date || todayStr();
    const att  = await Attendance.findOne({ user_id: req.user._id, date });

    if (!att) {
      return res.status(400).json({ success: false, message: 'Bạn chưa chấm vào ca' });
    }

    // Fallback cho dữ liệu cũ không có sessions
    if (!att.sessions || att.sessions.length === 0) {
      if (!att.check_in_time) {
        return res.status(400).json({ success: false, message: 'Bạn chưa chấm vào ca' });
      }
      if (att.check_out_time) {
        return res.status(400).json({ success: false, message: 'Bạn chưa có ca nào đang mở' });
      }
      att.check_out_time = new Date();
      att.status         = 'checked_out';
      await att.save();
      return res.json({ success: true, message: 'Chấm ra ca thành công', data: att });
    }

    // Tìm session đang mở (có check_in, chưa check_out)
    const openIdx = att.sessions.findIndex(s => s.check_in_time && !s.check_out_time);
    if (openIdx === -1) {
      return res.status(400).json({ success: false, message: 'Bạn chưa có ca nào đang mở' });
    }

    att.sessions[openIdx].check_out_time = new Date();
    att.status         = 'checked_out';
    att.check_out_time = new Date();
    await att.save();

    res.json({ success: true, message: 'Chấm ra ca thành công', data: att });
  } catch (err) { next(err); }
});

/**
 * GET /attendance/today
 * Lấy trạng thái chấm công hôm nay
 */
router.get('/today', authenticate, async (req, res, next) => {
  try {
    const date = todayStr();
    const att  = await Attendance.findOne({ user_id: req.user._id, date });
    res.json({ success: true, data: att ?? null });
  } catch (err) { next(err); }
});

/**
 * GET /attendance/list?month=YYYY-MM
 * Danh sách chấm công theo tháng
 */
router.get('/list', authenticate, async (req, res, next) => {
  try {
    const now   = new Date();
    const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const list = await Attendance.find({
      user_id: req.user._id,
      date:    { $regex: `^${month}` },
    }).sort('-date').lean();

    // ── Tính bảng công ──
    // Ca VP tiêu chuẩn: 08:00 – 17:00 (9 tiếng, 1 tiếng nghỉ trưa → 8 giờ làm)
    const SHIFT_START_H = 8, SHIFT_START_M = 0;   // 08:00
    const SHIFT_END_H   = 17, SHIFT_END_M   = 0;  // 17:00
    const STANDARD_HOURS_PER_DAY = 8;             // giờ chuẩn / ngày
    const STANDARD_HOURS_MONTH   = 208;           // giờ chuẩn tháng

    // Số ngày trong tháng (tính ngày làm: thứ 2 – thứ 6, bỏ thứ 7, CN)
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let workingDaysInMonth = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(y, m - 1, d).getDay(); // 0=CN, 6=T7
      if (dow !== 0 && dow !== 6) workingDaysInMonth++;
    }

    const completedRecords = list.filter(a => a.check_in_time && a.check_out_time);
    const workDays = completedRecords.length;

    let totalActualMins = 0; // tổng phút làm thực tế
    let earlyMins       = 0; // tổng phút đi làm sớm
    let lateInMins      = 0; // tổng phút đi muộn
    let earlyOutMins    = 0; // tổng phút về sớm
    let lateOutMins     = 0; // tổng phút làm dư giờ (ra sau 17:00)
    let overtimeMins    = 0; // số giờ làm thêm (ngoài ca)
    let forgotCheckin   = 0; // quên check in
    let forgotCheckout  = 0; // quên check out
    let forgotBoth      = 0; // quên cả 2

    list.forEach(a => {
      // Dùng sessions nếu có, fallback về fields tổng hợp cũ
      const sessions = (a.sessions && a.sessions.length > 0)
        ? a.sessions
        : (a.check_in_time ? [{ check_in_time: a.check_in_time, check_out_time: a.check_out_time }] : []);

      if (sessions.length === 0) { forgotBoth++; return; }

      // Kiểm tra session đầu tiên (cho các thống kê đi sớm/muộn dựa vào cin đầu tiên)
      const firstSession = sessions[0];
      const lastSession  = sessions[sessions.length - 1];

      if (!firstSession.check_in_time) { forgotCheckin++; return; }
      if (!lastSession.check_out_time) { forgotCheckout++; return; }

      // Tính tổng thời gian làm từ tất cả sessions trong ngày
      sessions.forEach(s => {
        if (!s.check_in_time || !s.check_out_time) return;
        const cin  = new Date(s.check_in_time);
        const cout = new Date(s.check_out_time);
        const actualMins = Math.max(0, (cout - cin) / 60000);
        totalActualMins += actualMins;

        const dow = cin.getDay();
        if (dow === 0 || dow === 6) overtimeMins += Math.min(actualMins, 8 * 60);
      });

      // Thống kê đi sớm/muộn dựa vào session đầu tiên
      const cin  = new Date(firstSession.check_in_time);
      const cout = new Date(lastSession.check_out_time);
      const shiftStart = new Date(cin); shiftStart.setHours(SHIFT_START_H, SHIFT_START_M, 0, 0);
      const shiftEnd   = new Date(cin); shiftEnd.setHours(SHIFT_END_H,   SHIFT_END_M,   0, 0);

      if (cin < shiftStart) earlyMins    += Math.round((shiftStart - cin) / 60000);
      if (cin > shiftStart) lateInMins   += Math.round((cin - shiftStart) / 60000);
      if (cout < shiftEnd)  earlyOutMins += Math.round((shiftEnd - cout) / 60000);
      if (cout > shiftEnd)  lateOutMins  += Math.round((cout - shiftEnd) / 60000);
    });

    const totalHours      = Math.round(totalActualMins / 60 * 100) / 100;
    const lateOutH        = Math.floor(lateOutMins  / 60); const lateOutM2  = lateOutMins  % 60;
    const overtimeH       = Math.floor(overtimeMins / 60); const overtimeM2 = overtimeMins % 60;
    const earlyOutH       = Math.floor(earlyOutMins / 60); const earlyOutM2 = earlyOutMins % 60;
    const lateInH         = Math.floor(lateInMins   / 60); const lateInM2   = lateInMins   % 60;

    res.json({
      success: true,
      data: {
        list,
        summary: {
          month,
          work_days:           workDays,
          total_hours:         totalHours,
          // Dư giờ / thêm giờ
          over_hours_h:        lateOutH,
          over_hours_m:        lateOutM2,
          overtime_h:          overtimeH,
          overtime_m:          overtimeM2,
          // Đi sớm (phút)
          early_in_mins:       earlyMins,
          // Chuẩn
          standard_hours:      STANDARD_HOURS_MONTH,
          standard_off_days:   0,
          unpaid_off_days:     0,
          working_days_month:  workingDaysInMonth,
          holiday_days:        0,
          total_payroll_days:  workDays,
          // Vi phạm giờ giấc
          early_out_h:         earlyOutH,
          early_out_m:         earlyOutM2,
          late_in_h:           lateInH,
          late_in_m:           lateInM2,
          late_early_combined_h: Math.floor((earlyOutMins + lateInMins) / 60),
          late_early_combined_m: (earlyOutMins + lateInMins) % 60,
          // Quên chấm
          forgot_checkin:      forgotCheckin,
          forgot_checkout:     forgotCheckout,
          forgot_both:         forgotBoth,
        },
      },
    });
  } catch (err) { next(err); }
});

/**
 * GET /attendance/admin
 * Admin xem chấm công tất cả nhân viên theo tuần
 * Query: week=YYYY-Www (ISO week) hoặc from=YYYY-MM-DD&to=YYYY-MM-DD
 * Query: user_id (lọc 1 nhân viên), status (all|active)
 */
router.get('/admin', authenticate, authorize('coordinator', 'accountant', 'manager'), async (req, res, next) => {
  try {
    const { User } = require('../models');

    // Tính từ/đến
    let from, to;
    if (req.query.from && req.query.to) {
      from = req.query.from;
      to   = req.query.to;
    } else {
      // Mặc định tuần hiện tại (T2→CN)
      const today = new Date();
      const dow   = today.getDay() === 0 ? 6 : today.getDay() - 1; // 0=Mon
      const mon   = new Date(today); mon.setDate(today.getDate() - dow);
      const sun   = new Date(mon);   sun.setDate(mon.getDate() + 6);
      from = mon.toISOString().slice(0, 10);
      to   = sun.toISOString().slice(0, 10);
    }

    // Lấy danh sách nhân viên (không bao gồm driver)
    const userFilter = {
      is_deleted: { $ne: true },
      role:       { $in: ['employee', 'coordinator', 'accountant', 'manager'] },
    };
    if (req.query.user_id)                userFilter._id    = req.query.user_id;
    if (req.query.status === 'active')    userFilter.status = 'active';

    const users = await User.find(userFilter)
      .select('name employee_id department branch position status avatar')
      .sort('name')
      .lean();

    if (users.length === 0) {
      return res.json({ success: true, data: { users: [], from, to, dates: [] } });
    }

    // Tạo mảng ngày từ from→to
    const dates = [];
    const cur = new Date(from);
    const end = new Date(to);
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }

    // Lấy tất cả attendance records trong khoảng
    const userIds = users.map(u => u._id);
    const records = await Attendance.find({
      user_id: { $in: userIds },
      date:    { $gte: from, $lte: to },
    }).lean();

    // Index records: { userId: { date: record } }
    const index = {};
    records.forEach(r => {
      const uid = r.user_id.toString();
      if (!index[uid]) index[uid] = {};
      index[uid][r.date] = r;
    });

    // Gắn records vào từng user
    const usersWithRecords = users.map(u => ({
      ...u,
      attendance: dates.reduce((acc, d) => {
        acc[d] = index[u._id.toString()]?.[d] ?? null;
        return acc;
      }, {}),
    }));

    res.json({ success: true, data: { users: usersWithRecords, from, to, dates } });
  } catch (err) { next(err); }
});

/**
 * GET /attendance/admin/user/:userId
 * Admin xem chi tiết chấm công của 1 nhân viên theo tháng
 */
router.get('/admin/user/:userId', authenticate, authorize('coordinator', 'accountant', 'manager'), async (req, res, next) => {
  try {
    const now   = new Date();
    const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const list = await Attendance.find({
      user_id: req.params.userId,
      date:    { $regex: `^${month}` },
    }).sort('date').lean();

    res.json({ success: true, data: { list, month } });
  } catch (err) { next(err); }
});

module.exports = router;
