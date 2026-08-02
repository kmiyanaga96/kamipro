// §4.4.4 ③ 仮説(1) の定量化: **T1 の押下上限を外すとシムの T1 ダメージはどこまで伸びるか**。★リポジトリ非改変
//
// 背景: 実機は T1 に**テトラ1アシの無敵**で鬼神一擲を無効化し「20アビ以上」の最大火力で戦った
// （ユーザー 2026-08-02）。一方シムは `abilCapPerTurn:19` が**毎ターン**張り付いており T1 も 19 で頭打ち。
// 実機/シムの乖離は T1 に局在（増分比 T1 ×2.43 / T2 ×1.07）＝この手数差で説明できるかを測る。
//
// 方式: T1 のみを走らせ、`DMG.enemy_abil_cap` を掃引して T1 総ダメージの曲線を得る。
//   ビームはロールアウトで後続ターンも同じ cap を見てしまい T1 単独の比較を汚すため、**静的greedy**で測る
//   （cap 以外の条件は完全同一＝cap の効果だけが差分になる）。絶対値ではなく**cap=19 に対する比**を読む。
//
// 実行: node tools/exp_t1_abilcap_sweep.mjs
import fs from 'node:fs';
import { Sim, buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG,
         setCurrentSubs, displayAtkOverrideFor, setStaticOverride, _replayResult } from '/home/user/kamipro/src/app.js';

const log=s=>process.stdout.write(s+'\n');
const GEAR_C={assault:3.06,elem:0.54,vigor:0.6876,spec:0,dmgup:0,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};
setCurrentSubs(['freyja_christmas','artemis']);
buildFormation('napoleon',['hecate','tetra','arianrhod','elaine']);
applyEnemy('ryomen_sukuna');
for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_C[k]??0;
DMG.betaia_mult=3.5; DMG.betaia_cap=800000; DMG.napo_burst_cd_reduce=true;
recalcGearK(); recalcGearKCFromDispAtk(displayAtkOverrideFor('napoleon'));
setStaticOverride({pactcore:1,effond:120});

// ── E2: 既知値との bit 一致を先に確認する（config 再現の検証）──
const ROUTE='/tmp/claude-0/-home-user-kamipro/21dd8fe3-058a-518b-9720-4e11617bb04c/scratchpad/napo_route.json';
if(fs.existsSync(ROUTE)){
  const d=_replayResult(JSON.parse(fs.readFileSync(ROUTE,'utf8')), 10).dmg;
  const KNOWN=1958173800.8464613;
  log(`[E2] 既知ルートのリプレイ: ${d} / 既知 ${KNOWN} → ${d===KNOWN?'✅ bit 一致':'★不一致（config 再現に失敗＝以降の数値は無効）'}`);
  if(d!==KNOWN) process.exit(1);
} else log('[E2] ⚠ 既知ルートのキャッシュが無いため config 再現の bit 検証をスキップ');

const HP=9.8e8;  // 両面宿儺 HP（§4.4.3）
function t1(cap){
  DMG.enemy_abil_cap=cap;
  const s=new Sim(); s.totalTurns=10; s.planDepth=2;  // 静的greedy（cap 以外の条件を揃える）
  const r=s.greedyTakeTurn(1);
  return {dmg:s.dmg, press:r.ability, burst:r.burst};
}
const base=t1(19);
log(`\n実機の観測: T1 与ダメ **54%**（残HP46%）／シム予測 22.2% ＝ **×2.43**`);
log(`シム T1（静的greedy・cap 掃引）── 基準 cap=19\n`);
log('| cap | 押下数 | T1 総ダメ | HP比 | cap=19 比 |');
log('|---|---|---|---|---|');
for(const cap of [19,22,25,30,35,40,50,null]){
  const r=t1(cap);
  log(`| ${cap??'なし'} | ${r.press} | ${(r.dmg/1e8).toFixed(2)}億 | ${(r.dmg/HP*100).toFixed(1)}% | ×${(r.dmg/base.dmg).toFixed(2)} |`);
}
DMG.enemy_abil_cap=19;
log(`\n→ 実機の 54% / ×2.43 に到達する押下数が読めれば、仮説(1)だけで T1 乖離を説明できる。`);
log(`   届かないぶんが 仮説(2) T1バースト過小 / (3) 鬼神障壁 rate の取り分になる。`);
