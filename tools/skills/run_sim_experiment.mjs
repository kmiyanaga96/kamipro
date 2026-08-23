// run-sim-experiment ── tools/exp_*.mjs を走らせ、結果を simNN/ の様式でマークダウン化する
//
// 使い方:
//   node tools/skills/run_sim_experiment.mjs --exp exp_prefix_sweep --sim sim06
//   node tools/skills/run_sim_experiment.mjs --exp exp_t1_abilcap_sweep --new-sim --title "T1 押下上限の掃引"
//   node tools/skills/run_sim_experiment.mjs --exp exp_beam_width_sweep --sim sim06 --args "384" --timeout 1800
//   node tools/skills/run_sim_experiment.mjs --exp exp_prefix_sweep --sim sim06 --dry-run
//
// 主要オプション:
//   --exp <name>     tools/ 配下のスクリプト名（`exp_` 接頭辞・`.mjs` は省略可）
//   --args "<...>"   実験スクリプトへ渡す引数（空白区切り）
//   --sim simNN      出力先（既存なら追記／無ければ TEMPLATE から複製）
//   --new-sim        次の空き番号へ TEMPLATE を複製して使う
//   --allow-any      `exp_` 以外の tools/*.mjs も許可（calib_* 等・警告つき）
//   --timeout <秒>   既定 900（重い掃引は明示的に伸ばす）
//   --dry-run        実行せず、走らせる内容と出力先だけを表示
//
// ★役割分担: 本スクリプトは **転記・検算・整形**だけを行う。
//   「この数値が何を意味するか」（統合判断・Cx 起票・モデル修正可否）は **Claude が書く**。
//   ∴ 生成される md は「入力・手法・生ログの所在・数値の抜き出し」までで、結論欄は空のまま残す。
//
// ⚠ REPO_STANDARDS の作法:
//   E1  = 過去の数値を前提にしない（本スクリプトは毎回の実測を manifest に残す）
//   E5  = 実験は同時実行しない（複数条件を並べたいなら**1条件ずつ順に**呼ぶ）
//   E8  = 1条件=1プロセス（本スクリプトは1回の呼び出しで1条件だけ走らせる）
//   E10 = config は台帳から読む（stdout に config バナーが無ければ provenance 欠落として警告する）
//   §1  = **simNN の新設は振り分け判断**＝`--new-sim` を明示したときだけ作る（黙って増やさない）

import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, rel, abs, exists, readText, readTextOr, writeText, writeJson, run, git,
  banner, log, parseArgs, stamp, fileStamp,
} from './lib/skill_util.mjs';

const { opt } = parseArgs(process.argv.slice(2), ['new-sim', 'dry-run', 'allow-any', 'help']);
if (opt.help || !opt.exp) {
  log(readText('tools/skills/run_sim_experiment.mjs').split('\n').filter((l) => l.startsWith('//')).join('\n'));
  process.exit(opt.help ? 0 : 2);
}

// ══ 1. 実験スクリプトの解決 ════════════════════════════════════
const name = path.basename(String(opt.exp)).replace(/\.mjs$/, '') + '.mjs';
const script = `tools/${name}`;
if (!exists(script)) { log(`❌ ${script} が無い。tools/ 配下のスクリプト名を確認する（tools/README.md が索引）。`); process.exit(2); }
if (!/^exp_/.test(name) && !opt['allow-any']) {
  log(`❌ ${name} は \`exp_\` 接頭辞ではない。較正ハーネス（calib_*/search_*）を回すなら --allow-any を付ける。`);
  process.exit(2);
}
const expArgs = String(opt.args ?? '').trim() ? String(opt.args).trim().split(/\s+/) : [];
const timeout = Number(opt.timeout ?? 900) * 1000;

// ══ 2. 出力先 simNN の解決 ═════════════════════════════════════
const simDirs = fs.readdirSync(abs('simulation')).filter((d) => /^sim\d+$/.test(d)).sort();
let sim = opt.sim ? String(opt.sim) : null;
if (!sim && opt['new-sim']) {
  const next = Math.max(0, ...simDirs.map((d) => Number(d.slice(3)))) + 1;
  sim = `sim${String(next).padStart(2, '0')}`;
}
if (!sim) {
  log('❌ 出力先が決まらない。`--sim simNN`（既存へ追記）か `--new-sim`（新設）を指定する。');
  log(`   既存: ${simDirs.join(' / ')}`);
  log('   ⚠ simNN の新設は REPO_STANDARDS §1 の振り分け（大規模な統計的較正）に当たる判断＝黙って作らない。');
  process.exit(2);
}
const simPath = `simulation/${sim}`;
const isNew = !exists(simPath);

banner('run-sim-experiment', `${stamp()}`);
log(`実験:   node ${script} ${expArgs.join(' ')}`);
log(`出力先: ${simPath}${isNew ? '（TEMPLATE から新規複製）' : '（既存へ追記）'}`);
log(`制限:   timeout ${timeout / 1000}s ／ ⚠ E5＝他の重いジョブと**同時に走らせない**`);

if (opt['dry-run']) { log('\n--dry-run: ここまで（実行しない）。'); process.exit(0); }

if (isNew) {
  fs.cpSync(abs('simulation/TEMPLATE'), abs(simPath), { recursive: true });
  log(`\n✅ ${simPath} を TEMPLATE から複製した。`);
  log('   ⚠ README.md の 6章（<> のプレースホルダ）は**この sim の主題**で埋めること＝Claude の仕事。');
}

// ══ 3. 実行前後のリポジトリ状態（生成物の検出）═══════════════════
const snapshot = () => new Set(
  git('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean).map((l) => l.slice(3))
);
const before = snapshot();

// ══ 4. 実行（1条件=1プロセス・E8）═══════════════════════════════
log('\n── 実行中 ─────────────────────────────────────────────');
const r = run(process.execPath, [script, ...expArgs], { timeout });
log(r.stdout.split('\n').slice(-40).join('\n'));
if (r.stderr.trim()) log('[stderr]\n' + r.stderr.split('\n').slice(-20).join('\n'));
log(`── 終了 exit=${r.code} ／ ${(r.ms / 1000).toFixed(1)}s ────────────────────`);

const after = snapshot();
const generated = [...after].filter((f) => !before.has(f) && !f.startsWith(`${simPath}/`)).sort();

// ══ 5. provenance の抽出（E10）══════════════════════════════════
const configLines = r.stdout.split('\n').filter((l) => /^\s*config=|configSig|ENGINE_VERSION|E2/.test(l)).slice(0, 8);
const engineVersion = /ENGINE_VERSION\s*=\s*'([^']+)'/.exec(readText('src/app.js'))?.[1] ?? null;
const head = git('rev-parse', '--short', 'HEAD').trim();
const dirty = git('status', '--porcelain').trim().length > 0;

// ══ 6. 保存（生ログ＋manifest）═══════════════════════════════════
const runId = `${name.replace(/\.mjs$/, '')}_${fileStamp()}`;
const logPath = writeText(`${simPath}/data/raw/${runId}.log`,
  `$ node ${script} ${expArgs.join(' ')}\n# at ${stamp()} / HEAD ${head}${dirty ? '+dirty' : ''} / ENGINE_VERSION ${engineVersion}\n\n`
  + r.stdout + (r.stderr.trim() ? `\n──── stderr ────\n${r.stderr}` : ''));

const manifestPath = `${simPath}/data/run_manifest.json`;
const manifest = exists(manifestPath) ? JSON.parse(readText(manifestPath)) : { kind: 'run-sim-experiment manifest', runs: [] };
manifest.runs.push({
  id: runId, at: stamp(), script, args: expArgs, exit: r.code, ms: r.ms,
  head, dirty, engineVersion, node: process.version,
  log: rel(logPath), generated, configLines,
});
writeJson(manifestPath, manifest);

// ══ 7. マークダウン化（TEMPLATE 様式へ追記）════════════════════
// ★章番号はずらさない（他文書からの参照が壊れるため）＝末尾に**マーカー付きの自動生成ブロック**を積む。
const marker = (id, body) => `\n<!-- run_sim_experiment:begin ${id} -->\n${body}\n<!-- run_sim_experiment:end ${id} -->\n`;
const excerpt = r.stdout.split('\n').filter((l) => l.trim()).slice(-30).join('\n');
const numeric = r.stdout.split('\n').filter((l) => /[-+]?\d[\d,._]*\s*(%|倍|ms|s\b)|=\s*[-+]?\d/.test(l)).slice(-40);

const appendBlock = (file, body) => {
  const p = `${simPath}/analysis/${file}`;
  const cur = readTextOr(p, '');
  writeText(p, cur.replace(/\s*$/, '\n') + marker(runId, body));
  return rel(p);
};

const provenanceRow =
  `| 項目 | 値 |\n|---|---|\n`
  + `| 実行 | \`node ${script}${expArgs.length ? ' ' + expArgs.join(' ') : ''}\` |\n`
  + `| 日時 / 所要 | ${stamp()} ／ ${(r.ms / 1000).toFixed(1)}s |\n`
  + `| exit | ${r.code}${r.code === 0 ? '' : ' ⚠ **異常終了＝数値を採用する前に原因を確認する**'} |\n`
  + `| HEAD / ENGINE_VERSION | \`${head}${dirty ? '+dirty ⚠ 未コミットの変更あり' : ''}\` ／ \`${engineVersion}\` |\n`
  + `| 生ログ | [${rel(logPath)}](../${rel(logPath).replace(`${simPath}/`, '')}) |\n`
  + `| 生成物 | ${generated.length ? generated.map((g) => `\`${g}\``).join(' / ') : '（なし）'} |\n`
  + `| config（E10） | ${configLines.length ? configLines.map((l) => `\`${l.trim()}\``).join('<br>') : '⚠ **バナー無し＝provenance 欠落**。台帳駆動（`tools/lib/config_c.mjs`）か確認する'} |\n`;

const written = [
  appendBlock('quantitative_analysis.md',
    `### 実験走 \`${runId}\`（自動生成・数値のみ）\n\n${provenanceRow}\n`
    + `**出力からの数値行（末尾 ${numeric.length} 行）**\n\n\`\`\`\n${numeric.join('\n') || '（数値行を検出できなかった＝生ログを直接読む）'}\n\`\`\`\n\n`
    + `> ⚠ ここに**あるのは転記だけ**。trial 横断の統計・推定量（§2〜§5）は Claude が上の節へ書く。\n`
    + `> E1: この数値は上記 HEAD / ENGINE_VERSION / config でのみ有効。条件が変わったら再測する。`),
  appendBlock('qualitative_analysis.md',
    `### 実験走 \`${runId}\`（自動生成・所感の器）\n\n`
    + `- **走らせた狙い**: <なぜこの実験を回したか・1行>\n`
    + `- **出力の見え方**: <単調か・飽和はあるか・想定と違った点>\n`
    + `- **未検証の主張**: <この走だけでは言えないこと。対照が要るなら何を取るか（E4）>\n\n`
    + `> 数値は \`quantitative_analysis.md\` の同 ID ブロックが正（ここには数値演算を書かない）。`),
  appendBlock('integrated_analysis.md',
    `### 実験走 \`${runId}\`（自動生成・統合の入口）\n\n`
    + `1. **入力**: \`quantitative_analysis.md\` / \`qualitative_analysis.md\` の \`${runId}\` ブロック\n`
    + `2. **統合判断**: <両者からのみ導く。新規の集計・所感を持ち込まない>\n`
    + `3. **バックログ遷移**: <CALIBRATION_ANALYSIS.md へ起票/遷移する Cx。無ければ「なし」と書く>\n`
    + `4. **回帰影響**: <golden 3 fixture・ENGINE_VERSION への影響。無ければ「シム非改変＝影響なし」>\n`
    + `5. **結論・次アクション**: <次に測るもの／降ろすもの>`),
];

// ══ 8. 報告 ═════════════════════════════════════════════════════
banner('結果', `exit ${r.code} ／ ${(r.ms / 1000).toFixed(1)}s`);
log(`生ログ:     ${rel(logPath)}`);
log(`manifest:   ${manifestPath}（累計 ${manifest.runs.length} 走）`);
log(`追記した md: \n  - ${written.join('\n  - ')}`);
if (generated.length) log(`実験が生成/変更したファイル: ${generated.join(', ')}`);
if (!configLines.length) log('\n⚠ **config バナーが出力に無い（E10）**＝どの config で測ったか md から辿れない。\n   台帳駆動（`loadConfigC()` + `configBanner()` + `verifyE2()`）に載っているスクリプトか確認する。');
if (dirty) log('\n⚠ 未コミットの変更がある状態で測っている＝再現できない可能性がある（HEAD だけでは条件が復元できない）。');
if (r.code !== 0) log('\n❌ 実験が異常終了した。数値を分析へ採用する前に生ログの末尾を読む。');

log('\n── Claude がやること（ツールはここから先に踏み込まない）──');
log('  1. quantitative_analysis.md … §2〜§5 に**この走の数値が答える問い**を書く（手法・入力・推定量つき）');
log('  2. qualitative_analysis.md  … 自動生成ブロックの <> を埋める（対照が要るなら E4 に従い先に取る）');
log('  3. integrated_analysis.md   … 統合判断・Cx 遷移・golden 影響・次アクション');
if (isNew) log(`  4. ${simPath}/README.md … 6章のプレースホルダ（主題・フロー・測定環境・クローズゲート）を埋める`);
process.exit(r.code === 0 ? 0 : 1);
