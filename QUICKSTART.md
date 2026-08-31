# 🚀 Hướng dẫn chạy nhanh - Nam Thành Transport

## Bước 1: Cài đặt dependencies

```bash
# Từ thư mục gốc
npm install
```

Lệnh này sẽ cài tất cả dependencies cho cả 3 workspace (api, web, mobile).

## Bước 2: Khởi động MongoDB

### Option A: Sử dụng Docker (Khuyến nghị)

```bash
docker-compose up -d
```

MongoDB sẽ chạy tại: `mongodb://localhost:27017`  
MongoDB Express (GUI): `http://localhost:8081`
- Username: `admin`
- Password: `namthanh@2024`

### Option B: MongoDB local trên Windows

Nếu bạn đã cài MongoDB trên Windows:

1. Khởi động MongoDB service
2. MongoDB sẽ chạy tại `mongodb://localhost:27017`

## Bước 3: Seed dữ liệu mẫu

```bash
cd apps/api
npm run seed
```

Script này sẽ tạo:
- ✅ **5 tài khoản** (mật khẩu: `123456`):
  - Quản lý: `0901000001` / 123456
  - Điều phối: `0901000002` / 123456
  - Kế toán: `0901000003` / 123456
  - Tài xế 1: `0901000004` / 123456 (xe 51C-12345)
  - Tài xế 2: `0901000005` / 123456 (xe 51C-67890)
- ✅ **2 xe**: Hino FM8JW7A, Hyundai HD320
- ✅ **3 vật liệu**: Đá 1x2, Đá 4x6, Cát xây dựng
- ✅ **System configs**: Ngưỡng tăng ca (4 chuyến), mức lương tăng ca (100k/chuyến)

## Bước 4: Chạy Backend API

```bash
# Terminal 1
npm run dev:api
```

Server khởi động tại: `http://localhost:5000`

Kiểm tra health:
```bash
curl http://localhost:5000/health
```

Output:
```json
{
  "status": "ok",
  "timestamp": "...",
  "service": "Nam Thanh Transport API",
  "database": "connected"
}
```

## Bước 5: Chạy Web Admin

```bash
# Terminal 2
npm run dev:web
```

Web Admin: `http://localhost:3000`

### Test đăng nhập Web Admin:

1. Mở `http://localhost:3000`
2. Đăng nhập với:
   - **Quản lý**: `0901000001` / `123456`
   - **Điều phối**: `0901000002` / `123456`
   - **Kế toán**: `0901000003` / `123456`
3. Sau khi đăng nhập → redirect đến Dashboard

## Bước 6: Chạy Mobile App

### Chuẩn bị:

1. Cài Expo Go trên điện thoại:
   - iOS: App Store → Tìm "Expo Go"
   - Android: Play Store → Tìm "Expo Go"

2. **Quan trọng**: Cập nhật API URL trong mobile:

```bash
cd apps/mobile
```

Tạo file `.env`:
```env
API_URL=http://192.168.1.XXX:5000
```

Thay `192.168.1.XXX` bằng địa chỉ IP máy tính của bạn:
- Windows: `ipconfig` → tìm IPv4 Address
- macOS/Linux: `ifconfig` → tìm inet

**Lưu ý**: Điện thoại và máy tính phải cùng mạng WiFi.

### Chạy app:

```bash
# Terminal 3
npm run dev:mobile
```

Sau khi server Expo khởi động:
- Quét QR code bằng Expo Go app
- Hoặc bấm `a` để mở Android emulator
- Hoặc bấm `i` để mở iOS simulator

### Test đăng nhập Mobile:

1. App mở → màn hình đăng nhập màu xanh #163797
2. Đăng nhập với tài khoản tài xế:
   - SĐT: `0901000004`
   - Mật khẩu: `123456`
3. Sau khi đăng nhập → màn hình Home placeholder

## ✅ Kiểm tra hoàn thành Task 1 & 2

Nếu tất cả bước trên chạy thành công:

- ✅ **Monorepo**: npm workspaces hoạt động
- ✅ **Docker**: MongoDB + Mongo Express
- ✅ **API**: Server khởi động, health check OK
- ✅ **Database**: Mongoose kết nối, seed data thành công
- ✅ **Auth API**: Login/logout/refresh token
- ✅ **Web Admin**: UI đăng nhập, JWT auth, redirect theo role
- ✅ **Mobile**: UI đăng nhập với màu sắc brand, JWT auth

## 🧪 Chạy tests

```bash
# Test tất cả
npm test

# Test riêng API
cd apps/api
npm test
```

Tests kiểm tra:
- ✅ Health check endpoint
- ✅ MongoDB connection
- ✅ Auth login API
- ✅ Token validation
- ✅ Role authorization

## 📊 Tiếp theo: Task 3 - Quản lý tài xế & xe

Sau khi hoàn thành Task 1 & 2, tiếp tục với:
- API CRUD `/drivers`, `/vehicles`
- Web Admin: Danh sách tài xế, form thêm/sửa, gán xe
- Mobile: Màn hình Hồ sơ cá nhân, đổi mật khẩu

## 🆘 Troubleshooting

### MongoDB không kết nối được

```bash
# Kiểm tra Docker
docker ps

# Restart MongoDB
docker-compose restart mongodb

# Xem logs
docker-compose logs mongodb
```

### Web/Mobile không call được API

1. Kiểm tra API đang chạy: `http://localhost:5000/health`
2. Kiểm tra firewall không block port 5000
3. Mobile: Kiểm tra IP địa chỉ đúng, cùng WiFi

### Seed data bị lỗi

```bash
# Clear database và seed lại
cd apps/api
mongo namthanh_db --eval "db.dropDatabase()"
npm run seed
```

### Expo không quét được QR code

1. Đảm bảo cùng mạng WiFi
2. Tắt VPN nếu đang bật
3. Thử tunnel mode: `npm run dev:mobile -- --tunnel`

## 📞 Support

Nếu gặp vấn đề, kiểm tra:
- Node version: `node -v` (cần >= 18)
- npm version: `npm -v` (cần >= 9)
- Docker running: `docker ps`
- MongoDB connection string đúng trong `.env`
