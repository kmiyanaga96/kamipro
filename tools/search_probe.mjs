// ============================================================================
// search_probe.mjs — 探索品質PoCの主力ハーネス（2026-07-02 セッションで作成）
// ----------------------------------------------------------------------------
// 目的: golden編成(edison+yamato/hecate/tetra/elaine)で N ターン探索を実行し、
//   総ダメージ・実行時間・各キーの per-turn 使用回数を出力する。探索チューニング
//   （rollout ポリシー/幅）の効果を「ポジ/ネガ問わず」定量比較するための計測器。
//
// 【重要・前提】この計測は SEARCH_ROLLOUT_DESIGN.md の「§再現手順」に記した
//   一時スキャフォールド編集（env-gate）を data/characters.js / src/sim.js に
//   当てた状態でのみ意味を持つ。編集を当てない素の状態では env は無視され、
//   常に現行 golden 挙動（175,023,298）になる。実験後は必ず revert すること。
//
// 環境変数（該当スキャフォールドを当てている場合のみ有効）:
//   POC_N          : ターン数（既定 10）
//   POC_FUNKI_S    : funki(大和の奮起) 静的スコア上書き（既定 150）
//   POC_JUDG_S     : judg(ジャッジ) 静的スコア上書き（既定 = 動的 30/80）
//   POC_ROLLOUT_BW : ロールアウト(planDepth===2)を浅ビーム化する幅（既定 1=静的greedy）
//   ※ ① funki解禁修正（毎ターン化）は別途 data/characters.js の state/onAbility/turnEnd
//      を書き換える（SEARCH_ROLLOUT_DESIGN.md §再現手順 A）。env では切替えられない。
//
// 実行例: POC_N=10 POC_JUDG_S=130 node tools/search_probe.mjs
// ============================================================================
import { Sim, buildFormation } from '../../src/app.js';
buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);

const N = +(process.env.POC_N ?? 10);
const sim = new Sim(); sim.totalTurns = N;
const rows = []; let dmg = 0; const t0 = Date.now();
for (let t = 1; t <= N; t++) {
  const r = sim.takeTurn(t); dmg = r.dmg;
  const ts = r.ord.map(c => c.text);
  rows.push({
    t,
    funki:  ts.filter(x => x.startsWith('ヤマト3')).length,  // 大和の奮起
    judg:   ts.filter(x => x === 'テトラ1').length,          // ジャッジ(ph0/1/2すべてテトラ1表示)
    puvoir: ts.filter(x => x === 'ヘカテー1').length,         // プヴワール
    sleur:  ts.filter(x => x.startsWith('ヘカテー3')).length, // スリール
    effond: ts.filter(x => x === 'ヘカテー2').length,         // エフォンド
    n: ts.length,
  });
}
const env = `FUNKI_S=${process.env.POC_FUNKI_S ?? 150} JUDG_S=${process.env.POC_JUDG_S ?? 'dyn'} ROLLOUT_BW=${process.env.POC_ROLLOUT_BW ?? 1}`;
console.log(`[search_probe] N=${N} ${env}`);
console.log(`  dmg = ${Math.round(dmg).toLocaleString()}   time = ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  funki /turn = [${rows.map(r => r.funki)}]`);
console.log(`  judg  /turn = [${rows.map(r => r.judg)}]`);
console.log(`  puvoir/turn = [${rows.map(r => r.puvoir)}]  sleur/turn = [${rows.map(r => r.sleur)}]  effond/turn = [${rows.map(r => r.effond)}]`);
