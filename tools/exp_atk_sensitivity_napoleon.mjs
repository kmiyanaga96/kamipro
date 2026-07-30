// 実験2（圧縮版）: prefix=[factor] 固定で ATK スケールのみを振り、押し順の変化を測る。
// 目的は「大域最良の探索」ではなく「条件間の押し順比較」なので prefix 固定で十分（実験1: prefix寄与は最大0.13%）。
import { buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, _runRootPlan } from '/home/user/kamipro/src/app.js';
import fs from 'fs';
const GEAR_C={assault:3.06,elem:0.54,vigor:0.6876,spec:0,dmgup:0,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};
const n=10, scale=parseFloat(process.argv[2]);
const REF='/tmp/claude-0/-home-user-kamipro/2e479ca7-804e-57dc-ba4e-837db3d4c3c4/scratchpad/atk2_base.json';
setCurrentSubs(['freyja_christmas','artemis']);
buildFormation('napoleon',['hecate','tetra','arianrhod','elaine']);
applyEnemy('ryomen_sukuna');
for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_C[k]??0;
DMG.betaia_mult=3.5; DMG.betaia_cap=800000; DMG.napo_burst_cd_reduce=true;
recalcGearK();
const atk={}; for(const [k,v] of Object.entries(displayAtkOverrideFor('napoleon'))) atk[k]=Math.round(v*scale);
recalcGearKCFromDispAtk(atk);
setStaticOverride({pactcore:1,effond:120});
const r=_runRootPlan(['factor'],n);
const keys=r.rows.map(x=>x.keys);
if(scale===1.00){ fs.writeFileSync(REF,JSON.stringify(keys)); console.log(`  ×1.00(基準) dmg=${Math.round(r.dmg).toLocaleString()}`); process.exit(0); }
const base=JSON.parse(fs.readFileSync(REF,'utf8'));
let pos=0,tot=0,ss=0,st=0, turnDiff=[];
for(let t=0;t<base.length;t++){
  const x=base[t]||[], y=keys[t]||[], L=Math.max(x.length,y.length);
  let tp=0,tt=0;
  for(let i=0;i<L;i++){ tot++; tt++; if(x[i]&&y[i]&&x[i]===y[i]){pos++;tp++;} }
  const cnt=k=>{const m={};for(const v of k)m[v]=(m[v]||0)+1;return m;};
  const cx=cnt(x),cy=cnt(y);
  for(const k of new Set([...Object.keys(cx),...Object.keys(cy)])){ ss+=Math.min(cx[k]||0,cy[k]||0); st+=Math.max(cx[k]||0,cy[k]||0); }
  turnDiff.push(`T${t+1}:${(tp/tt*100).toFixed(0)}%`);
}
console.log(`  ×${scale.toFixed(2)}       dmg=${Math.round(r.dmg).toLocaleString()}  同位置${(pos/tot*100).toFixed(1)}% / 構成${(ss/st*100).toFixed(1)}%   [${turnDiff.join(' ')}]`);
