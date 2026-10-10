import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useAppTheme } from '@/ui/theme';

type Variant = 'hero' | 'display' | 'title' | 'body' | 'muted' | 'label';

export function T({
  variant = 'body',
  style,
  children,
}: {
  variant?: Variant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  const size = theme.scale;
  const styles: Record<Variant, TextStyle> = {
    hero: { fontFamily: theme.font.display, fontSize: 64 * size, lineHeight: 68 * size, color: theme.colors.ink, letterSpacing: -1.5 },
    display: { fontFamily: theme.font.display, fontSize: 34 * size, lineHeight: 40 * size, color: theme.colors.ink },
    title: { fontFamily: theme.font.display, fontSize: 26 * size, lineHeight: 32 * size, color: theme.colors.ink },
    body: { fontFamily: theme.font.body, fontSize: 17 * size, lineHeight: 25 * size, color: theme.colors.ink },
    muted: { fontFamily: theme.font.body, fontSize: 15 * size, lineHeight: 22 * size, color: theme.colors.muted },
    label: {
      fontFamily: theme.font.bodyStrong,
      fontSize: 13 * size,
      lineHeight: 18 * size,
      color: theme.colors.muted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
  };
  return (
    <Text maxFontSizeMultiplier={2} style={[styles[variant], style]}>
      {children}
    </Text>
  );
}

export function Screen({
  children,
  eyebrow,
  title,
  intro,
  footer,
}: {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  intro?: string;
  footer?: ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {eyebrow ? <T variant="label">{eyebrow}</T> : null}
        {title ? <T variant="display" style={{ marginTop: eyebrow ? 6 : 0 }}>{title}</T> : null}
        {intro ? <T variant="muted" style={{ marginTop: 8 }}>{intro}</T> : null}
        <View style={{ marginTop: title || intro ? 22 : 0, gap: 14 }}>{children}</View>
      </ScrollView>
      {footer ? <View style={[styles.footer, { borderTopColor: theme.colors.line, backgroundColor: theme.colors.bg }]}>{footer}</View> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }, style]}>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled,
  pending,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'quiet' | 'sos' | 'sage';
  disabled?: boolean;
  pending?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  const tones = {
    primary: { bg: theme.colors.ink, fg: theme.scheme === 'dark' ? theme.colors.bg : '#FBF7F1' },
    quiet: { bg: theme.colors.sunken, fg: theme.colors.ink },
    sos: { bg: theme.colors.copper, fg: theme.colors.copperInk },
    sage: { bg: theme.colors.sage, fg: theme.scheme === 'dark' ? '#10241C' : '#F4FBF7' },
  }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled || pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: tones.bg, opacity: disabled ? 0.45 : pressed ? 0.86 : 1 },
      ]}
    >
      {pending ? <ActivityIndicator color={tones.fg} /> : <Text style={[styles.buttonText, { color: tones.fg, fontFamily: theme.font.bodyStrong, fontSize: 16 * theme.scale }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'decimal-pad' | 'number-pad';
  multiline?: boolean;
  hint?: string;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={keyboardType !== 'email-address'}
        style={[
          styles.input,
          {
            color: theme.colors.ink,
            borderColor: theme.colors.line,
            backgroundColor: theme.colors.surface,
            fontFamily: theme.font.body,
            fontSize: 17 * theme.scale,
            minHeight: multiline ? 110 : 52,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
      {hint ? <T variant="muted">{hint}</T> : null}
    </View>
  );
}

export function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          borderColor: selected ? theme.colors.copper : theme.colors.line,
          backgroundColor: selected ? theme.colors.copperSoft : theme.colors.surface,
        },
      ]}
    >
      <Text style={{ fontFamily: theme.font.bodyStrong, color: theme.colors.ink, fontSize: 15 * theme.scale }}>{label}</Text>
    </Pressable>
  );
}

export function ErrorNote({ children }: { children: string | null }) {
  const theme = useAppTheme();
  if (!children) return null;
  return (
    <View style={[styles.note, { backgroundColor: theme.colors.dangerSoft }]}>
      <T variant="body" style={{ color: theme.colors.danger }}>{children}</T>
    </View>
  );
}

export function Mark() {
  const theme = useAppTheme();
  return (
    <View style={[styles.mark, { borderColor: theme.colors.copper }]}>
      <View style={[styles.rein, { backgroundColor: theme.colors.copper }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 8 },
  button: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { letterSpacing: 0.2 },
  input: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  note: { borderRadius: 16, padding: 14 },
  mark: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rein: { width: 14, height: 2, borderRadius: 1 },
});
