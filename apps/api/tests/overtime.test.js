/**
 * Tests cho logic tăng ca — Nam Thành Transport
 *
 * Spec:
 *   threshold = 4 chuyến/ngày
 *   rate      = 100.000đ/chuyến tăng ca
 *   4 chuyến  → 0 tăng ca, 0đ
 *   5 chuyến  → 1 tăng ca, 100.000đ
 *   6 chuyến  → 2 tăng ca, 200.000đ
 */

// ── Mock mongoose model ──────────────────────────────────────────
jest.mock('../src/models', () => ({
  SystemConfig: {
    findOne: jest.fn(({ key }) => {
      if (key === 'overtime_threshold') return Promise.resolve({ value: 4 });
      if (key === 'overtime_rate')      return Promise.resolve({ value: 100_000 });
      return Promise.resolve(null);
    }),
  },
}));

// Force re-require after mock (clear module cache)
jest.resetModules();

const { calcOvertimeForTrip, calcDailyOvertime, getOvertimeConfig } =
  require('../src/utils/overtime');

// ────────────────────────────────────────────────────────────────

describe('getOvertimeConfig()', () => {
  it('trả về threshold=4 và rate=100000 từ DB', async () => {
    const cfg = await getOvertimeConfig();
    expect(cfg.threshold).toBe(4);
    expect(cfg.rate).toBe(100_000);
  });
});

// ────────────────────────────────────────────────────────────────

describe('calcDailyOvertime(totalTrips)', () => {
  const cases = [
    // [totalTrips, expectedOT, expectedPay]
    [0,  0, 0],
    [1,  0, 0],
    [3,  0, 0],
    [4,  0, 0],         // ngưỡng — không tăng ca
    [5,  1, 100_000],   // 1 chuyến tăng ca
    [6,  2, 200_000],   // 2 chuyến tăng ca ← spec yêu cầu
    [7,  3, 300_000],
    [10, 6, 600_000],
  ];

  test.each(cases)(
    '%d chuyến → %d tăng ca, %d đ',
    async (total, expectedOT, expectedPay) => {
      const result = await calcDailyOvertime(total);
      expect(result.overtimeTrips).toBe(expectedOT);
      expect(result.overtimePay).toBe(expectedPay);
    }
  );
});

// ────────────────────────────────────────────────────────────────

describe('calcOvertimeForTrip(tripNumberToday)', () => {
  const cases = [
    // [tripNumber, isOvertime, overtimePay]
    [1, false, 0],
    [2, false, 0],
    [3, false, 0],
    [4, false, 0],      // chuyến thứ 4 vẫn bình thường
    [5, true,  100_000],// chuyến thứ 5 là tăng ca đầu tiên
    [6, true,  100_000],// chuyến thứ 6 vẫn là tăng ca
    [9, true,  100_000],
  ];

  test.each(cases)(
    'chuyến thứ %d → isOvertime=%s, pay=%d đ',
    async (tripNum, expectedOT, expectedPay) => {
      const result = await calcOvertimeForTrip(tripNum);
      expect(result.isOvertime).toBe(expectedOT);
      expect(result.overtimePay).toBe(expectedPay);
    }
  );
});

// ────────────────────────────────────────────────────────────────

describe('Tính toán tích hợp — kịch bản thực tế', () => {
  it('Tài xế Hướng: 6 chuyến trong ngày', async () => {
    const { overtimeTrips, overtimePay } = await calcDailyOvertime(6);
    expect(overtimeTrips).toBe(2);
    expect(overtimePay).toBe(200_000);
  });

  it('Chuyến thứ 5 được gắn flag tăng ca khi tạo', async () => {
    const { isOvertime, overtimePay } = await calcOvertimeForTrip(5);
    expect(isOvertime).toBe(true);
    expect(overtimePay).toBe(100_000);
  });

  it('Chuyến thứ 4 KHÔNG tăng ca', async () => {
    const { isOvertime, overtimePay } = await calcOvertimeForTrip(4);
    expect(isOvertime).toBe(false);
    expect(overtimePay).toBe(0);
  });

  it('0 chuyến không tăng ca', async () => {
    const { overtimeTrips, overtimePay } = await calcDailyOvertime(0);
    expect(overtimeTrips).toBe(0);
    expect(overtimePay).toBe(0);
  });
});
