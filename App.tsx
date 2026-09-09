import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { auth } from './src/config/firebase';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { RoutineBuilderScreen } from './src/screens/RoutineBuilderScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { configureActivityNotifications, requestNotificationPermissions } from './src/services/notifications';
import { colors } from './src/theme';

export type RootTabParamList = {
  Today: undefined;
  'Routine Builder': undefined;
  Analytics: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surfaceContainer,
    text: colors.onSurface,
    border: colors.outlineVariant,
    primary: colors.tertiary,
  },
};

export default function App() {
  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setUid(user?.uid ?? null);
    setAuthLoading(false);
  }), []);

  useEffect(() => {
    if (!uid) return;

    void requestNotificationPermissions().then((granted) => {
      if (granted) void configureActivityNotifications();
    });
  }, [uid]);

  if (authLoading) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.tertiary} />
      </View>
    );
  }

  if (!uid) {
    return <AuthScreen />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.tertiary,
          tabBarInactiveTintColor: colors.outline,
          tabBarStyle: { backgroundColor: colors.surfaceContainer, borderTopColor: colors.outlineVariant },
          tabBarLabelStyle: { fontSize: 12 },
        }}
      >
        <Tab.Screen name="Today" component={TodayScreen} />
        <Tab.Screen name="Routine Builder">
          {() => <RoutineBuilderScreen uid={uid} />}
        </Tab.Screen>
        <Tab.Screen name="Analytics" component={AnalyticsScreen} />
        <Tab.Screen name="Settings">
          {() => <SettingsScreen onLogout={() => signOut(auth)} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center' },
});
