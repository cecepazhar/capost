// @ts-nocheck
// Dependency-free MD5 / SHA-1 / SHA-256 / HMAC over byte arrays.
// Plain JS (no imports, no TS) on purpose: the same source is also injected
// verbatim into the QuickJS script sandbox to back the CryptoJS shim.

export function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

export function bytesToUtf8(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    if (b < 0x80) s += String.fromCharCode(b);
    else if (b < 0xe0) s += String.fromCharCode(((b & 31) << 6) | (bytes[i++] & 63));
    else if (b < 0xf0) s += String.fromCharCode(((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
    else {
      const cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      const v = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 1023));
    }
  }
  return s;
}

export function bytesToHex(bytes) {
  let s = '';
  for (const b of bytes) s += (b < 16 ? '0' : '') + b.toString(16);
  return s;
}

export function hexToBytes(hex) {
  const out = [];
  for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    s += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    s += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return s;
}

export function base64ToBytes(str) {
  const clean = String(str).replace(/[^A-Za-z0-9+/]/g, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((clean[i + 2] ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (clean[i + 3] ? B64.indexOf(clean[i + 3]) : 0);
    out.push((n >> 16) & 255);
    if (clean[i + 2]) out.push((n >> 8) & 255);
    if (clean[i + 3]) out.push(n & 255);
  }
  return out;
}

function rotl(x, n) {
  return (x << n) | (x >>> (32 - n));
}

export function md5(bytes) {
  const K = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const msg = bytes.slice();
  const bitLen = bytes.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  for (let i = 0; i < 8; i++) msg.push(i < 4 ? (bitLen >>> (8 * i)) & 255 : Math.floor(bitLen / 4294967296) >>> (8 * (i - 4)) & 255);
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (let off = 0; off < msg.length; off += 64) {
    const M = [];
    for (let i = 0; i < 16; i++) M[i] = msg[off + i * 4] | (msg[off + i * 4 + 1] << 8) | (msg[off + i * 4 + 2] << 16) | (msg[off + i * 4 + 3] << 24);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const tmp = D;
      D = C;
      C = B;
      B = (B + rotl((A + F + K[i] + M[g]) | 0, S[(i >> 4) * 4 + (i % 4)])) | 0;
      A = tmp;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const out = [];
  for (const w of [a0, b0, c0, d0]) for (let i = 0; i < 4; i++) out.push((w >>> (8 * i)) & 255);
  return out;
}

function pad64be(bytes) {
  const msg = bytes.slice();
  const bitLen = bytes.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  const hi = Math.floor(bitLen / 4294967296);
  for (let i = 3; i >= 0; i--) msg.push((hi >>> (8 * i)) & 255);
  for (let i = 3; i >= 0; i--) msg.push((bitLen >>> (8 * i)) & 255);
  return msg;
}

function wordsToBytes(words) {
  const out = [];
  for (const w of words) out.push((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255);
  return out;
}

export function sha1(bytes) {
  const msg = pad64be(bytes);
  let h0 = 0x67452301, h1 = 0xefcdab89 | 0, h2 = 0x98badcfe | 0, h3 = 0x10325476, h4 = 0xc3d2e1f0 | 0;
  const w = new Array(80);
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3];
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc | 0; }
      else { f = b ^ c ^ d; k = 0xca62c1d6 | 0; }
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  return wordsToBytes([h0, h1, h2, h3, h4]);
}

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

export function sha256(bytes) {
  const msg = pad64be(bytes);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return wordsToBytes(H);
}

export function hmac(hashFn, keyBytes, msgBytes) {
  let key = keyBytes;
  if (key.length > 64) key = hashFn(key);
  const k = key.slice();
  while (k.length < 64) k.push(0);
  const ipad = k.map((b) => b ^ 0x36);
  const opad = k.map((b) => b ^ 0x5c);
  return hashFn(opad.concat(hashFn(ipad.concat(msgBytes))));
}

export function md5Hex(str) {
  return bytesToHex(md5(utf8Bytes(str)));
}

// ---------- AES (FIPS-197) with CBC / ECB and PKCS#7 ----------
var AES_SBOX = null;
var AES_INV = null;
function aesXt(b) { return ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff; }
function aesMul(a, b) {
  var r = 0;
  while (b) { if (b & 1) r ^= a; a = aesXt(a); b >>= 1; }
  return r;
}
function aesInit() {
  if (AES_SBOX) return;
  AES_SBOX = new Array(256);
  AES_INV = new Array(256);
  var rot = function (x, s) { return ((x << s) | (x >> (8 - s))) & 0xff; };
  var p = 1, q = 1;
  do {
    p = (p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0)) & 0xff;
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    AES_SBOX[p] = (q ^ rot(q, 1) ^ rot(q, 2) ^ rot(q, 3) ^ rot(q, 4) ^ 0x63) & 0xff;
  } while (p !== 1);
  AES_SBOX[0] = 0x63;
  for (var i = 0; i < 256; i++) AES_INV[AES_SBOX[i]] = i;
}
function aesExpandKey(key) {
  aesInit();
  if ([16, 24, 32].indexOf(key.length) < 0) throw new Error('AES key must be 16, 24 or 32 bytes (got ' + key.length + ')');
  var Nk = key.length / 4, Nr = Nk + 6, w = key.slice(), rcon = 1;
  for (var i = Nk; i < 4 * (Nr + 1); i++) {
    var t = w.slice((i - 1) * 4, i * 4);
    if (i % Nk === 0) {
      t = [AES_SBOX[t[1]], AES_SBOX[t[2]], AES_SBOX[t[3]], AES_SBOX[t[0]]];
      t[0] ^= rcon;
      rcon = aesXt(rcon);
    } else if (Nk > 6 && i % Nk === 4) {
      t = t.map(function (b) { return AES_SBOX[b]; });
    }
    for (var j = 0; j < 4; j++) w.push(w[(i - Nk) * 4 + j] ^ t[j]);
  }
  return { w: w, Nr: Nr };
}
function aesEncryptBlock(inp, ks) {
  var s = inp.slice(), w = ks.w, Nr = ks.Nr, i, c, r;
  for (i = 0; i < 16; i++) s[i] ^= w[i];
  for (r = 1; r <= Nr; r++) {
    for (i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
    var t = s.slice();
    for (c = 0; c < 4; c++) for (var row = 0; row < 4; row++) s[row + 4 * c] = t[row + 4 * ((c + row) % 4)];
    if (r !== Nr) {
      for (c = 0; c < 4; c++) {
        var a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3];
        s[4 * c] = aesXt(a0) ^ aesXt(a1) ^ a1 ^ a2 ^ a3;
        s[4 * c + 1] = a0 ^ aesXt(a1) ^ aesXt(a2) ^ a2 ^ a3;
        s[4 * c + 2] = a0 ^ a1 ^ aesXt(a2) ^ aesXt(a3) ^ a3;
        s[4 * c + 3] = aesXt(a0) ^ a0 ^ a1 ^ a2 ^ aesXt(a3);
      }
    }
    for (i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
  }
  return s;
}
function aesDecryptBlock(inp, ks) {
  var s = inp.slice(), w = ks.w, Nr = ks.Nr, i, c, r;
  for (i = 0; i < 16; i++) s[i] ^= w[Nr * 16 + i];
  for (r = Nr - 1; r >= 0; r--) {
    var t = s.slice();
    for (c = 0; c < 4; c++) for (var row = 0; row < 4; row++) s[row + 4 * ((c + row) % 4)] = t[row + 4 * c];
    for (i = 0; i < 16; i++) s[i] = AES_INV[s[i]];
    for (i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
    if (r !== 0) {
      for (c = 0; c < 4; c++) {
        var a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3];
        s[4 * c] = aesMul(a0, 14) ^ aesMul(a1, 11) ^ aesMul(a2, 13) ^ aesMul(a3, 9);
        s[4 * c + 1] = aesMul(a0, 9) ^ aesMul(a1, 14) ^ aesMul(a2, 11) ^ aesMul(a3, 13);
        s[4 * c + 2] = aesMul(a0, 13) ^ aesMul(a1, 9) ^ aesMul(a2, 14) ^ aesMul(a3, 11);
        s[4 * c + 3] = aesMul(a0, 11) ^ aesMul(a1, 13) ^ aesMul(a2, 9) ^ aesMul(a3, 14);
      }
    }
  }
  return s;
}

/** mode: 'CBC' | 'ECB'; pkcs7: boolean. iv required for CBC (16 bytes). */
export function aesEncrypt(data, key, iv, mode, pkcs7) {
  var ks = aesExpandKey(key);
  var buf = data.slice();
  if (pkcs7 !== false) {
    var n = 16 - (buf.length % 16);
    for (var i = 0; i < n; i++) buf.push(n);
  } else {
    while (buf.length % 16) buf.push(0);
  }
  var out = [], prev = mode === 'ECB' ? null : (iv || []).slice(0, 16);
  if (prev && prev.length !== 16) throw new Error('AES-CBC needs a 16-byte IV');
  for (var o = 0; o < buf.length; o += 16) {
    var block = buf.slice(o, o + 16);
    if (prev) for (var j = 0; j < 16; j++) block[j] ^= prev[j];
    var enc = aesEncryptBlock(block, ks);
    if (prev) prev = enc;
    for (var k = 0; k < 16; k++) out.push(enc[k]);
  }
  return out;
}

export function aesDecrypt(data, key, iv, mode, pkcs7) {
  if (data.length % 16) throw new Error('AES ciphertext length must be a multiple of 16');
  var ks = aesExpandKey(key);
  var out = [], prev = mode === 'ECB' ? null : (iv || []).slice(0, 16);
  if (prev && prev.length !== 16) throw new Error('AES-CBC needs a 16-byte IV');
  for (var o = 0; o < data.length; o += 16) {
    var block = data.slice(o, o + 16);
    var dec = aesDecryptBlock(block, ks);
    if (prev) for (var j = 0; j < 16; j++) dec[j] ^= prev[j];
    if (prev) prev = block;
    for (var k = 0; k < 16; k++) out.push(dec[k]);
  }
  if (pkcs7 !== false && out.length) {
    var p = out[out.length - 1];
    if (p > 0 && p <= 16) out.length -= p;
  }
  return out;
}

/** OpenSSL EVP_BytesToKey(MD5, 1 iteration) — CryptoJS passphrase mode. */
export function evpBytesToKey(pass, salt, keyLen, ivLen) {
  var out = [], prev = [];
  while (out.length < keyLen + ivLen) {
    prev = md5(prev.concat(pass, salt));
    out = out.concat(prev);
  }
  return { key: out.slice(0, keyLen), iv: out.slice(keyLen, keyLen + ivLen) };
}
