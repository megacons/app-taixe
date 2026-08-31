# Chuẩn gửi Email OTP (Quên mật khẩu)

## Cấu hình hoạt động (Brevo SMTP)

```env
MAIL_HOST=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=b61f7a001@smtp-brevo.com
MAIL_PASS=xsmtpsib-e6631f92d39474ac3dbf2e07c57158a18f8d0012367a08a41294d82400bffdd7-Wd7z43mXTMW0MsjS
MAIL_FROM=Nam Thành Transport <saothemandoe6281@gmail.com>
```

## Luồng hoạt động

1. User nhập email trong màn hình "Quên mật khẩu"
2. API `POST /auth/forgot-password` tìm user theo email trong DB
3. Tạo OTP 6 số, lưu vào memory (5 phút)
4. Gửi OTP qua Brevo SMTP đến email đó
5. User nhập OTP → `POST /auth/verify-otp` → trả về resetToken
6. User nhập mật khẩu mới → `POST /auth/reset-password`

## Format email OTP

- **From**: `Nam Thành Transport <saothemandoe6281@gmail.com>`
- **Subject**: `[Nam Thành] Mã OTP: XXXXXX`
- **Body**: HTML card xanh navy, số OTP to, hết hạn 5 phút

## Đồng bộ email

- Admin nhập email trong "Cập nhật tài xế" → lưu vào `User.email`
- Tài xế nhập email trong "Hồ sơ" → `PUT /auth/update-email` → lưu vào `User.email`
- Quên mật khẩu dùng email này để nhận OTP

## Lưu ý

- Brevo free: 300 email/ngày
- OTP hết hạn sau 5 phút
- Không cần verify domain — gửi được đến mọi email
