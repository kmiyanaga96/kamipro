// 有効レバー探索の第2段: proxy候補を full-verify(単一ビーム)。base を超える第3レバーがあるか。
import { Sim, buildFormation, setStaticOverride } from '../../src/app.js';
buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);
const N = +(process.env.POC_N ?? 10);
const full = () => { const s = new Sim(); s.totalTurns = N; for (let t = 1; t <= N; t++) s.takeTurn(t); return s.dmg; };
const fmt = x => Math.round(x).toLocaleString();
// base は POC_BASE env(JSON) で指定可。既定=現行 production の較正winner（C17 第4レバー検討時に env 化）。
const base = process.env.POC_BASE ? JSON.parse(process.env.POC_BASE) : { judg: 122, pactcore: 1, effond: 93 };
const cands = [
  {}, // = base
  { effond: 100 }, { tenya: 60 }, { tenya_re: 60 }, { inori: 1 }, { amplifa: 1 },
  { ifishant: 1 }, { divinus: 1 }, { helix: 1 }, { absolute: 1 }, { puvoir: 100 }, { sleur: 100 },
];
setStaticOverride(base); const b = full();
console.log(`[lever_verify] N=${N}  base=${JSON.stringify(base)}=${fmt(b)}`);
const hits = [];
for (const extra of cands) {
  setStaticOverride({ ...base, ...extra });
  const d = full();
  const tag = Object.keys(extra).length ? JSON.stringify(extra) : '(base)';
  const mark = d > b ? '  ★改善' : (d === b ? '  =同値' : '');
  console.log(`  ${tag.padEnd(22)} = ${fmt(d)}${mark}`);
  if (d > b) hits.push({ extra, d });
}
setStaticOverride({});
console.log(hits.length ? `  => full で base 超え: ${hits.map(h => JSON.stringify(h.extra) + '=' + fmt(h.d)).join(', ')}` : `  => full で base を超える第3レバー候補なし`);
