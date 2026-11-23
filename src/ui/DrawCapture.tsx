import { useRef } from 'react';
import { View } from 'react-native';

import { appendSketchPoint, viewToPoint, type OutdoorPoint } from '@/domain/outdoorRoute';

type ViewFrame = {
  centre: OutdoorPoint;
  zoom: number;
  width: number;
  height: number;
};

/**
 * A finger drawing on top of the map. The map underneath does not receive the drag.
 */
export function DrawCapture({
  readView,
  onChange,
  onEnd,
  onFinger,
}: {
  readView: () => ViewFrame;
  onChange: (points: OutdoorPoint[]) => void;
  onEnd: (points: OutdoorPoint[]) => void;
  onFinger?: (down: boolean) => void;
}) {
  const points = useRef<OutdoorPoint[]>([]);

  function add(x: number, y: number) {
    const frame = readView();
    const point = viewToPoint({ ...frame, x, y });
    if (!point) return;
    const next = appendSketchPoint(points.current, point);
    if (next.length === points.current.length) return;
    points.current = next;
    onChange(next);
  }

  function finish() {
    onFinger?.(false);
    const finished = points.current.map((point) => ({ ...point }));
    points.current = [];
    onEnd(finished);
  }

  return (
    <View
      accessibilityLabel="Drawing a route"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2 }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        points.current = [];
        onFinger?.(true);
        add(event.nativeEvent.locationX, event.nativeEvent.locationY);
      }}
      onResponderMove={(event) => {
        add(event.nativeEvent.locationX, event.nativeEvent.locationY);
      }}
      onResponderRelease={finish}
      onResponderTerminate={finish}
    />
  );
}
