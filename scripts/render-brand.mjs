import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(import.meta.dirname, '..');
const markPaths = readFileSync(resolve(root, 'assets/brand/helmet.svg'), 'utf8')
  .replace(/<title>[\s\S]*?<\/title>/, '')
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replaceAll('currentColor', 'inherit');

const ink = '#111111';
const paper = '#F2F2EE';
const black = '#0C0C0C';
const white = '#F3F3EE';

function svgWrap(inner, size = 80) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
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

function icon(fill, background, paddingRatio) {
  const pad = 80 * paddingRatio;
  const scale = (80 - pad * 2) / 80;
  return svgWrap(
    `<rect width="80" height="80" fill="${background}"/>${markGroup(fill, `translate(${pad} ${pad}) scale(${scale})`)}`,
  );
}

function plain(fill) {
  return svgWrap(markGroup(fill, ''));
}

const ios = [1024, 180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29, 20];
for (const size of ios) {
  write(resolve(root, `assets/brand/ios/icon-${size}.png`), icon(white, black, 0.12), size);
}

write(resolve(root, 'assets/brand/favicon-16.png'), icon(white, black, 0.1), 16);
write(resolve(root, 'assets/brand/favicon-32.png'), icon(white, black, 0.1), 32);
write(resolve(root, 'assets/brand/favicon-48.png'), icon(white, black, 0.1), 48);
write(resolve(root, 'assets/brand/splash-icon.png'), plain(white), 512);
write(resolve(root, 'assets/brand/adaptive-foreground.png'), plain(white).replace(
  'viewBox="0 0 80 80"',
  'viewBox="-18 -18 116 116"',
), 1024);
write(resolve(root, 'assets/brand/adaptive-monochrome.png'), plain('#000').replace(
  'viewBox="0 0 80 80"',
  'viewBox="-18 -18 116 116"',
), 1024);
write(resolve(root, 'assets/brand/helmet-on-light.png'), icon(ink, paper, 0.08), 512);
write(resolve(root, 'assets/brand/helmet-on-dark.png'), icon(white, black, 0.08), 512);

const lockup = (fill, background) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120" viewBox="0 0 640 120">
  <rect width="640" height="120" fill="${background}"/>
  ${markGroup(fill, 'translate(24 20) scale(1)')}
  <text x="128" y="78" fill="${fill}" font-family="Oswald" font-size="42" letter-spacing="6">CHARIOTEER</text>
</svg>`;

writeFileSync(resolve(root, 'assets/brand/lockup-light.svg'), lockup(ink, paper));
writeFileSync(resolve(root, 'assets/brand/lockup-dark.svg'), lockup(white, black));

const board = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="860" viewBox="0 0 1400 860">
  <rect width="700" height="860" fill="${paper}"/>
  <rect x="700" width="700" height="860" fill="${black}"/>
  ${markGroup(ink, 'translate(210 80) scale(3.4)')}
  ${markGroup(white, 'translate(910 80) scale(3.4)')}
  <text x="80" y="430" fill="${ink}" font-family="Oswald" font-size="54" letter-spacing="8">CHARIOTEER</text>
  <text x="780" y="430" fill="${white}" font-family="Oswald" font-size="54" letter-spacing="8">CHARIOTEER</text>
  ${[16, 24, 32, 48, 64].map((size, index) => {
    const x = 80 + index * 110;
    return `${markGroup(ink, `translate(${x} 490) scale(${size / 80})`)}
      <text x="${x}" y="590" fill="#4C4C47" font-family="Oswald" font-size="16">${size}</text>
      ${markGroup(white, `translate(${x + 700} 490) scale(${size / 80})`)}
      <text x="${x + 700}" y="590" fill="#B3B3AC" font-family="Oswald" font-size="16">${size}</text>`;
  }).join('\n')}
  <rect x="80" y="640" width="160" height="160" fill="${black}"/>
  ${markGroup(white, 'translate(104 664) scale(1.4)')}
  <text x="260" y="720" fill="${ink}" font-family="Oswald" font-size="22" letter-spacing="2">APP ICON</text>
  <rect x="780" y="640" width="160" height="160" fill="${paper}"/>
  ${markGroup(ink, 'translate(804 664) scale(1.4)')}
  <text x="960" y="720" fill="${white}" font-family="Oswald" font-size="22" letter-spacing="2">INVERSE</text>
</svg>`;

mkdirSync('/opt/cursor/artifacts', { recursive: true });
write('/opt/cursor/artifacts/charioteer-logo.png', board, 1400);
console.log('brand assets written');
