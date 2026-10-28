/**
 * WebVPN URL 转换器
 * 基于湖南农业大学 WebVPN 规范 (webvpn.hunau.edu.cn)
 * 算法：AES-CFB-128 加密 Host，IV 与 Key 均为 "wwwvpnisthebest!"
 */

const KEY_AND_IV = "wwwvpnisthebest!";
const VPN_DOMAIN = "webvpn.hunau.edu.cn";

// S 盒与 AES 核心加密（用于 CFB-128 模式）
function gfMultiply(a: number, b: number): number {
  let product = 0;
  let x = a;
  let y = b;
  for (let i = 0; i < 8; i++) {
    if (y & 1) product ^= x;
    const highBit = x & 0x80;
    x = (x << 1) & 0xff;
    if (highBit) x ^= 0x1b;
    y >>= 1;
  }
  return product;
}

function gfInverse(a: number): number {
  if (a === 0) return 0;
  let result = 1;
  for (let i = 0; i < 254; i++) result = gfMultiply(result, a);
  return result;
}

function rotateByteLeft(value: number, bits: number): number {
  return ((value << bits) | (value >> (8 - bits))) & 0xff;
}

const SBOX = (() => {
  const sbox = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const inv = gfInverse(i);
    sbox[i] =
      (inv ^
        rotateByteLeft(inv, 1) ^
        rotateByteLeft(inv, 2) ^
        rotateByteLeft(inv, 3) ^
        rotateByteLeft(inv, 4) ^
        0x63) &
      0xff;
  }
  return sbox;
})();

interface AesKey {
  roundKeys: Uint8Array[];
  rounds: number;
}

function expandKey(key: Uint8Array): AesKey {
  const nk = key.length / 4;
  const rounds = nk + 6;
  const totalWords = 4 * (rounds + 1);
  const words: number[][] = [];
  for (let i = 0; i < nk; i++) {
    words.push([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]);
  }

  let rcon = 1;
  for (let i = nk; i < totalWords; i++) {
    let temp = [...words[i - 1]];
    if (i % nk === 0) {
      temp = [temp[1], temp[2], temp[3], temp[0]].map((b) => SBOX[b]);
      temp[0] ^= rcon;
      rcon = gfMultiply(rcon, 2);
    }
    const previous = words[i - nk];
    words.push([0, 1, 2, 3].map((j) => previous[j] ^ temp[j]));
  }

  const roundKeys: Uint8Array[] = [];
  for (let round = 0; round <= rounds; round++) {
    const roundKey = new Uint8Array(16);
    for (let word = 0; word < 4; word++) {
      const w = words[round * 4 + word];
      roundKey[4 * word] = w[0];
      roundKey[4 * word + 1] = w[1];
      roundKey[4 * word + 2] = w[2];
      roundKey[4 * word + 3] = w[3];
    }
    roundKeys.push(roundKey);
  }
  return { roundKeys, rounds };
}

function subBytes(state: Uint8Array): void {
  for (let i = 0; i < 16; i++) state[i] = SBOX[state[i]];
}

function shiftRows(state: Uint8Array): void {
  for (let row = 1; row < 4; row++) {
    const rowValues = [state[row], state[row + 4], state[row + 8], state[row + 12]];
    for (let column = 0; column < 4; column++) {
      state[row + 4 * column] = rowValues[(column + row) % 4];
    }
  }
}

function mixColumns(state: Uint8Array): void {
  for (let column = 0; column < 4; column++) {
    const offset = 4 * column;
    const a0 = state[offset];
    const a1 = state[offset + 1];
    const a2 = state[offset + 2];
    const a3 = state[offset + 3];
    state[offset] = gfMultiply(a0, 2) ^ gfMultiply(a1, 3) ^ a2 ^ a3;
    state[offset + 1] = a0 ^ gfMultiply(a1, 2) ^ gfMultiply(a2, 3) ^ a3;
    state[offset + 2] = a0 ^ a1 ^ gfMultiply(a2, 2) ^ gfMultiply(a3, 3);
    state[offset + 3] = gfMultiply(a0, 3) ^ a1 ^ a2 ^ gfMultiply(a3, 2);
  }
}

function encryptBlock(state: Uint8Array, key: AesKey): void {
  for (let i = 0; i < 16; i++) state[i] ^= key.roundKeys[0][i];
  for (let round = 1; round < key.rounds; round++) {
    subBytes(state);
    shiftRows(state);
    mixColumns(state);
    for (let i = 0; i < 16; i++) state[i] ^= key.roundKeys[round][i];
  }
  subBytes(state);
  shiftRows(state);
  for (let i = 0; i < 16; i++) state[i] ^= key.roundKeys[key.rounds][i];
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * AES-CFB-128 加密 Host
 */
function encryptVpnHost(host: string): string {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(KEY_AND_IV);
  const ivBytes = encoder.encode(KEY_AND_IV);

  let padded = host;
  if (host.length % 16 !== 0) {
    padded += '0'.repeat(16 - (host.length % 16));
  }
  const plainBytes = encoder.encode(padded);
  const cipherKey = expandKey(keyBytes);

  let iv = new Uint8Array(ivBytes);
  const encryptedBytes = new Uint8Array(plainBytes.length);

  for (let offset = 0; offset < plainBytes.length; offset += 16) {
    const blockIv = new Uint8Array(iv);
    encryptBlock(blockIv, cipherKey);
    for (let i = 0; i < 16; i++) {
      encryptedBytes[offset + i] = plainBytes[offset + i] ^ blockIv[i];
    }
    iv = encryptedBytes.slice(offset, offset + 16);
  }

  const ivHex = toHex(ivBytes);
  const encryptedHex = toHex(encryptedBytes).slice(0, host.length * 2);
  return ivHex + encryptedHex;
}

/**
 * 转换校内网址为 WebVPN 网址
 */
export function convertToWebVpnUrl(inputUrl: string): string {
  const trimmed = inputUrl.trim();
  if (!trimmed) return '';

  let url = trimmed;
  let protocol = 'http';
  const knownProto = ['http', 'https', 'ssh', 'vnc', 'telnet', 'rdp'];

  for (const proto of knownProto) {
    if (url.toLowerCase().startsWith(`${proto}://`)) {
      protocol = proto;
      url = url.slice(proto.length + 3);
      break;
    }
  }

  let v6 = '';
  const v6Match = url.match(/^\[[0-9a-fA-F:]+\]/);
  if (v6Match) {
    v6 = v6Match[0];
    url = url.slice(v6.length);
  }

  let port = '';
  const firstSlash = url.indexOf('/');
  let hostPart = firstSlash === -1 ? url : url.slice(0, firstSlash);
  const pathPart = firstSlash === -1 ? '' : url.slice(firstSlash);

  if (hostPart.includes(':')) {
    const parts = hostPart.split(':');
    hostPart = parts[0];
    port = parts[1];
  }

  const finalHost = v6 || hostPart;
  const encryptedHost = encryptVpnHost(finalHost);

  let resultPath = '';
  if (port) {
    resultPath = `/${protocol}-${port}/${encryptedHost}${pathPart}`;
  } else {
    resultPath = `/${protocol}/${encryptedHost}${pathPart}`;
  }

  return `https://${VPN_DOMAIN}${resultPath}`;
}
