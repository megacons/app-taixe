export const Colors = {
  primary: '#163797',
  primaryDark: '#0f2870',
  primaryLight: '#2243a3',
  accent: '#f8b30e',
  accentDark: '#f59500',

  white: '#ffffff',
  black: '#000000',

  // Grays
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',

  // Status colors
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  error: '#ef4444',
  errorLight: '#fee2e2',
  info: '#3b82f6',
  infoLight: '#dbeafe',

  // Status badge colors
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  completed: '#3b82f6',
  cancelled: '#6b7280',

  // Background
  background: '#f3f4f6',
  surface: '#ffffff',
  border: '#e5e7eb',
};

export type ColorKey = keyof typeof Colors;
