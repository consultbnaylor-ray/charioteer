import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAppTheme } from '@/ui/theme';

/** Drag dismisses the keyboard. On iOS the keyboard follows the finger. */
export const inputScrollProps = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: Platform.OS === 'ios' ? ('interactive' as const) : ('on-drag' as const),
};

export const KEYBOARD_DONE_ID = 'charioteer-keyboard-done';

type Entry = { id: number; focus: () => void };

type Registry = {
  register: (focus: () => void) => { id: number; unregister: () => void };
  focusAfter: (id: number) => boolean;
};

const RegistryContext = createContext<Registry | null>(null);
const OrderContext = createContext<number[]>([]);

/** Fields inside register in mount order, so Return moves to the next one. */
export function KeyboardForm({ children }: { children: ReactNode }) {
  const fields = useRef<Entry[]>([]);
  const nextId = useRef(1);
  const [ids, setIds] = useState<number[]>([]);
  const registry = useMemo<Registry>(() => ({
    register(focus) {
      const id = nextId.current++;
      fields.current.push({ id, focus });
      setIds(fields.current.map((item) => item.id));
      return {
        id,
        unregister() {
          fields.current = fields.current.filter((item) => item.id !== id);
          setIds(fields.current.map((item) => item.id));
        },
      };
    },
    focusAfter(id) {
      const index = fields.current.findIndex((item) => item.id === id);
      const next = index >= 0 ? fields.current[index + 1] : undefined;
      if (!next) return false;
      next.focus();
      return true;
    },
  }), []);
  return (
    <RegistryContext.Provider value={registry}>
      <OrderContext.Provider value={ids}>{children}</OrderContext.Provider>
    </RegistryContext.Provider>
  );
}

export function useKeyboardField(ref: { current: TextInput | null }, multiline: boolean) {
  const registry = useContext(RegistryContext);
  const ids = useContext(OrderContext);
  const [fieldId, setFieldId] = useState<number | null>(null);

  useEffect(() => {
    if (!registry) return;
    const handle = registry.register(() => ref.current?.focus());
    setFieldId(handle.id);
    return () => handle.unregister();
  }, [registry, ref]);

  const last = fieldId == null || ids.length === 0 || ids[ids.length - 1] === fieldId;
  const submit = useCallback(() => {
    if (multiline) return;
    if (fieldId != null && registry?.focusAfter(fieldId)) return;
    dismissKeyboard();
  }, [fieldId, multiline, registry]);

  return {
    returnKeyType: multiline ? undefined : last ? ('done' as const) : ('next' as const),
    blurOnSubmit: !multiline,
    onSubmitEditing: multiline ? undefined : submit,
  };
}

/** Resign the focused field, then hide the keyboard. A number pad has no Return key, and dismiss alone leaves it up. */
export function dismissKeyboard() {
  const state = (TextInput as {
    State?: {
      currentlyFocusedInput?: () => object | null;
      currentlyFocusedField?: () => object | null;
      blurTextInput?: (field: object) => void;
    };
  }).State;
  const focused = state?.currentlyFocusedInput?.() ?? state?.currentlyFocusedField?.() ?? null;
  if (focused) state?.blurTextInput?.(focused);
  Keyboard.dismiss();
}

/** A tap on a region that does not scroll dismisses the keyboard. */
export function DismissKeyboard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard} accessible={false}>
      <View style={style}>{children}</View>
    </TouchableWithoutFeedback>
  );
}

/** iOS keyboards without a Return key get a Done bar. Multiline notes use it too. */
export function KeyboardDoneBar() {
  const theme = useAppTheme();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={[styles.bar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.line }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={dismissKeyboard} onPressIn={dismissKeyboard} style={styles.done}>
          <Text style={{ color: theme.colors.ink, fontFamily: theme.font.bodyStrong, fontSize: 17 }}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

export function keyboardAccessoryId(multiline: boolean, keyboardType?: string): string | undefined {
  if (Platform.OS !== 'ios') return undefined;
  if (multiline || keyboardType === 'number-pad' || keyboardType === 'decimal-pad') return KEYBOARD_DONE_ID;
  return undefined;
}

/** Screen position of this view, so the avoiding view pads by the real overlap. */
export function useKeyboardOffset() {
  const hostRef = useRef<View>(null);
  const [offset, setOffset] = useState(0);
  const onLayout = useCallback(() => {
    hostRef.current?.measureInWindow((_x, y) => {
      const next = Math.max(0, Math.round(y));
      setOffset((current) => (current === next ? current : next));
    });
  }, []);
  return { hostRef, keyboardVerticalOffset: offset, onKeyboardLayout: onLayout };
}

export function dismissKeyboardOnAction(label: string) {
  if (/^(send|save|cancel)\b/i.test(label.trim())) dismissKeyboard();
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end' },
  done: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
});
