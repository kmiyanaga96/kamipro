// B4: 較正ボスを walpurgis_loki へ切り替えた場合に、C37 の探索不安定性が実際に消えるかを検証する。
//   B1 は「両面宿儺のまま abilCap だけ無効化」で原因を特定した（=cap が原因）。本実験は
//   **実際に使う敵（loki）そのもの**で同じ ATK 感度を測る＝切替の受入判定。
//   loki は barrier も abilCapPerTurn も持たない（def10 暫定 / HP9.8億 / 幻・affinity1.5）。
//
// 比較対象（いずれも napoleon/arianrhod・prefix=[factor]・BW64・n=10・同一 GEAR/subs）:
//   実験2  宿儺 cap=19  : ×0.90 同位置55.3% / ×1.10 29.5% / ×1.25 25.3%・**非単調**
//   B1     宿儺 cap=null: ×0.90 88.8% / ×1.10 85.8% / ×1.25 78.8%・**厳密単調**
//   B4(本) loki        : ← これを測る。B1 並みに安定なら切替の根拠が実敵で裏付けられる。
//
// ⚠ **ビームのみ**（局所探索は通さない）。B1/実験2 は C27 リファイン経由だが当編成では C27 が発火しない
//    （§6e）ため実質ビーム単体＝**同一条件での比較になる**。LS を挟むと後処理の強さが交絡し、
//    「探索が安定したか」を測れなくなる。LS 込みの production 挙動は別途測ること。
// ★E2: 実験前に config_sukuna_v2 の記録値と bit 一致を確認（GEAR/subs/ATK/英霊武器設定の再現検証）。
// ★リポジトリ非改変（src/* を import するだけ）
//
// 使い方: node tools/exp_loki_stability.mjs <scale>   … 1.00 を最初に走らせて基準キー列を保存する
import { buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, Sim, _replayResult } from '/home/user/kamipro/src/app.js';
import fs from 'fs';
const n=10, scale=parseFloat(process.argv[2]);
const REF=(process.env.SCRATCH||'/tmp')+'/b4_loki_base.json';
const GEAR_C={assault:3.06,elem:0.54,vigor:0.6876,spec:0,dmgup:0,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};

function setup(enemy){
  setCurrentSubs(['freyja_christmas','artemis']);
  buildFormation('napoleon',['hecate','tetra','arianrhod','elaine']);
  applyEnemy(enemy);
  for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_C[k]??0;
  DMG.betaia_mult=3.5; DMG.betaia_cap=800000; DMG.napo_burst_cd_reduce=true;
  recalcGearK();
}
// ── E2: 環境（GEAR/subs/ATK/英霊武器）の再現検証。敵だけが本番と異なる。
setup('ryomen_sukuna');
const c=JSON.parse(fs.readFileSync('/home/user/kamipro/simulation/sim05/data/config_sukuna_v2.json','utf8')).entries[0][1];
recalcGearKCFromDispAtk(c.dispAtk); setStaticOverride(c.override||{});
const chk=Math.round(_replayResult(c.turnsKeys,10).dmg);
if(chk!==Math.round(c.dmg)){ console.log(`  ❌環境再現 失敗: ${chk.toLocaleString()} != ${Math.round(c.dmg).toLocaleString()}`); process.exit(1); }
if(scale===1.00) console.log(`  ✅環境再現 bit一致 (${chk.toLocaleString()}) — 以降は敵を loki へ差し替え`);

// ── 本番: 敵 = walpurgis_loki（barrier/abilCap なし）
setup('walpurgis_loki');
recalcGearKCFromDispAtk(Object.fromEntries(Object.entries(displayAtkOverrideFor('napoleon')).map(([k,v])=>[k,Math.round(v*scale)])));
setStaticOverride({pactcore:1,effond:120});
const t0=Date.now();
const sim=new Sim(); sim.totalTurns=n; sim._forcePrefix=['factor']; sim._forceTurn=1;
const rows=[]; for(let t=1;t<=n;t++) rows.push(sim.greedyTakeTurn(t));
const keys=rows.map(x=>x.keys);
const mp=Math.max(...rows.map(x=>x.ability)), fb=rows.filter(x=>x.full).length;
const sec=((Date.now()-t0)/1000).toFixed(0);
if(scale===1.00){ fs.writeFileSync(REF,JSON.stringify(keys));
  console.log(`  ×1.00(基準) dmg=${Math.round(sim.dmg).toLocaleString()}  FB=${fb}/10 maxPress=${mp}  (${sec}s / cap=${DMG.enemy_abil_cap} barrier=${DMG.enemy_barrier})`);
  process.exit(0); }
const base=JSON.parse(fs.readFileSync(REF,'utf8'));
let pos=0,tot=0,ss=0,st=0;
for(let t=0;t<base.length;t++){
  const x=base[t]||[], y=keys[t]||[], L=Math.max(x.length,y.length);
  for(let i=0;i<L;i++){ tot++; if(x[i]&&y[i]&&x[i]===y[i]) pos++; }
  const cnt=k=>{const m={};for(const v of k)m[v]=(m[v]||0)+1;return m;};
  const cx=cnt(x),cy=cnt(y);
  for(const k of new Set([...Object.keys(cx),...Object.keys(cy)])){ ss+=Math.min(cx[k]||0,cy[k]||0); st+=Math.max(cx[k]||0,cy[k]||0); }
}
console.log(`  ×${scale.toFixed(2)}       dmg=${Math.round(sim.dmg).toLocaleString()}  同位置${(pos/tot*100).toFixed(1)}% / 構成${(ss/st*100).toFixed(1)}%  FB=${fb}/10 maxPress=${mp}  (${sec}s)`);
