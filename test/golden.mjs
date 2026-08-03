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
// ── 実行方式（2026-08-02: fixture 並列化）──
//   fixture は互いに完全独立（各自が buildFormation/setStaticOverride を張り直す）＝**1 fixture = 1 子プロセス**で
//   並列実行する（E8「1条件=1プロセス」と同じ理屈。逐次だと 4コアのうち1コアしか使わない）。
//   `--serial` で従来どおりの逐次実行、`--fixture <name>` で単体実行（デバッグ用）。
//   ⚠**検証内容は不変**＝各 fixture は決定的なので、並列化しても値は1円も動かない。
//
// ── 実測コスト ──
//   逐次 **4分07秒** → 並列 **約2分40秒**（律速は最も重い edison/raw）。旧値は約10分（C27 時代は116秒）。
//   ⚠ 600秒上限に近いため、**背景実行（run_in_background）が必須**。
//   内訳: LS の評価回数 raw 177,961 / cal 124,152 は**高速化後も不変**（1評価 1.27ms→**0.63ms**）。
//   ターン跨ぎ swap が評価の約73%を占める。参考: napoleon フルビーム 10T（configC・両面宿儺）は 1ルート ~130s。
//   ⚠**コード内の性能数値は測定条件が不明なら実験計画の前提にしないこと**（実測してから使う）。詳細 CALIBRATION_ANALYSIS C37。
//
// 検証値の根拠・変更履歴は CALIBRATION_ANALYSIS.md の該当 Cx 行と git log を正とする。
// ⚠ ダメージモデルを変えたら: tools/search_calibrate.mjs で再fitし、下の期待値と override、
//    CLAUDE.md の検証ゲート、ENGINE_VERSION(src/app.js) を揃えて更新すること。
// 現在値: **C39（`_naOwner` の是正）で再fit（2026-08-02）**。ダメージモデルの変更＝3 fixture すべてが動いた。
//   内訳: (a) effond/betaia が `_naOwner` を設定せず「直前に行動したキャラ」基準で _na() していたのを是正
//        (b) `clone()` が `_naOwner` を落としていた（＝ビーム/先読みだけ本線と評価条件が違った）のを是正。
//   napoleon/static は静的greedy＝ビーム不使用のため (a) のみの影響（−0.004%）。edison はナポ不在＝betaia が
//   無いので (a) effond ＋ (b) clone の合算（raw +0.048% / cal +0.443%）。
//   ⚠**override {judg:145,pactcore:1} は未再fit**（ダメージモデルが動いた＝再fit の必要性は上がった。TODO 参照）。
//   旧C37 raw 201,909,711 / cal 214,213,430 / napo 299,534,299。
//   旧C27+sim04 raw 197,775,394 / cal 211,462,826。旧C27 raw 187,186,834 / cal 208,689,608。旧C23 raw 186,634,324。
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const MAX_PRESS_SANE = 60;  // 1ターン押下数の健全上限（正常 edison~32/napoleon~34・ハング時は 300 張り付き）

// ── fixture 定義（宣言のみ。実行はここでは行わない）──
// run() は src/app.js を動的 import してから呼ぶ＝**親プロセスはエンジンを読み込まない**（起動を軽く保つ）。
const FIXTURES = [
  // edison（本番較正編成・beam+LS・raw/cal 回帰基準）
  { name:'edison/raw', exp:202005923, fb:10,
    async run(m){ m.buildFormation('edison',['yamato','hecate','tetra','elaine']); m.setStaticOverride({});
                  return runBeam10T(m); } },
  { name:'edison/cal', exp:215161915, fb:10,
    async run(m){ m.buildFormation('edison',['yamato','hecate','tetra','elaine']); m.setStaticOverride({judg:145,pactcore:1});
                  return runBeam10T(m); } },
  // napoleon（移行編成・静的greedy 回帰ガード＋ハングガード・要再fit）
  { name:'napoleon/static', exp:299523354, fb:10, hangGuard:true,
    async run(m){ m.buildFormation('napoleon',['hecate','tetra','arianrhod','elaine']); m.setStaticOverride({});
                  return runStatic10T(m); } },
];

// ── run 方式 ──
// beam+LS 10T（edison用・production の _runRootPlan と同じ _localSearchRoute を通す決定的アンカー）。
function runBeam10T(m){
  const s=new m.Sim(); const keys=[];
  for(let t=1;t<=10;t++){ keys.push(s.takeTurn(t).keys); }
  const ls=m._localSearchRoute(keys, 10);
  const rep=m._replayResult(ls.turnsKeys, 10);
  return { dmg:Math.round(rep.dmg), fb:rep.rows.filter(r=>r.full).length, maxPress:Math.max(...rep.rows.map(r=>r.ability)) };
}
// 静的greedy 10T（napoleon用・高速・決定的）。ハング（ターンが枠内で枯渇しない）は maxPress の張り付きで検出。
function runStatic10T(m){
  const s=new m.Sim(); s.totalTurns=10; s.planDepth=2;  // planDepth>=2 → greedyTakeTurn が静的greedy経路
  let fb=0, maxPress=0;
  for(let t=1;t<=10;t++){ const r=s.greedyTakeTurn(t); if(r.full) fb++; maxPress=Math.max(maxPress,r.ability); }
  return { dmg:Math.round(s.dmg), fb, maxPress };
}

function report(f, got){
  const ok = got.dmg===f.exp && got.fb===f.fb && (!f.hangGuard || got.maxPress<MAX_PRESS_SANE);
  const note = ok ? '' : ` ← 期待 dmg=${f.exp} FB=${f.fb}${f.hangGuard?` maxPress<${MAX_PRESS_SANE}`:''}`;
  console.log(`  [${ok?'OK ':'NG '}] ${f.name.padEnd(16)} dmg=${got.dmg} FB=${got.fb}/10 maxPress=${got.maxPress}${note}`);
  return ok;
}

// ── 子プロセス: 1 fixture だけ走らせて結果を JSON で返す ──
const only = process.argv.includes('--fixture') ? process.argv[process.argv.indexOf('--fixture')+1] : null;
if(only){
  const f = FIXTURES.find(x=>x.name===only);
  if(!f){ console.error(`unknown fixture: ${only}`); process.exit(2); }
  const m = await import('../src/app.js');
  const got = await f.run(m);
  process.send ? process.send(got) : console.log(JSON.stringify(got));
  process.exit(0);
}

// ── 逐次実行（--serial・従来経路の保全）──
if(process.argv.includes('--serial')){
  const m = await import('../src/app.js');
  let okN = 0;
  for(const f of FIXTURES) if(report(f, await f.run(m))) okN++;
  console.log(`[golden] ${okN}/${FIXTURES.length} fixtures OK => ${okN===FIXTURES.length?'OK':'MISMATCH'}`);
  process.exit(okN===FIXTURES.length?0:1);
}

// ── 親プロセス: fixture ごとに子を fork して並列実行 ──
// 結果は**宣言順**に整列して出力する（並列でも表示順・判定は逐次時と完全に同一）。
const self = fileURLToPath(import.meta.url);
const limit = Math.max(1, Math.min(os.cpus().length, FIXTURES.length));
const got = new Array(FIXTURES.length);
let next = 0;

await new Promise((resolve, reject) => {
  let running = 0, done = 0;
  const pump = () => {
    while(running < limit && next < FIXTURES.length){
      const i = next++; running++;
      const child = fork(self, ['--fixture', FIXTURES[i].name], { stdio:['ignore','inherit','inherit','ipc'] });
      child.on('message', msg => { got[i] = msg; });
      child.on('exit', code => {
        running--; done++;
        if(code !== 0 && !got[i]) got[i] = { dmg:NaN, fb:NaN, maxPress:NaN, error:`exit ${code}` };
        if(done === FIXTURES.length) resolve(); else pump();
      });
      child.on('error', reject);
    }
  };
  pump();
});

let okN = 0;
for(let i=0;i<FIXTURES.length;i++) if(report(FIXTURES[i], got[i])) okN++;
console.log(`[golden] ${okN}/${FIXTURES.length} fixtures OK => ${okN===FIXTURES.length ? 'OK' : 'MISMATCH'}`);
process.exit(okN===FIXTURES.length ? 0 : 1);
