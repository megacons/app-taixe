# 📊 Tiến độ dự án Nam Thành Transport

**Ngày cập nhật**: 2024  
**Tiến độ tổng thể**: 8/19 tasks (42%)

---

## ✅ Đã hoàn thành (8/19)

### Task 1: Khởi tạo Monorepo ✅
- [x] Cấu trúc monorepo với npm workspaces
- [x] ESLint + Prettier
- [x] Docker Compose (MongoDB + Mongo Express)
- [x] apps/api: Node.js + Express + Mongoose
- [x] apps/web: React + Vite + TailwindCSS
- [x] apps/mobile: React Native + Expo

**Stack kỹ thuật**:
- Monorepo: npm workspaces
- Backend: Node.js 18+, Express, Mongoose, Socket.io
- Web: React 18, Vite, TailwindCSS, Zustand
- Mobile: React Native 0.73, Expo SDK 50
- Database: MongoDB 7.0
- Colors: Primary `#163797`, Accent `#f8b30e`

### Task 2: Xác thực & Phân quyền ✅
- [x] Schema User (4 roles: driver, coordinator, accountant, manager)
- [x] API Auth: `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/change-password`
- [x] Middleware: `authenticate`, `authorize(roles)`
- [x] Middleware: `validate` (express-validator)
- [x] Middleware: `upload` (multer)
- [x] Seed data: 5 users, 2 xe, 3 vật liệu
- [x] Web Admin: Màn hình login + redirect theo role
- [x] Mobile: Màn hình login với brand colors
- [x] JWT token + refresh token
- [x] Tests: health check + auth API

**Tài khoản seed**:
- Quản lý: `0901000001` / `123456`
- Điều phối: `0901000002` / `123456`
- Kế toán: `0901000003` / `123456`
- Tài xế 1: `0901000004` / `123456` (xe 51C-12345)
- Tài xế 2: `0901000005` / `123456` (xe 51C-67890)

### Task 3: Quản lý tài xế & xe ✅
- [x] API CRUD `/drivers`:
  - GET list (pagination, search, filter)
  - GET detail
  - POST create (auto tạo User account)
  - PUT update
  - DELETE soft delete
  - POST assign-vehicle
  - PUT profile/me
  - POST avatar upload
- [x] API CRUD `/vehicles`:
  - GET list (pagination, search, filter)
  - GET detail
  - POST create
  - PUT update
  - DELETE soft delete
  - POST assign-driver
  - POST unassign-driver

**Schema hoàn chỉnh**:
- User, Driver, Vehicle, Trip, TripImage, GPSLog
- Request (unified), RequestHistory, RequestAttachment
- Notification, Material, Location, SystemConfig
- Attendance, DriverFinance
- Tất cả có soft delete plugin

---

## 🔄 Đang thực hiện

### Task 9: Mobile - Hồ sơ cá nhân (NEXT)
Cần làm:
- [ ] Màn hình Hồ sơ cá nhân (xem thông tin driver)
- [ ] Form đổi mật khẩu
- [ ] Upload avatar
- [ ] Update thông tin cá nhân (address, emergency contact)

**UI Reference**: Đã nhận từ user - thiết kế đẹp với header xanh, avatar, biển số xe

---

## 📋 Sắp tới (11 tasks)

### Task 10: Mobile Dashboard 14 nút ⏳
**Priority: HIGH** - Core feature
- [ ] Dashboard với 14 nút chức năng (theo UI reference)
- [ ] Header: avatar, tên, biển số xe, trạng thái
- [ ] 3 KPI cards: Số chuyến, Doanh thu, Giờ làm
- [ ] Biểu đồ doanh thu 7 ngày
- [ ] Grid 14 nút: Thêm chuyến, Nhật trình, GPS, Thu/Chi, Tạm ứng, Khen thưởng, Kỷ luật, Đổi giờ, Nghỉ phép, Thanh toán, Mua hàng, Thêm số chuyến, Lịch sử, Hồ sơ

### Task 10A: Thêm chuyến (GPS + ảnh + offline)
- [ ] Form thêm chuyến: date, material, pickup/drop, income/expense, note
- [ ] GPS tự động + nút làm mới
- [ ] Chụp/upload ảnh biên nhận (bắt buộc)
- [ ] Offline mode: lưu AsyncStorage → sync khi có mạng
- [ ] Validate + Toast

### Task 10B: Nhật trình của tôi
- [ ] Danh sách chuyến trong ngày
- [ ] Tìm kiếm, lọc ngày/tháng
- [ ] Thống kê realtime: tổng chuyến, thu, chi, tăng ca
- [ ] Xem chi tiết + ảnh biên nhận

### Task 10C: GPS Map
- [ ] Google Maps với marker vị trí hiện tại
- [ ] Nút bật/tắt GPS tracking
- [ ] Gửi vị trí về server khi bật

### Task 11: API trips, uploads, gps/ping, logic tăng ca
- [ ] POST `/trips` (create trip)
- [ ] GET `/trips` (list với filter)
- [ ] GET `/trips/summary/daily?driverId&date`
- [ ] POST `/uploads` (upload ảnh)
- [ ] POST `/gps/ping`
- [ ] Logic tăng ca: đếm trip trong ngày → `overtimeTrips = max(0, total - 4)`, `overtimePay = overtimeTrips × 100.000đ`

### Task 12: Mobile 10 màn hình yêu cầu
- [ ] Thu/Chi (lịch sử + tổng)
- [ ] Tạm ứng lương (form)
- [ ] Khen thưởng (chỉ xem)
- [ ] Kỷ luật (chỉ xem)
- [ ] Thay đổi giờ vào/ra (form)
- [ ] Nghỉ phép (form)
- [ ] Thanh toán chi phí (form)
- [ ] Mua hàng (form)
- [ ] Thêm số chuyến (form)
- [ ] Lịch sử yêu cầu (tất cả yêu cầu + filter)

### Task 13: Hệ thống phê duyệt & Notification
- [ ] API: PUT `/requests/:id/approve`, PUT `/requests/:id/reject`
- [ ] Phân quyền phê duyệt theo role
- [ ] Firebase FCM push notification
- [ ] Schema RequestHistory
- [ ] Web Admin: trang Quản lý yêu cầu
- [ ] Mobile: badge thông báo + màn hình notifications

### Task 14: GPS realtime
- [ ] Schema GPSLog
- [ ] WebSocket Socket.io broadcast realtime
- [ ] Mobile: Expo Location background (ping 30s)
- [ ] Web Admin: Google Maps hiển thị tất cả xe
- [ ] Cài đặt bật/tắt tracking cho từng xe

### Task 15: Chấm công & Thu chi cá nhân
- [ ] Schema Attendance, DriverFinance
- [ ] Logic tổng hợp từ trips + requests đã duyệt
- [ ] Mobile: check-in/out, màn hình "Thu Chi" theo tháng
- [ ] Web Admin: chi tiết tài chính tài xế, chỉnh sửa thủ công
- [ ] Đúng cấu trúc Excel mẫu

### Task 16: Báo cáo & Xuất Excel/PDF
- [ ] ExcelJS: sổ tài xế theo tháng
- [ ] Puppeteer: nhật trình xe PDF
- [ ] API: GET `/reports/driver-monthly`, `/reports/trip-log`, `/reports/payroll`
- [ ] Web Admin: nút xuất trên từng trang

### Task 17: Dashboard & KPI
- [ ] Web Admin Dashboard đầy đủ
- [ ] KPI: tổng chuyến hôm nay, xe hoạt động, doanh thu/chi phí tháng, yêu cầu chờ duyệt
- [ ] Biểu đồ Recharts: doanh thu theo tháng, top tài xế
- [ ] Caching in-memory

### Task 18: Danh mục & Cài đặt
- [ ] Web Admin: CRUD Material
- [ ] Web Admin: CRUD SystemConfig
- [ ] Mobile: dropdown vật liệu từ danh mục
- [ ] Mobile: nơi lấy/đổ nhập tự do

### Task 19: Triển khai on-premise
- [ ] PM2 chạy Node.js trên Windows Server
- [ ] MongoDB auth + backup script + Task Scheduler
- [ ] Nginx reverse proxy
- [ ] Build APK Android
- [ ] Tài liệu vận hành: restart, log, restore

---

## 🎯 Ưu tiên tiếp theo

1. **Task 9**: Mobile Hồ sơ cá nhân (nhanh, dễ)
2. **Task 10-11**: Mobile Dashboard + API trips (core feature lớn nhất)
3. **Task 12**: Mobile 10 màn hình yêu cầu (nhiều form)
4. **Task 13**: Phê duyệt + Notification (workflow quan trọng)
5. **Task 14**: GPS realtime (feature wow)
6. **Task 15-17**: Tài chính + Báo cáo + Dashboard
7. **Task 18-19**: Danh mục + Triển khai

---

## 📦 Files đã tạo

### Root
- `package.json` - Monorepo config
- `.eslintrc.js`, `.prettierrc` - Code quality
- `.gitignore`
- `docker-compose.yml` - MongoDB dev environment
- `README.md` - Project overview
- `QUICKSTART.md` - Hướng dẫn chạy nhanh
- `PROGRESS.md` - File này

### apps/api
- `src/index.js` - Express server
- `src/models/` - 15+ Mongoose schemas với soft delete
- `src/middleware/` - auth, validate, upload
- `src/routes/` - auth, drivers, vehicles
- `src/seeds/index.js` - Seed data script
- `tests/health.test.js` - Jest tests
- `.env` - Environment variables
- `package.json`

### apps/web
- `src/App.tsx` - React Router config
- `src/pages/` - Placeholder pages
- `src/components/layout/` - Sidebar, Header
- `src/stores/authStore.ts` - Zustand auth state
- `src/lib/api.ts` - Axios instance
- `index.html`, `vite.config.ts`, `tailwind.config.js`
- `package.json`

### apps/mobile
- `App.tsx` - Expo app entry
- `app.json` - Expo config
- `src/navigation/` - React Navigation
- `src/screens/` - Login, Home
- `src/stores/authStore.ts` - Zustand auth
- `src/lib/api.ts` - Axios với AsyncStorage
- `src/constants/colors.ts` - Brand colors
- `package.json`

---

## 🚀 Cách chạy dự án

```bash
# 1. Install dependencies
npm install

# 2. Start MongoDB
docker-compose up -d

# 3. Seed data
cd apps/api
npm run seed

# 4. Start API (Terminal 1)
npm run dev:api

# 5. Start Web Admin (Terminal 2)
npm run dev:web

# 6. Start Mobile (Terminal 3)
npm run dev:mobile
```

Chi tiết xem `QUICKSTART.md`

---

## 📞 Liên hệ

**Dự án**: Nam Thành - Hệ thống quản lý vận chuyển đá xây dựng  
**Stack**: MERN (MongoDB, Express, React, React Native) + Expo  
**Status**: 42% complete (8/19 tasks)

---

_Last updated: Session với Kiro AI_
