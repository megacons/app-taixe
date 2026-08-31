const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { Material, SystemConfig } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { invalidateOvertimeCache } = require('../utils/overtime');

/* ─── Materials ─── */

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, search, limit = 100 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) filter.material_name = { $regex: search, $options: 'i' };

    const materials = await Material.find(filter).sort('material_name').limit(parseInt(limit)).lean();
    res.json({ success: true, data: { materials, total: materials.length } });
  } catch (err) { next(err); }
});

router.post(
  '/',
  authenticate,
  authorize('coordinator', 'manager'),
  [
    body('material_name').trim().notEmpty().withMessage('Tên vật liệu là bắt buộc'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const existing = await Material.findOne({ material_name: req.body.material_name.trim() });
      if (existing) return res.status(400).json({ success: false, message: 'Tên vật liệu đã tồn tại' });

      const material = await Material.create(req.body);
      res.status(201).json({ success: true, message: 'Thêm vật liệu thành công', data: material });
    } catch (err) { next(err); }
  }
);

router.put('/:id', authenticate, authorize('coordinator', 'manager'), async (req, res, next) => {
  try {
    const material = await Material.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!material) return res.status(404).json({ success: false, message: 'Không tìm thấy vật liệu' });
    res.json({ success: true, message: 'Cập nhật thành công', data: material });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, authorize('manager'), async (req, res, next) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: 'Không tìm thấy vật liệu' });
    await material.softDelete(req.user._id);
    res.json({ success: true, message: 'Xóa vật liệu thành công' });
  } catch (err) { next(err); }
});

/* ─── System Configs ─── */

// Public endpoint — lấy config công ty (không cần auth, dùng cho login page)
router.get('/configs/public', async (req, res, next) => {
  try {
    // Lấy tất cả config (không lọc category vì logo_url có thể ở category 'general')
    const configs = await SystemConfig.find().lean();
    const map = configs.reduce((acc, c) => ({ ...acc, [c.key]: c.value }), {});
    // Chỉ trả về các key cần thiết cho client
    const publicMap = {
      company_name:     map.company_name     ?? '',
      company_subtitle: map.company_subtitle ?? '',
      logo_url:         map.logo_url         ?? '',
    };
    res.json({ success: true, data: { map: publicMap } });
  } catch (err) { next(err); }
});

router.get('/configs', authenticate, async (req, res, next) => {
  try {
    const configs = await SystemConfig.find().lean();
    const map = configs.reduce((acc, c) => ({ ...acc, [c.key]: c.value }), {});
    res.json({ success: true, data: { configs, map } });
  } catch (err) { next(err); }
});

router.put('/configs/:key', authenticate, authorize('manager'), async (req, res, next) => {
  try {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, message: 'value là bắt buộc' });

    const config = await SystemConfig.findOneAndUpdate(
      { key: req.params.key },
      { value },
      { new: true, upsert: true }
    );

    // Nếu thay đổi cấu hình tăng ca thì xóa cache
    if (['overtime_threshold', 'overtime_rate'].includes(req.params.key)) {
      invalidateOvertimeCache();
    }

    res.json({ success: true, message: 'Cập nhật cấu hình thành công', data: config });
  } catch (err) { next(err); }
});

module.exports = router;
