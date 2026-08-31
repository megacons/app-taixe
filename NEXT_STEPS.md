# 🎯 Hướng dẫn tiếp tục phát triển

## 📍 Vị trí hiện tại

Dự án đã hoàn thành **42%** (8/19 tasks):
- ✅ Monorepo setup
- ✅ Backend API với Auth + CRUD drivers/vehicles
- ✅ Web Admin login
- ✅ Mobile login
- ✅ Database schemas + seed data

## 🚦 Task tiếp theo: #9 - Mobile Hồ sơ cá nhân

### Mục tiêu
Tạo màn hình Hồ sơ cá nhân cho tài xế với:
1. Xem thông tin cá nhân (họ tên, SĐT, biển số xe, chức vụ, ngày vào làm)
2. Đổi mật khẩu
3. Đổi avatar
4. Cập nhật thông tin (địa chỉ, người liên hệ khẩn cấp)

### API đã có sẵn
- `GET /api/drivers/:id` - Lấy thông tin driver
- `PUT /api/auth/change-password` - Đổi mật khẩu
- `POST /api/drivers/avatar` - Upload avatar
- `PUT /api/drivers/profile/me` - Update profile

### Files cần tạo

```
apps/mobile/src/
├── screens/
│   └── profile/
│       ├── ProfileScreen.tsx       # Màn hình chính
│       ├── ChangePasswordScreen.tsx
│       └── EditProfileScreen.tsx
├── components/
│   └── profile/
│       ├── ProfileHeader.tsx       # Avatar + info
│       ├── ProfileInfoCard.tsx     # Card thông tin
│       └── ProfileMenuItem.tsx     # Menu item component
└── navigation/
    └── index.tsx                   # Add routes
```

### Implementation steps

#### 1. Tạo ProfileScreen.tsx
```typescript
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function ProfileScreen({ navigation }) {
  const { user } = useAuthStore();
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get(`/drivers/${user.driver_id}`);
      setDriver(res.data.data);
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể tải thông tin');
    } finally {
      setLoading(false);
    }
  };

  // UI theo design reference với avatar, info cards, menu items
}
```

#### 2. Tạo ChangePasswordScreen.tsx
```typescript
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '@/lib/api';

export default function ChangePasswordScreen() {
  const { control, handleSubmit } = useForm();

  const onSubmit = async (data) => {
    try {
      await api.put('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      Alert.alert('Thành công', 'Đổi mật khẩu thành công');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message);
    }
  };

  // Form với 3 field: current, new, confirm
}
```

#### 3. Upload Avatar
```typescript
import * as ImagePicker from 'expo-image-picker';

const pickImage = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });

  if (!result.canceled) {
    uploadAvatar(result.assets[0]);
  }
};

const uploadAvatar = async (image) => {
  const formData = new FormData();
  formData.append('avatar', {
    uri: image.uri,
    type: 'image/jpeg',
    name: 'avatar.jpg',
  });

  try {
    const res = await api.post('/drivers/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    // Update local state
  } catch (err) {
    Alert.alert('Lỗi', 'Không thể tải ảnh lên');
  }
};
```

#### 4. Update Navigation
```typescript
// apps/mobile/src/navigation/index.tsx
<Stack.Screen name="Profile" component={ProfileScreen} />
<Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
<Stack.Screen name="EditProfile" component={EditProfileScreen} />
```

### UI Reference
Áp dụng design từ HTML bạn gửi:
- **Header xanh đậm** (#163797) với avatar tròn, viền vàng (#f8b30e)
- **Info cards** nền trắng, border nhẹ, icon Material Symbols
- **Menu items** với icon + label + arrow
- **Buttons** vàng (#f8b30e) với text đen

### Testing
```bash
# Test flow:
1. Login với tài xế: 0901000004 / 123456
2. Navigate đến Profile
3. Xem thông tin hiển thị đúng (tên, SĐT, biển số xe)
4. Đổi mật khẩu thành công
5. Upload avatar thành công
6. Update địa chỉ/contact khẩn cấp
```

---

## 🎨 Task tiếp theo: #10 - Mobile Dashboard

Sau khi hoàn thành Profile, tiếp tục với Dashboard - feature lớn nhất:

### Mục tiêu
Dashboard với 14 nút chức năng theo UI reference HTML:

1. **Header section**:
   - Avatar tròn với border vàng
   - Tên tài xế + biển số xe
   - Trạng thái (Đang làm việc / Nghỉ)
   - Nút Location

2. **KPI Cards** (3 cột):
   - Số chuyến hôm nay
   - Doanh thu hôm nay
   - Giờ làm việc

3. **Biểu đồ** doanh thu 7 ngày (bar chart)

4. **Grid 14 nút**:
   - Thêm chuyến ⭐ (priority cao)
   - Nhật trình xe
   - GPS
   - Thu / Chi
   - Tạm ứng
   - Khen thưởng
   - Kỷ luật
   - Đổi giờ
   - Nghỉ phép
   - Thanh toán
   - Mua hàng
   - Thêm số chuyến
   - Lịch sử
   - Hồ sơ

### API cần tạo (Task 11)
```javascript
// apps/api/src/routes/trips.js
GET /trips?driverId&date          // Danh sách chuyến
POST /trips                        // Tạo chuyến mới
GET /trips/summary/daily           // KPI hôm nay
POST /uploads                      // Upload ảnh biên nhận
```

### Files cần tạo
```
apps/mobile/src/
├── screens/
│   ├── dashboard/
│   │   ├── DashboardScreen.tsx
│   │   └── components/
│   │       ├── DashboardHeader.tsx
│   │       ├── KPICards.tsx
│   │       ├── RevenueChart.tsx
│   │       └── FunctionGrid.tsx
│   ├── trips/
│   │   ├── AddTripScreen.tsx     # Form thêm chuyến
│   │   ├── TripListScreen.tsx    # Nhật trình
│   │   └── TripDetailScreen.tsx
│   └── gps/
│       └── GPSMapScreen.tsx
└── services/
    ├── tripService.ts
    └── offlineService.ts          # AsyncStorage sync
```

### Priority order
1. **DashboardScreen** với header + KPI + grid (placeholder)
2. **AddTripScreen** - Form thêm chuyến (GPS + camera + offline)
3. **TripListScreen** - Nhật trình với thống kê
4. **GPSMapScreen** - Bản đồ với marker
5. API `/trips` endpoints
6. Logic tăng ca: `overtimeTrips = max(0, total - 4)`

---

## 🏗️ Cấu trúc code chuẩn

### Component pattern
```typescript
// Mobile component structure
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props {
  // Props types
}

export default function Component({ }: Props) {
  // State
  // Effects
  // Handlers
  
  return (
    <View style={styles.container}>
      {/* UI */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
```

### API call pattern
```typescript
import api from '@/lib/api';
import { useState, useEffect } from 'react';
import { Alert } from 'react-native';

const [data, setData] = useState(null);
const [loading, setLoading] = useState(false);

const fetchData = async () => {
  setLoading(true);
  try {
    const res = await api.get('/endpoint');
    setData(res.data.data);
  } catch (err) {
    Alert.alert('Lỗi', err.response?.data?.message || 'Có lỗi xảy ra');
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  fetchData();
}, []);
```

### Form pattern với react-hook-form
```typescript
import { useForm, Controller } from 'react-hook-form';
import { TextInput, Button } from 'react-native';

const { control, handleSubmit, formState: { errors } } = useForm();

const onSubmit = async (data) => {
  try {
    await api.post('/endpoint', data);
    Alert.alert('Thành công', 'Lưu thành công');
  } catch (err) {
    Alert.alert('Lỗi', err.response?.data?.message);
  }
};

<Controller
  control={control}
  name="field"
  rules={{ required: 'Trường này bắt buộc' }}
  render={({ field: { onChange, value } }) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      style={styles.input}
    />
  )}
/>
{errors.field && <Text style={styles.error}>{errors.field.message}</Text>}

<Button title="Lưu" onPress={handleSubmit(onSubmit)} />
```

---

## 📚 Resources

### Documentation
- React Native: https://reactnative.dev/
- Expo: https://docs.expo.dev/
- React Navigation: https://reactnavigation.org/
- Expo Location: https://docs.expo.dev/versions/latest/sdk/location/
- Expo Camera: https://docs.expo.dev/versions/latest/sdk/camera/
- Expo Image Picker: https://docs.expo.dev/versions/latest/sdk/imagepicker/

### Tools
- Expo Go app: Quét QR để test
- React Native Debugger: Debug app
- Postman: Test API
- MongoDB Compass: Xem database

### Colors
```typescript
// apps/mobile/src/constants/colors.ts
export const Colors = {
  primary: '#163797',      // Xanh đậm
  accent: '#f8b30e',       // Vàng cam
  white: '#ffffff',
  background: '#f3f4f6',
  success: '#10b981',
  error: '#ef4444',
  // ... more
};
```

---

## 🐛 Common Issues

### 1. API không connect được từ mobile
```bash
# Fix: Dùng IP máy thay vì localhost
# Windows: ipconfig → IPv4
# Update apps/mobile/.env:
API_URL=http://192.168.1.XXX:5000
```

### 2. Image upload không work
```typescript
// Fix: Đảm bảo Content-Type đúng
const formData = new FormData();
formData.append('file', {
  uri: Platform.OS === 'ios' ? image.uri.replace('file://', '') : image.uri,
  type: 'image/jpeg',
  name: 'photo.jpg',
});

await api.post('/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
```

### 3. GPS permissions
```typescript
// Fix: Request permissions
import * as Location from 'expo-location';

const { status } = await Location.requestForegroundPermissionsAsync();
if (status !== 'granted') {
  Alert.alert('Lỗi', 'Cần cấp quyền vị trí');
  return;
}
```

---

## ✅ Definition of Done

Trước khi mark task complete, đảm bảo:

- [ ] Code compile không lỗi
- [ ] UI match với design reference
- [ ] API call thành công
- [ ] Error handling đầy đủ
- [ ] Loading states
- [ ] Validation form
- [ ] Test trên simulator/device
- [ ] Code có comments cho logic phức tạp
- [ ] Git commit message rõ ràng

---

## 🚀 Git Workflow

```bash
# 1. Tạo branch cho task
git checkout -b task-9-mobile-profile

# 2. Commit thường xuyên
git add .
git commit -m "feat(mobile): add profile screen"
git commit -m "feat(mobile): add change password"
git commit -m "feat(mobile): add avatar upload"

# 3. Push lên remote
git push origin task-9-mobile-profile

# 4. Merge vào main khi xong
git checkout main
git merge task-9-mobile-profile
```

---

## 📞 Support

Nếu cần hỗ trợ:
1. Xem `QUICKSTART.md` để chạy dự án
2. Xem `PROGRESS.md` để biết tiến độ
3. Xem `README.md` để hiểu tổng quan
4. Check API docs: `http://localhost:5000/api`
5. Check MongoDB: `http://localhost:8081`

Good luck! 🚀
