import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { auth } from '../config/firebase';
import { colors } from '../theme';

type AuthMode = 'login' | 'signup';

const getAuthError = (error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';

  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
      return 'The email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'That email is already in use. Try logging in instead.';
    case 'auth/weak-password':
      return 'Choose a stronger password with at least 6 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.';
    default:
      return 'Something went wrong. Check your connection and try again.';
  }
};

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (authError) {
      setError(getAuthError(authError));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((current) => (current === 'login' ? 'signup' : 'login'));
    setError(null);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>Wakeframe</Text>
        <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={styles.description}>
          {mode === 'login' ? 'Log in to continue tracking your day.' : 'Start building a more honest picture of your time.'}
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.outline}
            style={styles.input}
            textContentType="emailAddress"
            value={email}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={colors.outline}
            secureTextEntry
            style={styles.input}
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            value={password}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={submitting} onPress={submit} style={styles.button}>
            {submitting ? <ActivityIndicator color={colors.background} /> : <Text style={styles.buttonText}>{mode === 'login' ? 'Log in' : 'Sign up'}</Text>}
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" onPress={toggleMode} style={styles.toggle}>
          <Text style={styles.toggleText}>
            {mode === 'login' ? 'Need an account? ' : 'Already have an account? '}
            <Text style={styles.toggleAction}>{mode === 'login' ? 'Sign up' : 'Log in'}</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 20 },
  eyebrow: { color: colors.tertiary, fontSize: 12, letterSpacing: 1, marginBottom: 12 },
  title: { color: colors.onSurface, fontSize: 32, fontWeight: '500', marginBottom: 12 },
  description: { color: colors.onSurfaceVariant, fontSize: 16, lineHeight: 24, marginBottom: 28, maxWidth: 340 },
  form: { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant, borderWidth: 1, padding: 16 },
  label: { color: colors.onSurfaceVariant, fontSize: 12, marginBottom: 6, marginTop: 4 },
  input: { borderBottomColor: colors.outlineVariant, borderBottomWidth: 1, color: colors.onSurface, fontSize: 16, minHeight: 44, paddingVertical: 8, marginBottom: 16 },
  error: { color: colors.missedRose, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  button: { alignItems: 'center', backgroundColor: colors.tertiary, justifyContent: 'center', minHeight: 48 },
  buttonText: { color: colors.background, fontSize: 15, fontWeight: '600' },
  toggle: { alignItems: 'center', marginTop: 24, padding: 8 },
  toggleText: { color: colors.onSurfaceVariant, fontSize: 14 },
  toggleAction: { color: colors.tertiary, fontWeight: '600' },
});
