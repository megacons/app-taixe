# Hướng dẫn Deploy Nam Thành Transport

## Tổng quan
- **MongoDB Atlas** → Database (miễn phí 512MB)
- **Railway** → API Node.js (miễn phí $5 credit/tháng)
- **Vercel** → Web Admin (miễn phí)
- **Expo EAS** → Mobile APK (miễn phí)

---

## BƯỚC 1: MongoDB Atlas

1. Vào https://cloud.mongodb.com → Đăng ký miễn phí
2. Tạo **Free Cluster (M0)** → chọn region Singapore (gần Việt Nam nhất)
3. Tạo Database User: username + password mạnh
4. Network Access → Add IP Address → **Allow from anywhere** (0.0.0.0/0)
5. Connect → Drivers → Copy **connection string**:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/namthanh_db
   ```

---

## BƯỚC 2: Railway (API)

1. Vào https://railway.app → Đăng ký bằng GitHub
2. **New Project** → **Deploy from GitHub repo**
3. Chọn repo → chọn folder `apps/api`
4. Thêm **Environment Variables**:
   ```
   NODE_ENV=production
   PORT=5000
   MONGODB_URI=<connection string từ Atlas>
   JWT_SECRET=<tạo chuỗi random 64 ký tự>
   JWT_REFRESH_SECRET=<tạo chuỗi random 64 ký tự>
   JWT_EXPIRES_IN=24h
   JWT_REFRESH_EXPIRES_IN=7d
   MAIL_HOST=smtp-relay.brevo.com
   MAIL_PORT=587
   MAIL_SECURE=false
   MAIL_USER=b61f7a001@smtp-brevo.com
   MAIL_PASS=xsmtpsib-...
   MAIL_FROM=Nam Thành Transport <saothemandoe6281@gmail.com>
   ```
5. Railway tự build và deploy → copy URL: `https://xxx.railway.app`

---

## BƯỚC 3: Vercel (Web Admin)

1. Vào https://vercel.com → Đăng ký bằng GitHub
2. **New Project** → Import repo → chọn folder `apps/web`
3. **Framework**: Vite
4. **Build Command**: `npm run build`
5. **Output Directory**: `dist`
6. Thêm **Environment Variable**:
   ```
   VITE_API_URL=https://xxx.railway.app
   ```
7. Deploy → copy URL: `https://namthanh-admin.vercel.app`

---

## BƯỚC 4: Expo EAS (Mobile APK)

1. Cài EAS CLI:
   ```bash
   npm install -g eas-cli
   eas login
   ```

2. Sửa `apps/mobile/.env`:
   ```
   API_URL=https://xxx.railway.app
   ```

3. Sửa `apps/mobile/app.json` — thêm:
   ```json
   "extra": {
     "apiUrl": "https://xxx.railway.app"
   }
   ```

4. Build APK Android:
   ```bash
   cd apps/mobile
   eas build --platform android --profile preview
   ```

5. Sau khi build xong → tải APK về → cài lên điện thoại

---

## Sau khi deploy xong

| Thành phần | URL |
|---|---|
| Web Admin | https://namthanh-admin.vercel.app |
| API | https://xxx.railway.app |
| Mobile | Cài APK trực tiếp |
| Database | MongoDB Atlas (cloud) |

## Lưu ý quan trọng

- **Uploads/ảnh**: Railway có ephemeral storage (mất khi restart). Cần dùng **Cloudinary** hoặc **AWS S3** cho ảnh production.
- **MongoDB Atlas free**: 512MB — đủ cho ~100k documents
- **Railway free**: $5 credit/tháng — đủ cho team nhỏ ~10 người dùng
- **Vercel free**: Không giới hạn cho static site

## Tạo JWT Secret mạnh

Chạy lệnh này để tạo secret ngẫu nhiên:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
