import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const row = readFileSync('src/ui/ExpandableRow.tsx', 'utf8');

describe('expandable row', () => {
  it('is a button with a chevron that turns up when open', () => {
    expect(row).toContain('accessibilityRole="button"');
    expect(row).toContain('accessibilityState={{ expanded }}');
    expect(row).toContain('aria-expanded={expanded}');
    expect(row).toContain('minHeight: 44');
    expect(row).toContain("backgroundColor: pressed ? theme.colors.emphasisSoft : 'transparent'");
    expect(row).toContain("const CHEVRON = 'M6 9l6 6 6-6'");
    expect(row).toContain("outputRange: ['0deg', '180deg']");
    expect(row).toContain('duration: reduce ? 0 : 160');
    expect(row).toContain('accessibilityElementsHidden');
    expect(row).not.toContain('function Choice');
  });

  it('is the control for route questions and the other plain disclosures', () => {
    const users = [
      'src/ui/RouteChoiceGroup.tsx',
      'src/ui/HowItFelt.tsx',
      'src/ui/MealNutrientBars.tsx',
      'src/ui/TodayMeals.tsx',
      'src/ui/MealDayList.tsx',
      'src/ui/GlanceSheet.tsx',
      'src/ui/TrainingSchedule.tsx',
      'src/ui/HealthVisibility.tsx',
      'src/ui/AppleHealthCard.tsx',
      'src/ui/DailyActivity.tsx',
      'src/ui/ProcessedFoodList.tsx',
      'src/app/(main)/home.tsx',
      'src/app/(main)/thumos.tsx',
    ];
    for (const path of users) {
      expect(readFileSync(path, 'utf8'), path).toContain('<ExpandableRow');
    }
    const group = readFileSync('src/ui/RouteChoiceGroup.tsx', 'utf8');
    expect(group).toContain('useState(false)');
    expect(group).toContain('expanded={open}');
    expect(group).toContain('`${title} · ${choice}`');
    const about = readFileSync('src/ui/MoreInfo.tsx', 'utf8');
    expect(about).toContain("expanded ? '180deg' : '0deg'");
    expect(about).toContain("export const DATA_MEANING_TITLE = 'What this Data means'");
  });
});
