import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { WORKOUT_TYPE_LABEL } from '../../supabase/functions/_shared/fitnessSnapshot.ts';
import {
  WORKOUT_TYPE_COLOR,
  WORKOUT_TYPE_OTHER_COLOR,
  workoutTypeColor,
} from '@/domain/workoutTypeColor';

describe('workout type colours', () => {
  it('gives each named type one Okabe–Ito colour and keeps Other grey', () => {
    expect(WORKOUT_TYPE_COLOR).toEqual({
      Walking: '#56B4E9',
      'Functional strength': '#E69F00',
      'Traditional strength': '#0072B2',
      Elliptical: '#009E73',
      Running: '#D55E00',
      Boxing: '#CC79A7',
      Rowing: '#F0E442',
    });
    expect(WORKOUT_TYPE_OTHER_COLOR).toBe('#8A8A84');
    const named = Object.values(WORKOUT_TYPE_COLOR);
    expect(new Set(named).size).toBe(named.length);
    expect(named).not.toContain(WORKOUT_TYPE_OTHER_COLOR);
    for (const [label, color] of Object.entries(WORKOUT_TYPE_COLOR)) {
      expect(workoutTypeColor(label)).toBe(color);
    }
    expect(workoutTypeColor('Other')).toBe(WORKOUT_TYPE_OTHER_COLOR);
    expect(workoutTypeColor('Walking')).toBe(workoutTypeColor('Walking'));
  });

  it('keeps a further type off the named colours and stable across charts', () => {
    const named = new Set<string>([...Object.values(WORKOUT_TYPE_COLOR), WORKOUT_TYPE_OTHER_COLOR]);
    const extras = ['Cycling', 'Hiking', 'Swimming', 'Yoga', 'HIIT', 'Mixed cardio', 'Core training', 'Kickboxing'];
    const colors = extras.map((label) => workoutTypeColor(label));
    for (const color of colors) expect(named.has(color)).toBe(false);
    expect(new Set(colors).size).toBe(colors.length);
    expect(workoutTypeColor('Cycling')).toBe(workoutTypeColor('Cycling'));
    const known = [...new Set(Object.values(WORKOUT_TYPE_LABEL))];
    for (const label of known) {
      expect(workoutTypeColor(label)).toBe(workoutTypeColor(label));
    }
  });

  it('uses the type colour on both charts and puts the word next to the swatch', () => {
    const list = readFileSync('src/ui/WorkoutList.tsx', 'utf8');
    expect(list).toContain('workoutTypeColor(segment.label)');
    expect(list).toContain('workoutTypeColor(mark.typeLabel)');
    expect(list).toContain('workoutTypeColor(label)');
    expect(list).toContain('<T>{label}</T>');
    const legend = list.slice(list.indexOf('function SeriesLegend'), list.indexOf('function dayNumber'));
    expect(legend.indexOf('backgroundColor: workoutTypeColor(label)')).toBeLessThan(legend.indexOf('<T>{label}</T>'));
    expect(list).not.toMatch(/opacity: typeOpacity|opacity: mark\.measureName/);
    const screen = readFileSync('src/ui/theme.tsx', 'utf8');
    expect(screen).toContain('workoutTypeColor.ts');
  });
});
