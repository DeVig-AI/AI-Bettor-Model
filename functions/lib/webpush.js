// Web Push from a Cloudflare Function with no library: the VAPID signature (RFC 8292) that tells the phone's push
// service the message is from DeVig, and the aes128gcm encryption (RFC 8291) that only that one device can open.
// Works the same in Workers and in Node 20 (both have Web Crypto), so the node tests run it as is.
// Lives outside functions/api, and exports no request handler, so it is never a page of its own.

const te = new TextEncoder();

export function b64uEncode(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(str) {
  let s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// A device's subscription keys are what the browser handed out: p256dh (its public key, 65 bytes) and auth (16 bytes).
export function keysOk(p256dh, auth) {
  try { return b64uDecode(p256dh).length === 65 && b64uDecode(p256dh)[0] === 4 && b64uDecode(auth).length === 16; }
  catch (e) { return false; }
}

// payload (a string) -> the encrypted body: salt | record size | key id length | DeVig's one-time public key | ciphertext.
// `salt` and `local` (an ECDH key pair) are only passed by tests that need a fixed answer.
export async function encrypt(payload, p256dh, auth, {salt, local} = {}) {
  const ua = b64uDecode(p256dh), secret = b64uDecode(auth);
  if (ua.length !== 65 || secret.length !== 16) throw new Error("bad subscription keys");
  const as = local || await crypto.subtle.generateKey({name: "ECDH", namedCurve: "P-256"}, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, {name: "ECDH", namedCurve: "P-256"}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: "ECDH", public: uaKey}, as.privateKey, 256));
  const prkKey = await hmac(secret, shared);
  const ikm = await hmac(prkKey, concat(te.encode("WebPush: info\0"), ua, asPub, new Uint8Array([1])));
  salt = salt || crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const body = concat(te.encode(payload), new Uint8Array([2]));     // 2 = the last (only) record, no padding
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv: nonce}, key, body));
  const head = new Uint8Array(21);
  head.set(salt);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = asPub.length;
  return concat(head, asPub, ct);
}

// The VAPID header: a 12-hour ES256 token for this push service, signed with DeVig's private key.
// keys = {publicKey: base64url of the 65-byte public key, privateKey: base64url of the 32-byte private number}
export async function vapid(endpoint, keys, subject, now = Date.now()) {
  const pub = b64uDecode(keys.publicKey);
  if (pub.length !== 65) throw new Error("bad VAPID public key");
  const jwk = {kty: "EC", crv: "P-256", x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)),
               d: String(keys.privateKey).trim(), ext: true};
  const key = await crypto.subtle.importKey("jwk", jwk, {name: "ECDSA", namedCurve: "P-256"}, false, ["sign"]);
  const part = o => b64uEncode(te.encode(JSON.stringify(o)));
  const unsigned = part({typ: "JWT", alg: "ES256"}) + "." +
    part({aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject});
  const sig = await crypto.subtle.sign({name: "ECDSA", hash: "SHA-256"}, key, te.encode(unsigned));
  return `vapid t=${unsigned}.${b64uEncode(sig)}, k=${keys.publicKey}`;
}

// Only the browsers' own push services: the server never posts to any other address someone saves.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];
export function endpointOk(endpoint) {
  let u;
  try { u = new URL(String(endpoint || "")); } catch (e) { return false; }
  return u.protocol === "https:" && String(endpoint).length <= 1000 && PUSH_HOSTS.some(r => r.test(u.hostname));
}

// Send one message to one device. Returns the push service's status: 201 delivered, 404/410 the device is gone.
export async function send(device, message, keys, {subject = "https://devigai.pages.dev", ttl = 6 * 3600,
  urgency = "normal", fetcher = fetch, now = Date.now()} = {}) {
  if (!endpointOk(device.endpoint)) return 410;
  const body = await encrypt(JSON.stringify(message), device.p256dh, device.auth);
  const r = await fetcher(device.endpoint, {method: "POST", body, headers: {
    authorization: await vapid(device.endpoint, keys, subject, now),
    "content-encoding": "aes128gcm", "content-type": "application/octet-stream",
    ttl: String(ttl), urgency}});
  return r.status;
}
