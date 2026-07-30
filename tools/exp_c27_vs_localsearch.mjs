// B3: C27 リファインは局所探索(LS)に包含されるか。
//   現行 _runRootPlan は C27 refine を内部適用済みで、LS の +3% はその「上乗せ」だった。
//   もし LS が C27 を包含するなら、実装時に C27 を LS で置換できる（コード削減）。
//   手続き: (a) refine 無しのルートを作り LS をかける → (b) refine 有り+LS（既知 2,067,708,897）と比較。
//   同じ終点に着けば包含・低ければ C27 は独自の価値を持つ（LS では届かない改善を含む）。
// 条件: napoleon/configC/両面宿儺(cap=19・実験5b と同一)・prefix=[factor]・BW64・n=10
// ★リポジトリ非改変（src/* を import するのみ）
import { Sim, buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, _refineRoute, _replayResult } from '../src/app.js';
const GEAR_C={assault:3.06,elem:0.54,vigor:0.6876,spec:0,dmgup:0,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};
const n=10, log=s=>process.stdout.write(s+'\n');
const REFINE_PLUS_LS=2067708897;   // 実験5b（refine 有り → LS）
setCurrentSubs(['freyja_christmas','artemis']);
buildFormation('napoleon',['hecate','tetra','arianrhod','elaine']);
applyEnemy('ryomen_sukuna');
for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_C[k]??0;
DMG.betaia_mult=3.5; DMG.betaia_cap=800000; DMG.napo_burst_cd_reduce=true;
recalcGearK(); recalcGearKCFromDispAtk(displayAtkOverrideFor('napoleon'));
setStaticOverride({pactcore:1,effond:120});

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
// (a) refine 無しの素ルート（_runRootPlan の refine 前と同一）
let t0=Date.now();
const sim=new Sim(); sim.totalTurns=n; sim._forcePrefix=['factor']; sim._forceTurn=1;
const rows=[]; for(let t=1;t<=n;t++) rows.push(sim.greedyTakeTurn(t));
const raw=rows.map(r=>r.keys);
const rawDmg=_replayResult(raw,n).dmg;
log(`  (a) refine無し 素ルート = ${Math.round(rawDmg).toLocaleString()} (${((Date.now()-t0)/1000).toFixed(0)}s)`);
// C27 単独の寄与
const ref=_refineRoute(raw,n);
log(`  C27 単独       = ${Math.round(ref.dmg).toLocaleString()} (improved=${ref.improved} / +${((ref.dmg-rawDmg)/rawDmg*100).toFixed(3)}%)`);
// (a)+LS
t0=Date.now();
const noRefineLS=localSearch(raw, 400000);
log(`  (a)+LS         = ${Math.round(noRefineLS).toLocaleString()} (LS ${((Date.now()-t0)/1000).toFixed(0)}s)`);
log(`\n=== 判定 ===`);
log(`  refine無し+LS = ${Math.round(noRefineLS).toLocaleString()}`);
log(`  refine有り+LS = ${REFINE_PLUS_LS.toLocaleString()}  (実験5b)`);
const d=(noRefineLS-REFINE_PLUS_LS)/REFINE_PLUS_LS*100;
log(`  → ${Math.abs(d)<0.001 ? '★同一＝LS は C27 を包含（実装時に置換可）'
      : d>0 ? `refine無し+LS の方が高い（+${d.toFixed(3)}%）＝C27 は不要どころか害の可能性`
            : `refine有り+LS が高い（${d.toFixed(3)}%）＝C27 は LS では届かない独自の改善を含む＝両方必要`}`);
