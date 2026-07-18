// sim04 §2 冒頭タスク: 「較正前基準順」headless 再探索（構造修正C31〜C35 適用【前】の現行エンジンで取得）。
//   実行: node simulation/sim04/analysis/research_baseline_order.mjs   （リポジトリルートから）
// なぜ今か: 序数diff（README §6-5）の「較正前基準順」は【構造修正の前】の推奨順でなければならない。
//   構造修正後には二度と取得できないため、Opusセッション冒頭で必ずここで確定する。
// なぜ再探索か: configB.json（data/config.json）同梱の turnsKeys は【旧ATK】スケールで探索された値
//   （dispAtk export の構造的制約・README §2 残注意）。本ツールは DISPLAY_ATK_OVERRIDE の【新ATK】＋
//   configB GEAR ＋ configB override {judg:200,pactcore:1} で production 探索を再実行し、新ATKでの推奨順を出す。
// 探索の忠実性: production フォールバック経路（app.js _fallbackRunSim）と同じ
//   _selectRootPrefixes(n) → 各 prefix を _runRootPlan(prefix,n) → 最大dmgを採用、を再現する。
import fs from 'fs';
import { buildFormation, setCurrentSubs, recalcGearKCFromDispAtk, setStaticOverride,
         calibrateStaticScores, _selectRootPrefixes, _runRootPlan, GEAR, DMG, ENGINE_VERSION } from '../../../src/app.js';

// configB シグネチャ（data/config.json の entries[0] キーから復元）
const cache=JSON.parse(fs.readFileSync('simulation/sim04/data/config.json','utf8'));
const [key,val]=cache.entries[0];
const sig=JSON.parse(key.split('|').slice(1).join('|'));
const [hero,kami,gear,subs,def,maxhp,exMult,exCap]=sig;

// 【新ATK】= src/app.js DISPLAY_ATK_OVERRIDE（configB実機値・line110）。configB.json同梱dispAtk（旧値）は使わない。
const NEW_ATK={ edison:96756, yamato:75898, hecate:73727, tetra:81887, elaine:82248 };
const N=10;

// 環境復元（sim_slot_dump.mjs と同型・ただし dispAtk は新ATK）
setCurrentSubs(subs);
buildFormation(hero,kami);
Object.assign(GEAR,gear);
DMG.enemy_def=def; DMG.enemy_max_hp=maxhp;
DMG.edison_burst_extra_mult=exMult; DMG.edison_burst_extra_cap=exCap;
DMG.affinity=1.5;                 // cath_palug 闇 vs 光編成＝有利（configSig非含のため明示・sim_slot_dump注記と同じ）
recalcGearKCFromDispAtk(NEW_ATK);

// ⚠ override は【production と同じ auto-calibration】で決める（旧: configB gate の {judg:200} を固定していたのは誤り＝
//   新ATKでは auto-cal が {judg:160} を選ぶ。実機UI export が {judg:160}/prefix["alone"] で裏取り済み・2026-07-17）。
const t0=Date.now();
const OVERRIDE=calibrateStaticScores(N).override;
setStaticOverride(OVERRIDE);
const prefixes=_selectRootPrefixes(N);
let best=null;
for(const p of prefixes){
  const r=_runRootPlan(p,N);
  if(!best||r.dmg>best.dmg) best=r;
}
setStaticOverride({});
const secs=((Date.now()-t0)/1000).toFixed(1);

const fmt=n=>Math.round(n).toLocaleString();
console.log(`# sim04 較正前基準順 再探索（engine=${ENGINE_VERSION}・新ATK・${secs}s）`);
console.log(`- 編成: ${hero} + [${kami}]  / subs=${JSON.stringify(subs)}  / affinity=1.5`);
console.log(`- 敵: def=${def} max_hp=${fmt(maxhp)} / エジソン英霊 ×${exMult}/${fmt(exCap)}`);
console.log(`- override=${JSON.stringify(OVERRIDE)} / prefix採用=${JSON.stringify(best.prefix||[])}`);
console.log(`- 新ATK探索 総ダメ(10T)= ${fmt(best.dmg)}`);
console.log(`- 旧ATK(configB.json同梱) 総ダメ= ${fmt(val.dmg)} / 旧prefix=${JSON.stringify(val.prefix||[])}`);
console.log(`\n## 較正前基準順（新ATK・押し順キー）`);
const keys=best.rows.map(r=>r.keys);  // _runRootPlan の返りは {prefix,dmg,rows}＝per-turnキーは rows[t].keys
for(let t=0;t<keys.length;t++) console.log(`- T${t+1} (${keys[t].length}手): ${keys[t].join(' ')}`);

// 旧ATK順との差分（同ターン内のキー列比較・序数diffの一次材料）
console.log(`\n## 旧ATK順(configB.json)との差分`);
const oldK=val.turnsKeys;
for(let t=0;t<Math.max(keys.length,oldK.length);t++){
  const a=(oldK[t]||[]).join(' '), b=(keys[t]||[]).join(' ');
  console.log(`- T${t+1}: ${a===b?'一致':'差分あり'}`);
  if(a!==b){ console.log(`    旧: ${a}`); console.log(`    新: ${b}`); }
}
// 機械可読JSON（再現クロスチェック用）。⚠正式アンカーは baseline_order_prefix.json＝実機UI export
//   （cache_newatk_20260717.json）を正とする。本ハーネスはそれを独立再現できるかの検証器。
fs.writeFileSync('simulation/sim04/analysis/baseline_reproduce_check.json',
  JSON.stringify({engine:ENGINE_VERSION, newAtk:NEW_ATK, override:OVERRIDE, dmg:best.dmg,
    prefix:best.prefix||[], turnsKeys:keys}, null, 2));
console.log(`\n(baseline_reproduce_check.json を保存＝実機export baseline_order_prefix.json との突合用)`);
