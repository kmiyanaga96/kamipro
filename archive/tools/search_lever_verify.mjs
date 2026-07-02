// 有効レバー探索の第2段: proxy候補を full-verify(単一ビーム)。base={judg:130}=191,141,005 を超えるか。
import { Sim, buildFormation, setStaticOverride } from '../../src/app.js';
buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);
const N = +(process.env.POC_N ?? 10);
const full = () => { const s = new Sim(); s.totalTurns = N; for (let t = 1; t <= N; t++) s.takeTurn(t); return s.dmg; };
const fmt = x => Math.round(x).toLocaleString();
const base = { judg: 130 };
const cands = [
  {}, // = base {judg:130}
  { pactcore: 1 }, { tenya: 60 }, { tenya_re: 60 }, { effond: 100 }, { knights: 1 },
  { sleur: 100 }, { puvoir: 150 }, { droid: 100 }, { amplifa: 100 }, { alone: 150 },
];
setStaticOverride(base); const b = full();
console.log(`[lever_verify] N=${N}  base={judg:130}=${fmt(b)}`);
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
console.log(hits.length ? `  => full で base 超え: ${hits.map(h => JSON.stringify(h.extra) + '=' + fmt(h.d)).join(', ')}` : `  => full で base を超える候補なし（judg のみが有効レバー）`);
