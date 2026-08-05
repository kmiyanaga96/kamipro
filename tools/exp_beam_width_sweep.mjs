// 探索幅スケーリング実験: 「もっと探索したら押し順は良くなるのか」を実測する。
// prefix を [factor] に固定し、BEAM_W だけを変えて 10T 総ダメージを比較する。
// 幅を増やしてダメージが伸びないなら「現行探索は既にプラトー上＝大域最適に近い」の証拠になる。
// ⚠⚠ **C37 の「BW 掃引は非単調・BW384=+5.64%」はこのハーネスが最古 GEAR で出した数値＝再測対象**
//   （config ハードコードによる事故。2026-08-05 に config 駆動へ移行＝REPO_STANDARDS §6 E10）。
// ⚠ 後処理に `_refineRoute`（C27）を使っているが、**production は 2026-07-30 に `_localSearchRoute`（LS）へ置換済**
//   ＝本ハーネスは現行 production と別の後処理で測っている。再測するなら後処理も production に揃えるか、
//   「ビーム単体で比較する」設計に倒すこと（LS は幅と加算的＝C37 の 5d 対照）。
import { Sim, _refineRoute, _replayResult } from '/home/user/kamipro/src/app.js';
import { loadConfigC, verifyE2, configBanner } from './lib/config_c.mjs';
const n=10, PREFIX=['factor'];
const log=s=>process.stdout.write(s+'\n');
const cfg=loadConfigC(); log(configBanner(cfg)); verifyE2(cfg);
log(`beam幅スケーリング（prefix=[${PREFIX}] n=${n} 宿儺/configC）`);
let base=null, baseKeys=null;
for(const W of [64,128,256]){
  const t0=Date.now();
  const sim=new Sim(); sim.totalTurns=n; sim.beamW=W;
  sim._forcePrefix=PREFIX; sim._forceTurn=1;
  const rows=[]; for(let t=1;t<=n;t++) rows.push(sim.greedyTakeTurn(t));
  const ref=_refineRoute(rows.map(r=>r.keys), n);
  const rep=ref.improved? _replayResult(ref.turnsKeys,n) : {dmg:sim.dmg, rows};
  const keys=(ref.improved?ref.turnsKeys:rows.map(r=>r.keys));
  if(base===null){ base=rep.dmg; baseKeys=JSON.stringify(keys); }
  const diff=((rep.dmg-base)/base*100);
  const same=JSON.stringify(keys)===baseKeys;
  log(`  BW=${String(W).padStart(4)}  dmg=${Math.round(rep.dmg).toLocaleString().padStart(14)}  vs BW64 ${diff>=0?'+':''}${diff.toFixed(3)}%  順=${same?'同一':'差異あり'}  (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}
