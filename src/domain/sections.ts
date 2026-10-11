/**
 * Every place in the app. The drawer renders this list.
 * Add a new section here when you add a screen. Do not leave it only in a tab.
 */
export type MenuIcon =
  | 'sun'
  | 'check'
  | 'breath'
  | 'chat'
  | 'people'
  | 'star'
  | 'pulse'
  | 'photo'
  | 'board'
  | 'glass'
  | 'book'
  | 'quote'
  | 'person'
  | 'lock'
  | 'help'
  | 'leave';

export type MenuGroup = 'main' | 'tools' | 'account';

export type AppSection = {
  id: string;
  label: string;
  href: string;
  /** Short name for the bottom tab bar. */
  tabLabel?: string;
  tab?: boolean;
  sos?: boolean;
  signOut?: boolean;
  /** Drawn beside the label in the menu. The row label is the accessible name. */
  icon: MenuIcon;
  /** Menu cluster. Help and Sign out sit after the named groups. */
  group?: MenuGroup;
};

export const MENU_GROUPS: readonly { id: MenuGroup; label: string }[] = [
  { id: 'main', label: 'Main' },
  { id: 'tools', label: 'Tools' },
  { id: 'account', label: 'Account' },
];

export const APP_SECTIONS: readonly AppSection[] = [
  { id: 'today', label: 'Today', href: '/home', tab: true, icon: 'sun', group: 'main' },
  { id: 'check-in', label: 'Check-in', href: '/check-in', tab: true, icon: 'check', group: 'main' },
  { id: 'breathe', label: 'Breathe', href: '/breathe', tab: true, icon: 'breath', group: 'main' },
  { id: 'thumos', label: 'Thumos', href: '/thumos', tab: true, icon: 'chat', group: 'main' },
  { id: 'people', label: 'People', href: '/people', tab: true, icon: 'people', group: 'main' },
  { id: 'gratitude', label: 'Gratitude Diary', href: '/gratitude', tab: true, tabLabel: 'Gratitude', icon: 'star', group: 'main' },
  { id: 'health', label: 'Health Stats', href: '/health', icon: 'pulse', group: 'tools' },
  { id: 'photos', label: 'Progress photos', href: '/photos', icon: 'photo', group: 'tools' },
  { id: 'vision', label: 'Vision Board', href: '/vision', icon: 'board', group: 'tools' },
  { id: 'units', label: 'Drinks & units calculator', href: '/units', icon: 'glass', group: 'tools' },
  { id: 'quotes', label: 'Stoic Quotes', href: '/quotes', icon: 'quote', group: 'tools' },
  { id: 'library', label: 'Library', href: '/library', icon: 'book', group: 'tools' },
  { id: 'you', label: 'You', href: '/profile', icon: 'person', group: 'account' },
  { id: 'privacy', label: 'Privacy & consent', href: '/privacy', icon: 'lock', group: 'account' },
  { id: 'help', label: 'Help & crisis lines', href: '/help', sos: true, icon: 'help' },
  { id: 'sign-out', label: 'Sign out', href: '', signOut: true, icon: 'leave' },
];

export const TAB_SECTIONS = APP_SECTIONS.filter((section) => section.tab);
