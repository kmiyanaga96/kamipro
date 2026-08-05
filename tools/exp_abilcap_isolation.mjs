// B1: abilCap の切り分け。同一の両面宿儺のまま enemy_abil_cap だけを null にして ATK感度を再測する。
//   敵を入れ替えると cap/def/barrier が同時に動くため、**1変数のみ**を変える設計にした。
//   比較対象: 実験2（cap=19・同一手続き）＝×0.90 55.3% / ×1.10 29.5% / ×1.25 25.3%・ダメージ非単調。
//   判定: cap を外して単調＆押し順安定になれば原因は abilCap、変わらなければ原因はアリアン holy（編成側）。
// ★E2: 実験前に既知値（config_sukuna_v2 の記録値）との bit 一致を確認する。★リポジトリ非改変
// ⚠ 旧版は config を**最古 GEAR でハードコード**し、E2 も `archive/caches/sim05_sukuna_v2.json`
//   （engineVersion 2世代前）を見ていたため**現行エンジンでは通らない**。出した数値（cap=null で厳密単調 等）は再測対象。
//   2026-08-05 に config 駆動へ移行し、E2 の照合先を現行台帳へ差し替えた（REPO_STANDARDS §6 E10）。
import { DMG, _runRootPlan } from '/home/user/kamipro/src/app.js';
import { loadConfigC, verifyE2, configBanner } from './lib/config_c.mjs';
import fs from 'fs';
const n=10, scale=parseFloat(process.argv[2]);
const REF=(process.env.SCRATCH||'/tmp')+'/b1_base.json';

// ── ★E2: 台帳条件（cap=19・台帳 ATK/override）で bit 一致を確認してから実験条件へ。
verifyE2(loadConfigC(), {silent: scale!==1.00});

// ── 本番: cap のみ無効化（★これだけが実験2との差分）
const cfg=loadConfigC({abilCap:null, atkScale:scale});
if(scale===1.00) console.log('  '+configBanner(cfg));
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
