// 実験5d（対照実験）: BW384 の出力にも局所探索を適用する。
// 5c の「多点LSがBW384を超えた」が公平な比較か検証する。BW384+LS が大きく上回るなら、
// LSは万能な後処理にすぎず「幅の代替」という結論は成立しない。★リポジトリ非改変
//
// ⚠ 旧版は config を**最古 GEAR でハードコード**していた（2026-08-05 に台帳駆動へ移行＝REPO_STANDARDS §6 E10）。
//   ∴ 比較定数 BW384 / MULTI_LS は**旧 config での値＝現行と比較できない**。要再取得。
import { Sim, _refineRoute, _replayResult } from '/home/user/kamipro/src/app.js';
import { loadConfigC, verifyE2, configBanner } from './lib/config_c.mjs';
const n=10, log=s=>process.stdout.write(s+'\n');
const BW384=2120186028, MULTI_LS=2145479672;   // ★旧 config での値＝要再取得
const cfg=loadConfigC(); log(configBanner(cfg)); verifyE2(cfg);
const clone=r=>r.map(a=>a.slice());
function localSearch(route, budgetMs){
  let cur=clone(route), curDmg=_replayResult(cur,n).dmg;
  const start=Date.now(); let improved=true;
  const tryC=c=>{ const d=_replayResult(c,n).dmg; if(d>curDmg+1){ cur=c; curDmg=d; return true; } return false; };
  while(improved && Date.now()-start<budgetMs){
    improved=false;
    for(let t=0;t<n && Date.now()-start<budgetMs;t++){
      const L=cur[t].length;
      for(let i=0;i<L;i++) for(let j=0;j<L;j++){ if(i===j) continue;
        const c=clone(cur); const [k]=c[t].splice(i,1); c[t].splice(j,0,k); if(tryC(c)) improved=true; }
      for(let i=0;i<L;i++) for(let j=i+1;j<L;j++){
        const c=clone(cur); [c[t][i],c[t][j]]=[c[t][j],c[t][i]]; if(tryC(c)) improved=true; }
    }
    for(let t1=0;t1<n && Date.now()-start<budgetMs;t1++)
      for(let t2=t1+1;t2<n && Date.now()-start<budgetMs;t2++)
        for(let i=0;i<cur[t1].length;i++) for(let j=0;j<cur[t2].length;j++){
          if(cur[t1][i]===cur[t2][j]) continue;
          const c=clone(cur); [c[t1][i],c[t2][j]]=[c[t2][j],c[t1][i]]; if(tryC(c)) improved=true; }
  }
  return curDmg;
}
log('実験5d(対照): BW384 の出力に局所探索を適用');
let t0=Date.now();
const sim=new Sim(); sim.totalTurns=n; sim.beamW=384; sim._forcePrefix=['factor']; sim._forceTurn=1;
const rows=[]; for(let t=1;t<=n;t++) rows.push(sim.greedyTakeTurn(t));
const ref=_refineRoute(rows.map(r=>r.keys), n);
const route = ref.improved ? ref.turnsKeys : rows.map(r=>r.keys);
const before=_replayResult(route,n).dmg;
log(`  BW384 探索後 = ${Math.round(before).toLocaleString()} (${((Date.now()-t0)/1000).toFixed(0)}s)`);
t0=Date.now();
const after=localSearch(route, 400000);
log(`  BW384 + LS   = ${Math.round(after).toLocaleString()} (+${((after-before)/before*100).toFixed(2)}% / LS ${((Date.now()-t0)/1000).toFixed(0)}s)`);
log(`\n=== 判定 ===`);
log(`  多点LS(5c 最良) = ${MULTI_LS.toLocaleString()}`);
log(`  BW384 + LS      = ${Math.round(after).toLocaleString()}`);
log(`  → ${after>MULTI_LS ? `★BW384+LS の勝ち（+${((after-MULTI_LS)/MULTI_LS*100).toFixed(3)}%）＝「幅の代替」は不成立・LSは万能な後処理` : `多点LS が同等以上（差 ${((after-MULTI_LS)/MULTI_LS*100).toFixed(3)}%）＝幅を上げずとも到達可能`}`);
