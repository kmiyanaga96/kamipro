#!/usr/bin/env node
// T1 実機較正スクリプト
// 実ギア設定を手動で適用し、T1を実行してフレーム別ダメージを出力する。
// 実機値と突き合わせてmiscや係数を較正する。

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let code = html.slice(html.indexOf('// ===== ゲーム定数'), html.indexOf('// ===== UI HELPERS'));
code += '\nglobalThis.Sim=Sim;globalThis.buildFormation=buildFormation;'
      + 'globalThis.DMG=DMG;globalThis.CHARS=CHARS;globalThis.GEAR=GEAR;'
      + 'globalThis.GEAR_K=0;globalThis.GEAR_K_C={};';
(0,eval)(code);

buildFormation('edison', ['yamato','hecate','tetra','elaine']);

// ===== 実ギア設定を適用 =====
// 守護×2: weapon_amp = 0.40×2 = 0.80
// ユーザー入力値(UIの%入力) × (1 + weapon_amp=0.80) でGEARにセット
const WEAPON_AMP = 0.80; // 守護×2
const w = 1 + WEAPON_AMP;

// UIから入力した生値(%)をそのままセット(weapon_amp 済みの実効値として扱う)
// ※UIのapplyGear()は v/100*(1+weaponAmp)で計算するため、
// ここでは「UIに入力した数値」を入力値として使用する。
const rawInputPct = {
  assault:   151.0,  // アサルト
  vigor:      34.6,  // 旺盛
  crit_rate:   7.5,  // 会心発動率
  acute:       4.0,  // 急所
  na_dmg:     40.0,  // 通常攻撃ダメUP (テクニカ等)
  abi_dmg:    50.0,  // アビダメUP
  burst_dmg:  225.0, // バーストダメUP
  na_cap:     12.5,  // 通常ダメ上限UP
  abi_cap:    25.0,  // アビダメ上限UP
  burst_cap:  107.0, // バーストダメ上限UP
};
for(const [box, pct] of Object.entries(rawInputPct)){
  GEAR[box] = (pct/100) * w;
}

// GEAR_K_C を表示攻撃力ベースで構築 (dmgup/other=0, misc=DMG.misc=1.0, enemy_def=10)
const DISPLAY_ATK = {
  edison: 78306, yamato: 62999, hecate: 59226, tetra: 65436, elaine: 63537,
};
const DISPLAY_HP = {
  edison: 0, yamato: 0, hecate: 0, tetra: 0, elaine: 0,
};
for(const [k,v] of Object.entries(DISPLAY_ATK)){
  if(v > 0) GEAR_K_C[k] = v * (1+GEAR.dmgup) * (1+GEAR.other) * DMG.misc / DMG.enemy_def;
}
// GEAR_K フォールバック
GEAR_K = DMG.base_atk * (1+GEAR.dmgup) * (1+GEAR.other) * DMG.misc / DMG.enemy_def;

// ===== 計装 =====
const frameLog = {};
const burstLog = [];
let capture = false;
let realSim = null;

const _decayOrig = Sim.prototype._decay;
Sim.prototype._decay = function(frame, raw, base, up){
  const out = _decayOrig.call(this, frame, raw, base, up);
  if(capture && this === realSim){
    let label = frame;
    if(frame === 'abi'){
      const caps = [
        ['droid',   DMG.droid_react_cap],
        ['effond',  DMG.effond_cap],
        ['judg',    DMG.judg_cap],
        ['consort', DMG.consort_cap],
      ];
      const match = caps.map(([n,c])=>[n, Math.abs((base||0)-c*1.45)/(c||1)])
                       .sort((a,b)=>a[1]-b[1])[0];
      label = (match && match[1] < 0.8) ? `abi:${match[0]}` : 'abi:?';
    }
    const f = (frameLog[label] ??= {count:0, raw:0, out:0});
    f.count++; f.raw += raw; f.out += out;
  }
  return out;
};

const _burstOrig = Sim.prototype.burst;
Sim.prototype.burst = function(owner, bset, T, atk=false){
  const before = this.dmg;
  _burstOrig.call(this, owner, bset, T, atk);
  if(capture && this === realSim){
    burstLog.push({owner, atk, delta: Math.round(this.dmg - before)});
  }
};

const fmt = n => Math.round(n).toLocaleString('en-US');

// ===== T1を実行してダンプ =====
const sim = new Sim();
realSim = sim;
capture = true;
const dmgBefore = sim.dmg;
const r = sim.greedyTakeTurn(1);
capture = false;
const turnDmg = r.dmg - dmgBefore;

console.log('\n' + '='.repeat(70));
console.log('T1 較正ダンプ (misc='+DMG.misc+', enemy_def='+DMG.enemy_def+')');
console.log('='.repeat(70));

console.log('ギア設定:');
for(const [k,v] of Object.entries(GEAR).filter(([,v])=>v!==0))
  console.log(`  ${k.padEnd(12)} = ${(v*100).toFixed(2)}%`);

console.log('\n押し順:');
console.log('  '+(r.ord.length ? r.ord.map(o=>`[${o.color}]${o.text}`).join(' → ') : '(なし)'));
console.log(`FB:${r.atk.length}/5  J:${r.ju}  renri:${r.renri}`);

console.log('\nロボ: droid='+r.droid+'  banoshik_robot='+r.banoshik_robot);

console.log('\nフレーム別ダメージ:');
const order = ['na','abi:judg','abi:effond','abi:droid','abi:consort','abi:?','burst','streak','hard'];
const frames = Object.keys(frameLog).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
for(const f of frames){
  const x = frameLog[f];
  console.log(`  ${f.padEnd(12)} out=${fmt(x.out).padStart(12)}  raw=${fmt(x.raw).padStart(12)}  n=${x.count}`);
}

console.log('\nバースト内訳(per-char):');
for(const b of burstLog)
  console.log(`  ${b.owner.padEnd(8)} ${b.atk?'(攻撃)':'(誘発)'}  delta=${fmt(b.delta).padStart(12)}`);

console.log(`\n▶ T1総ダメージ(model): ${fmt(turnDmg)}`);

// ===== 実機値との比較 =====
const actual = {
  total:     36780555,
  burst:     21091345,
  streak:    7831700,
  jd:        6268887,
  ef:        1188623,
  // スクショ2の単発値
  burst_event: 36956683,
  jd_event:    5538941,
  effond_event:7932066,
};

console.log('\n=== 実機値との比較 ===');
console.log(`  T1総ダメ  model=${fmt(turnDmg).padStart(14)}  actual=${fmt(actual.total).padStart(14)}`);
const ratio = turnDmg / actual.total;
console.log(`  比率 (model/actual) = ${ratio.toFixed(4)}  → miscを${(DMG.misc/ratio).toFixed(2)}倍にすると合致`);

// abi:judg の単発あたり
if(frameLog['abi:judg']){
  const jd = frameLog['abi:judg'];
  const perHit = jd.out / jd.count;
  console.log(`\nJD ph0: model=${fmt(perHit)}/hit × ${jd.count}hits = ${fmt(jd.out)}`);
  console.log(`  実機: 39~41万/hit × 10hits (×Nactivations) + 140万追撃`);
  // judg_cap effective
  const cap_eff = DMG.judg_cap * (1 + GEAR.abi_cap);
  console.log(`  effective judg_cap = ${fmt(cap_eff)}  (base=${fmt(DMG.judg_cap)} × (1+${(GEAR.abi_cap*100).toFixed(1)}%))`);
}

// effond
if(frameLog['abi:effond']){
  const ef = frameLog['abi:effond'];
  const perHit = ef.out / ef.count;
  console.log(`\nEffond abi: model=${fmt(perHit)}/hit × ${ef.count}hits = ${fmt(ef.out)}`);
  console.log(`  実機: ~65万 (アビダメ部分のみ)`);
  const cap_eff = DMG.effond_cap * (1 + GEAR.abi_cap);
  console.log(`  effective effond_cap = ${fmt(cap_eff)}`);
}

// バースト per-char
const actualBurst = {
  edison: 3680000, yamato: 3250000, hecate: 3460000, tetra: 3500000, elaine: 3440000,
};
const actualFollow = {
  edison: 2830000, yamato: 2270000, hecate: 2300000, tetra: 2300000, elaine: 1810000,
};
console.log('\nバースト本体 比較:');
for(const b of burstLog.filter(b=>b.atk===false)){
  const act = actualBurst[b.owner]||0;
  if(act) console.log(`  ${b.owner.padEnd(8)} model=${fmt(b.delta).padStart(10)}  actual=${fmt(act).padStart(10)}  ratio=${(b.delta/act).toFixed(3)}`);
}

console.log('\nバースト追撃 比較:');
for(const b of burstLog.filter(b=>b.atk===true)){
  const act = actualFollow[b.owner]||0;
  if(act) console.log(`  ${b.owner.padEnd(8)} model=${fmt(b.delta).padStart(10)}  actual=${fmt(act).padStart(10)}  ratio=${(b.delta/act).toFixed(3)}`);
}

// misc推定
console.log('\n=== misc較正推定 ===');
console.log('注: model/actual比 ≠ 1 の場合、その逆数がmiscの補正倍率の目安。');
console.log('ただし減衰域では非線形なため、正確な較正には反復計算が必要。');
