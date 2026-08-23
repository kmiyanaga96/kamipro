// T1 — 「教える」切り出しを**実画素**で検証するオフライン・プローブ（2026-08-20 新設）
//
// ★なぜ要るか:
//   Claude はブラウザ画面を見られない（PHASE9_PLAN §10.1）。**合成フィクスチャだけで調整すると
//   実機で外す**——本 Phase で繰り返した失敗の型そのもの（実際、アトラスを2回作り直した）。
//   ∴ **ユーザーが保存した切り抜き PNG を Node で読み、同じ切り出しを再現して測る**経路を作る。
//
// 使い方:
//   node tools/t1_teach_probe.mjs [--dump 出力先] [--atlas 出力.json] [--merge 既存.json] [--source 由来] <切り抜き> ...
//   例) node tools/t1_teach_probe.mjs --dump /tmp/out a.png=5,044,101 b.png=4,728,306
//   例) node tools/t1_teach_probe.mjs --atlas tools/fixtures/t1_glyph_atlas_M3-1.json \
//         --source 'M3-1.mp4 の教え切り抜き（ユーザー提供）' /path/teach_*.json
//
// 出すもの:
//   ①切り出しの寸法（送り幅・帯・比・格子の合致度）＝**教えるたびに揃うか**
//   ②**1枚を抜いて残りで読む**＝アトラスとして使えるかの本当の指標
//   ③`--dump` で**切り出し位置を描いた PNG**（人／Claude が目で確かめる）
//   ④`--atlas` で**リポジトリに置けるフィクスチャ**（署名の数値だけ＝画像ではない・PHASE9_PLAN §10.3 の例外）
//   ⑤`--merge 既存.json` で**既存アトラスへ差し替えマージ**（下記）
//
// ★★`--merge` がなぜ要るか（2026-08-23）:
//   アトラスは**切り抜きから毎回作り直す**設計だが、**過去の切り抜きは手元に残らない**
//   （チャットで受け取るだけ＝リポジトリには署名しか入らない＝§10.3）。
//   ∴ 「14枚のうち2枚を囲み直した」ときに**全14枚を再送してもらう**のは筋が悪い。
//   ★∴ **同じ表示（`text` が一致）の教示回を、新しい切り抜きで置き換える**＝
//     `tools/README.md` §4 の運用規則「**同じ表示が複数あれば、囲みの狭い方（後から届いた方）を採る**」の機械化。
//   ⚠ 置き換えの単位は**教示回まるごと**（その回の全字）＝字単位で混ぜない（どの回由来かが追えなくなる）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { decodePng, encodePng } from './lib/png.mjs';
import { luminanceField, edgeField, brightField, glyphMask, fitTaughtGrid, fieldScale, signature,
         packSignature, unpackSignature, classify, similarity,
         validateAtlas, leaveOneTeachingOut,
         teachLabel, checkCropFraming, LABEL_KEYS, LABEL_DEFAULTS,
         GLYPH_DEFAULTS } from '../src/transcribe/glyph.js';

const args = process.argv.slice(2);
let dump = null;
let atlasOut = null;
let mergeIn = null;
let ATLAS_SOURCE = '（--source 未指定）';
const TOOL_VERSION = '0.36.0';   // ★`src/transcribe/main.js` の VERSION と揃える（教え方が変わったら上げる）
const items = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dump') { dump = args[++i]; continue; }
  if (args[i] === '--atlas') { atlasOut = args[++i]; continue; }
  if (args[i] === '--merge') { mergeIn = args[++i]; continue; }
  if (args[i] === '--source') { ATLAS_SOURCE = args[++i]; continue; }
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
    return { img: decodePng(Buffer.from(b64, 'base64')), text: it.text ?? j.text, meta: j };  // meta.kind で数字/ラベルを分ける
  }
  if (!it.text) throw new Error(`${it.file}: PNG には <png>=<数字> の形で正解を付けてください`);
  return { img: decodePng(buf), text: it.text, meta: null };
}

const shots = [];
const labelShots = [];   // ★ラベル（`kind: 'teach-label'`）＝**1文字ずつに割らない**
console.log('# 切り出しの寸法（教えるたびに揃うか）');
console.log('file'.padEnd(28), 'text'.padEnd(12), '画素'.padEnd(11), '送り幅'.padStart(7),
  '帯'.padStart(11), '比'.padStart(6), 'カンマ比'.padStart(8), '合致度'.padStart(7));
for (const it of items) {
  const loaded = loadCrop(it);
  const img = loaded.img;
  it.text = loaded.text;
  // ★production と同じ経路（`main.js` の「教える」もこれ）
  const edge = glyphMask(img);

  // ── ★ラベルは語まるごと1枚＝格子を当てない（数字の経路へ入れない）──
  if (loaded.meta?.kind === 'teach-label') {
    const key = loaded.meta.label ?? loaded.text;
    if (!LABEL_KEYS.includes(key)) {
      console.log(basename(it.file).padEnd(28), `⚠ 未知のラベル「${key}」＝`
        + `正準キーは ${LABEL_KEYS.join(' / ')}（glyph.js LABEL_KEYS に足すか、綴りを直す）`);
      continue;
    }
    const entry = teachLabel(edge, { x: 0, y: 0, w: img.width, h: img.height }, key,
      { at: loaded.meta?.at ?? null, cell: LABEL_DEFAULTS.cell });
    const fr = checkCropFraming(edge);
    labelShots.push({ file: it.file, key, entry, framing: fr, img, meta: loaded.meta });
    console.log(basename(it.file).padEnd(28), `[ラベル] ${key}`.padEnd(12),
      `${img.width}×${img.height}`.padEnd(11), `縦横比 ${entry.aspect.toFixed(2)}`.padStart(14),
      fr.ok ? '  囲み OK' : `  ⚠ ${fr.reason}`);
    continue;
  }

  const fit = fitTaughtGrid(edge, { x: 0, y: 0, w: img.width, h: img.height }, it.text);
  if (!fit.ok) { console.log(basename(it.file).padEnd(28), '格子を当てられない:', fit.reason); continue; }
  const bandH = fit.band.to - fit.band.from;
  const scale = fieldScale(edge, { from: fit.band.from, to: fit.band.to });
  // ⚠ **カンマはテンプレートにしない**（production と同じ＝セルの8割が背景・桁区切りは文法で決まる）
  const sigs = fit.boxes.filter((b) => b.ch !== ',')
    .map((b) => ({ ch: b.ch, sig: packSignature(signature(edge, b, { scale })), box: b }));
  const framing = checkCropFraming(edge);
  shots.push({ ...it, img, edge, fit, sigs, bandH, meta: loaded.meta, framing });
  console.log(basename(it.file).padEnd(28), it.text.padEnd(12),
    `${img.width}×${img.height}`.padEnd(11),
    fit.pitch.toFixed(1).padStart(7),
    `${fit.band.from}〜${fit.band.to}`.padStart(11),
    (bandH / fit.pitch).toFixed(3).padStart(6),
    fit.commaRatio.toFixed(2).padStart(8),
    (fit.contrast == null ? '—' : fit.contrast.toFixed(3)).padStart(7));
  // ★★**囲みが字を切っていないか**（2026-08-23 新設・§checkCropFraming の注記）
  if (!framing.ok) console.log(' '.repeat(28), `⚠ ${framing.reason}`);

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
  // ⚠ **これはずらしを許さない生の類似度**（照合は `GLYPH_DEFAULTS.shift` の範囲でずらす）＝
  //   実画素では同じ字が横に 1〜3 格子ずれるので、この行は**低く出るのが正常**。
  //   判断に使うのは上の「1枚を抜いて残りで読む」。
  console.log(`\n（参考）ずらさない類似度: 同じ字どうし min ${sameMin.toFixed(3)} / 別の字どうし max ${diffMax.toFixed(3)}`
    + `  ⚠ 照合は ±${GLYPH_DEFAULTS.shift.x} 格子ずらして最良を採るので、ここは低くてよい`);
}

// ── ④`--atlas <path>` でフィクスチャを書き出す ───────────────────────
//   ⚠⚠ **これが無くて事故りかけた**（2026-08-22）: 初版のフィクスチャは `/tmp` の使い捨てスクリプトで
//   作っており、**次のセッションでは再現できない**状態だった＝本 Phase の教訓
//   「**検査できない場所にだけ事故が起きる**」そのもの。∴ 生成経路をツールへ入れる。
//   ★出すのは**署名の数値だけ**（画像は入らない＝PHASE9_PLAN §10.3 の例外）。
// ★★囲みが字を切っている切り抜きは**アトラスに入れない**（`--allow-clipped` で明示的に許可）。
//   ⚠ ここを素通りさせると「囲みが原因の誤読」が**アトラスに焼き付いて**、以後ずっと効く。
//   ⚠ ユーザーのページ側は**警告に留める**（教える手を止めない）＝止めるのは台帳へ入る手前のここ。
if (atlasOut) {
  const clipped = [...shots, ...labelShots].filter((x) => x.framing && !x.framing.ok);
  if (clipped.length && !args.includes('--allow-clipped')) {
    console.error(`\n❌ 囲みが字を切っている切り抜きが ${clipped.length} 件＝アトラスに入れない:`);
    for (const c of clipped) console.error(`   - ${basename(c.file)}: ${c.framing.reason}`);
    console.error('   → 囲み直してもらう（「余白ゼロ」ではなく「字を切らない最小の枠」）。'
      + '意図して入れるなら --allow-clipped。');
    process.exit(3);
  }
}

if (atlasOut && shots.length) {
  // ── 教示回の並びを作る（`--merge` なら既存を土台に、同じ表示だけ差し替える）──
  const fresh = shots.map((s) => ({
    kind: 'new', text: s.text, at: s.meta?.at ?? null, crop: basename(s.file),
    sigs: s.sigs.map((g) => ({ ch: g.ch, sig: g.sig })),
    rec: { at: s.meta?.at ?? null, text: s.text, pitch: +s.fit.pitch.toFixed(1), bandH: s.bandH,
           ratio: +(s.bandH / s.fit.pitch).toFixed(3), size: `${s.img.width}x${s.img.height}` },
  }));
  let units = fresh, replaced = [], base = null;
  if (mergeIn) {
    base = JSON.parse(readFileSync(mergeIn, 'utf8'));
    const oldTeach = base.provenance?.teachings ?? [];
    const oldCrops = base.provenance?.crops ?? [];
    // ★正規化して突き合わせる（`5,553,703` と `5553703` を同じ表示とみなす）
    const norm = (t) => String(t ?? '').replace(/[^0-9]/g, '');
    const incoming = new Set(fresh.map((f) => norm(f.text)));
    const kept = [];
    oldTeach.forEach((t, i) => {
      if (incoming.has(norm(t.text))) { replaced.push(`${t.text}（${t.size ?? '?'}）`); return; }
      kept.push({ kind: 'kept', text: t.text, at: t.at, crop: oldCrops[i] ?? `(ti${t.ti})`,
                  sigs: (base.samples ?? []).filter((x) => x.ti === t.ti).map((x) => ({ ch: x.ch, sig: x.sig })),
                  rec: { ...t } });
    });
    const missing = kept.filter((k) => !k.sigs.length);
    if (missing.length) {
      console.error(`⚠ 既存アトラスに標本が無い教示回が ${missing.length} 件＝マージできない（署名が欠けている）`);
      process.exit(2);
    }
    units = [...kept, ...fresh];
  }

  const glyphs = {}, samples = [], teachings = [];
  units.forEach((u, ti) => {
    for (const g of u.sigs) { (glyphs[g.ch] ||= []).push(g.sig); samples.push({ ch: g.ch, ti, sig: g.sig }); }
    const { ti: _drop, ...rest } = u.rec;
    teachings.push({ ti, ...rest });
  });
  const atlas = {
    version: 1, cell: { ...GLYPH_DEFAULTS.cell }, glyphs,
    // ⚠⚠ **`labels` は「ラベル（語）のテンプレート表」**（`detectLabels` が読む形）。
    //   旧版はここに**数字キーの配列**を書いていたが、`glyphs` と重複するうえに
    //   `detectLabels` が読む `labels` と**意味が衝突**していた（2026-08-23 に統一）。
    labels: {},
    provenance: { tool: 'T1', toolVersion: TOOL_VERSION,
                  builtBy: `tools/t1_teach_probe.mjs --atlas${mergeIn ? ' --merge' : ''}`,
                  builtAt: new Date().toISOString(), source: ATLAS_SOURCE,
                  ...(mergeIn ? { mergedFrom: basename(mergeIn), replacedDisplays: replaced } : {}),
                  crops: units.map((u) => u.crop), teachings },
    metrics: { commaRatio: GLYPH_DEFAULTS.commaRatio },
    samples,
  };
  // ★ラベル（語まるごと）＝既存があれば引き継ぎ、新しく教わったものを足す
  const labelsOut = {};
  const carried = base?.labels;
  if (carried && !Array.isArray(carried)) for (const [k, v] of Object.entries(carried)) labelsOut[k] = { ...v };
  for (const L of labelShots) {
    (labelsOut[L.key] ||= { aspect: L.entry.aspect, variants: [] }).variants.push(L.entry.sig);
  }
  atlas.labels = labelsOut;
  if (Object.keys(labelsOut).length) atlas.provenance.labelCell = { ...LABEL_DEFAULTS.cell };
  const v = validateAtlas(atlas);
  const loto = leaveOneTeachingOut(samples, atlas.cell);
  writeFileSync(atlasOut, JSON.stringify(atlas));
  console.log(`\n# アトラスを書き出した → ${atlasOut}`);
  if (mergeIn) {
    console.log(`  マージ元 ${basename(mergeIn)}`
      + ` ／ 差し替えた表示 ${replaced.length ? replaced.join(' / ') : '（なし＝新規追加のみ）'}`);
  }
  if (Object.keys(atlas.labels).length) {
    console.log(`  ラベル ${Object.entries(atlas.labels).map(([k, v]) => `${k}×${v.variants.length}`).join(' ')}`
      + ` ／ 未登録 ${LABEL_KEYS.filter((k) => !atlas.labels[k]).join(' / ') || '（なし）'}`);
  } else {
    console.log(`  ラベル 未登録（${LABEL_KEYS.join(' / ')}）＝検算④とマスクはまだ動かない`);
  }
  console.log(`  教示回 ${teachings.length} ／ 標本 ${samples.length}`
    + ` ／ 字ごと ${Object.entries(glyphs).sort().map(([k, v2]) => `${k}×${v2.length}`).join(' ')}`);
  console.log(`  validateAtlas: ${v.ok}${v.ok ? '' : ' — ' + JSON.stringify(v.problems)}`);
  console.log(`  ★教示回抜き: 正 ${loto.correct} / 曖昧 ${loto.ambiguous} / 誤 ${loto.wrong}`
    + `（計 ${loto.total}） ${JSON.stringify(loto.confusions)}`);
  console.log('  ⚠ `tools/t1_selftest.mjs` [16-15] の閾値を、この実測へ**締め直す**（緩めない）。');
}
