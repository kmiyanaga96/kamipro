// Phase5 S5: golden 回帰テスト（旧 index.html slice ワンライナーの後継・R6）。
// src/app.js を ESM import し、既定編成の10ターン総ダメージ／FullBurst をアサートする。
//
// C15 案(c) 自動較正の production 化(2026-07-02)に伴い golden を更新:
//  - raw(較正なし・①funki修正モデル)                          = 174,697,325  … ダメージモデルの回帰アンカー
//  - calibrated(自動較正 {judg:145,pactcore:1,effond:100} 適用) = 206,622,997  … production が出荷する探索の値
// C16(2026-07-03): BEAM_W 128→64。較正rollout改善後は幅が品質を買わず逆効果(非単調の崖)。golden編成で
//   raw/calibrated ともに微増(+0.26%/+0.22%)・他ギア退行なし・FB10/10維持・両phase約1.4倍高速(constants.js)。
// 本番 runSim は calibrateStaticScores で judg×pactcore×effond の3変数を較正し joint 最適
// {judg:145,pactcore:1,effond:100} を選ぶ(3者に相互作用・§6.7/§6.10)。golden は単一ビーム(takeTurn)で
// 決定的に同 override を明示適用して検証する(毎回の較正走行を避ける・SEARCH_ROLLOUT_DESIGN §6.5/§6.10)。
// 実行: npm run test:golden  （node test/golden.mjs）
import { Sim, buildFormation, setStaticOverride } from '../src/app.js';

function run10T(){ const s=new Sim(); let fb=0; for(let t=1;t<=10;t++){ const r=s.takeTurn(t); if(r.full) fb++; } return {dmg:Math.round(s.dmg), fb}; }

buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);

// raw(較正なし)の回帰アンカー
setStaticOverride({});
const raw = run10T();
const rawOk = raw.dmg === 174697325 && raw.fb === 10;

// 自動較正 override（本編成の calibrateStaticScores 選択結果 = {judg:145,pactcore:1,effond:100}）を適用した production 値
setStaticOverride({ judg: 145, pactcore: 1, effond: 100 });
const cal = run10T();
setStaticOverride({});
const calOk = cal.dmg === 206622997 && cal.fb === 10;

const ok = rawOk && calOk;
console.log(`[golden] raw=${raw.dmg} FB=${raw.fb}/10 | calibrated=${cal.dmg} FB=${cal.fb}/10 => ${ok ? 'OK' : 'MISMATCH (expect raw 174697325 / calibrated 206622997 / 10)'}`);
process.exit(ok ? 0 : 1);
