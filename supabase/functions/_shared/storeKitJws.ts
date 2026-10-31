import { compactVerify, decodeProtectedHeader, importX509 } from 'jose';
import { PemConverter, X509Certificate } from '@peculiar/x509';

import { APPLE_ROOT_CA_G3_PEM, APPLE_ROOT_CA_G3_SHA256 } from './appleRootCaG3.ts';

export type StoreKitVerifyReason = 'header' | 'chain' | 'signature' | 'root';

export class StoreKitVerifyError extends Error {
  constructor(readonly reason: StoreKitVerifyReason) {
    super(reason);
    this.name = 'StoreKitVerifyError';
  }
}

async function sha256Hex(bytes: BufferSource): Promise<string> {
  const view = bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const copy = new Uint8Array(view);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function appleRootMatchesPin(pem = APPLE_ROOT_CA_G3_PEM): Promise<boolean> {
  const cert = new X509Certificate(pem);
  return (await sha256Hex(cert.rawData)) === APPLE_ROOT_CA_G3_SHA256;
}

function decodeCert(part: string): X509Certificate {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new X509Certificate(bytes);
}

/**
 * Verifies a StoreKit 2 JWS: ES256 leaf signature, x5c chain, pinned trust anchor.
 * `rootPem` is Apple Root CA G3 in production. Tests pass a generated root.
 */
export async function verifyAppleJws(jws: string, rootPem: string): Promise<unknown> {
  if (typeof jws !== 'string' || jws.length < 20 || jws.length > 100_000 || jws.split('.').length !== 3) {
    throw new StoreKitVerifyError('header');
  }
  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(jws);
  } catch {
    throw new StoreKitVerifyError('header');
  }
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 2 || header.x5c.length > 5) {
    throw new StoreKitVerifyError('header');
  }
  const parts = header.x5c.filter((part): part is string => typeof part === 'string' && part.length > 0);
  if (parts.length !== header.x5c.length) throw new StoreKitVerifyError('header');

  let certs: X509Certificate[];
  let anchor: X509Certificate;
  try {
    certs = parts.map((part) => decodeCert(part));
    anchor = new X509Certificate(rootPem);
  } catch {
    throw new StoreKitVerifyError('chain');
  }

  const anchorHash = await sha256Hex(anchor.rawData);
  const lastHash = await sha256Hex(certs[certs.length - 1].rawData);
  const end = lastHash === anchorHash ? certs.length - 1 : certs.length;
  if (end < 2) throw new StoreKitVerifyError('chain');

  try {
    for (let i = 0; i < end - 1; i += 1) {
      const signed = await certs[i].verify({ publicKey: certs[i + 1].publicKey });
      if (!signed) throw new StoreKitVerifyError('chain');
    }
    const anchored = await certs[end - 1].verify({ publicKey: anchor.publicKey });
    if (!anchored) throw new StoreKitVerifyError('chain');
  } catch (error) {
    if (error instanceof StoreKitVerifyError) throw error;
    throw new StoreKitVerifyError('chain');
  }

  try {
    const leafPem = PemConverter.encode(certs[0].rawData, 'CERTIFICATE');
    const key = await importX509(leafPem, 'ES256');
    const verified = await compactVerify(jws, key);
    return JSON.parse(new TextDecoder().decode(verified.payload));
  } catch (error) {
    if (error instanceof StoreKitVerifyError) throw error;
    throw new StoreKitVerifyError('signature');
  }
}

export async function verifyProductionJws(jws: string): Promise<unknown> {
  if (!(await appleRootMatchesPin())) throw new StoreKitVerifyError('root');
  return verifyAppleJws(jws, APPLE_ROOT_CA_G3_PEM);
}
