/**
 * Every name `projectPublicProfile` can put on the Hidden line, and the
 * What I share block that opens it. Ids stay free of hyphens so the People
 * card can link without naming photo tables.
 */
export const HIDDEN_SHARE_SECTIONS = {
  Bio: 'bio',
  Town: 'town',
  Stage: 'stage',
  'Days sober': 'daysSober',
  Milestones: 'milestones',
  Reasons: 'reasons',
  'Money saved': 'moneySaved',
  'Units avoided': 'unitsAvoided',
  'Mood streak': 'moodStreak',
  'Health headlines': 'health',
  'Progress photos': 'progressPhotos',
  'Profile photos': 'profilePhotos',
  'Gratitude lines': 'gratitudeLines',
  'Gratitude photos': 'gratitudePhotos',
  'Vision items': 'visionItems',
  'Pinned quote': 'pinnedQuote',
  "Today's meals": 'meals',
  'Calories and macros': 'calories',
  'Food quality': 'foodQuality',
  'Progress and streaks': 'nutritionProgress',
  'A hard moment': 'hardMoment',
  'Nutrition goal': 'nutritionGoal',
} as const;

export type HiddenShareLabel = keyof typeof HIDDEN_SHARE_SECTIONS;

export function hiddenShareSection(label: string): string | null {
  if (Object.prototype.hasOwnProperty.call(HIDDEN_SHARE_SECTIONS, label)) {
    return HIDDEN_SHARE_SECTIONS[label as HiddenShareLabel];
  }
  return null;
}

/** What I share, scrolled to one Hidden name. No name opens the top of the screen. */
export function hiddenShareHref(label?: string): string {
  const section = label ? hiddenShareSection(label) : null;
  return section ? `/sharing?section=${section}` : '/sharing';
}
