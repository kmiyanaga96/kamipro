// 実機の**実際に押した順**をシムで強制リプレイし、ターン別・成分別に実機と突合する。★リポジトリ非改変
//
// 背景: sim05 は「押し順の序数検証」を目的から外し、代わりに**実走の押し順をそのまま再生して成分で突き合わせる**
//   方式に切り替えた（simulation/sim05/README.md §1）。本ハーネスがその突合の実体で、
//   `simulation/sim05/analysis/` の数値はすべてこれで再現できる。
//
// 方式:
//   ①実機側 = trial md の §1 テーブルをパースして成分別に集計する
//     （行の構造＝どの位置の数値がどの成分か は md の「成分」列の並びに従う）。
//     **列レイアウトはヘッダ行から解決する**＝pre-trial の11列様式と record_skeleton 更新後の12列様式
//     （`契晶(押下後)` が増えた）の両方をそのまま読める。
//   ②シム側 = 同じ押し順を **1押下ずつ** `_execKey` で強制実行し、`sim.dmg` の setter で
//     **加算点のソース行**を読んで成分に帰属させる（production コードには一切触れない）。
//     `greedyTakeTurn(t, forcedKeys)` を分解して呼ぶが、_beginTurn → _primeLookaheads → _execKey* →
//     _attackPhase → _endBookkeep の順序は本体と同一＝**結果はビット一致**（--selftest で検証できる）。
//   ③両者を成分別に並べ、比と差分寄与（そのターンの乖離のうち何%か）を出す。
//
// ★ミッドターン撃破（攻撃フェイズに到達せず終わった走）への対応:
//   実機 md に `(攻撃フェイズ)` 行が**無いターン**は「押下フェイズだけで終わった」と解釈し、
//   シム側も `_attackPhase()` / `_endBookkeep()` を**呼ばない**（＝押下フェイズのみを突合する）。
//   これをやらないと、実機に存在しない5人ぶんのバーストとターン終了時ダメージがシム側にだけ乗る。
//   ⚠ 押下のみのターンは**最終ターンでしか許さない**（以降のターンは状態が実機と食い違うため）。
//
// ★config は台帳から読む（REPO_STANDARDS §6 **E10** / tools/README.md §0.5）。
//   `lib/config_c.mjs` で受領キャッシュから configC を復元し、**先に台帳条件で E2 bit 一致**を通してから、
//   trial md ヘッダの敵キー・実機表示ATK で条件を差し替える。
//
// ⚠ソース行→成分の対応表 SITE は `gamedata/js/characters.js` / `src/sim.js` の**行番号**に依存する。
//   両ファイルを編集したら SITE を更新すること（未知の行は行番号のまま表示されるので気付ける）。
//
// 実行:
//   node tools/calib_replay_compare.mjs                       # 既定＝pre-trial（両面宿儺・enemy_abil_cap 解除）
//   node tools/calib_replay_compare.mjs --src trial01.md      # 別 trial（`simulation/sim05/data/` 相対でよい）
//   node tools/calib_replay_compare.mjs --cap19               # 敵の enemy_abil_cap を 19 で強制
//   node tools/calib_replay_compare.mjs --abilcap <n|null>    # 同上（任意値）
//   node tools/calib_replay_compare.mjs --wipe                # T1 終了時にバフ全消去（アビ上限超過ペナルティ仮説）
//   node tools/calib_replay_compare.mjs --per-press           # ★押下ごとに実機/シムを並べる（C40/C44 の主データ）
//   node tools/calib_replay_compare.mjs --cap-probe           # ★成分別に raw / 実効cap / 出力を採取（cap拘束の有無＝C40/C41）
//   node tools/calib_replay_compare.mjs --def <n>             # 敵防御を上書き（def は placeholder＝感度の対照実験に使う）
//   node tools/calib_replay_compare.mjs --selftest            # 分解実行が greedyTakeTurn とビット一致するか検証
import fs from 'node:fs';
import path from 'node:path';
import { Sim, DMG, GEAR, ENEMY_REGISTRY, ENGINE_VERSION,
         recalcGearK, recalcGearKCFromDispAtk } from '/home/user/kamipro/src/app.js';
import { loadConfigC, verifyE2, configBanner } from './lib/config_c.mjs';

const log = s => process.stdout.write(s + '\n');
const fmt = n => Math.round(n).toLocaleString('en-US');
const nums = s => (s.match(/\d[\d,]*/g) || []).map(x => +x.replace(/,/g, ''));
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

// ══ 0. 入力 trial の解決 ════════════════════════════════════════
const DATA_DIR = '/home/user/kamipro/simulation/sim05/data';
const SRC = (() => {
  const s = opt('--src', 'pre-trial.md');
  return path.isAbsolute(s) ? s : fs.existsSync(path.join(DATA_DIR, s)) ? path.join(DATA_DIR, s) : path.resolve(s);
})();
const src = fs.readFileSync(SRC, 'utf8').split('\n');
const TRIAL = path.basename(SRC, '.md');

// ══ 1. 実機側（trial md §1 のパース）════════════════════════════
// 列レイアウトはヘッダ行から解決する（11列様式＝pre-trial / 12列様式＝record_skeleton 2026-08-05 更新後）。
const COLS = (() => {
  for (const ln of src) {
    if (!ln.startsWith('|') || !/key\/イベント/.test(ln)) continue;
    const h = ln.split('|').slice(1, -1).map(s => s.trim());
    const at = re => h.findIndex(x => re.test(x));
    const c = { n: h.length, t: at(/^T$/), press: at(/押下#/), key: at(/key\/イベント/),
                ph: at(/judgフェーズ/), val: at(/^値$/), comp: at(/^成分$/) };
    if (c.t < 0 || c.key < 0 || c.val < 0) continue;
    return c;
  }
  console.error(`★ ${TRIAL}.md に §1 押下ログのヘッダ行が見つからない`); process.exit(1);
})();

// §1 のデータ行だけを、ターン番号を持ち越しながら列挙する（ヘッダ・区切り・表外を除く）。
function* rows(){
  let t = null;
  for (const ln of src) {
    if (!ln.startsWith('|')) continue;
    const c = ln.split('|').slice(1, -1).map(s => s.trim());
    if (c.length !== COLS.n || c[COLS.t] === 'T' || /^-+$/.test(c[COLS.t])) continue;
    if (c[COLS.t]) t = +c[COLS.t];
    if (!t) continue;
    yield { t, c, key: c[COLS.key], press: COLS.press >= 0 ? c[COLS.press] : '', ph: COLS.ph >= 0 ? c[COLS.ph] : '' };
  }
}

const R = {};                       // 実機: R[t][成分]=値 / R[t]['#'+成分]=hit数
const TURNS = [];                   // md に現れるターン（昇順）
const HAS_FB = {};                  // そのターンに `(攻撃フェイズ)` 行があるか
const REAL_PRESS = {};              // 押下ごとの実機成分（--per-press 用）
const add = (t,k,v,n=1) => { R[t][k]=(R[t][k]||0)+v; R[t]['#'+k]=(R[t]['#'+k]||0)+n; };

for (const { t, c, key, press } of rows()) {
  if (!R[t]) { R[t] = {}; TURNS.push(t); REAL_PRESS[t] = []; }
  const isFB = press === '(攻撃フェイズ)';
  if (isFB) HAS_FB[t] = true;
  const v = nums(c[COLS.val]);
  if (!v.length) { if (!isFB) REAL_PRESS[t].push({ press, key, comp: {} }); continue; }

  const P = {};                                     // この押下の実機成分（per-press 用）
  const put = (k, val, n=1) => { add(t, k, val, n); P[k] = (P[k]||0) + val; };

  if (isFB) {                       // FB: ナポ / ヘカテー / テトラ / アリアン / エレイン / streak
    const g = c[COLS.val].split('/').map(nums);
    put('burst_body',g[0][0]);
    put('burst_body',g[1][0]); put('extra_hecate',g[1][1]);
    put('burst_body',g[2][0]); put('extra_tetra',g[2][1]);
    put('burst_body',g[3][0]); put('extra_arian',g[3][1]);
    put('holy',g[3].slice(2,10).reduce((a,b)=>a+b,0),8); put('follow_arian',g[3][10]);
    put('burst_body',g[4][0]); put('extra_elaine',g[4][1]);
    put('streak',g[5][0]);
  }
  else if (key === 'holy') put('holy',v.reduce((a,b)=>a+b,0),8);
  else if (/^judg/.test(key)) {
    const phase = COLS.ph >= 0 ? c[COLS.ph] : '';
    if (phase==='ph0') put('judg_ph0',v.reduce((a,b)=>a+b,0),10);
    else if (phase==='ph1') { put('burst_body',v[0]); put('extra_tetra',v[1]); }
    else put('judg_ph2',v.reduce((a,b)=>a+b,0),v.length);
  }
  else if (/^effond/.test(key)) { put('effond_abi',v[0]); put('burst_body',v[1]); put('extra_hecate',v[2]); }
  else if (/^alone/.test(key))  { put('burst_body',v[0]); put('extra_elaine',v[1]); }
  else if (/^consort/.test(key)) put('consort',v.reduce((a,b)=>a+b,0),v.length);
  else if (/elegant/.test(key)) { put('burst_body',v[0]); put('extra_arian',v[1]);
                                  put('holy',v.slice(2,10).reduce((a,b)=>a+b,0),8); put('follow_arian',v[10]); }
  else { console.error(`★ 未知の成分レイアウト: T${t} #${press} key=${key}（値があるのに帰属先が無い）`); process.exit(1); }

  if (!isFB) REAL_PRESS[t].push({ press, key, comp: P });
}
TURNS.sort((a,b)=>a-b);

// ターン終了ブロック（DOT / 反撃 / betaia / holy）。`T1` 等の単独行から次の見出しまでを読む。
{
  let tt = null;
  for (const ln of src) {
    const m = ln.trim().match(/^T(\d+)$/); if (m) { tt = +m[1]; continue; }
    if (!tt) continue;
    if (/^## /.test(ln)) { tt = null; continue; }
    const mm = ln.match(/^- ([^:]+):\s*(.*)$/); if (!mm || !R[tt]) continue;
    const lab = mm[1], v = nums(mm[2]);
    if (!v.length) continue;
    if (/DOT/.test(lab)) add(tt,'dot', v[0]*v[1]);
    else if (/反撃/.test(lab)) add(tt,'counter', v.reduce((a,b)=>a+b,0), v.length);
    else if (/betaia/.test(lab)) add(tt,'betaia', v.reduce((a,b)=>a+b,0), v.length);
    else if (/^holy/.test(lab)) add(tt,'holy', v.reduce((a,b)=>a+b,0), v.length);
  }
}
// 実機 betaia はポップアップ1個に集約表示される（1ヒットずつ出ない）ため、ヒット数は闘気=ナポカウント
// で与える。⚠ trial ごとの一次情報なので**台帳をこの表に足す**（合算値しか無い trial では比較不能）。
const REAL_BETAIA_HITS = { 'pre-trial': { 1: 29*2, 2: 13*2, 3: 14 } };   // pre-trial.md §5「T1:29 / T2:13」＋factorで2回発動
for (const [t, n] of Object.entries(REAL_BETAIA_HITS[TRIAL] || {})) if (R[+t]?.betaia) R[+t]['#betaia'] = n;

// 押下列は §1 の「key/イベント」列から**そのまま読む**（手写ししない＝転記事故の排除）。
// ラベル装飾 `(赤)` を落とし、`elegant` の2回目以降はシムのキー `elegant_re` へ写像する（ターン毎にリセット）。
const KEYS = {};
{
  let t = null, eleg = 0;
  for (const r of rows()) {
    if (r.t !== t) { eleg = 0; t = r.t; }
    if (r.press === '(攻撃フェイズ)') continue;
    const key = r.key.replace(/\(.*\)$/, '').trim();
    if (!key) continue;
    (KEYS[t] ??= []).push(key === 'elegant' ? (eleg++ ? 'elegant_re' : 'elegant') : key);
  }
}

// ══ 2. シム側（config は台帳から・敵とATKは trial md から）════════
// ①台帳条件で load →②E2 bit 一致 →③trial の条件で再 load（E10 の作法）。
const base = loadConfigC();
verifyE2(base, { silent: true });

const ENEMY = (() => {
  const l = src.find(x => /^-\s*\*{0,2}敵/.test(x) && /[:：]/.test(x));
  const m = l && l.match(/[:：]\s*\**\s*`?([a-z_]+)`?/);
  if (!m || !ENEMY_REGISTRY[m[1]]) { console.error(`★ trial md ヘッダから敵キーを解決できない: ${l ?? '(敵の行が無い)'}`); process.exit(1); }
  return m[1];
})();
const DISP = (() => {
  const l = src.find(x => /表示ATK/.test(x));
  if (!l) { console.error('★ trial md に「表示ATK」の行が無い＝config を再現できない'); process.exit(1); }
  const d = {}; for (const [, k, v] of l.matchAll(/([a-z_]+)=([\d,]+)/g)) d[k] = +v.replace(/,/g, '');
  if (!Object.keys(d).length) { console.error(`★ 表示ATK 行を解釈できない: ${l}`); process.exit(1); }
  return d;
})();
// 敵を変えると `loadConfigC` は registry 値を使う（台帳の敵パラメータは混ぜない＝1変数だけ動かす設計）。
const cfg = loadConfigC({ enemy: ENEMY, atk: DISP });
if (flag('--cap19')) DMG.enemy_abil_cap = 19;
else if (opt('--abilcap', null) != null) DMG.enemy_abil_cap = opt('--abilcap') === 'null' ? null : +opt('--abilcap');
else if (ENEMY === 'ryomen_sukuna') DMG.enemy_abil_cap = null;   // 既定＝解除（実機 T1 は 42 手）
cfg.abilCap = DMG.enemy_abil_cap;
// 敵防御は **placeholder**（cath_palug def=10 / ryomen_sukuna def=20 は有志値）＝感度の対照実験用に上書きできる。
// ⚠ `DMG.enemy_def` は `_gearKScale`（`src/app.js:188`）で **GEAR_K / GEAR_K_C に畳み込まれる**＝
//   代入するだけでは何も起きない。**必ず recalc を走らせ直す**こと
//   （初版はこれを忘れており `--def` が完全な no-op だった＝「def を動かしても比が動かない」という
//     誤った観測を生んだ。2026-08-06 修正）。
if (opt('--def', null) != null) {
  DMG.enemy_def = +opt('--def');
  recalcGearK(); recalcGearKCFromDispAtk(DISP);
  cfg.enemyDef = DMG.enemy_def;
}

// ★cap 拘束の probe: `_decay` を包んで (frame, raw, 実効cap, 出力) を採取する（production 非改変・呼び出し後に復元）。
// 「cap が過小」なのか「式が違う」のかは、**実機値がシムの raw を超えているか**で切り分く。
const CAPLOG = [];
if (flag('--cap-probe')) {
  const orig = Sim.prototype._decay;
  Sim.prototype._decay = function(frame, raw, base, noCalib){
    const out = orig.call(this, frame, raw, base, noCalib);
    const up = (GEAR[frame+'_cap']||0) + (DMG['sub_'+frame+'_cap']||0)
             + ((frame==='na'||frame==='abi') ? this._partyCapUp() : 0);
    const cap = frame==='na'   ? DMG.decay_na.cap1*(1+up)
              : frame==='burst'? (base ?? DMG.decay_burst.cap1)
              : frame==='abi'  ? (base ?? Infinity)*(1+up)
              : frame==='streak'? (DMG.decay_streak.caps[base??5]||DMG.decay_streak.caps[5])[0]
              : (base ?? Infinity)*(1+up);
    const st = new Error().stack.split('\n').slice(2); let site = '?';
    for (const l of st) { const m = l.match(/(characters|sim)\.js:(\d+):/); if (m) { site = `${m[1]}.js:${m[2]}`; break; } }
    CAPLOG.push({ t: curTurn, frame, site, raw, cap, out, bound: raw > cap });
    return out;
  };
}

const SITE = { 'sim.js:204':'burst_body', 'sim.js:362':'streak', 'characters.js:41':'holy',
  'characters.js:293':'effond_abi', 'characters.js:334':'extra_hecate', 'characters.js:369':'judg_ph0',
  'characters.js:373':'judg_ph2', 'characters.js:417':'extra_tetra', 'characters.js:429':'dot',
  'characters.js:486':'extra_elaine', 'characters.js:548':'extra_arian', 'characters.js:549':'follow_arian',
  'characters.js:610':'consort', 'characters.js:657':'betaia' };
// `_decay` の**呼び出し点**（加算点 SITE の1〜2行手前）。--cap-probe が内部量を成分へ帰属させるのに使う。
// ⚠ `characters.js:547` は1つの `_decay` 結果を **extra_arian と follow_arian の両方**に加算している
//   ＝シムはアリアンの「バースト効果 追加ダメージ」と「1アシ追撃」を**同一の値**でモデル化している（C40 の構造論点）。
const DECAY_SITE = { 'sim.js:202':'burst_body', 'sim.js:54':'_naForAbi', 'characters.js:40':'holy',
  'characters.js:368':'judg_ph0', 'characters.js:547':'extra_arian' };
const DECAY_NOTE = { 'sim.js:54':'（アビ基底・加算なし）', 'characters.js:547':'（★follow_arian と同値を2回加算）',
  'sim.js:202':'（★出力は core＝この後 ×calib_burst＋バーストプラス）' };
const S = {}; for (const t of TURNS) S[t] = {};
let curTurn = TURNS[0], _d = 0, PRESS_ACC = null;

function instrument(sim){
  _d = sim.dmg;
  Object.defineProperty(sim, 'dmg', { configurable:true, enumerable:true, get(){ return _d; }, set(v){
    const dd = v - _d; _d = v; if (!dd) return;
    const st = new Error().stack.split('\n').slice(2); let k = '?';
    for (const l of st) { const m = l.match(/(characters|sim)\.js:(\d+):/); if (m) { k = SITE[`${m[1]}.js:${m[2]}`] ?? `${m[1]}.js:${m[2]}`; break; } }
    const n = k === 'judg_ph0' ? 10 : 1;    // ph0 は1回の加算で10hit
    S[curTurn][k] = (S[curTurn][k]||0) + dd;
    S[curTurn]['#'+k] = (S[curTurn]['#'+k]||0) + n;
    if (PRESS_ACC) PRESS_ACC[k] = (PRESS_ACC[k]||0) + dd;
  }});
}

// greedyTakeTurn(t, forcedKeys) の分解版。押下ごとの帰属を取るために1手ずつ実行する。
// ⚠ 呼び出し順は本体と同一（--selftest がビット一致を検証する）。
// fb=false のターンは攻撃フェイズ・ターン終了処理を**行わない**（＝実機がミッドターン撃破で終わった走）。
function replayTurn(sim, t, keys, fb, perPress){
  sim._beginTurn(t);
  sim._primeLookaheads(t);
  const used = [];
  for (const key of keys) {
    PRESS_ACC = perPress ? {} : null;
    if (sim._execKey(key)) used.push(key);
    if (perPress) perPress.push({ key, ok: used[used.length-1] === key, comp: PRESS_ACC });
    PRESS_ACC = null;
  }
  if (!fb) return { used, atk: null };
  const atk = sim._attackPhase();
  sim._endBookkeep(t);
  return { used, atk };
}

// --selftest: 分解実行が production の greedyTakeTurn とビット一致することを確認する。
if (flag('--selftest')) {
  const run = (decomposed) => {
    const s = new Sim(); s.totalTurns = 10;
    for (const t of TURNS) decomposed ? replayTurn(s, t, KEYS[t], true, null) : s.greedyTakeTurn(t, KEYS[t]);
    return s.dmg;
  };
  const a = run(false), b = run(true);
  log(`selftest: greedyTakeTurn ${a} / 分解実行 ${b} → ${a === b ? '✅ ビット一致' : '❌ 不一致'}`);
  process.exit(a === b ? 0 : 1);
}

// 押下のみで終わるターンは最終ターンでしか許さない（以降は状態が実機と食い違う）。
for (const t of TURNS) if (!HAS_FB[t] && t !== TURNS[TURNS.length-1]) {
  console.error(`★ T${t} に攻撃フェイズ行が無いのに後続ターンがある＝突合できない（記録漏れの疑い）`); process.exit(1);
}

const sim = new Sim(); sim.totalTurns = 10; instrument(sim);
const turnInc = {}, rejAll = {}, SIM_PRESS = {}; let prev = 0;
for (const t of TURNS) {
  curTurn = t;
  const perPress = flag('--per-press') ? [] : null;
  const r = replayTurn(sim, t, KEYS[t], !!HAS_FB[t], perPress);
  SIM_PRESS[t] = perPress;
  if (t === TURNS[0] && flag('--wipe')) sim.buf = {};
  const cnt = a => a.reduce((m,k)=>(m[k]=(m[k]||0)+1, m), {});
  const a = cnt(KEYS[t]), b = cnt(r.used), rej = [];
  for (const k of Object.keys(a)) { const d = a[k]-(b[k]||0); if (d>0) rej.push(`${k}×${d}`); }
  rejAll[t] = { used:r.used.length, rej };
  turnInc[t] = sim.dmg - prev; prev = sim.dmg;
}

// ══ 3. 出力 ══════════════════════════════════════════════════
const NAME = { burst_body:'バースト本体', extra_hecate:'追加ダメ ヘカテー', extra_tetra:'追加ダメ テトラ',
  extra_elaine:'追加ダメ エレイン', extra_arian:'追加ダメ アリアン(①)', follow_arian:'追撃 アリアン(②1アシ)',
  holy:'holy 8hit', judg_ph0:'judg ph0', judg_ph2:'judg ph2(通常)', effond_abi:'effond アビ',
  consort:'consort', betaia:'betaia', streak:'ストリーク', dot:'DOT', counter:'反撃' };
const HP = DMG.enemy_max_hp;
log(`\n■ 強制リプレイ — ${TRIAL}（ENGINE_VERSION ${ENGINE_VERSION}${flag('--wipe')?' / T1末バフ全消去':''}）`);
log(`  ${configBanner(cfg)}`);
log(`  敵HP ${fmt(HP)} / 表示ATK(trial md 記録値): ${JSON.stringify(DISP)}`);
for (const t of TURNS) if (!HAS_FB[t]) log(`  ⚠ T${t} は実機に攻撃フェイズ行が無い＝**押下フェイズのみ**で突合（シムも _attackPhase/_endBookkeep を呼ばない）`);

for (const t of TURNS) {
  const rTot = Object.keys(NAME).reduce((a,k)=>a+(R[t][k]||0), 0);
  const sTot = Object.keys(NAME).reduce((a,k)=>a+(S[t][k]||0), 0);
  const gap = rTot - sTot;
  log(`\n### T${t}　実機 ${fmt(rTot)}（HP ${(rTot/HP*100).toFixed(1)}%） / シム ${fmt(turnInc[t])} ＝ **×${(rTot/turnInc[t]).toFixed(2)}**`);
  log(`（シム実行 ${rejAll[t].used}手 / 実機 ${KEYS[t].length}手・却下 ${rejAll[t].rej.join(' ')||'なし'}${HAS_FB[t]?'':' ／ 押下フェイズのみ'}）\n`);
  log('| 成分 | 実機 | (hit) | シム | (hit) | 比 | 差分(実機-シム) | 差分寄与 |');
  log('|---|---|---|---|---|---|---|---|');
  for (const k of Object.keys(NAME)) {
    const rv = R[t][k]||0, sv = S[t][k]||0; if (!rv && !sv) continue;
    const d = rv - sv;
    log(`| ${NAME[k]} | ${fmt(rv)} | ${R[t]['#'+k]||'—'} | ${fmt(sv)} | ${S[t]['#'+k]||'—'} | ${sv?'×'+(rv/sv).toFixed(2):'—'} | ${d>=0?'+':''}${fmt(d)} | ${(d/gap*100).toFixed(1)}% |`);
  }
  log(`| **計** | **${fmt(rTot)}** | | **${fmt(sTot)}** | | | **+${fmt(gap)}** | 100% |`);
  // ★総差 gap は「不足」と「過大」の**差引**にすぎない＝符号が相殺すると小さく見える。
  //   モデル誤差の大きさは **絶対値の総和（gross）** で見る。net/gross が 1 に近いほど誤差は一方向。
  let pos = 0, neg = 0;
  for (const k of Object.keys(NAME)) { const d = (R[t][k]||0) - (S[t][k]||0); d >= 0 ? pos += d : neg -= d; }
  log(`\n**誤差の大きさ**: 不足 +${fmt(pos)} / 過大 −${fmt(neg)} ＝ **gross ${fmt(pos+neg)}（シム比 ${((pos+neg)/sTot*100).toFixed(1)}%）**`
    + ` ／ net ${gap>=0?'+':'−'}${fmt(Math.abs(gap))}（同 ${(gap/sTot*100).toFixed(1)}%）・**相殺率 ${(neg/(pos+neg)*100).toFixed(1)}%**`);
}
log('\n### 1ヒット平均\n');
log('| 成分 | T | 実機/hit | シム/hit | 比 |');
log('|---|---|---|---|---|');
for (const k of Object.keys(NAME)) for (const t of TURNS) {
  const rn = R[t]['#'+k], sn = S[t]['#'+k]; if (!rn || !sn) continue;
  log(`| ${NAME[k]} | T${t} | ${fmt(R[t][k]/rn)} | ${fmt(S[t][k]/sn)} | ×${((R[t][k]/rn)/(S[t][k]/sn)).toFixed(2)} |`);
}

// ★cap 拘束の有無（C40「式が違う」 vs C41「cap が過小」の切り分け）。
// **実機/hit がシムの raw/hit を超えていれば、cap をいくら上げても届かない＝式そのものが違う**。
if (flag('--cap-probe')) {
  log('\n### cap 拘束の probe（シム内部量）\n');
  log('⚠ `_decay` は **1ヒット分**を返す成分がある（holy=8回加算 / judg ph0=10回加算 / judg ph2=実機は三段攻撃＝1回の');
  log('  `_decay` に実機3ヒットが対応）。表の n は **`_decay` 呼び出し回数**、実機列は **実機1ヒット**である。\n');
  log('| 成分(_decay 呼出点) | frame | n | raw/回 | 実効cap | 出力/回 | cap拘束 | 実機/hit | 実機 ≤ raw か |');
  log('|---|---|---|---|---|---|---|---|---|');
  const by = {};
  for (const e of CAPLOG) {
    const comp = DECAY_SITE[e.site] ?? SITE[e.site] ?? e.site;
    const k = `${comp}|${e.frame}`;
    (by[k] ??= { n:0, raw:0, cap:0, out:0, bound:0, comp, note: DECAY_NOTE[e.site] ?? '', frame: e.frame, t: e.t });
    const b = by[k]; b.n++; b.raw+=e.raw; b.cap+=e.cap; b.out+=e.out; b.bound+=e.bound?1:0;
  }
  for (const b of Object.values(by)) {
    const rv = R[b.t][b.comp], rn = R[b.t]['#'+b.comp];
    const perReal = rv && rn ? rv/rn : null;
    log(`| ${(NAME[b.comp] ?? b.comp) + b.note} | ${b.frame} | ${b.n} | ${fmt(b.raw/b.n)} | ${isFinite(b.cap)?fmt(b.cap/b.n):'∞'} | ${fmt(b.out/b.n)} | ${b.bound}/${b.n} | ${perReal?fmt(perReal):'—'} | ${perReal?(perReal<=b.raw/b.n?'✅ cap 引上げで届く':'❌ **raw を超える＝式が違う**'):'—'} |`);
  }
}

// ★押下ごとの突合（C40=追加ダメ/本体 の比・C44=本体の過大 の主データ）。
// 実機側の押下行とシム側の実行結果を**キーで前から順に対応づける**（却下された押下はシム側 0 として残す）。
if (flag('--per-press')) {
  const COMPS = ['burst_body','extra_hecate','extra_tetra','extra_elaine','extra_arian','follow_arian',
                 'holy','judg_ph0','judg_ph2','effond_abi','consort'];
  for (const t of TURNS) {
    log(`\n### T${t} 押下別（実機 → シム）\n`);
    log('| # | key | 成分 | 実機 | シム | 比 |');
    log('|---|---|---|---|---|---|');
    const simRows = SIM_PRESS[t];
    let si = 0;
    for (const rp of REAL_PRESS[t]) {
      if (!Object.keys(rp.comp).length) { si++; continue; }
      const sr = simRows[si++] || { comp:{}, ok:false };
      for (const k of COMPS) {
        const rv = rp.comp[k], sv = sr.comp?.[k];
        if (!rv && !sv) continue;
        log(`| ${rp.press} | ${rp.key} | ${NAME[k]} | ${rv?fmt(rv):'—'} | ${sv?fmt(sv):(sr.ok?'0':'（却下）')} | ${rv&&sv?'×'+(rv/sv).toFixed(3):'—'} |`);
      }
    }
    // ★追加ダメ / 本体 の比（C40 の主指標）: 同一押下内でペアが取れたものだけ。
    log(`\n**T${t} 追加ダメージ ÷ バースト本体（同一押下・C40）**\n`);
    log('| # | key | 実機 本体 | 実機 追加 | 実機 比 | シム 本体 | シム 追加 | シム 比 |');
    log('|---|---|---|---|---|---|---|---|');
    si = 0;
    for (const rp of REAL_PRESS[t]) {
      if (!Object.keys(rp.comp).length) { si++; continue; }
      const sr = simRows[si++] || { comp:{} };
      const ex = k => (rp.comp['extra_'+k]);
      const rb = rp.comp.burst_body, rx = ex('hecate') ?? ex('tetra') ?? ex('elaine') ?? ex('arian');
      if (!rb || !rx) continue;
      const sb = sr.comp?.burst_body, sx = sr.comp?.extra_hecate ?? sr.comp?.extra_tetra ?? sr.comp?.extra_elaine ?? sr.comp?.extra_arian;
      log(`| ${rp.press} | ${rp.key} | ${fmt(rb)} | ${fmt(rx)} | ${(rx/rb).toFixed(3)} | ${sb?fmt(sb):'—'} | ${sx?fmt(sx):'—'} | ${sb&&sx?(sx/sb).toFixed(3):'—'} |`);
    }
  }
}
