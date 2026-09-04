const multer = require('multer');
const { uploadToCloudinary } = require('../config/cloudinary');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB

// Dùng memoryStorage — file giữ trong RAM, sau đó upload lên Cloudinary
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx/;
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  if (allowedTypes.test(ext) || allowedTypes.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Loại file không được hỗ trợ'), false);
  }
};

const multerInstance = multer({
  storage: memoryStorage,
  limits:  { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

/**
 * Middleware factory: upload file lên Cloudinary sau khi multer parse xong
 * @param {string} folder - thư mục Cloudinary
 * @param {string} fieldName - tên field trong form
 */
const createUploadMiddleware = (folder, fieldName = 'file') => {
  const isImage = (mimetype) => /jpeg|jpg|png|gif|webp/.test(mimetype || '');

  return [
    multerInstance.single(fieldName),
    async (req, res, next) => {
      try {
        if (!req.file) return next();

        const resourceType = isImage(req.file.mimetype) ? 'image' : 'raw';
        const url = await uploadToCloudinary(
          req.file.buffer,
          `namthanh/${folder}`,
          resourceType
        );
        // Gắn url vào req.file để route handler dùng
        req.file.cloudinaryUrl = url;
        req.file.path = url; // tương thích với getFileUrl
        next();
      } catch (err) {
        next(err);
      }
    },
  ];
};

/**
 * Middleware factory cho upload nhiều file
 */
const createMultiUploadMiddleware = (folder, fieldName = 'files', maxCount = 10) => {
  const isImage = (mimetype) => /jpeg|jpg|png|gif|webp/.test(mimetype || '');

  return [
    multerInstance.array(fieldName, maxCount),
    async (req, res, next) => {
      try {
        if (!req.files || req.files.length === 0) return next();

        const urls = await Promise.all(
          req.files.map(f => {
            const resourceType = isImage(f.mimetype) ? 'image' : 'raw';
            return uploadToCloudinary(f.buffer, `namthanh/${folder}`, resourceType);
          })
        );
        // Gắn url vào từng file
        req.files = req.files.map((f, i) => ({ ...f, path: urls[i], cloudinaryUrl: urls[i] }));
        next();
      } catch (err) {
        next(err);
      }
    },
  ];
};

/**
 * getFileUrl — lấy URL từ file object
 * Hỗ trợ cả Cloudinary (path = https://...) và legacy local
 */
const getFileUrl = (file) => {
  if (!file) return null;
  if (file.path && file.path.startsWith('http')) return file.path;
  if (file.cloudinaryUrl) return file.cloudinaryUrl;
  const relativePath = (file.path || '').replace(/\\/g, '/').split('uploads/')[1];
  return relativePath ? `/uploads/${relativePath}` : null;
};

// Export các uploader cho từng loại
const upload          = { single: (f) => createUploadMiddleware('uploads', f),   array: (f, n) => createMultiUploadMiddleware('uploads', f, n) };
const avatarUpload    = { single: (f) => createUploadMiddleware('avatars', f) };
const receiptUpload   = { single: (f) => createUploadMiddleware('receipts', f) };
const documentUpload  = { single: (f) => createUploadMiddleware('documents', f) };
const attendanceUpload= { single: (f) => createUploadMiddleware('attendance', f) };

module.exports = {
  upload,
  avatarUpload,
  receiptUpload,
  documentUpload,
  attendanceUpload,
  getFileUrl,
  multerInstance,
};
