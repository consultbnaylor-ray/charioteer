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
      const pin = (behavior: ScrollBehavior = 'smooth') => {
        if (cancelled) return;
        if (Platform.OS === 'web') {
          if (typeof document === 'undefined') return;
          // A Stats link can open this screen while an earlier copy is still mounted.
          const markers = [...document.querySelectorAll(`[id="section-${id}"]`)];
          let visible = markers[markers.length - 1];
          for (let index = markers.length - 1; index >= 0; index -= 1) {
            const rect = markers[index].getBoundingClientRect();
            if (rect.height > 1 && rect.width > 1) {
              visible = markers[index];
              break;
            }
          }
          visible?.scrollIntoView({ block: 'start', behavior });
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
        requestAnimationFrame(() => pin());
      });
      // A long screen, such as Health Stats, may not have laid the target out at 120ms.
      const later = [
        setTimeout(() => pin('auto'), 120),
        setTimeout(() => pin('auto'), 500),
        setTimeout(() => pin('auto'), 1200),
      ];
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
        later.forEach((timer) => clearTimeout(timer));
      };
    }, [wanted, id, handle]),
  );

  return (
    <View ref={marker as RefObject<View>} nativeID={`section-${id}`} collapsable={false}>
      {children}
    </View>
  );
}
