export type BreathCue = 'in' | 'hold' | 'out';

export type BreathPhase = {
  label: string;
  seconds: number;
  /** 0.68 is a small circle, 1 is a full one. */
  scale: number;
  cue: BreathCue;
};

export type BreathExercise = {
  id: string;
  title: string;
  summary: string;
  phases: BreathPhase[];
};

export const BREATH_EXERCISES: BreathExercise[] = [
  {
    id: 'box',
    title: 'Box breathing',
    summary: 'Four equal sides. Useful when your mind is sprinting.',
    phases: [
      { label: 'Breathe in', seconds: 4, scale: 1, cue: 'in' },
      { label: 'Hold', seconds: 4, scale: 1, cue: 'hold' },
      { label: 'Breathe out', seconds: 4, scale: 0.72, cue: 'out' },
      { label: 'Hold', seconds: 4, scale: 0.72, cue: 'hold' },
    ],
  },
  {
    id: '478',
    title: '4-7-8',
    summary: 'A longer exhale than inhale. Helps the body stand down.',
    phases: [
      { label: 'Breathe in', seconds: 4, scale: 1, cue: 'in' },
      { label: 'Hold', seconds: 7, scale: 1, cue: 'hold' },
      { label: 'Breathe out', seconds: 8, scale: 0.7, cue: 'out' },
    ],
  },
  {
    id: 'sigh',
    title: 'Physiological sigh',
    summary: 'Two inhales through the nose, then a long exhale. A quick reset.',
    phases: [
      { label: 'Inhale', seconds: 2, scale: 0.88, cue: 'in' },
      { label: 'Top-up inhale', seconds: 1, scale: 1, cue: 'in' },
      { label: 'Long exhale', seconds: 6, scale: 0.68, cue: 'out' },
    ],
  },
];

export const URGE_SURF_STEPS: { title: string; body: string }[] = [
  {
    title: 'Notice the wave',
    body: 'An urge is a sensation with a story attached. Where is it in your body — chest, jaw, hands, stomach? You do not have to like it to look at it.',
  },
  {
    title: 'Name it',
    body: 'Say, quietly, what it is: craving, restlessness, loneliness, habit. Naming it puts a little space between you and the next drink.',
  },
  {
    title: 'Stay with one breath pattern',
    body: 'Use the physiological sigh for a minute. Two inhales, one long exhale. You are letting the wave move, not wrestling it.',
  },
  {
    title: 'Ask the honest question',
    body: 'If you drink, what actually happens in twenty minutes, and tomorrow morning? Is that trade worth it, knowing what you know?',
  },
  {
    title: 'Choose one small action',
    body: 'Water, a walk, a message to someone safe, or staying on this screen until the ten minutes are up. You only need the next right thing.',
  },
];
