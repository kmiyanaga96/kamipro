// golden 回帰テスト: src/app.js を ESM import し、既定編成の10ターン総ダメージ／FullBurst をアサートする。
// 実行: npm run test:golden  （node test/golden.mjs）
//
// 検証は2本立て（現在値の根拠・変更履歴は CALIBRATION_ANALYSIS.md の該当 Cx 行と git log を正とする）:
//  - raw(較正なし)      … ダメージモデルの回帰アンカー
//  - calibrated         … production 出荷値。本番 runSim は calibrateStaticScores が config別に
//    override を自動較正するが、golden は決定的検証のためその選択結果を setStaticOverride で明示適用する
//    （毎回の較正走行を避ける・機構は archive/SEARCH_ROLLOUT_DESIGN.md §6）。
// ⚠ ダメージモデルを変えたら: archive/tools/search_calibrate.mjs で再fitし、下の期待値と override、
//    CLAUDE.md の検証ゲート、ENGINE_VERSION(src/app.js) を揃えて更新すること。
// 現在値: C27(赤アビ後出しの局所リファイン・単調安全)で再fit（2026-07-14・override {judg:160,pactcore:1} 据置
//   ＝overrideはルート選択を制御し、リファインは選択後の単調パスのため選択最適overrideは不変）。
//   旧C23 raw 186,634,324 / cal 208,347,477（リファインで raw +552,510 / cal +342,131）。旧C21 raw 203,723,485。
import { Sim, buildFormation, setStaticOverride, _refineRoute, _replayResult } from '../src/app.js';

// 単一ビームで10Tを探索し、C27 定石リファイン(赤アビをロボ+アンプリファ後へ・厳密改善のみ)を適用した
// 確定ルートの総ダメージ/FBを返す。production(_runRootPlan)と同じ _refineRoute を通す決定的アンカー。
function run10T(){
  const s=new Sim(); const keys=[];
  for(let t=1;t<=10;t++){ keys.push(s.takeTurn(t).keys); }
  const ref=_refineRoute(keys, 10);
  const rep=_replayResult(ref.turnsKeys, 10);
  const fb=rep.rows.filter(r=>r.full).length;
  return {dmg:Math.round(rep.dmg), fb};
}

buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);

// raw(較正なし)の回帰アンカー
setStaticOverride({});
const raw = run10T();
const rawOk = raw.dmg === 197775394 && raw.fb === 10;

// 自動較正 override（本編成の calibrateStaticScores 選択結果 = {judg:145,pactcore:1}・sim04較正で160→145）を適用した production 値
setStaticOverride({ judg: 145, pactcore: 1 });
const cal = run10T();
setStaticOverride({});
const calOk = cal.dmg === 211462826 && cal.fb === 10;

const ok = rawOk && calOk;
console.log(`[golden] raw=${raw.dmg} FB=${raw.fb}/10 | calibrated=${cal.dmg} FB=${cal.fb}/10 => ${ok ? 'OK' : 'MISMATCH (expect raw 197775394 / calibrated 211462826 / 10)'}`);
process.exit(ok ? 0 : 1);
