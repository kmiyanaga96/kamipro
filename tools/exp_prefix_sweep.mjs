// 実験1: PREFIX_TOPK の再測。全prefix(17本)を本探索にかけ、top-8 の枝刈りで最良を取り逃していないかを測る。
// C16 の「top-8 loss ≤0.013%」はエジソン編成での測定値＝本編成へ転移しているかの検証。
// ⚠ 旧版は config（GEAR/サブ枠/パーティ順/ATK/override）をハードコードしており**最古 GEAR で測っていた**
//   ＝出した数値は無効。config は台帳から読む（REPO_STANDARDS §6 E10）。2026-08-05 に config 駆動へ移行。
import { enumerateRootPrefixes, _selectRootPrefixes, _runRootPlan } from '/home/user/kamipro/src/app.js';
import { loadConfigC, verifyE2, configBanner } from './lib/config_c.mjs';
const n=10, log=s=>process.stdout.write(s+'\n');
const cfg=loadConfigC(); log(configBanner(cfg)); verifyE2(cfg);

const all=enumerateRootPrefixes();
const sel=new Set(_selectRootPrefixes(n).map(p=>JSON.stringify(p)));
log(`全${all.length}本を本探索(BW64,n=${n})。採用=top-8 / 不採用=9`);
const res=[];
for(const p of all){
  const t0=Date.now();
  const r=_runRootPlan(p,n);
  const inTop=sel.has(JSON.stringify(p));
  res.push({p,dmg:r.dmg,inTop});
  log(`  [${p.join(',')||'(空)'}]${inTop?' 採用':' 不採用'} dmg=${Math.round(r.dmg).toLocaleString()} (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}
res.sort((a,b)=>b.dmg-a.dmg);
const bestAll=res[0], bestTop=res.find(r=>r.inTop);
log(`\n=== 結果 ===`);
log(`全体最良 : [${bestAll.p.join(',')||'(空)'}] ${Math.round(bestAll.dmg).toLocaleString()} ${bestAll.inTop?'(採用枠内)':'★不採用枠にあった'}`);
log(`top-8最良: [${bestTop.p.join(',')||'(空)'}] ${Math.round(bestTop.dmg).toLocaleString()}`);
const loss=(bestAll.dmg-bestTop.dmg)/bestAll.dmg*100;
log(`枝刈り損失 = ${loss.toFixed(3)}%  (C16 エジソン測定値 ≤0.013% と比較)`);
log(`\n上位5本: ${res.slice(0,5).map(r=>`[${r.p.join(',')||'空'}]${r.inTop?'':'★'}=${Math.round(r.dmg).toLocaleString()}`).join('  ')}`);
