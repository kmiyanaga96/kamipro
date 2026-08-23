// sync-workspace-handoff ── セッション末の workspace/ 同期（収集・転記・整形）
//
// 使い方（既定は**リポジトリ無改変**の収集モード）:
//   node tools/skills/sync_workspace_handoff.mjs                       # 収集してドラフトを出す
//   node tools/skills/sync_workspace_handoff.mjs --doc-check           # 収集 + npm run doc:check
//   node tools/skills/sync_workspace_handoff.mjs --bump-counter        # md リレーション点検カウンタを +1
//   node tools/skills/sync_workspace_handoff.mjs --reset-counter       # doc:check を走らせて 0 に戻す（トリガ該当時）
//   node tools/skills/sync_workspace_handoff.mjs --check-todo "P3-1b"  # 該当 TODO 行を [ ] → [x]（複数可）
//   node tools/skills/sync_workspace_handoff.mjs --apply-handoff <md>  # 仕上げたドラフトで HANDOFF.md を差し替え
//   node tools/skills/sync_workspace_handoff.mjs --fold-session-log <md>  # SESSION_LOG の先頭へ1ブロック畳む
//
// ★役割分担（PHASE9_PLAN の憲法）:
//   ツール = 差分の収集・カウンタ加算・チェックボックスの転記・ドラフトの器づくり（**機械的**）
//   Claude = 「何が進んで何が詰まっているか」の言語化（**判断**）。∴ 本文の断定はツールが書かない。
//
// 規律の正: REPO_STANDARDS §6「セッション末」（3〜6）／ DOC_RELATION_PLAN §7（常駐サブタスク）。

import fs from 'node:fs';
import {
  rel, exists, readText, writeText, writeJson, runNode, git, changedFiles, recentCommits,
  banner, log, parseArgs, stamp, fileStamp, REPORT_DIR,
} from './lib/skill_util.mjs';

const argv = process.argv.slice(2);
const { opt } = parseArgs(argv, ['doc-check', 'bump-counter', 'reset-counter', 'help']);
const checkTodos = argv.reduce((a, v, i) => (v === '--check-todo' ? [...a, argv[i + 1]] : a), []);
if (opt.help) { log(readText('tools/skills/sync_workspace_handoff.mjs').split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }

const TODO = 'workspace/TODO.md';
const HANDOFF = 'workspace/HANDOFF.md';
const SESSION_LOG = 'archive/SESSION_LOG.md';
const today = new Date().toISOString().slice(0, 10);

banner('sync-workspace-handoff', stamp());

// ══ 1. git の状態 ═══════════════════════════════════════════════
const changed = changedFiles({ base: opt.base || null });
const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
const commits = git('log', `${changed.base}..HEAD`, '--pretty=format:%h\t%ad\t%s', '--date=short')
  .split('\n').filter(Boolean).map((l) => { const [hash, date, ...s] = l.split('\t'); return { hash, date, subject: s.join('\t') }; });
const nameStatus = git('diff', '--name-status', `${changed.base}...HEAD`).split('\n').filter(Boolean)
  .map((l) => { const [st, ...p] = l.split('\t'); return { st, path: p[p.length - 1], from: p.length > 1 ? p[0] : null }; });
const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
const dirty = git('status', '--porcelain').split('\n').filter(Boolean);

const layer = (f) => f.startsWith('src/transcribe/') ? 'T1（転記）'
  : /^(src\/|gamedata\/js\/|test\/)/.test(f) ? 'エンジン'
  : f.startsWith('tools/') ? 'ハーネス'
  : f.startsWith('simulation/') ? 'sim（較正）'
  : /\.md$/.test(f) ? 'ドキュメント' : 'その他';
const byLayer = {};
for (const f of changed.all) (byLayer[layer(f)] ??= []).push(f);

log(`ブランチ: ${branch} ／ 基点 ${changed.ref}（${changed.base.slice(0, 8)}）`);
log(`コミット: ${commits.length} 本 ／ 変更ファイル: ${changed.all.length} 本 ／ 未コミット: ${dirty.length} 本`);
for (const [k, v] of Object.entries(byLayer)) log(`  ${k}: ${v.length} 本 — ${v.slice(0, 6).join(', ')}${v.length > 6 ? ' …' : ''}`);

// ══ 2. md リレーション点検のトリガ判定（DOC_RELATION_PLAN §7）════
const mdAdded = [...nameStatus.filter((n) => /^[AR]/.test(n.st) && n.path.endsWith('.md')).map((n) => n.path),
                 ...untracked.filter((f) => f.endsWith('.md'))];
const mdMovedToArchive = nameStatus.filter((n) => /^R/.test(n.st) && n.path.startsWith('archive/')).map((n) => n.path);
const docTrigger = mdAdded.length > 0 || mdMovedToArchive.length > 0;

const todoSrc = readText(TODO);
const counterRe = /(- カウンタ: `)(\d+)(\/(\d+)`)/;
const counterM = counterRe.exec(todoSrc);
const counter = counterM ? { cur: Number(counterM[2]), max: Number(counterM[4]) } : null;

log(`\nmd 新設/改名: ${mdAdded.length ? mdAdded.join(', ') : 'なし'}${mdMovedToArchive.length ? ` ／ archive 移動: ${mdMovedToArchive.join(', ')}` : ''}`);
log(`点検カウンタ: ${counter ? `${counter.cur}/${counter.max}` : '（読めない）'} ／ 即実行トリガ: ${docTrigger ? '★該当（doc:check を走らせて 0 に戻す）' : '非該当（+1 する）'}`);

// ══ 3. doc:check ════════════════════════════════════════════════
let docCheck = null;
if (opt['doc-check'] || opt['reset-counter']) {
  const r = runNode(['tools/doc_refs.mjs', '--check'], { timeout: 180_000 });
  const brokenActive = /壊れた参照\s*:\s*(\d+)\s*（現役層\s*(\d+)/.exec(r.stdout);
  docCheck = { code: r.code, broken: brokenActive ? Number(brokenActive[1]) : null, brokenActive: brokenActive ? Number(brokenActive[2]) : null, tail: r.stdout.split('\n').slice(-20).join('\n') };
  log(`\n[doc:check] exit ${r.code}${docCheck.brokenActive !== null ? ` ／ 壊れた参照 現役層 ${docCheck.brokenActive} 件` : ''}`);
  if (r.code !== 0) log(docCheck.tail);
}

// ══ 4. TODO の解析 ══════════════════════════════════════════════
const todoLines = todoSrc.split('\n');
const items = todoLines.map((l, i) => ({ i, line: l }))
  .filter(({ line }) => /^\s*-\s\[( |x)\]/.test(line))
  .map(({ i, line }) => ({
    line: i + 1, done: /\[x\]/.test(line),
    text: line.replace(/^\s*-\s\[( |x)\]\s*/, '').replace(/\*\*/g, '').slice(0, 100),
  }));
const open = items.filter((t) => !t.done);
log(`\nTODO: 全 ${items.length} 項（未了 ${open.length} / 完了 ${items.length - open.length}）`);

// 完了候補の推定（コミット件名・変更パスとの語の重なり。★提案であって確定ではない）
const haystack = (commits.map((c) => c.subject).join(' ') + ' ' + changed.all.join(' ')).toLowerCase();
const candidates = open.map((t) => {
  const tokens = (t.text.match(/[A-Za-z][A-Za-z0-9_.-]{2,}|[A-Z]\d[-\w]*/g) ?? []).map((s) => s.toLowerCase());
  const hit = [...new Set(tokens)].filter((tk) => tk.length >= 3 && haystack.includes(tk));
  return { ...t, hit };
}).filter((t) => t.hit.length).sort((a, b) => b.hit.length - a.hit.length);
if (candidates.length) {
  log('完了かもしれない項（★語の重なりだけによる提案＝判断は Claude/ユーザー）:');
  for (const c of candidates.slice(0, 6)) log(`  L${c.line} [${c.hit.join(',')}] ${c.text}`);
}

// ══ 5. 書き込み系（明示指定時のみ）═════════════════════════════
const applied = [];
let todoOut = todoSrc;

for (const key of checkTodos) {
  if (!key) continue;
  const idx = todoLines.findIndex((l) => /^\s*-\s\[ \]/.test(l) && l.includes(key));
  if (idx < 0) { log(`\n⚠ --check-todo "${key}": 未了項に一致する行が無い（既に [x] か、表記違い）。`); continue; }
  const dup = todoLines.filter((l) => /^\s*-\s\[ \]/.test(l) && l.includes(key)).length;
  if (dup > 1) { log(`\n⚠ --check-todo "${key}": ${dup} 行に一致＝一意でないので触らない。より長い部分文字列を指定する。`); continue; }
  todoOut = todoOut.replace(todoLines[idx], todoLines[idx].replace('- [ ]', '- [x]'));
  applied.push(`TODO L${idx + 1} を [x] にした: ${todoLines[idx].trim().slice(0, 60)}`);
}

if (opt['bump-counter'] || opt['reset-counter']) {
  if (!counter) log('\n⚠ カウンタ行を認識できなかった（`- カウンタ: \\`n/m\\`` の形）。手で確認する。');
  else {
    const next = opt['reset-counter'] ? 0 : counter.cur + 1;
    todoOut = todoOut.replace(counterRe, `$1${next}$3`);
    applied.push(`点検カウンタ ${counter.cur} → ${next}`);
    if (opt['bump-counter'] && docTrigger) log('\n⚠ md の新設/改名があるセッションは**即実行トリガ**＝本来は --reset-counter（doc:check 実行）が正しい。');
  }
}

if (todoOut !== todoSrc) {
  // 最終更新日も揃える（台帳と実体の乖離を作らない）
  todoOut = todoOut.replace(/(> 最終更新: )\d{4}-\d{2}-\d{2}/, `$1${today}`);
  writeText(TODO, todoOut);
  log(`\n✅ ${TODO} を更新:\n  - ${applied.join('\n  - ')}`);
}

// ══ 6. HANDOFF ドラフト（3項目・器だけ）═════════════════════════
const cur = readText(HANDOFF);
const header = cur.split('\n---\n')[0];
const draft = `${header.replace(/(> 最終更新: )[^\n]*/, `$1${today}（<この行を1文で書き換える＝今セッションの到達点>）`)}

---

## 1. 直近の実装内容

<!-- 何を作り/直したか。**証拠（golden・test:t1・doc:check の結果）を必ず併記**する。 -->

| 層 | 変更 | 証拠 |
|---|---|---|
${Object.entries(byLayer).map(([k, v]) => `| ${k} | ${v.slice(0, 4).map((f) => `\`${f}\``).join(' / ')}${v.length > 4 ? ` ほか ${v.length - 4} 本` : ''} | <golden 3/3・test:t1 337件 等> |`).join('\n') || '| — | 変更なし | — |'}

**コミット（${changed.ref} からの ${commits.length} 本）**
${commits.map((c) => `- \`${c.hash}\` ${c.subject}`).join('\n') || '- （未コミット）'}
${dirty.length ? `\n⚠ **未コミット ${dirty.length} 本**: ${dirty.slice(0, 8).map((l) => `\`${l.slice(3)}\``).join(' / ')}${dirty.length > 8 ? ' …' : ''}` : ''}

## 2. 現在の課題・ブロッカー

<!-- 「次の人が同じ壁に当たらない」ために書く。詰まりは**証拠つき**で（推測なら推測と明記）。
     ゲート待ち（ユーザーの実機観測待ち・受領待ち）は**誰待ちか**を明示する。 -->

| # | 課題 | 状態 / 誰待ち | 根拠（Cx・ファイル・数値） |
|---|---|---|---|
| 1 | <> | <> | <> |

## 3. 次回の Next Steps

<!-- 優先順。詳細な手順は書かない（手順の正は各計画 md、次タスクの一覧は workspace/TODO.md）。 -->

1. <最優先・1行＋ポインタ>
2. <>
3. <>

**未了の TODO（${open.length} 項・上位）**
${open.slice(0, 8).map((t) => `- L${t.line} ${t.text}`).join('\n') || '- （なし）'}

---

<!-- ⚠ このドラフトはツールが**器だけ**を作ったもの。<> を埋め、コメントは削除してから
     \`node tools/skills/sync_workspace_handoff.mjs --apply-handoff <このファイル>\` で反映する。
     押し出された経緯は archive/SESSION_LOG.md の先頭へ畳む（--fold-session-log）。 -->
`;

const draftPath = writeText(`${REPORT_DIR}/handoff_draft_${fileStamp()}.md`, draft);
log(`\nHANDOFF ドラフト: ${draftPath}`);
log('  → <> を埋めてから --apply-handoff で反映する（ツールは本文の断定を書かない）。');

// ══ 7. 反映 ═════════════════════════════════════════════════════
if (opt['apply-handoff']) {
  const p = String(opt['apply-handoff']);
  if (!exists(p)) { log(`❌ --apply-handoff: ${p} が無い。`); process.exit(2); }
  const body = readText(p);
  const missing = ['## 1. 直近の実装内容', '## 2. 現在の課題・ブロッカー', '## 3. 次回の Next Steps'].filter((h) => !body.includes(h));
  if (missing.length) { log(`❌ 必須の3項目が欠けている: ${missing.join(' / ')}`); process.exit(2); }
  if (!/^# 引継ぎ/.test(body)) { log('❌ 冒頭のヘッダブロック（REPO_STANDARDS §4）が無い。'); process.exit(2); }
  // ⚠ プレースホルダ検査は**コード内の <...> を除いてから**行う（`<切り抜き>.json` のような正当な例示で
  //    毎回警告すると、警告そのものが読まれなくなる＝doc_refs 初版の過剰報告と同じ失敗）。
  const prose = body.replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  if (/<[^>\n]*>/.test(prose)) log('⚠ 未置換のプレースホルダ `<...>` が残っている（そのまま反映する）。');
  writeText(`${REPORT_DIR}/handoff_backup_${fileStamp()}.md`, cur);
  writeText(HANDOFF, body.replace(/\n*$/, '\n'));
  log(`✅ ${HANDOFF} を差し替えた（旧版は ${REPORT_DIR}/ にバックアップ）。`);
}

if (opt['fold-session-log']) {
  const p = String(opt['fold-session-log']);
  if (!exists(p)) { log(`❌ --fold-session-log: ${p} が無い。`); process.exit(2); }
  const block = readText(p).trim();
  if (!/^##\s/m.test(block)) { log('❌ 畳むブロックは `## <日付>〜（主題）` 見出しで始めること（SESSION_LOG の様式）。'); process.exit(2); }
  const s = readText(SESSION_LOG);
  const at = s.indexOf('\n---\n');
  if (at < 0) { log('❌ SESSION_LOG の区切り `---` が見つからない。'); process.exit(2); }
  const head = s.slice(0, at + 5), rest = s.slice(at + 5);
  writeText(SESSION_LOG, `${head}\n${block}\n${rest}`);
  log(`✅ ${SESSION_LOG} の先頭へ1ブロック畳んだ（最新が上）。`);
}

// ══ 8. レポート ═════════════════════════════════════════════════
const out = opt.json || `${REPORT_DIR}/handoff_${fileStamp()}.json`;
writeJson(out, {
  tool: 'sync-workspace-handoff', at: stamp(), branch, base: changed.base, baseRef: changed.ref,
  commits, changed: changed.all, byLayer, dirty, mdAdded, mdMovedToArchive, docTrigger, counter, docCheck,
  todo: { total: items.length, open: open.length, candidates: candidates.slice(0, 10) },
  applied, draft: draftPath,
});
log(`\nレポート: ${out}`);
log('\n── セッション末チェック（REPO_STANDARDS §6）──');
log(`  3. TODO 更新（完了項は [x]→SESSION_LOG へ畳んで**本書から削除**）  … ${applied.length ? '一部ツールで実施' : '未実施'}`);
log(`  4. HANDOFF を「今」だけへ上書き（押し出しは SESSION_LOG へ）      … ${opt['apply-handoff'] ? '実施' : 'ドラフト待ち'}`);
log(`  6. 点検カウンタ ${docTrigger ? '**要リセット**（md 新設/改名あり）' : '+1'}                     … ${opt['bump-counter'] || opt['reset-counter'] ? '実施' : '未実施'}`);
