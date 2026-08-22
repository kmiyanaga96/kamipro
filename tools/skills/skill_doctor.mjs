// skills-doctor ── スキル群のオーケストレーター（整合・予算・関門・必要性を機械で見る）
//
// 使い方:
//   node tools/skills/skill_doctor.mjs                      # 全点検（負のテスト込み・約20秒）
//   node tools/skills/skill_doctor.mjs --quick              # 負のテストとスモークを省く（1秒未満）
//   node tools/skills/skill_doctor.mjs --update-guardrails --reason "C52 で再fit"   # 関門の変更を台帳へ承認記録
//   node tools/skills/skill_doctor.mjs --json <path>
//
// ★何のためにあるか:
//   スキルは「規約を機械語で二重化したもの」なので、**放っておくと規約と乖離する**。
//   人間が毎回思い出す運用（＝このリポジトリが E1〜E11 を作る羽目になった原因そのもの）に戻さないため、
//   乖離の型を1本の検査へ落とす。規律の文面は tools/skills/README.md §4 が正で、本スクリプトはその写し。
//
// 見るもの（すべて「機械で判定できるもの」だけ）:
//   [A] 登録の5点整合   … SKILL.md ⇄ 実体 ⇄ npm script ⇄ tools/skills/README.md ⇄ CLAUDE.md
//   [B] description 予算 … スキル定義は**全セッションの起動時に読まれる**＝長さは恒常コスト
//   [C] 検査の根拠       … 検査 id が指す規定（doc:）の md と § が実在するか＝「規定より先にツールが走った」検出
//   [D] 関門の緩み       … golden 期待値・t1 [16-15] 閾値・T1 ベースラインが**緩む方向**へ動いていないか
//   [E] 必要性           … 最終実行日と最終更新日（使われていないスキルの棚卸し）
//   [F] 発火確認         … negative_tests.mjs（検査器が素通りしていないか）
//   [G] スモーク         … 各実体が起動して正常終了するか

import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, rel, abs, exists, readText, readJson, writeJson, run, runNode, git,
  banner, log, parseArgs, stamp, fileStamp, REPORT_DIR,
} from './lib/skill_util.mjs';

const { opt } = parseArgs(process.argv.slice(2), ['quick', 'update-guardrails', 'help']);
if (opt.help) { log(readText('tools/skills/skill_doctor.mjs').split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }

const findings = [];
const add = (o) => findings.push({ severity: 'violation', ...o });
const SKILL_DIR = '.claude/skills';
const GUARDRAILS = 'tools/skills/baselines/guardrails.json';

// スモーク用の安全な引数（**副作用の無い経路**だけを選ぶ）。実体を足したらここも足す。
const SMOKE = {
  'check_engine_invariants.mjs': ['--skip-golden', '--skip-tests'],
  'run_sim_experiment.mjs': ['--exp', 'exp_prefix_sweep', '--sim', 'sim05', '--dry-run'],
  'sync_workspace_handoff.mjs': [],
  'verify_transcribe_pipeline.mjs': ['--skip-selftest'],
  'skill_doctor.mjs': ['--help'],
  'negative_tests.mjs': ['--help'],
};

banner('skills-doctor', stamp());

// ══ [A] インベントリと登録の5点整合 ═══════════════════════════════
const skills = [];
for (const name of (exists(SKILL_DIR) ? fs.readdirSync(abs(SKILL_DIR)) : []).sort()) {
  const md = `${SKILL_DIR}/${name}/SKILL.md`;
  if (!exists(md)) continue;
  const src = readText(md);
  const fm = /^---\n([\s\S]*?)\n---/.exec(src);
  const front = fm ? fm[1] : '';
  const fmName = /^name:\s*(.+)$/m.exec(front)?.[1]?.trim() ?? null;
  const desc = /^description:\s*([\s\S]*?)(?:\n[a-z-]+:|$)/m.exec(front)?.[1]?.trim() ?? '';
  // 実体は SKILL.md 本文が名乗る（別レジストリを作らない＝更新漏れの発生源を増やさない）
  const impl = [...src.matchAll(/tools\/skills\/([a-z0-9_]+\.mjs)/g)].map((m) => m[1]);
  const implFile = impl.length ? impl[0] : null;
  skills.push({ name, md, fmName, desc, descLen: [...desc].length, bodyLen: [...src].length, implFile, implAll: [...new Set(impl)] });
}

let pkg = { scripts: {} };
try { pkg = readJson('package.json'); }
catch (e) {
  add({ id: 'package-json-broken', area: 'package.json', message: `パースできない: ${e.message}`,
    fix: '`package.json` が壊れている＝npm script 経由の入口が全滅する。まず JSON を直す（よくある原因＝要素を消したときの trailing comma）。' });
}
const readme = readText('tools/skills/README.md');
const claude = readText('CLAUDE.md');
const toolsReadme = readText('tools/README.md');

log(`スキル ${skills.length} 本 ／ 実体 ${fs.readdirSync(abs('tools/skills')).filter((f) => f.endsWith('.mjs')).length} 本\n`);
log('[A] 登録の5点整合');
for (const s of skills) {
  const checks = {
    'frontmatter name': s.fmName === s.name,
    '実体の存在': !!s.implFile && exists(`tools/skills/${s.implFile}`),
    'npm script': !!s.implFile && Object.values(pkg.scripts ?? {}).some((v) => v.includes(`tools/skills/${s.implFile}`)),
    'README 一覧': readme.includes(s.name) && (!s.implFile || readme.includes(s.implFile)),
    'CLAUDE.md 登録': claude.includes(s.name) || toolsReadme.includes(s.name),
  };
  const ng = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  log(`  ${ng.length ? '❌' : '✅'} ${s.name.padEnd(28)} ${ng.length ? `欠落: ${ng.join(' / ')}` : `→ ${s.implFile ?? '(実体なし)'}`}`);
  if (ng.length) add({
    id: 'skill-registration', area: s.name, message: `登録が5点で揃っていない（欠落: ${ng.join(' / ')}）`,
    fix: '5点＝`.claude/skills/<name>/SKILL.md` / `tools/skills/<impl>.mjs` / `package.json` の `skill:*` / `tools/skills/README.md` §1 の表 / `CLAUDE.md`（または `tools/README.md` §5）。**同一コミットで揃える**（REPO_STANDARDS §5-1）。',
  });
}

// ══ [B] description 予算 ═════════════════════════════════════════
// ★予算の根拠（2026-08-22 実測）: 現行4本は 178〜216字・合計 789字。
//   1本 300字＝現行最大の約1.4倍まで許す／合計 1200字＝現行の約1.5倍。
//   「今より少し太る」は通し、「倍に膨らむ」は止める水準。**測ってから決める**（E1）。
const PER = 300, TOTAL = 1200;
const total = skills.reduce((a, s) => a + s.descLen, 0);
log(`\n[B] description 予算（1本 ≤${PER}字 / 合計 ≤${TOTAL}字）── 合計 ${total}字`);
for (const s of skills) {
  const over = s.descLen > PER;
  log(`  ${over ? '⚠' : '✅'} ${s.name.padEnd(28)} description ${s.descLen}字 ／ 本文 ${s.bodyLen}字`);
  if (over) add({
    id: 'description-budget', severity: 'warn', area: s.name, message: `description が ${s.descLen}字（上限 ${PER}）`,
    fix: '**description は全セッションの起動時に読まれる**＝恒常コスト。「いつ使うか」を1〜2文に絞り、手順・注意は SKILL.md 本文へ移す。',
  });
}
if (total > TOTAL) add({
  id: 'description-budget', severity: 'warn', area: '合計', message: `description 合計が ${total}字（上限 ${TOTAL}）`,
  fix: 'スキルを増やすほど全セッションが重くなる。①description を削る ②統合できるスキルは統合する ③使われていないスキル（[E]）を落とす。',
});

// ══ [C] 検査の根拠が規定に実在するか（規定先行の機械化）═══════════
log('\n[C] 検査 id の根拠（doc:）が規定に実在するか');
const checkerSrc = readText('tools/skills/check_engine_invariants.mjs');
const docs = [...checkerSrc.matchAll(/id:\s*'([^']+)'[\s\S]{0,200}?doc:\s*'([^']+)'/g)].map((m) => ({ id: m[1], doc: m[2] }));
const seen = new Set();
let docNg = 0;
for (const d of docs) {
  if (seen.has(d.id + d.doc)) continue;
  seen.add(d.id + d.doc);
  const file = /([A-Za-z0-9_/.]+\.(?:md|mjs))/.exec(d.doc)?.[1] ?? null;
  const sec = /§\s*([\d.]+)/.exec(d.doc)?.[1] ?? null;
  const fileOk = file ? (exists(file) || exists(`./${file}`)) : false;
  const secOk = !sec || (fileOk && new RegExp(`§\\s*${sec.replace('.', '\\.')}|^#{2,4}\\s*${sec.replace('.', '\\.')}[\\s.]`, 'm').test(readText(file)));
  if (fileOk && secOk) continue;
  docNg++;
  add({
    id: 'doc-anchor-missing', area: d.id, message: `根拠に挙げた「${d.doc}」が見つからない（file=${fileOk ? 'ok' : file ?? '不明'} / §=${secOk ? 'ok' : sec}）`,
    fix: '**規定を先に更新してからツールを直す**（ツールは規定の写し・正ではない）。規定側に節を作るか、`doc:` を実在する節へ直す。',
  });
}
log(`  ${docNg ? '❌' : '✅'} 検査 ${seen.size} 件のうち根拠が解決しないもの ${docNg} 件`);

// ══ [D] 関門の緩み検出 ═══════════════════════════════════════════
const goldenSrc = readText('test/golden.mjs');
const t1Src = readText('tools/t1_selftest.mjs');
const t1Base = exists('tools/skills/baselines/t1_baseline.json') ? readJson('tools/skills/baselines/t1_baseline.json') : null;
const current = {
  golden: [...goldenSrc.matchAll(/name\s*:\s*'([^']+)'[\s\S]{0,80}?exp\s*:\s*(\d+)/g)].map((m) => ({ fixture: m[1], exp: Number(m[2]) })),
  t1: {
    wrongMax: Number(/loto\.wrong\s*<=\s*(\d+)/.exec(t1Src)?.[1] ?? NaN),
    correctMin: Number(/loto\.correct\s*>=\s*(\d+)/.exec(t1Src)?.[1] ?? NaN),
    ambiguousMax: Number(/loto\.ambiguous\s*<=\s*(\d+)/.exec(t1Src)?.[1] ?? NaN),
  },
  t1Baseline: t1Base?.metrics?.glyph?.loto
    ? { wrong: t1Base.metrics.glyph.loto.wrong, correct: t1Base.metrics.glyph.loto.correct, ambiguous: t1Base.metrics.glyph.loto.ambiguous }
    : null,
};
const ledger = exists(GUARDRAILS) ? readJson(GUARDRAILS) : null;

log('\n[D] 関門の緩み（★緩める方向の変更だけを違反にする）');
log(`  golden: ${current.golden.map((g) => `${g.fixture}=${g.exp.toLocaleString('en-US')}`).join(' / ')}`);
log(`  t1 [16-15]: 誤≦${current.t1.wrongMax} / 正≧${current.t1.correctMin} / 曖昧≦${current.t1.ambiguousMax}`
  + (current.t1Baseline ? ` ／ 実測 誤${current.t1Baseline.wrong} 正${current.t1Baseline.correct} 曖昧${current.t1Baseline.ambiguous}` : ''));

if (!ledger) {
  log(`  ⚠ 台帳が無い（${GUARDRAILS}）。--update-guardrails で現在値を基準として記録できる。`);
} else {
  const p = ledger.guardrails ?? {};
  for (const g of current.golden) {
    const was = p.golden?.find((x) => x.fixture === g.fixture);
    if (was && was.exp !== g.exp) add({
      id: 'guardrail-golden-changed', area: g.fixture, message: `golden 期待値が動いた（${was.exp.toLocaleString('en-US')} → ${g.exp.toLocaleString('en-US')}）`,
      fix: '意図した再fit なら ①`tools/search_calibrate.mjs` で再fit ②CLAUDE.md「検証方法」表・override・`ENGINE_VERSION` を同一コミットで更新 ③根拠を `CALIBRATION_ANALYSIS.md` の Cx 行へ ④`--update-guardrails --reason "<Cx>"` で台帳を更新。**期待値を実測に合わせて書き換えるのは再fit ではない**。',
    });
  }
  const t = p.t1 ?? {};
  const loosen = [];
  if (current.t1.wrongMax > t.wrongMax) loosen.push(`誤の上限 ${t.wrongMax}→${current.t1.wrongMax}`);
  if (current.t1.correctMin < t.correctMin) loosen.push(`正の下限 ${t.correctMin}→${current.t1.correctMin}`);
  if (current.t1.ambiguousMax > t.ambiguousMax) loosen.push(`曖昧の上限 ${t.ambiguousMax}→${current.t1.ambiguousMax}`);
  if (loosen.length) add({
    id: 'guardrail-loosened', area: 't1 [16-15]', message: `関門が緩んだ: ${loosen.join(' / ')}`,
    fix: '★閾値は**締める方向にだけ**動かす。緩めた瞬間に回帰の意味が消える。フィクスチャを作り直したなら実測へ締め直し、`--update-guardrails --reason` で理由を残す。',
  });
  const tightened = [];
  if (current.t1.wrongMax < (t.wrongMax ?? Infinity)) tightened.push(`誤 ${t.wrongMax}→${current.t1.wrongMax}`);
  if (current.t1.correctMin > (t.correctMin ?? -Infinity)) tightened.push(`正 ${t.correctMin}→${current.t1.correctMin}`);
  if (tightened.length) log(`  ✅ 締まった: ${tightened.join(' / ')}（台帳更新を推奨）`);
  if (!loosen.length && !tightened.length) log('  ✅ 関門は台帳どおり');
}

// ══ [E] 必要性（最終実行・最終更新）═══════════════════════════════
log('\n[E] 必要性（最終実行 / 最終更新）');
const reports = exists(REPORT_DIR) ? fs.readdirSync(abs(REPORT_DIR)).filter((f) => f.endsWith('.json')) : [];
const lastRun = {};
for (const f of reports) {
  try {
    const j = JSON.parse(readText(`${REPORT_DIR}/${f}`));
    if (j.tool && (!lastRun[j.tool] || j.at > lastRun[j.tool])) lastRun[j.tool] = j.at;
  } catch { /* 壊れたレポートは無視（一時出力なので落とさない） */ }
}
const DAY = 86_400_000;
for (const s of skills) {
  const modified = git('log', '-1', '--format=%ad', '--date=short', '--', s.md).trim() || '(未コミット)';
  const ran = lastRun[s.name] ?? null;
  const days = ran ? Math.floor((Date.now() - Date.parse(ran)) / DAY) : null;
  log(`  ${s.name.padEnd(28)} 最終実行 ${ran ? `${ran.slice(0, 10)}（${days}日前）` : '記録なし'} ／ 定義の最終更新 ${modified}`);
  if (days !== null && days > 90) add({
    id: 'skill-unused', severity: 'warn', area: s.name, message: `${days}日間実行されていない`,
    fix: '棚卸しの候補。①出番が来ていないだけか ②手順が変わって使われなくなったか を見極める。後者なら**消す**（スキルを増やすほど更新漏れの発生源が増える）。',
  });
}
log('  ⚠ 実行記録は `tools/skills/.reports/`（git 管理外）＝**この環境での実行履歴**しか見えない。');

// ══ [F] 発火確認（負のテスト）════════════════════════════════════
let neg = null;
if (!opt.quick) {
  log('\n[F] 発火確認（negative_tests.mjs）');
  const r = runNode(['tools/skills/negative_tests.mjs'], { timeout: 300_000 });
  const m = /結果\n(\d+)\/(\d+) 通過/.exec(r.stdout) ?? /(\d+)\/(\d+) 通過/.exec(r.stdout);
  neg = { code: r.code, pass: m ? Number(m[1]) : null, total: m ? Number(m[2]) : null };
  log(`  ${r.code === 0 ? '✅' : '❌'} ${neg.pass}/${neg.total} 通過（${(r.ms / 1000).toFixed(1)}s）`);
  if (r.code !== 0) {
    for (const l of r.stdout.split('\n').filter((l) => l.includes('❌'))) log('    ' + l.trim());
    add({ id: 'negative-test-failed', area: 'check-engine-invariants', message: '負のテストが通らない＝その検査は素通りしている',
      fix: '`node tools/skills/negative_tests.mjs --keep` でサンドボックスを残して調べる。文字列を見る検査に `stripJs` を使っていないか（→ `stripComments`）を最初に疑う。' });
  }
} else log('\n[F] 発火確認 … スキップ（--quick）');

// ══ [G] スモーク ═════════════════════════════════════════════════
const smoke = [];
if (!opt.quick) {
  log('\n[G] スモーク（各実体が起動して正常終了するか）');
  for (const f of fs.readdirSync(abs('tools/skills')).filter((x) => x.endsWith('.mjs')).sort()) {
    const args = SMOKE[f];
    if (!args) {
      add({ id: 'smoke-unregistered', severity: 'warn', area: f, message: 'スモーク引数が未登録＝起動確認されていない',
        fix: '`tools/skills/skill_doctor.mjs` の `SMOKE` に**副作用の無い引数**を足す（`--dry-run` / `--help` / `--skip-*`）。' });
      log(`  ⚠ ${f.padEnd(32)} スモーク引数が未登録`);
      continue;
    }
    const r = runNode([`tools/skills/${f}`, ...args], { timeout: 180_000 });
    const ok = r.code === 0;
    smoke.push({ file: f, args, code: r.code, ms: r.ms });
    log(`  ${ok ? '✅' : '❌'} ${f.padEnd(32)} exit ${r.code}（${(r.ms / 1000).toFixed(1)}s）`);
    if (!ok) add({ id: 'smoke-failed', area: f, message: `起動に失敗（exit ${r.code}）: ${r.stderr.split('\n').slice(-3).join(' ')}`,
      fix: '実体が壊れている＝スキルは使えない。`node tools/skills/<file> --help` で再現する。' });
  }
} else log('\n[G] スモーク … スキップ（--quick）');

// ══ 台帳の更新 ═══════════════════════════════════════════════════
if (opt['update-guardrails']) {
  if (!opt.reason) { log('\n❌ --update-guardrails には --reason "<なぜ関門が動いたか。Cx や実測の根拠>" が要る。'); process.exit(2); }
  const hist = ledger?.history ?? [];
  hist.unshift({ at: stamp(), reason: String(opt.reason), before: ledger?.guardrails ?? null });
  writeJson(GUARDRAILS, { kind: 'skills-doctor guardrails', at: stamp(), guardrails: current, history: hist.slice(0, 10) });
  log(`\n✅ ${GUARDRAILS} を更新（理由: ${opt.reason}）`);
}

// ══ 出力 ═════════════════════════════════════════════════════════
const violations = findings.filter((f) => f.severity === 'violation');
const warns = findings.filter((f) => f.severity === 'warn');
banner('結果', `違反 ${violations.length} 件 ／ 警告 ${warns.length} 件`);
for (const f of [...violations, ...warns]) {
  log(`\n${f.severity === 'violation' ? '❌ 違反' : '⚠ 警告'}  [${f.id}] ${f.area}`);
  log(`   ${f.message}`);
  log(`   対処: ${f.fix}`);
}
if (!findings.length) log('\n✅ 整合・予算・関門・発火確認・スモーク すべて問題なし。');

const out = opt.json || `${REPORT_DIR}/skill_doctor_${fileStamp()}.json`;
writeJson(out, { tool: 'skills-doctor', at: stamp(), skills, guardrails: current, negativeTests: neg, smoke, findings });
log(`\nレポート: ${rel(out)}`);
process.exit(violations.length ? 1 : 0);
