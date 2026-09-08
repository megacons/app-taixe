const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Resend }  = require('resend');
const { body } = require('express-validator');
const { User } = require('../models');

/* ── Email: Resend (ưu tiên) hoặc SMTP fallback ── */
const resendClient = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const mailer = nodemailer.createTransport({
  host:   process.env.MAIL_HOST || 'smtp.gmail.com',
  port:   Number(process.env.MAIL_PORT) || 587,
  secure: process.env.MAIL_SECURE === 'true',
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
});

if (resendClient) {
  console.info('[Mailer] ✅ Using Resend API');
} else {
  mailer.verify(err => {
    if (err) console.error('[Mailer] ❌ SMTP FAILED:', err.message);
    else     console.info('[Mailer] ✅ SMTP ready');
  });
}

async function sendOtpEmail(to, otp) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
      <h2 style="color:#163797;margin-bottom:8px">🚛 Nam Thành Transport</h2>
      <p style="color:#6b7280;margin-bottom:20px">Yêu cầu đặt lại mật khẩu</p>
      <div style="background:#f0f4ff;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
        <p style="color:#6b7280;font-size:13px;margin-bottom:8px">Mã OTP của bạn</p>
        <p style="font-size:36px;font-weight:900;letter-spacing:10px;color:#163797;margin:0">${otp}</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:8px">Hết hạn sau <b>5 phút</b></p>
      </div>
      <p style="color:#6b7280;font-size:12px">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
    </div>
  `;

  // Thử Resend trước (nếu có key)
  if (resendClient) {
    try {
      const { error, data } = await resendClient.emails.send({
        from:    process.env.RESEND_FROM || 'Nam Thành <onboarding@resend.dev>',
        to:      [to],
        subject: `[Nam Thành] Mã OTP: ${otp}`,
        html,
      });
      if (!error) { console.info('[Mailer] Resend OK to:', to); return; }
      console.warn('[Mailer] Resend failed:', error.message, '— trying SMTP...');
    } catch (e) {
      console.warn('[Mailer] Resend exception:', e.message, '— trying SMTP...');
    }
  }

  // Fallback: Gmail SMTP
  if (process.env.MAIL_USER && process.env.MAIL_PASS && process.env.MAIL_PASS !== 'your_16_char_app_password_here') {
    await mailer.sendMail({
      from:    process.env.MAIL_FROM || `Nam Thành Transport <${process.env.MAIL_USER}>`,
      to,
      subject: `[Nam Thành] Mã OTP đặt lại mật khẩu: ${otp}`,
      html,
    });
    console.info('[Mailer] SMTP OK to:', to);
    return;
  }

  throw new Error('Chưa cấu hình email. Cần RESEND_API_KEY hoặc MAIL_USER/MAIL_PASS (Gmail App Password) trong .env');
}
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

/**
 * Generate JWT tokens
 */
const generateTokens = userId => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });

  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

  return { token, refreshToken };
};

/**
 * POST /auth/login
 * Đăng nhập — trả về JWT token
 */
router.post(
  '/login',
  [
    body('phone').trim().notEmpty().withMessage('Số điện thoại là bắt buộc'),
    body('password').notEmpty().withMessage('Mật khẩu là bắt buộc'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { phone, password } = req.body;

      // Find user by phone, include password
      const user = await User.findOne({
        phone: phone.trim(),
        is_deleted: { $ne: true },
      }).select('+password');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Số điện thoại hoặc mật khẩu không đúng',
        });
      }

      if (user.status !== 'active') {
        return res.status(401).json({
          success: false,
          message: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.',
        });
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Số điện thoại hoặc mật khẩu không đúng',
        });
      }

      // Update last login
      user.last_login = new Date();
      await user.save();

      const { token, refreshToken } = generateTokens(user._id);

      // Return user without password
      const userObj = user.toObject();
      delete userObj.password;

      res.json({
        success: true,
        message: 'Đăng nhập thành công',
        data: {
          user: userObj,
          token,
          refreshToken,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /auth/refresh
 * Làm mới access token
 */
router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('refreshToken là bắt buộc'), validate],
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;

      let decoded;
      try {
        decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      } catch (_) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token không hợp lệ hoặc đã hết hạn',
        });
      }

      const user = await User.findOne({
        _id: decoded.userId,
        status: 'active',
        is_deleted: { $ne: true },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Tài khoản không tồn tại',
        });
      }

      const { token, refreshToken: newRefreshToken } = generateTokens(user._id);

      res.json({
        success: true,
        data: {
          token,
          refreshToken: newRefreshToken,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /auth/logout
 */
router.post('/logout', async (req, res) => {
  // With JWT, logout is client-side (delete token).
  // In production, add token to a blacklist / revoke table.
  res.json({
    success: true,
    message: 'Đăng xuất thành công',
  });
});

/**
 * GET /auth/me
 * Lấy thông tin user hiện tại (query DB để lấy dữ liệu mới nhất)
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const { User } = require('../models');
    const user = await User.findById(req.user._id).select('-password').lean();
    res.json({ success: true, data: user ?? req.user });
  } catch {
    res.json({ success: true, data: req.user });
  }
});

/**
 * PUT /auth/change-password
 */
router.put(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Mật khẩu hiện tại là bắt buộc'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('Mật khẩu mới tối thiểu 6 ký tự'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user._id).select('+password');

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Mật khẩu hiện tại không đúng',
        });
      }

      // Không cho đặt mật khẩu mới giống mật khẩu cũ
      const isSame = await bcrypt.compare(newPassword, user.password);
      if (isSame) {
        return res.status(400).json({
          success: false,
          message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
        });
      }

      const salt = await bcrypt.genSalt(12);
      user.password = await bcrypt.hash(newPassword, salt);
      await user.save();

      res.json({
        success: true,
        message: 'Đổi mật khẩu thành công',
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────────────────
 * OTP store đơn giản (in-memory) — key: phone, value: { otp, expiresAt }
 * Production: thay bằng Redis + SMS gateway (VNPT, Viettel, Twilio...)
 * ───────────────────────────────────────────────────────── */
const otpStore = new Map();

/**
 * POST /auth/forgot-password
 * Gửi OTP về email
 */
router.post(
  '/forgot-password',
  [
    body('email').isEmail().withMessage('Email không hợp lệ'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const email = req.body.email.toLowerCase().trim();

      const user = await User.findOne({ email, is_deleted: { $ne: true } });
      if (!user) {
        return res.status(404).json({ success: false, message: 'Email không tồn tại trong hệ thống' });
      }

      // Tạo OTP 6 số
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = Date.now() + 5 * 60 * 1000;
      otpStore.set(email, { otp, expiresAt, userId: user._id });

      // Gửi OTP qua email — fallback nếu lỗi
      let emailSent = false;
      try {
        await sendOtpEmail(email, otp);
        emailSent = true;
        console.info(`[OTP] ✅ Sent to: ${email}`);
      } catch (mailErr) {
        console.error('[OTP] ❌ Email FAILED:', mailErr.message);
        console.warn(`[OTP FALLBACK] email: ${email} → OTP: ${otp}`);
      }

      const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) =>
        a + '*'.repeat(Math.max(2, b.length)) + c
      );

      res.json({
        success: true,
        maskedEmail,
        emailSent,
        message: emailSent
          ? `Mã OTP đã gửi về ${maskedEmail}`
          : `Hệ thống email tạm gián đoạn. Vui lòng liên hệ quản lý để nhận mã.`,
        // DEV: trả về OTP để test khi email fail
        ...(process.env.NODE_ENV !== 'production' && !emailSent && { otp }),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /auth/verify-otp
 * Xác minh OTP
 */
router.post(
  '/verify-otp',
  [
    body('email').isEmail().withMessage('Email không hợp lệ'),
    body('otp').notEmpty().withMessage('Mã OTP là bắt buộc'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const email = req.body.email.toLowerCase().trim();
      const { otp } = req.body;
      const record = otpStore.get(email);

      if (!record) {
        return res.status(400).json({ success: false, message: 'Mã OTP không tồn tại hoặc đã hết hạn' });
      }
      if (Date.now() > record.expiresAt) {
        otpStore.delete(email);
        return res.status(400).json({ success: false, message: 'Mã OTP đã hết hạn, vui lòng yêu cầu lại' });
      }
      if (record.otp !== otp) {
        return res.status(400).json({ success: false, message: 'Mã OTP không đúng' });
      }

      const resetToken = require('crypto').randomBytes(32).toString('hex');
      otpStore.set(`reset_${email}`, { resetToken, userId: record.userId, expiresAt: Date.now() + 5 * 60 * 1000 });
      otpStore.delete(email);

      res.json({ success: true, message: 'OTP hợp lệ', resetToken });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /auth/reset-password
 * Đặt lại mật khẩu mới
 */
router.post(
  '/reset-password',
  [
    body('email').isEmail().withMessage('Email không hợp lệ'),
    body('resetToken').notEmpty().withMessage('Reset token là bắt buộc'),
    body('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu mới tối thiểu 6 ký tự'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const email = req.body.email.toLowerCase().trim();
      const { resetToken, newPassword } = req.body;
      const record = otpStore.get(`reset_${email}`);

      if (!record || record.resetToken !== resetToken) {
        return res.status(400).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
      }
      if (Date.now() > record.expiresAt) {
        otpStore.delete(`reset_${email}`);
        return res.status(400).json({ success: false, message: 'Phiên đặt lại mật khẩu đã hết hạn' });
      }

      const salt   = await bcrypt.genSalt(12);
      const hashed = await bcrypt.hash(newPassword, salt);
      await User.findByIdAndUpdate(record.userId, { password: hashed });
      otpStore.delete(`reset_${email}`);

      res.json({ success: true, message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập.' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /auth/update-email
 * Tài xế cập nhật email của mình
 */
router.put('/update-email', authenticate, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Email không hợp lệ' });
    }
    await User.findByIdAndUpdate(req.user._id, { email: email.toLowerCase().trim() });
    res.json({ success: true, message: 'Cập nhật email thành công', data: { email } });
  } catch (err) { next(err); }
});

module.exports = router;
