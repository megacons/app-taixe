import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useConfigStore } from '@/stores/configStore';
import { useEffect } from 'react';

// Layouts
import AuthLayout from '@/layouts/AuthLayout';
import AdminLayout from '@/layouts/AdminLayout';

// Auth pages
import LoginPage from '@/pages/auth/LoginPage';

// Dashboard
import DashboardPage from '@/pages/dashboard/DashboardPage';

import AccountsPage from '@/pages/accounts/AccountsPage';
import ProfilePage from '@/pages/profile/ProfilePage';
import AttendancePage from '@/pages/attendance/AttendancePage';

// Driver management
import DriversPage from '@/pages/drivers/DriversPage';
import DriverDetailPage from '@/pages/drivers/DriverDetailPage';

// Vehicle management
import VehiclesPage from '@/pages/vehicles/VehiclesPage';

// Trips
import TripsPage from '@/pages/trips/TripsPage';

// Requests
import RequestsPage from '@/pages/requests/RequestsPage';
import RequestDetailPage from '@/pages/requests/RequestDetailPage';

// GPS Tracking
import GPSTrackingPage from '@/pages/gps/GPSTrackingPage';

// Finance
import FinancePage from '@/pages/finance/FinancePage';
import DriverFundPage from '@/pages/finance/DriverFundPage';

// Salary
import SalaryPage from '@/pages/salary/SalaryPage';

// Notifications
import NotificationsPage from '@/pages/notifications/NotificationsPage';

// Reports
import ReportsPage from '@/pages/reports/ReportsPage';

// Config
import MaterialsPage from '@/pages/config/MaterialsPage';
import SystemConfigPage from '@/pages/config/SystemConfigPage';

// Protected Route component
function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // driver và employee chỉ dùng được mobile app
  if (user && (user.role === 'driver' || user.role === 'employee')) {
    return <Navigate to="/login" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { fetchConfigs } = useConfigStore();
  useEffect(() => { fetchConfigs(); }, []);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '10px',
            background: '#333',
            color: '#fff',
          },
          success: {
            style: { background: '#10b981' },
          },
          error: {
            style: { background: '#ef4444' },
          },
        }}
      />
      <Routes>
        {/* Public routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        {/* Protected admin routes */}
        <Route
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />

          {/* Accounts */}
          <Route
            path="/accounts"
            element={
              <ProtectedRoute roles={['coordinator', 'accountant', 'manager']}>
                <AccountsPage />
              </ProtectedRoute>
            }
          />

          {/* Attendance */}
          <Route
            path="/attendance"
            element={
              <ProtectedRoute roles={['coordinator', 'accountant', 'manager']}>
                <AttendancePage />
              </ProtectedRoute>
            }
          />

          {/* Drivers */}
          <Route
            path="/drivers"
            element={
              <ProtectedRoute roles={['coordinator', 'accountant', 'manager']}>
                <DriversPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/drivers/:id"
            element={
              <ProtectedRoute roles={['coordinator', 'accountant', 'manager']}>
                <DriverDetailPage />
              </ProtectedRoute>
            }
          />

          {/* Vehicles */}
          <Route
            path="/vehicles"
            element={
              <ProtectedRoute roles={['coordinator', 'manager']}>
                <VehiclesPage />
              </ProtectedRoute>
            }
          />

          {/* Trips */}
          <Route path="/trips" element={<TripsPage />} />

          {/* Requests */}
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />

          {/* GPS */}
          <Route
            path="/gps"
            element={
              <ProtectedRoute roles={['coordinator', 'manager']}>
                <GPSTrackingPage />
              </ProtectedRoute>
            }
          />

          {/* Finance */}
          <Route
            path="/finance"
            element={
              <ProtectedRoute roles={['accountant', 'manager']}>
                <FinancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/fund"
            element={
              <ProtectedRoute roles={['coordinator', 'accountant', 'manager']}>
                <DriverFundPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/salary"
            element={
              <ProtectedRoute roles={['coordinator', 'accountant', 'manager']}>
                <SalaryPage />
              </ProtectedRoute>
            }
          />

          {/* Notifications */}
          <Route
            path="/notifications"
            element={
              <ProtectedRoute roles={['coordinator', 'accountant', 'manager']}>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />

          {/* Reports */}
          <Route
            path="/reports"
            element={
              <ProtectedRoute roles={['accountant', 'manager']}>
                <ReportsPage />
              </ProtectedRoute>
            }
          />

          {/* Config */}
          <Route
            path="/config/materials"
            element={
              <ProtectedRoute roles={['coordinator', 'manager']}>
                <MaterialsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/config/system"
            element={
              <ProtectedRoute roles={['manager']}>
                <SystemConfigPage />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Default redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
