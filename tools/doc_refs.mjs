// md 相互参照の機械検査（DOC_RELATION_PLAN.md S1・2026-08-05）。★リポジトリ無改変（読むだけ）
//
// ── なぜ必要か ──
//   md 間の参照は「更新漏れインシデント」の主要な発生源だが、現状は **markdown リンク形式がほぼ未使用**で
//   backtick と裸テキストが主＝**機械が解決できない**。実測でリンク切れ約50件・曖昧参照53件が滞留していた。
//   本ツールはその参照グラフを構築し、壊れた参照・曖昧な参照・被参照ランキングを出す。
//   詳細な設計と決定事項は DOC_RELATION_PLAN.md（§1 実測 / §2 インシデント型 / §3 設計原則 / §7 常駐化）。
//
// ── 使い方 ──
//   node tools/doc_refs.mjs             … 既定 = --check（サマリ＋壊れた参照の全件）
//   node tools/doc_refs.mjs --check     … 同上。壊れた参照が現役層にあれば exit 1
//   node tools/doc_refs.mjs --ambiguous … 曖昧参照（裸 basename）の全件（S3 の書き換え対象＝決定5）
//   node tools/doc_refs.mjs --graph     … 被参照ランキング（末尾ブロックに入る内容の下見）
//   node tools/doc_refs.mjs --refs <path> … 指定 md の 参照先 / 被参照 を両方向で表示
//   node tools/doc_refs.mjs --json      … 機械可読出力（後続工程 S4 の --write が食う）
//
//   node tools/doc_refs.mjs --write [--dry-run] [--only <prefix>]
//                                       … 末尾ブロック（被参照＋更新履歴の雛形）を生成/更新（S4）
//
// ⚠ `--write` は**現役層のみ**が対象（凍結 sim・archive・essays・TEMPLATE は決定3/決定8 で対象外）。
// ⚠ **冪等**＝2回走らせても差分は出ない。被参照ブロックは毎回再生成し、更新履歴の雛形は1度だけ置く。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = '/home/user/kamipro';
const log = s => process.stdout.write(s + '\n');

// ══ 1. 対象ファイルの列挙と層の分類 ════════════════════════════════
// 層ごとに「壊れた参照を失敗として扱うか」が違う（DOC_RELATION_PLAN §5.2・決定3）。
//   active … 現役。壊れていたら exit 1（直すべき）
//   frozen … 凍結 sim（sim01〜04）。**決定3 で適用対象外**＝警告のみ
//   archive… 歴史台帳。当時のパスが正しい記述がありうる＝警告のみ（S3 で個別判断）
//   tmpl   … テンプレ原本。プレースホルダの塊＝検査対象外
function layerOf(f) {
  if (f.startsWith('simulation/TEMPLATE/')) return 'tmpl';
  if (/^simulation\/sim0[1-4]\//.test(f)) return 'frozen';
  if (f.startsWith('archive/')) return 'archive';
  if (f.startsWith('essays/')) return 'essay';
  return 'active';
}

const allFiles = execSync(
  // ⚠ `.claude/` は**ハーネス設定**（スキル定義）＝プロジェクト文書ではない。
  //    検査対象に入れると被参照ブロックが SKILL.md へ注入され、スキル読み込みのたびに無関係な
  //    リンク一覧を読ませることになる（スキル本文は短く保つのが要件）。∴ 除外する。
  //    `tools/skills/.reports/` も同様＝スキルの一時出力（git 管理外）で、被参照ランキングを汚す。
  `find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./.claude/*" -not -path "./tools/skills/.reports/*"`,
  { cwd: ROOT, encoding: 'utf8' }
).trim().split('\n').map(s => s.replace(/^\.\//, '')).sort();

// 参照先として実在しうる全パス（md 以外のコードも含む＝md→コードのリンク腐りも同じ事故）。
// ⚠ `git ls-files` は既定で**非ASCIIパスを8進エスケープして引用符で囲む**（core.quotePath）。
//    そのままだと `gamedata/md/その他/attack_phase.md` が永久に「壊れた参照」に見える（実際に踏んだ）。
//    ∴ `-z`（NUL 区切り・エスケープなし）で受ける。
// ⚠ `git ls-files` は**追跡済みしか出さない**＝同じコミットで新設したファイルへの参照が「壊れている」に見える
//    （本ツール自身への参照で実際に踏んだ）。∴ 実ファイルの存在も併せて見る。
const allPaths = new Set(
  execSync(`git ls-files -z`, { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean)
);
const existsOnDisk = p => { try { return fs.statSync(path.join(ROOT, p)).isFile(); } catch { return false; } };
const known = p => allPaths.has(p) || existsOnDisk(p);
const mdByBase = {}, anyByBase = {};
for (const f of allFiles) (mdByBase[f.split('/').pop()] ??= []).push(f);
for (const f of allPaths) (anyByBase[f.split('/').pop()] ??= []).push(f);

// ══ 2. 参照の抽出 ════════════════════════════════════════════════
// basename は全て ASCII（実測済）。ディレクトリ名にのみ日本語が入る（gamedata/md/神姫 等）。
// ∴ 「日本語はスラッシュが続くときだけパスの一部」と扱えば、地の文（日本語）を巻き込まない。
// ⚠ `・` (U+30FB) は除外する＝`CLAUDE.md・CALIBRATION_ANALYSIS.md` を1つの参照と誤読しないため
//    （初回の素朴な実測で実際に踏んだ。ァ-ヶ は U+30A1-30F6 で ・ を含まない）。
const SEG = '[A-Za-z0-9_.\\-ぁ-んァ-ヶ一-龯々]';
// ⚠ 拡張子の交替順は **長い方を先**にする。`js` を先に置くと `package.json` が `package.js` にマッチする
//    （正規表現の交替は leftmost-first＝実際に踏んだ）。
const REF_RE = new RegExp(`(?:${SEG}+\\/)*[A-Za-z0-9_][A-Za-z0-9_.\\-]*\\.(?:json|mjs|md|js)`, 'g');

// テンプレのプレースホルダは参照ではない（simNN / trialNN / trialXX / configX / PHASEN …）
const PLACEHOLDER = /NN|XX|\bsimN|PHASEN|configX|<|\{/i;
// 地の文の常連（パスではない）。`Node.js` を「壊れた参照」と言い出すと検査が信用されなくなる。
const PROSE = /^(Node|Vite|package)\.js$/;

function extractRefs(file) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const out = [];
  let fenced = false, ignoring = false, skipNext = false, inGen = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;                       // コードブロック内は例示＝参照ではない
    // 「死んだパスを**資料として引用する**」区間を除外する。歴史台帳（SESSION_LOG）や本計画の
    // リンク切れ一覧のように、解決してはいけないパスを意図的に書く文書が実在するため必要。
    // ★生成ブロック（doc_refs:begin〜end）は**抽出しない**。中身は被参照リンクの羅列なので、
    //   数えてしまうと「全 md が全 md を参照している」状態に自己増殖する。
    if (/<!--\s*doc_refs:begin\b/.test(line)) { inGen = true; return; }
    if (/<!--\s*doc_refs:end\b/.test(line))   { inGen = false; return; }
    if (inGen) return;
    if (/<!--\s*doc_refs:ignore-begin\b/.test(line)) { ignoring = true; return; }
    if (/<!--\s*doc_refs:ignore-end\b/.test(line))   { ignoring = false; return; }
    if (ignoring) return;
    // ignore-line は2通りの書き方を許す（どちらも自然に書けるようにするため）:
    //   ①行末にインラインで置く → **その行**を無視  ②単独行に置く → **次の行**を無視（見出し行などに使う）
    if (/<!--\s*doc_refs:ignore-line\b/.test(line)) {
      if (/^\s*(?:>\s*)?<!--\s*doc_refs:ignore-line\b[^>]*-->\s*$/.test(line)) skipNext = true;
      return;
    }
    if (skipNext) { skipNext = false; return; }
    for (const m of line.matchAll(REF_RE)) {
      const raw = m[0];
      if (PLACEHOLDER.test(raw)) continue;
      if (/^_/.test(raw)) continue;          // `<CHAR>_REGISTRATION.md` 等の断片＝命名パターン
      if (/^\d+\.md$/.test(raw)) continue;   // `trial01〜05.md` の「05.md」等の断片
      out.push({ raw, line: i + 1 });
    }
  });
  return out;
}

// ══ 3. 解決 ══════════════════════════════════════════════════════
// 優先順: ①その md からの相対 ②リポジトリ根から ③裸 basename（一意なら採用）
//
// ★分類の要点（過剰報告を避けるための設計）:
//   「解決できない」＝「壊れている」ではない。地の文（`Node.js`）やスラッシュ連結の散文
//   （`CLAUDE.md/AGENTS.md`・`cf.mjs/cf_realgear.mjs`・`tetra/hecate/elaine.md`）が混ざるため、
//   **確度の高いものだけを broken と呼ぶ**。でないと検査そのものが信用されなくなる（初版は 487件＝実数の約10倍出た）。
//     broken … パス形（`/` を含む）で解決不能、または **裸の .md** で実在しない＝ほぼ確実に死んだ参照
//     prose  … 中間セグメントが拡張子で終わる連結表記／地の文の常連／裸のコード名で実在しない＝報告するが失敗にしない
const JOINED = new RegExp(`\\.(?:json|mjs|md|js)\\/`);   // 「CLAUDE.md/AGENTS.md」型＝散文の連結

function resolve(file, raw) {
  if (PROSE.test(raw)) return { kind: 'prose' };
  const dir = path.dirname(file);
  const asRel = path.normalize(path.join(dir, raw)).replace(/\\/g, '/');
  if (known(asRel)) return { kind: 'rel', target: asRel };
  const asRoot = raw.replace(/^\.\//, '');
  if (known(asRoot)) return { kind: 'root', target: asRoot };

  if (raw.includes('/')) {
    if (JOINED.test(raw)) return { kind: 'prose' };       // 連結表記＝1つの参照ではない
    return { kind: 'broken' };                            // パス形で解決不能＝死んだ参照
  }
  // 裸 basename
  const md = mdByBase[raw];
  if (md?.length === 1) return { kind: 'base', target: md[0] };
  if (md?.length > 1) return { kind: 'ambiguous', cands: md };
  const any = anyByBase[raw];
  if (any?.length === 1) return { kind: 'base', target: any[0] };
  if (any?.length > 1) return { kind: 'ambiguous', cands: any };
  // 実在しない裸名: .md なら死んだ参照とみなす（ARIANROD_REGISTRATION.md 等）／コード名は散文の疑い
  return raw.endsWith('.md') ? { kind: 'broken' } : { kind: 'prose' };
}

const graph = {};            // target -> Set(参照元)
const broken = [];           // {file, line, raw, layer}
const ambiguous = [];        // {file, line, raw, cands, layer}
let counts = { rel: 0, root: 0, base: 0, ambiguous: 0, broken: 0, prose: 0 };

for (const f of allFiles) {
  const layer = layerOf(f);
  if (layer === 'tmpl') continue;            // テンプレ原本は検査対象外
  for (const { raw, line } of extractRefs(f)) {
    const r = resolve(f, raw);
    counts[r.kind]++;
    if (r.kind === 'broken') broken.push({ file: f, line, raw, layer });
    else if (r.kind === 'ambiguous') ambiguous.push({ file: f, line, raw, cands: r.cands, layer });
    else if (r.target !== f) (graph[r.target] ??= new Set()).add(f);
  }
}

// ══ 3.5 種別分類（DOC_RELATION_PLAN §5.2 / REPO_STANDARDS §4.1）════════
// 末尾ブロックの対象は**現役層のみ**（凍結 sim・archive・essays・TEMPLATE は決定3/決定8 で対象外）。
// 更新履歴の要否は種別で変わる: 一次情報は「原文ママ＝更新されないのが正」なので**不要**。
function kindOf(f) {
  if (/(^|\/)TEMPLATE\.md$/.test(f)) return null;                    // テンプレ原本＝対象外
  if (f.startsWith('workspace/')) return { history: true,  label: '現状スナップショット' };
  if (/^gamedata\/md\/.*README\.md$/.test(f)) return { history: true,  label: '規定' };
  if (f.startsWith('gamedata/md/')) return { history: false, label: '一次情報' };
  if (f.startsWith('simulation/sim05/data/')) return { history: false, label: '一次情報' };
  if (f.startsWith('simulation/sim05/analysis/')) return { history: true, label: '分析' };
  if (f.startsWith('simulation/') || f.startsWith('tools/')) return { history: true, label: '規定・台帳' };
  if (!f.includes('/')) return { history: true, label: '規定・台帳・計画' };
  return { history: true, label: 'その他' };
}

// ══ 4. 常駐サブタスクのカウンタ（DOC_RELATION_PLAN §7・決定7）═══════
// 状態は **workspace/TODO.md が持つ**（別 state ファイルを作らない＝管理対象を増やさない）。
const TODO = 'workspace/TODO.md';
function residentCounter() {
  const txt = fs.readFileSync(path.join(ROOT, TODO), 'utf8');
  const m = txt.match(/カウンタ:\s*`?(\d+)\s*\/\s*(\d+)`?/);
  if (!m) return null;
  return { n: +m[1], limit: +m[2] };
}

// ══ 5. 出力 ══════════════════════════════════════════════════════
const argv = process.argv.slice(2);
const has = f => argv.includes(f);

if (has('--json')) {
  log(JSON.stringify({
    files: allFiles.length, counts, broken, ambiguous,
    graph: Object.fromEntries(Object.entries(graph).map(([k, v]) => [k, [...v].sort()]))
  }, null, 1));
  process.exit(0);
}

if (has('--refs')) {
  const target = argv[argv.indexOf('--refs') + 1];
  if (!target || !known(target)) { log(`★ 指定パスが見つからない: ${target}`); process.exit(1); }
  log(`\n■ ${target}`);
  log(`\n── この md を参照している文書（被参照 ${(graph[target] ?? new Set()).size}）──`);
  [...(graph[target] ?? [])].sort().forEach(f => log(`  ${f}`));
  log(`\n── この md が参照している先（参照先）──`);
  const seen = new Set();
  for (const { raw } of extractRefs(target)) {
    const r = resolve(target, raw);
    const key = r.target ?? raw;
    if (seen.has(key)) continue; seen.add(key);
    log(`  ${r.kind === 'broken' ? '★切れ ' : r.kind === 'ambiguous' ? '⚠曖昧 ' : '      '}${raw}${r.target && r.target !== raw ? `  → ${r.target}` : ''}`);
  }
  process.exit(0);
}

if (has('--graph')) {
  log(`\n■ 被参照ランキング（末尾ブロックに入る内容の下見）`);
  Object.entries(graph).filter(([t]) => t.endsWith('.md'))
    .sort((a, b) => b[1].size - a[1].size).slice(0, 30)
    .forEach(([t, s]) => log(`  ${String(s.size).padStart(3)}  ${t}`));
  process.exit(0);
}

if (has('--ambiguous')) {
  log(`\n■ 曖昧参照（裸 basename・${ambiguous.length}件）── ★決定5 でパス付きへ書き換える対象`);
  const byRaw = {};
  for (const a of ambiguous) (byRaw[a.raw] ??= []).push(a);
  Object.entries(byRaw).sort((a, b) => b[1].length - a[1].length).forEach(([raw, list]) => {
    log(`\n  「${raw}」 ${list.length}箇所 / 候補 ${list[0].cands.length}本`);
    list.forEach(a => log(`      ${a.file}:${a.line}`));
    log(`      候補: ${list[0].cands.join(' | ')}`);
  });
  process.exit(0);
}


// ══ 6. --write: 末尾ブロックの生成/更新（DOC_RELATION_PLAN S4）═══════════
// **冪等**であることが不変条件＝2回走らせても差分が出ない。
//   ①被参照ブロック（doc_refs:begin〜end）は**毎回まるごと再生成**する（人間は編集しない）
//   ②更新履歴は**無ければ雛形を1度だけ置く**（以後は人間が追記する＝ツールは触らない）
const GEN_BEGIN = '<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->';
const GEN_END   = '<!-- doc_refs:end -->';

// ★載せるのは**現役層の参照元だけ**。凍結 sim・archive は決定3/決定8 で「二度と更新しない」と決めた文書なので、
//   波及先として並べても実際に直すことはない＝**件数だけ添えて一覧からは外す**。
//   （CLAUDE.md は被参照48件のうち33件が凍結 sim04 の trial で、そのまま出すと最も読まれる md が
//     ノイズで埋まる。このブロックの目的は「ここを直したら、どこを直すか」だから、対象は現役層でよい。）
function genBlock(target) {
  const all = [...(graph[target] ?? [])].sort();
  const live = all.filter(r => layerOf(r) === 'active');
  const rest = all.length - live.length;
  const body = live.length
    ? live.map(r => `- [${r}](${rel(target, r)})`).join('\n')
    : '_（現役層からの参照はない）_';
  const note = rest ? `\n\n_他に 凍結sim/archive/essays から ${rest} 件（更新対象外）_` : '';
  return `${GEN_BEGIN}\n## この md を参照している文書（現役層 ${live.length}）\n\n${body}${note}\n${GEN_END}`;
}
// リンクは**その md からの相対パス**で書く（GitHub 上でも辿れる形にする）
function rel(from, to) {
  const r = path.relative(path.dirname(from), to).replace(/\\/g, '/');
  return r.startsWith('.') ? r : './' + r;
}

const HIST_SCAFFOLD = (label) => `## 更新履歴

<!-- 直近5件のみ（それ以前は git log）。「波及確認」列が本体＝git が持たない情報はここだけ。 -->

| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-05 | 末尾ブロックを新設（DOC_RELATION_PLAN S4・種別=${label}） | 参照関係は \`npm run doc:check\` がグリーン |`;

function applyWrite({ dryRun, only }) {
  let changed = 0, skipped = 0;
  const targets = allFiles.filter(f => layerOf(f) === 'active' && kindOf(f))
                          .filter(f => !only || f.startsWith(only));
  for (const f of targets) {
    const p = path.join(ROOT, f);
    let txt = fs.readFileSync(p, 'utf8');
    const before = txt;
    const kind = kindOf(f);

    // ① 被参照ブロック: 既存があれば差し替え、無ければ末尾へ追加
    const gen = genBlock(f);
    const re = new RegExp(`<!--\\s*doc_refs:begin\\b[\\s\\S]*?<!--\\s*doc_refs:end\\s*-->`, 'm');
    if (re.test(txt)) {
      txt = txt.replace(re, gen);
    } else {
      // ② 更新履歴の雛形（種別が要求し、まだ無い場合のみ）
      const needHist = kind.history && !/^##\s*更新履歴\s*$/m.test(txt);
      txt = txt.replace(/\s*$/, '\n');
      txt += `\n---\n\n${needHist ? HIST_SCAFFOLD(kind.label) + '\n\n' : ''}${gen}\n`;
    }
    if (txt === before) { skipped++; continue; }
    changed++;
    if (!dryRun) fs.writeFileSync(p, txt);
    log(`  ${dryRun ? '[dry]' : '[書込]'} ${f}  （種別=${kind.label} / 被参照 ${(graph[f] ?? new Set()).size}）`);
  }
  log(`\n${dryRun ? '[dry-run] ' : ''}対象 ${targets.length} / 変更 ${changed} / 変更なし ${skipped}`);
  if (dryRun) log('※ --dry-run のため書き込んでいない。実行は --write（--dry-run を外す）');
}

if (has('--write')) {
  const onlyIdx = argv.indexOf('--only');
  applyWrite({ dryRun: has('--dry-run'), only: onlyIdx >= 0 ? argv[onlyIdx + 1] : null });
  process.exit(0);
}

// 既定 = --check
const brokenActive = broken.filter(b => b.layer === 'active');
const brokenOther = broken.filter(b => b.layer !== 'active');
const total = Object.values(counts).reduce((a, b) => a + b, 0);

log(`\n■ md 相互参照の検査（対象 ${allFiles.length} md ／ 参照 ${total} 件）`);
log(`  相対で解決        : ${counts.rel}`);
log(`  リポジトリ根で解決: ${counts.root}`);
log(`  裸 basename・一意 : ${counts.base}`);
log(`  ⚠ 曖昧（裸・衝突）: ${counts.ambiguous}   → node tools/doc_refs.mjs --ambiguous`);
log(`  （地の文・連結表記 : ${counts.prose}  ＝参照ではないと判定・失敗にしない）`);
log(`  ★ 壊れた参照      : ${counts.broken}   （現役層 ${brokenActive.length} / 凍結・archive ${brokenOther.length}）`);

const show = (title, list) => {
  if (!list.length) return;
  log(`\n── ${title} ──`);
  const byFile = {};
  for (const b of list) (byFile[b.file] ??= []).push(b);
  for (const [f, bs] of Object.entries(byFile).sort())
    bs.forEach(b => log(`  ${f}:${b.line}  ${b.raw}`));
};
show(`★ 現役層の壊れた参照 ${brokenActive.length}件（要修正）`, brokenActive);
show(`⚠ 凍結 sim / archive の壊れた参照 ${brokenOther.length}件（決定3 で適用対象外・歴史記述として正しい場合がある＝一律に直さない）`, brokenOther);

const rc = residentCounter();
log('');
if (rc) {
  const over = rc.n >= rc.limit;
  log(`■ 常駐サブタスク（DOC_RELATION_PLAN §7）: カウンタ ${rc.n}/${rc.limit}${over ? '  ★超過＝棚卸しの回' : ''}`);
} else {
  log(`■ 常駐サブタスク: ${TODO} にカウンタ行が無い（S5 で設置する）`);
}

if (brokenActive.length) {
  log(`\n[結果] ★ 現役層に壊れた参照が ${brokenActive.length} 件`);
  process.exit(1);
}
log(`\n[結果] ✅ 現役層の参照はすべて解決`);
