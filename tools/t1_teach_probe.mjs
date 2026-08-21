// T1 — 「教える」切り出しを**実画素**で検証するオフライン・プローブ（2026-08-20 新設）
//
// ★なぜ要るか:
//   Claude はブラウザ画面を見られない（PHASE9_PLAN §10.1）。**合成フィクスチャだけで調整すると
//   実機で外す**——本 Phase で繰り返した失敗の型そのもの（実際、アトラスを2回作り直した）。
//   ∴ **ユーザーが保存した切り抜き PNG を Node で読み、同じ切り出しを再現して測る**経路を作る。
//
// 使い方:
//   node tools/t1_teach_probe.mjs [--dump 出力先] <png>=<数字> [<png>=<数字> ...]
//   例) node tools/t1_teach_probe.mjs --dump /tmp/out a.png=5,044,101 b.png=4,728,306
//
// 出すもの:
//   ①切り出しの寸法（送り幅・帯・比・格子の合致度）＝**教えるたびに揃うか**
//   ②**1枚を抜いて残りで読む**＝アトラスとして使えるかの本当の指標
//   ③`--dump` で**切り出し位置を描いた PNG**（人／Claude が目で確かめる）

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { decodePng, encodePng } from './lib/png.mjs';
import { luminanceField, edgeField, brightField, fitTaughtGrid, fieldScale, signature,
         packSignature, unpackSignature, classify, similarity,
         GLYPH_DEFAULTS } from '../src/transcribe/glyph.js';

const args = process.argv.slice(2);
let dump = null;
const items = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dump') { dump = args[++i]; continue; }
  // ★`.json`（ページの「この切り抜きをJSONで保存」）は**文字列を中に持っている**ので `=数字` は不要。
  const at = args[i].lastIndexOf('=');
  if (at < 0) { items.push({ file: args[i], text: null }); continue; }
  items.push({ file: args[i].slice(0, at), text: args[i].slice(at + 1) });
}
if (!items.length) { console.error('使い方: node tools/t1_teach_probe.mjs [--dump dir] <png>=<数字> ...'); process.exit(2); }
if (dump) mkdirSync(dump, { recursive: true });

/**
 * 切り抜きを読む。`.png` そのものと、ページが吐く `.json`（PNG を data URL で包んだもの）の両方。
 * ⚠ **JSON 経路が本命**＝PNG をチャットに貼ると「画像」になって画素が読めない（ユーザー報告）。
 */
function loadCrop(it) {
  const buf = readFileSync(it.file);
  if (buf[0] === 0x7b) {              // '{' で始まる＝JSON
    const j = JSON.parse(buf.toString('utf8'));
    const b64 = String(j.png ?? '').replace(/^data:image\/png;base64,/, '');
    if (!b64) throw new Error(`${it.file}: png フィールドが無い`);
    return { img: decodePng(Buffer.from(b64, 'base64')), text: it.text ?? j.text, meta: j };
  }
  if (!it.text) throw new Error(`${it.file}: PNG には <png>=<数字> の形で正解を付けてください`);
  return { img: decodePng(buf), text: it.text, meta: null };
}

const shots = [];
console.log('# 切り出しの寸法（教えるたびに揃うか）');
console.log('file'.padEnd(28), 'text'.padEnd(12), '画素'.padEnd(11), '送り幅'.padStart(7),
  '帯'.padStart(11), '比'.padStart(6), 'カンマ比'.padStart(8), '合致度'.padStart(7));
for (const it of items) {
  const loaded = loadCrop(it);
  const img = loaded.img;
  it.text = loaded.text;
  // ★**明るさの場**（production と同じ経路＝`main.js` の「教える」もこれ）
  const edge = brightField(img);
  const fit = fitTaughtGrid(edge, { x: 0, y: 0, w: img.width, h: img.height }, it.text);
  if (!fit.ok) { console.log(basename(it.file).padEnd(28), '格子を当てられない:', fit.reason); continue; }
  const bandH = fit.band.to - fit.band.from;
  const scale = fieldScale(edge, { from: fit.band.from, to: fit.band.to });
  const sigs = fit.boxes.map((b) => ({ ch: b.ch, sig: packSignature(signature(edge, b, { scale })), box: b }));
  shots.push({ ...it, img, edge, fit, sigs, bandH });
  console.log(basename(it.file).padEnd(28), it.text.padEnd(12),
    `${img.width}×${img.height}`.padEnd(11),
    fit.pitch.toFixed(1).padStart(7),
    `${fit.band.from}〜${fit.band.to}`.padStart(11),
    (bandH / fit.pitch).toFixed(3).padStart(6),
    fit.commaRatio.toFixed(2).padStart(8),
    fit.contrast.toFixed(3).padStart(7));

  if (dump) {
    // ★切り出し位置を描いた PNG（帯＝緑・数字＝水色・カンマ＝橙）
    const o = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
    const px = (x, y, c) => {
      if (x < 0 || y < 0 || x >= o.width || y >= o.height) return;
      const i = (y * o.width + x) * 4; o.data[i] = c[0]; o.data[i + 1] = c[1]; o.data[i + 2] = c[2];
    };
    for (let x = 0; x < o.width; x++) { px(x, fit.band.from, [0, 255, 80]); px(x, fit.band.to - 1, [0, 255, 80]); }
    for (const b of fit.boxes) {
      const c = b.ch === ',' ? [255, 160, 0] : [0, 220, 255];
      for (let y = Math.max(0, b.y); y < Math.min(o.height, b.y + b.h); y++) {
        px(Math.round(b.x), y, c); px(Math.round(b.x + b.w) - 1, y, c);
      }
    }
    writeFileSync(join(dump, basename(it.file).replace(/\.png$/i, '') + '_fit.png'), encodePng(o));
  }
}

if (shots.length >= 2) {
  const rs = shots.map((s) => s.bandH / s.fit.pitch);
  console.log(`\n★「字高/送り幅」の比: ${Math.min(...rs).toFixed(3)}〜${Math.max(...rs).toFixed(3)}`
    + `（フォントは固定なので**定数のはず**。ばらつく＝縦の切り出しが安定していない）`);

  // ── ②1枚を抜いて残りで読む（アトラスとして使えるかの本当の指標）────
  console.log('\n# 1枚を抜いて残りで読む');
  let ok = 0, amb = 0, ng = 0, tot = 0;
  const conf = {};
  for (let out = 0; out < shots.length; out++) {
    const glyphs = {};
    shots.forEach((s, i) => { if (i !== out) for (const g of s.sigs) (glyphs[g.ch] ||= []).push(g.sig); });
    const read = shots[out].sigs.map((g) => {
      if (!glyphs[g.ch]) return '·';
      tot++;
      const c = classify(unpackSignature(g.sig, GLYPH_DEFAULTS.cell), { cell: GLYPH_DEFAULTS.cell, glyphs });
      if (!c.best) return '?';
      if (c.best.key !== g.ch) { ng++; const k = `${g.ch}→${c.best.key}`; conf[k] = (conf[k] ?? 0) + 1; return c.best.key; }
      if (c.ambiguous) { amb++; return '?'; }
      ok++; return c.best.key;
    }).join('');
    console.log(`  ${basename(shots[out].file).padEnd(28)} 正解 ${shots[out].text.padEnd(12)} → 読み ${read}`);
  }
  console.log(`  ★合計: 正 ${ok} / 曖昧 ${amb} / 誤 ${ng}（計 ${tot}）  取り違え ${JSON.stringify(conf)}`);

  // ── ③同じ字どうし / 別の字どうしの類似度（順序が逆転していないか）──
  const byCh = {};
  shots.forEach((s, i) => s.sigs.forEach((g) => (byCh[g.ch] ||= []).push({ i, d: unpackSignature(g.sig, GLYPH_DEFAULTS.cell).data })));
  let sameMin = 1, diffMax = 0;
  for (const [ch, list] of Object.entries(byCh)) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      if (list[a].i === list[b].i) continue;          // 同じ切り抜きの中は数えない
      sameMin = Math.min(sameMin, similarity(list[a].d, list[b].d));
    }
  }
  const chs = Object.keys(byCh);
  for (let a = 0; a < chs.length; a++) for (let b = a + 1; b < chs.length; b++) {
    for (const x of byCh[chs[a]]) for (const y of byCh[chs[b]]) diffMax = Math.max(diffMax, similarity(x.d, y.d));
  }
  console.log(`\n★類似度: 同じ字どうし min ${sameMin.toFixed(3)} / 別の字どうし max ${diffMax.toFixed(3)}`
    + `  → ${sameMin > diffMax ? '✅ 順序は正しい' : '❌ **順序が逆転**（この状態では何を教えても混ざる）'}`);
}
