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
//
// ⚠ 旧版は config を**最古 GEAR でハードコード**し、E2 も自前生成のスクラッチキャッシュ（セッション固有パス＝揮発）
//   に依存していた＝出した T1 掃引の数値は再測対象。2026-08-05 に config 駆動へ移行（REPO_STANDARDS §6 E10）。
import { Sim, DMG } from '/home/user/kamipro/src/app.js';
import { loadConfigC, verifyE2, configBanner } from './lib/config_c.mjs';

const log=s=>process.stdout.write(s+'\n');
// ★E2: config は台帳から読み、記録ルートの強制リプレイが bit 一致することを先に確認する。
const cfg=loadConfigC(); log(configBanner(cfg)); verifyE2(cfg);

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
