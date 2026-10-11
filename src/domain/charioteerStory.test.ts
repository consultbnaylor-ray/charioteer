import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CHARIOTEER_STORY, CHARIOTEER_STORY_TITLE } from './charioteerStory';

describe('the story of the charioteer', () => {
  it('keeps Ben’s wording, with Phaedrus named once', () => {
    expect(CHARIOTEER_STORY_TITLE).toBe('The Story of The Charioteer of the Soul');
    expect(CHARIOTEER_STORY).toBe(
      "In Plato's Phaedrus, the Charioteer of the Soul, every soul is a chariot drawn by two winged horses and steered by a single man. One horse, Thumos, is white and upright, a creature of honour and spirit that answers to a word and never needs the whip. The other is dark and crooked, deaf to reason, straining hard after every pleasure that glints along the road. The Charioteer is reason. His work is to stand firm, hold the reins steady and drive both horses as one. If he masters them, the chariot climbs to the rim of the heavens, where the soul sees truth, beauty and goodness as they really are. If the dark horse wins, the chariot plunges, the wings shed their feathers, and the soul falls to earth. Yet each time the Charioteer hauls the wild horse back, it grows a little quieter, and the wings begin, feather by feather, to grow again. The first days at the reins are the hardest, but every day of steady hands makes the climb a little easier.",
    );
    expect(CHARIOTEER_STORY.split('Phaedrus')).toHaveLength(2);
  });

  it('sits collapsed at the bottom of Thumos, and is not part of the coach prompt', () => {
    const screen = readFileSync('src/app/(main)/thumos.tsx', 'utf8');
    const banner = screen.slice(screen.indexOf('function SoulStory'));
    expect(banner).toContain('CHARIOTEER_STORY_TITLE');
    expect(banner).toContain('CHARIOTEER_STORY');
    expect(banner).toContain('useState(false)');
    expect(banner).toContain('accessibilityRole="button"');
    expect(banner).toContain('accessibilityState={{ expanded: open }}');
    expect(banner).toContain('theme.font.bodyItalic');
    expect(banner).toContain('Phaedrus');
    expect(banner).toContain('HELMET_D');
    expect(banner).toContain('accessibilityElementsHidden');
    const milestones = screen.indexOf('Milestones in view');
    const story = screen.indexOf('<SoulStory />');
    expect(milestones).toBeGreaterThan(-1);
    expect(story).toBeGreaterThan(milestones);
    const prompt = readFileSync('supabase/functions/_shared/thumos.ts', 'utf8');
    expect(prompt).not.toContain('CHARIOTEER_STORY');
    expect(prompt).not.toContain('The Story of The Charioteer of the Soul');
  });
});
