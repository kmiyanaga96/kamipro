// ============================================================================
// search_calibrate_e2e.mjs — 案(c) Increment2 の runtime配線ロジックを Node で e2e 検証
// ----------------------------------------------------------------------------
// 実 Worker/ブラウザは本環境で動かせないため、runSim の「較正phase→本探索phase」の
// オーケストレーション論理を単一プロセスで忠実に再現し、production 探索が出す総ダメージを検証する。
//   較正phase : calibrationShortlist(proxy) → 各候補を _runCalibrationProbe(単一ビームfull) で採点
//               → 最大dmg(同dmgタイは baseline{} 優先)を採用（= worker.js calibrate ＋ runSim finishCalib）
//   本探索phase: prefixes=_selectRootPrefixes(raw) を各々 _runRootPlan(override適用) → 最大dmg
//               （= worker.js root ＋ runSim onAllDone）
// ① funki 修正は恒久化済みのため scaffold 不要。
// 実行: node tools/search_calibrate_e2e.mjs
// ============================================================================
import {
  buildFormation, calibrationShortlist, _runCalibrationProbe, setStaticOverride,
  _selectRootPrefixes, _runRootPlan, _runBaselinePlan
} from '../../src/app.js';

const N = +(process.env.POC_N ?? 10);
const fmt = x => Math.round(x).toLocaleString();
buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);

// --- 較正phase（worker分散を単一プロセスで模擬・production の既定 CALIB_GRID を使う）---
const shortlist = calibrationShortlist(N);
const calib = shortlist.map(override => ({ override, dmg: _runCalibrationProbe(override, N) }));
setStaticOverride({});                       // probe が残した override をクリア（worker init 相当）
let best = calib[0];
for (const r of calib) if (r.dmg > best.dmg) best = r;
const tieBase = calib.find(r => r.dmg === best.dmg && Object.keys(r.override).length === 0);
const chosen = tieBase ? tieBase.override : best.override;

console.log(`[e2e] N=${N}`);
console.log(`  較正候補(full): ${calib.map(c => `${JSON.stringify(c.override)}=${fmt(c.dmg)}`).join('  ')}`);
console.log(`  => 採用 override = ${JSON.stringify(chosen)}`);

// --- 本探索phase（prefixes は raw で選抜 → override 適用して root分散）---
const prefixes = _selectRootPrefixes(N);     // 実 runSim と同じくメインスレッド raw で選抜
setStaticOverride(chosen);
let bestRoot = null;
for (const p of prefixes) { const r = _runRootPlan(p, N); if (!bestRoot || r.dmg > bestRoot.dmg) bestRoot = r; }
const baseDmg = _runBaselinePlan(N);
setStaticOverride({});

const idx = baseDmg > 0 ? (bestRoot.dmg / baseDmg * 100).toFixed(1) : '—';
console.log(`  本探索(root分散)採用ルート = [${bestRoot.prefix.join(',') || '(空)'}]`);
console.log(`  本探索 総ダメージ = ${fmt(bestRoot.dmg)}   baseline = ${fmt(baseDmg)}   火力指数 = ${idx}`);
const okOverride = JSON.stringify(chosen) === JSON.stringify({ judg: 145, pactcore: 1, effond: 100 });
const okDmg = Math.round(bestRoot.dmg) >= 206180726;   // root分散 ≥ 単一ビームfull(206,180,726)
console.log(`  => 期待: override={judg:145,pactcore:1,effond:100} & 総dmg≥206,180,726  :  ${okOverride && okDmg ? 'OK' : 'NG'}`);
process.exit(okOverride && okDmg ? 0 : 1);
