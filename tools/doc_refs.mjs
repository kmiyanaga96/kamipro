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
// ⚠ 本ツールは **--write を持たない**（S1 の受入条件＝リポジトリ無改変）。末尾ブロックの挿入は S4 で別途。
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
  `find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*"`,
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
  let fenced = false, ignoring = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;                       // コードブロック内は例示＝参照ではない
    // 「死んだパスを**資料として引用する**」区間を除外する。歴史台帳（SESSION_LOG）や本計画の
    // リンク切れ一覧のように、解決してはいけないパスを意図的に書く文書が実在するため必要。
    if (/<!--\s*doc_refs:ignore-begin\b/.test(line)) { ignoring = true; return; }
    if (/<!--\s*doc_refs:ignore-end\b/.test(line))   { ignoring = false; return; }
    if (ignoring) return;
    if (/<!--\s*doc_refs:ignore-line\b/.test(line)) return;
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
