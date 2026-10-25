import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { APP_SECTIONS, TAB_SECTIONS, menuSectionActive } from './sections';

describe('Workouts in the side menu', () => {
  it('sits in Tools directly under Health Plan and opens /workouts', () => {
    const labels = APP_SECTIONS.map((section) => section.label);
    const workouts = APP_SECTIONS.find((section) => section.id === 'workouts');
    expect(workouts).toMatchObject({
      label: 'Workouts',
      href: '/workouts',
      icon: 'workout',
      group: 'tools',
    });
    expect(workouts?.tab).toBeUndefined();
    expect(labels.indexOf('Workouts')).toBe(labels.indexOf('Health Plan') + 1);
    expect(labels.indexOf('Get Outside')).toBe(labels.indexOf('Workouts') + 1);
    expect(labels.indexOf('Progress photos')).toBe(labels.indexOf('Get Outside') + 1);
    expect(TAB_SECTIONS).toHaveLength(6);
    expect(TAB_SECTIONS.map((section) => section.label)).not.toContain('Workouts');
    const buildNumber = JSON.parse(readFileSync('app.json', 'utf8')).expo.ios.buildNumber;
    expect(buildNumber).toMatch(/^\d+$/);
    expect(Number(buildNumber)).toBeGreaterThanOrEqual(49);
  });

  it('highlights Workouts on that screen the same way Health Plan is highlighted', () => {
    expect(menuSectionActive('/workouts', '/workouts')).toBe(true);
    expect(menuSectionActive('/health-plan', '/health-plan')).toBe(true);
    expect(menuSectionActive('/workout/abc', '/workouts')).toBe(false);
    expect(menuSectionActive('/workouts/extra', '/workouts')).toBe(false);
    expect(menuSectionActive('/health', '/workouts')).toBe(false);
    expect(menuSectionActive('/chat/one', '/people')).toBe(true);
    const drawer = readFileSync('src/ui/SectionDrawer.tsx', 'utf8');
    expect(drawer).toContain('menuSectionActive(pathname, section.href)');
    expect(drawer).toContain('accessibilityState={{ selected: active }}');
    expect(drawer).toContain('router.navigate(href as never)');
  });

  it('draws a monochrome line dumbbell in the same style as the other menu icons', () => {
    const icons = readFileSync('src/ui/menuIcons.tsx', 'utf8');
    const glyph = icons.slice(icons.indexOf("name === 'workout'"), icons.indexOf("name === 'meal'"));
    expect(glyph).toContain("name === 'workout'");
    expect(glyph).toContain('stroke={color}');
    expect(glyph).toContain('{...stroke}');
    expect(glyph).not.toMatch(/fill=/);
    expect(icons).toContain('viewBox="0 0 24 24" fill="none"');
    expect(icons).toContain('strokeWidth: 1.6');
    expect(icons).toContain('width={18}');
  });
});
