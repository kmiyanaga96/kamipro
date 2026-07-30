// 探索幅スケーリング実験: 「もっと探索したら押し順は良くなるのか」を実測する。
// prefix を [factor] に固定し、BEAM_W だけを変えて 10T 総ダメージを比較する。
// 幅を増やしてダメージが伸びないなら「現行探索は既にプラトー上＝大域最適に近い」の証拠になる。
import { Sim, buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, _refineRoute, _replayResult } from '/home/user/kamipro/src/app.js';
const GEAR_C={assault:3.06,elem:0.54,vigor:0.6876,spec:0,dmgup:0,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};
const n=10, PREFIX=['factor'];
setCurrentSubs(['freyja_christmas','artemis']);
buildFormation('napoleon',['hecate','tetra','arianrhod','elaine']);
applyEnemy('ryomen_sukuna');
for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_C[k]??0;
DMG.betaia_mult=3.5; DMG.betaia_cap=800000; DMG.napo_burst_cd_reduce=true;
recalcGearK(); recalcGearKCFromDispAtk(displayAtkOverrideFor('napoleon'));
setStaticOverride({pactcore:1,effond:120});

const log=s=>process.stdout.write(s+'\n');
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
