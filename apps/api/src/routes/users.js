const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { body } = require('express-validator');
const { User } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

/**
 * GET /users/me
 * Lấy thông tin profile của chính mình
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

/**
 * PUT /users/me
 * Cập nhật thông tin profile của chính mình (tên, email, avatar)
 */
router.put('/me', authenticate, async (req, res, next) => {
  try {
    const { name, email, avatar } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    if (name)   user.name   = name.trim();
    if (email !== undefined) user.email = email ? email.toLowerCase().trim() : null;
    if (avatar !== undefined) user.avatar = avatar;
    await user.save();
    const { password: _, ...userObj } = user.toObject();
    res.json({ success: true, message: 'Cập nhật thành công', data: userObj });
  } catch (err) { next(err); }
});

/**
 * GET /users
 * Danh sách nhân viên văn phòng (không phải driver)
 */
router.get('/', authenticate, authorize('coordinator', 'accountant', 'manager'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', status } = req.query;
    const filter = {
      role:       { $in: ['coordinator', 'accountant', 'manager', 'employee'] },
      is_deleted: { $ne: true },
    };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(filter).select('-password').sort('name').skip(skip).limit(parseInt(limit)).lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
      },
    });
  } catch (err) { next(err); }
});

/**
 * POST /users
 * Tạo tài khoản nhân viên mới
 */
router.post(
  '/',
  authenticate,
  authorize('coordinator', 'manager'),
  [
    body('name').trim().notEmpty().withMessage('Tên là bắt buộc'),
    body('phone').trim().notEmpty().withMessage('Số điện thoại là bắt buộc'),
    body('password').isLength({ min: 6 }).withMessage('Mật khẩu tối thiểu 6 ký tự'),
    body('role').isIn(['coordinator', 'accountant', 'manager', 'employee']).withMessage('Vai trò không hợp lệ'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { name, phone, password, role, email, status = 'active' } = req.body;

      // Coordinator không thể tạo tài khoản manager
      if (req.user.role === 'coordinator' && role === 'manager') {
        return res.status(403).json({ success: false, message: 'Điều phối không thể tạo tài khoản Quản lý' });
      }

      const existing = await User.findOne({ phone, is_deleted: { $ne: true } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Số điện thoại đã tồn tại' });
      }

      const salt   = await bcrypt.genSalt(12);
      const hashed = await bcrypt.hash(password, salt);

      // Auto-generate employee_id nếu không truyền vào: NT001, NT002, ...
      let finalEmployeeId = req.body.employee_id?.trim() || null;
      if (!finalEmployeeId) {
        const count = await User.countDocuments({ is_deleted: { $ne: true }, role: { $ne: 'driver' } });
        finalEmployeeId = `NT${String(count + 1).padStart(3, '0')}`;
        // Đảm bảo unique
        while (await User.findOne({ employee_id: finalEmployeeId, is_deleted: { $ne: true } })) {
          finalEmployeeId = `NT${String(Math.floor(Math.random() * 900) + 100)}`;
        }
      } else {
        // Kiểm tra unique nếu user tự nhập
        const dupId = await User.findOne({ employee_id: finalEmployeeId, is_deleted: { $ne: true } });
        if (dupId) {
          return res.status(400).json({ success: false, message: 'Mã nhân viên đã tồn tại' });
        }
      }

      const user = await User.create({
        name, phone, password: hashed, role, status,
        email:       email       ? email.toLowerCase().trim() : null,
        employee_id: finalEmployeeId,
        branch:      req.body.branch      || null,
        department:  req.body.department  || null,
        position:    req.body.position    || null,
        join_date:   req.body.join_date   ? new Date(req.body.join_date) : null,
      });

      const { password: _, ...userObj } = user.toObject();
      res.status(201).json({ success: true, message: 'Tạo tài khoản thành công', data: userObj });
    } catch (err) { next(err); }
  }
);

/**
 * PUT /users/:id
 * Cập nhật thông tin nhân viên
 */
router.put('/:id', authenticate, authorize('coordinator', 'manager'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.is_deleted) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    }
    if (user.role === 'driver') {
      return res.status(403).json({ success: false, message: 'Dùng trang Tài xế để quản lý tài xế' });
    }

    // Không cho tự đổi role của chính mình
    if (user._id.toString() === req.user._id.toString() && req.body.role && req.body.role !== user.role) {
      return res.status(403).json({ success: false, message: 'Không thể tự thay đổi vai trò của chính mình' });
    }

    // Coordinator không thể cấp quyền manager cho bất kỳ ai
    if (req.user.role === 'coordinator' && req.body.role === 'manager') {
      return res.status(403).json({ success: false, message: 'Điều phối không thể cấp quyền Quản lý' });
    }

    const { name, phone, password, role, email, status, employee_id, branch, department, position, join_date } = req.body;
    if (name)   user.name   = name;
    if (phone)  user.phone  = phone;
    if (role)   user.role   = role;
    if (status) user.status = status;
    if (email !== undefined)       user.email       = email ? email.toLowerCase().trim() : null;
    if (employee_id !== undefined) user.employee_id = employee_id || null;
    if (branch !== undefined)      user.branch      = branch      || null;
    if (department !== undefined)  user.department  = department  || null;
    if (position !== undefined)    user.position    = position    || null;
    if (join_date !== undefined)   user.join_date   = join_date   ? new Date(join_date) : null;
    if (password && password.length >= 6) {
      const salt = await bcrypt.genSalt(12);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();
    const userObj = user.toObject();
    delete userObj.password;
    res.json({ success: true, message: 'Cập nhật thành công', data: userObj });
  } catch (err) { next(err); }
});

/**
 * DELETE /users/:id
 * Xóa mềm tài khoản
 */
router.delete('/:id', authenticate, authorize('coordinator', 'manager'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.is_deleted) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    }
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản của chính mình' });
    }
    if (user.role === 'driver') {
      return res.status(403).json({ success: false, message: 'Dùng trang Tài xế để xóa tài xế' });
    }
    // Hard delete — xóa hẳn khỏi DB để tránh trùng SĐT khi tạo lại
    await user.deleteOne();
    res.json({ success: true, message: 'Đã xóa tài khoản' });
  } catch (err) { next(err); }
});

module.exports = router;
