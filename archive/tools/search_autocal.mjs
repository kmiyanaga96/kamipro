// ============================================================================
// search_autocal.mjs — STEP2 案(c): 静的スコア s の config別「自動較正」PoC
// ----------------------------------------------------------------------------
// 目的: 探索の準最適性(C15)の根本＝「静的 s がモデル固有に手調整され脆い」を、
//   s を config ごとに機械的に fit する自己較正で解消できるかを検証する。
//   狙い(SEARCH_ROLLOUT_DESIGN §5.3 案c):
//     (1) 安価な proxy(pure static greedy の N ターン総ダメージ) が、
//         高価な full beam search と同じ s を最良に選べるか(=較正が安価に成立するか)。
//     (2) 「現行 dyn を選択肢に含めて最大を取る」= 単調安全(退行しない)であること。
//
// 前提: SEARCH_ROLLOUT_DESIGN §1.1 の judg-s env スキャフォールド(POC-C) が
//   当たっていること(judg の s は関数=runtime 評価のため本プロセス内で掃引可能)。
//   ① funki 修正(POC-A) の有無で「①修正モデル / blackout モデル」を切替える
//   (A の適用/revert は data/characters.js を直接編集。env では切替不可)。
//
// 環境変数:
//   POC_N       : ターン数(既定 10)
//   POC_JS_GRID : JUDG_S 候補(カンマ区切り・'dyn'=現行動的 30/80)。既定 dyn,30,60,80,100,130,160,200
//   POC_FULL    : '1' で full beam search も回して proxy の妥当性を検証(高価)。既定は proxy のみ
//   POC_FUNKI_S : funki 静的スコア(定数=プロセス起動時固定)。既定 150
//
// 実行例:
//   POC_N=10 node archive/tools/search_autocal.mjs                 # 安価 proxy 掃引のみ
//   POC_N=10 POC_FULL=1 POC_JS_GRID=dyn,80,130 node archive/tools/search_autocal.mjs
// ============================================================================
import { Sim, buildFormation } from '../../src/app.js';
buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);

const N = +(process.env.POC_N ?? 10);
const doFull = process.env.POC_FULL === '1';
const grid = (process.env.POC_JS_GRID ?? 'dyn,30,60,80,100,130,160,200').split(',');

// 安価 proxy: pure static greedy(planDepth=2・ビーム無し)で N ターン完遂した総ダメージ(≈数ms〜)。
function proxyDmg() {
  const s = new Sim(); s.totalTurns = N; s.planDepth = 2;
  for (let t = 1; t <= N; t++) s.greedyTakeTurn(t);
  return s.dmg;
}
// 高価 full: 実探索(planDepth=0 フルビーム)で N ターン完遂した総ダメージ。
function fullDmg() {
  const s = new Sim(); s.totalTurns = N; let d = 0;
  for (let t = 1; t <= N; t++) d = s.takeTurn(t).dmg;
  return d;
}
const setJS = g => { if (g === 'dyn') delete process.env.POC_JUDG_S; else process.env.POC_JUDG_S = g; };

console.log(`[autocal] N=${N} FUNKI_S=${process.env.POC_FUNKI_S ?? 150} full=${doFull} grid=[${grid}]`);
const rows = [];
for (const g of grid) {
  setJS(g);
  const t0 = Date.now(); const p = proxyDmg(); const pt = (Date.now() - t0) / 1000;
  let f = null, ft = 0;
  if (doFull) { const t1 = Date.now(); f = fullDmg(); ft = (Date.now() - t1) / 1000; }
  rows.push({ g, p, f });
  console.log(`  JUDG_S=${String(g).padEnd(4)} proxy=${Math.round(p).toLocaleString().padStart(13)} (${pt.toFixed(2)}s)`
    + (doFull ? `   full=${Math.round(f).toLocaleString().padStart(13)} (${ft.toFixed(1)}s)` : ''));
}
// 自動較正の採用: grid 最大(現行 dyn を必ず含むため単調安全=退行しない)。
const bestP = rows.reduce((a, b) => b.p > a.p ? b : a);
console.log(`  => proxy 較正採用: JUDG_S=${bestP.g}  (proxy=${Math.round(bestP.p).toLocaleString()})`);
if (doFull) {
  const bestF = rows.reduce((a, b) => b.f > a.f ? b : a);
  console.log(`  => full  最良    : JUDG_S=${bestF.g}  (full=${Math.round(bestF.f).toLocaleString()})`);
  console.log(`  proxy は full の最良 s を選べたか: ${bestP.g === bestF.g ? 'YES' : `NO (proxy→${bestP.g} / full→${bestF.g})`}`);
  const dynRow = rows.find(r => r.g === 'dyn');
  if (dynRow && dynRow.f != null) console.log(`  参考: dyn(現行) full=${Math.round(dynRow.f).toLocaleString()} → 較正後 full=${Math.round(rows.find(r=>r.g===bestP.g).f).toLocaleString()}`);
}
