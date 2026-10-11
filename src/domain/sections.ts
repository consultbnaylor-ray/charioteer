/**
 * Every place in the app. The drawer renders this list.
 * Add a new section here when you add a screen. Do not leave it only in a tab.
 */
export type AppSection = {
  id: string;
  label: string;
  href: string;
  /** Short name for the bottom tab bar. */
  tabLabel?: string;
  tab?: boolean;
  sos?: boolean;
  signOut?: boolean;
  /** Drawn beside the label in the menu. */
  icon?: 'pulse';
};

export const APP_SECTIONS: readonly AppSection[] = [
  { id: 'today', label: 'Today', href: '/home', tab: true },
  { id: 'check-in', label: 'Check-in', href: '/check-in', tab: true },
  { id: 'breathe', label: 'Breathe', href: '/breathe', tab: true },
  { id: 'thumos', label: 'Thumos', href: '/thumos', tab: true },
  { id: 'people', label: 'People', href: '/people', tab: true },
  { id: 'gratitude', label: 'Gratitude Diary', href: '/gratitude', tab: true, tabLabel: 'Gratitude' },
  { id: 'health', label: 'Health Stats', href: '/health', icon: 'pulse' },
  { id: 'library', label: 'Library/Resources', href: '/library' },
  { id: 'photos', label: 'Progress photos', href: '/photos' },
  { id: 'units', label: 'Drinks & units calculator', href: '/units' },
  { id: 'you', label: 'You/profile', href: '/profile' },
  { id: 'privacy', label: 'Privacy & consent', href: '/privacy' },
  { id: 'help', label: 'Help & crisis lines', href: '/help', sos: true },
  { id: 'sign-out', label: 'Sign out', href: '', signOut: true },
];

export const TAB_SECTIONS = APP_SECTIONS.filter((section) => section.tab);
