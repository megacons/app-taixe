const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Tạo CloudinaryStorage cho từng loại upload
 * folder: thư mục trên Cloudinary
 * allowed_formats: định dạng cho phép
 */
const createCloudinaryStorage = (folder, allowedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xlsx']) => {
  return new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const isImage = /jpeg|jpg|png|gif|webp/.test(
        file.mimetype?.split('/')[1] || ''
      );
      return {
        folder:         `namthanh/${folder}`,
        allowed_formats: allowedFormats,
        resource_type:  isImage ? 'image' : 'raw',
        // Giữ chất lượng ảnh 90% để tiết kiệm dung lượng
        transformation: isImage ? [{ quality: 'auto:good' }] : undefined,
      };
    },
  });
};

module.exports = { cloudinary, createCloudinaryStorage };
