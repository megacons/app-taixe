const multer = require('multer');
const { createCloudinaryStorage } = require('../config/cloudinary');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx/;
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  if (allowedTypes.test(ext) || allowedTypes.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Loại file không được hỗ trợ. Chỉ chấp nhận: jpg, png, pdf, doc, xlsx'), false);
  }
};

// Tạo multer instance cho từng loại upload
const createUploader = (folder) => multer({
  storage: createCloudinaryStorage(folder),
  limits:  { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

// Các uploader theo từng loại
const upload         = createUploader('uploads');     // general
const avatarUpload   = createUploader('avatars');
const receiptUpload  = createUploader('receipts');
const documentUpload = createUploader('documents');
const attendanceUpload = createUploader('attendance');

/**
 * getFileUrl — tương thích với cả Cloudinary (req.file.path) và legacy local
 * Cloudinary trả về file.path = https://res.cloudinary.com/...
 */
const getFileUrl = (file) => {
  if (!file) return null;
  // Cloudinary: file.path là URL đầy đủ
  if (file.path && file.path.startsWith('http')) return file.path;
  // Legacy local fallback
  const relativePath = (file.path || '').replace(/\\/g, '/').split('uploads/')[1];
  return relativePath ? `/uploads/${relativePath}` : null;
};

module.exports = {
  upload,
  avatarUpload,
  receiptUpload,
  documentUpload,
  attendanceUpload,
  getFileUrl,
};
