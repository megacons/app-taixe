# Chuẩn trường bắt buộc (Required Field)

Mọi trường bắt buộc trong form **phải hiển thị dấu `*` màu đỏ** ngay sau label.

## Format chuẩn

```tsx
<Text style={S.label}>
  Tên trường <Text style={S.required}>*</Text>
</Text>
```

## Style chuẩn

```ts
label:    { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
required: { color: Colors.error }, // màu đỏ
```

## Lưu ý
- Dấu `*` LUÔN nằm **sau** tên trường, cách 1 space
- Dùng `<Text>` lồng nhau để chỉ `*` có màu đỏ, không ảnh hưởng label
- Áp dụng cho mọi form: LeaveRequest, AttendanceAdjust, SalaryAdvance, ExpenseRequest, PurchaseRequest, AdditionalTrip, FinanceScreen, v.v.
- `DatePickerField` và `TimePickerField` đã có prop `required` tự xử lý
