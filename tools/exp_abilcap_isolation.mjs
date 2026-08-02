// B1: abilCap の切り分け。同一の両面宿儺のまま enemy_abil_cap だけを null にして ATK感度を再測する。
//   敵を入れ替えると cap/def/barrier が同時に動くため、**1変数のみ**を変える設計にした。
//   比較対象: 実験2（cap=19・同一手続き）＝×0.90 55.3% / ×1.10 29.5% / ×1.25 25.3%・ダメージ非単調。
//   判定: cap を外して単調＆押し順安定になれば原因は abilCap、変わらなければ原因はアリアン holy（編成側）。
// ★E2: 実験前に既知値（config_sukuna_v2 の記録値）との bit 一致を確認する。★リポジトリ非改変
import { buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, _runRootPlan, _replayResult } from '/home/user/kamipro/src/app.js';
import fs from 'fs';
const n=10, scale=parseFloat(process.argv[2]);
const REF='/tmp/claude-0/-home-user-kamipro/2e479ca7-804e-57dc-ba4e-837db3d4c3c4/scratchpad/b1_base.json';
const GEAR_C={assault:3.06,elem:0.54,vigor:0.6876,spec:0,dmgup:0,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};

function setup(){
  setCurrentSubs(['freyja_christmas','artemis']);
  buildFormation('napoleon',['hecate','tetra','arianrhod','elaine']);
  applyEnemy('ryomen_sukuna');
  for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_C[k]??0;
  DMG.betaia_mult=3.5; DMG.betaia_cap=800000; DMG.napo_burst_cd_reduce=true;
  recalcGearK();
}
// ── E2: config 再現の検証（cap=19 のまま・override {}・正しいATK → 1,988,538,373）
setup();
const c=JSON.parse(fs.readFileSync('/home/user/kamipro/archive/caches/sim05_sukuna_v2.json','utf8')).entries[0][1];
recalcGearKCFromDispAtk(c.dispAtk); setStaticOverride(c.override||{});
const chk=Math.round(_replayResult(c.turnsKeys,10).dmg);
if(chk!==Math.round(c.dmg)){ console.log(`  ❌config再現 失敗: ${chk.toLocaleString()} != ${Math.round(c.dmg).toLocaleString()}`); process.exit(1); }
if(scale===1.00) console.log(`  ✅config再現 bit一致 (${chk.toLocaleString()})`);

// ── 本番: cap のみ無効化
setup();
recalcGearKCFromDispAtk(Object.fromEntries(Object.entries(displayAtkOverrideFor('napoleon')).map(([k,v])=>[k,Math.round(v*scale)])));
setStaticOverride({pactcore:1,effond:120});
DMG.enemy_abil_cap=null;                       // ★これだけが実験2との差分
const r=_runRootPlan(['factor'],n);
const keys=r.rows.map(x=>x.keys);
const mp=Math.max(...r.rows.map(x=>x.ability));
if(scale===1.00){ fs.writeFileSync(REF,JSON.stringify(keys));
  console.log(`  ×1.00(基準) dmg=${Math.round(r.dmg).toLocaleString()}  maxPress=${mp} (cap=${DMG.enemy_abil_cap})`); process.exit(0); }
const base=JSON.parse(fs.readFileSync(REF,'utf8'));
let pos=0,tot=0,ss=0,st=0;
for(let t=0;t<base.length;t++){
  const x=base[t]||[], y=keys[t]||[], L=Math.max(x.length,y.length);
  for(let i=0;i<L;i++){ tot++; if(x[i]&&y[i]&&x[i]===y[i]) pos++; }
  const cnt=k=>{const m={};for(const v of k)m[v]=(m[v]||0)+1;return m;};
  const cx=cnt(x),cy=cnt(y);
  for(const k of new Set([...Object.keys(cx),...Object.keys(cy)])){ ss+=Math.min(cx[k]||0,cy[k]||0); st+=Math.max(cx[k]||0,cy[k]||0); }
}
console.log(`  ×${scale.toFixed(2)}       dmg=${Math.round(r.dmg).toLocaleString()}  同位置${(pos/tot*100).toFixed(1)}% / 構成${(ss/st*100).toFixed(1)}%  maxPress=${mp}`);
