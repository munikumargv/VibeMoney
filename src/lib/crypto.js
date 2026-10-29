// Signing and hashing helpers. Ed25519 is used for everything that must be
// verifiable by a third party: agent cards, AP2-style mandates, pass codes.
import crypto from 'node:crypto';

export const sha256 = (input) =>
  crypto.createHash('sha256').update(typeof input === 'string' ? input : canonical(input)).digest('hex');

export const randomId = (prefix, bytes = 6) => `${prefix}_${crypto.randomBytes(bytes).toString('hex')}`;

// Stable JSON so signatures don't depend on key order.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url'),
  };
}

export function sign(payload, privateKeyB64) {
  const key = crypto.createPrivateKey({ key: Buffer.from(privateKeyB64, 'base64url'), format: 'der', type: 'pkcs8' });
  return crypto.sign(null, Buffer.from(canonical(payload)), key).toString('base64url');
}

export function verify(payload, signatureB64, publicKeyB64) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, 'base64url'), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(canonical(payload)), key, Buffer.from(signatureB64, 'base64url'));
  } catch {
    return false;
  }
}

// Address derived from a public key, shaped like an EVM address for display.
export const addressFromPublicKey = (publicKeyB64) => `0x${sha256(publicKeyB64).slice(0, 40)}`;
