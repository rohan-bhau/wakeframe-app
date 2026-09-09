import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { db } from '../config/firebase';
import type { Activity } from '../types';

export const ACTIVITY_NOTIFICATION_CATEGORY = 'activity-start';
export const CHECK_IN_NOTIFICATION_CATEGORY = 'activity-check-in';
export const ACTIVITY_ACTIONS = {
  accept: 'accept-activity',
  ignore: 'ignore-activity',
  break: 'break-activity',
  yes: 'complete-activity',
  notYet: 'continue-activity',
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
  await Notifications.setNotificationCategoryAsync(CHECK_IN_NOTIFICATION_CATEGORY, [
    { identifier: ACTIVITY_ACTIONS.yes, buttonTitle: 'Yes', options: { opensAppToForeground: false } },
    { identifier: ACTIVITY_ACTIONS.notYet, buttonTitle: 'Not yet', options: { opensAppToForeground: false } },
    { identifier: ACTIVITY_ACTIONS.ignore, buttonTitle: 'Ignore', options: { opensAppToForeground: false } },
    { identifier: ACTIVITY_ACTIONS.break, buttonTitle: 'Add Break', options: { opensAppToForeground: false } },
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
    const startDate = getTimeOnDate(now, activity.startTime);
    if (startDate && startDate > now) {
      await scheduleNotification({
        title: 'Time to start',
        body: activity.title,
        categoryIdentifier: ACTIVITY_NOTIFICATION_CATEGORY,
        data: { activityId: activity.id, date: getDateKey(now), phase: 'start' },
        date: startDate,
      });
    }

    const endDate = getEndDate(now, activity, startDate);
    if (endDate && endDate > now) {
      await scheduleNotification({
        title: `Check in: ${activity.title}`,
        body: `Did you finish ${activity.title}? Ready for next?`,
        categoryIdentifier: CHECK_IN_NOTIFICATION_CATEGORY,
        data: { activityId: activity.id, date: getDateKey(now), phase: 'check-in' },
        date: endDate,
      });
    }
  }
}

export async function handleNotificationResponse(uid: string, response: Notifications.NotificationResponse) {
  if (Platform.OS === 'web' || response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) return;

  const data = (response.notification.request.content.data ?? {}) as { activityId?: unknown; date?: unknown };
  if (typeof data.activityId !== 'string' || typeof data.date !== 'string') return;

  const stateByAction: Record<string, { state: string; timestampField?: string }> = {
    [ACTIVITY_ACTIONS.accept]: { state: 'in_progress', timestampField: 'startedAt' },
    [ACTIVITY_ACTIONS.ignore]: { state: 'ignored', timestampField: 'ignoredAt' },
    [ACTIVITY_ACTIONS.break]: { state: 'break' },
    [ACTIVITY_ACTIONS.yes]: { state: 'completed', timestampField: 'completedAt' },
    [ACTIVITY_ACTIONS.notYet]: { state: 'in_progress' },
  };
  const transition = stateByAction[response.actionIdentifier];
  if (!transition) return;

  const instance = {
    activityId: data.activityId,
    date: data.date,
    state: transition.state,
    ...(transition.timestampField ? { [transition.timestampField]: new Date().toISOString() } : {}),
  };
  await setDoc(doc(db, 'users', uid, 'activityInstances', `${data.activityId}_${data.date}`), instance, { merge: true });
}

async function scheduleNotification({
  title,
  body,
  categoryIdentifier,
  data,
  date,
}: {
  title: string;
  body: string;
  categoryIdentifier: string;
  data: Record<string, string>;
  date: Date;
}) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, categoryIdentifier, data, sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTimeOnDate(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function getEndDate(date: Date, activity: Activity, startDate: Date | null) {
  const endDate = activity.endTime ? getTimeOnDate(date, activity.endTime) : null;
  if (endDate && startDate && endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
  if (endDate) return endDate;

  if (startDate && Number.isFinite(activity.duration) && (activity.duration ?? 0) > 0) {
    const result = new Date(startDate);
    result.setMinutes(result.getMinutes() + (activity.duration ?? 0));
    return result;
  }

  return null;
}
