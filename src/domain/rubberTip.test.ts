import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  RUBBER_TIP,
  RUBBER_TIP_KEY,
  RUBBER_WORD,
  freshRubberTip,
  nextRubberTip,
  rubberTipSeenIn,
  rubberTipShouldPersist,
  rubberTipVisible,
  type RubberTipState,
} from '@/domain/rubberTip';

const onScreen = { craving: false, fromDraw: true, hasPlan: true, rubberOn: false, snapFailed: false };

function loadedSnapped(seen = false): RubberTipState {
  let state = nextRubberTip(freshRubberTip(), { kind: 'loaded', seen });
  state = nextRubberTip(state, { kind: 'snapped' });
  return state;
}

describe('rubber tip wording', () => {
  it('says what to do in one short line, and the button has a visible name', () => {
    expect(RUBBER_TIP).toBe('Wrong bit? Use the rubber to wipe it out');
    expect(RUBBER_WORD).toBe('Rubber');
    expect(RUBBER_TIP_KEY).toBe('charioteer.route.rubberTip.seen.v1');
  });
});

describe('when the rubber tip shows', () => {
  it('stays hidden until a drawn route has snapped', () => {
    const loaded = nextRubberTip(freshRubberTip(), { kind: 'loaded', seen: false });
    expect(rubberTipVisible(loaded, onScreen)).toBe(false);
    expect(rubberTipVisible(loadedSnapped(), onScreen)).toBe(true);
  });

  it('stays hidden until the stored flag has been read, so it never flashes for someone who has seen it', () => {
    const snappedFirst = nextRubberTip(freshRubberTip(), { kind: 'snapped' });
    expect(rubberTipVisible(snappedFirst, onScreen)).toBe(false);
    expect(rubberTipVisible(nextRubberTip(snappedFirst, { kind: 'loaded', seen: false }), onScreen)).toBe(true);
    expect(rubberTipVisible(nextRubberTip(snappedFirst, { kind: 'loaded', seen: true }), onScreen)).toBe(false);
  });

  it('does not show for a route made from the settings, on a craving walk, after a failed snap, or with the rubber already on', () => {
    const state = loadedSnapped();
    expect(rubberTipVisible(state, { ...onScreen, fromDraw: false })).toBe(false);
    expect(rubberTipVisible(state, { ...onScreen, hasPlan: false })).toBe(false);
    expect(rubberTipVisible(state, { ...onScreen, craving: true })).toBe(false);
    expect(rubberTipVisible(state, { ...onScreen, snapFailed: true })).toBe(false);
    expect(rubberTipVisible(state, { ...onScreen, rubberOn: true })).toBe(false);
  });
});

describe('when the rubber tip hides for good', () => {
  it('hides once tapped, and that is saved once', () => {
    const state = loadedSnapped();
    expect(rubberTipShouldPersist(state, { kind: 'dismiss' })).toBe(true);
    const after = nextRubberTip(state, { kind: 'dismiss' });
    expect(rubberTipVisible(after, onScreen)).toBe(false);
    expect(rubberTipShouldPersist(after, { kind: 'dismiss' })).toBe(false);
  });

  it('hides once the rubber is used', () => {
    const after = nextRubberTip(loadedSnapped(), { kind: 'rubber' });
    expect(rubberTipVisible(after, onScreen)).toBe(false);
  });

  it('does not come back after another snap', () => {
    const after = nextRubberTip(nextRubberTip(loadedSnapped(), { kind: 'dismiss' }), { kind: 'snapped' });
    expect(rubberTipVisible(after, onScreen)).toBe(false);
  });

  it('does not come back on a later visit', () => {
    expect(rubberTipVisible(loadedSnapped(true), onScreen)).toBe(false);
  });

  it('a tap before the stored flag is read still counts', () => {
    const early = nextRubberTip(freshRubberTip(), { kind: 'dismiss' });
    const loaded = nextRubberTip(nextRubberTip(early, { kind: 'loaded', seen: false }), { kind: 'snapped' });
    expect(rubberTipVisible(loaded, onScreen)).toBe(false);
  });

  it('reads only its own stored value as seen', () => {
    expect(rubberTipSeenIn('1')).toBe(true);
    expect(rubberTipSeenIn(null)).toBe(false);
    expect(rubberTipSeenIn('0')).toBe(false);
  });
});

describe('wiring', () => {
  it('the map shows the word, the tip inline and full screen, and the route screen hides it on the rubber', () => {
    const chrome = readFileSync('src/ui/MapChrome.tsx', 'utf8');
    expect(chrome).toContain('{RUBBER_WORD}');
    expect(chrome).toContain('<RubberTip onDismiss={onDismissRubberTip} />');
    // MapFrame passes the tip to the one MapShell used for both the inline and the full-screen map.
    expect(chrome).toContain('rubberTip={rubberTip}');
    const footpath = readFileSync('src/ui/FootpathMap.tsx', 'utf8');
    expect(footpath).toContain('rubberTip={rubberTip}');
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    const rubber = maker.slice(maker.indexOf('function toggleRubber'), maker.indexOf('async function recalculateDrawn'));
    expect(rubber).toContain("tipEvent({ kind: 'rubber' })");
    const erase = maker.slice(maker.indexOf('function eraseDrawn'), maker.indexOf('function holdStroke'));
    expect(erase).toContain("tipEvent({ kind: 'rubber' })");
    expect(maker).toContain("tipEvent({ kind: 'snapped' })");
    expect(maker).toContain("onDismissRubberTip={() => tipEvent({ kind: 'dismiss' })}");
    const memory = readFileSync('src/ui/rubberTipMemory.ts', 'utf8');
    expect(memory).toContain('AsyncStorage.setItem(RUBBER_TIP_KEY');
    expect(memory).not.toMatch(/console\.|latitude|longitude/);
  });
});
