import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
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
import { topSafeInset } from '@/ui/safeArea';
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
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  intro?: string;
  footer?: ReactNode;
  banner?: ReactNode;
  titleStyle?: StyleProp<TextStyle>;
  introStyle?: StyleProp<TextStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const shell = useContext(ShellInsetContext);
  const topInset = shell.topHandled ? 0 : topSafeInset(insets.top);
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
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={Boolean(refreshing)}
                onRefresh={onRefresh}
                tintColor={theme.colors.ink}
                colors={[theme.colors.ink]}
              />
            ) : undefined
          }
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

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  const box = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }, style];
  if (!onPress) return <View style={box}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [box, { opacity: pressed ? 0.86 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

export function Pencil({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      <Path d="M4 16.5V20h3.5L18.8 8.7a2.1 2.1 0 0 0 0-3L18.3 4.2a2.1 2.1 0 0 0-3 0L4 15.5v1z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M13.8 6.2l4 4" stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

/** Small edit mark. The surrounding card is the button, so the icon itself is not a second control. */
export function EditMark({ label }: { label: string }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <T variant="label">{label}</T>
      <View accessibilityElementsHidden style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
        <Pencil color={theme.colors.ink} />
      </View>
    </View>
  );
}

export function EditSheet({
  visible,
  title,
  intro,
  children,
  onClose,
  onSave,
  pending,
  saveLabel,
}: {
  visible: boolean;
  title: string;
  intro?: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
  pending?: boolean;
  saveLabel: string;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close editor" style={{ flex: 1 }} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={{
              backgroundColor: theme.colors.bg,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 16 + insets.bottom,
              gap: 12,
              maxHeight: 640,
            }}
          >
            <T variant="title">{title}</T>
            {intro ? <T>{intro}</T> : null}
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, maxHeight: 420 }} contentContainerStyle={{ gap: 12 }}>
              {children}
            </ScrollView>
            <Button label={saveLabel} pending={pending} onPress={onSave} />
            <Button label="Cancel" tone="quiet" onPress={onClose} disabled={pending} />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
  editable = true,
  maxLength,
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
  editable?: boolean;
  maxLength?: number;
}) {
  const theme = useAppTheme();
  const [revealed, setRevealed] = useState(false);
  const password = Boolean(secureTextEntry);
  // iOS paints the first TextInput placeholder with `color` when a custom font
  // is set, and ignores placeholderTextColor. An empty field uses the hint
  // colour for both, so an example never looks like something already typed.
  const textColor = value ? theme.colors.ink : theme.colors.placeholder;
  const contentType = password ? (textContentType ?? 'password') : undefined;
  const input = (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.placeholder}
      secureTextEntry={password && !revealed}
      textContentType={contentType}
      autoComplete={contentType === 'newPassword' ? 'password-new' : contentType === 'password' ? 'password' : undefined}
      keyboardType={keyboardType}
      multiline={multiline}
      editable={editable}
      maxLength={maxLength}
      autoCapitalize={password || keyboardType === 'email-address' ? 'none' : 'sentences'}
      autoCorrect={password ? false : keyboardType !== 'email-address'}
      style={[
        password ? styles.passwordInput : styles.input,
        {
          color: textColor,
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
