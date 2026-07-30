// 実験5b: 局所探索の近傍を拡張。①ターン内move ②ターン内swap ③ターン跨ぎswap。
// ⚠ターン跨ぎは「move」にすると受け側が20手＝abilCap19で黙って落ちるため swap（交換）にする。
// 目的関数は _objective 第1要素＝総ダメージ（engine と一致することを確認済み）。★リポジトリ非改変
import { buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, _runRootPlan, _replayResult } from '/home/user/kamipro/src/app.js';
import fs from 'fs';
const GEAR_C={assault:3.06,elem:0.54,vigor:0.6876,spec:0,dmgup:0,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};
const n=10, log=s=>process.stdout.write(s+'\n');
const BASE_DMG=2007021635, INTRA_ONLY=2038000036, BW384=2120186028;
const CACHE='/tmp/claude-0/-home-user-kamipro/2e479ca7-804e-57dc-ba4e-837db3d4c3c4/scratchpad/base_route.json';

setCurrentSubs(['freyja_christmas','artemis']);
buildFormation('napoleon',['hecate','tetra','arianrhod','elaine']);
applyEnemy('ryomen_sukuna');
for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_C[k]??0;
DMG.betaia_mult=3.5; DMG.betaia_cap=800000; DMG.napo_burst_cd_reduce=true;
recalcGearK(); recalcGearKCFromDispAtk(displayAtkOverrideFor('napoleon'));
setStaticOverride({pactcore:1,effond:120});

let baseRoute;
if(fs.existsSync(CACHE)){ baseRoute=JSON.parse(fs.readFileSync(CACHE,'utf8')); log('基準ルート: キャッシュから復元'); }
else { const t=Date.now(); const b=_runRootPlan(['factor'],n); baseRoute=b.rows.map(r=>r.keys);
       fs.writeFileSync(CACHE,JSON.stringify(baseRoute)); log(`基準ルート取得 (${((Date.now()-t)/1000).toFixed(0)}s)`); }
log(`  base = ${Math.round(_replayResult(baseRoute,n).dmg).toLocaleString()}\n`);

const clone=r=>r.map(a=>a.slice());
function search(route, budgetMs){
  let cur=clone(route), curDmg=_replayResult(cur,n).dmg;
  const start=Date.now(); let iters=0,acc={move:0,swap:0,cross:0},sweeps=0,improved=true;
  const tryCand=(cand,kind)=>{ iters++; const d=_replayResult(cand,n).dmg;
    if(d>curDmg+1){ cur=cand; curDmg=d; acc[kind]++; return true; } return false; };
  while(improved && Date.now()-start<budgetMs){
    improved=false; sweeps++;
    // ①ターン内 move ②ターン内 swap
    for(let t=0;t<n && Date.now()-start<budgetMs;t++){
      const L=cur[t].length;
      for(let i=0;i<L;i++) for(let j=0;j<L;j++){
        if(i===j) continue;
        const c=clone(cur); const [k]=c[t].splice(i,1); c[t].splice(j,0,k);
        if(tryCand(c,'move')) improved=true;
      }
      for(let i=0;i<L;i++) for(let j=i+1;j<L;j++){
        const c=clone(cur); [c[t][i],c[t][j]]=[c[t][j],c[t][i]];
        if(tryCand(c,'swap')) improved=true;
      }
    }
    // ③ターン跨ぎ swap（全ターン対・手数を保存＝abilCap 違反を避ける）
    for(let t1=0;t1<n && Date.now()-start<budgetMs;t1++)
      for(let t2=t1+1;t2<n && Date.now()-start<budgetMs;t2++)
        for(let i=0;i<cur[t1].length;i++) for(let j=0;j<cur[t2].length;j++){
          if(cur[t1][i]===cur[t2][j]) continue;
          const c=clone(cur); [c[t1][i],c[t2][j]]=[c[t2][j],c[t1][i]];
          if(tryCand(c,'cross')) improved=true;
        }
    log(`   sweep${sweeps}: dmg=${Math.round(curDmg).toLocaleString()}  採用[move${acc.move} swap${acc.swap} cross${acc.cross}] 試行${iters} (${((Date.now()-start)/1000).toFixed(0)}s)`);
  }
  return {dmg:curDmg,iters,acc,sweeps};
}
log('局所探索（近傍拡張: ターン内move + ターン内swap + ターン跨ぎswap）…');
const r=search(baseRoute, 900000);
log(`\n=== 結果 ===`);
log(`  BW64 基準          : ${BASE_DMG.toLocaleString()}`);
log(`  ターン内のみ(実験5): ${INTRA_ONLY.toLocaleString()}  (+1.544% / 充足27.4%)`);
log(`  近傍拡張(実験5b)   : ${Math.round(r.dmg).toLocaleString()}  (+${((r.dmg-BASE_DMG)/BASE_DMG*100).toFixed(3)}% / 充足${((r.dmg-BASE_DMG)/(BW384-BASE_DMG)*100).toFixed(1)}%)`);
log(`  BW384 目標         : ${BW384.toLocaleString()}`);
log(`  採用内訳: move=${r.acc.move} swap=${r.acc.swap} cross=${r.acc.cross}  (試行${r.iters}・sweep${r.sweeps})`);
