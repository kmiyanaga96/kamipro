// 最小の PNG デコーダ（Node 標準の zlib だけ・依存なし）。
//
// ★なぜ要るか（2026-08-20）:
//   Claude はブラウザ画面を見られない（PHASE9_PLAN §10.1）。**実画素で検証する唯一の経路**が
//   「ユーザーが保存した切り抜き PNG を Node で読む」こと。ここが無いと、
//   **合成フィクスチャだけで調整して実機で外す**（本 Phase で繰り返した失敗の型）。
// ⚠ 対応範囲は**8bit・非インターレース・グレー/RGB/パレット/アルファ**のみ（ブラウザが吐く PNG は全部これ）。
//   16bit とインターレースは**黙って壊さず、明示的に投げる**。

import { inflateSync, deflateSync } from 'node:zlib';

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
};

/**
 * PNG を ImageData 互換（RGBA）へ。
 * @returns {{width:number,height:number,data:Uint8ClampedArray}}
 */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG ではない');
  let pos = 8, width = 0, height = 0, depth = 0, color = 0, interlace = 0;
  const idat = [];
  let palette = null, trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; color = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`bit depth ${depth} は未対応（8 のみ）`);
  if (interlace) throw new Error('インターレース PNG は未対応');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!channels) throw new Error(`color type ${color} は未対応`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;                      // 8bit なので1画素 = channels バイト
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const x = line[i];
      cur[i] = filter === 0 ? x
        : filter === 1 ? (x + a) & 255
        : filter === 2 ? (x + b) & 255
        : filter === 3 ? (x + ((a + b) >> 1)) & 255
        : (x + paeth(a, b, c)) & 255;
    }
    prev = cur;
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp, d = i * 4;
    if (color === 0) { rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s]; rgba[d + 3] = 255; }
    else if (color === 2) { rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2]; rgba[d + 3] = 255; }
    else if (color === 3) {
      const p = out[s] * 3;
      rgba[d] = palette[p]; rgba[d + 1] = palette[p + 1]; rgba[d + 2] = palette[p + 2];
      rgba[d + 3] = trns && out[s] < trns.length ? trns[out[s]] : 255;
    } else if (color === 4) { rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s]; rgba[d + 3] = out[s + 1]; }
    else { rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2]; rgba[d + 3] = out[s + 3]; }
  }
  return { width, height, data: rgba };
}

/**
 * RGBA を PNG へ（filter 0・無圧縮寄り）。★診断画像を Node から書き出すために使う。
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 */
export function encodePng(img) {
  const { width, height, data } = img;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4)
      .copy(raw, y * (width * 4 + 1) + 1);
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}
