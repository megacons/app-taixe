import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@/stores/authStore';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/colors';

// Auth
import LoginScreen from '@/screens/auth/LoginScreen';

// Main tabs
import MainTabNavigator from './MainTabNavigator';

// Screens pushed on top of tabs
import AddTripScreen from '@/screens/trips/AddTripScreen';
import AttendanceScreen from '@/screens/employee/AttendanceScreen';
import TripDetailScreen from '@/screens/trips/TripDetailScreen';
import TodayTripsScreen from '@/screens/trips/TodayTripsScreen';
import PersonalInfoScreen from '@/screens/profile/PersonalInfoScreen';
import VehicleInfoScreen  from '@/screens/profile/VehicleInfoScreen';
import PayslipScreen      from '@/screens/profile/PayslipScreen';
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen';
import LeaveBalanceScreen from '@/screens/profile/LeaveBalanceScreen';
import GPSMapScreen from '@/screens/gps/GPSMapScreen';
import ProfileScreen from '@/screens/profile/ProfileScreen';
import ChangePasswordScreen from '@/screens/profile/ChangePasswordScreen';
import SalaryAdvanceScreen from '@/screens/requests/SalaryAdvanceScreen';
import LeaveRequestScreen from '@/screens/requests/LeaveRequestScreen';
import ExpenseRequestScreen from '@/screens/requests/ExpenseRequestScreen';
import PurchaseRequestScreen from '@/screens/requests/PurchaseRequestScreen';
import AdditionalTripScreen from '@/screens/requests/AdditionalTripScreen';
import AttendanceAdjustScreen from '@/screens/requests/AttendanceAdjustScreen';
import RequestHistoryScreen from '@/screens/requests/RequestHistoryScreen';
import RequestDetailScreen from '@/screens/requests/RequestDetailScreen';
import RewardListScreen from '@/screens/requests/RewardListScreen';
import DisciplineListScreen from '@/screens/requests/DisciplineListScreen';
import FinanceScreen from '@/screens/finance/FinanceScreen';
import NotificationsScreen from '@/screens/notifications/NotificationsScreen';
import AdminMobileScreen from '@/screens/admin/AdminMobileScreen';
import AdminTabNavigator from './AdminTabNavigator';
import AdminDriverDetail from '@/screens/admin/AdminDriverDetail';

export type RootStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  Main: undefined;
  AddTrip: undefined;
  TripDetail: { tripId: string };
  GPSMap: undefined;
  Profile: undefined;
  ChangePassword: undefined;
  SalaryAdvance: undefined;
  LeaveRequest: undefined;
  ExpenseRequest: undefined;
  PurchaseRequest: undefined;
  AdditionalTrip: undefined;
  Attendance: undefined;
  AttendanceAdjust: undefined;
  RequestHistory: { type?: string } | undefined;
  RequestDetail: { requestId: string };
  RewardList: undefined;
  DisciplineList: undefined;
  Finance: undefined;
  Notifications: undefined;
  AdminDriverDetail: { driverId: string };
  PersonalInfo: undefined;
  LeaveBalance: undefined;
  VehicleInfo:  undefined;
  Payslip:      undefined;
  TodayTrips: { date?: string; month?: number; year?: number } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
  const { isAuthenticated, loadStoredAuth, user } = useAuthStore();

  useEffect(() => {
    loadStoredAuth();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        ) : user?.role === 'driver' || user?.role === 'employee' || user?.role === 'coordinator' ? (
          /* Tài xế / Nhân viên / Điều phối → app mobile bình thường */
          <>
            <Stack.Screen name="Main" component={MainTabNavigator} />
            <Stack.Screen name="AddTrip" component={AddTripScreen} options={{ presentation: 'card', animation: 'slide_from_right' }} />
            <Stack.Screen name="TripDetail" component={TripDetailScreen} />
            <Stack.Screen name="GPSMap" component={GPSMapScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="SalaryAdvance" component={SalaryAdvanceScreen} />
            <Stack.Screen name="LeaveRequest" component={LeaveRequestScreen} />
            <Stack.Screen name="ExpenseRequest" component={ExpenseRequestScreen} />
            <Stack.Screen name="PurchaseRequest" component={PurchaseRequestScreen} />
            <Stack.Screen name="AdditionalTrip" component={AdditionalTripScreen} />
            <Stack.Screen name="Attendance"      component={AttendanceScreen} />
            <Stack.Screen name="AttendanceAdjust" component={AttendanceAdjustScreen} />
            <Stack.Screen name="RequestHistory" component={RequestHistoryScreen} />
            <Stack.Screen name="RequestDetail" component={RequestDetailScreen} />
            <Stack.Screen name="RewardList" component={RewardListScreen} />
            <Stack.Screen name="DisciplineList" component={DisciplineListScreen} />
            <Stack.Screen name="Finance" component={FinanceScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="TodayTrips" component={TodayTripsScreen} />
            <Stack.Screen name="PersonalInfo"  component={PersonalInfoScreen} />
            <Stack.Screen name="VehicleInfo"   component={VehicleInfoScreen} />
            <Stack.Screen name="Payslip"       component={PayslipScreen} />
            <Stack.Screen name="LeaveBalance"  component={LeaveBalanceScreen} />
          </>
        ) : (
          /* Accountant / Manager → Admin mobile với đầy đủ chức năng */
          <>
            <Stack.Screen name="Main" component={AdminTabNavigator} />
            <Stack.Screen name="TripDetail" component={TripDetailScreen} />
            <Stack.Screen name="RequestDetail" component={RequestDetailScreen} />
            <Stack.Screen name="AdminDriverDetail" component={AdminDriverDetail} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="Profile"       component={ProfileScreen} />
            <Stack.Screen name="TodayTrips" component={TodayTripsScreen} />
            <Stack.Screen name="PersonalInfo"  component={PersonalInfoScreen} />
            <Stack.Screen name="VehicleInfo"   component={VehicleInfoScreen} />
            <Stack.Screen name="Payslip"       component={PayslipScreen} />
            <Stack.Screen name="LeaveBalance"  component={LeaveBalanceScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/* ── Màn hình chặn admin đăng nhập nhầm mobile ── */
function AdminBlockScreen() {
  const { user, logout } = useAuthStore();
  const roleLabel: Record<string, string> = {
    manager:     'Quản lý',
    coordinator: 'Điều phối',
    accountant:  'Kế toán',
  };

  return (
    <View style={blockStyles.container}>
      <Text style={blockStyles.icon}>🖥️</Text>
      <Text style={blockStyles.title}>Vui lòng dùng Web Admin</Text>
      <Text style={blockStyles.subtitle}>
        Tài khoản <Text style={{ fontWeight: '700' }}>{user?.name}</Text>{'\n'}
        ({roleLabel[user?.role ?? ''] ?? user?.role}) không sử dụng được trên Mobile App.
      </Text>
      <Text style={blockStyles.url}>localhost:3000</Text>
      <TouchableOpacity style={blockStyles.btn} onPress={logout}>
        <Text style={blockStyles.btnText}>← Đăng xuất</Text>
      </TouchableOpacity>
    </View>
  );
}

const blockStyles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  icon:     { fontSize: 64, marginBottom: 20 },
  title:    { fontSize: 22, fontWeight: '800', color: Colors.white, textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  url: {
    fontSize: 16, fontWeight: '700', color: Colors.accent,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, marginBottom: 32,
  },
  btn: {
    backgroundColor: Colors.white, borderRadius: 12,
    paddingHorizontal: 28, paddingVertical: 14,
  },
  btnText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
});

