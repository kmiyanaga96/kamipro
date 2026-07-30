// ============================================================================
// search_gear_probe.mjs — gear汎化の診断。非genericギアで較正が適応するか・grid レンジが
// 十分か（境界張り付きがないか）・shortlist サイズ（step調整のコスト）を確認する。2026-07-02。
// GEAR 枠を Node で直接設定して recalcGearK() → calibrateStaticScores。generic は step調整の
// shortlist=6 と override={judg:145,pactcore:1,effond:100} の確認も兼ねる。
// 実行: node tools/search_gear_probe.mjs
// ============================================================================
import { Sim, buildFormation, calibrateStaticScores, setStaticOverride, GEAR, recalcGearK } from '../../src/app.js';
const N = +(process.env.POC_N ?? 10);
const fmt = x => Math.round(x).toLocaleString();
const full = ov => { setStaticOverride(ov || {}); const s = new Sim(); s.totalTurns = N; for (let t = 1; t <= N; t++) s.takeTurn(t); const d = s.dmg; setStaticOverride({}); return d; };
const setGear = g => { for (const k of Object.keys(GEAR)) GEAR[k] = 0; for (const [k, v] of Object.entries(g)) GEAR[k] = v; recalcGearK(); };

buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);
const GRID = { judg: [100, 200], effond: [100, 120] };   // 境界張り付き検出用の端

const gears = {
  generic:  {},
  burstGear:{ assault: 1.5, elem: 1.0, burst_dmg: 1.5, burst_cap: 0.3 },
  abiGear:  { assault: 1.5, elem: 1.0, abi_dmg: 0.6, abi_cap: 0.3, spec: 0.5 },
};
for (const [name, g] of Object.entries(gears)) {
  setGear(g);
  const raw = full({});
  const t0 = Date.now();
  const r = calibrateStaticScores(N);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const cal = full(r.override);
  const gain = ((cal / raw - 1) * 100).toFixed(1);
  // 境界張り付き検出（judg が grid 端 100/200・effond が端 100/120 なら範囲不足の疑い）
  const ov = r.override;
  const edge = [];
  if (ov.judg === 100 || ov.judg === 200) edge.push('judg@端');
  if (ov.effond === 100 || ov.effond === 120) edge.push('effond@端');
  console.log(`[${name}] raw=${fmt(raw)}  override=${JSON.stringify(ov)}  cal=${fmt(cal)} (+${gain}%)  shortlist=${r.shortlist.length}  ${secs}s  ${edge.length ? '⚠' + edge.join(',') : ''}`);
}
setGear({});
