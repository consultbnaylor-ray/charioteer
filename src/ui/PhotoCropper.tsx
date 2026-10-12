import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, StyleSheet, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';

import {
  clampPlacement,
  coverPlacement,
  cropRectFromPlacement,
  fittedFrame,
  placementForCrop,
  resizeFrame,
  squareCropRect,
  zoomPlacement,
  type CropEdge,
  type CropFrame,
  type CropRect,
  type CropShape,
  type ImagePlacement,
} from '@/domain/photoCrop';
import type { ProfilePhotoRole } from '@/data/types';
import { profilePictureSeed } from '@/ui/prepareProgressPhoto';
import { useAppTheme } from '@/ui/theme';
import { Button, ErrorNote, T } from '@/ui/ui';

type PickedImage = { uri: string; width: number; height: number };

const EMPTY_FRAME: CropFrame = { x: 0, y: 0, width: 0, height: 0 };
const EMPTY_PLACEMENT: ImagePlacement = { scale: 1, x: 0, y: 0 };

export function PhotoCropper({
  image,
  role,
  pending,
  error,
  onCancel,
  onUse,
}: {
  image: PickedImage;
  role: ProfilePhotoRole;
  pending?: boolean;
  error: string | null;
  onCancel: () => void;
  onUse: (crop: CropRect) => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const stageWidth = Math.max(200, windowWidth - 32);
  const stageHeight = Math.max(200, windowHeight - (role === 'gallery' ? 372 : 292) - insets.top - insets.bottom);
  const stage = { width: stageWidth, height: stageHeight };
  const [shape, setShape] = useState<CropShape>(role === 'avatar' ? 'square' : 'free');
  const [frame, setFrame] = useState<CropFrame>(EMPTY_FRAME);
  const [placement, setPlacement] = useState<ImagePlacement>(EMPTY_PLACEMENT);
  const [appliedKey, setAppliedKey] = useState('');
  const frameRef = useRef(frame);
  const placementRef = useRef(placement);
  const stageRef = useRef(stage);
  const imageRef = useRef(image);
  const stageNode = useRef<View>(null);
  const fitKey = `${image.uri}:${role}:${shape}:${Math.round(stageWidth)}:${Math.round(stageHeight)}`;
  if (appliedKey !== fitKey) {
    const nextFrame = fittedFrame(stageWidth, stageHeight, shape, image.width, image.height);
    const seed = role === 'avatar' ? profilePictureSeed(image.width, image.height) : null;
    const nextPlacement = seed
      ? placementForCrop(image.width, image.height, nextFrame, seed)
      : coverPlacement(image.width, image.height, nextFrame);
    frameRef.current = nextFrame;
    placementRef.current = nextPlacement;
    setAppliedKey(fitKey);
    setFrame(nextFrame);
    setPlacement(nextPlacement);
  }
  frameRef.current = frame.width > 2 ? frame : frameRef.current;
  placementRef.current = frame.width > 2 ? placement : placementRef.current;
  stageRef.current = stage;
  imageRef.current = image;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const fromRef = stageNode.current as unknown as WheelNode | null;
    const node = (fromRef && typeof fromRef.addEventListener === 'function'
      ? fromRef
      : document.getElementById('profile-crop-stage')) as WheelNode | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const onWheel = (event: { deltaY: number; preventDefault: () => void }) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      const current = placementRef.current;
      const next = zoomPlacement(
        current,
        current.scale * factor,
        frameRef.current,
        imageRef.current.width,
        imageRef.current.height,
      );
      placementRef.current = next;
      setPlacement(next);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [image.uri, fitKey]);

  const gesture = useRef({ placement: EMPTY_PLACEMENT, distance: 0 });
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => {
      const touches = readTouches(event);
      gesture.current = {
        placement: placementRef.current,
        distance: touches.length >= 2 ? touchSpan(touches) : 0,
      };
    },
    onPanResponderMove: (event, state) => {
      const touches = readTouches(event);
      const photo = imageRef.current;
      const cropFrame = frameRef.current;
      if (touches.length >= 2) {
        const span = touchSpan(touches);
        if (gesture.current.distance < 8) {
          gesture.current = { placement: placementRef.current, distance: span };
          return;
        }
        const next = zoomPlacement(
          gesture.current.placement,
          gesture.current.placement.scale * (span / gesture.current.distance),
          cropFrame,
          photo.width,
          photo.height,
        );
        placementRef.current = next;
        setPlacement(next);
        return;
      }
      if (gesture.current.distance > 0) {
        gesture.current = { placement: placementRef.current, distance: 0 };
        return;
      }
      const clamped = clampPlacement(
        {
          ...gesture.current.placement,
          x: gesture.current.placement.x + state.dx,
          y: gesture.current.placement.y + state.dy,
        },
        photo.width,
        photo.height,
        cropFrame,
      );
      placementRef.current = clamped;
      setPlacement(clamped);
    },
  })).current;

  function moveEdge(edge: CropEdge, delta: number) {
    const nextFrame = resizeFrame(frameRef.current, edge, delta, stageRef.current.width, stageRef.current.height);
    const nextPlacement = clampPlacement(placementRef.current, image.width, image.height, nextFrame);
    frameRef.current = nextFrame;
    placementRef.current = nextPlacement;
    setFrame(nextFrame);
    setPlacement(nextPlacement);
  }

  function usePhoto() {
    const raw = cropRectFromPlacement(image.width, image.height, frameRef.current, placementRef.current);
    onUse(role === 'avatar' ? squareCropRect(raw, image.width, image.height) : raw);
  }

  const ready = frame.width > 2 && placement.scale > 0;
  const displayW = image.width * placement.scale;
  const displayH = image.height * placement.scale;

  return (
    <Modal visible animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          width: windowWidth,
          height: windowHeight,
          backgroundColor: theme.colors.bg,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: 16,
          gap: 12,
        }}
      >
        <T variant="title">{role === 'avatar' ? 'Crop profile picture' : 'Crop gallery photo'}</T>
        <T variant="muted">Drag to position. Pinch to zoom.</T>
        {role === 'gallery' ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label="Free" tone={shape === 'free' ? 'primary' : 'quiet'} disabled={pending} onPress={() => setShape('free')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="4:3" tone={shape === '4:3' ? 'primary' : 'quiet'} disabled={pending} onPress={() => setShape('4:3')} />
              </View>
            </View>
            {shape === 'free' ? <T variant="muted">Drag an edge to change the frame.</T> : null}
          </View>
        ) : null}
        <View
          ref={stageNode}
          nativeID="profile-crop-stage"
          accessibilityLabel="Crop photo"
          style={{ width: stageWidth, height: stageHeight, borderRadius: 8, overflow: 'hidden', backgroundColor: '#111111' }}
        >
          {ready ? (
            <Image
              source={{ uri: image.uri }}
              contentFit="fill"
              style={{ position: 'absolute', left: placement.x, top: placement.y, width: displayW, height: displayH }}
              accessibilityLabel="Photo to crop"
            />
          ) : null}
          {ready ? <Shade frame={frame} /> : null}
          {ready && role === 'avatar' ? <CircleMask frame={frame} /> : null}
          {ready && role === 'gallery' ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
                borderWidth: 2,
                borderColor: '#ffffff',
              }}
            />
          ) : null}
          <View style={StyleSheet.absoluteFill} {...pan.panHandlers} accessibilityLabel="Drag to position" />
          {ready && shape === 'free' ? (
            <>
              <EdgeHandle edge="left" frame={frame} onResize={moveEdge} />
              <EdgeHandle edge="right" frame={frame} onResize={moveEdge} />
              <EdgeHandle edge="top" frame={frame} onResize={moveEdge} />
              <EdgeHandle edge="bottom" frame={frame} onResize={moveEdge} />
            </>
          ) : null}
        </View>
        <ErrorNote>{error}</ErrorNote>
        <Button label="Use photo" pending={pending} disabled={!ready} onPress={usePhoto} />
        <Button label="Cancel" tone="quiet" disabled={pending} onPress={onCancel} />
      </View>
    </Modal>
  );
}

function Shade({ frame }: { frame: CropFrame }) {
  const color = 'rgba(0,0,0,0.62)';
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', left: 0, top: 0, right: 0, height: Math.max(frame.y, 0), backgroundColor: color }} />
      <View style={{ position: 'absolute', left: 0, top: bottom, right: 0, bottom: 0, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: 0, top: frame.y, width: Math.max(frame.x, 0), height: frame.height, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: right, top: frame.y, right: 0, height: frame.height, backgroundColor: color }} />
    </View>
  );
}

/** Dims everything outside the circle. The saved file is the square around that circle. */
function CircleMask({ frame }: { frame: CropFrame }) {
  const size = Math.min(frame.width, frame.height);
  const left = frame.x + (frame.width - size) / 2;
  const top = frame.y + (frame.height - size) / 2;
  return (
    <View accessibilityLabel="Circular crop" pointerEvents="none" style={{ position: 'absolute', left, top, width: size, height: size }}>
      <Svg width={size} height={size} accessibilityLabel="Circular crop">
        <Defs>
          <Mask id="profile-crop-circle">
            <Rect x={0} y={0} width={size} height={size} fill="#ffffff" />
            <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="#000000" />
          </Mask>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill="rgba(0,0,0,0.55)" mask="url(#profile-crop-circle)" />
        <Circle cx={size / 2} cy={size / 2} r={Math.max(size / 2 - 1.5, 1)} stroke="#ffffff" strokeWidth={2} fill="none" />
      </Svg>
    </View>
  );
}

function EdgeHandle({
  edge,
  frame,
  onResize,
}: {
  edge: CropEdge;
  frame: CropFrame;
  onResize: (edge: CropEdge, delta: number) => void;
}) {
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const last = useRef(0);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      last.current = 0;
    },
    onPanResponderMove: (_event, state) => {
      const along = edge === 'left' || edge === 'right' ? state.dx : state.dy;
      const delta = along - last.current;
      last.current = along;
      if (delta !== 0) onResizeRef.current(edge, delta);
    },
  })).current;
  const horizontal = edge === 'left' || edge === 'right';
  const position = edge === 'left'
    ? { left: frame.x - 18, top: frame.y + frame.height / 2 - 22 }
    : edge === 'right'
      ? { left: frame.x + frame.width - 18, top: frame.y + frame.height / 2 - 22 }
      : edge === 'top'
        ? { left: frame.x + frame.width / 2 - 22, top: frame.y - 18 }
        : { left: frame.x + frame.width / 2 - 22, top: frame.y + frame.height - 18 };
  return (
    <View
      accessibilityLabel={`Crop edge ${edge}`}
      {...pan.panHandlers}
      style={{
        position: 'absolute',
        width: horizontal ? 36 : 44,
        height: horizontal ? 44 : 36,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3,
        ...position,
      }}
    >
      <View
        style={{
          width: horizontal ? 4 : 28,
          height: horizontal ? 28 : 4,
          borderRadius: 2,
          backgroundColor: '#ffffff',
        }}
      />
    </View>
  );
}

type WheelNode = {
  addEventListener: (
    type: 'wheel',
    listener: (event: { deltaY: number; preventDefault: () => void }) => void,
    options: { passive: boolean },
  ) => void;
  removeEventListener: (
    type: 'wheel',
    listener: (event: { deltaY: number; preventDefault: () => void }) => void,
  ) => void;
};

function readTouches(event: GestureResponderEvent): { pageX: number; pageY: number }[] {
  const touches = (event.nativeEvent as { touches?: ArrayLike<{ pageX: number; pageY: number }> }).touches;
  if (!touches || touches.length < 1) return [];
  const points: { pageX: number; pageY: number }[] = [];
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches[index];
    if (touch) points.push(touch);
  }
  return points;
}

function touchSpan(touches: { pageX: number; pageY: number }[]): number {
  const a = touches[0];
  const b = touches[1];
  if (!a || !b) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}
