#!/usr/bin/env node
// T1 検算プローブ — ★**検算⑦（TOTAL 突合）が実データの誤読を直せるか**をオフラインで測る（Phase 9 P3-1b）
//
// ⚠ P3-1 の教訓「**使い捨てスクリプトは次のセッションで作り直せない**」＝再現できる形で置く。
//
// ★測り方（何が実データで、何が組み立てか）:
//   | 部分 | 出どころ |
//   |---|---|
//   | グリフの署名・誤読の起き方 | ★**実データ**（`tools/fixtures/t1_glyph_atlas_M3-1.json` の 101点・14回） |
//   | 「読む」手続き | ★**実装そのもの**（`classify` を教示回ごと leave-one-out で回す） |
//   | ヒットの束ね方と `TOTAL` | ⚠ **こちらで組み立てる**（k 枚を1押下と見なし、TOTAL＝真値の和） |
//   ∴ 本プローブが答えるのは「**同じ誤読パターンに TOTAL を与えたら直るか**」であって、
//     「実機の TOTAL 表示が読めるか」ではない（後者は👤ラベル受領後の P3-1b 後半）。
//   ⚠ 前提＝**TOTAL 自身は正しく読めている**（`reconcileWithTotal` の注記と同じ）。
//
// 使い方:
//   node tools/t1_verify_probe.mjs [--k 2,3,4] [--swaps 2] [--json]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as G from '../src/transcribe/glyph.js';
import * as V from '../src/transcribe/verify.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const IS_CLI = process.argv[1] && process.argv[1].endsWith('t1_verify_probe.mjs');
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const KS = String(arg('k', '2,3,4')).split(',').map(Number).filter(Boolean);
// ★既定は**実装から読む**（同じ値を2箇所に書かない＝REPO_STANDARDS）
const ACCEPT = Number(arg('accept', V.VERIFY_DEFAULTS.acceptSwaps));
const SEARCH = Number(arg('search', V.VERIFY_DEFAULTS.searchSwaps));
const AS_JSON = argv.includes('--json');

/**
 * ★**計測本体**（CLI からもセルフテストからも同じものを呼ぶ＝同じ処理を2箇所に書かない）。
 * @param {{ks:Array<number>, acceptSwaps:number, searchSwaps:number}} opt
 */
export function measure({ ks = [2, 3], acceptSwaps = V.VERIFY_DEFAULTS.acceptSwaps,
                          searchSwaps = V.VERIFY_DEFAULTS.searchSwaps } = {}) {
const fx = JSON.parse(readFileSync(join(HERE, 'fixtures/t1_glyph_atlas_M3-1.json'), 'utf8'));
const cell = fx.cell;

// ── 1. 教示回ごとに leave-one-out で読む（実装そのものを通す）──────────
const groups = [...new Set(fx.samples.map((s) => s.ti))].sort((a, b) => a - b);
const rows = [];
for (const g of groups) {
  const glyphs = {};
  for (const s of fx.samples) if (s.ti !== g) (glyphs[s.ch] ||= []).push(s.sig);
  const mine = fx.samples.filter((s) => s.ti === g);
  const tokens = mine.map((s) => {
    const c = G.classify(G.unpackSignature(s.sig, cell), { cell, glyphs });
    const accepted = !!c.best && c.best.score >= G.GLYPH_DEFAULTS.minScore
      && !(G.GLYPH_DEFAULTS.rejectAmbiguous && c.ambiguous);
    return { truth: s.ch, key: accepted ? c.best.key : '?', score: c.best?.score ?? 0,
             ambiguous: !!c.ambiguous, accepted, candidates: c.candidates ?? [] };
  });
  const truth = mine.map((s) => s.ch).join('');
  const read = tokens.map((t) => (/^[0-9]$/.test(t.key) ? t.key : (t.candidates[0]?.key ?? '?'))).join('');
  rows.push({ ti: g, tokens, truth, truthValue: Number(truth), read, readValue: Number(read),
              wrong: 0,   // ★下で read と truth の差で数える（`?` の落ち先も誤りに数える）
              unread: tokens.filter((t) => t.key === '?').length });
  const last = rows[rows.length - 1];
  last.wrong = [...last.truth].filter((c, i) => c !== last.read[i]).length;
}

// ── 2. まず1枚単位の現状（P3-1 の関門と同じ土俵）──────────────────
const base = {
  crops: rows.length,
  glyphs: rows.reduce((a, r) => a + r.tokens.length, 0),
  wrongGlyphs: rows.reduce((a, r) => a + r.wrong, 0),
  cropsExact: rows.filter((r) => r.read === r.truth).length,
  cropsBroken: rows.filter((r) => r.read !== r.truth).map((r) => `${r.truth}→${r.read}`),
};

// ── 3. k枚を1押下と見なして TOTAL 突合をかける ───────────────────
//   ★**全組合せ**を回す（都合の良い並びを選ばない）。
const combos = (arr, k) => (k === 0 ? [[]] : arr.flatMap((v, i) => combos(arr.slice(i + 1), k - 1).map((c) => [v, ...c])));

const DUMP = [];
const results = [];
for (const k of ks) {
  const stat = { k, groups: 0, cleanBaseline: 0, dirty: 0,
                 detected: 0, silent: 0,
                 fixed: 0, falseFix: 0, brokeClean: 0, ambiguousFix: 0, noFix: 0, examinedMax: 0 };
  for (const combo of combos(rows, k)) {
    stat.groups++;
    const total = combo.reduce((a, r) => a + r.truthValue, 0);
    const rec = V.reconcileWithTotal(combo.map((r) => ({ tokens: r.tokens })), total, { acceptSwaps, searchSwaps });
    stat.examinedMax = Math.max(stat.examinedMax, rec.examined);
    const dirty = combo.some((r) => r.read !== r.truth);
    if (!dirty) {
      // ★**汚れていない束**も回す＝「合っているものを壊さないか」を測る（偽陽性の側）
      stat.cleanBaseline++;
      if (!(rec.ok && rec.baseline.residual === 0)) { stat.brokeClean++; DUMP.push({ k, kind: 'clean', combo, rec }); }
      continue;
    }
    stat.dirty++;
    // ★★検出＝残差が 0 でない（＝人に「ここは怪しい」と言える）。
    //   ⚠ **見逃し**＝誤読があるのに残差 0＝**打ち消し合い**（本プローブが見つけた事故の機構）。
    if (rec.baseline.residual !== 0) stat.detected++; else stat.silent++;
    if (!rec.ok) { (rec.solutions.length > 1 ? stat.ambiguousFix++ : stat.noFix++); continue; }
    const got = rec.solutions[0].rows.map((x) => x.text).join('+');
    const want = combo.map((r) => r.truth).join('+');
    if (got === want) stat.fixed++; else { stat.falseFix++; DUMP.push({ k, kind: 'false', combo, rec, want, got }); }
  }
  results.push(stat);
}

return { base, results, dump: DUMP, acceptSwaps, searchSwaps };
}

// ─────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────
if (!IS_CLI) { /* import されたときは何も出力しない */ } else {
const { base, results, dump: DUMP } = measure({ ks: KS, acceptSwaps: ACCEPT, searchSwaps: SEARCH });
if (AS_JSON) { console.log(JSON.stringify({ base, results, acceptSwaps: ACCEPT, searchSwaps: SEARCH }, null, 2)); process.exit(0); }

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—');
console.log('T1 検算プローブ — 検算⑦（TOTAL 突合）の効き目');
console.log('='.repeat(64));
console.log(`元データ: ${base.crops} 枚 / ${base.glyphs} 文字（実データ・教示回ごと leave-one-out）`);
console.log(`  誤読 ${base.wrongGlyphs} 文字 ／ **完全に読めた切り抜き ${base.cropsExact}/${base.crops}**`);
for (const b of base.cropsBroken) console.log(`  ✗ ${b}`);
console.log(`\n採用 ≤${ACCEPT} 文字 / 探索 ≤${SEARCH} 文字（★深く探して、浅い解だけ採る）`);
console.log('-'.repeat(64));
console.log('★検出（誤読を含む束のうち、残差≠0 で気づけた割合）');
for (const r of results) {
  console.log(`  k=${r.k}  誤読束 ${r.dirty}  → 検出 ${r.detected}（${pct(r.detected, r.dirty)}）`
    + `  ★見逃し ${r.silent}（打ち消し合い）`);
}
console.log('-'.repeat(64));
console.log('★訂正（検出したあと、候補の中から真の読みを一意に取り出せたか）');
console.log('  k  束の数  誤読を含む  ★直った  ★★偽の訂正  一意でない  直せない');
for (const r of results) {
  console.log(`  ${String(r.k).padStart(2)}  ${String(r.groups).padStart(6)}  ${String(r.dirty).padStart(10)}`
    + `  ${String(r.fixed).padStart(7)}  ${String(r.falseFix).padStart(11)}  ${String(r.ambiguousFix).padStart(10)}`
    + `  ${String(r.noFix).padStart(8)}   （直った率 ${pct(r.fixed, r.dirty)}）`);
}
console.log('-'.repeat(64));
console.log('★★「偽の訂正」＝ TOTAL に一意に一致したのに真値と違う＝**静かに較正を汚す唯一の型**。');
console.log('   ここが 0 でなければ、maxSwaps を下げるか一意性の条件を締める。');
console.log(`   （うち「合っていた束を壊した」= ${results.map((r) => r.brokeClean).join('/')}）`);
if (argv.includes('--dump')) {
  console.log('\n' + '='.repeat(64) + '\n偽の訂正の中身:');
  for (const d of DUMP.slice(0, 12)) {
    console.log(`  [k=${d.k}] 真 ${d.want ?? d.combo.map((r) => r.truth).join('+')}`);
    console.log(`           読 ${d.combo.map((r) => r.read).join('+')}  残差 ${d.rec.baseline?.residual}`);
    console.log(`           出 ${d.got ?? '(なし)'}`);
    for (const m of d.rec.solutions[0]?.swaps ?? []) {
      console.log(`             ↳ 行${m.row} 位置${m.pos}: ${m.from}→${m.to}  cost ${m.cost.toFixed(3)}`);
    }
  }
}
}
