import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DriverDashboardScreen } from '../screens/DriverDashboardScreen';
import { OutreachScreen } from '../screens/OutreachScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { LegRouteScreen } from '../screens/LegRouteScreen';
import type { MainTabParamList, RootStackParamList } from './types';
import { colors } from '../theme';

const Tabs = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color, size }) => {
          const icon = route.name === 'Driver' ? 'truck-fast-outline' : route.name === 'Outreach' ? 'email-fast-outline' : 'account-circle-outline';
          return <MaterialCommunityIcons name={icon as any} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Driver" component={DriverDashboardScreen} options={{ title: 'Driver Board' }} />
      <Tabs.Screen name="Outreach" component={OutreachScreen} options={{ title: 'Outreach' }} />
      <Tabs.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
    </Tabs.Navigator>
  );
}

export function MainNavigator() {
  return (
    <NavigationContainer
      theme={{
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: colors.background,
          card: colors.card,
          text: colors.text,
          border: colors.border,
          primary: colors.primary,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="LegRoute" component={LegRouteScreen} options={{ title: 'In-App Directions' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
