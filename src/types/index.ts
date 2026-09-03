export type TrackingMode = '24h' | 'custom';
export type RoutineMode = TrackingMode;
export type AnalyticsPeriod = 'day' | 'week' | 'month';
export type ActivityState = 'planned' | 'reminded' | 'in_progress' | 'completed' | 'ignored' | 'missed' | 'break' | 'check_in';

export type Timestamp = string;

export interface User {
  id: string;
  timezone: string;
  notificationPreferences: Record<string, boolean>;
  defaultBreakDuration: number;
  trackingMode: TrackingMode;
}

export interface Routine {
  id: string;
  userId: string;
  name: string;
  mode: RoutineMode;
}

export interface DayPlan {
  id: string;
  routineId: string;
  weekday: number;
}

export interface DayCycle {
  id: string;
  userId: string;
  startAt: Timestamp;
  sleepStartAt: Timestamp;
  sleepEndAt: Timestamp;
  durationHours: number;
}

export interface Activity {
  id: string;
  dayPlanId?: string;
  dayCycleId?: string;
  title: string;
  category: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  maxBreakMinutes: number;
  isExtended: boolean;
  icon?: string;
  color?: string;
  sortOrder: number;
}

export interface ActivityInstance {
  id: string;
  activityId: string;
  date: string;
  dayCycleId?: string;
  state: ActivityState;
  remindedAt?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  ignoredAt?: Timestamp;
}

export interface BreakLog {
  id: string;
  activityInstanceId: string;
  startAt: Timestamp;
  endAt?: Timestamp;
  plannedDuration: number;
  exceededCap: boolean;
}

export interface InterruptionLog {
  id: string;
  activityInstanceId: string;
  reason: string;
  estimatedDuration: number;
  actualDuration?: number;
  resultingReschedule?: Record<string, unknown>;
}

export interface Alarm {
  id: string;
  userId: string;
  triggerTime: Timestamp;
  linkedTaskIds: string[];
  dismissedAt?: Timestamp;
}

export interface AnalyticsSnapshot {
  userId: string;
  period: AnalyticsPeriod;
  completionRate: number;
  totalActiveMinutes: number;
  categoryBreakdown: Record<string, number>;
}
