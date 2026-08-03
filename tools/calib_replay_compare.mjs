// 実機の**実際に押した順**をシムで強制リプレイし、ターン別・成分別に実機と突合する。★リポジトリ非改変
//
// 背景: sim05 は「押し順の序数検証」を目的から外し、代わりに**実走の押し順をそのまま再生して成分で突き合わせる**
//   方式に切り替えた（simulation/sim05/README.md §1）。本ハーネスがその突合の実体で、
//   `simulation/sim05/analysis/` の数値はすべてこれで再現できる。
//
// 方式:
//   ①実機側 = `simulation/sim05/data/pre-trial.md` の §1 テーブルをパースして成分別に集計する
//     （行の構造＝どの位置の数値がどの成分か は pre-trial.md の「成分」列の並びに従う）。
//   ②シム側 = 同じ押し順を `greedyTakeTurn(t, forcedKeys)` で強制実行し、`sim.dmg` の setter で
//     **加算点のソース行**を読んで成分に帰属させる（production コードには一切触れない）。
//   ③両者を成分別に並べ、比と差分寄与（そのターンの乖離のうち何%か）を出す。
//
// ⚠ソース行→成分の対応表 SITE は `gamedata/js/characters.js` / `src/sim.js` の**行番号**に依存する。
//   両ファイルを編集したら SITE を更新すること（未知の行は行番号のまま表示されるので気付ける）。
//
// 実行:
//   node tools/calib_replay_compare.mjs            # 既定（enemy_abil_cap 解除＝実機 T1 は 42 手）
//   node tools/calib_replay_compare.mjs --cap19    # production 既定の cap=19 を掛けた場合
//   node tools/calib_replay_compare.mjs --wipe     # T1 終了時にバフ全消去（アビ上限超過ペナルティ仮説）
import fs from 'node:fs';
import { Sim, buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG,
         setCurrentSubs, setStaticOverride } from '/home/user/kamipro/src/app.js';

const log = s => process.stdout.write(s + '\n');
const fmt = n => Math.round(n).toLocaleString('en-US');
const nums = s => (s.match(/\d[\d,]*/g) || []).map(x => +x.replace(/,/g, ''));

// ══ 1. 実機側（pre-trial.md §1 のパース）══════════════════════════
const SRC = '/home/user/kamipro/simulation/sim05/data/pre-trial.md';
const src = fs.readFileSync(SRC, 'utf8').split('\n');
const R = { 1:{}, 2:{}, 3:{} };
const add = (t,k,v,n=1) => { R[t][k]=(R[t][k]||0)+v; R[t]['#'+k]=(R[t]['#'+k]||0)+n; };
let curT = null;
for (const ln of src) {
  if (!ln.startsWith('|')) continue;
  const c = ln.split('|').slice(1,-1).map(s=>s.trim());
  if (c.length !== 11 || c[0]==='T' || /^-+$/.test(c[0])) continue;
  if (c[0]) curT = +c[0];
  const t = curT, key = c[2], v = nums(c[7]);
  if (!v.length) continue;
  if (c[1] === '(攻撃フェイズ)') {            // FB: ナポ / ヘカテー / テトラ / アリアン / エレイン / streak
    const g = c[7].split('/').map(nums);
    add(t,'burst_body',g[0][0]);
    add(t,'burst_body',g[1][0]); add(t,'extra_hecate',g[1][1]);
    add(t,'burst_body',g[2][0]); add(t,'extra_tetra',g[2][1]);
    add(t,'burst_body',g[3][0]); add(t,'extra_arian',g[3][1]);
    add(t,'holy',g[3].slice(2,10).reduce((a,b)=>a+b,0),8); add(t,'follow_arian',g[3][10]);
    add(t,'burst_body',g[4][0]); add(t,'extra_elaine',g[4][1]);
    add(t,'streak',g[5][0]);
    continue;
  }
  if (key === 'holy') add(t,'holy',v.reduce((a,b)=>a+b,0),8);
  else if (key === 'judg(赤)') {
    if (c[3]==='ph0') add(t,'judg_ph0',v.reduce((a,b)=>a+b,0),10);
    else if (c[3]==='ph1') { add(t,'burst_body',v[0]); add(t,'extra_tetra',v[1]); }
    else add(t,'judg_ph2',v.reduce((a,b)=>a+b,0),v.length);
  }
  else if (key === 'effond(赤)') { add(t,'effond_abi',v[0]); add(t,'burst_body',v[1]); add(t,'extra_hecate',v[2]); }
  else if (key === 'alone(赤)')  { add(t,'burst_body',v[0]); add(t,'extra_elaine',v[1]); }
  else if (key === 'consort')    add(t,'consort',v.reduce((a,b)=>a+b,0),v.length);
  else if (/elegant/.test(key))  { add(t,'burst_body',v[0]); add(t,'extra_arian',v[1]);
                                   add(t,'holy',v.slice(2,10).reduce((a,b)=>a+b,0),8); add(t,'follow_arian',v[10]); }
}
let tt = null;   // ターン終了ブロック（DOT / 反撃 / betaia / holy）
for (const ln of src) {
  const m = ln.trim().match(/^T([123])$/); if (m) { tt = +m[1]; continue; }
  if (!tt) continue;
  if (/^## /.test(ln)) { tt = null; continue; }
  const mm = ln.match(/^- ([^:]+):\s*(.*)$/); if (!mm) continue;
  const lab = mm[1], v = nums(mm[2]);
  if (/DOT/.test(lab)) add(tt,'dot', v[0]*v[1]);
  else if (/反撃/.test(lab) && v.length) add(tt,'counter', v.reduce((a,b)=>a+b,0), v.length);
  else if (/betaia/.test(lab)) add(tt,'betaia', v.reduce((a,b)=>a+b,0), v.length);
  else if (/^holy/.test(lab)) add(tt,'holy', v.reduce((a,b)=>a+b,0), v.length);
}
// 実機 betaia はポップアップ1個に集約表示される（1ヒットずつ出ない）ため、ヒット数は闘気=ナポカウント
// （pre-trial.md §5「ナポカウントは T1:29 / T2:13」＋ factor によるベタイア2回発動）から与える。
const REAL_AURA = { 1: 29*2, 2: 13*2, 3: 14 };
for (const t of [1,2,3]) R[t]['#betaia'] = REAL_AURA[t];

// ══ 2. シム側（configC で同じ押し順を強制リプレイ）══════════════════
// ★config は**ハードコードしない**。GEAR・サブ枠・パーティ順・敵パラメータは受領キャッシュ JSON の
//   `_configSig` キーから復元し、表示ATK は**trial md のヘッダに記録された実機値**を使う。
//   （2026-08-03: ハーネスに v2 GEAR と repo の ATK override を手で置いていたため、T1 比が ×1.77 と
//     0.36 も過大に出ていた。config は必ずデータ側から与える＝REPO_STANDARDS E2。）
const CACHE = JSON.parse(fs.readFileSync('/home/user/kamipro/simulation/sim05/data/configC_cache_20260803.json','utf8'));
const SIG = JSON.parse(CACHE.entries[0][0].split('|').slice(1).join('|'));
const [HERO, KAMI, GEAR_C, SUBS, E_DEF, E_HP, E_BM, E_BC, , E_BAR, E_CAP] = SIG;
setCurrentSubs(SUBS);
buildFormation(HERO, KAMI);
applyEnemy('ryomen_sukuna');
for (const k of Object.keys(GEAR)) GEAR[k] = GEAR_C[k] ?? 0;
DMG.enemy_def = E_DEF; DMG.enemy_max_hp = E_HP; DMG.enemy_barrier = E_BAR;
DMG.edison_burst_extra_mult = E_BM; DMG.edison_burst_extra_cap = E_BC;
DMG.betaia_mult = 3.5; DMG.betaia_cap = 800000; DMG.napo_burst_cd_reduce = true;   // 英霊武器（レス・ボナパルト）
// 表示ATK: trial md ヘッダ「UI装備パネル一致確認（表示ATK5人分）: napoleon=… / …」の実機値を使う。
// ⚠ `DISPLAY_ATK_OVERRIDE_BY_FORMATION`（src/app.js）は **golden の napoleon fixture に効くため未更新のまま**
//    ＝リポジトリ側の値は走行時点より古い。走の条件は**その走の記録**が正。
const DISP = {};
{
  const m = src.find(l => /表示ATK5人分/.test(l));
  if (!m) { console.error('★ trial md に「表示ATK5人分」の行が無い＝config を再現できない'); process.exit(1); }
  for (const [, k, v] of m.matchAll(/([a-z_]+)=([\d,]+)/g)) DISP[k] = +v.replace(/,/g,'');
}
recalcGearK(); recalcGearKCFromDispAtk(DISP);
setStaticOverride({ pactcore:1, effond:120 });
DMG.enemy_abil_cap = process.argv.includes('--cap19') ? 19 : E_CAP === undefined ? null : null;

const SITE = { 'sim.js:204':'burst_body', 'sim.js:362':'streak', 'characters.js:41':'holy',
  'characters.js:293':'effond_abi', 'characters.js:334':'extra_hecate', 'characters.js:369':'judg_ph0',
  'characters.js:373':'judg_ph2', 'characters.js:417':'extra_tetra', 'characters.js:429':'dot',
  'characters.js:486':'extra_elaine', 'characters.js:548':'extra_arian', 'characters.js:549':'follow_arian',
  'characters.js:610':'consort', 'characters.js:657':'betaia' };
const S = { 1:{}, 2:{}, 3:{} }; let curTurn = 0, _d = 0;

// 実機の押下列は §1 テーブルの「key/イベント」列から**そのまま読む**（手写ししない＝転記事故の排除）。
// ラベル装飾 `(赤)` を落とし、elegant の2回目以降はシムのキー `elegant_re` へ写像する（ターン毎にリセット）。
const KEYS = {};
{
  let t = null, eleg = 0;
  for (const ln of src) {
    if (!ln.startsWith('|')) continue;
    const c = ln.split('|').slice(1,-1).map(s=>s.trim());
    if (c.length !== 11 || c[0]==='T' || /^-+$/.test(c[0])) continue;
    if (c[0]) { if (+c[0] !== t) eleg = 0; t = +c[0]; }
    if (!t || c[1] === '(攻撃フェイズ)') continue;
    const key = c[2].replace(/\(.*\)$/, '').trim();
    if (!key) continue;
    (KEYS[t] ??= []).push(key === 'elegant' ? (eleg++ ? 'elegant_re' : 'elegant') : key);
  }
}

const sim = new Sim(); sim.totalTurns = 10; _d = sim.dmg;
Object.defineProperty(sim, 'dmg', { configurable:true, enumerable:true, get(){ return _d; }, set(v){
  const dd = v - _d; _d = v; if (!dd) return;
  const st = new Error().stack.split('\n').slice(2); let k = '?';
  for (const l of st) { const m = l.match(/(characters|sim)\.js:(\d+):/); if (m) { k = SITE[`${m[1]}.js:${m[2]}`] ?? `${m[1]}.js:${m[2]}`; break; } }
  S[curTurn][k] = (S[curTurn][k]||0) + dd;
  S[curTurn]['#'+k] = (S[curTurn]['#'+k]||0) + (k==='judg_ph0' ? 10 : 1);   // ph0 は1回の加算で10hit
}});
const turnInc = {}; const rejAll = {}; let prev = 0;
for (const t of [1,2,3]) {
  curTurn = t;
  const r = sim.greedyTakeTurn(t, KEYS[t]);
  if (t === 1 && process.argv.includes('--wipe')) sim.buf = {};
  const cnt = a => a.reduce((m,k)=>(m[k]=(m[k]||0)+1, m), {});
  const a = cnt(KEYS[t]), b = cnt(r.keys), rej = [];
  for (const k of Object.keys(a)) { const d = a[k]-(b[k]||0); if (d>0) rej.push(`${k}×${d}`); }
  rejAll[t] = { used:r.keys.length, rej };
  turnInc[t] = sim.dmg - prev; prev = sim.dmg;
}

// ══ 3. 出力 ══════════════════════════════════════════════════
const NAME = { burst_body:'バースト本体', extra_hecate:'追加ダメ ヘカテー', extra_tetra:'追加ダメ テトラ',
  extra_elaine:'追加ダメ エレイン', extra_arian:'追加ダメ アリアン(①)', follow_arian:'追撃 アリアン(②1アシ)',
  holy:'holy 8hit', judg_ph0:'judg ph0', judg_ph2:'judg ph2(通常)', effond_abi:'effond アビ',
  consort:'consort', betaia:'betaia', streak:'ストリーク', dot:'DOT', counter:'反撃' };
const HP = 9.8e8;
log(`\n■ 強制リプレイ（config=configC_cache_20260803.json / ryomen_sukuna / enemy_abil_cap=${DMG.enemy_abil_cap}${process.argv.includes('--wipe')?' / T1末バフ全消去':''}）`);
log(`  GEAR: ${JSON.stringify(GEAR_C)}`);
log(`  サブ枠: ${JSON.stringify(SUBS)} / パーティ順: ${JSON.stringify(KAMI)} / 表示ATK(trial md 記録値): ${JSON.stringify(DISP)}`);
for (const t of [1,2,3]) {
  const rTot = Object.keys(NAME).reduce((a,k)=>a+(R[t][k]||0), 0);
  const sTot = Object.keys(NAME).reduce((a,k)=>a+(S[t][k]||0), 0);
  const gap = rTot - sTot;
  log(`\n### T${t}　実機 ${fmt(rTot)}（HP ${(rTot/HP*100).toFixed(1)}%） / シム ${fmt(turnInc[t])} ＝ **×${(rTot/turnInc[t]).toFixed(2)}**`);
  log(`（シム実行 ${rejAll[t].used}手 / 実機 ${KEYS[t].length}手・却下 ${rejAll[t].rej.join(' ')||'なし'}）\n`);
  log('| 成分 | 実機 | (hit) | シム | (hit) | 比 | 差分(実機-シム) | 差分寄与 |');
  log('|---|---|---|---|---|---|---|---|');
  for (const k of Object.keys(NAME)) {
    const rv = R[t][k]||0, sv = S[t][k]||0; if (!rv && !sv) continue;
    const d = rv - sv;
    log(`| ${NAME[k]} | ${fmt(rv)} | ${R[t]['#'+k]||'—'} | ${fmt(sv)} | ${S[t]['#'+k]||'—'} | ${sv?'×'+(rv/sv).toFixed(2):'—'} | ${d>=0?'+':''}${fmt(d)} | ${(d/gap*100).toFixed(1)}% |`);
  }
  log(`| **計** | **${fmt(rTot)}** | | **${fmt(sTot)}** | | | **+${fmt(gap)}** | 100% |`);
}
log('\n### 1ヒット平均\n');
log('| 成分 | T | 実機/hit | シム/hit | 比 |');
log('|---|---|---|---|---|');
for (const k of Object.keys(NAME)) for (const t of [1,2,3]) {
  const rn = R[t]['#'+k], sn = S[t]['#'+k]; if (!rn || !sn) continue;
  log(`| ${NAME[k]} | T${t} | ${fmt(R[t][k]/rn)} | ${fmt(S[t][k]/sn)} | ×${((R[t][k]/rn)/(S[t][k]/sn)).toFixed(2)} |`);
}
