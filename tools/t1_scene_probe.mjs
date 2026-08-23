#!/usr/bin/env node
// T1 シーン・プローブ — ★**ラベル検出 → マスク → 読み取り**を実走フレームで測る（Phase 9 P3-1b の残り）
//
// ★答える問い: 「**ラベルをマスクすると、数字の誤読は実際に減るのか**」。
//   ⚠ これは**仮説であって実測ではない**（合成では [16-4] で良くなることを確かめたが、実機では未測定）。
//     本 Phase で合成が実機を裏切った型は 3 つある＝**実データで測るまで「効く」と言わない**。
//
// ★入力＝ページの「★ダメージ枠をJSONで保存」が吐く `kind: 'scene-frame'`。
//   ⚠ **数値だけ／ラベルだけの切り抜きでは測れない**＝ラベルは数値の**真上**に出る（P1 発見①）ので、
//     位置関係が保たれた**枠まるごと1枚**でないと、この工程を1行も検証できない。
//
// 使い方:
//   node tools/t1_scene_probe.mjs <scene_dmg_*.json> ...
//   node tools/t1_scene_probe.mjs --atlas tools/fixtures/t1_glyph_atlas_M3-1.json <scene>.json

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { decodePng } from './lib/png.mjs';
import { glyphMask, readScene, checkCommaGrammar, LABEL_KEYS, GLYPH_DEFAULTS } from '../src/transcribe/glyph.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let atlasPath = join(HERE, 'fixtures/t1_glyph_atlas_M3-1.json');
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--atlas') { atlasPath = args[++i]; continue; }
  files.push(args[i]);
}
if (!files.length) {
  console.error('使い方: node tools/t1_scene_probe.mjs [--atlas <path>] <scene_dmg_*.json> ...');
  console.error('  ページの「★ダメージ枠をJSONで保存」が吐く JSON を渡す（kind: scene-frame）。');
  process.exit(2);
}

const atlas = JSON.parse(readFileSync(atlasPath, 'utf8'));
const labelKeys = Object.keys(atlas.labels ?? {});
console.log(`アトラス: ${basename(atlasPath)}`
  + ` ／ 数字 ${Object.keys(atlas.glyphs ?? {}).length} 字`
  + ` ／ ラベル ${labelKeys.length ? labelKeys.join(' ') : '未登録'}`);
if (!labelKeys.length) {
  console.log('⚠ ラベルのテンプレが無い＝マスクの効果は測れない（検出は空を返す）。');
}

let totBare = 0, totMasked = 0, totTruth = 0, framesWithTruth = 0;
for (const f of files) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  if (j.kind !== 'scene-frame') {
    console.log(`\n${basename(f)}: ⚠ kind が '${j.kind}'＝このプローブは 'scene-frame' を読む（枠まるごとの1枚）`);
    continue;
  }
  const img = decodePng(Buffer.from(String(j.png).replace(/^data:image\/png;base64,/, ''), 'base64'));
  const edge = glyphMask(img);
  const sc = readScene(edge, atlas);

  console.log(`\n${'='.repeat(70)}\n${basename(f)}  ${img.width}×${img.height}  t=${j.at}s`);
  console.log(`  行の候補 ${sc.rows.length} 本 ／ ラベル検出 ${sc.labels.length} 件`
    + (sc.reason ? `（${sc.reason}）` : ''));
  for (const L of sc.labels) {
    console.log(`    ラベル ${L.key.padEnd(10)} score ${L.score.toFixed(3)}`
      + `  箱 x${Math.round(L.rect.x)} y${Math.round(L.rect.y)} ${Math.round(L.rect.w)}×${Math.round(L.rect.h)}`
      + `  → 行 #${L.anchor}`);
  }

  // ★真値（人の観測）＝これが無いと「誤読が減ったか」は測れない
  const truth = (j.truth ?? []).filter((t) => checkCommaGrammar(t).ok).map((t) => t.replace(/,/g, ''));
  const pool = (list) => { const m = new Map(); for (const v of list) m.set(v, (m.get(v) ?? 0) + 1); return m; };
  const hit = (reads) => {
    const left = pool(truth);
    let n = 0;
    for (const r of reads) { const k = String(r); if (left.get(k) > 0) { left.set(k, left.get(k) - 1); n++; } }
    return n;
  };
  const bareReads = sc.readings.filter((r) => r.bare.number.ok).map((r) => r.bare.number.value);
  const maskReads = sc.readings.filter((r) => r.masked?.number.ok).map((r) => r.masked.number.value);

  console.log(`  読み（マスク無し）: ${bareReads.length ? bareReads.join(' ') : '（読めた行なし）'}`);
  console.log(`  読み（マスク有り）: ${sc.occluders.length ? (maskReads.length ? maskReads.join(' ') : '（読めた行なし）') : '—（ラベル未検出）'}`);

  if (!truth.length) {
    console.log('  ⚠ 真値が入っていない＝**誤読が減ったかは測れない**（保存時に「見えている数値」を入れる）');
    continue;
  }
  framesWithTruth++;
  const b = hit(bareReads), m = sc.occluders.length ? hit(maskReads) : b;
  totTruth += truth.length; totBare += b; totMasked += m;
  console.log(`  真値 ${truth.length} 件 → 一致: マスク無し ${b} / マスク有り ${m}`
    + (sc.occluders.length ? (m > b ? '  ★マスクが効いた' : m < b ? '  ⚠ マスクで悪化' : '  = 変わらず') : ''));
}

if (framesWithTruth) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`★合計（真値のあるフレーム ${framesWithTruth} 枚・真値 ${totTruth} 件）`);
  console.log(`  マスク無し ${totBare} 一致 ／ マスク有り ${totMasked} 一致`);
  console.log(totMasked === totBare
    ? '  ⚠ 差が無い＝**マスクの効果は実機で確認できていない**（合成の [16-4] は実機の証明ではない）'
    : totMasked > totBare ? '  ★マスクが効いている（実測）' : '  ⚠ マスクで悪化＝設計を見直す');
}
