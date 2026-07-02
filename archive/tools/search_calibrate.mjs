// ============================================================================
// search_calibrate.mjs — 案(c) production 較正機構の検証（2026-07-02 セッション4）
// ----------------------------------------------------------------------------
// SEARCH_ROLLOUT_DESIGN §7。src/app.js の calibrateStaticScores()（proxy-shortlist +
// full-verify・単調安全）を実機構で回し、選ばれた静的スコア上書きと総ダメージを検証する。
// **POC-C env スキャフォールドは不要**（本機構が env を置換）。①修正モデルで検証する場合のみ
// data/characters.js に §1.1-A（funki 毎ターン化）を一時適用する。
//
// 環境変数: POC_N（既定10）
// 実行例:  POC_N=10 node archive/tools/search_calibrate.mjs
// ============================================================================
import { Sim, buildFormation, calibrateStaticScores, setStaticOverride, getStaticOverride } from '../../src/app.js';
buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);

const N = +(process.env.POC_N ?? 10);
const fullDmg = () => { const s = new Sim(); s.totalTurns = N; for (let t = 1; t <= N; t++) s.takeTurn(t); return s.dmg; };
const fmt = x => Math.round(x).toLocaleString();

const baseline = fullDmg();
const t0 = Date.now();
const r = calibrateStaticScores(N);
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`[calibrate] N=${N}  baseline(full)=${fmt(baseline)}`);
console.log(`  proxy: ${r.proxy.map(p => `${p.v ?? 'base'}=${fmt(p.s)}`).join('  ')}`);
console.log(`  full : ${r.full.map(p => `${p.v ?? 'base'}=${fmt(p.s)}`).join('  ')}`);
console.log(`  => 採用 override = ${JSON.stringify(r.override)}  (${secs}s)`);

// 採用 override を適用して最終 full を確認（＝production が実行する探索の総ダメージ）。
setStaticOverride(r.override);
const after = fullDmg();
setStaticOverride({});
const delta = ((after / baseline - 1) * 100).toFixed(2);
console.log(`  較正後(full) = ${fmt(after)}  (baseline比 ${delta >= 0 ? '+' : ''}${delta}%)`);
console.log(`  単調安全(baseline以上か): ${after >= baseline ? 'OK' : 'NG(退行!)'}`);
