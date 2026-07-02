// ============================================================================
// search_lever_scan.mjs — 有効な較正レバー探索の第1段(安価proxyスキャン)。2026-07-02。
// base={judg:130}(既知の最適)上で、各アビの静的スコアsを override 掃引し proxy(static greedy)
// 総ダメージの変動幅を測る。変動が大きい=順序に効く候補。proxyが base を超える点があれば full-verify 対象。
// ⚠ proxy は full と逆順にミスランクしうる(§5.4)ため、ここは「候補の足切り」のみ。判定は full-verify(第2段)。
// 実行: node archive/tools/search_lever_scan.mjs
// ============================================================================
import { Sim, buildFormation, setStaticOverride, ABIL } from '../../src/app.js';
buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);
const N = +(process.env.POC_N ?? 10);
const proxy = () => { const s = new Sim(); s.totalTurns = N; s.planDepth = 2; for (let t = 1; t <= N; t++) s.greedyTakeTurn(t); return s.dmg; };
const fmt = x => Math.round(x).toLocaleString();

const base = { judg: 130 };
setStaticOverride(base); const bP = proxy();
const vals = [1, 30, 60, 100, 150, 200, 300, 400];
const keys = Object.keys(ABIL).filter(k => k !== 'judg');
const rows = [];
for (const k of keys) {
  let lo = bP, hi = bP, bestP = bP, bestV = null;
  for (const v of vals) {
    setStaticOverride({ ...base, [k]: v });
    const p = proxy();
    lo = Math.min(lo, p); hi = Math.max(hi, p);
    if (p > bestP) { bestP = p; bestV = v; }
  }
  rows.push({ k, span: hi - lo, bestV, gain: bestP - bP });
}
setStaticOverride({});
rows.sort((a, b) => b.span - a.span);
console.log(`[lever_scan] N=${N}  base={judg:130} proxy=${fmt(bP)}`);
console.log(`  (span=proxy変動幅 / gain=base超え proxy最大差・>0なら full-verify 候補)`);
for (const r of rows) console.log(`  ${r.k.padEnd(12)} span=${fmt(r.span).padStart(13)}  bestOverride=${String(r.bestV ?? '-').padStart(4)}  gain=${r.gain > 0 ? '+' + fmt(r.gain) : '0'}`);
const cand = rows.filter(r => r.gain > 0).map(r => `${r.k}:${r.bestV}`);
console.log(`  => proxyでbase超えの候補: ${cand.length ? cand.join(', ') : 'なし'}`);
