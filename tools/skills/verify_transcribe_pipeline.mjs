// verify-transcribe-pipeline ── T1（録画転記）の精度回帰
//
// 使い方:
//   node tools/skills/verify_transcribe_pipeline.mjs                    # 検証（ベースライン比較つき）
//   node tools/skills/verify_transcribe_pipeline.mjs --update-baseline  # 現在値を新ベースラインとして保存
//   node tools/skills/verify_transcribe_pipeline.mjs --json <path>      # 機械可読レポートの出力先
//
// 何をするか:
//   ① `tools/fixtures/*.json`（実走から焼いた正解データ）を**直接ロード**し、
//      文字起こし（glyph）と領域検出（hp_bar / rois）のロジックを回して精度を測る。
//   ② `tools/t1_selftest.mjs`（337件）を走らせ、**検査名ごとの合否**を採る。
//   ③ ベースライン（`tools/skills/baselines/t1_baseline.json`）と突き合わせ、
//      **精度低下・パースエラー・検査の消滅**を差分として出す。
//
// ⚠ 「合成で通っても実機で通る証明にはならない」（PHASE9_PLAN §4.3.0d/e/h＝実際に3回裏切られた）。
//    ∴ 本スクリプトが見るのは**実データ由来のフィクスチャ**を主とし、合成は selftest 側に任せる。
// ⚠ シム本体と非結線＝golden には干渉しない（`npm run test:golden` は不要）。

import {
  rel, readText, readJson, exists, writeJson, runNode, changedFiles,
  banner, log, parseArgs, stamp, fileStamp, REPORT_DIR,
} from './lib/skill_util.mjs';

const { opt } = parseArgs(process.argv.slice(2), ['update-baseline', 'force', 'skip-selftest', 'help']);
const BASELINE = 'tools/skills/baselines/t1_baseline.json';
const ATLAS = 'tools/fixtures/t1_glyph_atlas_M3-1.json';
const HP = 'tools/fixtures/t1_hp_profiles_M3-1.json';

const issues = [];  // {severity, area, message, cause, fix}
const addIssue = (o) => issues.push({ severity: 'regression', ...o });

const changed = changedFiles({ base: opt.base || null });
const t1Touched = changed.all.filter((f) => /^(src\/transcribe\/|transcribe\/|tools\/t1_|tools\/fixtures\/|tools\/lib\/png\.mjs)/.test(f));

banner('verify-transcribe-pipeline', `${stamp()} ／ 基点 ${changed.ref}`);
log(`T1 層の変更: ${t1Touched.length ? t1Touched.join(', ') : '（なし）'}`);

// ══ 1. フィクスチャのロード（パースエラーはここで確実に捕まえる）══════
const metrics = { glyph: null, hp: null, rois: null };
const load = (p) => { try { return { ok: true, json: readJson(p) }; } catch (e) { return { ok: false, error: String(e.message) }; } };

const atlasR = load(ATLAS), hpR = load(HP);
for (const [name, r] of [[ATLAS, atlasR], [HP, hpR]]) {
  if (r.ok) continue;
  addIssue({ area: 'fixture', message: `${name} をパースできない`, cause: r.error,
    fix: 'フィクスチャは `node tools/t1_teach_probe.mjs --atlas <path> --source <由来> <切り抜き>.json …` で**作り直す**（手編集しない＝再現性が担保できなくなる）。' });
}

// ══ 2. 文字起こし（glyph）の精度 ═════════════════════════════════
if (atlasR.ok) {
  try {
    const G = await import('../../src/transcribe/glyph.js');
    const fx = atlasR.json;
    const loto = G.leaveOneTeachingOut(fx.samples, fx.cell);
    const val = G.validateAtlas(fx);
    metrics.glyph = {
      samples: fx.samples?.length ?? 0,
      cell: fx.cell,
      digits: Object.keys(fx.glyphs ?? {}).length,
      perGlyph: Object.fromEntries(Object.entries(fx.glyphs ?? {}).map(([k, v]) => [k, v.length])),
      loto: { total: loto.total, correct: loto.correct, wrong: loto.wrong, ambiguous: loto.ambiguous, rate: loto.rate, confusions: loto.confusions },
      validateAtlas: { ok: val.ok, problems: val.problems, self: { correct: val.self?.correct, ambiguous: val.self?.ambiguous, wrong: val.self?.wrong } },
      cellMatchesDefaults: fx.cell?.w === G.GLYPH_DEFAULTS.cell.w && fx.cell?.h === G.GLYPH_DEFAULTS.cell.h,
    };
    log(`\n[glyph] 1回抜き（leaveOneTeachingOut）: 正 ${loto.correct} / 曖昧 ${loto.ambiguous} / 誤 ${loto.wrong}（計 ${loto.total}・rate ${loto.rate}）`);
    log(`        validateAtlas: ${val.ok ? '✅ ok' : '❌ ' + JSON.stringify(val.problems)} ／ cell ${JSON.stringify(fx.cell)}${metrics.glyph.cellMatchesDefaults ? '（GLYPH_DEFAULTS と一致）' : ' ⚠ GLYPH_DEFAULTS と不一致'}`);
    if (Object.keys(loto.confusions ?? {}).length) log(`        混同: ${Object.entries(loto.confusions).map(([k, v]) => `${k}×${v}`).join(' ')}`);
    if (!val.ok) addIssue({ area: 'glyph', message: 'validateAtlas が落ちた', cause: JSON.stringify(val.problems),
      fix: '`tools/t1_teach_probe.mjs` の関門（囲みの比・cell 寸法）を読む。緩い囲みの個体は**教え直し**が要る（囲みは測定そのもの＝PHASE9_PLAN §4.3.0e）。' });
    if (!metrics.glyph.cellMatchesDefaults) addIssue({ area: 'glyph', message: 'フィクスチャの cell が GLYPH_DEFAULTS と一致しない',
      cause: `fixture ${JSON.stringify(fx.cell)} vs defaults ${JSON.stringify(G.GLYPH_DEFAULTS.cell)}`,
      fix: 'cell を変えたなら**フィクスチャを作り直す**（世代の古いアトラスはそのまま使わない＝HANDOFF の注記どおり）。' });
  } catch (e) {
    addIssue({ area: 'glyph', message: 'glyph.js の実行で例外', cause: `${e.message}\n${String(e.stack).split('\n').slice(1, 4).join('\n')}`,
      fix: '例外の発生行を起点に、`leaveOneTeachingOut` / `validateAtlas` のシグネチャ変更とフィクスチャ形式の齟齬を疑う。' });
  }
}

// ══ 3. 領域検出（hp_bar）の精度 ═════════════════════════════════
if (hpR.ok) {
  try {
    const H = await import('../../src/transcribe/hp_bar.js');
    const expand = (p) => { const out = []; for (const [v, n] of p.runs) for (let i = 0; i < n; i++) out.push(v); return out; };
    const rows = [];
    for (const [key, p] of Object.entries(hpR.json.profiles ?? {})) {
      const prof = expand(p);
      const lengthOk = prof.length === p.length;
      const r = H.readFillRatio(prof);
      const visibleOk = r.visible === p.expect.visible;
      const ratioDelta = p.expect.visible && typeof r.fillRatio === 'number' ? Math.abs(r.fillRatio - p.expect.fillRatio) : null;
      const causeOk = p.expect.visible ? true : (r.fillRatio === null && r.cause === p.expect.cause);
      rows.push({ key, label: p.label, lengthOk, visibleOk, causeOk, ratioDelta, got: r.fillRatio, expect: p.expect.fillRatio ?? null, cause: r.cause ?? null });
    }
    const bad = rows.filter((r) => !r.lengthOk || !r.visibleOk || !r.causeOk || (r.ratioDelta !== null && r.ratioDelta >= 0.005));
    metrics.hp = { profiles: rows.length, ok: rows.length - bad.length, maxRatioDelta: Math.max(0, ...rows.map((r) => r.ratioDelta ?? 0)), rows };
    log(`\n[hp_bar] 実走プロファイル ${rows.length} 本中 ${rows.length - bad.length} 本一致（最大 塗り率差 ${metrics.hp.maxRatioDelta.toFixed(4)}）`);
    for (const r of rows) log(`        ${bad.includes(r) ? '❌' : '✅'} [${r.key}] visible ${r.visibleOk ? 'ok' : 'NG'} / 塗り率 ${r.got === null ? 'null' : Number(r.got).toFixed(4)}（期待 ${r.expect ?? '—'}）`);
    for (const r of bad) addIssue({ area: 'hp_bar', message: `実走プロファイル [${r.key}]（${r.label}）が期待と違う`,
      cause: `length ${r.lengthOk ? 'ok' : 'NG'} / visible ${r.visibleOk ? 'ok' : 'NG'} / cause=${r.cause} / 塗り率 ${r.got} vs ${r.expect}`,
      fix: '`src/transcribe/hp_bar.js` の階段フィット（`fitStepEdge`）と拒否条件（`flash`/`noEmptyRegion`）を疑う。★これは合成では再現できなかった型（孤立列・演出による ROI 汚染）＝**閾値を緩めて通すのは退行**。' });
  } catch (e) {
    addIssue({ area: 'hp_bar', message: 'hp_bar.js の実行で例外', cause: `${e.message}`, fix: '例外行を起点に `readFillRatio` のシグネチャ変更を疑う。' });
  }
}

// ══ 4. ROI（9枠）の存在 ═════════════════════════════════════════
try {
  const R = await import('../../src/transcribe/rois.js');
  const need = ['hp', 'hpbar', 'modebar', 'ct', 'debuff', 'dmg', 'abil', 'turn', 'gauge'];
  const have = Object.keys(R.ROIS ?? {});
  const missing = need.filter((k) => !have.includes(k));
  metrics.rois = { have, missing };
  log(`\n[rois] 採寸済み枠 ${have.length} / 必要 ${need.length}${missing.length ? ` ❌ 欠落: ${missing.join(',')}` : ' ✅'}`);
  if (missing.length) addIssue({ area: 'rois', message: `ROI が欠落: ${missing.join(', ')}`, cause: `ROIS のキー = ${have.join(',')}`,
    fix: '`src/transcribe/rois.js` の `ROIS` に採寸値を戻す。9枠は P2 の出口条件（HANDOFF「P2 で取れるようになったもの」）。' });
} catch (e) {
  addIssue({ area: 'rois', message: 'rois.js の読み込みで例外', cause: e.message, fix: 'import 解決とエクスポート名を確認する。' });
}

// ══ 5. セルフテスト（検査名ごとの合否）═══════════════════════════
let selftest = null;
if (!opt['skip-selftest']) {
  const r = runNode(['tools/t1_selftest.mjs'], { timeout: 180_000 });
  const checks = {};
  for (const line of r.stdout.split('\n')) {
    const m = /^\s*(✅|❌)\s(.+)$/.exec(line);
    if (m) checks[m[2].split(' — ')[0].trim()] = m[1] === '✅' ? 'pass' : 'fail';
  }
  const tail = /結果:\s*(\d+)\s*passed\s*\/\s*(\d+)\s*failed/.exec(r.stdout);
  selftest = { code: r.code, ms: r.ms, pass: tail ? Number(tail[1]) : null, fail: tail ? Number(tail[2]) : null, checks };
  log(`\n[selftest] ${selftest.pass} passed / ${selftest.fail} failed（${(r.ms / 1000).toFixed(1)}s・exit ${r.code}）`);
  if (r.code !== 0) {
    const selftestSrc = readText('tools/t1_selftest.mjs').split('\n');
    for (const [name, v] of Object.entries(checks)) {
      if (v !== 'fail') continue;
      const at = selftestSrc.findIndex((l) => l.includes(name.slice(0, 24)));
      addIssue({ area: 'selftest', message: `検査が失敗: ${name}`,
        cause: `tools/t1_selftest.mjs${at >= 0 ? `:${at + 1}` : ''}${t1Touched.length ? ` ／ 本差分で触った T1 モジュール: ${t1Touched.join(', ')}` : ''}`,
        fix: '検査名が示す**性質**（スクロール/ズーム不変性・階段フィット・関門）を壊していないか差分を見る。閾値は締める方向にだけ動かす。' });
    }
  }
}

// ══ 6. ベースライン比較 ═════════════════════════════════════════
const current = { at: stamp(), metrics, selftest: selftest ? { pass: selftest.pass, fail: selftest.fail, checks: selftest.checks } : null };
const base = exists(BASELINE) ? readJson(BASELINE) : null;

if (!base) {
  log(`\n⚠ ベースラインが無い（${BASELINE}）。--update-baseline で現在値を初期ベースラインとして保存できる。`);
} else {
  banner('ベースライン差分', `基準 ${base.at}`);
  const b = base.metrics ?? {};
  const g0 = b.glyph?.loto, g1 = metrics.glyph?.loto;
  if (g0 && g1) {
    const d = (k) => (g1[k] ?? 0) - (g0[k] ?? 0);
    log(`[glyph] 正 ${g0.correct}→${g1.correct}（${d('correct') >= 0 ? '+' : ''}${d('correct')}） 誤 ${g0.wrong}→${g1.wrong}（${d('wrong') >= 0 ? '+' : ''}${d('wrong')}） 曖昧 ${g0.ambiguous}→${g1.ambiguous}（${d('ambiguous') >= 0 ? '+' : ''}${d('ambiguous')}） 標本 ${g0.total}→${g1.total}`);
    if (d('wrong') > 0) addIssue({ area: 'glyph', message: `誤読が増えた（${g0.wrong} → ${g1.wrong}）`, cause: `混同 ${JSON.stringify(g1.confusions)}${t1Touched.length ? ` ／ 触った T1 モジュール: ${t1Touched.join(', ')}` : ''}`,
      fix: '照合パラメータ（ずらし許容・正規化）を戻して二分する。混同の対（`3`/`5` 等）が偏るなら**その字の教え直し**が本筋で、閾値を緩めるのは退行。' });
    if (d('correct') < 0) addIssue({ area: 'glyph', message: `正読が減った（${g0.correct} → ${g1.correct}）`, cause: `曖昧 ${g0.ambiguous}→${g1.ambiguous}`,
      fix: '「曖昧に逃がして誤りを減らす」退化になっていないか見る（誤読が減っていても正読が減れば自動化率は落ちる）。' });
    if (g1.total !== g0.total) addIssue({ area: 'glyph', severity: 'warn', message: `標本数が変わった（${g0.total} → ${g1.total}）`, cause: 'フィクスチャの作り直し？',
      fix: '意図した作り直しなら `--update-baseline` でベースラインを更新し、`tools/t1_selftest.mjs` [16-15] の関門も実測へ**締め直す**。' });
  }
  const h0 = b.hp, h1 = metrics.hp;
  if (h0 && h1 && h1.ok < h0.ok) addIssue({ area: 'hp_bar', message: `HP プロファイルの一致数が減った（${h0.ok}/${h0.profiles} → ${h1.ok}/${h1.profiles}）`, cause: `最大 塗り率差 ${h0.maxRatioDelta} → ${h1.maxRatioDelta}`, fix: '§3 の失敗行を参照。' });

  if (base.selftest?.checks && selftest?.checks) {
    const b0 = base.selftest.checks, c1 = selftest.checks;
    const newlyFailing = Object.keys(b0).filter((k) => b0[k] === 'pass' && c1[k] === 'fail');
    const vanished = Object.keys(b0).filter((k) => !(k in c1));
    const added = Object.keys(c1).filter((k) => !(k in b0));
    log(`[selftest] ${base.selftest.pass}→${selftest.pass} passed ／ 新規失敗 ${newlyFailing.length} ／ 消滅 ${vanished.length} ／ 追加 ${added.length}`);
    for (const k of newlyFailing) log(`   ❌ ${k}`);
    for (const k of vanished.slice(0, 10)) log(`   ⚠ 消滅: ${k}`);
    if (vanished.length) addIssue({ area: 'selftest', severity: 'warn', message: `ベースラインにあった検査が ${vanished.length} 件消えている`,
      cause: vanished.slice(0, 5).join(' / '), fix: '検査の削除は**回帰の穴**になる。意図した整理なら `--update-baseline` でベースラインを更新し、理由を tools/README.md §4 に残す。' });
  }
}

// ══ 7. 出力 ═════════════════════════════════════════════════════
const regressions = issues.filter((i) => i.severity === 'regression');
banner('結果', `退行 ${regressions.length} 件 ／ 警告 ${issues.length - regressions.length} 件`);
for (const i of issues) {
  log(`\n${i.severity === 'regression' ? '❌ 退行' : '⚠ 警告'}  [${i.area}] ${i.message}`);
  log(`   原因箇所: ${i.cause}`);
  log(`   対処: ${i.fix}`);
}
if (!issues.length) log('\n✅ 精度低下・パースエラーなし。');

const out = opt.json || `${REPORT_DIR}/transcribe_${fileStamp()}.json`;
writeJson(out, { tool: 'verify-transcribe-pipeline', ...current, changed: t1Touched, issues, baselineAt: base?.at ?? null });
log(`\nレポート: ${rel(out)}`);

if (opt['update-baseline']) {
  if (regressions.length && !opt.force) {
    log('\n⚠ 退行がある状態ではベースラインを更新しない（--force で強制）。**退行を焼き付けない**ための安全弁。');
    process.exit(1);
  }
  writeJson(BASELINE, current);
  log(`\n✅ ベースラインを更新: ${BASELINE}`);
}
process.exit(regressions.length ? 1 : 0);
