# Chuẩn chọn ngày (Date Picker)

Mọi nơi trong app mobile cần chọn ngày/tháng/năm **phải dùng `DatePickerField`** tại:
`apps/mobile/src/components/DatePickerField.tsx`

## Format chuẩn
- Hiển thị dạng `dd/MM/yyyy` (VD: 18/08/2026)
- Nhấn vào field → mở modal calendar overlay
- Header bar màu primary hiển thị ngày đang chọn (to + trắng)
- 3 chế độ chọn:
  - **day**: calendar grid theo tháng, T2–CN, CN màu đỏ
  - **year**: danh sách cuộn chọn năm (từ 1900 đến năm hiện tại + 20)
  - **month**: grid 12 tháng (sau khi chọn năm)
- Nút **Hôm nay** ở footer
- Icon 📅 bên trái field

## Dùng như sau
```tsx
import DatePickerField from '@/components/DatePickerField';

<DatePickerField
  label="Ngày bắt đầu"
  value={startDate ?? new Date()}
  onChange={(d) => setStartDate(d)}
  required
  error={errors.startDate}
/>
```

## Lưu ý
- `value` luôn là `Date` object
- Khi chưa có giá trị, truyền `new Date()` làm default
- Không dùng TextInput hay DateTimePicker native thay thế
