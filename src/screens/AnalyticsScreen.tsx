import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { db } from '../config/firebase';
import { colors } from '../theme';
import type { Activity, ActivityState, BreakLog } from '../types';

type Instance = {
  activityId: string;
  date: string;
  state: ActivityState;
  startedAt?: string;
  completedAt?: string;
};

type AnalyticsBreak = BreakLog & {
  date?: string;
  activityId?: string;
};

type TimelineActivity = Activity & {
  state: ActivityState;
  actualMinutes: number;
  breaks: BreakLog[];
};

const states: ActivityState[] = ['completed', 'ignored', 'missed', 'break'];
const stateLabels: Record<ActivityState, string> = {
  planned: 'Planned', reminded: 'Reminded', in_progress: 'Active', completed: 'Completed',
  ignored: 'Ignored', missed: 'Missed', break: 'Break', check_in: 'Active',
};
const stateColors: Record<ActivityState, string> = {
  planned: colors.outlineVariant, reminded: colors.tertiary, in_progress: colors.progressTeal,
  completed: colors.tertiary, ignored: colors.ignored, missed: colors.missedRose,
  break: colors.break, check_in: colors.progressTeal,
};

export function AnalyticsScreen({ uid }: { uid: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [breakLogs, setBreakLogs] = useState<AnalyticsBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const date = getDateKey(new Date());
    let loaded = 0;
    const markLoaded = () => { loaded += 1; if (loaded === 3) setLoading(false); };
    const unsubscribeActivities = onSnapshot(collection(db, 'users', uid, 'activities'), (snapshot) => {
      setActivities(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Activity)));
      markLoaded();
    }, () => { setError(true); setLoading(false); });
    const unsubscribeInstances = onSnapshot(collection(db, 'users', uid, 'activityInstances'), (snapshot) => {
      setInstances(snapshot.docs.map((item) => item.data() as Instance).filter((item) => item.date === date));
      markLoaded();
    }, () => { setError(true); setLoading(false); });
    const unsubscribeBreaks = onSnapshot(collection(db, 'users', uid, 'breakLogs'), (snapshot) => {
      setBreakLogs(snapshot.docs.map((item) => item.data() as AnalyticsBreak).filter((item) => item.date === date));
      markLoaded();
    }, () => { setError(true); setLoading(false); });
    return () => { unsubscribeActivities(); unsubscribeInstances(); unsubscribeBreaks(); };
  }, [uid]);

  const today = new Date();
  const weekday = (today.getDay() + 6) % 7;
  const dateKey = getDateKey(today);
  const dayActivities = activities
    .filter((activity) => activity.weekday === weekday || (activity.weekday === undefined && weekday === 0))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const timeline = dayActivities.map((activity) => {
    const instance = instances.find((item) => item.activityId === activity.id);
    const breaks = breakLogs.filter((item) => item.activityId === activity.id || item.activityInstanceId === `${activity.id}_${dateKey}`);
    const state = instance?.state ?? inferState(activity, today);
    return { ...activity, state, breaks, actualMinutes: getActualMinutes(instance, breaks, today) };
  });
  const plannedMinutes = timeline.reduce((sum, item) => sum + getPlannedMinutes(item), 0);
  const activeMinutes = timeline.reduce((sum, item) => sum + item.actualMinutes, 0);
  const completedCount = timeline.filter((item) => item.state === 'completed').length;
  const efficiency = plannedMinutes ? Math.round((activeMinutes / plannedMinutes) * 100) : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Wakeframe</Text>
      <Text style={styles.title}>System Analytics</Text>
      <Text style={styles.description}>Today&apos;s planned time against what actually happened.</Text>
      <View style={styles.periods}>
        <Text style={styles.selectedPeriod}>Day</Text><Text style={styles.period}>Week</Text><Text style={styles.period}>Month</Text>
      </View>
      {loading ? <ActivityIndicator color={colors.tertiary} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>Analytics could not be loaded. Check your Firestore connection.</Text> : null}
      {!loading && !error ? <>
        <View style={styles.metrics}>
          <Metric label="Efficiency" value={`${efficiency}%`} detail={`${completedCount} of ${timeline.length} completed`} />
          <Metric label="Active time" value={formatMinutes(activeMinutes)} detail={`${formatMinutes(plannedMinutes)} planned`} />
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Timeline distribution</Text>
          <DayArc activities={timeline} now={today} />
          <View style={styles.legend}>{states.map((state) => <Legend key={state} state={state} />)}</View>
        </View>
        <View style={styles.panel}>
          <View style={styles.sectionHeader}><Text style={styles.panelLabel}>Activity detail</Text><Text style={styles.date}>{today.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></View>
          {timeline.length === 0 ? <Text style={styles.empty}>No activities planned for today.</Text> : timeline.map((activity) => <ActivityRow activity={activity} key={activity.id} />)}
        </View>
      </> : null}
    </ScrollView>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <View style={styles.metric}><Text style={styles.panelLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricDetail}>{detail}</Text></View>;
}

function DayArc({ activities, now }: { activities: TimelineActivity[]; now: Date }) {
  const nowPosition = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
  return <><View style={styles.arc}>
    {activities.map((activity) => { const start = timeToMinutes(activity.startTime); const width = Math.max(1, getPlannedMinutes(activity)); return <View accessibilityLabel={`${activity.title}, ${stateLabels[activity.state]}`} key={activity.id} style={[styles.arcSegment, { backgroundColor: stateColors[activity.state], left: `${(start / 1440) * 100}%`, width: `${(width / 1440) * 100}%` }]} />; })}
    <View style={[styles.nowMarker, { left: `${nowPosition}%` }]} />
  </View><View style={styles.axis}><Text style={styles.axisText}>00:00</Text><Text style={styles.axisText}>12:00</Text><Text style={styles.axisText}>24:00</Text></View></>;
}

function Legend({ state }: { state: ActivityState }) { return <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: stateColors[state] }]} /><Text style={styles.legendText}>{stateLabels[state]}</Text></View>; }

function ActivityRow({ activity }: { activity: TimelineActivity }) {
  return <View style={styles.activityRow}><View style={[styles.stateBar, { backgroundColor: stateColors[activity.state] }]} /><View style={styles.activityMain}><View style={styles.activityHeading}><Text style={styles.activityTitle}>{activity.title}</Text><Text style={[styles.state, { color: stateColors[activity.state] }]}>{stateLabels[activity.state]}</Text></View><Text style={styles.category}>{activity.category} - {activity.startTime}</Text><View style={styles.timeLine}><Text style={styles.timeText}>Planned <Text style={styles.strong}>{formatMinutes(getPlannedMinutes(activity))}</Text></Text><Text style={styles.timeText}>Actual <Text style={styles.strong}>{formatMinutes(activity.actualMinutes)}</Text></Text></View></View></View>;
}

function inferState(activity: Activity, now: Date): ActivityState {
  const end = timeToMinutes(activity.startTime) + getPlannedMinutes(activity);
  return end < now.getHours() * 60 + now.getMinutes() ? 'missed' : 'planned';
}

function getPlannedMinutes(activity: Activity) { return activity.duration ?? (activity.endTime ? timeToMinutes(activity.endTime) - timeToMinutes(activity.startTime) : 0); }
function getActualMinutes(instance: Instance | undefined, breaks: BreakLog[], now: Date) {
  if (!instance?.startedAt) return 0;
  const start = new Date(instance.startedAt).getTime();
  const finish = instance.completedAt ? new Date(instance.completedAt).getTime() : now.getTime();
  const breakMinutes = breaks.reduce((sum, item) => sum + (item.endAt ? (new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 60000 : 0), 0);
  return Math.max(0, Math.round((finish - start) / 60000 - breakMinutes));
}
function timeToMinutes(time: string) { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes; }
function getDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatMinutes(minutes: number) { return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, paddingTop: 32, paddingBottom: 40 },
  eyebrow: { color: colors.tertiary, fontFamily: 'Space Grotesk', fontSize: 12, letterSpacing: 1, marginBottom: 12 }, title: { color: colors.onSurface, fontFamily: 'Space Grotesk', fontSize: 30, fontWeight: '500', marginBottom: 8 }, description: { color: colors.onSurfaceVariant, fontSize: 15, lineHeight: 22, marginBottom: 24 },
  periods: { alignItems: 'center', backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-around', marginBottom: 28, padding: 5 }, selectedPeriod: { backgroundColor: colors.tertiary, color: colors.background, flex: 1, fontSize: 14, fontWeight: '600', padding: 11, textAlign: 'center' }, period: { color: colors.onSurfaceVariant, flex: 1, fontSize: 14, fontWeight: '600', padding: 11, textAlign: 'center' }, loader: { marginVertical: 32 }, error: { color: colors.missedRose, lineHeight: 20 }, metrics: { flexDirection: 'row', gap: 12, marginBottom: 16 }, metric: { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, borderWidth: 1, flex: 1, minHeight: 142, padding: 16 }, panelLabel: { color: colors.onSurfaceVariant, fontFamily: 'Space Grotesk', fontSize: 12, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' }, metricValue: { color: colors.tertiary, fontFamily: 'Space Grotesk', fontSize: 38, fontWeight: '500', marginTop: 18 }, metricDetail: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 10 }, panel: { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, borderWidth: 1, marginBottom: 16, padding: 16 }, arc: { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant, borderWidth: 1, height: 42, marginTop: 20, overflow: 'hidden', position: 'relative' }, arcSegment: { bottom: 0, position: 'absolute', top: 0 }, nowMarker: { backgroundColor: colors.tertiary, bottom: 0, position: 'absolute', top: 0, width: 2 }, axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }, axisText: { color: colors.onSurfaceVariant, fontFamily: 'Space Grotesk', fontSize: 11 }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 22 }, legendItem: { alignItems: 'center', flexDirection: 'row' }, swatch: { height: 8, marginRight: 6, width: 8 }, legendText: { color: colors.onSurfaceVariant, fontSize: 12 }, sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }, date: { color: colors.tertiary, fontFamily: 'Space Grotesk', fontSize: 12 }, empty: { color: colors.onSurfaceVariant, fontSize: 14, paddingVertical: 16 }, activityRow: { borderTopColor: colors.outlineVariant, borderTopWidth: 1, flexDirection: 'row', paddingVertical: 14 }, stateBar: { marginRight: 12, width: 4 }, activityMain: { flex: 1 }, activityHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, activityTitle: { color: colors.onSurface, flex: 1, fontSize: 16, fontWeight: '500' }, state: { fontFamily: 'Space Grotesk', fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginLeft: 8 }, category: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 5 }, timeLine: { flexDirection: 'row', gap: 20, marginTop: 12 }, timeText: { color: colors.onSurfaceVariant, fontSize: 12 }, strong: { color: colors.onSurface, fontWeight: '600' },
});
