/**
 * Cloudinary Cleanup Cron Job
 * Chạy mỗi Chủ nhật lúc 2h sáng
 * Xóa ảnh cũ trên Cloudinary để tiết kiệm dung lượng:
 *   - namthanh/attendance: xóa ảnh > 90 ngày
 *   - namthanh/receipts:   xóa ảnh > 180 ngày
 *   - namthanh/uploads:    xóa file > 180 ngày
 * Không xóa: namthanh/avatars (giữ mãi)
 */

const { cloudinary } = require('../config/cloudinary');

const CLEANUP_RULES = [
  { folder: 'namthanh/attendance', maxAgeDays: 90,  resourceType: 'image' },
  { folder: 'namthanh/receipts',   maxAgeDays: 180, resourceType: 'image' },
  { folder: 'namthanh/uploads',    maxAgeDays: 180, resourceType: 'raw'   },
];

async function cleanupOldFiles() {
  console.info('🧹 Cloudinary cleanup: bắt đầu...');
  let totalDeleted = 0;

  for (const rule of CLEANUP_RULES) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - rule.maxAgeDays);
      const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

      // Lấy danh sách file trong folder
      let nextCursor = null;
      let folderDeleted = 0;

      do {
        const result = await cloudinary.api.resources({
          type:          'upload',
          resource_type: rule.resourceType,
          prefix:        rule.folder,
          max_results:   500,
          next_cursor:   nextCursor || undefined,
        });

        const oldFiles = result.resources.filter(r => {
          const createdAt = new Date(r.created_at).getTime() / 1000;
          return createdAt < cutoffTimestamp;
        });

        if (oldFiles.length > 0) {
          const publicIds = oldFiles.map(f => f.public_id);
          await cloudinary.api.delete_resources(publicIds, {
            resource_type: rule.resourceType,
          });
          folderDeleted += oldFiles.length;
          totalDeleted  += oldFiles.length;
        }

        nextCursor = result.next_cursor;
      } while (nextCursor);

      if (folderDeleted > 0) {
        console.info(`🧹 Đã xóa ${folderDeleted} file cũ trong ${rule.folder} (>${rule.maxAgeDays} ngày)`);
      }
    } catch (err) {
      console.warn(`⚠️ Cleanup lỗi folder ${rule.folder}:`, err.message);
    }
  }

  console.info(`✅ Cloudinary cleanup xong: đã xóa ${totalDeleted} file`);
}

function startCloudinaryCleanup() {
  // Chạy ngay khi khởi động (lần đầu)
  // Sau đó chạy mỗi 7 ngày
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // Tính thời gian đến Chủ nhật 2h sáng tiếp theo
  const now         = new Date();
  const nextSunday  = new Date(now);
  nextSunday.setDate(now.getDate() + (7 - now.getDay()) % 7 || 7);
  nextSunday.setHours(2, 0, 0, 0);
  const msUntilNext = nextSunday.getTime() - now.getTime();

  console.info(`🧹 Cloudinary cleanup: lần chạy tiếp theo ${nextSunday.toLocaleString('vi-VN')}`);

  setTimeout(() => {
    cleanupOldFiles();
    setInterval(cleanupOldFiles, WEEK_MS);
  }, msUntilNext);
}

module.exports = { startCloudinaryCleanup, cleanupOldFiles };
