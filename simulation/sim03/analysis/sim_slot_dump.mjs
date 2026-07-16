// sim03 シム側 slot別ダメージ headless ダンプ（P3: 再現可能な集計器・rollup層専用）。
//   実行: node simulation/sim03/analysis/sim_slot_dump.mjs         （リポジトリルートから）
// 責務: data/configA.json（探索キャッシュexport）から編成/GEAR/dispAtk/敵(def/max_hp/英霊武器)を復元し、
//   固定押し順（turnsKeys T1〜T3）を forcedKeys 相当で決定的リプレイ。押下毎の dmg 差分＋
//   Sim.prototype._decay モンキーパッチの per-hit ログで「シム側の slot×hit 値」を出す。
//   実機 trial の同slotと突き合わせて絶対レベル（C25）・追撃cap（C5/C3）の分母に使う。
// ⚠ affinity は configSig 非含（archive/tools/c27_refine_probe.mjs の注記と同じ）。
//   キャスパリーグは闇=光有利 1.5 のため明示設定する（enemies/cath_palug.md）。
import fs from 'fs';
import { buildFormation, setCurrentSubs, recalcGearKCFromDispAtk, GEAR, DMG, Sim } from '../../../src/app.js';

const cache=JSON.parse(fs.readFileSync('simulation/sim03/data/configA.json','utf8'));
const [key,val]=cache.entries[0];
const sig=JSON.parse(key.split('|').slice(1).join('|'));
const [hero,kami,gear,subs,def,maxhp,exMult,exCap]=sig;
console.log(`# sim_slot_dump — configA（engine=${cache.engineVersion}・総ダメ${Math.round(val.dmg).toLocaleString()}・敵def=${def}/max_hp=${maxhp}）`);
console.log(`- affinity=1.5（cath_palug・闇 vs 光編成＝有利。configSig非含のため明示設定）`);
console.log(`- dispAtk: ${JSON.stringify(val.dispAtk)}`);

setCurrentSubs(subs);
buildFormation(hero,kami);
Object.assign(GEAR,gear);
DMG.enemy_def=def; DMG.enemy_max_hp=maxhp;
DMG.edison_burst_extra_mult=exMult; DMG.edison_burst_extra_cap=exCap;
DMG.affinity=1.5;
recalcGearKCFromDispAtk(val.dispAtk);

// per-hit ログ: _decay の戻り値を frame 付きで捕捉。
// ⚠解釈注意: 'na' フレームには _naForAbi() の内部呼び出し（アビ枠hitの基底計算＝ダメージ加算ではない）も
//   混入する。加算hitとして有効なのは burst/streak/（judg ph2・攻撃フェイズ等の実通常hit）と abi。
//   このため押下単位の照合は「Δdmg(押下計)」を正とし、hit内訳は成分帰属の参考に使う。
// クローン（ロールアウト/lookahead）を除外するためトップレベル sim インスタンスのみ記録する。
const sim=new Sim(); sim.totalTurns=3;
let hitLog=[];
const orig=Sim.prototype._decay;
Sim.prototype._decay=function(frame,raw,base){
  const v=orig.call(this,frame,raw,base);
  if(this===sim) hitLog.push({frame, raw, v});
  return v;
};

const fmt=n=>Math.round(n).toLocaleString();
const rows=[];
for(let t=1;t<=3;t++){
  const keys=val.turnsKeys[t-1];
  sim._beginTurn(t);
  sim._primeLookaheads(t);
  const ecoStart={keigyo:sim.keigyo, cum:sim.cum, renri:sim.renri};
  keys.forEach((k,i)=>{
    const before=sim.dmg; hitLog=[];
    sim._execKey(k);
    const delta=sim.dmg-before;
    if(delta>0) rows.push({t, press:i+1, key:k, delta, hits:hitLog.slice()});
  });
  const ecoEnd={keigyo:sim.keigyo, cum:sim.cum, renri:sim.renri};
  const before=sim.dmg; hitLog=[];
  const atk=sim._attackPhase();
  rows.push({t, press:'ATK', key:'(攻撃フェイズ)', delta:sim.dmg-before, hits:hitLog.slice(), fb:atk.length});
  const b2=sim.dmg; hitLog=[];
  sim._endBookkeep(t);
  const endDelta=sim.dmg-b2;
  if(endDelta>0) rows.push({t, press:'END', key:'(ターン終了処理)', delta:endDelta, hits:hitLog.slice()});
  console.log(`\n## T${t}（FB=${atk.length}/5・累計dmg=${fmt(sim.dmg)}）`);
  console.log(`- 経済: メイン開始 契晶/累計/連理 = ${ecoStart.keigyo} / ${ecoStart.cum} / ${ecoStart.renri} → メイン終了 = ${ecoEnd.keigyo} / ${ecoEnd.cum} / ${ecoEnd.renri}`);
  console.log(`- ゲージ(攻撃フェイズ後): ${Object.entries(sim.g).map(([c,v])=>`${c}=${Math.round(v)}`).join(' ')}`);
  console.log('\n| 押下# | key | Δdmg(押下計) | hit内訳（frame:値・_decay通過分） | フラット分(Δ−Σhit) |');
  console.log('|---|---|--:|---|--:|');
  for(const r of rows.filter(r=>r.t===t)){
    const hitsTxt=r.hits.map(h=>`${h.frame}:${fmt(h.v)}`).join(' + ')||'—';
    const flat=r.delta-r.hits.reduce((a,h)=>a+h.v,0);
    console.log(`| ${r.press} | ${r.key} | ${fmt(r.delta)} | ${hitsTxt} | ${Math.abs(flat)>1?fmt(flat):'0'} |`);
  }
}
console.log(`\n## 総計（T1〜T3）: ${fmt(sim.dmg)}`);
// 成分別集計（frame別）＝実機の成分別集計表と同じ軸
const byFrame={};
for(const r of rows) for(const h of r.hits) byFrame[`T${r.t}:${h.frame}`]=(byFrame[`T${r.t}:${h.frame}`]||0)+h.v;
console.log('\n## frame別集計');
console.log('| frame | T1 | T2 | T3 |');
console.log('|---|--:|--:|--:|');
for(const f of ['na','abi','burst','streak']) console.log(`| ${f} | ${[1,2,3].map(t=>fmt(byFrame[`T${t}:${f}`]||0)).join(' | ')} |`);
const flatT=t=>rows.filter(r=>r.t===t).reduce((a,r)=>a+(r.delta-r.hits.reduce((x,h)=>x+h.v,0)),0);
console.log(`| flat(減衰外) | ${[1,2,3].map(t=>fmt(flatT(t))).join(' | ')} |`);

// ===== 実機5走平均との押下単位突合（絶対レベル C25 の一次表） =====
// 実機側: data/trialNN.md の同 (ターン, 押下#) の全hit合計（trial間平均・v=0 のオーバーキル切断hitは除外）。
// シム側: 上の Δdmg(押下計)。攻撃フェイズは1行に束ねる。DOT(ターン終了)も対応付ける。
const num=s=>Number(String(s).replace(/[, ]/g,''))||0;
const nums=s=>(String(s).match(/\d[\d,]*/g)||[]).map(num);
function pressTotals(name){
  const lines=fs.readFileSync(`simulation/sim03/data/trial${name}.md`,'utf8').split('\n');
  const secIdx=k=>lines.findIndex(l=>l.startsWith(`## ${k} 記録`));
  const bounds=[[1,secIdx('T1')],[2,secIdx('T2')],[3,secIdx('T3')]].filter(b=>b[1]>=0);
  const out={};
  for(let i=0;i<bounds.length;i++){
    const [t,st]=bounds[i]; const en=i+1<bounds.length?bounds[i+1][1]:lines.length;
    for(const ln of lines.slice(st,en)){
      if(!ln.startsWith('|')) continue;
      const c=ln.split('|').map(s=>s.trim()); if(c.length<7) continue;
      const idx=c[1]; if(idx==='押下#'||idx.startsWith('---')) continue;
      if(!/\d/.test(c[4])&&!idx.includes('攻撃フェイズ')) continue;
      const press=idx.includes('攻撃フェイズ')?'ATK':num(idx);
      const s=nums(c[4]).reduce((a,b)=>a+b,0);
      if(s>0) out[`${t}:${press}`]={v:s, key:c[2]};
    }
  }
  return out;
}
const NAMES=['01','02','03','04','05'];
const reals=NAMES.map(pressTotals);
console.log('\n## 実機5走平均 vs シム（押下単位・絶対レベル一次表）');
console.log('| T:押下# | key | 実機平均(n走) | sim Δ | 実機/sim |');
console.log('|---|---|--:|--:|--:|');
const ids=[]; const iseen=new Set();
for(const r of rows){ const id=`${r.t}:${r.press}`; if(r.press!=='END'&&!iseen.has(id)){iseen.add(id); ids.push({id, key:r.key, sim:r.delta});} }
let wReal=0, wSim=0;
for(const {id,key,sim:sv} of ids){
  const vs=reals.map(m=>m[id]?.v).filter(v=>v!=null);
  if(!vs.length){ console.log(`| ${id} | ${key} | —(実機記録なし) | ${fmt(sv)} | — |`); continue; }
  const mean=vs.reduce((a,b)=>a+b,0)/vs.length;
  wReal+=mean; wSim+=sv;
  console.log(`| ${id} | ${key} | ${fmt(mean)} (n=${vs.length}) | ${fmt(sv)} | ${(mean/sv).toFixed(3)} |`);
}
console.log(`| **計(両側観測分)** |  | **${fmt(wReal)}** | **${fmt(wSim)}** | **${(wReal/wSim).toFixed(3)}** |`);
