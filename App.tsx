import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import {
  addNotificationResponseReceivedListener,
  DEFAULT_ACTION_IDENTIFIER,
} from 'expo-notifications/build/NotificationsEmitter';
import { dismissNotificationAsync } from 'expo-notifications/build/dismissNotificationAsync';
import type { NotificationResponse } from 'expo-notifications/build/Notifications.types';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
const quickBreakDurations = [5, 10, 15, 30];

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
  const [breakResponse, setBreakResponse] = useState<NotificationResponse | null>(null);
  const [breakDuration, setBreakDuration] = useState('15');

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
        return;
      }
      if (response.actionIdentifier === ACTIVITY_ACTIONS.break) {
        setBreakDuration('15');
        setBreakResponse(response);
        return;
      }

      void handleNotificationResponse(uid, response).catch(() => undefined);
    };

    const subscription = addNotificationResponseReceivedListener((response) => {
      processResponse(response);
    });

    return () => {
      subscription.remove();
    };
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
    <>
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
      <BreakDurationModal
        duration={breakDuration}
        onChangeDuration={setBreakDuration}
        onClose={() => setBreakResponse(null)}
        onConfirm={() => {
          if (!breakResponse) return;
          const requestedDuration = Number(breakDuration);
          if (!Number.isFinite(requestedDuration) || requestedDuration <= 0) {
            Alert.alert('Invalid duration', 'Enter a break duration greater than zero.');
            return;
          }

          const maxBreakMinutes = Number((breakResponse.notification.request.content.data as { maxBreakMinutes?: string } | undefined)?.maxBreakMinutes);
          const actualDuration = maxBreakMinutes > 0 ? Math.min(requestedDuration, maxBreakMinutes) : requestedDuration;
          const responseToHandle = breakResponse;
          setBreakResponse(null);
          void handleNotificationResponse(uid, responseToHandle, actualDuration)
            .catch(() => Alert.alert('Could not start break', 'Please try again.'));
        }}
        requestedDuration={Number(breakDuration)}
        maxBreakMinutes={Number((breakResponse?.notification.request.content.data as { maxBreakMinutes?: string } | undefined)?.maxBreakMinutes)}
      />
    </>
  );
}

function BreakDurationModal({
  duration,
  maxBreakMinutes,
  requestedDuration,
  onChangeDuration,
  onClose,
  onConfirm,
}: {
  duration: string;
  maxBreakMinutes: number;
  requestedDuration: number;
  onChangeDuration: (duration: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const willBeCapped = maxBreakMinutes > 0 && requestedDuration > maxBreakMinutes;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.modalBackdrop}>
        <View style={styles.breakModal}>
          <Text style={styles.modalTitle}>Add break</Text>
          <Text style={styles.modalDescription}>How long should this break be?</Text>
          <View style={styles.quickDurations}>
            {quickBreakDurations.map((minutes) => (
              <Pressable key={minutes} onPress={() => onChangeDuration(String(minutes))} style={[styles.quickDuration, duration === String(minutes) && styles.selectedQuickDuration]}>
                <Text style={[styles.quickDurationText, duration === String(minutes) && styles.selectedQuickDurationText]}>{minutes} min</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            accessibilityLabel="Break duration in minutes"
            keyboardType="number-pad"
            onChangeText={onChangeDuration}
            style={styles.breakInput}
            value={duration}
          />
          {willBeCapped ? <Text style={styles.capNote}>Limited to {maxBreakMinutes} minutes by this activity&apos;s break cap.</Text> : null}
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable>
            <Pressable onPress={onConfirm} style={styles.confirmButton}><Text style={styles.confirmButtonText}>Start break</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.7)', flex: 1, justifyContent: 'center', padding: 24 },
  breakModal: { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant, borderWidth: 1, padding: 20, width: '100%' },
  modalTitle: { color: colors.onSurface, fontSize: 22, fontWeight: '500', marginBottom: 6 },
  modalDescription: { color: colors.onSurfaceVariant, fontSize: 15, marginBottom: 18 },
  quickDurations: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  quickDuration: { alignItems: 'center', borderColor: colors.outlineVariant, borderWidth: 1, flex: 1, minHeight: 40, justifyContent: 'center' },
  selectedQuickDuration: { backgroundColor: colors.progressTeal, borderColor: colors.progressTeal },
  quickDurationText: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  selectedQuickDurationText: { color: colors.background },
  breakInput: { borderBottomColor: colors.outlineVariant, borderBottomWidth: 1, color: colors.onSurface, fontSize: 18, minHeight: 44, paddingVertical: 8 },
  capNote: { color: colors.tertiary, fontSize: 13, lineHeight: 19, marginTop: 10 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  cancelButton: { alignItems: 'center', borderColor: colors.outlineVariant, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44 },
  cancelButtonText: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' },
  confirmButton: { alignItems: 'center', backgroundColor: colors.tertiary, flex: 1, justifyContent: 'center', minHeight: 44 },
  confirmButtonText: { color: colors.background, fontSize: 13, fontWeight: '600' },
});
