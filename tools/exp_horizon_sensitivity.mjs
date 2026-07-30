// B2: ホライズン n の感度。「実戦は T3〜T5 で終わるのに 10T を最適化してよいか」を測る。
//   n を変えて【最初の数ターンの押し順】を比較する。n=10 が序盤配分を歪めていれば、
//   短い n の方が実戦に適した順を返す＝kill-turn 実装の必要性/実現可能性に直結。
// ★cap=null（B1 で確立した安定域）で測る＝変化がホライズン由来か不安定性由来かを切り分けるため。
// ★リポジトリ非改変
import { buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, _runRootPlan, _replayResult } from '/home/user/kamipro/src/app.js';
import fs from 'fs';
const nArg=parseInt(process.argv[2]);
const REF='/tmp/claude-0/-home-user-kamipro/2e479ca7-804e-57dc-ba4e-837db3d4c3c4/scratchpad/b2_n10.json';
const GEAR_C={assault:3.06,elem:0.54,vigor:0.6876,spec:0,dmgup:0,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};
setCurrentSubs(['freyja_christmas','artemis']);
buildFormation('napoleon',['hecate','tetra','arianrhod','elaine']);
applyEnemy('ryomen_sukuna');
for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_C[k]??0;
DMG.betaia_mult=3.5; DMG.betaia_cap=800000; DMG.napo_burst_cd_reduce=true;
recalcGearK(); recalcGearKCFromDispAtk(displayAtkOverrideFor('napoleon'));
setStaticOverride({pactcore:1,effond:120});
DMG.enemy_abil_cap=null;                       // 安定域で測る（B1）

const r=_runRootPlan(['factor'],nArg);
const keys=r.rows.map(x=>x.keys);
const hp=DMG.enemy_max_hp;
// 累積とHP%（rows[].dmg は累積）
const cum=r.rows.map(x=>x.dmg??0);
let kill=null; cum.forEach((c,i)=>{ if(kill===null&&c>=hp) kill=i+1; });
if(nArg===10){ fs.writeFileSync(REF,JSON.stringify(keys)); }
const base=fs.existsSync(REF)?JSON.parse(fs.readFileSync(REF,'utf8')):null;
let cmp='';
if(base && nArg!==10){
  // n=10 の最初 nArg ターンと比較（序盤配分が歪んでいるかを見る）
  let pos=0,tot=0,ss=0,st=0;
  for(let t=0;t<nArg;t++){
    const x=base[t]||[], y=keys[t]||[], L=Math.max(x.length,y.length);
    for(let i=0;i<L;i++){ tot++; if(x[i]&&y[i]&&x[i]===y[i]) pos++; }
    const cnt=k=>{const m={};for(const v of k)m[v]=(m[v]||0)+1;return m;};
    const cx=cnt(x),cy=cnt(y);
    for(const k of new Set([...Object.keys(cx),...Object.keys(cy)])){ ss+=Math.min(cx[k]||0,cy[k]||0); st+=Math.max(cx[k]||0,cy[k]||0); }
  }
  cmp=`  vs n=10の同区間: 同位置${(pos/tot*100).toFixed(1)}% / 構成${(ss/st*100).toFixed(1)}%`;
}
// T1..min(nArg,5) の累積HP%（序盤の前倒し度）
const front=cum.slice(0,Math.min(nArg,5)).map((c,i)=>`T${i+1}:${(c/hp*100).toFixed(1)}%`).join(' ');
console.log(`  n=${String(nArg).padStart(2)}  総ダメ=${Math.round(r.dmg).toLocaleString().padStart(14)}  撃破=${kill?'T'+kill:'—'}  序盤累積[${front}]${cmp}`);
