// fit_probe.mjs — sim04 スカラfit用: configB headless で「エンジン期待値」を算出し実機meanと突合。
// エンジンは会心/急所を期待値スメアで持つため、比較は「エンジン期待hit ↔ 実機mean(全hit平均)」で行う（両者とも会心/急所の平均）。
// 実行: node simulation/sim04/analysis/fit_probe.mjs
import { Sim, buildFormation, GEAR, DMG, recalcGearK, recalcGearKCFromDispAtk, ownerOf } from '../../../src/app.js';

// --- configB セットアップ ---
buildFormation('edison', ['yamato','hecate','tetra','elaine']);
const CB = {assault:3.06,elem:0,vigor:0.6876,spec:0,dmgup:0.09,acute:0.144,crit_rate:0.405,other:0,na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};
for(const k of Object.keys(CB)) GEAR[k]=CB[k];
DMG.affinity=1.5; DMG.enemy_def=10; DMG.enemy_max_hp=400000000;
recalcGearK();
recalcGearKCFromDispAtk({edison:96756,yamato:75898,hecate:73727,tetra:81887,elaine:82248});

const s=new Sim();
// エンジンの通常攻撃期待hit = _decay('na', _na()*(1+na_dmg))
function engNormal(owner, buf={}){ s.buf=buf; s._naOwner=owner; return s._decay('na', s._na()*(1+GEAR.na_dmg)); }
// エンジンの judg ph0 1hit = _decay('abi', _naForAbi*(judg_mult+abi_dmg+db.dmg), judg_cap*(1+db.cap))  (C31適用後)
function engJudg(owner, buf={}, N=0){ s.buf=buf; s._naOwner=owner;
  const db={dmg:N*DMG.abi_dmg_droid, cap:N*DMG.abi_cap_droid};
  return s._decay('abi', s._naForAbi()*(DMG.judg_mult+GEAR.abi_dmg+db.dmg), DMG.judg_cap*(1+db.cap)); }

// --- 実機mean（M3 T3=無バフ通常・全hit平均／M2a judg=N別mean） ---
const realT3={edison:608841,yamato:509635,hecate:451598,tetra:537616,elaine:553227};
const realJudg={0:438076,1:442573,2:457451}; // N別 全hit mean

console.log('=== 通常(na) エンジン期待 vs 実機T3mean（無バフ・configB） ===');
let sumR=0,sumE=0;
for(const c of ['edison','yamato','hecate','tetra','elaine']){
  const e=engNormal(c,{}); const r=realT3[c]; sumR+=r; sumE+=e;
  console.log(`  ${c}: engine=${Math.round(e).toLocaleString()} / real=${r.toLocaleString()} → 実機/sim=${(r/e).toFixed(3)}`);
}
console.log(`  → na 全体 実機/sim = ${(sumR/sumE).toFixed(3)}  ⇒ calib_na 候補`);

console.log('\n=== judg ph0 エンジン期待 vs 実機mean（テトラ・battle-start=omni有） ===');
for(const N of [0,1,2]){
  const e=engJudg('tetra',{omni:[1]},N); const r=realJudg[N];
  console.log(`  N=${N}: engine=${Math.round(e).toLocaleString()} / real=${r.toLocaleString()} → 実機/sim=${(r/e).toFixed(3)}`);
}
// omni無しのjudgも見る（omniがjudgに効くか＝spec-scope確認）
console.log(`  参考(omni無 N=0): engine=${Math.round(engJudg('tetra',{},0)).toLocaleString()}`);

// --- バースト本体 エンジン期待 vs 実機M1 T2 body ---
import { CHAR_DEF } from '../../../src/app.js';
function engBurstCore(owner, buf={}){
  s.buf=buf; s._naOwner=owner;
  const naB=s._na();
  const coef_a=CHAR_DEF[owner].burst_coef_a??5, coef_b=CHAR_DEF[owner].burst_coef_b??2500;
  // bdmg: ARRIVE(全光)=0.20 passive のみ(M1はアビ0)。GEAR.burst_dmg=5.22。C34: min(bdmg+burst_dmg,5.0)
  const bdmg=0.20;
  const selfBonus=CHAR_DEF[owner].burstBonus?.(s)||0; // M1はinori/funki無=0
  const capBonus=(CHAR_DEF[owner].burstCapBonus?.(s)??0)+DMG.sub_burst_cap;
  const core=s._decay('burst', naB*(coef_a+Math.min(bdmg+GEAR.burst_dmg,DMG.burst_dmg_cap)+selfBonus)+coef_b, DMG.decay_burst.cap1*(1+capBonus));
  return core;
}
const realBody={edison:3392830,yamato:2928421,hecate:3277097,tetra:3273145,elaine:3436836};
const arriveFlat=DMG.bplus_arrive||343000;
console.log('\n=== バースト本体 エンジンcore vs 実機M1body（yamato_elem: edison/yamato=0, hecate/tetra/elaine=1stack想定） ===');
let sBR=0,sBE=0;
for(const c of ['edison','yamato','hecate','tetra','elaine']){
  const yel = (c==='hecate'||c==='tetra'||c==='elaine')?{yamato_elem:[3]}:{};
  const core=engBurstCore(c,yel); const r=realBody[c];
  sBR+=r; sBE+=core;
  console.log(`  ${c}: core=${Math.round(core).toLocaleString()} / core+ARRIVEflat=${Math.round(core+arriveFlat).toLocaleString()} / real=${r.toLocaleString()} → 実機/core=${(r/core).toFixed(3)}`);
}
console.log(`  → burst core 全体 実機/sim = ${(sBR/sBE).toFixed(3)}  ⇒ calib_burst 候補`);
