/** Stroke width used by the progress ring at this diameter. */
export function ringStroke(ring: number): number {
  return ring < 72 ? 7 : ring < 100 ? 9 : 12;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * A dashed arc leaves a gap at the top. Round caps cover a gap no longer than
 * the stroke on the web, and the dashed stroke on iPhone still draws the notch.
 * 192 g of a 194 g target is 0.9896907216494846. On the 108 pt nutrition ring
 * that gap is about 3 pt, shorter than the 12 pt stroke, so the ring is closed.
 * A real shortfall, such as 10% or the energy ring at 1,886 of 2,144, stays open.
 */
export function ringDrawsClosed(fill: number, ring: number): boolean {
  const shown = clamp01(fill);
  if (shown <= 0) return false;
  if (shown >= 0.999) return true;
  const stroke = ringStroke(ring);
  const radius = (ring - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (1 - shown) * circumference <= stroke;
}

/**
 * Dash length for the open part of a ring.
 * A lap that already meets the target stays at 1. The chart ease must not
 * leave that lap short, and round caps must not be asked to close it.
 */
export function ringShown(fill: number, motion: number, ring: number): number {
  const ratio = clamp01(fill);
  if (ringDrawsClosed(ratio, ring)) return 1;
  return ratio * clamp01(motion);
}

function ringPoint(cx: number, cy: number, r: number, turn: number): string {
  const angle = turn * 2 * Math.PI;
  return `${num(cx + r * Math.sin(angle))} ${num(cy - r * Math.cos(angle))}`;
}

/**
 * A closed ring as two arcs, each just past a semicircle.
 * One 360° arc starts and ends at the same point, so SVG drops it.
 * The iPhone circle is that same full turn and leaves a seam at the start.
 * The overlap is painted twice so a butt join cannot open a notch.
 * Round caps are not used. They leave a gap on the dashed stroke.
 */
export function closedRingPath(cx: number, cy: number, r: number): string {
  const radius = num(r);
  const arc = `A ${radius} ${radius} 0 1 1`;
  return `M ${ringPoint(cx, cy, r, 0)} ${arc} ${ringPoint(cx, cy, r, 0.52)} M ${ringPoint(cx, cy, r, 0.48)} ${arc} ${ringPoint(cx, cy, r, 0.04)}`;
}

/** Clockwise from 12 o'clock. A full turn uses the closed ring, not one 360° arc. */
export function ringArcPath(cx: number, cy: number, r: number, sweep: number): string | null {
  const turn = clamp01(sweep);
  if (turn <= 0) return null;
  if (turn >= 1) return closedRingPath(cx, cy, r);
  const angle = turn * 2 * Math.PI;
  const large = turn > 0.5 ? 1 : 0;
  return `M ${num(cx)} ${num(cy - r)} A ${num(r)} ${num(r)} 0 ${large} 1 ${num(cx + r * Math.sin(angle))} ${num(cy - r * Math.cos(angle))}`;
}

/** Thin radial mark at 12 o'clock, across the stroke, where the second lap starts. */
export function ringSeam(cx: number, cy: number, r: number, stroke: number): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: cx,
    y1: cy - r - stroke / 2,
    x2: cx,
    y2: cy - r + stroke / 2,
  };
}
