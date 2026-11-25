import { useEffect, useRef } from 'react';
import { Pressable, Text, View, type AccessibilityActionEvent, type GestureResponderEvent } from 'react-native';

import {
  DRAW_ZOOM_MAX,
  DRAW_ZOOM_MIN,
  PAN_HOLD_BEFORE_REPEAT_MS,
  PAN_HOLD_REPEAT_MS,
  applyDrawPointers,
  clampDrawZoom,
  finishDrawSession,
  sliderFraction,
  startDrawSession,
  twoFingerView,
  zoomFromSlider,
  type DrawSession,
  type PanDirection,
} from '@/domain/drawStroke';
import { viewToPoint, type OutdoorPoint } from '@/domain/outdoorRoute';

type ViewFrame = {
  centre: OutdoorPoint;
  zoom: number;
  width: number;
  height: number;
};

type Finger = { x: number; y: number };

type PinchStart = {
  zoom: number;
  centre: OutdoorPoint;
  span: number;
  midX: number;
  midY: number;
};

type TouchEvent = {
  nativeEvent: {
    locationX: number;
    locationY: number;
    touches?: { locationX?: number; locationY?: number; pageX?: number; pageY?: number }[];
  };
};

/**
 * One finger draws. Two fingers pinch and pan, and never add a point.
 * A second finger cancels the stroke that was in progress.
 * The page underneath stays locked by the map while draw mode is on.
 */
export function DrawCapture({
  readView,
  onChange,
  onEnd,
  onView,
  onFinger,
}: {
  readView: () => ViewFrame;
  onChange: (points: OutdoorPoint[]) => void;
  onEnd: (points: OutdoorPoint[]) => void;
  onView?: (next: { centre: OutdoorPoint; zoom: number }) => void;
  onFinger?: (down: boolean) => void;
}) {
  const session = useRef<DrawSession>(startDrawSession());
  const pinch = useRef<PinchStart | null>(null);

  function fingersOf(event: TouchEvent): Finger[] {
    const native = event.nativeEvent;
    const touches = native.touches ?? [];
    const fingers = touches.flatMap((touch) => {
      const x = typeof touch.locationX === 'number' ? touch.locationX : touch.pageX;
      const y = typeof touch.locationY === 'number' ? touch.locationY : touch.pageY;
      if (typeof x !== 'number' || typeof y !== 'number') return [];
      return [{ x, y }];
    });
    if (fingers.length > 0) return fingers;
    return [{ x: native.locationX, y: native.locationY }];
  }

  function pointAt(finger: Finger): OutdoorPoint | null {
    const frame = readView();
    return viewToPoint({ ...frame, x: finger.x, y: finger.y });
  }

  function beginPinch(fingers: Finger[]) {
    const frame = readView();
    const first = fingers[0];
    const second = fingers[1] ?? first;
    if (!first || !second) return;
    pinch.current = {
      zoom: frame.zoom,
      centre: frame.centre,
      span: Math.hypot(first.x - second.x, first.y - second.y),
      midX: (first.x + second.x) / 2,
      midY: (first.y + second.y) / 2,
    };
  }

  function movePinch(fingers: Finger[]) {
    const start = pinch.current;
    const first = fingers[0];
    const second = fingers[1];
    if (!start || !first || !second || !(start.span > 0)) return;
    const frame = readView();
    const next = twoFingerView({
      startZoom: start.zoom,
      startCentre: start.centre,
      width: frame.width,
      height: frame.height,
      startSpan: start.span,
      span: Math.hypot(first.x - second.x, first.y - second.y),
      startMidX: start.midX,
      startMidY: start.midY,
      midX: (first.x + second.x) / 2,
      midY: (first.y + second.y) / 2,
    });
    if (next) onView?.(next);
  }

  function cancelStroke() {
    const hadPoints = session.current.points.length > 0;
    session.current = applyDrawPointers(session.current, 2, null);
    if (hadPoints) onChange([]);
  }

  function follow(event: TouchEvent) {
    const fingers = fingersOf(event);
    if (fingers.length >= 2) {
      cancelStroke();
      if (!pinch.current) beginPinch(fingers);
      else movePinch(fingers);
      return;
    }
    if (session.current.cancelled || pinch.current) {
      pinch.current = null;
      session.current = applyDrawPointers(session.current, 2, null);
      return;
    }
    const finger = fingers[0];
    const point = finger ? pointAt(finger) : null;
    const next = applyDrawPointers(session.current, 1, point);
    if (next.points.length === session.current.points.length) return;
    session.current = next;
    onChange(next.points);
  }

  function finish() {
    onFinger?.(false);
    const finished = finishDrawSession(session.current);
    session.current = startDrawSession();
    pinch.current = null;
    onEnd(finished);
  }

  return (
    <View
      accessibilityLabel="Drawing a route"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2 }}
      onStartShouldSetResponder={() => true}
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponder={() => true}
      onMoveShouldSetResponderCapture={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        session.current = startDrawSession();
        pinch.current = null;
        onFinger?.(true);
        follow(event);
      }}
      onResponderMove={(event) => {
        follow(event);
      }}
      onResponderRelease={finish}
      onResponderTerminate={finish}
    />
  );
}

const zoomButton = {
  width: 44,
  height: 44,
  borderRadius: 22,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#121212',
};

const SLIDER_TRACK = 148;
const CONTROL_TOP = 176;

const ARROW: Record<PanDirection, string> = {
  north: '↑',
  east: '→',
  south: '↓',
  west: '←',
};

/**
 * Full-screen draw controls. They sit above the drawing layer, so a drag here
 * moves the map and does not start a stroke.
 */
export function DrawViewControls({
  zoom,
  onZoom,
  onPan,
}: {
  zoom: number;
  onZoom: (zoom: number) => void;
  onPan: (direction: PanDirection) => void;
}) {
  return (
    <>
      <DrawZoomSlider zoom={zoom} onZoom={onZoom} />
      <DrawPanPad onPan={onPan} />
    </>
  );
}

function claimTouch(): boolean {
  return true;
}

function DrawZoomSlider({ zoom, onZoom }: { zoom: number; onZoom: (zoom: number) => void }) {
  const fraction = sliderFraction(zoom);
  function apply(locationY: number) {
    onZoom(zoomFromSlider(1 - locationY / SLIDER_TRACK));
  }
  function step(delta: number) {
    onZoom(clampDrawZoom(zoom + delta));
  }
  return (
    <View
      style={{ position: 'absolute', right: 8, top: CONTROL_TOP, zIndex: 6, alignItems: 'center', gap: 8 }}
      onStartShouldSetResponder={claimTouch}
      onMoveShouldSetResponder={claimTouch}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => step(1)} style={zoomButton} hitSlop={4}>
        <Text style={{ color: '#121212', fontSize: 22, lineHeight: 26 }}>+</Text>
      </Pressable>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Zoom level"
        accessibilityHint="Drag up to zoom in. Drag down to zoom out."
        accessibilityValue={{ min: DRAW_ZOOM_MIN, max: DRAW_ZOOM_MAX, now: Math.round(clampDrawZoom(zoom)) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event: AccessibilityActionEvent) => {
          if (event.nativeEvent.actionName === 'increment') step(1);
          if (event.nativeEvent.actionName === 'decrement') step(-1);
        }}
        onStartShouldSetResponder={claimTouch}
        onMoveShouldSetResponder={claimTouch}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event: GestureResponderEvent) => apply(event.nativeEvent.locationY)}
        onResponderMove={(event: GestureResponderEvent) => apply(event.nativeEvent.locationY)}
        style={{ width: 44, height: SLIDER_TRACK }}
      >
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 16, bottom: 16, left: 20, width: 4, borderRadius: 2, backgroundColor: '#121212' }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: (1 - fraction) * (SLIDER_TRACK - 44),
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#121212',
          }}
        />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => step(-1)} style={zoomButton} hitSlop={4}>
        <Text style={{ color: '#121212', fontSize: 22, lineHeight: 26 }}>−</Text>
      </Pressable>
    </View>
  );
}

function DrawPanPad({ onPan }: { onPan: (direction: PanDirection) => void }) {
  const pad = 44;
  return (
    <View
      accessibilityLabel="Pan the map"
      style={{ position: 'absolute', left: 8, top: CONTROL_TOP, width: pad * 3, height: pad * 3, zIndex: 6 }}
      onStartShouldSetResponder={claimTouch}
    >
      <PanButton direction="north" onPan={onPan} style={{ position: 'absolute', top: 0, left: pad }} />
      <PanButton direction="west" onPan={onPan} style={{ position: 'absolute', top: pad, left: 0 }} />
      <PanButton direction="east" onPan={onPan} style={{ position: 'absolute', top: pad, left: pad * 2 }} />
      <PanButton direction="south" onPan={onPan} style={{ position: 'absolute', top: pad * 2, left: pad }} />
    </View>
  );
}

function PanButton({
  direction,
  onPan,
  style,
}: {
  direction: PanDirection;
  onPan: (direction: PanDirection) => void;
  style: { position: 'absolute'; top: number; left: number };
}) {
  const action = useRef(onPan);
  action.current = onPan;
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  function stop() {
    if (delay.current) clearTimeout(delay.current);
    if (repeat.current) clearInterval(repeat.current);
    delay.current = null;
    repeat.current = null;
  }
  function start() {
    stop();
    action.current(direction);
    delay.current = setTimeout(() => {
      repeat.current = setInterval(() => action.current(direction), PAN_HOLD_REPEAT_MS);
    }, PAN_HOLD_BEFORE_REPEAT_MS);
  }
  useEffect(() => stop, []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Pan ${direction}`}
      accessibilityHint="Moves the map. Hold to keep moving."
      onPressIn={start}
      onPressOut={stop}
      style={[zoomButton, style]}
      hitSlop={4}
    >
      <Text style={{ color: '#121212', fontSize: 22, lineHeight: 26 }}>{ARROW[direction]}</Text>
    </Pressable>
  );
}

/** Plus and minus, for when a pinch is awkward. They sit above the drawing layer. */
export function DrawZoomButtons({ onZoom }: { onZoom: (delta: number) => void }) {
  return (
    <View style={{ position: 'absolute', right: 8, bottom: 44, zIndex: 6, gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => onZoom(1)} style={zoomButton}>
        <Text style={{ color: '#121212', fontSize: 22, lineHeight: 26 }}>+</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => onZoom(-1)} style={zoomButton}>
        <Text style={{ color: '#121212', fontSize: 22, lineHeight: 26 }}>−</Text>
      </Pressable>
    </View>
  );
}
