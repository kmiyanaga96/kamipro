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
  // ★★捨てたフレームの中身（2026-08-18）＝「読めなかった」は最も情報量の多い出来事。
  if (Array.isArray(r.hpSkipSamples) && r.hpSkipSamples.length) {
    add('  捨てたフレームの中身（原因 / peak / 赤の割合 / 帯 / 山）:');
    for (const s of r.hpSkipSamples) {
      add(`    t=${f(s.t, 1)} ${s.cause} peak=${f(s.peak)} red=${f(s.redFraction)} `
        + `帯=${JSON.stringify(s.bands)} ${peaks(s.colProfile, 5).map(([i, v]) => `${i}:${f(v, 2)}`).join(' ')}`);
    }
  }


  // ── ④CT ドット（P2-5b）★いまの主戦場 ────────────────────
  if (r.ctGeometry) {
    const g = r.ctGeometry;
    add('');
    add(`## CT  roi=${g.roi ?? '?'} found=${g.found} decor=${g.decor ?? '-'} `
      + `bestPeriod=${JSON.stringify(g.bestPeriod ?? null)}`);
    if (g.reason) add(`  理由: ${g.reason}`);
    // ★★どの数字を信じるかを毎回書く（2026-08-18）。
    //   ⚠ `found`/`bestPeriod` は**広い ROI を探索する**ために作った経路で、
    //     162px 級の専用 ROI では合成でも score 0.15〜0.38 と floor 0.35 をまたぎ、
    //     周期を**真値の約半分**（ドットの縁）に取ることがある＝**この行だけで判断しない**。
    add('  ⚠ 専用 ROI では found/bestPeriod は当てにしない（|高域通過|は縁に山が立つ）。'
      + '★下の「生の輝度」と「時間σ」を読む');
    // ★探索範囲そのものを毎回出す（2026-08-18）。
    //   ⚠ v0.18.0 は**探せる周期の上限が 43px に潰れていた**のに、digest からはそれが見えず、
    //     「どの帯も低い＝CT は ROI の外」という**誤った結論に進みかけた**。
    //   ★**測定器が何を見られるのかを、測定結果と同じ画面に出す**（見えない範囲の「無し」は無意味）。
    if (g.searchRange) add(`  探索できる周期: ${g.searchRange.min}〜${g.searchRange.max}px（ROI 幅 ${g.searchRange.width}px）`);
    // ★★帯ごとの探索は**1行に畳む**（2026-08-18f）。
    //   ⚠ これは「CT が ROI の縦のどこにあるか**探す**」ための出力だったが、
    //     2026-08-18 に**要素ごとに人が採寸する方式へ変えた**ので役目を終えた。
    //     ⭐ **役目を終えた出力を出し続けるのは、判断に効く行を埋もれさせる**（digest の趣旨に反する）。
    //   ⚠ 生データは完全 JSON の `bandScan` に全部残る（捨ててはいない）。
    if (Array.isArray(g.bandScan) && g.bandScan.length) {
      const best = g.bandScan.reduce((a, b) => (!a?.best || (b.best?.score ?? -9) > a.best.score ? b : a), null);
      add(`  帯ごとの探索（採寸方式へ移行したため要約のみ・詳細は完全JSON の bandScan）: `
        + `${g.bandScan.length}帯 / 最良 ${JSON.stringify(best?.band)} `
        + `P=${best?.best?.period} score=${f(best?.best?.score)}`);
    }
    // ★★要素の正体を決める生データ（2026-08-18）。
    //   ⚠ `meanProfile`（|高域通過|）は**山がドットの縁に立つ**ので、離散/連続の判別に使えない。
    // ★★**この2本だけは全値を出す**（2026-08-18b）。
    //   ⚠ 通常「プロファイルは山の位置に畳む」が原則だが、**今まさに判断に効いているのがこの配列**＝
    //     上位10山に畳んだ結果、「枠は 7 か、暗い山はノイズか」が**決められなかった**
    //     （格子外の bin 108/110 が残った）。★**判断に効く桁は落とさない**（本モジュールの原則）。
    //   ⚠ 輝度は 0〜255 なので**整数で足りる**（120値で約 400 字＝digest 全体の 1〜2割）。
    //   ⏳ CT が確定したら山の位置に畳み直してよい。
    // ★★山は「局所最大か」ではなく「どれだけ高いか」で数える（2026-08-18c）。
    //   ⚠ 上位N山の抽出は**平坦な背景の ±1 のノイズを山と数える**＝実際に枠を 7 と誤読した。
    if (g.humps) {
      add(`  ★山（振幅の中点でしきい・重心）: ${g.humps.count}個 `
        + `間隔=${f(g.humps.spacing)} cv=${f(g.humps.cv, 4)} `
        + `水準 ${g.humps.level?.min}〜${g.humps.level?.max} 中点 ${g.humps.level?.mid} / `
        + `位置 ${(g.humps.centers ?? []).join(', ')}`);
    }
    // ★★色＝輝度で点灯を説明できなかったので、次に見るのはここ（2026-08-18e）
    if (Array.isArray(g.humpColors) && g.humpColors.length) {
      add('  ★★山ごとの色（R/G/B と R−B）＝灰色なら R≈G≈B で R−B≈0:');
      for (const h of g.humpColors) {
        add(`    中心 ${h.center}: R${h.r} G${h.g} B${h.b}  R−B=${h.chroma}`);
      }
    }
    if (Array.isArray(g.chroma)) {
      add(`  ★色み（R−B）・全${g.chroma.length}値: ${g.chroma.map((v) => Math.round(v)).join(',')}`);
    }
    // ★★点灯がいつ起きたか＝CT の値そのもの（ユーザー確定＝CT はターン1回につき1つ蓄積）
    if (Array.isArray(g.humpChroma) && g.humpChroma.length) {
      add('  ★★山ごとの色みの分布（p05/p25/p50/p75/p95）＝二峰なら「色＝点灯」:');
      for (const h of g.humpChroma) {
        if (h) add(`    中心 ${h.center}: ${h.p05}/${h.p25}/${h.p50}/${h.p75}/${h.p95}`);
      }
      const bs = g.humpChroma.find(Boolean)?.bucketSeconds;
      add(`  ★★山ごとの色みの時系列（${bs}秒ごと・立ち上がりの時刻が読める）:`);
      for (const h of g.humpChroma) {
        if (h) add(`    中心 ${h.center}: ${h.series.map((v) => (v == null ? '_' : v)).join(',')}`);
      }
    }
    // ★★色づいた区間＝**CT の値そのもの**（3秒バケットでは短い点灯が薄まって消えた）
    if (Array.isArray(g.litIntervals) && g.litIntervals.length) {
      const lv = g.chromaSplitLevels;
      add(`  ★★色づいた区間（★**画面全体の色を差し引いた後**の値`
        + `${lv?.commonModeRemoved ? `・谷 ${JSON.stringify(lv.troughs)} を参照` : '・⚠差し引き不可'}`
        + `／切れ目 ${g.chromaSplit}＝大津法1段・bg=差し引いた画面全体の色・coin=同時に超えた山の本数）:`);
      g.litIntervals.forEach((h, i) => {
        const head = `    ${i + 1}個目（中心 ${g.humps?.centers?.[i]}）: ${h.count}区間 計 ${h.totalSeconds}秒`;
        if (!h.runs.length) { add(head); return; }
        add(head + ' — ' + h.runs.map((r) =>
          `[${r.from}〜${r.to}s ${r.seconds}s 平均${r.mean} 最大${r.max} bg${r.bg} coin${r.coincident}]`).join(' '));
      });
    }
    // ⚠ 輝度の分布は**点灯を説明しないと確定した**ので1行に畳む（生値は完全JSON）。
    if (Array.isArray(g.humpSeries) && g.humpSeries.length) {
      add(`  （参考）山ごとの輝度 p50: ${g.humpSeries.map((h) => h && h.p50).join(' / ')}`
        + ' ＝ほぼ同じ＝**輝度は点灯を表していない**（2026-08-18 に確定）');
    }
    if (Array.isArray(g.rawProfile)) {
      add(`  生の輝度・全${g.rawProfile.length}値: ${g.rawProfile.map((v) => Math.round(v)).join(',')}`);
    }
    if (Array.isArray(g.sigmaProfile)) {
      const pk = peaks(g.sigmaProfile, 10);
      const mx = Math.max(...g.sigmaProfile);
      add(`  ★時間σ（走の間に変化した列＝点灯の仕組みを仮定しない位置特定・最大 ${f(mx, 1)}）: `
        + pk.map(([i, v]) => `${i}:${f(v, 1)}`).join(' '));
      add(`  時間σ・全${g.sigmaProfile.length}値: ${g.sigmaProfile.map((v) => Math.round(v)).join(',')}`);
    }
    if (Array.isArray(g.sampleProfiles)) {
      add('  生プロファイルの標本（時刻 / 山の位置:高さ）:');
      for (const s of g.sampleProfiles) {
        add(`    t=${f(s.t, 1)}  ${peaks(s.profile, 8).map(([i, v]) => `${i}:${f(v, 0)}`).join(' ')}`);
      }
    }
    if (r.ctSeries) {
      add(`  系列: 変化 ${r.ctSeries.prefixChanges} 回 `
        + `(${f(r.ctSeries.prefixChangesPerSecond, 3)}/秒) 分布 ${JSON.stringify(r.ctSeries.prefixHistogram ?? {})}`);
    }
  }

  // ── ④' モードゲージ（未モデル化メカニクス＝C45 の観測経路その2）────────
  if (r.modeGeometry) {
    const g = r.modeGeometry;
    add('');
    add(`## モードゲージ  roi=${g.roi ?? 'modebar'}`);
    if (g.humps) {
      add(`  ★山: ${g.humps.count}個 間隔=${f(g.humps.spacing)} cv=${f(g.humps.cv, 4)} `
        + `水準 ${g.humps.level?.min}〜${g.humps.level?.max} / 位置 ${(g.humps.centers ?? []).join(', ')}`);
    }
    if (Array.isArray(g.rawProfile)) {
      add(`  生の輝度・全${g.rawProfile.length}値: ${g.rawProfile.map((v) => Math.round(v)).join(',')}`);
    }
    if (Array.isArray(g.chroma)) {
      add(`  ★色み（R−B）・全${g.chroma.length}値: ${g.chroma.map((v) => Math.round(v)).join(',')}`);
    }
    // ★★モードゲージは**与ダメージで蓄積**（ユーザー確定）＝塗り境界の時系列がその観測値
    if (g.fillSeries) {
      const s = g.fillSeries;
      add(`  ★★塗り率（色みの階段フィット・${s.frames}フレーム）: `
        + `p05 ${s.fill.p05} / p25 ${s.fill.p25} / p50 ${s.fill.p50} / p75 ${s.fill.p75} / p95 ${s.fill.p95}`);
      add(`     段差の大きさ: p05 ${s.step.p05} / p50 ${s.step.p50} / p95 ${s.step.p95}`
        + '（⚠小さいフレームは境界が無い＝塗り率を信じない）');
      add(`  ★塗り率の時系列（${s.bucketSeconds}秒ごと）: ${s.series.map((v) => (v == null ? '_' : v)).join(',')}`);
    }
  }

  // ── ④'' グリフ採取（P3-1）★いまの主戦場 ────────────────────
  if (r.glyphStats) {
    const g = r.glyphStats;
    add('');
    add(`## グリフ採取  走査 ${g.frames} / 行が見つかった ${g.framesWithRows} フレーム`
      + ` / 行 ${g.rows} / グリフ ${g.glyphs}（採取 ${g.pushed}）`);
    // ★★**どちらの経路で割ったか**を必ず出す。`runs`（退避路）が多いなら
    //   格子が合っていない＝送り幅の前提か ROI か閾値のどれかが実物と違う。
    add(`  割り方: ${JSON.stringify(g.methods)}  ⚠ runs が多いなら格子が合っていない`);
    const q = (o) => (o ? `n=${o.n} min=${o.min} p10=${o.p10} p50=${o.p50} p90=${o.p90} max=${o.max}` : '—');
    add(`  行の高さ: ${q(g.rowHeights)}`);
    add(`  送り幅  : ${q(g.pitches)}   ★固定フォントなら p10〜p90 が狭いはず`);
    add(`  格子の合致度: ${q(g.contrasts)}  ★低いと切り出しが信用できない`);
    for (const sm of g.samples ?? []) {
      add(`  例 t=${sm.t} 行 ${sm.row.from}〜${sm.row.to} ${sm.method} pitch=${sm.pitch} `
        + `contrast=${sm.contrast} 文字数=${sm.count}`);
      add(`     列プロファイルの山: ${peaks(sm.colProfile, 12).map(([i, v]) => `${i}:${v}`).join(' ')}`);
    }
  }
  if (r.glyphs) {
    add(`  代表 ${r.glyphs.representatives?.length ?? 0} 個 / クラスタ ${r.glyphs.clusters}`
      + `（あふれ ${r.glyphs.overflow}）  出現回数上位: `
      + (r.glyphs.representatives ?? []).slice(0, 20).map((x) => x.count).join(','));
    // ★★「文字か背景の模様か」の切り分け材料（**まだ篩には使っていない**＝実データを見てから決める）
    add('  代表ごと（出現回数 / 行の格子の合致度 / 箱の位置のばらつき px / 箱の実寸）:');
    for (const x of (r.glyphs.representatives ?? []).slice(0, 24)) {
      add(`    #${x.index} ×${x.count} contrast=${x.contrast ?? '-'} `
        + `spread=${x.spread ? `${x.spread.x},${x.spread.y}` : '-'} `
        + `box=${x.box ? `${x.box.w}×${x.box.h}` : '-'} t=${(x.times ?? []).slice(0, 3).join('/')}`);
    }
    add('  ⚠ 形そのものは digest には載せない（画面のシートを見てラベルを付ける＝人の仕事）');
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
