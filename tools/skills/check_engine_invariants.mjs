// check-engine-invariants ── エンジン不変条件の機械検査＋回帰実行
//
// 使い方:
//   node tools/skills/check_engine_invariants.mjs                 # 静的検査 + test:t1 + test:golden（約2分10秒）
//   node tools/skills/check_engine_invariants.mjs --skip-golden   # 静的検査 + test:t1 のみ（数秒）
//   node tools/skills/check_engine_invariants.mjs --full          # 上記 + exp_ls_incremental_verify（約4分・計6分超）
//   node tools/skills/check_engine_invariants.mjs --base <ref>    # 差分の基点を指定（既定 origin/main → main → HEAD~1）
//   node tools/skills/check_engine_invariants.mjs --json <path>   # 機械可読レポートの出力先
//
// ★役割分担: 本スクリプトは **機械的に確定するものだけ**を出す（検出・実行・突合）。
//   「この違反をどう直すか」の最終判断は SKILL.md 側（Claude）が、出力の `fix` を起点に行う。
//
// ⚠ 検査 ID（`tdz-immediate-field` 等）は**ツール内のチェック名**であって、
//    REPO_STANDARDS §3 の文書 ID 体系（Cx/Dx/Ax/Mx/Hx/Ex）ではない。新接頭辞の発明ではない。
//    各検査は `doc` フィールドで**根拠となる規定の節**を指す（正はそちら）。
//
// ⚠ 実行コスト（REPO_STANDARDS E1・実測値は CLAUDE.md「検証方法」が正）:
//    test:golden = 2分07秒 ／ test:t1 = 1秒未満 ／ exp_ls_incremental_verify = 約4分。
//    600秒上限に近いので **背景実行（run_in_background）推奨**。

import {
  ROOT, rel, readText, readTextOr, exists, writeJson, run, runNode, git, changedFiles,
  stripJs, stripComments, functionMask, lineOf, functionBody, banner, log, parseArgs, comma, stamp, fileStamp, REPORT_DIR,
} from './lib/skill_util.mjs';

const { opt } = parseArgs(process.argv.slice(2), ['skip-golden', 'full', 'skip-tests', 'help']);
if (opt.help) { log(readText('tools/skills/check_engine_invariants.mjs').split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }

const findings = [];   // {id, severity: 'violation'|'warn'|'info', doc, file, line, message, fix}
const add = (f) => { findings.push({ severity: 'violation', file: null, line: null, ...f }); };

// ══ 0. 変更ファイルの把握 ═══════════════════════════════════════
const changed = changedFiles({ base: opt.base || null });
const touched = (re) => changed.all.filter((f) => re.test(f));
const engineTouched = touched(/^(src\/|gamedata\/js\/|test\/golden\.mjs$)/);
const diffText = [
  git('diff', `${changed.base}...HEAD`, '--', 'src', 'gamedata/js', 'test'),
  git('diff', 'HEAD', '--', 'src', 'gamedata/js', 'test'),
].join('\n');

banner('check-engine-invariants', `基点 ${changed.ref} (${changed.base.slice(0, 8)}) ／ ${stamp()}`);
log(`変更ファイル: 全 ${changed.all.length} 本 ／ エンジン層 ${engineTouched.length} 本`);
for (const f of engineTouched) log(`  - ${f}`);
if (!engineTouched.length) log('  （src/・gamedata/js/・test/golden.mjs に変更なし＝静的検査は全件を通しで走る）');

// ══ 1. 静的検査 ════════════════════════════════════════════════
// ── 1.1 TDZ 回避（CLAUDE.md 開発ルール §1）──────────────────────
// オブジェクトリテラルの**トップレベル即時評価フィールド**で BG/DMG/GEAR を参照すると、
// characters.js ⇄ app.js の循環インポートで ReferenceError → UI 全消失。関数本体内は遅延評価＝安全。
{
  const file = 'gamedata/js/characters.js';
  const src = readText(file);
  const s = stripJs(src);
  // ★関数本体（波括弧 body ＋ **簡潔アロー body**）を除いた位置だけが「即時評価」＝違反対象。
  const mask = functionMask(s);
  // import / export の指定子リストは「参照」ではない＝マスクする。
  for (const m of s.matchAll(/(?:import|export)\s*\{[^}]*\}(?:\s*from\s*[^;\n]*)?/g))
    for (let i = m.index; i < m.index + m[0].length; i++) mask[i] = 1;
  const hits = [];
  for (let i = 0; i < s.length; i++) {
    if (mask[i]) continue;
    const m = /^(BG|DMG|GEAR)\b/.exec(s.slice(i, i + 5));
    if (m && !/[A-Za-z0-9_$.]/.test(s[i - 1] ?? '')) hits.push({ name: m[1], line: lineOf(src, i) });
  }
  for (const h of hits) {
    add({
      id: 'tdz-immediate-field', doc: 'CLAUDE.md 開発ルール §1（TDZ 回避）', file, line: h.line,
      message: `オブジェクトリテラルの即時評価フィールドで \`${h.name}\` を参照している（関数本体の外＝ロード時に評価される）。`,
      fix: '素の数値リテラルへ置き換える（例 `gmax: 100,  // =BG.other_max`）か、参照を `cands.exec` / `def` フックなど**関数本体の中**へ移す。循環インポートで ReferenceError → CHAR_REGISTRY 未定義 → UI 全消失になる。',
    });
  }
  log(`\n[1.1] TDZ 即時評価フィールド … ${hits.length ? `❌ ${hits.length} 件` : '✅ 0 件'}`);
}

// ── 1.2 エンジン本体にキャラ名リテラルを書かない（CLAUDE.md 開発ルール §1）──
{
  const charsSrc = readText('gamedata/js/characters.js');
  const cs = stripJs(charsSrc);
  const at = cs.indexOf('CHAR_REGISTRY');
  const open = cs.indexOf('{', at);
  const keys = [];
  if (at >= 0 && open >= 0) {
    let depth = 0;
    for (let i = open; i < cs.length; i++) {
      if (cs[i] === '{') { depth++; if (depth === 1) continue; }
      else if (cs[i] === '}') { depth--; if (!depth) break; }
      if (depth === 1) {
        const m = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/.exec(cs.slice(i, i + 40));
        if (m && (cs[i] === '\n' || cs[i] === ',') && !keys.includes(m[1])) keys.push(m[1]);
      }
    }
  }
  const engineFiles = ['src/sim.js', 'src/constants.js'];
  let n = 0;
  for (const file of engineFiles) {
    const src = readText(file);
    // 文字列リテラルだけを対象にする（識別子としての登場＝import 等は対象外・コメントは除外）。
    for (const m of stripComments(src).matchAll(/['"]([A-Za-z_$][A-Za-z0-9_$]*)['"]/g)) {
      if (!keys.includes(m[1])) continue;
      n++;
      add({
        id: 'char-literal-in-engine', doc: 'CLAUDE.md 開発ルール §1（編集先は CHAR_REGISTRY だけ）', file, line: lineOf(src, m.index),
        message: `エンジン本体にキャラ名リテラル \`'${m[1]}'\` が書かれている。`,
        fix: `キャラ固有の反応は \`gamedata/js/characters.js\` の汎用フック（\`def.onAbility\` / \`onPartyBurst\` / \`onBurst\` / \`turnEnd\` / \`cands.exec\`）へ移す。エンジンに分岐を足すと不在編成での自然スキップが効かなくなる。`,
      });
    }
  }
  log(`[1.2] エンジン本体のキャラ名リテラル … ${n ? `❌ ${n} 件` : '✅ 0 件'}（登録キー ${keys.length} 個で照合）`);
}

// ── 1.3 `_refineRoute` の新規結線禁止（CLAUDE.md 開発ルール §2 ⚠）──
{
  let n = 0;
  for (const file of ['src/sim.js', 'src/app.js', 'src/worker.js']) {
    const src = readText(file);
    const s = stripJs(src);
    for (const m of s.matchAll(/_refineRoute\s*\(/g)) {
      const before = s.slice(Math.max(0, m.index - 20), m.index);
      if (/function\s+$/.test(before)) continue;   // 定義そのもの＝残置が正
      n++;
      add({
        id: 'refine-route-wiring', doc: 'CLAUDE.md 開発ルール §2（_refineRoute は production 非経路）', file, line: lineOf(src, m.index),
        message: '`_refineRoute` が呼び出されている（production 非経路・新規結線は禁止）。',
        fix: '探索の後処理は `_localSearchRoute` を使う。`_refineRoute` は C27 時代の再現性のために残置しているだけで、経路へ戻すと golden と品質トレードオフの前提が崩れる。',
      });
    }
  }
  log(`[1.3] _refineRoute の呼び出し … ${n ? `❌ ${n} 件` : '✅ 0 件（定義の残置のみ）'}`);
}

// ── 1.4 ESM Worker 起動 と app.js の export 漏れ（ENGINE_INVARIANTS §2.4）──
{
  const app = readText('src/app.js');
  // ⚠ import/export とパス文字列を見る検査なので **stripComments**（文字列は残す）を使う。
  //    stripJs だと `from './app.js'` の中身まで潰れて **検査が黙って空振りする**（負のテストで実際に踏んだ）。
  const appS = stripComments(app);
  // ⚠ 文字列リテラルを見る検査なので **stripJs（文字列も潰す）ではなく stripComments** を使う。
  const w = /new\s+Worker\s*\(\s*new\s+URL\s*\([^)]*\)\s*,\s*\{\s*type\s*:\s*['"]module['"]/.test(stripComments(app));
  if (!w) {
    add({
      id: 'esm-worker-init', doc: 'ENGINE_INVARIANTS.md §2.4（Worker・ビルド）', file: 'src/app.js', line: null,
      message: '`new Worker(new URL(…), {type:\'module\'})` の形が見つからない。',
      fix: "Worker は `new Worker(new URL('./worker.js', import.meta.url), {type:'module'})` で起動する。相対文字列や classic worker にすると Vite のバンドルに乗らず、探索が走らない。",
    });
  }
  // export 名の収集（`export {…}` / `export const|function|class X`）
  const exported = new Set();
  for (const m of appS.matchAll(/export\s*\{([^}]*)\}/g))
    for (const part of m[1].split(',')) { const t = part.trim().split(/\s+as\s+/).pop()?.trim(); if (t) exported.add(t); }
  for (const m of appS.matchAll(/export\s+(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/g)) exported.add(m[1]);

  const importers = ['src/sim.js', 'src/worker.js', 'gamedata/js/characters.js'];
  let miss = 0;
  for (const file of importers) {
    const src = readText(file);
    const s = stripComments(src);
    for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*app\.js)['"]/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0]?.trim();
        if (!name || exported.has(name)) continue;
        miss++;
        add({
          id: 'app-export-missing', doc: 'ENGINE_INVARIANTS.md §2.4（src/app.js の export 漏れ禁止）', file, line: lineOf(src, m.index),
          message: `\`${name}\` を app.js から import しているが、app.js が export していない。`,
          fix: `src/app.js 末尾の \`export { … }\` に \`${name}\` を追加する。export 漏れは Worker 側でだけ落ちるため UI では気付けない。`,
        });
      }
    }
  }
  log(`[1.4] ESM Worker 起動 … ${w ? '✅' : '❌'} ／ app.js export 漏れ … ${miss ? `❌ ${miss} 件` : '✅ 0 件'}`);
}

// ── 1.5 ホットパスの走査順（ENGINE_INVARIANTS §2.1）──────────────
{
  const src = readText('src/sim.js');
  const s = stripJs(src);
  let bad = 0;
  for (const fn of ['_stepStatic', '_candidates']) {
    const body = functionBody(s, fn);
    if (!body) {
      add({ id: 'hotpath-scan-order', doc: 'ENGINE_INVARIANTS.md §2.1', file: 'src/sim.js', line: null, severity: 'warn',
        message: `\`${fn}\` が見つからない（改名された？）。走査順の検査ができない。`,
        fix: '改名したなら本スクリプトの検査対象名も合わせて更新する（検査が黙って無効化されるのを防ぐ）。' });
      bad++; continue;
    }
    if (!body.text.includes('ABIL_KEYS')) {
      bad++;
      add({ id: 'hotpath-scan-order', doc: 'ENGINE_INVARIANTS.md §2.1（事前計算マップを1パス走査）', file: 'src/sim.js', line: lineOf(src, body.start),
        message: `\`${fn}\` が \`ABIL_KEYS\` を走査していない。`,
        fix: '`buildFormation` が構築した `ABIL_KEYS` を1パス走査する形へ戻す（走査順＝`ABIL` 挿入順）。順序が変わると最適押し順がズレて golden が動く。' });
    }
    if (/Object\.entries\s*\(\s*ABIL\s*\)/.test(body.text)) {
      bad++;
      add({ id: 'hotpath-scan-order', doc: 'ENGINE_INVARIANTS.md §2.1（ホットパスで再構築しない）', file: 'src/sim.js', line: lineOf(src, body.start),
        message: `\`${fn}\`（ホットパス）で \`Object.entries(ABIL)\` を呼んでいる。`,
        fix: '事前計算済みの `ABIL_KEYS` / `ABIL_CANDS` / `ABIL_BASE_S` を使う。ホットパスでの再構築は探索時間を直接押し上げる。' });
    }
  }
  log(`[1.5] ホットパス走査順（_stepStatic / _candidates） … ${bad ? `❌ ${bad} 件` : '✅ OK'}`);
}

// ── 1.6 golden 期待値と CLAUDE.md「検証方法」表の同期 ──────────────
// 規律「同じ値を2箇所に書かない」＝表が**正**。値を動かしたら表を同一コミットで更新する。
{
  const g = readText('test/golden.mjs');
  const claude = readText('CLAUDE.md');
  const exps = [...stripJs(g).matchAll(/exp\s*:\s*(\d{6,})/g)].map((m) => ({ v: Number(m[1]), line: lineOf(g, m.index) }));
  let bad = 0;
  for (const e of exps) {
    if (claude.includes(comma(e.v)) || claude.includes(String(e.v))) continue;
    bad++;
    add({
      id: 'golden-expectation-sync', doc: 'CLAUDE.md「検証方法」（★この表が期待値の正）', file: 'test/golden.mjs', line: e.line,
      message: `golden の期待値 ${comma(e.v)} が CLAUDE.md「検証方法」の表に無い。`,
      fix: `CLAUDE.md「検証方法」の fixture 表を同一コミットで更新する（**表が正**・他 md やコードに同じ値を複製しない）。再fit なら CALIBRATION_ANALYSIS.md の該当 Cx 行に根拠を残す。`,
    });
  }
  log(`[1.6] golden 期待値 ⇄ CLAUDE.md 表 … ${bad ? `❌ ${bad} 件` : `✅ ${exps.length} 件すべて表にある`}`);
}

// ── 1.7 ENGINE_VERSION の更新（ダメージモデルを変えたら揃える）──
{
  const modelTouched = changed.all.some((f) => /^src\/(sim|constants)\.js$/.test(f) || /^gamedata\/js\//.test(f));
  const versionTouched = /^[+-].*ENGINE_VERSION\s*=/m.test(diffText);
  const cur = /ENGINE_VERSION\s*=\s*'([^']+)'/.exec(readText('src/app.js'))?.[1] ?? '(不明)';
  if (modelTouched && !versionTouched) {
    add({
      id: 'engine-version-sync', severity: 'warn', doc: 'test/golden.mjs 冒頭注記（ENGINE_VERSION を揃えて更新）', file: 'src/app.js', line: null,
      message: `ダメージ/探索に効く層（src/sim.js・src/constants.js・gamedata/js/）を触っているが ENGINE_VERSION が現行のまま（\`${cur}\`）。`,
      fix: 'ダメージモデルや探索結果が動く変更なら ENGINE_VERSION を更新する（探索キャッシュの名前空間＝古い版を fast-reject する仕組み）。**結果が1円も動かない**リファクタなら据え置きでよい＝golden 3/3 不変で示す。',
    });
  }
  log(`[1.7] ENGINE_VERSION … ${modelTouched ? (versionTouched ? '✅ 更新あり' : '⚠ 未更新（要判断）') : `— 対象変更なし（現行 ${cur}）`}`);
}

// ── 1.8 LS インクリメンタル replay を触ったか（CLAUDE.md「検証方法」⚠）──
const LS_SENSITIVE = ['_replayResult', '_execKey', 'clone', '_snapshotForReplay'];
const lsTouched = LS_SENSITIVE.filter((k) => new RegExp(`^[+-].*\\b${k}\\b`, 'm').test(diffText));
log(`[1.8] LS 感応シンボルの差分 … ${lsTouched.length ? `⚠ ${lsTouched.join(', ')}` : '✅ なし'}`);

// ══ 2. 回帰の実行 ══════════════════════════════════════════════
const tests = [];
function record(name, res, okFn) {
  const ok = okFn(res);
  tests.push({ name, cmd: res.cmd, code: res.code, ms: res.ms, ok, tail: res.stdout.split('\n').slice(-25).join('\n'), stderr: res.stderr.slice(-2000) });
  log(`  ${ok ? '✅' : '❌'} ${name}（${(res.ms / 1000).toFixed(1)}s・exit ${res.code}）`);
  return ok;
}

if (!opt['skip-tests']) {
  banner('回帰の実行');
  const t1 = runNode(['tools/t1_selftest.mjs'], { timeout: 120_000 });
  const t1ok = record('npm run test:t1（T1 canvas 正規化）', t1, (r) => r.code === 0);
  if (!t1ok) {
    const failed = t1.stdout.split('\n').filter((l) => l.includes('❌')).slice(0, 20);
    add({ id: 'test-t1', doc: 'CLAUDE.md「検証方法」', file: 'tools/t1_selftest.mjs', line: null,
      message: `test:t1 が失敗した。\n${failed.join('\n')}`,
      fix: '`node tools/t1_selftest.mjs` の ❌ 行が「どの性質」を破ったかを読む。実データ回帰 [16-15] の閾値は**締める方向にだけ**動かす（緩めない）。' });
  }

  if (!opt['skip-golden']) {
    log('  … test:golden 実行中（実測 2分07秒）');
    const g = runNode(['test/golden.mjs'], { timeout: 600_000 });
    const gok = record('npm run test:golden（3 fixture）', g, (r) => r.code === 0);
    for (const line of g.stdout.split('\n').filter((l) => /^\s*\[(OK|NG)/.test(l))) log('      ' + line.trim());
    if (!gok) {
      const ng = g.stdout.split('\n').filter((l) => l.includes('[NG'));
      add({ id: 'test-golden', doc: 'CLAUDE.md「検証方法」（この表が期待値の正）', file: 'test/golden.mjs', line: null,
        message: `golden が不一致。\n${ng.join('\n')}`,
        fix: 'ダメージが動いた原因を特定する。①意図した再fit なら `tools/search_calibrate.mjs` で再fit し、期待値・override・CLAUDE.md の表・ENGINE_VERSION を**同一コミットで**揃える ②意図しないなら §1 の検査結果（走査順・LS・TDZ）と突き合わせる。' });
    }
  } else log('  — test:golden はスキップ（--skip-golden）');

  if (opt.full) {
    log('  … exp_ls_incremental_verify 実行中（実測 約4分）');
    const v = runNode(['tools/exp_ls_incremental_verify.mjs'], { timeout: 600_000 });
    const vok = record('exp_ls_incremental_verify（_LSReplay ⇄ full replay ビット一致）', v, (r) => r.code === 0);
    if (!vok) add({ id: 'ls-incremental', doc: 'CLAUDE.md 開発ルール §2（LS 高速化はビット一致が前提）', file: 'src/sim.js', line: null,
      message: '`_LSReplay` と full replay がビット一致しない。', fix: '走査順・受理順・評価回数まで不変にする。1円でも動いたら壊れている。' });
  } else if (lsTouched.length) {
    add({ id: 'ls-incremental-required', severity: 'warn', doc: 'CLAUDE.md「検証方法」⚠', file: 'src/sim.js', line: null,
      message: `LS 感応シンボル（${lsTouched.join(', ')}）を触っているのに \`exp_ls_incremental_verify.mjs\` が未実行。`,
      fix: '`node tools/skills/check_engine_invariants.mjs --full`（+約4分）で回す。C39 を検出したのはこのハーネス。' });
  }
}

// ══ 3. レポート ════════════════════════════════════════════════
const violations = findings.filter((f) => f.severity === 'violation');
const warns = findings.filter((f) => f.severity === 'warn');

banner('結果', `違反 ${violations.length} 件 ／ 警告 ${warns.length} 件 ／ 回帰 ${tests.filter((t) => t.ok).length}/${tests.length} 通過`);
for (const f of [...violations, ...warns]) {
  log(`\n${f.severity === 'violation' ? '❌ 違反' : '⚠ 警告'}  [${f.id}]  根拠: ${f.doc}`);
  log(`   対象: ${f.file ?? '(なし)'}${f.line ? `:${f.line}` : ''}`);
  for (const l of String(f.message).split('\n')) log(`   ${l}`);
  log(`   修正案: ${f.fix}`);
}
if (!findings.length) log('\n✅ 静的不変条件・回帰ともに違反なし。');

const out = opt.json || `${REPORT_DIR}/invariants_${fileStamp()}.json`;
writeJson(out, {
  tool: 'check-engine-invariants', at: stamp(), base: changed.base, baseRef: changed.ref,
  changed: { all: changed.all, engine: engineTouched }, lsTouched,
  findings, tests: tests.map(({ tail, stderr, ...t }) => t), testTails: tests.map((t) => ({ name: t.name, tail: t.tail, stderr: t.stderr })),
});
log(`\nレポート: ${rel(out)}`);
process.exit(violations.length || tests.some((t) => !t.ok) ? 1 : 0);
