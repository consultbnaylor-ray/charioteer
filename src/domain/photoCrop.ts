/** A crop window in source pixels, ready for the image encoder. */
export type CropRect = { originX: number; originY: number; width: number; height: number };

/** The visible crop window, in stage pixels. */
export type CropFrame = { x: number; y: number; width: number; height: number };

/** Source image drawn into the stage. Scale is screen pixels per source pixel. */
export type ImagePlacement = { scale: number; x: number; y: number };

export type CropShape = 'square' | '4:3' | 'free';
export type CropEdge = 'left' | 'right' | 'top' | 'bottom';

/** How far a pinch can zoom past the cover fit. */
export const CROP_MAX_ZOOM = 6;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/** Largest frame of the requested shape that fits in the stage. Free uses the photo's own ratio. */
export function fittedFrame(
  stageWidth: number,
  stageHeight: number,
  shape: CropShape,
  imageWidth: number,
  imageHeight: number,
): CropFrame {
  const ratio = shape === 'square' ? 1 : shape === '4:3' ? 4 / 3 : imageWidth / Math.max(imageHeight, 1);
  let width = Math.max(stageWidth, 1);
  let height = width / ratio;
  if (height > stageHeight) {
    height = Math.max(stageHeight, 1);
    width = height * ratio;
  }
  return {
    x: (stageWidth - width) / 2,
    y: (stageHeight - height) / 2,
    width,
    height,
  };
}

/** Smallest scale at which the image still covers the frame. */
export function coverScale(imageWidth: number, imageHeight: number, frame: CropFrame): number {
  return Math.max(frame.width / imageWidth, frame.height / imageHeight);
}

/** Centre the image so it covers the frame. */
export function coverPlacement(imageWidth: number, imageHeight: number, frame: CropFrame): ImagePlacement {
  const scale = coverScale(imageWidth, imageHeight, frame);
  return {
    scale,
    x: frame.x + (frame.width - imageWidth * scale) / 2,
    y: frame.y + (frame.height - imageHeight * scale) / 2,
  };
}

/** Keep the image covering the frame, and the zoom inside the pinch range. */
export function clampPlacement(
  placement: ImagePlacement,
  imageWidth: number,
  imageHeight: number,
  frame: CropFrame,
): ImagePlacement {
  const minScale = coverScale(imageWidth, imageHeight, frame);
  const scale = clamp(placement.scale, minScale, minScale * CROP_MAX_ZOOM);
  const displayW = imageWidth * scale;
  const displayH = imageHeight * scale;
  return {
    scale,
    x: clamp(placement.x, frame.x + frame.width - displayW, frame.x),
    y: clamp(placement.y, frame.y + frame.height - displayH, frame.y),
  };
}

/** Place the image so the given source rectangle fills the frame. */
export function placementForCrop(
  imageWidth: number,
  imageHeight: number,
  frame: CropFrame,
  crop: CropRect,
): ImagePlacement {
  const scale = Math.max(frame.width / crop.width, frame.height / crop.height);
  return clampPlacement(
    {
      scale,
      x: frame.x - crop.originX * scale,
      y: frame.y - crop.originY * scale,
    },
    imageWidth,
    imageHeight,
    frame,
  );
}

/** Zoom about the centre of the frame, then clamp. */
export function zoomPlacement(
  placement: ImagePlacement,
  nextScale: number,
  frame: CropFrame,
  imageWidth: number,
  imageHeight: number,
): ImagePlacement {
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  const imageX = (cx - placement.x) / placement.scale;
  const imageY = (cy - placement.y) / placement.scale;
  return clampPlacement(
    {
      scale: nextScale,
      x: cx - imageX * nextScale,
      y: cy - imageY * nextScale,
    },
    imageWidth,
    imageHeight,
    frame,
  );
}

/** Move one edge of a free crop. The frame stays inside the stage. */
export function resizeFrame(
  frame: CropFrame,
  edge: CropEdge,
  delta: number,
  stageWidth: number,
  stageHeight: number,
  min = 88,
): CropFrame {
  const minSide = Math.min(min, stageWidth, stageHeight);
  let { x, y, width, height } = frame;
  if (edge === 'left') {
    const nextX = clamp(x + delta, 0, x + width - minSide);
    width += x - nextX;
    x = nextX;
  } else if (edge === 'right') {
    width = clamp(width + delta, minSide, stageWidth - x);
  } else if (edge === 'top') {
    const nextY = clamp(y + delta, 0, y + height - minSide);
    height += y - nextY;
    y = nextY;
  } else {
    height = clamp(height + delta, minSide, stageHeight - y);
  }
  return { x, y, width, height };
}

/** Integer crop inside the source image. */
export function settleCropRect(
  imageWidth: number,
  imageHeight: number,
  originX: number,
  originY: number,
  width: number,
  height: number,
): CropRect {
  const maxW = Math.max(1, Math.floor(imageWidth));
  const maxH = Math.max(1, Math.floor(imageHeight));
  const cropW = Math.min(maxW, Math.max(1, Math.round(width)));
  const cropH = Math.min(maxH, Math.max(1, Math.round(height)));
  const x = clamp(Math.round(originX), 0, maxW - cropW);
  const y = clamp(Math.round(originY), 0, maxH - cropH);
  return { originX: x, originY: y, width: cropW, height: cropH };
}

/** Source pixels currently inside the frame. */
export function cropRectFromPlacement(
  imageWidth: number,
  imageHeight: number,
  frame: CropFrame,
  placement: ImagePlacement,
): CropRect {
  const placed = clampPlacement(placement, imageWidth, imageHeight, frame);
  return settleCropRect(
    imageWidth,
    imageHeight,
    (frame.x - placed.x) / placed.scale,
    (frame.y - placed.y) / placed.scale,
    frame.width / placed.scale,
    frame.height / placed.scale,
  );
}

/** A profile picture is stored as a square, even though the mask is a circle. */
export function squareCropRect(rect: CropRect, imageWidth: number, imageHeight: number): CropRect {
  const maxW = Math.max(1, Math.floor(imageWidth));
  const maxH = Math.max(1, Math.floor(imageHeight));
  const side = Math.max(1, Math.min(rect.width, rect.height, maxW, maxH));
  const originX = clamp(rect.originX + Math.floor((rect.width - side) / 2), 0, maxW - side);
  const originY = clamp(rect.originY + Math.floor((rect.height - side) / 2), 0, maxH - side);
  return { originX, originY, width: side, height: side };
}
