/**
 * Admin navigation — dùng Stack thay Tab để ẩn footer tab bar.
 * AdminDashboard là màn hình chính, các màn hình khác navigate từ đó.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AdminDashboard      from '@/screens/admin/AdminDashboard';
import AdminDrivers        from '@/screens/admin/AdminDrivers';
import AdminRequests       from '@/screens/admin/AdminRequests';
import AdminFund           from '@/screens/admin/AdminFund';
import AdminNotifications  from '@/screens/admin/AdminNotifications';
import AdminProfile        from '@/screens/admin/AdminProfile';
import AdminSalaryDetail   from '@/screens/admin/AdminSalaryDetail';

const Stack = createNativeStackNavigator();

export default function AdminTabNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard"     component={AdminDashboard} />
      <Stack.Screen name="Drivers"       component={AdminDrivers} />
      <Stack.Screen name="Requests"      component={AdminRequests} />
      <Stack.Screen name="Fund"          component={AdminFund} />
      <Stack.Screen name="Notifications" component={AdminNotifications} />
      <Stack.Screen name="Profile"       component={AdminProfile} />
      <Stack.Screen name="AdminSalaryDetail" component={AdminSalaryDetail} />
    </Stack.Navigator>
  );
}
