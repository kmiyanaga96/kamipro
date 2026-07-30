// B3b: エジソンで C27 単独の改善を LS が包含するかを判定（B3 はナポ編成で C27 が発火せず判定不能だった）。
//   エジソンは deploysRobot/prelude タグを持つ＝C27 が本来効く編成。
//   (a) refine無し 素ルート → (b) C27 単独 → (c) refine無し+LS → (d) refine有り+LS
//   (c) >= (b) なら LS は C27 の改善に到達できる。(d) > (c) なら C27 は LS では届かない独自価値を持つ。
// 条件: edison/configB/cath_palug（A1 と同一・実gear）・prefix=空固定・BW64・n=10
// ★リポジトリ非改変
import { Sim, buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, _refineRoute, _replayResult } from '../src/app.js';
const GEAR_B={assault:3.06,elem:0,vigor:0.6876,spec:0,dmgup:0.09,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};
const n=10, log=s=>process.stdout.write(s+'\n');
setCurrentSubs(['freyja_christmas','artemis']);
buildFormation('edison',['yamato','hecate','tetra','elaine']);
applyEnemy('cath_palug');
for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_B[k]??0;
DMG.droid_react_mult=3.5; DMG.droid_react_cap=650000;
DMG.edison_burst_extra_mult=2.5; DMG.edison_burst_extra_cap=800000;
recalcGearK(); recalcGearKCFromDispAtk(displayAtkOverrideFor('edison'));
setStaticOverride({judg:145,pactcore:1});

const clone=r=>r.map(a=>a.slice());
function localSearch(route, budgetMs){
  let cur=clone(route), curDmg=_replayResult(cur,n).dmg;
  const start=Date.now(); let improved=true, acc=0;
  const tryC=c=>{ const d=_replayResult(c,n).dmg; if(d>curDmg+1){ cur=c; curDmg=d; acc++; return true; } return false; };
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
  return {dmg:curDmg, acc};
}
let t0=Date.now();
const sim=new Sim(); sim.totalTurns=n;
const rows=[]; for(let t=1;t<=n;t++) rows.push(sim.greedyTakeTurn(t));
const raw=rows.map(r=>r.keys);
const rawDmg=_replayResult(raw,n).dmg;
log(`  (a) refine無し 素ルート = ${Math.round(rawDmg).toLocaleString()} (${((Date.now()-t0)/1000).toFixed(0)}s)`);
const ref=_refineRoute(raw,n);
log(`  (b) C27 単独           = ${Math.round(ref.dmg).toLocaleString()}  improved=${ref.improved} (+${((ref.dmg-rawDmg)/rawDmg*100).toFixed(3)}%)`);
t0=Date.now();
const c=localSearch(raw, 400000);
log(`  (c) refine無し+LS      = ${Math.round(c.dmg).toLocaleString()} (+${((c.dmg-rawDmg)/rawDmg*100).toFixed(3)}% / 採用${c.acc}件 / ${((Date.now()-t0)/1000).toFixed(0)}s)`);
t0=Date.now();
const d=localSearch(ref.improved?ref.turnsKeys:raw, 400000);
log(`  (d) refine有り+LS      = ${Math.round(d.dmg).toLocaleString()} (+${((d.dmg-rawDmg)/rawDmg*100).toFixed(3)}% / 採用${d.acc}件 / ${((Date.now()-t0)/1000).toFixed(0)}s)`);
log(`\n=== 判定 ===`);
log(`  LS は C27 の改善に到達したか: ${c.dmg>=ref.dmg?`✅到達（(c) ${Math.round(c.dmg).toLocaleString()} ≥ (b) ${Math.round(ref.dmg).toLocaleString()}）`:`❌未到達（(c) < (b)）`}`);
const dd=(d.dmg-c.dmg)/c.dmg*100;
log(`  C27 は独自価値を持つか: ${Math.abs(dd)<0.0005?'❌同値＝LS が包含（実装時に C27 を置換可）':dd>0?`✅(d) が +${dd.toFixed(4)}% 高い＝C27 は LS では届かない改善を含む＝両方必要`:`(c) が高い（${dd.toFixed(4)}%）＝C27 は経路を悪化させている`}`);
