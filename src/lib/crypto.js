// Hashing and signing that run the same in Node 20+ and in browsers.
// SHA-256 is synchronous (pure JS) because the audit log and simulator need
// it inline; Ed25519 uses Web Crypto and is async.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Bytes(bytes) {
  const l = bytes.length;
  const padded = new Uint8Array(((l + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[l] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, l * 8);
  view.setUint32(padded.length - 8, Math.floor((l * 8) / 2 ** 32));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
}

const encoder = new TextEncoder();

export const sha256 = (input) => sha256Bytes(encoder.encode(typeof input === 'string' ? input : canonical(input)));

export function randomId(prefix, bytes = 6) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return `${prefix}_${[...buf].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

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

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const ED = { name: 'Ed25519' };

export async function generateKeyPair() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(ED, true, ['sign', 'verify']);
  return {
    publicKey: b64u(await crypto.subtle.exportKey('spki', publicKey)),
    privateKey: b64u(await crypto.subtle.exportKey('pkcs8', privateKey)),
  };
}

export async function sign(payload, privateKeyB64) {
  const key = await crypto.subtle.importKey('pkcs8', unb64u(privateKeyB64), ED, false, ['sign']);
  return b64u(await crypto.subtle.sign(ED, key, encoder.encode(canonical(payload))));
}

export async function verify(payload, signatureB64, publicKeyB64) {
  try {
    const key = await crypto.subtle.importKey('spki', unb64u(publicKeyB64), ED, false, ['verify']);
    return await crypto.subtle.verify(ED, key, unb64u(signatureB64), encoder.encode(canonical(payload)));
  } catch {
    return false;
  }
}
