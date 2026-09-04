const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { upload, getFileUrl } = require('../middleware/upload');

/**
 * POST /uploads — upload single file
 */
router.post('/', authenticate, ...upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn file' });
    res.json({ success: true, data: { url: getFileUrl(req.file), originalname: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype } });
  } catch (err) { next(err); }
});

/**
 * POST /uploads/receipt — upload ảnh biên nhận
 */
router.post('/receipt', authenticate, ...upload.single('receipt'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh biên nhận' });
    res.json({ success: true, data: { url: getFileUrl(req.file), size: req.file.size } });
  } catch (err) { next(err); }
});

/**
 * POST /uploads/multiple — upload nhiều file
 */
router.post('/multiple', authenticate, ...upload.array('files', 10), (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 file' });
    res.json({ success: true, data: { files: req.files.map(f => ({ url: getFileUrl(f), originalname: f.originalname, size: f.size, mimetype: f.mimetype })) } });
  } catch (err) { next(err); }
});

module.exports = router;
