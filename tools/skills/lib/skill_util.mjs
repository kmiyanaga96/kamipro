// tools/skills/ 共通ユーティリティ（依存なし・Node 標準のみ）。
//
// ★責務の線引き（PHASE9_PLAN の憲法と同じ）:
//   「観測と判断はユーザー／導出・分析は Claude Code／**転記・検算・整形はツール**」
//   ∴ ここに置くのは **機械的にやれば必ず同じ答えになるもの**だけ。判断は SKILL.md 側（Claude）へ返す。
//
// ⚠ REPO_STANDARDS E7（外部コマンドの存在を前提にしない）: 使うのは node / git のみ。

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** リポジトリ根（tools/skills/lib/ から3つ上）。 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const rel = (p) => path.relative(ROOT, path.resolve(ROOT, p)).replace(/\\/g, '/');
export const abs = (p) => path.resolve(ROOT, p);

// ── ファイル I/O ────────────────────────────────────────────────
export const exists = (p) => { try { fs.statSync(abs(p)); return true; } catch { return false; } };
export const readText = (p) => fs.readFileSync(abs(p), 'utf8');
export const readTextOr = (p, dflt = null) => (exists(p) ? readText(p) : dflt);
export function writeText(p, s) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), s); return rel(p); }
export const readJson = (p) => JSON.parse(readText(p));
export const writeJson = (p, o) => writeText(p, JSON.stringify(o, null, 2) + '\n');

// ── プロセス実行 ────────────────────────────────────────────────
/**
 * コマンドを1つ実行し {code, stdout, stderr, ms} を返す（例外を投げない）。
 * ⚠ E8「1条件=1プロセス」に従い、呼び出し側は1回の実行で1条件だけを測ること。
 */
export function run(cmd, args, { cwd = ROOT, timeout = 900_000, env = process.env } = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd, timeout, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    code: r.status ?? (r.error ? -1 : null),
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    error: r.error ? String(r.error.message) : null,
    ms: Date.now() - t0,
    cmd: [cmd, ...args].join(' '),
  };
}

/** node スクリプトを実行する（npm を経由しない＝PATH 依存を減らす）。 */
export const runNode = (args, opts = {}) => run(process.execPath, args, opts);

/** git を実行し stdout を返す（失敗時は空文字）。 */
export function git(...args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); }
  catch { return ''; }
}

// ── git 差分の収集 ──────────────────────────────────────────────
/** 既定の比較基点を決める（origin/main → main → HEAD~1 の順に実在するものを使う）。 */
export function defaultBase() {
  for (const ref of ['origin/main', 'main', 'HEAD~1']) {
    if (git('rev-parse', '--verify', '--quiet', ref).trim()) {
      const mb = git('merge-base', 'HEAD', ref).trim();
      if (mb) return { ref, base: mb };
      return { ref, base: ref };
    }
  }
  return { ref: 'HEAD', base: 'HEAD' };
}

/**
 * 変更ファイル一覧（**未コミットを含む**）。
 * @returns {{base:string, ref:string, committed:string[], workingTree:string[], all:string[]}}
 */
export function changedFiles({ base = null } = {}) {
  const d = base ? { ref: base, base } : defaultBase();
  const split = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const committed = split(git('diff', '--name-only', `${d.base}...HEAD`));
  const workingTree = [
    ...split(git('diff', '--name-only', 'HEAD')),
    ...split(git('ls-files', '--others', '--exclude-standard')),
  ];
  const all = [...new Set([...committed, ...workingTree])].sort();
  return { base: d.base, ref: d.ref, committed, workingTree: [...new Set(workingTree)].sort(), all };
}

/** 直近コミット（件名のみ）。 */
export function recentCommits(n = 15) {
  return git('log', `-n${n}`, '--pretty=format:%h\t%ad\t%s', '--date=short')
    .split('\n').filter(Boolean)
    .map((l) => { const [hash, date, ...rest] = l.split('\t'); return { hash, date, subject: rest.join('\t') }; });
}

// ── JS の静的スキャン支援 ────────────────────────────────────────
/**
 * コメント・文字列リテラル・正規表現リテラルを空白へ潰す（**長さと改行位置は保存**）。
 * ★これが無いと「コメントに書いてある `BG.other_max`」を違反として誤検出する（実際にそう書かれている）。
 */
export function stripJs(src) {
  const out = src.split('');
  const blank = (i) => { if (out[i] !== '\n') out[i] = ' '; };
  let i = 0;
  const prevMeaningful = (at) => { for (let j = at - 1; j >= 0; j--) { const c = src[j]; if (!/\s/.test(c)) return c; } return ''; };
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < src.length && src[i] !== '\n') blank(i++); continue; }
    if (c === '/' && c2 === '*') { blank(i++); blank(i++); while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) blank(i++); blank(i++); blank(i++); continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; blank(i++);
      while (i < src.length) { if (src[i] === '\\') { blank(i++); blank(i++); continue; } if (src[i] === q) { blank(i++); break; } blank(i++); }
      continue;
    }
    // 正規表現リテラル（除算と区別する標準的なヒューリスティック）
    if (c === '/' && /[(,=:[!&|?{};+\-*%^~]/.test(prevMeaningful(i))) {
      let j = i + 1, inClass = false, ok = false;
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) { ok = true; break; }
        j++;
      }
      if (ok) { while (i <= j) blank(i++); continue; }
    }
    i++;
  }
  return out.join('');
}

/** コメントだけを潰す（文字列は残す・長さと改行位置は保存）。文字列リテラルを見たい検査で使う。 */
export function stripComments(src) {
  const out = src.split('');
  const blank = (i) => { if (out[i] !== '\n') out[i] = ' '; };
  let i = 0;
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < src.length && src[i] !== '\n') blank(i++); continue; }
    if (c === '/' && c2 === '*') { blank(i++); blank(i++); while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) blank(i++); blank(i++); blank(i++); continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      continue;
    }
    i++;
  }
  return out.join('');
}

/**
 * **関数本体（波括弧つき／簡潔アロー body の両方）**に入っている位置を 1 とするマスクを返す。
 * ★簡潔アロー（`(sim) => sim.x * DMG.y`）を関数と数えないと、TDZ 検査が実装済みのコードを誤検出する
 *   （characters.js には簡潔アローの `burstBonus` 等が多数ある＝実際に踏んだ）。
 * @param {string} s stripJs 済みのソース
 */
export function functionMask(s) {
  const mask = new Uint8Array(s.length);
  const isFunctionOpen = (at) => {
    let j = at - 1;
    while (j >= 0 && /\s/.test(s[j])) j--;
    if (j >= 1 && s[j] === '>' && s[j - 1] === '=') return true;            // アロー関数
    if (s[j] !== ')') return false;
    let depth = 0, k = j;
    for (; k >= 0; k--) { if (s[k] === ')') depth++; else if (s[k] === '(') { depth--; if (!depth) break; } }
    let p = k - 1;
    while (p >= 0 && /\s/.test(s[p])) p--;
    const end = p;
    while (p >= 0 && /[A-Za-z0-9_$]/.test(s[p])) p--;
    const word = s.slice(p + 1, end + 1);
    return !['if', 'for', 'while', 'switch', 'catch', 'with'].includes(word);
  };
  const fill = (a, b) => { for (let i = a; i <= b && i < s.length; i++) mask[i] = 1; };
  // ① 波括弧の関数本体
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{' || !isFunctionOpen(i)) continue;
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') { depth--; if (!depth) { fill(i, j); break; } }
    }
  }
  // ② 簡潔アロー body（`=>` の直後が `{` でないもの）
  for (const m of s.matchAll(/=>/g)) {
    let k = m.index + 2;
    while (k < s.length && /\s/.test(s[k])) k++;
    if (s[k] === '{') continue;
    let d = 0;
    let j = k;
    for (; j < s.length; j++) {
      const c = s[j];
      if ('([{'.includes(c)) d++;
      else if (')]}'.includes(c)) { if (d === 0) break; d--; }
      else if ((c === ',' || c === ';') && d === 0) break;
    }
    fill(m.index, j - 1);
  }
  return mask;
}

/** 文字 index → 1始まりの行番号。 */
export function lineOf(src, index) { let n = 1; for (let i = 0; i < index && i < src.length; i++) if (src[i] === '\n') n++; return n; }

/**
 * `name(` で始まる関数/メソッドの本体レンジ（`{` から対応する `}` まで）を返す。見つからなければ null。
 * @param {string} stripped stripJs 済みのソース（文字列/コメントが潰れていること）
 */
export function functionBody(stripped, name) {
  const re = new RegExp(`(?:function\\s+)?\\b${name}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(stripped))) {
    let i = stripped.indexOf('{', m.index);
    if (i < 0) continue;
    let depth = 0;
    for (let j = i; j < stripped.length; j++) {
      if (stripped[j] === '{') depth++;
      else if (stripped[j] === '}') { depth--; if (depth === 0) return { start: i, end: j, text: stripped.slice(i, j + 1) }; }
    }
  }
  return null;
}

// ── 表示 ────────────────────────────────────────────────────────
export const HR = '='.repeat(72);
export const log = (s = '') => process.stdout.write(s + '\n');
export function banner(title, subtitle = '') {
  log('\n' + HR);
  log(title);
  if (subtitle) log(subtitle);
  log(HR);
}
export const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
export const fileStamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d+Z$/, 'Z');
export const comma = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : String(n));

/**
 * 素朴な引数パーサ。`--k v` / `--flag` / 位置引数 を分ける。
 * @param {string[]} argv process.argv.slice(2)
 * @param {string[]} flags 値を取らないフラグ名（`--` なし）
 */
export function parseArgs(argv, flags = []) {
  const opt = {}, rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (flags.includes(k)) opt[k] = true;
      else { opt[k] = argv[i + 1] ?? ''; i++; }
    } else rest.push(a);
  }
  return { opt, rest };
}

/** 出力先の既定（リポジトリを汚さない一時置き場）。 */
export const REPORT_DIR = 'tools/skills/.reports';
