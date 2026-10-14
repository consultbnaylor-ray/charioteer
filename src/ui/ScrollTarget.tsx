import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, type ReactNode, type RefObject } from 'react';
import { Platform, View } from 'react-native';

import { useScreenScroller } from '@/ui/ui';

/** Scrolls this block into view when the route has `?section=` matching `id`. */
export function ScrollTarget({ id, children }: { id: string; children: ReactNode }) {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const wanted = Array.isArray(params.section) ? params.section[0] : params.section;
  const handle = useScreenScroller();
  const marker = useRef<View>(null);

  useFocusEffect(
    useCallback(() => {
      if (wanted !== id) return undefined;
      let cancelled = false;
      const pin = () => {
        if (cancelled) return;
        if (Platform.OS === 'web') {
          if (typeof document === 'undefined') return;
          document.getElementById(`section-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          return;
        }
        const markerView = marker.current;
        const inner = handle?.current.innerRef.current;
        const scroller = handle?.current.scrollRef.current;
        if (!markerView || !inner || !scroller) return;
        markerView.measureLayout(
          inner as never,
          (_x, y) => {
            scroller.scrollTo({ y: Math.max(0, y - 8), animated: true });
          },
          () => {},
        );
      };
      const frame = requestAnimationFrame(() => {
        pin();
        requestAnimationFrame(pin);
      });
      const later = setTimeout(pin, 120);
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
        clearTimeout(later);
      };
    }, [wanted, id, handle]),
  );

  return (
    <View ref={marker as RefObject<View>} nativeID={`section-${id}`} collapsable={false}>
      {children}
    </View>
  );
}
