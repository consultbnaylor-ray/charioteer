import { SignJWT } from 'jose';
import {
  BasicConstraintsExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  PemConverter,
  X509CertificateGenerator,
} from '@peculiar/x509';
import { describe, expect, it } from 'vitest';

import { appleRootMatchesPin, verifyAppleJws } from './storeKitJws.ts';
import { BUNDLE_ID, MONTHLY_PRODUCT_ID, readTransactionClaims } from './subscriptionRules.ts';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');

async function fixtureChain() {
  const rootKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const midKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const leafKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const signingAlgorithm = { name: 'ECDSA', hash: 'SHA-256' } as const;
  const notBefore = new Date('2020-01-01T00:00:00Z');
  const notAfter = new Date('2035-01-01T00:00:00Z');
  const root = await X509CertificateGenerator.createSelfSigned({
    name: 'CN=Test Root',
    keys: rootKeys,
    notBefore,
    notAfter,
    signingAlgorithm,
    extensions: [
      new BasicConstraintsExtension(true, 1, true),
      new KeyUsagesExtension(KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign, true),
    ],
  });
  const mid = await X509CertificateGenerator.create({
    subject: 'CN=Test Intermediate',
    issuer: root.subject,
    publicKey: midKeys.publicKey,
    signingKey: rootKeys.privateKey,
    notBefore,
    notAfter,
    signingAlgorithm,
    extensions: [
      new BasicConstraintsExtension(true, 0, true),
      new KeyUsagesExtension(KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign, true),
    ],
  });
  const leaf = await X509CertificateGenerator.create({
    subject: 'CN=Test Leaf',
    issuer: mid.subject,
    publicKey: leafKeys.publicKey,
    signingKey: midKeys.privateKey,
    notBefore,
    notAfter,
    signingAlgorithm,
    extensions: [
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
    ],
  });
  const x5c = [leaf, mid, root].map((cert) => PemConverter.encode(cert.rawData, 'CERTIFICATE')
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s/g, ''));
  return { rootPem: PemConverter.encode(root.rawData, 'CERTIFICATE'), leafKeys, x5c };
}

async function signedTransaction(rootPem: string, leafKeys: CryptoKey, x5c: string[], payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', x5c })
    .sign(leafKeys);
}

describe('StoreKit JWS', () => {
  it('pins Apple Root CA G3', async () => {
    expect(await appleRootMatchesPin()).toBe(true);
  });

  it('accepts a chained Sandbox trial for Sta and rejects a swapped root or payload', async () => {
    const { rootPem, leafKeys, x5c } = await fixtureChain();
    const other = await fixtureChain();
    const payload = {
      bundleId: BUNDLE_ID,
      productId: MONTHLY_PRODUCT_ID,
      originalTransactionId: '2000000000000099',
      expiresDate: NOW + 7 * 24 * 60 * 60 * 1000,
      environment: 'Xcode',
      offerType: 1,
      offerDiscountType: 'FREE_TRIAL',
    };
    const jws = await signedTransaction(rootPem, leafKeys.privateKey, x5c, payload);
    const verified = await verifyAppleJws(jws, rootPem);
    const read = readTransactionClaims(verified, NOW);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.subscription.productId).toBe('Sta');
    expect(read.subscription.isTrial).toBe(true);
    expect(read.subscription.environment).toBe('Xcode');

    const withoutRoot = await signedTransaction(rootPem, leafKeys.privateKey, x5c.slice(0, 2), payload);
    const shortened = await verifyAppleJws(withoutRoot, rootPem);
    expect(readTransactionClaims(shortened, NOW).ok).toBe(true);

    await expect(verifyAppleJws(jws, other.rootPem)).rejects.toMatchObject({ reason: 'chain' });
    const [head, body, signature] = jws.split('.');
    const flipped = `${head}.${body.slice(0, -2)}aa.${signature}`;
    await expect(verifyAppleJws(flipped, rootPem)).rejects.toMatchObject({ reason: 'signature' });

    const wrongProduct = await signedTransaction(rootPem, leafKeys.privateKey, x5c, { ...payload, productId: 'monthly' });
    const decoded = await verifyAppleJws(wrongProduct, rootPem);
    expect(readTransactionClaims(decoded, NOW)).toMatchObject({ ok: false, reason: 'product' });
  });
});
