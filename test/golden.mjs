// golden 回帰テスト: src/app.js を ESM import し、既定編成の10ターン総ダメージ／FullBurst をアサートする。
// 実行: npm run test:golden  （node test/golden.mjs）
//
// 検証は2本立て（現在値の根拠・変更履歴は CALIBRATION_ANALYSIS.md の該当 Cx 行と git log を正とする）:
//  - raw(較正なし)      … ダメージモデルの回帰アンカー
//  - calibrated         … production 出荷値。本番 runSim は calibrateStaticScores が config別に
//    override を自動較正するが、golden は決定的検証のためその選択結果を setStaticOverride で明示適用する
//    （毎回の較正走行を避ける・機構は archive/SEARCH_ROLLOUT_DESIGN.md §6）。
// ⚠ ダメージモデルを変えたら: archive/tools/search_calibrate.mjs で再fitし、下の期待値と override、
//    CLAUDE.md/.agents/AGENTS.md の検証ゲート、ENGINE_VERSION(src/app.js) を揃えて更新すること。
// 現在値: C21(ifishant+1=押下時点CD中のエレインアビのみ・条件付き付与)実機較正で再fit
//   （2026-07-11・override {judg:160,pactcore:1}＝effondは今回の再fitで脱落）。
import { Sim, buildFormation, setStaticOverride } from '../src/app.js';

function run10T(){ const s=new Sim(); let fb=0; for(let t=1;t<=10;t++){ const r=s.takeTurn(t); if(r.full) fb++; } return {dmg:Math.round(s.dmg), fb}; }

buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);

// raw(較正なし)の回帰アンカー
setStaticOverride({});
const raw = run10T();
const rawOk = raw.dmg === 203155740 && raw.fb === 10;

// 自動較正 override（本編成の calibrateStaticScores 選択結果 = {judg:160,pactcore:1}・C21）を適用した production 値
setStaticOverride({ judg: 160, pactcore: 1 });
const cal = run10T();
setStaticOverride({});
const calOk = cal.dmg === 223378544 && cal.fb === 10;

const ok = rawOk && calOk;
console.log(`[golden] raw=${raw.dmg} FB=${raw.fb}/10 | calibrated=${cal.dmg} FB=${cal.fb}/10 => ${ok ? 'OK' : 'MISMATCH (expect raw 203155740 / calibrated 223378544 / 10)'}`);
process.exit(ok ? 0 : 1);
