// negative_tests ── 「検査器が本当に発火するか」を確かめる負のテスト
//
// 使い方:
//   node tools/skills/negative_tests.mjs            # 全ケース（数秒）
//   node tools/skills/negative_tests.mjs --case tdz # 1ケースだけ
//   node tools/skills/negative_tests.mjs --keep     # サンドボックスを消さない（調査用）
//
// ★なぜ要るか（実際に踏んだ）:
//   `check_engine_invariants.mjs` の初版は、文字列を見る検査に `stripJs`（文字列も潰す）を使っていたため、
//   **app.js の export 漏れ検査と ESM Worker 検査が「常に ✅」を返していた**。
//   検査があるのに素通りする — 検査が無いより危ない状態で、緑を見ても何も保証されていなかった。
//   ∴ **検査を足したら、わざと壊して発火することを機械で確かめる**を規律にする。
//
// ★安全設計: 本物のリポジトリは触らない。
//   `SKILL_ROOT` でサンドボックス（tmp へ複製した src/・gamedata/js/・test/・CLAUDE.md）を指し、
//   そこを壊して検査をかける。中断してもリポジトリは無傷。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, readText, banner, log, parseArgs, run, stamp } from './lib/skill_util.mjs';

const { opt } = parseArgs(process.argv.slice(2), ['keep', 'help']);
if (opt.help) { log(readText('tools/skills/negative_tests.mjs').split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }

// ── サンドボックス（検査器が読むものだけを複製する）────────────────
// ⚠ `tools/skills/.reports/` は複製しない（一時出力・大きくなりうる／[E] の実行履歴を汚さない）。
// ⚠ 規定 md（ENGINE_INVARIANTS / REPO_STANDARDS）も要る＝doctor の [C] が `doc:` の節を照合するため。
//    入れ忘れると **clean ケースが doc-anchor-missing で落ちる**（＝サンドボックスの穴を検査の失敗と誤読する）。
const NEEDED = ['CLAUDE.md', 'ENGINE_INVARIANTS.md', 'REPO_STANDARDS.md', 'package.json',
                'src', 'gamedata/js', 'test', 'tools', '.claude'];
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamipro-negtest-'));
  for (const p of NEEDED) {
    const from = path.join(ROOT, p), to = path.join(dir, p);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true, filter: (src) => !src.includes(`${path.sep}.reports`) });
  }
  return dir;
}
const edit = (dir, file, fn) => {
  const p = path.join(dir, file);
  const before = fs.readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`負のテストのパッチが当たらなかった: ${file}（対象コードが変わった？）`);
  fs.writeFileSync(p, after);
};

// ── ケース定義（壊し方 → 期待する検査 id）───────────────────────
// `tool` は検査器の別（既定 = invariants）。doctor は **--quick** で回す（負のテストの再帰を避ける）。
const TOOLS = {
  invariants: { script: 'tools/skills/check_engine_invariants.mjs', args: ['--skip-tests'] },
  doctor:     { script: 'tools/skills/skill_doctor.mjs',            args: ['--quick'] },
};
const CASES = [
  { name: 'clean', expect: null, note: '無改変＝違反ゼロ（誤検出が無いことの確認）', patch: () => {} },
  { name: 'clean-doctor', tool: 'doctor', expect: null, note: '無改変の skills-doctor＝違反ゼロ', patch: () => {} },
  {
    name: 'tdz', expect: 'tdz-immediate-field', note: 'オブジェクトリテラルの即時評価で BG を参照',
    patch: (d) => edit(d, 'gamedata/js/characters.js', (s) => s.replace('gmax: 100,', 'gmax: BG.other_max,')),
  },
  {
    name: 'char-literal', expect: 'char-literal-in-engine', note: 'エンジン本体にキャラ名リテラル',
    patch: (d) => edit(d, 'src/sim.js', (s) => s.replace('function cmpVec(a,b){', "const _neg='yamato';\nfunction cmpVec(a,b){")),
  },
  {
    name: 'refine-route', expect: 'refine-route-wiring', note: '_refineRoute を production 経路へ結線',
    patch: (d) => edit(d, 'src/app.js', (s) => s.replace('export function setCurrentSubs(v){', 'function _negWire(k,n){ return _refineRoute(k,n); }\nexport function setCurrentSubs(v){')),
  },
  {
    name: 'app-export', expect: 'app-export-missing', note: 'app.js が export していない名前を import',
    patch: (d) => edit(d, 'src/sim.js', (s) => s.replace('import { GEAR, GEAR_K,', 'import { NOT_EXPORTED_XYZ, GEAR, GEAR_K,')),
  },
  {
    name: 'esm-worker', expect: 'esm-worker-init', note: 'Worker を classic 起動へ退行',
    patch: (d) => edit(d, 'src/app.js', (s) => s.replace(", {type:'module'})", ')')),
  },
  {
    name: 'hotpath', expect: 'hotpath-scan-order', note: 'ホットパスで ABIL_KEYS でなく Object.entries(ABIL) を走査',
    patch: (d) => edit(d, 'src/sim.js', (s) => {
      const at = s.indexOf('_stepStatic(){');
      const body = s.slice(at, at + 1200);
      return s.slice(0, at) + body.replace('for(const key of ABIL_KEYS){', 'for(const [key] of Object.entries(ABIL)){') + s.slice(at + 1200);
    }),
  },
  {
    name: 'golden-sync', expect: 'golden-expectation-sync', note: 'golden 期待値を台帳（CLAUDE.md 表）と食い違わせる',
    patch: (d) => edit(d, 'test/golden.mjs', (s) => s.replace('exp:202005923', 'exp:202005999')),
  },
  // ── skills-doctor 側（オーケストレーターの検査そのものを検査する）──
  {
    name: 'guardrail-loosen', tool: 'doctor', expect: 'guardrail-loosened', note: 'T1 関門の「誤の上限」を緩める（6→12）',
    patch: (d) => edit(d, 'tools/t1_selftest.mjs', (s) => s.replace('loto.wrong <= 6', 'loto.wrong <= 12')),
  },
  {
    name: 'guardrail-golden', tool: 'doctor', expect: 'guardrail-golden-changed', note: 'golden 期待値を台帳の承認なしに動かす',
    patch: (d) => edit(d, 'test/golden.mjs', (s) => s.replace('exp:215161915', 'exp:215161999')),
  },
  {
    name: 'registration', tool: 'doctor', expect: 'skill-registration', note: 'npm script を落として5点整合を崩す',
    // ⚠ **末尾以外**の script を消す（末尾だと trailing comma で JSON 自体が壊れ、別の失敗になる）
    patch: (d) => edit(d, 'package.json', (s) => s.replace(/\s*"skill:handoff":[^\n]*\n/, '\n')),
  },
  {
    name: 'doc-anchor', tool: 'doctor', expect: 'doc-anchor-missing', note: '検査の根拠に実在しない § を書く（規定より先にツールが走った状態）',
    patch: (d) => edit(d, 'tools/skills/check_engine_invariants.mjs', (s) => s.replace("doc: 'ENGINE_INVARIANTS.md §2.4（Worker・ビルド）'", "doc: 'ENGINE_INVARIANTS.md §9.9（存在しない節）'")),
  },
];

// ── 実行 ────────────────────────────────────────────────────────
const only = opt.case ? String(opt.case) : null;
const cases = only ? CASES.filter((c) => c.name === only) : CASES;
if (!cases.length) { log(`❌ 未知のケース: ${only}（有効: ${CASES.map((c) => c.name).join(', ')}）`); process.exit(2); }

banner('negative_tests ── 検査器の発火確認', stamp());
let pass = 0, fail = 0;
const results = [];

for (const c of cases) {
  const dir = makeSandbox();
  try {
    c.patch(dir);
    const outJson = path.join(dir, 'report.json');
    const t = TOOLS[c.tool ?? 'invariants'];
    const r = run(process.execPath, [t.script, ...t.args, '--json', outJson], {
      cwd: ROOT, timeout: 300_000, env: { ...process.env, SKILL_ROOT: dir },
    });
    const report = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    const ids = report.findings.filter((f) => f.severity === 'violation').map((f) => f.id);
    const ok = c.expect ? ids.includes(c.expect) : ids.length === 0;
    // ★発火しただけでは足りない: **期待した検査以外が巻き添えで鳴っていないか**も見る
    const extra = c.expect ? [...new Set(ids.filter((i) => i !== c.expect))] : ids;
    const clean = !extra.length;
    if (ok) pass++; else fail++;
    results.push({ case: c.name, expect: c.expect, got: [...new Set(ids)], ok, extra, exit: r.code });
    log(`  ${ok ? '✅' : '❌'} ${c.name.padEnd(18)}[${(c.tool ?? 'invariants').padEnd(10)}] ${c.expect ? `期待 ${c.expect}` : '期待 違反ゼロ'} → ${ids.length ? [...new Set(ids)].join(', ') : '(なし)'}`);
    log(`     ${c.note}${!clean && c.expect ? `　⚠ 巻き添え: ${extra.join(', ')}` : ''}`);
  } catch (e) {
    fail++;
    results.push({ case: c.name, error: String(e.message) });
    log(`  ❌ ${c.name.padEnd(18)} 実行に失敗: ${e.message}`);
  } finally {
    if (opt.keep) log(`     sandbox: ${dir}`);
    else fs.rmSync(dir, { recursive: true, force: true });
  }
}

banner('結果', `${pass}/${cases.length} 通過`);
if (fail) {
  log('❌ 発火しなかった検査がある＝**その検査は今この瞬間も素通りしている**。');
  log('   よくある原因: 文字列リテラルを見るのに `stripJs`（文字列も潰す）を使っている（→ `stripComments`）。');
  log('   もう1つ: 対象コードが変わってパッチが当たらない（＝検査対象の形が変わった。検査側の追随が要る）。');
}
process.exit(fail ? 1 : 0);
