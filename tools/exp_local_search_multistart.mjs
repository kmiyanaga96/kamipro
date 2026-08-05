// 実験5c: 多点スタート局所探索。複数のprefixルートそれぞれに局所探索をかけ最良を採る。
// 狙い: 局所探索が届かない「複数手の同時変更」を、開始点の多様性で補えるか。
// 判定: BW384(2,120,186,028)を超えられるか。★リポジトリ非改変・単調安全（改善のみ採用）
//
// ⚠ 旧版は config を**最古 GEAR でハードコード**していた（2026-08-05 に台帳駆動へ移行＝REPO_STANDARDS §6 E10）。
//   ∴ 比較定数（BW384 / BW64_FACTOR / LS_FACTOR）と STARTS の順位は**旧 config での値**＝要再取得。
import { _runRootPlan, _replayResult } from '/home/user/kamipro/src/app.js';
import { loadConfigC, verifyE2, configBanner } from './lib/config_c.mjs';
const n=10, log=s=>process.stdout.write(s+'\n');
const BW384=2120186028, BW64_FACTOR=2007021635, LS_FACTOR=2067708897;   // ★旧 config での値＝要再取得
// 実験1の上位6本（BW64での総ダメージ順）★旧 config での順位
const STARTS=[['pike'],['factor'],['roy'],['miti'],['alone'],['judg']];

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
  return {route:cur, dmg:curDmg};
}

log(`実験5c: 多点スタート局所探索（上位6prefix・宿儺/configC・BW64）`);
log(`  比較基準: BW64[factor]=${BW64_FACTOR.toLocaleString()} / 単点LS=${LS_FACTOR.toLocaleString()} / BW384=${BW384.toLocaleString()}\n`);
let best=null;
for(const p of STARTS){
  const t0=Date.now();
  const r0=_runRootPlan(p,n);
  const before=r0.dmg;
  const ls=localSearch(r0.rows.map(x=>x.keys), 300000);
  if(!best||ls.dmg>best.dmg) best={p, dmg:ls.dmg};
  log(`  [${p}] 探索後=${Math.round(before).toLocaleString()} → LS後=${Math.round(ls.dmg).toLocaleString()} (+${((ls.dmg-before)/before*100).toFixed(2)}%) ${((Date.now()-t0)/1000).toFixed(0)}s${best.p===p?'  ←暫定最良':''}`);
}
log(`\n=== 結果 ===`);
log(`  多点スタート最良: [${best.p}] ${Math.round(best.dmg).toLocaleString()}`);
log(`  vs 単点LS(+${((best.dmg-LS_FACTOR)/LS_FACTOR*100).toFixed(3)}%) / vs BW64(+${((best.dmg-BW64_FACTOR)/BW64_FACTOR*100).toFixed(3)}%)`);
log(`  vs BW384 目標   : ${best.dmg>=BW384?`★超過（+${((best.dmg-BW384)/BW384*100).toFixed(3)}%）`:`未達（充足${((best.dmg-BW64_FACTOR)/(BW384-BW64_FACTOR)*100).toFixed(1)}%）`}`);
