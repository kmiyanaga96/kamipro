// C27 探索品質プローブ: 「赤アビはロボ設置＋アンプリファ後」定石リファインの検証・監査ハーネス。
// セッション一時領域(scratchpad)で行ったC27の反実仮想・上限測定・冪等検証を1本に統合した恒久版
// （C17 の search_lever_scan.mjs と同じ「将来の再実行用に tools へ残す」運用）。
//
// 用途:
//   node tools/c27_refine_probe.mjs                    … golden既定編成でビーム→_refineRoute の利得と冪等性を報告
//   node tools/c27_refine_probe.mjs <cache.json>       … 探索キャッシュexportを復元し fixed-point 検証＋
//                                                                赤アビ後出し反実仮想の delta を実gearで測定
// 期待（C27 fixed 後）: 既定編成の refine 利得は「ビーム出力が既に固定点」なら 0、golden経路では
//   run10T 内で refine 済みのため本プローブの before/after は探索経路によって 0〜+0.3% 程度。
//   キャッシュ復元時は improved:false（=production が固定点を出荷している）が合格。
// 根拠・履歴: CALIBRATION_ANALYSIS.md C27（起票→実gear再測定→修正実装の全設定履歴）。
import { readFileSync } from 'fs';
import { buildFormation, recalcGearKCFromDispAtk, setStaticOverride, Sim, GEAR, DMG, ABIL } from '../../src/app.js';
import { _replayResult, _refineRoute } from '../../src/sim.js';

const cachePath = process.argv[2];

function report(turnsKeys, n, label){
  const base = _replayResult(turnsKeys, n);
  const ref  = _refineRoute(turnsKeys, n);
  const after = _replayResult(ref.turnsKeys, n);
  const fb = r => r.rows.filter(x=>x.full).length;
  console.log(`[${label}] base=${Math.round(base.dmg)} FB=${fb(base)}/${n} | refined=${Math.round(after.dmg)} FB=${fb(after)}/${n}` +
    ` | Δ=${Math.round(after.dmg-base.dmg)} (${((after.dmg-base.dmg)/base.dmg*100).toFixed(3)}%) improved=${ref.improved}`);
  for(let t=0;t<n;t++) if(turnsKeys[t].join()!==ref.turnsKeys[t].join()) console.log(`  T${t+1}: ${turnsKeys[t].join(' ')}\n  →  : ${ref.turnsKeys[t].join(' ')}`);
  return ref;
}

// 反実仮想（C27原型・情報目的）: T1 の赤アビを最後の setup(droid/amplifa) 直後へ手動移動した delta。
// _refineRoute が固定点なら delta≦0 のはず（正なら refine の取りこぼし＝要調査）。
function manualCounterfactual(turnsKeys, n){
  const isRed = k => ABIL[k] && ABIL[k][1]==='r';
  const t1 = turnsKeys[0];
  let lastSetup=-1; t1.forEach((k,i)=>{ if(k==='droid'||k==='amplifa') lastSetup=i; });
  if(lastSetup<0){ console.log('[counterfactual] T1にsetupなし=スキップ'); return; }
  const moved=[]; const rest=[];
  t1.forEach((k,i)=>{ (isRed(k)&&i<lastSetup ? moved : rest).push(k); });
  if(!moved.length){ console.log('[counterfactual] T1にsetup前の赤アビなし=既に定石順'); return; }
  const t1v=[]; for(const k of rest){ t1v.push(k); if(k==='amplifa'||(k==='droid'&&!rest.includes('amplifa'))) if(t1v.filter(x=>moved.includes(x)).length===0) t1v.push(...moved);}
  const d0=_replayResult(turnsKeys,n).dmg, d1=_replayResult([t1v,...turnsKeys.slice(1)],n).dmg;
  console.log(`[counterfactual] T1 赤アビ(${moved.join(',')})を setup 直後へ: Δ10T=${Math.round(d1-d0)} (正なら refine 取りこぼし)`);
}

if(cachePath){
  const cache=JSON.parse(readFileSync(cachePath,'utf8'));
  const [key,val]=cache.entries[0];
  const sig=JSON.parse(key.split('|').slice(1).join('|'));
  const [hero,kami,gear,subs,def,maxhp,exMult,exCap,n]=sig;
  console.log(`cache: engine=${cache.engineVersion} 敵def=${def}/hp=${maxhp} override=${JSON.stringify(val.override)}`);
  buildFormation(hero,kami);
  Object.assign(GEAR,gear);
  DMG.enemy_def=def; DMG.enemy_max_hp=maxhp; DMG.edison_burst_extra_mult=exMult; DMG.edison_burst_extra_cap=exCap;
  if(val.dispAtk) recalcGearKCFromDispAtk(val.dispAtk);
  // ⚠ affinity は署名非含: 敵DB/UI設定に依存。既定1.0のまま測る(delta%はaffinity一様modeでrobust=C27実測)。
  const ref=report(val.turnsKeys, val.n||10, 'cache-route');
  manualCounterfactual(ref.turnsKeys, val.n||10);
} else {
  buildFormation('edison',['yamato','hecate','tetra','elaine']);
  setStaticOverride({});
  const s=new Sim(); const keys=[]; for(let t=1;t<=10;t++) keys.push(s.takeTurn(t).keys);
  const ref=report(keys,10,'golden-route(raw)');
  manualCounterfactual(ref.turnsKeys,10);
}
