/** True when a JPEG APP1 segment (EXIF or XMP) carries a GPS tag. */
export function jpegHasGps(bytes: Uint8Array): boolean {
  return app1Payloads(bytes).some((payload) => /gps/i.test(latin1(payload)));
}

/**
 * Drop APP1 from a JPEG. That segment holds EXIF and XMP, including GPS.
 * A file that is not a JPEG is returned unchanged. Stripping twice changes nothing further.
 */
export function stripJpegLocation(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let index = 2;
  while (index < bytes.length) {
    if (bytes[index] !== 0xff) {
      parts.push(bytes.subarray(index));
      break;
    }
    while (index < bytes.length && bytes[index] === 0xff) index += 1;
    if (index >= bytes.length) break;
    const marker = bytes[index];
    const markerAt = index - 1;
    index += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.subarray(markerAt, index));
      continue;
    }
    if (index + 2 > bytes.length) {
      parts.push(bytes.subarray(markerAt));
      break;
    }
    const length = (bytes[index] << 8) | bytes[index + 1];
    const end = index + length;
    if (length < 2 || end > bytes.length) {
      parts.push(bytes.subarray(markerAt));
      break;
    }
    if (marker !== 0xe1) parts.push(bytes.subarray(markerAt, end));
    index = end;
    if (marker === 0xda) {
      parts.push(bytes.subarray(index));
      break;
    }
  }
  return concat(parts);
}

/** Strip location metadata from a JPEG base64 string, with or without a data URL prefix. */
export function stripJpegBase64(value: string): string {
  const dataUrl = /^data:image\/jpeg;base64,/i.exec(value);
  const payload = dataUrl ? value.slice(dataUrl[0].length) : value;
  let bytes: Uint8Array;
  try {
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  } catch {
    return value;
  }
  const clean = stripJpegLocation(bytes);
  let binary = '';
  for (let index = 0; index < clean.length; index += 1) binary += String.fromCharCode(clean[index]);
  const encoded = btoa(binary);
  return dataUrl ? `${dataUrl[0]}${encoded}` : encoded;
}

function app1Payloads(bytes: Uint8Array): Uint8Array[] {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return [];
  const found: Uint8Array[] = [];
  let index = 2;
  while (index + 4 <= bytes.length) {
    if (bytes[index] !== 0xff) break;
    while (index < bytes.length && bytes[index] === 0xff) index += 1;
    if (index >= bytes.length) break;
    const marker = bytes[index];
    index += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (index + 2 > bytes.length) break;
    const length = (bytes[index] << 8) | bytes[index + 1];
    const end = index + length;
    if (length < 2 || end > bytes.length) break;
    if (marker === 0xe1) found.push(bytes.subarray(index + 2, end));
    index = end;
    if (marker === 0xda) break;
  }
  return found;
}

function latin1(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 1) text += String.fromCharCode(bytes[index]);
  return text;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
