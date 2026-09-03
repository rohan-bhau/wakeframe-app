import { PlaceholderScreen } from '../components/PlaceholderScreen';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';

export function SettingsScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <PlaceholderScreen title="Settings" description="Configure notifications, breaks, and data here.">
      <Pressable accessibilityRole="button" onPress={onLogout} style={styles.button}>
        <Text style={styles.buttonText}>Log out</Text>
      </Pressable>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  button: { borderColor: colors.outline, borderWidth: 1, marginTop: 32, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: colors.onSurface, fontSize: 15, fontWeight: '600' },
});
