# Nam Thành - Hệ thống quản lý vận chuyển đá xây dựng

## 📋 Tổng quan

Hệ thống nội bộ quản lý vận chuyển đá xây dựng gồm:
- **Mobile App** (React Native + Expo) - Ứng dụng cho tài xế
- **Web Admin** (React + Vite + TailwindCSS) - Quản lý cho điều phối/kế toán/quản lý
- **Backend API** (Node.js + Express + MongoDB) - API server
- **Triển khai**: On-premise Windows Server

## 🎨 Màu sắc thương hiệu

- **Primary**: `#163797` (Xanh đậm)
- **Accent**: `#f8b30e` (Vàng cam)

## 🏗️ Cấu trúc dự án (Monorepo)

```
nam-thanh-transport/
├── apps/
│   ├── api/          # Backend Node.js + Express + MongoDB
│   ├── web/          # Web Admin (React + Vite)
│   └── mobile/       # Mobile App (React Native + Expo)
├── docker-compose.yml
└── package.json
```

## 🚀 Yêu cầu hệ thống

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **MongoDB**: >= 7.0
- **Docker** (optional, cho môi trường dev)

## 📦 Cài đặt

### 1. Clone repository và cài đặt dependencies

```bash
# Clone repo
git clone <repository-url>
cd nam-thanh-transport

# Cài đặt tất cả dependencies (monorepo)
npm install
```

### 2. Khởi động MongoDB

#### Sử dụng Docker (khuyến nghị):

```bash
docker-compose up -d
```

MongoDB sẽ chạy tại `localhost:27017`  
MongoDB Express (GUI) tại `http://localhost:8081`

#### Hoặc cài đặt MongoDB local trên Windows:
- Tải MongoDB Community Server từ [mongodb.com](https://www.mongodb.com/try/download/community)
- Tạo database `namthanh_db`

### 3. Cấu hình môi trường

#### Backend API:
```bash
cd apps/api
cp .env.example .env
# Chỉnh sửa .env nếu cần (MongoDB URI, JWT secrets, v.v.)
```

#### Mobile App:
```bash
cd apps/mobile
cp .env.example .env
# Cập nhật API_URL với địa chỉ IP máy local (cho simulator/thiết bị thật)
```

## 🎯 Chạy ứng dụng

### Backend API

```bash
npm run dev:api
```

Server chạy tại `http://localhost:5000`

Endpoints:
- Health check: `GET http://localhost:5000/health`
- API docs: `GET http://localhost:5000/api`

### Web Admin

```bash
npm run dev:web
```

Web admin chạy tại `http://localhost:3000`

### Mobile App

```bash
npm run dev:mobile
```

Sau đó:
- Bấm `a` để chạy Android emulator
- Bấm `i` để chạy iOS simulator  
- Quét QR code bằng Expo Go app trên điện thoại thật

## 🧪 Testing

```bash
# Test tất cả workspaces
npm test

# Test riêng từng workspace
npm run test --workspace=apps/api
npm run test --workspace=apps/web
npm run test --workspace=apps/mobile
```

## 🗄️ Database Schema

### Collections chính (18):

1. **users** - Tài khoản người dùng (4 role: driver, coordinator, accountant, manager)
2. **drivers** - Thông tin tài xế
3. **vehicles** - Xe
4. **trips** - Chuyến xe
5. **tripimages** - Ảnh biên nhận chuyến
6. **gpslogs** - Lịch sử GPS
7. **requests** - Yêu cầu (tạm ứng, nghỉ phép, chi phí, v.v.)
8. **requesthistories** - Lịch sử thay đổi yêu cầu
9. **requestattachments** - File đính kèm yêu cầu
10. **notifications** - Thông báo
11. **materials** - Danh mục vật liệu
12. **locations** - Địa điểm (nơi lấy/đổ)
13. **systemconfigs** - Cấu hình hệ thống
14. **attendances** - Chấm công
15. **driverfinances** - Tài chính tài xế theo tháng

Tất cả collection có **soft delete** (is_deleted, deleted_at).

## 📱 Tính năng chính

### Mobile App (Tài xế)
- ✅ Đăng nhập
- 🔄 Dashboard 14 chức năng
- 🔄 Thêm chuyến (GPS + ảnh biên nhận + offline mode)
- 🔄 Nhật trình của tôi
- 🔄 GPS tracking realtime
- 🔄 Yêu cầu (tạm ứng, nghỉ phép, chi phí, mua hàng, v.v.)
- 🔄 Thu chi cá nhân
- 🔄 Hồ sơ cá nhân

### Web Admin
- ✅ Đăng nhập theo role
- 🔄 Dashboard & KPI
- 🔄 Quản lý tài xế & xe
- 🔄 Quản lý chuyến xe
- 🔄 Phê duyệt yêu cầu
- 🔄 GPS tracking bản đồ
- 🔄 Tài chính tài xế
- 🔄 Báo cáo Excel/PDF
- 🔄 Cấu hình hệ thống

## 🔐 Phân quyền

| Chức năng | Tài xế | Điều phối | Kế toán | Quản lý |
|-----------|--------|-----------|---------|---------|
| Mobile App | ✅ | ❌ | ❌ | ❌ |
| Xem chuyến xe | Của mình | ✅ | ✅ | ✅ |
| Quản lý tài xế/xe | ❌ | ✅ | ✅ | ✅ |
| Phê duyệt vận hành | ❌ | ✅ | ❌ | ✅ |
| Phê duyệt tài chính | ❌ | ❌ | ✅ | ✅ |
| Báo cáo | ❌ | ❌ | ✅ | ✅ |
| Cấu hình hệ thống | ❌ | ❌ | ❌ | ✅ |

## 📊 Tiến độ triển khai

- [x] Task 1: Khởi tạo monorepo + cấu hình
- [ ] Task 2: Xác thực & phân quyền
- [ ] Task 3: Quản lý tài xế & xe
- [ ] Task 4A: Mobile Dashboard + Thêm chuyến + GPS
- [ ] Task 4B: Mobile 10 màn hình yêu cầu
- [ ] Task 5: Hệ thống phê duyệt & Notification
- [ ] Task 6: GPS tracking realtime
- [ ] Task 7: Chấm công & Thu chi
- [ ] Task 8: Báo cáo Excel/PDF
- [ ] Task 9: Dashboard & KPI
- [ ] Task 10: Danh mục & Cài đặt
- [ ] Task 11: Triển khai Windows Server

## 🛠️ Stack công nghệ

### Backend
- Node.js + Express
- MongoDB + Mongoose
- JWT Authentication
- Socket.io (realtime GPS)
- Firebase FCM (push notification)
- ExcelJS + Puppeteer (export reports)

### Web Admin
- React 18 + TypeScript
- Vite
- TailwindCSS
- React Router
- Zustand (state management)
- Axios
- Recharts (charts)

### Mobile
- React Native 0.73
- Expo SDK 50
- React Navigation
- Expo Location (GPS)
- Expo Camera (ảnh biên nhận)
- AsyncStorage (offline)
- Socket.io-client

## 📞 Liên hệ

**Công ty Nam Thành**  
Dự án: Hệ thống quản lý vận chuyển đá xây dựng  
© 2024 Nam Thành Transport. All rights reserved.
