import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  STAT_ICON_PX,
  STAT_ICON_STROKE,
  activityTitleIcon,
  healthTileIcon,
  workoutStatIcon,
} from '@/domain/statIcons';

describe('stat icons', () => {
  it('keeps one size, one stroke, and no badge or emoji', () => {
    expect(STAT_ICON_PX).toBe(22);
    expect(STAT_ICON_STROKE).toBe(1.5);
    const ui = readFileSync('src/ui/statIcons.tsx', 'utf8');
    expect(ui).toContain('strokeWidth: STAT_ICON_STROKE');
    expect(ui).toContain('width={STAT_ICON_PX}');
    expect(ui).toContain('height={STAT_ICON_PX}');
    expect(ui).toContain('color={theme.colors.muted}');
    expect(ui).toContain('width: 28');
    expect(ui).toContain('gap: 12');
    expect(ui).toContain('minHeight: 44');
    expect(ui).toContain('minWidth: 0');
    expect(ui).toContain('flexShrink: 0');
    expect(ui).toContain('accessibilityLabel={label}');
    expect(ui).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(ui).not.toContain('borderRadius');
    expect(ui).not.toContain('backgroundColor');
  });

  it('picks a glyph for the rows that have one and leaves the rest as words', () => {
    expect(workoutStatIcon(37)).toBe('run');
    expect(workoutStatIcon(52)).toBe('walk');
    expect(workoutStatIcon(24)).toBe('walk');
    expect(workoutStatIcon(13)).toBe('cycle');
    expect(workoutStatIcon(35)).toBe('row');
    expect(workoutStatIcon(46)).toBe('swim');
    expect(workoutStatIcon(50)).toBe('strength');
    expect(workoutStatIcon(57)).toBe('yoga');
    expect(workoutStatIcon(63)).toBe('hiit');
    expect(workoutStatIcon(3000)).toBe('other');
    expect(healthTileIcon('steps')).toBe('steps');
    expect(healthTileIcon('resting_heart_rate')).toBe('heart');
    expect(healthTileIcon('hrv_sdnn')).toBe('pulse');
    expect(healthTileIcon('sleep_hours')).toBe('moon');
    expect(healthTileIcon('vo2_max')).toBe('gauge');
    expect(healthTileIcon('weight_kg')).toBe('scale');
    expect(healthTileIcon('active_energy')).toBe('flame');
    expect(healthTileIcon('mix')).toBeNull();
    expect(activityTitleIcon('Steps')).toBe('steps');
    expect(activityTitleIcon('Distance')).toBe('ruler');
    expect(activityTitleIcon('Active calories')).toBe('flame');
    expect(activityTitleIcon('Exercise minutes')).toBe('timer');
    expect(activityTitleIcon('Blood oxygen')).toBe('spo2');
    expect(activityTitleIcon('Average stress')).toBe('stress');
    expect(activityTitleIcon('Body battery charged')).toBe('battery');
    expect(activityTitleIcon('Overnight HRV')).toBe('pulse');
    expect(activityTitleIcon('VO2 max')).toBe('gauge');
    expect(activityTitleIcon('Sleep duration')).toBe('moon');
    expect(activityTitleIcon('What is this?')).toBeNull();
  });

  it('places one icon beside the stat and keeps an unrecorded distance honest', () => {
    const screen = readFileSync('src/app/(main)/workout/[id].tsx', 'utf8');
    expect(screen).toContain('<IconLine');
    expect(screen).toContain('label={row.label}');
    expect(screen).toContain('muted: !stats.distanceRecorded');
    expect(screen).toContain('muted: !stats.paceRecorded');
    expect(screen).toContain('ROUTE_NONE');
    expect(screen).not.toContain('Distance 0 km');
    expect(screen).not.toContain('Pace not available');
    const list = readFileSync('src/ui/WorkoutList.tsx', 'utf8');
    expect(list).toContain('workoutStatIcon(workout.activityType)');
    expect(list).toContain('width: 28');
    expect(list).toContain('<StatGlyph');
    expect(readFileSync('src/ui/HealthStatBoard.tsx', 'utf8')).toContain('healthTileIcon(tile.id)');
    expect(readFileSync('src/ui/DailyActivity.tsx', 'utf8')).toContain('activityTitleIcon(title)');
    const fitness = readFileSync('src/ui/YourFitness.tsx', 'utf8');
    expect(fitness).toContain('icon="gauge"');
    expect(fitness).toContain('icon="timer"');
    expect(fitness).toContain('<IconLabel name="heart">Resting heart rate</IconLabel>');
    const home = readFileSync('src/app/(main)/home.tsx', 'utf8');
    expect(home).toContain('icon="day" label="Sober days"');
    expect(home).toContain('<IconLabel name="day">Today</IconLabel>');
    expect(home).toContain('<IconLabel name="pulse">Health Stats</IconLabel>');
    expect(home).toContain('variant="label">Quote of the day');
    expect(home).not.toContain('icon="glass"');
    expect(readFileSync('src/ui/BodyComposition.tsx', 'utf8')).toContain('<IconLabel name="body">Body</IconLabel>');
    expect(readFileSync('src/app/(main)/weight-waist.tsx', 'utf8')).toContain('<IconLabel name="scale">Weight</IconLabel>');
    expect(readFileSync('src/ui/HealthBoard.tsx', 'utf8')).toContain('<IconLabel name="ruler">Measurements</IconLabel>');
  });
});
