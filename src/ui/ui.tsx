import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import type { Verification } from '@/data/types';
import { HELMET_ASPECT, HELMET_D, HELMET_VIEWBOX } from '@/ui/helmet';
import { radius, useAppTheme } from '@/ui/theme';

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
    hero: { fontFamily: theme.font.display, fontSize: 64 * size, lineHeight: 72 * size, color: theme.colors.ink, letterSpacing: -0.5 },
    display: { fontFamily: theme.font.display, fontSize: 34 * size, lineHeight: 40 * size, color: theme.colors.ink, letterSpacing: 0.2 },
    title: { fontFamily: theme.font.display, fontSize: 24 * size, lineHeight: 30 * size, color: theme.colors.ink, letterSpacing: 0.2 },
    body: { fontFamily: theme.font.body, fontSize: 17 * size, lineHeight: 25 * size, color: theme.colors.ink },
    muted: { fontFamily: theme.font.body, fontSize: 15 * size, lineHeight: 22 * size, color: theme.colors.muted },
    label: {
      fontFamily: theme.font.bodyStrong,
      fontSize: 12 * size,
      lineHeight: 16 * size,
      color: theme.colors.muted,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
  };
  return (
    <Text maxFontSizeMultiplier={2} style={[styles[variant], style]}>
      {children}
    </Text>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  const theme = useAppTheme();
  return (
    <T
      variant="title"
      style={{ fontSize: size * theme.scale, lineHeight: size * theme.scale * 1.15, letterSpacing: 1.8, textTransform: 'uppercase' }}
    >
      Charioteer
    </T>
  );
}

export function Mark({ size = 36 }: { size?: number }) {
  const theme = useAppTheme();
  const width = size;
  const height = size / HELMET_ASPECT;
  return (
    <Svg width={width} height={height} viewBox={HELMET_VIEWBOX} accessibilityRole="image" accessibilityLabel="Winged helmet">
      <Path d={HELMET_D} fill={theme.colors.ink} fillRule="nonzero" />
    </Svg>
  );
}

/** The tab shell already pads the status bar and the home indicator. Full-screen routes do not. */
const ShellInsetContext = createContext({ topHandled: false, bottomHandled: false });

export function ShellInsetProvider({
  top,
  bottom,
  children,
}: {
  top?: boolean;
  bottom?: boolean;
  children: ReactNode;
}) {
  return (
    <ShellInsetContext.Provider value={{ topHandled: Boolean(top), bottomHandled: Boolean(bottom) }}>
      {children}
    </ShellInsetContext.Provider>
  );
}

export function Screen({
  children,
  eyebrow,
  title,
  intro,
  footer,
  banner,
  titleStyle,
  introStyle,
}: {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  intro?: string;
  footer?: ReactNode;
  banner?: ReactNode;
  titleStyle?: StyleProp<TextStyle>;
  introStyle?: StyleProp<TextStyle>;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const shell = useContext(ShellInsetContext);
  const topInset = shell.topHandled ? 0 : insets.top;
  const bottomInset = shell.bottomHandled ? 0 : insets.bottom;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, paddingTop: topInset }}>
        {banner ? <View style={[styles.page, { paddingBottom: 0 }]}>{banner}</View> : null}
        <ScrollView
          contentContainerStyle={[
            styles.page,
            { paddingBottom: 40 + bottomInset + (footer ? 8 : 0) },
          ]}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          {eyebrow ? <T variant="label">{eyebrow}</T> : null}
          {title ? <T variant="display" style={[{ marginTop: eyebrow ? 6 : 0 }, titleStyle]}>{title}</T> : null}
          {intro ? <T variant="muted" style={[{ marginTop: 8 }, introStyle]}>{intro}</T> : null}
          <View style={{ marginTop: title || intro ? 22 : 0, gap: 14 }}>{children}</View>
        </ScrollView>
        {footer ? (
          <View style={[styles.footer, { borderTopColor: theme.colors.line, backgroundColor: theme.colors.bg, paddingBottom: 16 + bottomInset }]}>
            {footer}
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
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
  tone?: 'primary' | 'quiet' | 'sos';
  disabled?: boolean;
  pending?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  const tones = {
    primary: { bg: theme.colors.ink, fg: theme.colors.bg },
    quiet: { bg: theme.colors.sunken, fg: theme.colors.ink },
    sos: { bg: theme.colors.dangerFill, fg: theme.colors.dangerInk },
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
  textContentType,
  keyboardType,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  /** iOS autofill. Password fields default to `password`; sign-up passes `newPassword`. */
  textContentType?: 'password' | 'newPassword';
  keyboardType?: 'default' | 'email-address' | 'decimal-pad' | 'number-pad';
  multiline?: boolean;
  hint?: string;
}) {
  const theme = useAppTheme();
  const [revealed, setRevealed] = useState(false);
  const password = Boolean(secureTextEntry);
  const contentType = password ? (textContentType ?? 'password') : undefined;
  const input = (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.muted}
      secureTextEntry={password && !revealed}
      textContentType={contentType}
      autoComplete={contentType === 'newPassword' ? 'password-new' : contentType === 'password' ? 'password' : undefined}
      keyboardType={keyboardType}
      multiline={multiline}
      autoCapitalize={password || keyboardType === 'email-address' ? 'none' : 'sentences'}
      autoCorrect={password ? false : keyboardType !== 'email-address'}
      style={[
        password ? styles.passwordInput : styles.input,
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
  );
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      {password ? (
        <View
          style={[
            styles.input,
            styles.passwordRow,
            { borderColor: theme.colors.line, backgroundColor: theme.colors.surface, minHeight: 52 },
          ]}
        >
          {input}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={4}
            onPress={() => setRevealed((open) => !open)}
            style={styles.passwordToggle}
          >
            <PasswordEye revealed={revealed} color={theme.colors.ink} />
          </Pressable>
        </View>
      ) : (
        input
      )}
      {hint ? <T variant="muted">{hint}</T> : null}
    </View>
  );
}

function PasswordEye({ revealed, color }: { revealed: boolean; color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      <Path
        d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" stroke={color} strokeWidth={1.6} />
      {revealed ? <Path d="M4 20L20 4" stroke={color} strokeWidth={1.6} strokeLinecap="round" /> : null}
    </Svg>
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
          borderColor: selected ? theme.colors.ink : theme.colors.line,
          backgroundColor: selected ? theme.colors.emphasisSoft : theme.colors.surface,
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
    <View style={[styles.note, { backgroundColor: theme.colors.dangerSoft, borderLeftColor: theme.colors.danger }]}>
      <T variant="body" style={{ color: theme.colors.danger }}>{children}</T>
    </View>
  );
}

export function Stamp({ kind }: { kind: Verification }) {
  const theme = useAppTheme();
  const solid = kind === 'verified';
  const label = kind === 'verified' ? 'Checked' : kind === 'partial' ? 'Partly checked' : 'Not linked';
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: solid ? theme.colors.ink : theme.colors.line,
        backgroundColor: solid ? theme.colors.ink : 'transparent',
      }}
    >
      <T variant="label" style={{ color: solid ? theme.colors.bg : theme.colors.muted }}>{label}</T>
    </View>
  );
}

export function Meter({
  label,
  points,
  max,
}: {
  label: string;
  points: { id: string; value: number }[];
  max: number;
}) {
  const theme = useAppTheme();
  return (
    <View accessibilityLabel={`${label} chart`} style={{ gap: 8 }}>
      <T variant="label">{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 72 }}>
        {points.map((point) => {
          const ratio = Math.max(0, Math.min(1, point.value / max));
          return (
            <View key={point.id} style={{ flex: 1, height: 72, justifyContent: 'flex-end', backgroundColor: theme.colors.sunken }}>
              <View style={{ height: Math.max(3, Math.round(ratio * 72)), backgroundColor: theme.colors.ink }} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: 18, gap: 8 },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { letterSpacing: 0.4 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingRight: 4, paddingLeft: 0 },
  passwordInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', paddingLeft: 14, paddingRight: 4, paddingVertical: 12 },
  passwordToggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  choice: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  note: { borderRadius: radius.sm, borderLeftWidth: 3, padding: 14 },
});
