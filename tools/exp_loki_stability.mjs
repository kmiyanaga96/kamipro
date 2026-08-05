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
// ★E2: 実験前に台帳（現行 configC 受領キャッシュ）との bit 一致を確認（GEAR/subs/ATK/英霊武器設定の再現検証）。
// ★リポジトリ非改変（src/* を import するだけ）
//
// ⚠ 旧版は config を**最古 GEAR でハードコード**し、E2 も `archive/caches/sim05_sukuna_v2.json`
//   （engineVersion 2世代前）を見ていた＝**現行エンジンでは通らない**。上記 B4 の測定値は再測対象。
//   2026-08-05 に config 駆動へ移行（REPO_STANDARDS §6 E10）。
//
// 使い方: node tools/exp_loki_stability.mjs <scale>   … 1.00 を最初に走らせて基準キー列を保存する
import { Sim, DMG } from '/home/user/kamipro/src/app.js';
import { loadConfigC, verifyE2, configBanner } from './lib/config_c.mjs';
import fs from 'fs';
const n=10, scale=parseFloat(process.argv[2]);
const REF=(process.env.SCRATCH||'/tmp')+'/b4_loki_base.json';

// ── ★E2: 環境（GEAR/subs/パーティ順/ATK/override/英霊武器）の再現検証。敵だけが本番と異なる。
verifyE2(loadConfigC(), {silent: scale!==1.00});

// ── 本番: 敵 = walpurgis_loki（barrier/abilCap なし）
const cfg=loadConfigC({enemy:'walpurgis_loki', atkScale:scale});
if(scale===1.00) console.log('  '+configBanner(cfg));
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
