import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  applyDrawPointers,
  finishDrawSession,
  startDrawSession,
  twoFingerView,
  type DrawSession,
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
