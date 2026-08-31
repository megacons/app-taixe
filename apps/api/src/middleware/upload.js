const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB

// Ensure upload dirs exist
const createDirs = () => {
  const dirs = ['images', 'receipts', 'documents', 'avatars'];
  dirs.forEach(dir => {
    const fullPath = path.join(UPLOAD_PATH, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
};
createDirs();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'images';
    if (file.fieldname === 'avatar') folder = 'avatars';
    else if (file.fieldname === 'receipt' || file.fieldname === 'delivery_receipt')
      folder = 'receipts';
    else if (file.fieldname === 'document' || file.fieldname === 'attachment')
      folder = 'documents';

    cb(null, path.join(UPLOAD_PATH, folder));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedDocTypes = /pdf|doc|docx|xls|xlsx/;
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

  if (allowedImageTypes.test(ext) || allowedDocTypes.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Loại file không được hỗ trợ. Chỉ chấp nhận: jpg, png, pdf, doc, xlsx'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

// Helper to get public URL from file path
const getFileUrl = file => {
  if (!file) return null;
  const relativePath = file.path.replace(/\\/g, '/').split('uploads/')[1];
  return `/uploads/${relativePath}`;
};

module.exports = { upload, getFileUrl };
