/**
 * Copy inside the sober ring on Today.
 * The day count sits above "Days sober". The label is below the centre, where
 * the circle is narrower than its inner diameter, so a full-diameter line
 * crosses the stroke. The width used here is the chord at the bottom of that
 * stack, minus padding. Large type grows until the stack would leave that
 * padded interior, then the line fits the chord.
 */

export const SOBER_RING_SIZE = 132;
export const SOBER_RING_STROKE = 10;
/** Clear points between the copy and the inner edge of the stroke. */
export const SOBER_RING_PAD = 8;

const COUNT_FONT = 40;
/**
 * The count's style line is 44. Oswald's own em box is about 1.5em, and a
 * line height shorter than the font can still lay out at the font's height.
 * The taller box is the one that pushes the label into the stroke.
 */
const COUNT_LINE_AT_1 = Math.max(44, COUNT_FONT * 1.5);
const LABEL_LINE_AT_1 = 16;
/** Pulls the label up into the wider part of the ring, without climbing into the digits. */
const LABEL_LIFT_AT_1 = 4;

export function ringInnerRadius(size: number, strokeWidth: number): number {
  return Math.max(0, (size - strokeWidth * 2) / 2);
}

/** Full width of the clear interior at `offset` points from the centre. */
export function ringChordWidth(size: number, strokeWidth: number, offsetFromCentre: number): number {
  const radius = ringInnerRadius(size, strokeWidth);
  const distance = Math.min(Math.abs(offsetFromCentre), radius);
  return 2 * Math.sqrt(Math.max(0, radius * radius - distance * distance));
}

/** Distance from the ring centre to the far edge of the centred count and label. */
export function soberRingEdgeOffset(scale: number): number {
  return ((COUNT_LINE_AT_1 + LABEL_LINE_AT_1 - LABEL_LIFT_AT_1) * scale) / 2;
}

/** Largest type scale whose stack still sits `pad` inside the inner radius. */
export function soberRingScaleCap(size = SOBER_RING_SIZE, strokeWidth = SOBER_RING_STROKE, pad = SOBER_RING_PAD): number {
  const room = ringInnerRadius(size, strokeWidth) - pad;
  const perScale = soberRingEdgeOffset(1);
  if (room <= 0 || perScale <= 0) return 1;
  return room / perScale;
}

export type SoberRingFit = {
  /** App text scale times Dynamic Type, capped so the lines stay inside the ring. */
  scale: number;
  /** Width both lines stay within. Clear of the stroke by the padding on each side. */
  width: number;
  /** Negative margin. Pulls the label up into the wider part of the ring. */
  labelLift: number;
  /** Tighter than the usual label tracking, so the words keep their size inside the chord. */
  letterSpacing: number;
};

export function soberRingFit(
  themeScale: number,
  systemFontScale: number,
  size = SOBER_RING_SIZE,
  strokeWidth = SOBER_RING_STROKE,
  pad = SOBER_RING_PAD,
): SoberRingFit {
  const theme = Number.isFinite(themeScale) && themeScale > 0 ? themeScale : 1;
  const system = Number.isFinite(systemFontScale) && systemFontScale > 0 ? systemFontScale : 1;
  const requested = theme * Math.min(system, 2);
  const scale = Math.min(requested, soberRingScaleCap(size, strokeWidth, pad));
  const edge = soberRingEdgeOffset(scale);
  const width = Math.max(0, ringChordWidth(size, strokeWidth, edge) - pad * 2);
  return {
    scale,
    width,
    labelLift: -LABEL_LIFT_AT_1 * scale,
    letterSpacing: 0.4,
  };
}
