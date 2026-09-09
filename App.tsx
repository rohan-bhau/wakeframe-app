import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import {
  addNotificationResponseReceivedListener,
  clearLastNotificationResponse,
  DEFAULT_ACTION_IDENTIFIER,
  getLastNotificationResponse,
} from 'expo-notifications/build/NotificationsEmitter';
import { dismissNotificationAsync } from 'expo-notifications/build/dismissNotificationAsync';
import type { NotificationResponse } from 'expo-notifications/build/Notifications.types';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { auth } from './src/config/firebase';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { RoutineBuilderScreen } from './src/screens/RoutineBuilderScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { ACTIVITY_ACTIONS, configureActivityNotifications, handleNotificationResponse, requestNotificationPermissions } from './src/services/notifications';
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
    }).catch(() => undefined);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const processResponse = (response: NotificationResponse) => {
      void dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);

      if (response.actionIdentifier === DEFAULT_ACTION_IDENTIFIER) {
        showNotificationActions(uid, response);
        return;
      }

      void handleNotificationResponse(uid, response).catch(() => undefined);
    };

    const subscription = addNotificationResponseReceivedListener((response) => {
      processResponse(response);
    });

    const lastResponse = getLastNotificationResponse();
    if (lastResponse) {
      clearLastNotificationResponse();
      processResponse(lastResponse);
    }

    return () => subscription.remove();
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

function showNotificationActions(uid: string, response: NotificationResponse) {
  const content = response.notification.request.content;
  const data = content.data as { phase?: string } | undefined;
  const isCheckIn = data?.phase === 'check-in';
  const actionIds = isCheckIn
    ? [ACTIVITY_ACTIONS.yes, ACTIVITY_ACTIONS.notYet, ACTIVITY_ACTIONS.ignore, ACTIVITY_ACTIONS.break]
    : [ACTIVITY_ACTIONS.accept, ACTIVITY_ACTIONS.ignore, ACTIVITY_ACTIONS.break];
  const labels = isCheckIn ? ['Yes', 'Not yet', 'Ignore', 'Add Break'] : ['Accept', 'Ignore', 'Break'];

  Alert.alert(content.title ?? 'Activity', content.body ?? '', actionIds.map((actionIdentifier, index) => ({
    text: labels[index],
    onPress: () => void handleNotificationResponse(uid, { ...response, actionIdentifier } as NotificationResponse).catch(() => undefined),
  })));
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center' },
});
