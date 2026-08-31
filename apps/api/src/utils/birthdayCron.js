/**
 * Birthday Cron Job
 * Chạy lúc 0h mỗi ngày, kiểm tra tài xế nào có sinh nhật hôm nay
 * → gửi thông báo cho toàn bộ tài khoản trong hệ thống
 */

const { Driver, User, Notification } = require('../models');

async function sendBirthdayNotifications() {
  try {
    const now   = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day   = now.getDate();       // 1-31

    console.info(`🎂 Birthday cron: checking ${day}/${month}...`);

    // Tìm tất cả driver có ngày sinh hôm nay (bất kể năm)
    const drivers = await Driver.find({
      date_of_birth: { $exists: true, $ne: null },
      status: { $ne: 'suspended' },
    }).lean();

    const birthdayDrivers = drivers.filter(d => {
      if (!d.date_of_birth) return false;
      const dob = new Date(d.date_of_birth);
      return dob.getMonth() + 1 === month && dob.getDate() === day;
    });

    if (birthdayDrivers.length === 0) {
      console.info('🎂 Birthday cron: no birthdays today');
      return;
    }

    console.info(`🎂 Birthday cron: found ${birthdayDrivers.length} birthday(s) today`);

    // Lấy tất cả user đang active trong hệ thống
    const allUsers = await User.find({
      is_deleted: { $ne: true },
      status: 'active',
    }).select('_id').lean();

    const userIds = allUsers.map(u => u._id);

    // Gửi 1 thông báo cho mỗi driver có sinh nhật
    for (const driver of birthdayDrivers) {
      const age = driver.date_of_birth
        ? now.getFullYear() - new Date(driver.date_of_birth).getFullYear()
        : null;

      const title   = `🎂 Sinh nhật hôm nay!`;
      const message = age
        ? `Chúc mừng sinh nhật ${driver.full_name}! 🎉 Hôm nay tài xế ${driver.full_name} tròn ${age} tuổi. Chúc bạn luôn mạnh khỏe, bình an trên mọi hành trình!`
        : `Chúc mừng sinh nhật ${driver.full_name}! 🎉 Chúc bạn luôn mạnh khỏe, bình an trên mọi hành trình!`;

      // Tạo notification cho tất cả user
      const notifications = userIds.map(uid => ({
        user_id:    uid,
        driver_id:  driver._id,
        title,
        message,
        type:       'birthday',
        is_read:    false,
        data: {
          driver_name: driver.full_name,
          driver_id:   driver._id,
          birthday:    driver.date_of_birth,
          auto:        true,
        },
      }));

      await Notification.insertMany(notifications);
      console.info(`🎂 Sent birthday notification for ${driver.full_name} to ${userIds.length} users`);
    }
  } catch (err) {
    console.error('🎂 Birthday cron error:', err.message);
  }
}

/**
 * Khởi động cron job — chạy lúc 0h mỗi ngày
 * Dùng setInterval tính toán milliseconds đến 0h tiếp theo
 */
function startBirthdayCron() {
  const scheduleNext = () => {
    const now  = new Date();
    const next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1, // ngày mai
      0, 0, 0, 0,        // 0h
    );
    const msUntilMidnight = next.getTime() - now.getTime();

    console.info(`🎂 Birthday cron scheduled: next run in ${Math.round(msUntilMidnight / 60000)} minutes`);

    setTimeout(async () => {
      await sendBirthdayNotifications();
      scheduleNext(); // lên lịch lần tiếp theo
    }, msUntilMidnight);
  };

  scheduleNext();
}

module.exports = { startBirthdayCron, sendBirthdayNotifications };
