// C1: 実験1 §2 の「中位7本（総ダメ完全同値 1,939,037,920）は同一ルートへ合流しているか」を確認する。
//   実験1ではキー列を保存していなかったため「推定」のまま未検証だった主張を潰す。
//   手続き: 中位prefix の複数本を再探索し、キー列を厳密比較（ターン毎・位置毎）。
// 条件: napoleon/configC/両面宿儺（実験1 と同一・cap=19）・BW64・n=10
// ★リポジトリ非改変
import { buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, _runRootPlan } from '../src/app.js';
const GEAR_C={assault:3.06,elem:0.54,vigor:0.6876,spec:0,dmgup:0,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};
const n=10, log=s=>process.stdout.write(s+'\n');
// 中位7本のうち代表3本（空prefix・puvoir・knights）＋対照として上位1本（factor）
const TARGETS=[[], ['puvoir'], ['knights'], ['factor']];
setCurrentSubs(['freyja_christmas','artemis']);
buildFormation('napoleon',['hecate','tetra','arianrhod','elaine']);
applyEnemy('ryomen_sukuna');
for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_C[k]??0;
DMG.betaia_mult=3.5; DMG.betaia_cap=800000; DMG.napo_burst_cd_reduce=true;
recalcGearK(); recalcGearKCFromDispAtk(displayAtkOverrideFor('napoleon'));
setStaticOverride({pactcore:1,effond:120});

log('C1: 中位7本は同一ルートか（キー列の厳密比較）');
const res=[];
for(const p of TARGETS){
  const t0=Date.now();
  const r=_runRootPlan(p,n);
  const keys=r.rows.map(x=>x.keys);
  res.push({p, dmg:r.dmg, keys, sig:JSON.stringify(keys)});
  log(`  [${p.join(',')||'(空)'}] dmg=${Math.round(r.dmg).toLocaleString()} (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}
log('\n=== キー列の一致判定（基準=(空)prefix）===');
const base=res[0];
for(const r of res.slice(1)){
  const same = r.sig===base.sig;
  let detail='';
  if(!same){
    // どのターンで最初に食い違うか
    let firstDiff=-1, posSame=0, tot=0;
    for(let t=0;t<n;t++){
      const x=base.keys[t]||[], y=r.keys[t]||[], L=Math.max(x.length,y.length);
      for(let i=0;i<L;i++){ tot++; if(x[i]&&y[i]&&x[i]===y[i]) posSame++; }
      if(firstDiff<0 && JSON.stringify(x)!==JSON.stringify(y)) firstDiff=t+1;
    }
    detail=` / 最初の相違=T${firstDiff} / 同位置一致${(posSame/tot*100).toFixed(1)}%`;
  }
  const dmgSame = Math.round(r.dmg)===Math.round(base.dmg);
  log(`  [${r.p.join(',')||'(空)'}] : キー列${same?'★完全同一':'相違あり'} / 総ダメ${dmgSame?'同値':'相違'}${detail}`);
}
log('\n=== 結論 ===');
const mid=res.slice(0,3);
const allSame=mid.every(r=>r.sig===mid[0].sig);
log(`  中位3本（空/puvoir/knights）: ${allSame?'★キー列まで完全同一＝同一ルートへ合流を確認（推定が正しかった）'
   :'キー列は異なる＝総ダメ同値だが別ルート（「合流」の推定は誤り＝プラトー上の別解が同値だった）'}`);
