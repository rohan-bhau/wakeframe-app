import { addDoc, collection, doc, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { db } from '../config/firebase';
import { colors } from '../theme';
import type { Activity } from '../types';

type ActivityInput = Pick<Activity, 'title' | 'startTime' | 'duration' | 'category'>;
type ActivityDocument = Omit<Activity, 'id'>;
type AddActivityMode = '24h' | 'custom';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const emptyForm: ActivityInput = {
  title: '',
  startTime: '',
  duration: undefined,
  category: '',
};

export function RoutineBuilderScreen({ uid }: { uid: string }) {
  const [form, setForm] = useState<ActivityInput>(emptyForm);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedDay, setSelectedDay] = useState(0);
  const [copyDays, setCopyDays] = useState<number[]>([]);
  const [mode, setMode] = useState<AddActivityMode>('24h');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const activitiesQuery = query(collection(db, 'users', uid, 'activities'), orderBy('startTime'));
    return onSnapshot(
      activitiesQuery,
      (snapshot) => {
        setActivities(snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as Activity)));
        setLoading(false);
        setError(null);
      },
      () => {
        setLoading(false);
        setError('Activities could not be loaded. Check your Firestore connection.');
      },
    );
  }, [uid]);

  const activitiesForDay = (day: number) => activities.filter(
    (activity) => activity.weekday === day || (activity.weekday === undefined && day === 0),
  );
  const selectedActivities = activitiesForDay(selectedDay);

  const selectDay = (day: number) => {
    setSelectedDay(day);
    setForm(emptyForm);
    setCopyDays([]);
  };

  const toggleCopyDay = (day: number) => {
    if (day === selectedDay) return;
    setCopyDays((current) => (current.includes(day) ? current.filter((value) => value !== day) : [...current, day]));
  };

  const copyToDays = (targetDays: number[]) => {
    const uniqueTargetDays = [...new Set(targetDays)].filter((day) => day !== selectedDay);
    if (selectedActivities.length === 0 || uniqueTargetDays.length === 0) return;

    const conflictingDays = uniqueTargetDays.filter((day) => activitiesForDay(day).length > 0);
    if (conflictingDays.length > 0) {
      Alert.alert(
        'Activities already exist',
        `${conflictingDays.map((day) => days[day]).join(', ')} already ${conflictingDays.length === 1 ? 'has' : 'have'} activities. How should they be handled?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Merge', onPress: () => void executeCopy(uniqueTargetDays, 'merge') },
          { text: 'Replace', style: 'destructive', onPress: () => void executeCopy(uniqueTargetDays, 'replace') },
        ],
      );
      return;
    }

    void executeCopy(uniqueTargetDays, 'merge');
  };

  const executeCopy = async (targetDays: number[], strategy: 'merge' | 'replace') => {
    setCopying(true);
    try {
      const activityCollection = collection(db, 'users', uid, 'activities');
      const batch = writeBatch(db);
      const sourceActivities = selectedActivities.map(({ id: _id, ...activity }) => activity);

      for (const day of targetDays) {
        if (strategy === 'replace') {
          activitiesForDay(day).forEach((activity) => batch.delete(doc(activityCollection, activity.id)));
        }
        sourceActivities.forEach((activity, index) => {
          batch.set(doc(activityCollection), { ...activity, weekday: day, sortOrder: index });
        });
      }

      await batch.commit();
      setCopyDays([]);
      Alert.alert('Routine copied', `Copied ${selectedActivities.length} ${selectedActivities.length === 1 ? 'activity' : 'activities'} to ${targetDays.map((day) => days[day]).join(', ')}.`);
    } catch {
      Alert.alert('Could not copy routine', 'Please check your connection and try again.');
    } finally {
      setCopying(false);
    }
  };

  const saveActivity = async () => {
    const title = form.title.trim();
    const category = form.category.trim();
    const duration = Number(form.duration);

    if (!title || !category || !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.startTime) || !Number.isFinite(duration) || duration <= 0) {
      Alert.alert('Check the form', 'Enter a title, category, a time in HH:MM format, and a positive duration.');
      return;
    }

    setSaving(true);
    try {
      const activity: ActivityDocument = {
        weekday: selectedDay,
        title,
        startTime: form.startTime,
        duration,
        category,
        maxBreakMinutes: 0,
        isExtended: false,
        sortOrder: selectedActivities.length,
      };
      await addDoc(collection(db, 'users', uid, 'activities'), activity);
      setForm(emptyForm);
    } catch {
      Alert.alert('Could not save activity', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Wakeframe</Text>
        <Text style={styles.title}>Routine Builder</Text>
        <Text style={styles.description}>Build each day of your week, then keep your routine synced.</Text>

        <ScrollView contentContainerStyle={styles.dayTabs} horizontal showsHorizontalScrollIndicator={false}>
          {days.map((day, index) => (
            <Pressable
              accessibilityLabel={`${day} routine`}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedDay === index }}
              key={day}
              onPress={() => selectDay(index)}
              style={[styles.dayTab, selectedDay === index && styles.selectedDayTab]}
            >
              <Text style={[styles.dayTabText, selectedDay === index && styles.selectedDayTabText]}>{day}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.selectedDayLabel}>{days[selectedDay]} activities</Text>

        <View style={styles.form}>
          <Text style={styles.formTitle}>Add activity</Text>
          <View accessibilityRole="radiogroup" style={styles.modeToggle}>
            <ModeOption label="24-Hour Mode" mode="24h" selectedMode={mode} onPress={setMode} />
            <ModeOption label="Custom Mode" mode="custom" selectedMode={mode} onPress={setMode} />
          </View>

          {mode === 'custom' ? (
            <Text style={styles.modePlaceholder}>Custom mode coming in Phase 2</Text>
          ) : (
            <>
              <Field label="Title">
                <TextInput
                  accessibilityLabel="Activity title"
                  onChangeText={(title) => setForm((current) => ({ ...current, title }))}
                  placeholder="Deep work"
                  placeholderTextColor={colors.outline}
                  style={styles.input}
                  value={form.title}
                />
              </Field>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Field label="Start time">
                    <TextInput
                      accessibilityLabel="Activity start time"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      onChangeText={(startTime) => setForm((current) => ({ ...current, startTime }))}
                      placeholder="09:00"
                      placeholderTextColor={colors.outline}
                      style={styles.input}
                      value={form.startTime}
                    />
                  </Field>
                </View>
                <View style={styles.half}>
                  <Field label="Duration (minutes)">
                    <TextInput
                      accessibilityLabel="Activity duration"
                      keyboardType="number-pad"
                      onChangeText={(value) => setForm((current) => ({ ...current, duration: value ? Number(value) : undefined }))}
                      placeholder="60"
                      placeholderTextColor={colors.outline}
                      style={styles.input}
                      value={form.duration === undefined ? '' : String(form.duration)}
                    />
                  </Field>
                </View>
              </View>
              <Field label="Category">
                <TextInput
                  accessibilityLabel="Activity category"
                  onChangeText={(category) => setForm((current) => ({ ...current, category }))}
                  placeholder="Work"
                  placeholderTextColor={colors.outline}
                  style={styles.input}
                  value={form.category}
                />
              </Field>
              <Pressable accessibilityRole="button" disabled={saving} onPress={saveActivity} style={styles.button}>
                {saving ? <ActivityIndicator color={colors.background} /> : <Text style={styles.buttonText}>Save activity</Text>}
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Saved activities</Text>
          <Text style={styles.count}>{selectedActivities.length}</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.tertiary} style={styles.loader} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && selectedActivities.length === 0 ? <Text style={styles.empty}>No activities saved for {days[selectedDay]} yet.</Text> : null}
        {selectedActivities.map((activity) => (
          <View key={activity.id} style={styles.activity}>
            <View style={styles.activityTime}>
              <Text style={styles.time}>{activity.startTime}</Text>
              <Text style={styles.minutes}>{activity.duration} min</Text>
            </View>
            <View style={styles.activityDetails}>
              <Text style={styles.activityTitle}>{activity.title}</Text>
              <Text style={styles.category}>{activity.category}</Text>
            </View>
          </View>
        ))}
        {!loading && !error && selectedActivities.length > 0 ? (
          <View style={styles.copyPanel}>
            <Text style={styles.copyTitle}>Copy to other days</Text>
            <Text style={styles.copyDescription}>Duplicate this day&apos;s full activity list.</Text>
            <View style={styles.copyDayRow}>
              {days.map((day, index) => {
                const isCurrentDay = index === selectedDay;
                const isCopyDay = copyDays.includes(index);
                return (
                  <Pressable
                    accessibilityLabel={`${day} copy target`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ disabled: isCurrentDay, selected: isCopyDay }}
                    disabled={isCurrentDay || copying}
                    key={day}
                    onPress={() => toggleCopyDay(index)}
                    style={[styles.copyDay, isCopyDay && styles.selectedCopyDay, isCurrentDay && styles.currentCopyDay]}
                  >
                    <Text style={[styles.copyDayText, isCopyDay && styles.selectedCopyDayText, isCurrentDay && styles.currentCopyDayText]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.copyActions}>
              <Pressable
                accessibilityRole="button"
                disabled={copying || copyDays.length === 0}
                onPress={() => copyToDays(copyDays)}
                style={[styles.copyButton, (copying || copyDays.length === 0) && styles.disabledCopyButton]}
              >
                {copying ? <ActivityIndicator color={colors.background} /> : <Text style={styles.copyButtonText}>Copy selected</Text>}
              </Pressable>
              <Pressable accessibilityRole="button" disabled={copying} onPress={() => copyToDays(days.map((_, index) => index))} style={styles.allDaysButton}>
                <Text style={styles.allDaysButtonText}>All 7 days</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function ModeOption({
  label,
  mode,
  selectedMode,
  onPress,
}: {
  label: string;
  mode: AddActivityMode;
  selectedMode: AddActivityMode;
  onPress: (mode: AddActivityMode) => void;
}) {
  const selected = mode === selectedMode;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={() => onPress(mode)}
      style={[styles.modeOption, selected && styles.selectedModeOption]}
    >
      <Text style={[styles.modeOptionText, selected && styles.selectedModeOptionText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 32, paddingBottom: 40 },
  eyebrow: { color: colors.tertiary, fontSize: 12, letterSpacing: 1, marginBottom: 12 },
  title: { color: colors.onSurface, fontSize: 32, fontWeight: '500', marginBottom: 12 },
  description: { color: colors.onSurfaceVariant, fontSize: 16, lineHeight: 24, marginBottom: 24 },
  dayTabs: { gap: 8, paddingBottom: 8 },
  dayTab: { alignItems: 'center', borderColor: colors.outlineVariant, borderWidth: 1, justifyContent: 'center', minWidth: 48, minHeight: 42, paddingHorizontal: 10 },
  selectedDayTab: { backgroundColor: colors.tertiary, borderColor: colors.tertiary },
  dayTabText: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' },
  selectedDayTabText: { color: colors.background },
  selectedDayLabel: { color: colors.tertiary, fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12, marginTop: 8 },
  form: { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant, borderWidth: 1, padding: 16 },
  formTitle: { color: colors.onSurface, fontSize: 20, fontWeight: '500', marginBottom: 14 },
  modeToggle: { flexDirection: 'row', marginBottom: 20 },
  modeOption: { alignItems: 'center', borderColor: colors.outlineVariant, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  selectedModeOption: { backgroundColor: colors.tertiary, borderColor: colors.tertiary },
  modeOptionText: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  selectedModeOptionText: { color: colors.background },
  modePlaceholder: { color: colors.onSurfaceVariant, fontSize: 15, lineHeight: 22, paddingBottom: 8, paddingTop: 8, textAlign: 'center' },
  copyPanel: { borderColor: colors.outlineVariant, borderTopWidth: 1, marginTop: 28, paddingTop: 20 },
  copyTitle: { color: colors.onSurface, fontSize: 20, fontWeight: '500', marginBottom: 6 },
  copyDescription: { color: colors.onSurfaceVariant, fontSize: 14, marginBottom: 14 },
  copyDayRow: { flexDirection: 'row', gap: 6 },
  copyDay: { alignItems: 'center', borderColor: colors.outlineVariant, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 38 },
  selectedCopyDay: { backgroundColor: colors.progressTeal, borderColor: colors.progressTeal },
  currentCopyDay: { backgroundColor: colors.surfaceContainerHigh },
  copyDayText: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  selectedCopyDayText: { color: colors.background },
  currentCopyDayText: { color: colors.outline },
  copyActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  copyButton: { alignItems: 'center', backgroundColor: colors.tertiary, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
  disabledCopyButton: { opacity: 0.45 },
  copyButtonText: { color: colors.background, fontSize: 13, fontWeight: '600' },
  allDaysButton: { alignItems: 'center', borderColor: colors.tertiary, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
  allDaysButtonText: { color: colors.tertiary, fontSize: 13, fontWeight: '600' },
  field: { marginBottom: 16 },
  label: { color: colors.onSurfaceVariant, fontSize: 12, marginBottom: 6 },
  input: { borderBottomColor: colors.outlineVariant, borderBottomWidth: 1, color: colors.onSurface, fontSize: 16, minHeight: 44, paddingVertical: 8 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  button: { alignItems: 'center', backgroundColor: colors.tertiary, justifyContent: 'center', minHeight: 48, marginTop: 4 },
  buttonText: { color: colors.background, fontSize: 15, fontWeight: '600' },
  listHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 12, marginTop: 28 },
  sectionTitle: { color: colors.onSurface, flex: 1, fontSize: 20, fontWeight: '500' },
  count: { color: colors.tertiary, fontSize: 14 },
  loader: { marginVertical: 20 },
  error: { color: colors.missedRose, lineHeight: 20 },
  empty: { color: colors.onSurfaceVariant, fontSize: 15 },
  activity: { alignItems: 'center', backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant, borderWidth: 1, flexDirection: 'row', marginBottom: 8, padding: 14 },
  activityTime: { borderRightColor: colors.outlineVariant, borderRightWidth: 1, marginRight: 14, paddingRight: 14 },
  time: { color: colors.tertiary, fontSize: 18, fontWeight: '500' },
  minutes: { color: colors.outline, fontSize: 12, marginTop: 4 },
  activityDetails: { flex: 1 },
  activityTitle: { color: colors.onSurface, fontSize: 16, marginBottom: 4 },
  category: { color: colors.onSurfaceVariant, fontSize: 13 },
});
