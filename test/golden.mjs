// golden 回帰テスト（編成別マルチfixture・2026-07-25 導入）: src/app.js を ESM import し、
// 「1編成 = 1 golden」で各編成の回帰アンカーをアサートする。
// 実行: npm run test:golden  （node test/golden.mjs）
//
// ── なぜ編成別か ──
//   golden は長らく edison 編成のみだった。移行中の napoleon/arianrhod 編成の不具合（例: アリアン holy の
//   無限押下ハング 2026-07-25）は edison golden では検出できない（当該キャラが golden 編成に不在）。
//   編成ごとに golden を持てば、その編成のコードパス退行・ハング・押し順崩れを回帰で捕捉できる。
//
// ── fixture の方式が編成で異なる理由 ──
//   edison: beam+refine の production 同型。raw/calibrated 両建て。
//   napoleon: フルビーム10Tは重く頻回テストに不適 → 静的greedy（高速・決定的）で
//     ①総ダメージ回帰 ②FB ③maxPress（1ターンの押下上限＝ターン枯渇=ハングの明示ガード）を検証する。
//     ⚠ napoleon 値は静的greedy＝beam最適ではない。buffCount/閾値の実機修正（sim05・点1/2）後に再fit予定＝
//        「回帰ガード」であって「較正確定値」ではない。beam版の napoleon 回帰は将来 test:golden:full 等へ。
//
// ── 実測コスト（2026-07-28 計測・⚠旧コメントの「edison ~2s / napoleon ~90s」は誤りだった）──
//   `npm run test:golden` 全体 = **116秒**（edison beam+refine ×2 が各 ~58s ＋ napoleon 静的greedy は瞬時）。
//   参考: napoleon フルビーム 10T（configC・両面宿儺）は 1ルート ~127s。edison configB は 1ルート ~62s。
//   ∴ edison:napoleon のコスト比は **約 1:2.2**（旧コメントからは 1:45 と読めたが実測と乖離）。
//   ⚠**コード内の性能数値は測定条件が不明なら実験計画の前提にしないこと**（実測してから使う）。詳細 CALIBRATION_ANALYSIS C37。
//
// 検証値の根拠・変更履歴は CALIBRATION_ANALYSIS.md の該当 Cx 行と git log を正とする。
// ⚠ ダメージモデルを変えたら: archive/tools/search_calibrate.mjs で再fitし、下の期待値と override、
//    CLAUDE.md の検証ゲート、ENGINE_VERSION(src/app.js) を揃えて更新すること。
// edison 現在値: C27（赤アビ後出しの局所リファイン・単調安全）で再fit（2026-07-14・override {judg:160→sim04で145,pactcore:1}）。
//   旧C23 raw 186,634,324 / cal 208,347,477。旧C21 raw 203,723,485。
import { Sim, buildFormation, setStaticOverride, _refineRoute, _replayResult } from '../src/app.js';

// ── run 方式 ──
// beam+refine 10T（edison用・production の _runRootPlan と同じ _refineRoute を通す決定的アンカー）。
function runBeam10T(){
  const s=new Sim(); const keys=[];
  for(let t=1;t<=10;t++){ keys.push(s.takeTurn(t).keys); }
  const ref=_refineRoute(keys, 10);
  const rep=_replayResult(ref.turnsKeys, 10);
  return { dmg:Math.round(rep.dmg), fb:rep.rows.filter(r=>r.full).length, maxPress:Math.max(...rep.rows.map(r=>r.ability)) };
}
// 静的greedy 10T（napoleon用・高速・決定的）。ハング（ターンが枠内で枯渇しない）は maxPress の張り付きで検出。
function runStatic10T(){
  const s=new Sim(); s.totalTurns=10; s.planDepth=2;  // planDepth>=2 → greedyTakeTurn が静的greedy経路
  let fb=0, maxPress=0;
  for(let t=1;t<=10;t++){ const r=s.greedyTakeTurn(t); if(r.full) fb++; maxPress=Math.max(maxPress,r.ability); }
  return { dmg:Math.round(s.dmg), fb, maxPress };
}

const MAX_PRESS_SANE = 60;  // 1ターン押下数の健全上限（正常 edison~32/napoleon~34・ハング時は 300 張り付き）
const results = [];
function check(name, got, expDmg, expFb, { hangGuard=false }={}){
  const dmgOk = got.dmg === expDmg;
  const fbOk  = got.fb === expFb;
  const hangOk = !hangGuard || got.maxPress < MAX_PRESS_SANE;
  const ok = dmgOk && fbOk && hangOk;
  const note = ok ? '' : ` ← 期待 dmg=${expDmg} FB=${expFb}${hangGuard?` maxPress<${MAX_PRESS_SANE}`:''}`;
  results.push({ name, ok });
  console.log(`  [${ok?'OK ':'NG '}] ${name.padEnd(16)} dmg=${got.dmg} FB=${got.fb}/10 maxPress=${got.maxPress}${note}`);
}

// ── Fixture 1: edison（本番較正編成・beam+refine・raw/cal 回帰基準）──
buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);
setStaticOverride({});                       check('edison/raw', runBeam10T(), 197775394, 10);
setStaticOverride({ judg: 145, pactcore: 1 }); check('edison/cal', runBeam10T(), 211462826, 10);
setStaticOverride({});

// ── Fixture 2: napoleon（移行編成・静的greedy 回帰ガード＋ハングガード・要再fit）──
buildFormation('napoleon', ['hecate', 'tetra', 'arianrhod', 'elaine']);
setStaticOverride({});                       check('napoleon/static', runStatic10T(), 299534299, 10, { hangGuard:true });

const ok = results.every(r => r.ok);
console.log(`[golden] ${results.filter(r=>r.ok).length}/${results.length} fixtures OK => ${ok ? 'OK' : 'MISMATCH'}`);
process.exit(ok ? 0 : 1);
