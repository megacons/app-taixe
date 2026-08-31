# Chuẩn chọn giờ (Time Picker)

Mọi nơi trong app mobile cần chọn giờ **phải dùng `TimePickerField`** tại:
`apps/mobile/src/components/TimePickerField.tsx`

## Format chuẩn
- **Nền tối** `#1c1c2e`
- **2 cột drum wheel** cuộn loop vô hạn: Giờ (00–23) và Phút (00–59)
- Item đang chọn: **to (30px) + trắng + đậm**
- Item xung quanh: **nhỏ (20px) + xám mờ**
- Highlight band ở giữa (border trên/dưới mờ)
- Live display giờ:phút ở header
- Nút **Hủy** / **Xác nhận** ở footer

## Kỹ thuật
- FlatList + `snapToInterval={ITEM_H}` + `decelerationRate={0.985}`
- Loop: data lặp 100 lần, init ở giữa (block 50/100)
- Chỉ dùng `onMomentumScrollEnd` — KHÔNG dùng `onScrollEndDrag` (gây nhảy số)
- `getItemLayout` để scroll chính xác

## Dùng như sau
```tsx
import TimePickerField from '@/components/TimePickerField';

<TimePickerField
  label="Giờ vào"
  value={checkInTime}
  onChange={setCheckInTime}
  required
  error={errors.checkInTime}
/>
```
