/**
 * Ids for local demo rows. On device, Hermes has no global crypto object, so
 * calling randomUUID on it throws. Prefer expo-crypto, then Web Crypto when
 * that object exists, then a plain UUID.
 */
export function randomId(): string {
  const fromExpo = expoRandomId();
  if (fromExpo) return fromExpo;
  const fromGlobal = globalRandomId();
  if (fromGlobal) return fromGlobal;
  return fallbackUuid();
}

function expoRandomId(): string | null {
  try {
    const loaded = require('expo-crypto') as { randomUUID?: () => string };
    if (typeof loaded.randomUUID !== 'function') return null;
    const id = loaded.randomUUID();
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

function globalRandomId(): string | null {
  try {
    const cryptoObj = globalThis.crypto;
    if (!cryptoObj || typeof cryptoObj.randomUUID !== 'function') return null;
    return cryptoObj.randomUUID();
  } catch {
    return null;
  }
}

function fallbackUuid(): string {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
