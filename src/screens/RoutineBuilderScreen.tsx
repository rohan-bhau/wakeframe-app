import { addDoc, collection, onSnapshot, orderBy, query } from 'firebase/firestore';
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const selectedActivities = activities.filter(
    (activity) => activity.weekday === selectedDay || (activity.weekday === undefined && selectedDay === 0),
  );

  const selectDay = (day: number) => {
    setSelectedDay(day);
    setForm(emptyForm);
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
