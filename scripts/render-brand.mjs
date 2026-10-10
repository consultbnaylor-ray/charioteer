import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(import.meta.dirname, '..');
const ART_W = 724;
const ART_H = 435;

const markPaths = readFileSync(resolve(root, 'assets/brand/helmet.svg'), 'utf8')
  .replace(/<title>[\s\S]*?<\/title>/, '')
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replaceAll('currentColor', 'inherit');

const ink = '#111111';
const paper = '#F2F2EE';
const black = '#0C0C0C';
const white = '#F3F3EE';

function svgWrap(inner, width, height, viewBox) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">
${inner}
</svg>`;
}

function markGroup(fill, transform) {
  return `<g fill="${fill}" transform="${transform}">${markPaths}</g>`;
}

function png(svg, width) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0,0,0,0)',
    font: {
      fontFiles: [resolve(root, 'node_modules/@expo-google-fonts/oswald/700Bold/Oswald_700Bold.ttf')],
      loadSystemFonts: false,
      defaultFontFamily: 'Oswald',
    },
  });
  return resvg.render().asPng();
}

function write(file, svg, width) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png(svg, width));
}

function square(fill, background, padRatio) {
  const side = ART_W / (1 - padRatio * 2);
  const x = (side - ART_W) / 2;
  const y = (side - ART_H) / 2;
  return svgWrap(
    `<rect width="${side}" height="${side}" fill="${background}"/>${markGroup(fill, `translate(${x} ${y})`)}`,
    side,
    side,
    `0 0 ${side} ${side}`,
  );
}

function plain(fill) {
  return svgWrap(markGroup(fill, ''), ART_W, ART_H, `0 0 ${ART_W} ${ART_H}`);
}

const ios = [1024, 180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29, 20];
for (const size of ios) {
  write(resolve(root, `assets/brand/ios/icon-${size}.png`), square(white, black, 0.1), size);
}

write(resolve(root, 'assets/brand/favicon-16.png'), square(white, black, 0.06), 16);
write(resolve(root, 'assets/brand/favicon-32.png'), square(white, black, 0.06), 32);
write(resolve(root, 'assets/brand/favicon-48.png'), square(white, black, 0.08), 48);
write(resolve(root, 'assets/brand/splash-icon.png'), plain(white), 720);
write(resolve(root, 'assets/brand/adaptive-foreground.png'), square(white, 'rgba(0,0,0,0)', 0.18), 1024);
write(resolve(root, 'assets/brand/adaptive-monochrome.png'), square('#000', 'rgba(0,0,0,0)', 0.18), 1024);
write(resolve(root, 'assets/brand/helmet-on-light.png'), square(ink, paper, 0.08), 900);
write(resolve(root, 'assets/brand/helmet-on-dark.png'), square(white, black, 0.08), 900);

const lockup = (fill, background) => svgWrap(
  `<rect width="980" height="220" fill="${background}"/>${markGroup(fill, 'translate(28 24) scale(0.4)')}
  <text x="340" y="132" fill="${fill}" font-family="Oswald" font-size="54" letter-spacing="8">CHARIOTEER</text>`,
  980,
  220,
  '0 0 980 220',
);

writeFileSync(resolve(root, 'assets/brand/lockup-light.svg'), lockup(ink, paper));
writeFileSync(resolve(root, 'assets/brand/lockup-dark.svg'), lockup(white, black));

const sizes = [16, 24, 32, 48, 64];
const board = svgWrap(
  `<rect width="1400" height="980" fill="${paper}"/>
  <rect x="700" width="700" height="980" fill="${black}"/>
  ${markGroup(ink, 'translate(40 70) scale(0.85)')}
  ${markGroup(white, 'translate(740 70) scale(0.85)')}
  <text x="40" y="500" fill="${ink}" font-family="Oswald" font-size="48" letter-spacing="8">CHARIOTEER</text>
  <text x="740" y="500" fill="${white}" font-family="Oswald" font-size="48" letter-spacing="8">CHARIOTEER</text>
  ${sizes.map((size, index) => {
    const x = 40 + index * 120;
    const scale = size / ART_W;
    return `${markGroup(ink, `translate(${x} 560) scale(${scale})`)}
      <text x="${x}" y="660" fill="#4C4C47" font-family="Oswald" font-size="16">${size}</text>
      ${markGroup(white, `translate(${x + 700} 560) scale(${scale})`)}
      <text x="${x + 700}" y="660" fill="#B3B3AC" font-family="Oswald" font-size="16">${size}</text>`;
  }).join('\n')}
  <rect x="40" y="720" width="180" height="180" fill="${black}"/>
  ${markGroup(white, 'translate(58 774) scale(0.2)')}
  <text x="240" y="820" fill="${ink}" font-family="Oswald" font-size="22" letter-spacing="2">APP ICON</text>
  <rect x="740" y="720" width="180" height="180" fill="${paper}"/>
  ${markGroup(ink, 'translate(758 774) scale(0.2)')}
  <text x="940" y="820" fill="${white}" font-family="Oswald" font-size="22" letter-spacing="2">INVERSE</text>`,
  1400,
  980,
  '0 0 1400 980',
);

mkdirSync('/opt/cursor/artifacts', { recursive: true });
write('/opt/cursor/artifacts/charioteer-logo.png', board, 1400);
console.log('brand assets written');
