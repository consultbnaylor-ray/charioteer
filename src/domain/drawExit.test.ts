import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  drawCloseEnabled,
  drawCloseLabel,
  nextDrawMode,
  pageScrollsWhileDrawing,
  type DrawModeEvent,
} from '@/domain/drawStroke';

describe('leaving draw mode', () => {
  it('the pen toggles draw mode on and off and keeps the sketch', () => {
    expect(nextDrawMode(false, 'pen')).toEqual({ drawing: true, clearSketch: false });
    expect(nextDrawMode(true, 'pen')).toEqual({ drawing: false, clearSketch: false });
  });

  it('the X stops drawing and clears the sketch', () => {
    expect(nextDrawMode(true, 'close')).toEqual({ drawing: false, clearSketch: true });
    expect(nextDrawMode(false, 'close')).toEqual({ drawing: false, clearSketch: true });
  });

  it('closing full screen, Adjust and a snapped route all leave draw mode and keep the sketch', () => {
    for (const event of ['collapse', 'adjust', 'snapped'] as DrawModeEvent[]) {
      expect(nextDrawMode(true, event)).toEqual({ drawing: false, clearSketch: false });
    }
  });

  it('every way out of draw mode gives the page its scroll back', () => {
    for (const event of ['pen', 'close', 'collapse', 'adjust', 'snapped'] as DrawModeEvent[]) {
      expect(pageScrollsWhileDrawing(nextDrawMode(true, event).drawing)).toBe(true);
    }
    expect(pageScrollsWhileDrawing(true)).toBe(false);
    expect(pageScrollsWhileDrawing(false)).toBe(true);
  });

  it('the X is live as soon as draw mode is on, even before a line is drawn', () => {
    expect(drawCloseEnabled({ drawing: true, hasSketch: false, fromDraw: false })).toBe(true);
    expect(drawCloseEnabled({ drawing: false, hasSketch: false, fromDraw: false })).toBe(false);
    expect(drawCloseEnabled({ drawing: false, hasSketch: true, fromDraw: false })).toBe(true);
    expect(drawCloseEnabled({ drawing: false, hasSketch: false, fromDraw: true })).toBe(true);
    expect(drawCloseLabel(true)).toBe('Stop drawing and clear');
    expect(drawCloseLabel(false)).toBe('Clear');
  });

  it('the route screen wires the X, the pen and closing full screen to leave draw mode', () => {
    const maker = readFileSync('src/ui/RouteMaker.tsx', 'utf8');
    expect(maker).toContain('onClearDraw={closeDraw}');
    expect(maker).toContain('onExitDraw={exitDraw}');
    expect(maker).toContain("nextDrawMode(drawing, 'close')");
    // The pen goes through nextDrawTool, which still toggles draw mode (and leaves the rubber).
    expect(maker).toContain("nextDrawTool(drawing, drawTool, 'pen')");
    expect(maker).toContain('drawCloseEnabled({ drawing,');
    const chrome = readFileSync('src/ui/MapChrome.tsx', 'utf8');
    expect(chrome).toContain('if (drawing) onExitDraw?.();');
    expect(chrome).toContain('label={drawCloseLabel(drawing)}');
    for (const path of ['src/ui/FootpathMap.tsx', 'src/ui/FootpathMap.web.tsx']) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('onExitDraw={onExitDraw}');
      expect(source).toContain('if (pageScrollsWhileDrawing(drawingOn)) return undefined;');
    }
    // The inline map no longer re-locks the page as it unmounts mid-draw.
    const native = readFileSync('src/ui/FootpathMap.tsx', 'utf8');
    expect(native).toContain('if (drawRef.current?.enabled) return;');
  });
});
