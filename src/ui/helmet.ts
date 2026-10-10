/** Canonical paths for assets/brand/helmet.svg and helmet-icon.svg. Keep them in step. */

export const HELMET_VIEWBOX = '0 0 80 80';

type HelmetPath = { d: string; evenodd?: boolean };

/** Full mark: side-profile Corinthian helmet, crest, and four swept feathers. */
export const HELMET_PATHS: readonly HelmetPath[] = [
  { d: 'M28 12L8 2L14 2L30 14Z' },
  { d: 'M34 20L6 8L12 12L36 24Z' },
  { d: 'M32 28L4 22L6 30L34 34Z' },
  { d: 'M30 38L8 38L10 46L32 44Z' },
  {
    d: 'M72 34L62 26L54 18L42 14L36 6L20 6L26 16L18 22L16 36L6 44L10 56L24 48L32 58L64 66L70 54L58 48L50 42L56 34L66 36ZM42 22H56V28H52V36H46V28H42Z',
    evenodd: true,
  },
];

/** Fewer, thicker feathers and a single eye slot, for 32px and below. */
export const HELMET_ICON_PATHS: readonly HelmetPath[] = [
  { d: 'M36 16L6 2L14 8L38 22Z' },
  { d: 'M32 30L4 28L8 42L34 40Z' },
  {
    d: 'M72 34L62 26L54 18L42 14L36 6L20 6L26 16L18 22L16 36L6 44L10 56L24 48L32 58L64 66L70 54L58 48L50 42L56 34L66 36ZM44 22H58V32H44Z',
    evenodd: true,
  },
];
