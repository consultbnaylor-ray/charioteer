import { TAB_SECTIONS } from '../domain/sections';

/** Extra inset inside the safe area so the first and last labels are not flush with the glass. */
const TAB_GUTTER = 8;
/** Barlow SemiBold advance of "Gratitude" (the widest tab) divided by font size. */
const WIDEST_TAB_EM = 4.2;

/** Same padding on both sides, large enough for whichever horizontal safe-area inset is bigger. */
export function tabSideInset(left: number, right: number) {
  return Math.max(left, right) + TAB_GUTTER;
}

/** Slightly under the old 12px label, and smaller still when a narrow phone cannot fit "Gratitude". */
export function tabLabelFontSize(screenWidth: number, side: number, scale: number) {
  const slot = (screenWidth - side * 2) / TAB_SECTIONS.length;
  if (!Number.isFinite(slot) || slot <= 0) return 11 * scale;
  const fitted = Math.max(0, slot - 4) / WIDEST_TAB_EM;
  return Math.min(11 * scale, fitted);
}
