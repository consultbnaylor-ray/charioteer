/**
 * Ink box of the camera drawing. The viewBox is this box, so the SVG height is the glyph.
 * Header wordmark is Oswald at 18pt. Its caps are about 22pt tall on screen.
 */
export const CAMERA_INK = { x: 3.2, y: 5.4, width: 17.6, height: 13.8 };

/** Visible camera height, matched to the header wordmark cap height. */
export const HEADER_CAMERA_GLYPH = 22;

/** Tap size for the header camera. Grows with the text scale once the glyph exceeds 44pt. */
export function headerCameraTap(scale = 1): number {
  const glyph = HEADER_CAMERA_GLYPH * scale;
  const markWidth = glyph * (CAMERA_INK.width / CAMERA_INK.height);
  return Math.max(44, Math.ceil(markWidth), Math.ceil(glyph));
}
