/** Decode a UTF-8 chunk. Uses TextDecoder when the runtime has one, including a split multibyte sequence. */

export function createUtf8Decoder(): {
  decode(chunk: Uint8Array): string;
  flush(): string;
} {
  if (typeof TextDecoder !== 'undefined') {
    const decoder = new TextDecoder();
    return {
      decode: (chunk) => decoder.decode(chunk, { stream: true }),
      flush: () => decoder.decode(),
    };
  }
  let pending = new Uint8Array(0);
  return {
    decode(chunk) {
      const merged = concat(pending, chunk);
      const complete = completeLength(merged);
      pending = merged.slice(complete);
      return decodeComplete(merged.subarray(0, complete));
    },
    flush() {
      const text = decodeComplete(pending);
      pending = new Uint8Array(0);
      return text;
    },
  };
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (!left.length) return right;
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left);
  merged.set(right, left.length);
  return merged;
}

function completeLength(bytes: Uint8Array): number {
  let index = bytes.length - 1;
  let extra = 0;
  while (index >= 0 && extra < 4 && (bytes[index] & 0xc0) === 0x80) {
    extra += 1;
    index -= 1;
  }
  if (index < 0) return bytes.length;
  const lead = bytes[index];
  const need = lead < 0x80 ? 1 : lead < 0xe0 ? 2 : lead < 0xf0 ? 3 : 4;
  if (bytes.length - index < need) return index;
  return bytes.length;
}

function decodeComplete(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte < 0x80) {
      out += String.fromCharCode(byte);
    } else if (byte < 0xe0) {
      out += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[++index] & 0x3f));
    } else if (byte < 0xf0) {
      out += String.fromCharCode(((byte & 0x0f) << 12) | ((bytes[++index] & 0x3f) << 6) | (bytes[++index] & 0x3f));
    } else {
      const code = ((byte & 0x07) << 18) | ((bytes[++index] & 0x3f) << 12) | ((bytes[++index] & 0x3f) << 6) | (bytes[++index] & 0x3f);
      const shifted = code - 0x10000;
      out += String.fromCharCode(0xd800 + (shifted >> 10), 0xdc00 + (shifted & 0x3ff));
    }
  }
  return out;
}
