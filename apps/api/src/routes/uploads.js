const express = require('express');
const router = express.Router();
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { upload, getFileUrl } = require('../middleware/upload');

/**
 * POST /uploads
 * Upload single file — trả về URL
 */
router.post(
  '/',
  authenticate,
  upload.single('file'),
  (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Vui lòng chọn file' });
      }
      const url = getFileUrl(req.file);
      res.json({
        success: true,
        data: {
          url,
          filename: req.file.filename,
          originalname: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /uploads/receipt
 * Upload ảnh biên nhận chuyến xe
 */
router.post(
  '/receipt',
  authenticate,
  upload.single('receipt'),
  (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh biên nhận' });
      }
      const url = getFileUrl(req.file);
      res.json({
        success: true,
        data: { url, filename: req.file.filename, size: req.file.size },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /uploads/multiple
 * Upload nhiều file cùng lúc (tối đa 10)
 */
router.post(
  '/multiple',
  authenticate,
  upload.array('files', 10),
  (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 file' });
      }
      const files = req.files.map(f => ({
        url: getFileUrl(f),
        filename: f.filename,
        originalname: f.originalname,
        size: f.size,
        mimetype: f.mimetype,
      }));
      res.json({ success: true, data: { files } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
