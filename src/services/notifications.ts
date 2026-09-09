import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { SchedulableTriggerInputTypes, type NotificationResponse, type NotificationTaskPayload } from 'expo-notifications/build/Notifications.types';
import { DEFAULT_ACTION_IDENTIFIER } from 'expo-notifications/build/NotificationsEmitter';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { BackgroundNotificationTaskResult, registerTaskAsync } from 'expo-notifications/build/registerTaskAsync';
import { cancelAllScheduledNotificationsAsync } from 'expo-notifications/build/cancelAllScheduledNotificationsAsync';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { setNotificationCategoryAsync } from 'expo-notifications/build/setNotificationCategoryAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { isRunningInExpoGo } from 'expo';
import * as TaskManager from 'expo-task-manager';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { db } from '../config/firebase';
import type { Activity } from '../types';

export const ACTIVITY_NOTIFICATION_CATEGORY = 'activity-start';
export const CHECK_IN_NOTIFICATION_CATEGORY = 'activity-check-in';
export const BREAK_OVER_NOTIFICATION_CATEGORY = 'break-over';
const BREAK_CAP_TASK = 'wakeframe-break-cap';
const DEFAULT_BREAK_MINUTES = 15;
export const ACTIVITY_ACTIONS = {
  accept: 'accept-activity',
  ignore: 'ignore-activity',
  break: 'break-activity',
  yes: 'complete-activity',
  notYet: 'continue-activity',
  resume: 'resume-activity',
} as const;

type BreakNotificationData = {
  activityId: string;
  date: string;
  uid: string;
  breakLogId: string;
  phase: 'break-over' | 'break-cap';
};

setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') return false;

  const current = await getPermissionsAsync();
  if (current.granted) return true;

  const requested = await requestPermissionsAsync();
  return requested.granted;
}

export async function configureActivityNotifications() {
  if (Platform.OS === 'web') return;

  if (Platform.OS === 'android' && !isRunningInExpoGo()) {
    await setNotificationChannelAsync('activity-reminders', {
      name: 'Activity reminders',
      importance: AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  await setNotificationCategoryAsync(ACTIVITY_NOTIFICATION_CATEGORY, [
    { identifier: ACTIVITY_ACTIONS.accept, buttonTitle: 'Accept', options: { opensAppToForeground: true } },
    { identifier: ACTIVITY_ACTIONS.ignore, buttonTitle: 'Ignore', options: { opensAppToForeground: true } },
    { identifier: ACTIVITY_ACTIONS.break, buttonTitle: 'Break', options: { opensAppToForeground: true } },
  ]);
  await setNotificationCategoryAsync(CHECK_IN_NOTIFICATION_CATEGORY, [
    { identifier: ACTIVITY_ACTIONS.yes, buttonTitle: 'Yes', options: { opensAppToForeground: true } },
    { identifier: ACTIVITY_ACTIONS.notYet, buttonTitle: 'Not yet', options: { opensAppToForeground: true } },
    { identifier: ACTIVITY_ACTIONS.ignore, buttonTitle: 'Ignore', options: { opensAppToForeground: true } },
    { identifier: ACTIVITY_ACTIONS.break, buttonTitle: 'Add Break', options: { opensAppToForeground: true } },
  ]);
  await setNotificationCategoryAsync(BREAK_OVER_NOTIFICATION_CATEGORY, [
    { identifier: ACTIVITY_ACTIONS.resume, buttonTitle: 'Resume', options: { opensAppToForeground: true } },
  ]);
}

export async function scheduleTodayActivityNotifications(uid: string, activities: Activity[]) {
  if (Platform.OS === 'web') return;
  if (!(await requestNotificationPermissions())) return;

  await configureActivityNotifications();
  await cancelAllScheduledNotificationsAsync();

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
        data: { activityId: activity.id, date: getDateKey(now), uid, phase: 'start' },
        date: startDate,
      });
    }

    const endDate = getEndDate(now, activity, startDate);
    if (endDate && endDate > now) {
      await scheduleNotification({
        title: `Check in: ${activity.title}`,
        body: `Did you finish ${activity.title}? Ready for next?`,
        categoryIdentifier: CHECK_IN_NOTIFICATION_CATEGORY,
        data: { activityId: activity.id, date: getDateKey(now), uid, phase: 'check-in' },
        date: endDate,
      });
    }
  }
}

export async function handleNotificationResponse(uid: string, response: NotificationResponse) {
  if (Platform.OS === 'web' || response.actionIdentifier === DEFAULT_ACTION_IDENTIFIER) return;

  const data = getResponseData(response) as { activityId?: unknown; date?: unknown; breakLogId?: unknown };
  if (typeof data.activityId !== 'string' || typeof data.date !== 'string') return;

  if (response.actionIdentifier === ACTIVITY_ACTIONS.break) {
    await startBreak(uid, data.activityId, data.date);
    return;
  }
  if (response.actionIdentifier === ACTIVITY_ACTIONS.resume && typeof data.breakLogId === 'string') {
    await finishBreak(uid, data.activityId, data.date, data.breakLogId, false);
    return;
  }

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

export async function startBreak(uid: string, activityId: string, date: string, customDurationMinutes?: number) {
  const [activitySnapshot, userSnapshot] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'activities', activityId)),
    getDoc(doc(db, 'users', uid)),
  ]);
  if (!activitySnapshot.exists()) return;

  const activity = { id: activitySnapshot.id, ...activitySnapshot.data() } as Activity;
  const userData = userSnapshot.exists() ? userSnapshot.data() : undefined;
  const defaultDuration = Number(userData?.defaultBreakDuration);
  const requestedDuration = Number.isFinite(customDurationMinutes) && (customDurationMinutes ?? 0) > 0
    ? customDurationMinutes ?? DEFAULT_BREAK_MINUTES
    : Number.isFinite(defaultDuration) && defaultDuration > 0 ? defaultDuration : DEFAULT_BREAK_MINUTES;
  const maxBreakMinutes = Number(activity.maxBreakMinutes);
  const plannedDuration = maxBreakMinutes > 0 ? Math.min(requestedDuration, maxBreakMinutes) : requestedDuration;
  const startedAt = new Date();
  const breakEndsAt = new Date(startedAt.getTime() + plannedDuration * 60_000);
  const breakLogId = `${activityId}_${date}_${startedAt.getTime()}`;
  const instanceId = `${activityId}_${date}`;

  await Promise.all([
    setDoc(doc(db, 'users', uid, 'activityInstances', instanceId), {
      activityId,
      date,
      state: 'break',
      currentBreakId: breakLogId,
      breakStartedAt: startedAt.toISOString(),
      breakEndsAt: breakEndsAt.toISOString(),
    }, { merge: true }),
    setDoc(doc(db, 'users', uid, 'breakLogs', breakLogId), {
      activityInstanceId: instanceId,
      activityId,
      date,
      startAt: startedAt.toISOString(),
      plannedDuration,
      exceededCap: false,
      exceeded_cap: false,
    }),
    scheduleNotification({
      title: "Break's over",
      body: `Break's over, resume ${activity.title}?`,
      categoryIdentifier: BREAK_OVER_NOTIFICATION_CATEGORY,
      data: { activityId, date, uid, breakLogId, phase: 'break-over' },
      date: breakEndsAt,
    }),
    maxBreakMinutes > plannedDuration
      ? scheduleNotification({
          title: 'Break limit reached',
          body: `Break limit reached. Resuming ${activity.title}.`,
          categoryIdentifier: BREAK_OVER_NOTIFICATION_CATEGORY,
          data: { activityId, date, uid, breakLogId, phase: 'break-cap' },
          date: new Date(startedAt.getTime() + maxBreakMinutes * 60_000),
        })
      : Promise.resolve(),
  ]);
}

async function finishBreak(uid: string, activityId: string, date: string, breakLogId: string, exceededCap: boolean) {
  const endedAt = new Date().toISOString();
  await Promise.all([
    setDoc(doc(db, 'users', uid, 'activityInstances', `${activityId}_${date}`), {
      state: 'in_progress',
      currentBreakId: null,
      breakEndedAt: endedAt,
    }, { merge: true }),
    setDoc(doc(db, 'users', uid, 'breakLogs', breakLogId), {
      endAt: endedAt,
      exceededCap,
      exceeded_cap: exceededCap,
    }, { merge: true }),
  ]);
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
  await scheduleNotificationAsync({
    content: { title, body, categoryIdentifier, data, sound: 'default' },
    trigger: { type: SchedulableTriggerInputTypes.DATE, date },
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

TaskManager.defineTask<NotificationTaskPayload>(BREAK_CAP_TASK, async ({ data }) => {
  if ('actionIdentifier' in data) {
    const responseData = getResponseData(data);
    if (typeof responseData?.uid !== 'string') return BackgroundNotificationTaskResult.NoData;

    await handleNotificationResponse(responseData.uid, data);
    return BackgroundNotificationTaskResult.NewData;
  }

  let payload: unknown = data.data;
  if (data.data?.dataString) {
    try {
      payload = JSON.parse(data.data.dataString);
    } catch {
      return BackgroundNotificationTaskResult.NoData;
    }
  }
  const breakData = payload as Partial<BreakNotificationData>;
  if (!breakData || breakData.phase !== 'break-cap' || !breakData.uid || !breakData.activityId || !breakData.date || !breakData.breakLogId) {
    return BackgroundNotificationTaskResult.NoData;
  }

  await finishBreak(breakData.uid, breakData.activityId, breakData.date, breakData.breakLogId, true);
  return BackgroundNotificationTaskResult.NewData;
});

if (Platform.OS !== 'web') {
  void registerTaskAsync(BREAK_CAP_TASK).catch(() => undefined);
}

function getResponseData(response: NotificationResponse) {
  const notification = response.notification as unknown as {
    request?: { content?: { data?: Record<string, unknown> } };
    data?: Record<string, unknown>;
  } | undefined;
  return notification?.request?.content?.data ?? notification?.data ?? {};
}
