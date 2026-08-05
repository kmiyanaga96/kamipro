// 2×2 比較: {ユーザーcacheの順, 再抽出の順} × {stale ATK, 正しいATK} を同一エンジンでリプレイ。
// これで「ATK修正がダメージにどれだけ効くか」と「正しいATK下でどちらの順が優れるか」を分離して見る。
//
// ⚠⚠ **本ハーネスは陳腐化している**（2026-08-05 時点）。2点:
//   ①入力の `archive/caches/sim05_sukuna.json` は **engineVersion 2世代前**＝記録 dmg は現行エンジンで再現しない
//     （比較そのものは同一エンジン内なので成立するが、「記録値」との照合はできない）。
//   ②旧版は config を**最古 GEAR でハードコード**し、サブ枠の設定を**一切していなかった**（＝既定値のまま走る）。
//   2026-08-05 に config だけ台帳駆動へ直した（REPO_STANDARDS §6 E10）。**出した数値は再取得が必要**。
import { _replayResult } from '/home/user/kamipro/src/app.js';
import { loadConfigC, configBanner } from './lib/config_c.mjs';
import fs from 'fs';

// 比較する2つの ATK 基準。CORRECT は**台帳の `dispAtk`**（走行時の実条件）で、
// `src/app.js` の `DISPLAY_ATK_OVERRIDE_BY_FORMATION`（golden 用に据置＝走行時点より古い）ではない。
const STALE = { napoleon:30041, hecate:73727, tetra:81887, arianrhod:31737, elaine:82248 };
const CORRECT = loadConfigC().atk;

// ユーザーキャッシュの順
const cache = JSON.parse(fs.readFileSync('/home/user/kamipro/archive/caches/sim05_sukuna.json','utf8'));
const userOrder = cache.entries[0][1].turnsKeys;
const userDmgRecorded = cache.entries[0][1].dmg;

// 再抽出の順（b4htr06s3 出力から手写ではなく、同条件で再現するのは高コスト＝出力ログのキー列を使う）
const mineOrder = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));

function setup(atkMap){ return loadConfigC({ atk: atkMap }); }
console.log(configBanner(loadConfigC()));
const hp = 980000000;
function killTurn(rows){ let k=null; rows.forEach((r,i)=>{ if(k===null && (r.dmg??0)>=hp) k=i+1; }); return k; }

console.log('順\\ATK基準            stale ATK              正しい configC ATK');
for(const [name,order] of [['ユーザーcache順', userOrder], ['再抽出順      ', mineOrder]]){
  const out=[];
  for(const [lbl,atk] of [['stale',STALE], ['correct',CORRECT]]){
    setup(atk);
    const rep=_replayResult(order, order.length);
    out.push(`${Math.round(rep.dmg).toLocaleString().padStart(15)} (T${killTurn(rep.rows)}撃破)`);
  }
  console.log(`${name}  ${out.join('   ')}`);
}
console.log(`\n（参考）ユーザーcacheの記録値: ${Math.round(userDmgRecorded).toLocaleString()}`);
