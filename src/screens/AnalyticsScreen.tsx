import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { db } from '../config/firebase';
import { colors } from '../theme';
import type { Activity, ActivityState, BreakLog } from '../types';

type Period = 'day' | 'week' | 'month';
type Filter = 'all' | 'completed' | 'active' | 'ignored' | 'missed' | 'break' | 'planned';
type Instance = { activityId: string; date: string; state: ActivityState; startedAt?: string; completedAt?: string };
type AnalyticsBreak = BreakLog & { date?: string; activityId?: string };
type TimelineActivity = Activity & { date: string; state: Filter; actualMinutes: number; delayMinutes: number | null; breaks: AnalyticsBreak[] };

const pageSize = 6;
const filters: Filter[] = ['all', 'completed', 'active', 'ignored', 'missed', 'break', 'planned'];
const filterLabels: Record<Filter, string> = { all: 'All', completed: 'Done', active: 'Active', ignored: 'Ignored', missed: 'Missed', break: 'Break', planned: 'Planned' };
const stateLabels: Record<Filter, string> = { all: 'All', completed: 'Completed', active: 'Active', ignored: 'Ignored', missed: 'Missed', break: 'Break', planned: 'Planned' };
const stateColors: Record<Filter, string> = { all: colors.onSurfaceVariant, completed: colors.tertiary, active: colors.progressTeal, ignored: colors.ignored, missed: colors.missedRose, break: colors.break, planned: colors.outlineVariant };

export function AnalyticsScreen({ uid }: { uid: string }) {
  const [period, setPeriod] = useState<Period>('day');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [breakLogs, setBreakLogs] = useState<AnalyticsBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const periodDates = getPeriodDates(new Date(), period);
    const startDate = getDateKey(periodDates[0]);
    const endDate = getDateKey(periodDates[periodDates.length - 1]);
    const instanceStartDate = period === 'week' ? getDateKey(addDays(periodDates[0], -30)) : startDate;
    setLoading(true);
    setError(false);
    setInstances([]);
    setBreakLogs([]);
    let loadedSources = 0;
    const markLoaded = () => { loadedSources += 1; if (loadedSources === 3) { setLoading(false); setError(false); } };
    const handleError = () => { setError(true); setLoading(false); };
    const unsubscribeActivities = onSnapshot(collection(db, 'users', uid, 'activities'), (snapshot) => {
      setActivities(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Activity)));
      markLoaded();
    }, handleError);
    const instancesQuery = query(collection(db, 'users', uid, 'activityInstances'), where('date', '>=', instanceStartDate), where('date', '<=', endDate));
    const breaksQuery = query(collection(db, 'users', uid, 'breakLogs'), where('date', '>=', startDate), where('date', '<=', endDate));
    const unsubscribeInstances = onSnapshot(instancesQuery, (snapshot) => {
      setInstances(snapshot.docs.map((item) => item.data() as Instance));
      markLoaded();
    }, handleError);
    const unsubscribeBreaks = onSnapshot(breaksQuery, (snapshot) => {
      setBreakLogs(snapshot.docs.map((item) => item.data() as AnalyticsBreak));
      markLoaded();
    }, handleError);
    return () => { unsubscribeActivities(); unsubscribeInstances(); unsubscribeBreaks(); };
  }, [period, uid]);

  const now = new Date();
  const dates = getPeriodDates(now, period);
  const instancesByKey = new Map(instances.map((item) => [`${item.activityId}_${item.date}`, item]));
  const breaksByKey = new Map<string, AnalyticsBreak[]>();
  breakLogs.forEach((item) => {
    const key = item.activityId && item.date ? `${item.activityId}_${item.date}` : item.activityInstanceId;
    if (!key) return;
    breaksByKey.set(key, [...(breaksByKey.get(key) ?? []), item]);
  });
  const entries = dates.flatMap((date) => activities
    .filter((activity) => activity.weekday === weekdayFor(date) || (activity.weekday === undefined && weekdayFor(date) === 0))
    .map((activity) => {
      const dateKey = getDateKey(date);
      const instance = instancesByKey.get(`${activity.id}_${dateKey}`);
      const breaks = breaksByKey.get(`${activity.id}_${dateKey}`) ?? [];
      return { ...activity, date: dateKey, state: getDisplayState(instance, activity, date, now), breaks, actualMinutes: getActualMinutes(instance, breaks, date, now), delayMinutes: getStartDelayMinutes(instance, date, activity) };
    }))
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const filteredEntries = filter === 'all' ? entries : entries.filter((entry) => entry.state === filter);
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleEntries = filteredEntries.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const plannedMinutes = entries.reduce((sum, item) => sum + getPlannedMinutes(item), 0);
  const activeMinutes = entries.reduce((sum, item) => sum + item.actualMinutes, 0);
  const completedCount = entries.filter((item) => item.state === 'completed').length;
  const efficiency = plannedMinutes ? Math.round((activeMinutes / plannedMinutes) * 100) : 0;
  const dayEntries = period === 'day' ? entries : [];

  const changePeriod = (nextPeriod: Period) => { setPeriod(nextPeriod); setFilter('all'); setPage(0); };
  const changeFilter = (nextFilter: Filter) => { setFilter(nextFilter); setPage(0); };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Wakeframe</Text>
      <Text style={styles.title}>System Analytics</Text>
      <Text style={styles.description}>{periodDescription(period)} planned time against what actually happened.</Text>
      <View style={styles.periods} accessibilityRole="tablist">
        {(['day', 'week', 'month'] as Period[]).map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: period === item }} key={item} onPress={() => changePeriod(item)} style={({ pressed }) => [styles.period, period === item && styles.selectedPeriod, pressed && styles.pressed]}><Text style={[styles.periodText, period === item && styles.selectedPeriodText]}>{item[0].toUpperCase() + item.slice(1)}</Text></Pressable>)}
      </View>
      {loading ? <ActivityIndicator color={colors.tertiary} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>Analytics could not be loaded. Check your Firestore connection.</Text> : null}
      {!loading && !error ? <>
        <View style={styles.metrics}>
          <Metric label="Efficiency" value={`${efficiency}%`} detail={`${completedCount} of ${entries.length} completed`} />
          <Metric label="Active time" value={formatMinutes(activeMinutes)} detail={`${formatMinutes(plannedMinutes)} planned`} />
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Status distribution</Text>
          <StatusGraph entries={entries} />
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Filter activities</Text>
          <View style={styles.filters}>{filters.map((item) => <Pressable accessibilityRole="button" accessibilityState={{ selected: filter === item }} key={item} onPress={() => changeFilter(item)} style={({ pressed }) => [styles.filterButton, filter === item && styles.selectedFilter, pressed && styles.pressed]}><Text style={[styles.filterText, filter === item && styles.selectedFilterText]}>{filterLabels[item]}</Text></Pressable>)}</View>
        </View>
        {period === 'day' ? <View style={styles.panel}><Text style={styles.panelLabel}>Today&apos;s timeline</Text><DayArc activities={dayEntries} now={now} /></View> : null}
        {period === 'week' ? <WeeklyInsights entries={entries} now={now} /> : null}
        <View style={styles.panel}>
          <View style={styles.sectionHeader}><Text style={styles.panelLabel}>{period === 'day' ? 'Activity detail' : `${period[0].toUpperCase() + period.slice(1)} activity detail`}</Text><Text style={styles.date}>{formatPeriodLabel(now, period)}</Text></View>
          {visibleEntries.length === 0 ? <Text style={styles.empty}>No activities match this filter.</Text> : visibleEntries.map((activity) => <ActivityRow activity={activity} showDate={period !== 'day'} key={`${activity.date}-${activity.id}`} />)}
          {filteredEntries.length > pageSize ? <Pagination page={safePage} pageCount={pageCount} onChange={setPage} /> : null}
        </View>
      </> : null}
    </ScrollView>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <View style={styles.metric}><Text style={styles.panelLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricDetail}>{detail}</Text></View>; }

function StatusGraph({ entries }: { entries: TimelineActivity[] }) {
  const counts = filters.slice(1).map((state) => ({ state, count: entries.filter((entry) => entry.state === state).length }));
  const total = entries.length || 1;
  return <><View style={styles.graph}>{counts.map(({ state, count }) => count > 0 ? <View accessibilityLabel={`${stateLabels[state]}: ${count}`} key={state} style={[styles.graphSegment, { backgroundColor: stateColors[state], flex: count }]} /> : null)}</View><View style={styles.graphLegend}>{counts.map(({ state, count }) => <View key={state} style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: stateColors[state] }]} /><Text style={styles.legendText}>{stateLabels[state]} {Math.round((count / total) * 100)}%</Text></View>)}</View></>;
}

function DayArc({ activities, now }: { activities: TimelineActivity[]; now: Date }) {
  const nowPosition = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
  return <><View style={styles.arc}>{activities.map((activity) => <View accessibilityLabel={`${activity.title}, ${stateLabels[activity.state]}`} key={activity.id} style={[styles.arcSegment, { backgroundColor: stateColors[activity.state], left: `${(timeToMinutes(activity.startTime) / 1440) * 100}%`, width: `${(Math.max(1, getPlannedMinutes(activity)) / 1440) * 100}%` }]} />)}<View style={[styles.nowMarker, { left: `${nowPosition}%` }]} /></View><View style={styles.axis}><Text style={styles.axisText}>00:00</Text><Text style={styles.axisText}>12:00</Text><Text style={styles.axisText}>24:00</Text></View></>;
}

function ActivityRow({ activity, showDate }: { activity: TimelineActivity; showDate: boolean }) { return <View style={styles.activityRow}><View style={[styles.stateBar, { backgroundColor: stateColors[activity.state] }]} /><View style={styles.activityMain}><View style={styles.activityHeading}><Text style={styles.activityTitle}>{activity.title}</Text><Text style={[styles.state, { color: stateColors[activity.state] }]}>{stateLabels[activity.state]}</Text></View><Text style={styles.category}>{activity.category} - {showDate ? `${formatDate(activity.date)} - ` : ''}{activity.startTime}</Text><View style={styles.timeLine}><Text style={styles.timeText}>Planned <Text style={styles.strong}>{formatMinutes(getPlannedMinutes(activity))}</Text></Text><Text style={styles.timeText}>Actual <Text style={styles.strong}>{formatMinutes(activity.actualMinutes)}</Text></Text></View></View></View>; }

function WeeklyInsights({ entries, now }: { entries: TimelineActivity[]; now: Date }) {
  const activityRates = getRateRows(entries, (entry) => entry.title);
  const categoryRates = getRateRows(entries, (entry) => entry.category);
  const skipped = activityRates.filter((row) => row.skipped > 0).sort((a, b) => b.skipped - a.skipped).slice(0, 3);
  const delays = entries.map((entry) => entry.delayMinutes).filter((delay): delay is number => delay !== null);
  const averageDelay = delays.length ? Math.round(delays.reduce((sum, delay) => sum + delay, 0) / delays.length) : null;
  const streaks = getStreakRows(entries, now).sort((a, b) => b.streak - a.streak).slice(0, 3);
  return <>
    <View style={styles.panel}><Text style={styles.panelLabel}>Weekly signals</Text><View style={styles.signalGrid}><View style={styles.signal}><Text style={styles.signalValue}>{averageDelay === null ? '--' : formatDelay(averageDelay)}</Text><Text style={styles.signalLabel}>Average start delay</Text></View><View style={styles.signal}><Text style={styles.signalValue}>{streaks[0]?.streak ?? 0}</Text><Text style={styles.signalLabel}>Best streak (days)</Text></View></View></View>
    <RatePanel title="Completion by activity" rows={activityRates} />
    <RatePanel title="Completion by category" rows={categoryRates} />
    <View style={styles.panel}><Text style={styles.panelLabel}>Most skipped activities</Text>{skipped.length ? skipped.map((row) => <View style={styles.insightRow} key={row.label}><Text style={styles.insightName}>{row.label}</Text><Text style={styles.skippedValue}>{row.skipped} skipped</Text></View>) : <Text style={styles.empty}>No skipped activities this week.</Text>}</View>
    <View style={styles.panel}><Text style={styles.panelLabel}>Activity streaks</Text>{streaks.length ? streaks.map((row) => <View style={styles.insightRow} key={row.label}><Text style={styles.insightName}>{row.label}</Text><Text style={styles.streakValue}>{row.streak} {row.streak === 1 ? 'day' : 'days'}</Text></View>) : <Text style={styles.empty}>Complete an activity to start a streak.</Text>}</View>
  </>;
}

type RateRow = { label: string; total: number; completed: number; skipped: number; rate: number };
function getRateRows(entries: TimelineActivity[], getLabel: (entry: TimelineActivity) => string): RateRow[] { const grouped = new Map<string, TimelineActivity[]>(); entries.forEach((entry) => grouped.set(getLabel(entry), [...(grouped.get(getLabel(entry)) ?? []), entry])); return [...grouped.entries()].map(([label, group]) => { const completed = group.filter((entry) => entry.state === 'completed').length; const skipped = group.filter((entry) => entry.state === 'ignored' || entry.state === 'missed').length; return { label, total: group.length, completed, skipped, rate: Math.round((completed / group.length) * 100) }; }).sort((a, b) => b.rate - a.rate || a.label.localeCompare(b.label)); }
function RatePanel({ title, rows }: { title: string; rows: RateRow[] }) { return <View style={styles.panel}><Text style={styles.panelLabel}>{title}</Text>{rows.length ? rows.map((row) => <View style={styles.rateRow} key={row.label}><View style={styles.rateHeader}><Text style={styles.insightName}>{row.label}</Text><Text style={styles.rateText}>{row.completed}/{row.total} - {row.rate}%</Text></View><View style={styles.rateTrack}><View style={[styles.rateFill, { width: `${row.rate}%` }]} /></View></View>) : <Text style={styles.empty}>No activity data for this week.</Text>}</View>; }
function getStreakRows(entries: TimelineActivity[], now: Date) { return [...new Set(entries.map((entry) => entry.id))].map((id) => { const activityEntries = entries.filter((entry) => entry.id === id && entry.date <= getDateKey(now)).sort((a, b) => b.date.localeCompare(a.date)); let streak = 0; for (const entry of activityEntries) { if (entry.state !== 'completed') break; streak += 1; } return { label: activityEntries[0]?.title ?? id, streak }; }); }
function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) { return <View style={styles.pagination}><Pressable accessibilityLabel="Previous page" accessibilityRole="button" disabled={page === 0} onPress={() => onChange(page - 1)} style={({ pressed }) => [styles.pageButton, page === 0 && styles.disabledButton, pressed && styles.pressed]}><Text style={styles.pageButtonText}>Previous</Text></Pressable><Text style={styles.pageText}>{page + 1} / {pageCount}</Text><Pressable accessibilityLabel="Next page" accessibilityRole="button" disabled={page === pageCount - 1} onPress={() => onChange(page + 1)} style={({ pressed }) => [styles.pageButton, page === pageCount - 1 && styles.disabledButton, pressed && styles.pressed]}><Text style={styles.pageButtonText}>Next</Text></Pressable></View>; }

function getDisplayState(instance: Instance | undefined, activity: Activity, date: Date, now: Date): Filter { if (instance?.state === 'completed') return 'completed'; if (instance?.state === 'ignored') return 'ignored'; if (instance?.state === 'missed') return 'missed'; if (instance?.state === 'break') return 'break'; if (instance?.state === 'in_progress' || instance?.state === 'check_in') return 'active'; const dateKey = getDateKey(date); if (dateKey < getDateKey(now) || (dateKey === getDateKey(now) && timeToMinutes(activity.startTime) + getPlannedMinutes(activity) < now.getHours() * 60 + now.getMinutes())) return 'missed'; return 'planned'; }
function getActualMinutes(instance: Instance | undefined, breaks: AnalyticsBreak[], date: Date, now: Date) { if (!instance?.startedAt) return 0; const start = new Date(instance.startedAt).getTime(); const finish = instance.completedAt ? new Date(instance.completedAt).getTime() : getDateKey(date) === getDateKey(now) ? now.getTime() : start; const breakMinutes = breaks.reduce((sum, item) => sum + ((new Date(item.endAt ?? now.toISOString()).getTime() - new Date(item.startAt).getTime()) / 60000), 0); return Math.max(0, Math.round((finish - start) / 60000 - breakMinutes)); }
function getStartDelayMinutes(instance: Instance | undefined, date: Date, activity: Activity) { if (!instance?.startedAt) return null; const plannedStart = new Date(date); const [hours, minutes] = activity.startTime.split(':').map(Number); plannedStart.setHours(hours, minutes, 0, 0); return Math.round((new Date(instance.startedAt).getTime() - plannedStart.getTime()) / 60000); }
function getPlannedMinutes(activity: Activity) { const duration = activity.duration ?? (activity.endTime ? timeToMinutes(activity.endTime) - timeToMinutes(activity.startTime) : 0); return Math.max(0, duration < 0 ? duration + 1440 : duration); }
function getPeriodDates(now: Date, period: Period) { const start = new Date(now); start.setHours(0, 0, 0, 0); if (period === 'day') return [start]; if (period === 'week') { const daysElapsed = weekdayFor(start); start.setDate(start.getDate() - daysElapsed); return Array.from({ length: daysElapsed + 1 }, (_, index) => addDays(start, index)); } return Array.from({ length: now.getDate() }, (_, index) => new Date(now.getFullYear(), now.getMonth(), index + 1)); }
function addDays(date: Date, days: number) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
function weekdayFor(date: Date) { return (date.getDay() + 6) % 7; }
function getDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatDate(date: string) { return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function formatPeriodLabel(date: Date, period: Period) { if (period === 'day') return formatDate(getDateKey(date)); if (period === 'week') return 'Current week'; return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }
function periodDescription(period: Period) { return period === 'day' ? 'Today\'s' : period === 'week' ? 'This week\'s' : 'This month\'s'; }
function timeToMinutes(time: string) { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes; }
function formatMinutes(minutes: number) { return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`; }
function formatDelay(minutes: number) { return `${minutes > 0 ? '+' : ''}${minutes}m`; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, paddingTop: 32, paddingBottom: 40 }, eyebrow: { color: colors.tertiary, fontFamily: 'Space Grotesk', fontSize: 12, letterSpacing: 1, marginBottom: 12 }, title: { color: colors.onSurface, fontFamily: 'Space Grotesk', fontSize: 24, fontWeight: '500', marginBottom: 8 }, description: { color: colors.onSurfaceVariant, fontSize: 16, lineHeight: 24, marginBottom: 24 }, periods: { alignItems: 'center', backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant, borderWidth: 1, flexDirection: 'row', marginBottom: 20, padding: 5 }, period: { flex: 1 }, selectedPeriod: { backgroundColor: colors.tertiary }, periodText: { color: colors.onSurfaceVariant, fontSize: 14, fontWeight: '600', padding: 11, textAlign: 'center' }, selectedPeriodText: { color: colors.background }, pressed: { opacity: 0.75 }, loader: { marginVertical: 32 }, error: { color: colors.missedRose, lineHeight: 20 }, metrics: { flexDirection: 'row', gap: 12, marginBottom: 16 }, metric: { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, borderWidth: 1, flex: 1, minHeight: 142, padding: 16 }, panel: { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, borderWidth: 1, marginBottom: 16, padding: 16 }, panelLabel: { color: colors.onSurfaceVariant, fontFamily: 'Space Grotesk', fontSize: 12, fontWeight: '600', letterSpacing: 1.3 }, metricValue: { color: colors.tertiary, fontFamily: 'Space Grotesk', fontSize: 34, fontWeight: '500', marginTop: 18 }, metricDetail: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 10 }, signalGrid: { flexDirection: 'row', gap: 12, marginTop: 16 }, signal: { backgroundColor: colors.surfaceContainerHigh, flex: 1, padding: 12 }, signalValue: { color: colors.tertiary, fontFamily: 'Space Grotesk', fontSize: 24, fontWeight: '500' }, signalLabel: { color: colors.onSurfaceVariant, fontSize: 11, lineHeight: 16, marginTop: 6 }, graph: { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant, borderWidth: 1, flexDirection: 'row', height: 24, marginTop: 20, overflow: 'hidden' }, graphSegment: { minWidth: 2 }, graphLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 }, legendItem: { alignItems: 'center', flexDirection: 'row' }, swatch: { height: 8, marginRight: 6, width: 8 }, legendText: { color: colors.onSurfaceVariant, fontSize: 12 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, filterButton: { borderColor: colors.outlineVariant, borderWidth: 1, minHeight: 38, paddingHorizontal: 12, paddingVertical: 9 }, selectedFilter: { backgroundColor: colors.tertiary, borderColor: colors.tertiary }, filterText: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' }, selectedFilterText: { color: colors.background }, arc: { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant, borderWidth: 1, height: 42, marginTop: 20, overflow: 'hidden', position: 'relative' }, arcSegment: { bottom: 0, position: 'absolute', top: 0 }, nowMarker: { backgroundColor: colors.tertiary, bottom: 0, position: 'absolute', top: 0, width: 2 }, axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }, axisText: { color: colors.onSurfaceVariant, fontFamily: 'Space Grotesk', fontSize: 11 }, sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }, date: { color: colors.tertiary, fontFamily: 'Space Grotesk', fontSize: 12 }, empty: { color: colors.onSurfaceVariant, fontSize: 14, paddingVertical: 16 }, activityRow: { borderTopColor: colors.outlineVariant, borderTopWidth: 1, flexDirection: 'row', paddingVertical: 14 }, stateBar: { marginRight: 12, width: 4 }, activityMain: { flex: 1 }, activityHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, activityTitle: { color: colors.onSurface, flex: 1, fontSize: 16, fontWeight: '500' }, state: { fontFamily: 'Space Grotesk', fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginLeft: 8 }, category: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 5 }, timeLine: { flexDirection: 'row', gap: 20, marginTop: 12 }, timeText: { color: colors.onSurfaceVariant, fontSize: 12 }, strong: { color: colors.onSurface, fontWeight: '600' }, insightRow: { alignItems: 'center', borderTopColor: colors.outlineVariant, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }, insightName: { color: colors.onSurface, flex: 1, fontSize: 14 }, skippedValue: { color: colors.missedRose, fontFamily: 'Space Grotesk', fontSize: 12 }, streakValue: { color: colors.tertiary, fontFamily: 'Space Grotesk', fontSize: 12 }, rateRow: { borderTopColor: colors.outlineVariant, borderTopWidth: 1, paddingVertical: 12 }, rateHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, rateText: { color: colors.onSurfaceVariant, fontFamily: 'Space Grotesk', fontSize: 12 }, rateTrack: { backgroundColor: colors.surfaceContainerHigh, height: 6, marginTop: 8, overflow: 'hidden' }, rateFill: { backgroundColor: colors.progressTeal, height: 6 }, pagination: { alignItems: 'center', borderTopColor: colors.outlineVariant, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 14 }, pageButton: { borderColor: colors.outlineVariant, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 }, pageButtonText: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' }, disabledButton: { opacity: 0.35 }, pageText: { color: colors.onSurfaceVariant, fontFamily: 'Space Grotesk', fontSize: 12 },
});
