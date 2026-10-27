/** Stroke width used by the progress ring at this diameter. */
export function ringStroke(ring: number): number {
  return ring < 72 ? 7 : ring < 100 ? 9 : 12;
}

/**
 * A dashed arc leaves a gap at the top. Round caps cover a gap no longer than
 * the stroke on the web, and the dashed stroke on iPhone still draws the notch.
 * 192 g of a 194 g target is 0.9896907216494846. On the 108 pt nutrition ring
 * that gap is about 3 pt, shorter than the 12 pt stroke, so the ring is closed.
 * A real shortfall, such as 10% or the energy ring at 1,886 of 2,144, stays open.
 */
export function ringDrawsClosed(fill: number, ring: number): boolean {
  const shown = Math.max(0, Math.min(1, Number.isFinite(fill) ? fill : 0));
  if (shown <= 0) return false;
  if (shown >= 0.999) return true;
  const stroke = ringStroke(ring);
  const radius = (ring - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (1 - shown) * circumference <= stroke;
}
