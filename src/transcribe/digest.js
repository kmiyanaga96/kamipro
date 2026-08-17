// T1 録画転記 — 診断の「貼る用サマリ」（digest）
//
// ★なぜ要るか（ユーザー指摘 2026-08-17）:
//   走査の診断 JSON は**セッションに貼ると数千トークン**になる（プロファイル120値・帯8本・
//   keptSample 60件…）。しかし**判断に要るのは毎回そのうちほんの一部**で、
//   残りは「あとで見返すための記録」でしかない。
//
// ∴ 出力を2本に分ける:
//   ①**完全な診断 JSON** … ファイルへ落とす（provenance・後から掘れる）
//   ②**digest（本モジュール）** … **貼る用**。意思決定に要る数値だけを数十行に畳む
//
// ★設計の原則（本 Phase で積み上げた規律をそのまま適用）:
//   - **診断（WARN/ERROR）は必ず全部載せる**＝畳んでよいのは「生データの本体」だけ。
//     ⚠ 何が起きたかを落として要約すると、**測定系の欠陥を見落とす**（v0.7.0 の 1/3 間引き事故の型）。
//   - **プロファイルは「形」だけ残す**＝120個の数値ではなく、**山の位置と高さ**に畳む。
//     ⚠ ただし**畳んだ結果で判断がつかなくなったら、完全版をファイルから見る**と明記する。
//   - **数値を勝手に丸めない**（判断に効く桁は落とさない）。
//
// 純関数（DOM 非依存）＝Node でセルフテストできる。

/** 配列の上位ピークを「位置:高さ」で拾う（プロファイルの形だけ残す）。 */
function peaks(profile, topN = 8) {
  if (!Array.isArray(profile) || profile.length < 3) return [];
  const out = [];
  for (let i = 1; i < profile.length - 1; i++) {
    if (profile[i] > profile[i - 1] && profile[i] >= profile[i + 1]) out.push([i, profile[i]]);
  }
  return out.sort((a, b) => b[1] - a[1]).slice(0, topN).sort((a, b) => a[0] - b[0]);
}

const f = (v, d = 3) => (typeof v === 'number' ? +v.toFixed(d) : v);

/**
 * ★診断 JSON を「貼る用」の短いテキストへ畳む。
 *
 * @param {object} diag `Diag.emit()` の出力
 * @returns {string}
 */
export function digest(diag) {
  if (!diag) return '(診断なし)';
  const r = diag.result ?? {};
  const L = [];
  const add = (s) => L.push(s);

  add(`# T1 v${diag.version} digest  (${diag.ranAt})`);
  add(`入力: ${diag.input?.file ?? '?'} ${diag.input?.resolution ?? ''} `
    + `/ 走査 ${f(diag.input?.scannedSeconds, 1)}秒 / 実時間 ${f(diag.input?.wallClockSeconds, 0)}秒`);
  add(diag.line ?? '');

  // ── ①診断は全部載せる（畳まない）────────────────────────
  add('');
  add(`## 診断 ${JSON.stringify(diag.summary ?? {})}`);
  for (const d of diag.diagnostics ?? []) {
    add(`- [${d.sev}] ${d.code}: ${d.got ?? ''}`);
  }

  // ── ②走査の健全性 ───────────────────────────────────────
  if (r.sampling) {
    add('');
    add(`## 走査  ${r.sampling.frames}フレーム / 実効 ${f(r.sampling.sampledFps, 2)}fps`);
    if (r.dedup) {
      add(`完全重複 ${r.dedup.droppedDuplicates} 枚（${f(r.dedup.droppedDuplicates / r.sampling.frames * 100, 1)}%）`);
    }
  }

  // ── ③HP（P2-5）───────────────────────────────────────────
  if (r.hp) {
    add('');
    add(`## HP  ${f(r.hp.firstRatio, 4)} → ${f(r.hp.lastRatio, 4)}  `
      + `違反 ${r.hp.violations} / 読めた ${r.hp.frames}`);
    if (r.hp.skipCauses) add(`読めず: ${JSON.stringify(r.hp.skipCauses)}`);
    for (const v of (r.hp.violationSample ?? []).slice(0, 6)) {
      add(`  違反 t=${v.t}  ${v.from} → ${v.to}`);
    }
  }

  // ── ④CT ドット（P2-5b）★いまの主戦場 ────────────────────
  if (r.ctGeometry) {
    const g = r.ctGeometry;
    add('');
    add(`## CT  found=${g.found} decor=${g.decor ?? '-'} `
      + `bestPeriod=${JSON.stringify(g.bestPeriod ?? null)}`);
    if (g.reason) add(`  理由: ${g.reason}`);
    if (Array.isArray(g.bandScan)) {
      add('  帯ごとの探索（band / 最良周期 / score / 装飾か）:');
      for (const b of g.bandScan) {
        add(`   ${JSON.stringify(b.band)} `
          + `${b.best ? `P=${b.best.period} score=${f(b.best.score)} x=${b.best.from}〜${b.best.to}` : '(なし)'} `
          + `${b.decor ? 'decor' : ''}`);
        const pk = peaks(b.profile, 8);
        if (pk.length) add(`      山: ${pk.map(([i, v]) => `${i}:${f(v, 1)}`).join(' ')}`);
      }
    }
    if (r.ctSeries) {
      add(`  系列: 変化 ${r.ctSeries.prefixChanges} 回 `
        + `(${f(r.ctSeries.prefixChangesPerSecond, 3)}/秒) 分布 ${JSON.stringify(r.ctSeries.prefixHistogram ?? {})}`);
    }
  }

  // ── ⑤モード遷移（除振）──────────────────────────────────
  if (r.panelSeries) {
    const p = r.panelSeries;
    add('');
    add(`## モード遷移  生 ${p.rawTransitions} → 除振後 ${p.stableTransitions}（落とした ${p.debounced}）`);
    add(`  ${(p.transitions ?? []).map(t => `${t.t}${t.to === 'detail' ? '→D' : '→L'}`).join(' ')}`);
  }

  // ── ⑥持続性（P2-4 の記録）──────────────────────────────
  if (r.lagProfile) {
    const g = r.lagProfile;
    add('');
    add(`## 持続性  eventContrast=${f(g.eventContrast)} lifetimeFrames=${g.lifetimeFrames}`);
    add(`  freezeRuns p50: ${(g.freezeRuns ?? []).map(x => `${x.label}(J${x.j})=${x.p50}`).join(' ')}`);
    add(`  cellDeltas: ${JSON.stringify(g.cellDeltas ?? {})}`);
  }

  add('');
  add('⚠ これは digest（貼る用）。**プロファイルは山の位置だけに畳んである**。');
  add('  判断がつかないときは、ダウンロードした完全な診断 JSON を見ること。');
  return L.join('\n');
}
