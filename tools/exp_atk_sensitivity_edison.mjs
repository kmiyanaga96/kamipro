// A1（ATK感度に限定）: エジソン編成でも「ATKを振ると押し順が崩れ、ダメージが非単調になる」か。
//   ナポ編成の実験2と同一手続き（prefix固定・ATKスケールのみ変更）で直接比較する。
//   目的: 探索の不安定性が【エンジン全体の病理】か【ナポ編成固有】かを判定する。
// 条件: configB（sim04 由来・cath_palug・英霊武器あり）＝cap飽和する実gear環境で測る
//   （GEAR全0では cap に届かず地形が滑らかになり「安定」と誤判定する恐れがあるため）。
// ★リポジトリ非改変。1条件=1プロセス（同一プロセス反復は遅くなる＝旧実験2で実証）。
import { buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, _runRootPlan, _replayResult } from '/home/user/kamipro/src/app.js';
import fs from 'fs';
const n=10, scale=parseFloat(process.argv[2]);
const REF='/tmp/claude-0/-home-user-kamipro/2e479ca7-804e-57dc-ba4e-837db3d4c3c4/scratchpad/a1_base.json';
const GEAR_B={assault:3.06,elem:0,vigor:0.6876,spec:0,dmgup:0.09,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};
const PREFIX=process.env.A1_PREFIX ? process.env.A1_PREFIX.split(',') : [];

setCurrentSubs(['freyja_christmas','artemis']);
buildFormation('edison',['yamato','hecate','tetra','elaine']);
applyEnemy('cath_palug');
for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_B[k]??0;
DMG.droid_react_mult=3.5; DMG.droid_react_cap=650000;
DMG.edison_burst_extra_mult=2.5; DMG.edison_burst_extra_cap=800000;
recalcGearK();
const atk={}; for(const [k,v] of Object.entries(displayAtkOverrideFor('edison'))) atk[k]=Math.round(v*scale);
recalcGearKCFromDispAtk(atk);
setStaticOverride({judg:145,pactcore:1});

const r=_runRootPlan(PREFIX,n);
const keys=r.rows.map(x=>x.keys);
if(scale===1.00){ fs.writeFileSync(REF,JSON.stringify(keys)); console.log(`  ×1.00(基準) dmg=${Math.round(r.dmg).toLocaleString()}`); process.exit(0); }
const base=JSON.parse(fs.readFileSync(REF,'utf8'));
let pos=0,tot=0,ss=0,st=0,td=[];
for(let t=0;t<base.length;t++){
  const x=base[t]||[], y=keys[t]||[], L=Math.max(x.length,y.length);
  let tp=0,tt=0;
  for(let i=0;i<L;i++){ tot++; tt++; if(x[i]&&y[i]&&x[i]===y[i]){pos++;tp++;} }
  const cnt=k=>{const m={};for(const v of k)m[v]=(m[v]||0)+1;return m;};
  const cx=cnt(x),cy=cnt(y);
  for(const k of new Set([...Object.keys(cx),...Object.keys(cy)])){ ss+=Math.min(cx[k]||0,cy[k]||0); st+=Math.max(cx[k]||0,cy[k]||0); }
  td.push(`T${t+1}:${tt?(tp/tt*100).toFixed(0):'-'}%`);
}
console.log(`  ×${scale.toFixed(2)}       dmg=${Math.round(r.dmg).toLocaleString()}  同位置${(pos/tot*100).toFixed(1)}% / 構成${(ss/st*100).toFixed(1)}%   [${td.join(' ')}]`);
