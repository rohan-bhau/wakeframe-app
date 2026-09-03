import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

type PlaceholderScreenProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function PlaceholderScreen({ title, description, children }: PlaceholderScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Wakeframe</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  eyebrow: {
    color: colors.tertiary,
    fontFamily: 'Space Grotesk',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 12,
  },
  title: {
    color: colors.onSurface,
    fontFamily: 'Space Grotesk',
    fontSize: 32,
    fontWeight: '500',
    marginBottom: 12,
  },
  description: {
    color: colors.onSurfaceVariant,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 340,
  },
});
