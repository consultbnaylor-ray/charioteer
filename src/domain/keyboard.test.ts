import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('keyboard dismissal', () => {
  const keyboard = readFileSync('src/ui/keyboard.tsx', 'utf8');
  const ui = readFileSync('src/ui/ui.tsx', 'utf8');
  const photos = readFileSync('src/ui/ProgressPhotos.tsx', 'utf8');
  const root = readFileSync('src/app/_layout.tsx', 'utf8');

  it('dismisses from a scroll, a tap outside, Return, and a Done bar', () => {
    expect(keyboard).toContain("keyboardShouldPersistTaps: 'handled'");
    expect(keyboard).toContain("'interactive'");
    expect(keyboard).toContain("'on-drag'");
    expect(keyboard).toContain('Keyboard.dismiss');
    expect(keyboard).toContain('TouchableWithoutFeedback');
    expect(keyboard).toContain('<InputAccessoryView');
    expect(keyboard).toContain('>Done<');
    expect(keyboard).toContain("returnKeyType: multiline ? undefined : last ? ('done' as const) : ('next' as const)");
    expect(ui).toContain('{...inputScrollProps}');
    expect(ui).toContain('keyboardVerticalOffset={keyboardVerticalOffset}');
    expect(ui).toContain('dismissKeyboardOnAction(label)');
    expect(ui).toContain('inputAccessoryViewID={keyboardAccessoryId');
    expect(photos).toContain('{...inputScrollProps}');
    expect(root).toContain('<KeyboardDoneBar />');
    expect(keyboard).not.toMatch(/comment/i);
  });
});
