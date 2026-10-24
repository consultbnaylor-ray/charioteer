import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { jpegHasGps, stripJpegBase64, stripJpegLocation } from './photoLocation';

function segment(marker: number, payload: string): Uint8Array {
  const body = new TextEncoder().encode(payload);
  const length = body.length + 2;
  const out = new Uint8Array(4 + body.length);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = length >> 8;
  out[3] = length & 0xff;
  out.set(body, 4);
  return out;
}

function jpegWithGps(): Uint8Array {
  const app0 = segment(0xe0, 'JFIF\0');
  const app1 = segment(0xe1, 'Exif\0\0GPSLatitude 51.5074 GPSLongitude -0.1278');
  const end = new Uint8Array([0xff, 0xd9]);
  const out = new Uint8Array(2 + app0.length + app1.length + end.length);
  out[0] = 0xff;
  out[1] = 0xd8;
  out.set(app0, 2);
  out.set(app1, 2 + app0.length);
  out.set(end, 2 + app0.length + app1.length);
  return out;
}

describe('photo location metadata', () => {
  it('drops EXIF and GPS from a JPEG and leaves the picture markers', () => {
    const original = jpegWithGps();
    expect(jpegHasGps(original)).toBe(true);
    const clean = stripJpegLocation(original);
    expect(jpegHasGps(clean)).toBe(false);
    expect(clean[0]).toBe(0xff);
    expect(clean[1]).toBe(0xd8);
    expect(clean[clean.length - 2]).toBe(0xff);
    expect(clean[clean.length - 1]).toBe(0xd9);
    expect(Array.from(clean)).toContain(0xe0);
    expect(Array.from(clean)).not.toContain(0xe1);
    expect(stripJpegLocation(clean)).toEqual(clean);
    const encoded = btoa(String.fromCharCode(...original));
    const stripped = stripJpegBase64(`data:image/jpeg;base64,${encoded}`);
    expect(stripped.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(jpegHasGps(Uint8Array.from(atob(stripped.slice(stripped.indexOf(',') + 1)), (char) => char.charCodeAt(0)))).toBe(false);
    expect(stripJpegLocation(new Uint8Array([1, 2, 3, 4]))).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('strips location on gratitude, vision, profile, gallery, meal, and progress photos', () => {
    const live = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const demo = readFileSync('src/data/demo-repository.ts', 'utf8');
    const picker = readFileSync('src/ui/prepareProgressPhoto.ts', 'utf8');
    const meal = readFileSync('src/ui/pickMealPhoto.ts', 'utf8');
    const estimate = readFileSync('supabase/functions/estimate-meal/index.ts', 'utf8');
    expect(live).toContain('stripJpegLocation(input.bytes)');
    expect(live).toContain('stripJpegLocation(bytes)');
    expect(live).toContain('stripJpegBase64(input.photoBase64)');
    expect(live).toContain('stripJpegBase64(input.imageBase64)');
    expect(picker).toContain('stripJpegLocation(decodeBase64');
    expect(meal).toContain('stripJpegBase64(prepared.base64)');
    expect(demo).toContain('stripJpegLocation(bytes)');
    expect(demo).toContain('stripJpegBase64(input.photoBase64)');
    expect(estimate).toContain('stripJpegBase64(body.imageBase64');
    for (const bucket of ['PROGRESS_BUCKET', 'PROFILE_PHOTO_BUCKET', 'GRATITUDE_BUCKET', 'VISION_BUCKET', 'FOOD_BUCKET']) {
      expect(live).toContain(bucket);
    }
  });
});
