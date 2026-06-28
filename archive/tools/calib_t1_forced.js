#!/usr/bin/env node
// T1 実機較正 — 実際の押し順を強制リプレイ
// 押し順: エレイン3(knights)→エジソン2(banoshik)→エジソン1(droid)→エジソン4(amplifa)
//         →ヤマト1(inori)→ヘカテー1(puvoir)→ヘカテー3(sleur)→テトラ2(absolute)
//         →エジソン3(ifishant)→ヤマト3(funki)→テトラ3(divinus)
//         →エレイン2(legend)→エレイン2(legend)→ヘカテー2(effond)→テトラ1(judg)→[FB]

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

// エンジン抽出: ゲーム定数 〜 UI HELPERS 直前
let code = html.slice(html.indexOf('// ===== ゲーム定数'), html.indexOf('// ===== UI HELPERS'));

// グローバル公開 (GEAR_K_C は let なので参照を公開)
code += `
globalThis.Sim=Sim;
globalThis.buildFormation=buildFormation;
globalThis.DMG=DMG;
globalThis.CHARS_ref=CHARS;
globalThis.GEAR=GEAR;            // const object → 参照共有 OK
globalThis.GEAR_K_ref=()=>GEAR_K;
globalThis.GEAR_K_C=GEAR_K_C;   // let → 参照を公開(上書き禁止)
globalThis.ABIL=ABIL;
globalThis.CHAR_REGISTRY_ref=CHAR_REGISTRY;
globalThis.ownerOf=ownerOf;
globalThis.recalcGearK=recalcGearK;

// ギア設定関数(eval内で実行されるためGEAR/GEAR_K_C/GEAR_K が正しいスコープ)
globalThis.applyTestGear = function(rawPct, dispAtk, miscVal){
  DMG.misc = miscVal;
  const WEAPON_AMP=0.80; const w=1+WEAPON_AMP;
  for(const [b,p] of Object.entries(rawPct)) GEAR[b]=(p/100)*w;
  recalcGearK();
  // GEAR_K_C を per-char dispAtk ベースで設定
  for(const k of Object.keys(GEAR_K_C)) delete GEAR_K_C[k];
  for(const [k,v] of Object.entries(dispAtk))
    GEAR_K_C[k]=v*(1+GEAR.dmgup)*(1+GEAR.other)*DMG.misc/DMG.enemy_def;
};
`;
(0,eval)(code);

buildFormation('edison',['yamato','hecate','tetra','elaine']);

// ===== ギア設定 =====
const rawPct = {
  assault:151, vigor:34.6, crit_rate:7.5, acute:4.0,
  na_dmg:40, abi_dmg:50, burst_dmg:225, na_cap:12.5, abi_cap:25, burst_cap:107,
};
const DISP_ATK = {edison:78306,yamato:62999,hecate:59226,tetra:65436,elaine:63537};
const MISC_TEST = 1.0; // ここを変えてiterateする
applyTestGear(rawPct, DISP_ATK, MISC_TEST);

// ===== 計装 =====
const frameLog={}, burstLog=[];
let capture=false, realSim=null;

const _decayOrig=Sim.prototype._decay;
Sim.prototype._decay=function(frame,raw,base){
  const out=_decayOrig.call(this,frame,raw,base);
  if(capture&&this===realSim){
    let label=frame;
    if(frame==='abi'){
      const caps=[['judg',DMG.judg_cap],['effond',DMG.effond_cap],['droid',DMG.droid_react_cap],['consort',DMG.consort_cap]];
      const eff=base??Infinity;
      const match=caps.map(([n,c])=>[n,Math.abs(eff-c)/c]).sort((a,b)=>a[1]-b[1])[0];
      label=(match&&match[1]<0.4)?`abi:${match[0]}`:'abi:?';
    }
    const f=(frameLog[label]??={count:0,raw:0,out:0});
    f.count++; f.raw+=raw; f.out+=out;
  }
  return out;
};

const _burstOrig=Sim.prototype.burst;
Sim.prototype.burst=function(owner,bset,T,atk=false){
  // naB を burst()内と同じ方法で取得(owner設定後)
  this._naOwner=owner;
  const naB_snap=Math.round(this._na());
  const before=this.dmg;
  _burstOrig.call(this,owner,bset,T,atk);
  if(capture&&this===realSim){
    burstLog.push({owner,atk,delta:Math.round(this.dmg-before),naB:naB_snap});
  }
};

const fmt=n=>Math.round(n).toLocaleString('en-US');

// ===== 強制リプレイ =====
const sim=new Sim();
realSim=sim;
sim._beginTurn(1);

capture=true;
const dmgBefore=sim.dmg;

const moves=['knights','banoshik','droid','amplifa','inori','puvoir','sleur','absolute',
             'ifishant','funki','divinus','legend','legend','effond','judg'];
for(const m of moves) sim._execKeyNoGuard(m);

// FB攻撃フェイズ
const atk=sim._attackPhase();

capture=false;
const turnDmg=sim.dmg-dmgBefore;
sim._endBookkeep(1);

// ===== レポート =====
const fmt12=n=>fmt(n).padStart(12);
console.log(`\n${'='.repeat(70)}`);
console.log(`T1 強制リプレイ (misc=${MISC_TEST})`);
console.log(`${'='.repeat(70)}`);

console.log('\nGEAR_K_C:');
for(const [k,v] of Object.entries(GEAR_K_C)) console.log(`  ${k.padEnd(8)} = ${fmt(v)}`);

console.log('\nフレーム別ダメージ:');
const forder=['na','abi:judg','abi:effond','abi:droid','abi:consort','abi:?','burst','streak'];
const frames=Object.keys(frameLog).sort((a,b)=>{
  const ai=forder.indexOf(a),bi=forder.indexOf(b);
  return (ai<0?99:ai)-(bi<0?99:bi);
});
for(const f of frames){
  const x=frameLog[f];
  console.log(`  ${f.padEnd(12)} out=${fmt12(x.out)}  raw=${fmt12(x.raw)}  n=${x.count}`);
}

console.log('\nバースト内訳:');
for(const b of burstLog){
  const gkc=GEAR_K_C[b.owner];
  console.log(`  ${b.owner.padEnd(8)} ${b.atk?'[FB]   ':'[誘発]'} naB=${fmt(b.naB).padStart(9)}  GEAR_K_C=${fmt(gkc||0).padStart(7)}  delta=${fmt12(b.delta)}`);
}

console.log(`\n▶ T1 model: ${fmt(turnDmg)}   実機: ${fmt(36780555)}   比率: ${(turnDmg/36780555).toFixed(4)}`);

// ===== バースト内訳モデル分解 =====
// burst() の内訳: core + passiveFlat(500K/burst) + followup(naB×3) + [hecate_extra] + [yamato_bplus] + ...
// フレームログ['burst'].out = core + followup の _decay 呼び出し合計(passiveFlat等は含まない)
// ヤマトonAbility: onAbility fires for yamato's OWN abilities only (ABIL[name][0]==='yamato')
//   T1で使用したヤマトアビ: inori(1)・funki(3) = 2スタック × bplus_yamato(100,000) = 200,000
// ヘカテーonBurst: mooncode>0時に追加followup(hecate_extra_mult=3/cap=50万)=全バーストと同式
// 押し順: absolute×1本 / nights(knights)×1本 / ARRIVE(passiveDmg+0.20)
// bdmg(at burst time) = 1×0.30 + 1×0.20 + 0.20 = 0.70
const B_UP=GEAR.burst_cap; // 1.926
const B_CAP=DMG.decay_burst.cap1; // 1,000,000
const B_CAP_EFF=B_CAP*(1+B_UP); // 2,926,000
const FOLL_CAP_EFF=DMG.burst_followup_cap*(1+B_UP); // 1,463,000
const passiveFlat=DMG.bplus_arrive; // 500,000

console.log('\n=== モデルバースト内訳 vs 実機 ===');
// 実機値: 「バースト本体」はゲーム上の1ダメ表示(正確な分類未確定)・参考値として比較
const actual_game={
  edison: {main:3680000, foll:2830000},
  yamato: {main:3250000, foll:2270000},
  hecate: {main:3460000, foll:2300000}, // FB分のみ(誘発3,437,747は別)
  tetra:  {main:3500000, foll:2300000},
  elaine: {main:3440000, foll:1810000},
};
console.log(`  burst_cap_eff=${fmt(B_CAP_EFF)}  followup_cap_eff=${fmt(FOLL_CAP_EFF)}`);
console.log(`  passiveFlat/burst=${fmt(passiveFlat)}  yamato_bplus(2スタック)=${fmt(2*DMG.bplus_yamato)}\n`);

for(const b of burstLog.filter(x=>x.atk)){
  const owner=b.owner;
  const cdef=CHAR_REGISTRY_ref[owner]?.def||{};
  const a=cdef.burst_coef_a??5, b_coef=cdef.burst_coef_b??2500;
  // selfBonus: ヤマト=inori_burst(5)+funki_burst(0, T1なし) / 他=0
  const selfBonus = owner==='yamato' ? DMG.burst_inori : 0;
  const naB=b.naB;
  // bdmg: absolute=1スタック, nights=1スタック, ARRIVE=0.20
  const bdmg = 1*DMG.burst_dmg_absolute + 1*DMG.burst_dmg_nights + DMG.burst_dmg_arrive;
  const coef = a + bdmg + GEAR.burst_dmg + selfBonus;
  const raw_core = naB*coef + b_coef;
  const core = raw_core<=B_CAP_EFF ? raw_core : B_CAP_EFF+(raw_core-B_CAP_EFF)*DMG.decay_burst.slope;
  const raw_foll = naB*DMG.burst_followup_mult;
  const followup = raw_foll<=FOLL_CAP_EFF ? raw_foll : FOLL_CAP_EFF+(raw_foll-FOLL_CAP_EFF)*DMG.decay_burst.slope;
  // ヘカテーは mooncode>0 時に onBurst で追加followup(同じ式)
  const extra = owner==='hecate' ? followup : 0;
  // yamato_bplus: 2スタック × 100K(inori+funki の2本)
  const yamato_extra = owner==='yamato' ? 2*DMG.bplus_yamato : 0;

  const model_main = core + passiveFlat + followup + extra + yamato_extra;
  const model_foll_only = followup; // 追撃単体
  const act = actual_game[owner];
  const act_total = act ? act.main+act.foll : 0;
  const ratio_main = act ? (act.main/model_main).toFixed(3) : '-';
  const ratio_total= act ? (act_total/(b.delta)).toFixed(3) : '-';
  console.log(`  ${owner.padEnd(8)} naB=${fmt(naB).padStart(8)}`);
  console.log(`    core=${fmt(Math.round(core))}  flat=${fmt(passiveFlat)}  foll=${fmt(Math.round(followup))}  extra=${fmt(extra)}  bplus=${fmt(yamato_extra)}`);
  console.log(`    model_main(core+flat+foll+extra+bplus)=${fmt(Math.round(model_main))}  実機main=${act?fmt(act.main):'-'}  ratio=${ratio_main}`);
  console.log(`    model_delta=${fmt(b.delta)}  実機(main+追撃)=${act?fmt(act_total):'-'}  ratio=${ratio_total}`);
  console.log();
}

// ===== misc推定まとめ =====
console.log('=== misc推定まとめ ===');
console.log('仮説: "実機main" ≈ core+passiveFlat+followup (+hecate_extra/yamato_bplus)');
console.log('      model_main は misc=1 計算値。実機/model比 = misc の近似。');
for(const b of burstLog.filter(x=>x.atk)){
  const owner=b.owner;
  const cdef=CHAR_REGISTRY_ref[owner]?.def||{};
  const a=cdef.burst_coef_a??5, b_coef=cdef.burst_coef_b??2500;
  const selfBonus=owner==='yamato'?DMG.burst_inori:0;
  const naB=b.naB;
  const bdmg=1*DMG.burst_dmg_absolute+1*DMG.burst_dmg_nights+DMG.burst_dmg_arrive;
  const coef=a+bdmg+GEAR.burst_dmg+selfBonus;
  const raw_core=naB*coef+b_coef;
  const core=raw_core<=B_CAP_EFF?raw_core:B_CAP_EFF+(raw_core-B_CAP_EFF)*DMG.decay_burst.slope;
  const raw_foll=naB*DMG.burst_followup_mult;
  const followup=raw_foll<=FOLL_CAP_EFF?raw_foll:FOLL_CAP_EFF+(raw_foll-FOLL_CAP_EFF)*DMG.decay_burst.slope;
  const extra=owner==='hecate'?followup:0;
  const yamato_extra=owner==='yamato'?2*DMG.bplus_yamato:0;
  const model_main=core+passiveFlat+followup+extra+yamato_extra;
  const act=actual_game[owner];
  if(act) console.log(`  ${owner.padEnd(8)} misc推定=${((act.main)/model_main).toFixed(3)}`);
}

console.log('\n=== JD較正 ===');
// abi:judg は effond(n=1) と judg(n=1) が同じ cap=350K で同分類される(n=2)
// JD ph0 = 1 _decay呼び出し だが sim.dmg += 10×hit。frameLog は1回分のみ捕捉。
// effond abi も同様に 1 _decay = sim.dmg += 1×hit。
// abi:judg.out = effond_hit + judg_single_hit (×10 は外部で乗算、ここでは捕捉できない)
const jdAll=frameLog['abi:judg'];
if(jdAll){
  // abi:judg n=2: 1=effond, 1=judg ph0 単発。judg_single ≈ out/2(両capが等しいため近似)
  const judg_single=jdAll.out/2; // 近似
  const effond_single=jdAll.out-judg_single;
  const cap_eff=DMG.judg_cap*(1+GEAR.abi_cap);
  console.log(`  abi:judg n=${jdAll.count} out=${fmt(Math.round(jdAll.out))} (effond≈${fmt(Math.round(effond_single))} + judg1hit≈${fmt(Math.round(judg_single))})`);
  const JUDG_HITS=10; // JD ph0 = 10hits (ゲーム定数)
  const judg_total_model=judg_single*JUDG_HITS;
  console.log(`  JD ph0 model total = judg1hit×${JUDG_HITS} ≈ ${fmt(Math.round(judg_total_model))}`);
  console.log(`  実機: ~40万/hit×10hits = 400万  model1hit≈${fmt(Math.round(judg_single))}  実機/model比≈${(400000/judg_single).toFixed(3)}`);
  console.log(`  effective judg_cap=${fmt(cap_eff)}  実機40万 < cap → raw≈40万 → JD hit formula未減衰域`);
  // naForAbi逆算 from actual hit (no decay)
  const naForAbi_actual=400000/(DMG.judg_mult*(1+GEAR.abi_dmg+2*DMG.abi_cap_droid));
  const naForAbi_model=judg_single/(DMG.judg_mult*(1+GEAR.abi_dmg+2*DMG.abi_cap_droid));
  // ... misc from JD
  const tetra_b=burstLog.find(x=>x.atk&&x.owner==='tetra');
  if(tetra_b) console.log(`  tetra naB(burst時)=${fmt(tetra_b.naB)}  naForAbi(JD時)≈misc×${fmt(Math.round(tetra_b.naB))} → JD misc推定=${(naForAbi_actual/tetra_b.naB).toFixed(3)}`);
}

console.log('\n=== Effond較正 ===');
// effond abi: 1発 実機65万。モデルは abi:judg に合算されているため個別取り出し不可。
// 仮定: effond _decay call のout ≈ abi:judg.out/2 (same cap)
if(jdAll){
  const effond_hit=jdAll.out/2;
  const cap_eff=DMG.effond_cap*(1+GEAR.abi_cap);
  console.log(`  Effond abi model≈${fmt(Math.round(effond_hit))}  実機65万`);
  console.log(`  effective effond_cap=${fmt(cap_eff)}`);
  // naForAbi from actual 65万
  const eff_actual=650000;
  const raw_eff=eff_actual<=cap_eff?eff_actual:cap_eff+(eff_actual-cap_eff)/DMG.decay_abi_slope;
  const naForAbi_eff=raw_eff/(DMG.effond_mult*(1+GEAR.abi_dmg+1*DMG.abi_dmg_droid));
  const hecate_b=burstLog.find(x=>x.atk&&x.owner==='hecate');
  if(hecate_b) console.log(`  hecate naB(burst時)=${fmt(hecate_b.naB)}  effond misc推定≈${(naForAbi_eff/hecate_b.naB).toFixed(3)}`);
}
