import Svg, { Circle, Path } from 'react-native-svg';

import type { MenuIcon } from '@/domain/sections';

const stroke = { strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** Line icons for the menu. The row label is the accessible name. */
export function MenuGlyph({ name, color }: { name: MenuIcon; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      {name === 'sun' ? (
        <>
          <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={1.6} />
          <Path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'check' ? <Path d="M5 12.5 9.2 16.7 19 7" stroke={color} {...stroke} /> : null}
      {name === 'breath' ? (
        <>
          <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.6} />
          <Circle cx={12} cy={12} r={7} stroke={color} strokeWidth={1.6} />
        </>
      ) : null}
      {name === 'chat' ? <Path d="M5 6.5h14v9H9L5 18.5v-12z" stroke={color} {...stroke} /> : null}
      {name === 'people' ? (
        <>
          <Circle cx={9} cy={8.2} r={2.1} stroke={color} strokeWidth={1.6} />
          <Circle cx={15.6} cy={9.2} r={1.7} stroke={color} strokeWidth={1.6} />
          <Path d="M4.2 18.2c.6-2.5 2.3-3.8 4.8-3.8s4.2 1.3 4.8 3.8M13.8 14.4c1.3-.4 2.5-.3 3.6.4 1 .8 1.8 2 2.1 3.4" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'star' ? <Path d="M12 4.2 13.9 8.6l4.8.4-3.6 3.1 1.1 4.6L12 14.4 7.8 16.7l1.1-4.6L5.3 9l4.8-.4L12 4.2z" stroke={color} {...stroke} /> : null}
      {name === 'pulse' ? <Path d="M3 12h3.2l2.2-6 3.4 12 2.2-6H21" stroke={color} {...stroke} /> : null}
      {name === 'stats' ? (
        <>
          <Path d="M4 4h6.5v6.5H4V4zM13.5 4H20v6.5h-6.5V4zM4 13.5h6.5V20H4v-6.5zM13.5 13.5H20V20h-6.5v-6.5z" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'plan' ? (
        <>
          <Path d="M7 4.5h10v15H7v-15z" stroke={color} {...stroke} />
          <Path d="M9.5 8.5h5M9.5 12h5M9.5 15.5h3" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'meal' ? (
        <>
          <Path d="M7 10h10c.2 3.6-2 6.4-5 6.4S6.8 13.6 7 10z" stroke={color} {...stroke} />
          <Path d="M8.2 10c.3-2.4 1.4-3.6 3.8-3.6s3.5 1.2 3.8 3.6" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'photo' ? (
        <>
          <Path d="M5 7h14v11H5V7z" stroke={color} {...stroke} />
          <Circle cx={9} cy={10.2} r={1} stroke={color} strokeWidth={1.6} />
          <Path d="M5 15.2 8.4 12l2.6 2.2 2.1-1.7L19 16.4" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'board' ? (
        <>
          <Path d="M4 5h7v6H4V5zM13 5h7v9h-7V5zM4 13h7v6H4v-6zM13 16h7v3h-7v-3z" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'glass' ? <Path d="M8 4h8l-1.7 7.2a3.2 3.2 0 0 1-4.6 0L8 4zM12 14.4V19M9 19.5h6" stroke={color} {...stroke} /> : null}
      {name === 'quote' ? (
        <>
          <Path d="M8 7.2h3.6v3.4c-1.8 0-3 1-3 2.8M14.2 7.2H17.8v3.4c-1.8 0-3 1-3 2.8" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'book' ? (
        <>
          <Path d="M6 5.5h12V19H7.4A1.4 1.4 0 0 1 6 17.6V5.5z" stroke={color} {...stroke} />
          <Path d="M6 5.5C6 7 7.2 7.2 8.4 7.2H18" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'bell' ? (
        <>
          <Path d="M6 16.4h12" stroke={color} {...stroke} />
          <Path d="M7.2 16.2V10.4a4.8 4.8 0 0 1 9.6 0v5.8" stroke={color} {...stroke} />
          <Path d="M10.2 16.8a1.8 1.8 0 0 0 3.6 0" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'person' ? (
        <>
          <Circle cx={12} cy={8} r={2.5} stroke={color} strokeWidth={1.6} />
          <Path d="M6 19c.8-3.2 2.8-4.8 6-4.8s5.2 1.6 6 4.8" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'lock' ? (
        <>
          <Path d="M8 11V8.6a4 4 0 0 1 8 0V11" stroke={color} {...stroke} />
          <Path d="M7 11h10v8H7v-8z" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'help' ? (
        <>
          <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={1.6} />
          <Path d="M12 8v4.8M12 16.2v.2" stroke={color} {...stroke} />
        </>
      ) : null}
      {name === 'leave' ? (
        <>
          <Path d="M10 6H6.5v12H10" stroke={color} {...stroke} />
          <Path d="M10.5 12H18M14.8 8.6 18 12l-3.2 3.4" stroke={color} {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}

/** Drawn in the menu header. The button label is the accessible name. */
export function CloseMark({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      <Path d="M6 6 18 18M18 6 6 18" stroke={color} {...stroke} />
    </Svg>
  );
}
