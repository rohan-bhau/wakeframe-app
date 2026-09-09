import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Activity } from '../types';

export const ACTIVITY_NOTIFICATION_CATEGORY = 'activity-start';
export const ACTIVITY_ACTIONS = {
  accept: 'accept-activity',
  ignore: 'ignore-activity',
  break: 'break-activity',
} as const;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function configureActivityNotifications() {
  if (Platform.OS === 'web') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('activity-reminders', {
      name: 'Activity reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  await Notifications.setNotificationCategoryAsync(ACTIVITY_NOTIFICATION_CATEGORY, [
    { identifier: ACTIVITY_ACTIONS.accept, buttonTitle: 'Accept', options: { opensAppToForeground: false } },
    { identifier: ACTIVITY_ACTIONS.ignore, buttonTitle: 'Ignore', options: { opensAppToForeground: false } },
    { identifier: ACTIVITY_ACTIONS.break, buttonTitle: 'Break', options: { opensAppToForeground: false } },
  ]);
}

export async function scheduleTodayActivityNotifications(activities: Activity[]) {
  if (Platform.OS === 'web') return;
  if (!(await requestNotificationPermissions())) return;

  await configureActivityNotifications();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  const today = (now.getDay() + 6) % 7;
  const todayActivities = activities.filter(
    (activity) => activity.weekday === today || (activity.weekday === undefined && today === 0),
  );

  for (const activity of todayActivities) {
    const [hours, minutes] = activity.startTime.split(':').map(Number);
    const triggerDate = new Date(now);
    triggerDate.setHours(hours, minutes, 0, 0);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || triggerDate <= now) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time to start',
        body: activity.title,
        categoryIdentifier: ACTIVITY_NOTIFICATION_CATEGORY,
        data: { activityId: activity.id },
        sound: 'default',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  }
}
