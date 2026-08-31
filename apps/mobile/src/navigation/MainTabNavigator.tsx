import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { Colors } from '@/constants/colors';
import DashboardScreen from '@/screens/dashboard/DashboardScreen';
import TripListScreen from '@/screens/trips/TripListScreen';

const Tab = createBottomTabNavigator();

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Trips"     component={TripListScreen} />
    </Tab.Navigator>
  );
}
