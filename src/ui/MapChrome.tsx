import { useState, type ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { ORS_CREDIT, OSM_CONTRIBUTORS } from '@/domain/routeConsent';
import { MAP_CREDIT, type MapScheme } from '@/domain/outdoorRoute';
import { ShowMyLocationButton } from '@/ui/ShowMyLocation';
import { radius, useAppTheme } from '@/ui/theme';
import { T } from '@/ui/ui';

export const FULL_SCREEN_MAP = 'Full screen map';
export const CLOSE_FULL_SCREEN_MAP = 'Close full screen map';
export const MAP_STYLE_SWITCH = 'Map style: light or dark';
export const RECENTRE_MAP = 'Re-centre';

const INK = '#121212';
const FILL = '#FFFFFF';

function CornerButton({
  label,
  onPress,
  top,
  left,
  bottom,
  right,
  children,
}: {
  label: string;
  onPress: () => void;
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        position: 'absolute',
        top,
        left,
        bottom,
        right,
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: FILL,
        borderWidth: 1,
        borderColor: INK,
        zIndex: 3,
      }}
    >
      {children}
    </Pressable>
  );
}

function ExpandIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      <Path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CollapseIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      <Path d="M10 10H4V4M4 10l7-7M14 14h6v6M20 14l-7 7" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SunIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      <Circle cx={12} cy={12} r={3.2} stroke={INK} strokeWidth={1.8} />
      <Path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M6 6l1.7 1.7M16.3 16.3 18 18M18 6l-1.7 1.7M7.7 16.3 6 18" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function MoonIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      <Path d="M15.5 3.5a7.8 7.8 0 1 0 5 12.2A8.2 8.2 0 0 1 15.5 3.5Z" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}

function RecentreButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={RECENTRE_MAP}
      onPress={onPress}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        minWidth: 44,
        height: 44,
        paddingHorizontal: 12,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: FILL,
        borderWidth: 1,
        borderColor: INK,
        zIndex: 3,
      }}
    >
      <T style={{ color: INK, fontSize: 14, lineHeight: 18 }}>Re-centre</T>
    </Pressable>
  );
}

export function MapShell({
  here,
  height,
  expanded,
  scheme,
  locating,
  onShowMyLocation,
  onRecentre,
  onExpand,
  onCollapse,
  onToggleStyle,
  problem,
  children,
}: {
  here: boolean;
  height: number;
  expanded: boolean;
  scheme: MapScheme;
  locating: boolean;
  onShowMyLocation?: () => void;
  onRecentre?: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  onToggleStyle: () => void;
  problem?: string | null;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <View style={expanded ? { flex: 1, height } : { gap: 8 }}>
      <View
        accessibilityLabel={here ? 'Map with footpaths. You are here.' : 'Map with footpaths'}
        style={{
          height,
          width: '100%',
          borderRadius: expanded ? 0 : radius.md,
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: scheme === 'dark' ? '#141414' : theme.colors.sunken,
        }}
      >
        {children}
        {expanded ? (
          <CornerButton label={CLOSE_FULL_SCREEN_MAP} top={8} left={8} onPress={onCollapse}>
            <CollapseIcon />
          </CornerButton>
        ) : (
          <CornerButton label={FULL_SCREEN_MAP} top={8} left={8} onPress={onExpand}>
            <ExpandIcon />
          </CornerButton>
        )}
        <CornerButton label={MAP_STYLE_SWITCH} bottom={8} left={8} onPress={onToggleStyle}>
          {scheme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </CornerButton>
        {onRecentre ? <RecentreButton onPress={onRecentre} /> : null}
        {onRecentre || !onShowMyLocation ? null : <ShowMyLocationButton pending={locating} onPress={onShowMyLocation} />}
      </View>
      {problem ? <T variant="muted">{problem}</T> : null}
      {expanded ? null : (
        <>
          <T variant="muted">{MAP_CREDIT}</T>
          <T variant="muted">{ORS_CREDIT}</T>
          <T variant="muted">{OSM_CONTRIBUTORS}</T>
        </>
      )}
    </View>
  );
}

export function MapFrame({
  here,
  height = 280,
  scheme,
  locating,
  onShowMyLocation,
  onRecentre,
  onToggleStyle,
  onRestore,
  problem,
  renderMap,
}: {
  here: boolean;
  height?: number;
  scheme: MapScheme;
  locating: boolean;
  onShowMyLocation?: () => void;
  onRecentre?: () => void;
  onToggleStyle: () => void;
  onRestore: () => void;
  problem?: string | null;
  renderMap: (view: { height: number; expanded: boolean }) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const fullHeight = Math.max(240, window.height - insets.top - insets.bottom);
  function collapse() {
    setOpen(false);
    onRestore();
  }
  const shell = (expanded: boolean, viewHeight: number) => (
    <MapShell
      here={here}
      height={viewHeight}
      expanded={expanded}
      scheme={scheme}
      locating={locating}
      onShowMyLocation={onShowMyLocation}
      onRecentre={onRecentre}
      onExpand={() => setOpen(true)}
      onCollapse={collapse}
      onToggleStyle={onToggleStyle}
      problem={expanded ? null : problem}
    >
      {renderMap({ height: viewHeight, expanded })}
    </MapShell>
  );
  return (
    <>
      {shell(false, height)}
      <Modal visible={open} animationType="fade" onRequestClose={collapse} statusBarTranslucent>
        <View
          style={{
            flex: 1,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            backgroundColor: scheme === 'dark' ? '#141414' : '#F7F5F0',
          }}
        >
          {open ? shell(true, fullHeight) : null}
        </View>
      </Modal>
    </>
  );
}
