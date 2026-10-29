// Checks an agent card's Ed25519 signature in the browser, the way a
// customer's agent would. Mirrors canonical() in src/lib/crypto.js.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function verifyCard(card, signature, publicKey) {
  try {
    const key = await crypto.subtle.importKey('spki', unb64u(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64u(signature), new TextEncoder().encode(canonical(card)));
  } catch {
    return false;
  }
}
