/**
 * Overtime calculation utility
 * Logic: đếm trip trong ngày → overtimeTrips = max(0, total - threshold)
 * overtimePay = overtimeTrips × ratePerTrip
 */

const { SystemConfig } = require('../models');

// Cache config để tránh query DB liên tục
let _cachedConfig = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

async function getOvertimeConfig() {
  const now = Date.now();
  if (_cachedConfig && now - _cacheTime < CACHE_TTL) {
    return _cachedConfig;
  }

  const [thresholdDoc, rateDoc] = await Promise.all([
    SystemConfig.findOne({ key: 'overtime_threshold' }),
    SystemConfig.findOne({ key: 'overtime_rate' }),
  ]);

  _cachedConfig = {
    threshold: thresholdDoc?.value ?? 4,
    rate: rateDoc?.value ?? 100_000,
  };
  _cacheTime = now;

  return _cachedConfig;
}

/**
 * Tính thông tin tăng ca cho trip thứ N (1-indexed) trong ngày
 * @param {number} tripNumberToday - Số thứ tự chuyến trong ngày (1-indexed)
 * @returns {{ isOvertime: boolean, overtimePay: number }}
 */
async function calcOvertimeForTrip(tripNumberToday) {
  const { threshold, rate } = await getOvertimeConfig();
  const isOvertime = tripNumberToday > threshold;
  return {
    isOvertime,
    overtimePay: isOvertime ? rate : 0,
  };
}

/**
 * Tính tổng overtime cho một danh sách trips
 * @param {number} totalTrips
 * @returns {{ overtimeTrips: number, overtimePay: number }}
 */
async function calcDailyOvertime(totalTrips) {
  const { threshold, rate } = await getOvertimeConfig();
  const overtimeTrips = Math.max(0, totalTrips - threshold);
  return {
    overtimeTrips,
    overtimePay: overtimeTrips * rate,
  };
}

/**
 * Invalidate cache (gọi khi SystemConfig thay đổi)
 */
function invalidateOvertimeCache() {
  _cachedConfig = null;
  _cacheTime = 0;
}

module.exports = { calcOvertimeForTrip, calcDailyOvertime, invalidateOvertimeCache, getOvertimeConfig };
