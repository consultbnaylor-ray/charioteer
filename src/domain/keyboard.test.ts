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

  it('closes a number pad from Done, Return, and a tap outside', () => {
    expect(keyboard).toContain('export function dismissKeyboard');
    expect(keyboard).toContain('currentlyFocusedInput');
    expect(keyboard).toContain('currentlyFocusedField');
    expect(keyboard).toContain('blurTextInput');
    expect(keyboard).toContain('onPress={dismissKeyboard}');
    expect(keyboard).toContain('onPressIn={dismissKeyboard}');
    expect(ui).toContain("keyboardType === 'number-pad' || keyboardType === 'decimal-pad'");
    expect(ui).toContain("returnKeyType={closePad ? 'done' : keys.returnKeyType}");
    expect(ui).toContain('blurOnSubmit={closePad ? true : keys.blurOnSubmit}');
    expect(ui).toContain('onSubmitEditing={closePad ? closeKeyboard : keys.onSubmitEditing}');
    expect(ui).toContain('inputRef.current?.blur()');
    expect(ui).toContain('<DismissKeyboard style={{ flexGrow: 1 }}>');
    expect(ui).toContain('automaticallyAdjustKeyboardInsets');
    expect(ui).toContain('<KeyboardDoneBar />');
    const nutrition = readFileSync('src/app/(main)/nutrition.tsx', 'utf8');
    const save = nutrition.slice(nutrition.indexOf('function saveMeal'), nutrition.indexOf('function saveEdited'));
    expect(save).toContain('dismissKeyboard()');
    expect(nutrition).not.toContain('rememberConfirmPlace');
    expect(nutrition).not.toContain('meal-log-actions');
    expect(readFileSync('src/ui/MealEdit.tsx', 'utf8')).toContain('dismissKeyboard()');
    const numeric = [
      'src/app/(main)/nutrition.tsx',
      'src/ui/MealEdit.tsx',
      'src/ui/HealthBoard.tsx',
      'src/ui/HealthStatBoard.tsx',
      'src/ui/BodyComposition.tsx',
      'src/app/(main)/home.tsx',
      'src/app/(main)/profile.tsx',
      'src/app/(main)/check-in.tsx',
      'src/app/(main)/health.tsx',
      'src/app/onboarding.tsx',
      'src/app/(main)/units.tsx',
      'src/ui/TrainingSchedule.tsx',
      'src/ui/WorkoutCalendar.tsx',
    ];
    for (const file of numeric) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toMatch(/keyboardType="(?:number-pad|decimal-pad)"/);
      expect(source, file).not.toContain('<TextInput');
    }
  });
});
