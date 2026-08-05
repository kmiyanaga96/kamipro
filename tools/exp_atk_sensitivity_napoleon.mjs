// 実験2（圧縮版）: prefix=[factor] 固定で ATK スケールのみを振り、押し順の変化を測る。
// 目的は「大域最良の探索」ではなく「条件間の押し順比較」なので prefix 固定で十分（実験1: prefix寄与は最大0.13%）。
// ⚠ 旧版は config を**最古 GEAR でハードコード**していた＝出した数値（×0.90 同位置55.3% 等）は再測対象。
//   2026-08-05 に config 駆動へ移行（REPO_STANDARDS §6 E10）。基準 ATK は台帳 `dispAtk` の一律スケール。
import { _runRootPlan } from '/home/user/kamipro/src/app.js';
import { loadConfigC, verifyE2, configBanner } from './lib/config_c.mjs';
import fs from 'fs';
const n=10, scale=parseFloat(process.argv[2]);
const REF=(process.env.SCRATCH||'/tmp')+'/atk2_base.json';
// ★E2: 台帳条件で bit 一致を確認してから、ATK だけを 1 変数ずらす。
verifyE2(loadConfigC(), {silent: scale!==1.00});
const cfg=loadConfigC({atkScale:scale});
if(scale===1.00) console.log('  '+configBanner(cfg));
const r=_runRootPlan(['factor'],n);
const keys=r.rows.map(x=>x.keys);
if(scale===1.00){ fs.writeFileSync(REF,JSON.stringify(keys)); console.log(`  ×1.00(基準) dmg=${Math.round(r.dmg).toLocaleString()}`); process.exit(0); }
const base=JSON.parse(fs.readFileSync(REF,'utf8'));
let pos=0,tot=0,ss=0,st=0, turnDiff=[];
for(let t=0;t<base.length;t++){
  const x=base[t]||[], y=keys[t]||[], L=Math.max(x.length,y.length);
  let tp=0,tt=0;
  for(let i=0;i<L;i++){ tot++; tt++; if(x[i]&&y[i]&&x[i]===y[i]){pos++;tp++;} }
  const cnt=k=>{const m={};for(const v of k)m[v]=(m[v]||0)+1;return m;};
  const cx=cnt(x),cy=cnt(y);
  for(const k of new Set([...Object.keys(cx),...Object.keys(cy)])){ ss+=Math.min(cx[k]||0,cy[k]||0); st+=Math.max(cx[k]||0,cy[k]||0); }
  turnDiff.push(`T${t+1}:${(tp/tt*100).toFixed(0)}%`);
}
console.log(`  ×${scale.toFixed(2)}       dmg=${Math.round(r.dmg).toLocaleString()}  同位置${(pos/tot*100).toFixed(1)}% / 構成${(ss/st*100).toFixed(1)}%   [${turnDiff.join(' ')}]`);
