// T1 録画転記 — グリフ（数字・ラベル）の切り出しと照合（Phase 9 P3-1）
//
// ★本モジュールが答える問い: 「**このフレームの `dmg` ROI に、どの文字が、どこに出ているか**」。
//   値の意味づけ（どの成分か・どの押下か）は P3-2 以降の仕事で、ここでは扱わない。
//
// ─────────────────────────────────────────────────────────────
// ★設計を縛っている実物の事実（すべてユーザー確認済＝推測ではない）
// ─────────────────────────────────────────────────────────────
//  ① **ラベル（`CRITICAL!` 等）は1つ上のヒットの数値にも重なる**（P1 発見①）
//     → ラベルを**先に検出してマスク**してから数字を読む。順序が逆だと汚染された画素で照合する。
//  ② **キラキラ（4条星）が数字に重なる**（P1 発見⑫）→ **遮蔽に強い照合**が要る。
//  ③ 重なりは**半透明合成**＝両方が部分的に残る → 「消えた」ではなく「薄まった」として扱う。
//  ④ **数字は固定ビットマップフォントだが塗りは一定でない**（金グラデ）
//     → **塗りの明るさで照合してはいけない**。**縁取り（エッジ）**で照合する。
//  ⑤ ダメージ数値は「わずかにフェード・**位置は基本的に不動**」（ユーザー確定 2026-08-15）
//     → 位置アンカーが成立する。ただし**画素の凍結では同一判定できない**（②が動かし続ける）。
//  ⑥ ⚠ **金色画素の割合ではポップアップの有無を分けられない**（P2-2 v2 が実走で棄却済＝
//     しきい値格子9通りすべて単峰・Fisher 分離 1.57〜1.95）。**バースト演出そのものが金色**だから。
//     ∴ 本モジュールは色を一切使わない。**数字の形（縁取りの構造）だけが数字を切り出す**。
//
// ─────────────────────────────────────────────────────────────
// ★「テンプレートをどこから得るか」＝本モジュールの中心的な設計判断
// ─────────────────────────────────────────────────────────────
//   フォントは**実機のもの**なので、テンプレートは**実機の録画からしか得られない**。
//   ⚠ Claude が形を推測して書いたテンプレートは、**合成テストだけが通って実機で静かに外す**
//     （Phase 9 で3回踏んだ「測定器の性質を観測対象の性質と取り違える」型）。
//   ∴ 段取りを **採取 → ラベル付け → 照合** の3つに割る:
//     1. **採取**（🔧 ツール）: 走から**グリフらしい塊**を集め、似た形どうしをまとめる（`GlyphHarvest`）。
//        ★ここで「0〜9 のどれか」は決めない＝**形の分類までが機械の仕事**。
//     2. **ラベル付け**（👤 ユーザー）: 代表画像を見て「これは 7」と**1回だけ**答える。
//        ★憲法どおり＝**観測と判断はユーザー**。1分で終わることを機械に当てさせない
//        （`rois.js` の採寸で確立した規律と同型）。
//     3. **照合**（🔧 ツール）: 以後は登録済みアトラスとの照合＝**二度と人に訊かない**。
//   ⚠ **アトラスが空のうちは読み取りを試みない**（`T1-MATCH-006`）。
//     推測テンプレで動かすと「読めている」ように見えて全部間違う、が起こりうる。
//
// 純関数（DOM 非依存）＝Node でセルフテストできる。依存なし（葉モジュール）。

/**
 * 既定値。⚠ **すべて合成フィクスチャ由来の未較正値**（E1＝測定条件を併記する）。
 * 実走のプロファイル分布を見てから決め直す。閾値を先に固定しないのが P2-2 の教訓。
 */
export const GLYPH_DEFAULTS = {
  /** 行/列の切り出し: 背景（中央値）を引いた残差の、最大値に対する割合 */
  rowThresholdFraction: 0.18,
  colThresholdFraction: 0.10,
  /**
   * ★背景の水準を採る分位点。**中央値ではない**。
   * ⚠ 中央値にしていて外した: 行帯の列プロファイルは**ほとんどが文字**なので、
   *   中央値が文字の上に乗り（実測 base 28.8・しきい 49.7）、**1文字が3つに割れた**。
   *   ★「背景」は**低位分位**で採る＝字間の谷がその水準を作る。
   */
  basePercentile: 0.10,
  /**
   * ★行の切り出しだけ**隙間を埋める**（px）。
   * ⚠ **文字行のプロファイルは台形ではなく凸凹**（字の横棒がある行だけ強い）＝
   *   割合でしきると**1行が数本に割れる**（実際に割れた）。∴ 低めにしきって**近い塊をつなぐ**。
   * ⚠ 列側も**1px 級の落ち込み**（字の内部に縦の空きがある位置）で割れるので少しだけ埋める。
   *   ★**割れるより併合するほうが安全**＝併合は送り幅で等分して戻せるが、
   *     1文字が3つに割れたら送り幅の推定そのものが壊れる（実際に median 幅が 2px になった）。
   */
  rowGapClose: 4,
  colGapClose: 2,
  /** 行と認めるための最小の高さ（px） */
  minRowHeight: 6,
  /** グリフと認めるための最小の幅（px） */
  minGlyphWidth: 2,
  /** 併合（重なりで2文字がくっついた）と見なす幅の倍率（★格子が使えないときの退避路） */
  mergeWidthFactor: 1.6,
  /**
   * ★送り幅（格子）の探索範囲＝**行の高さに対する比**。
   * 固定ビットマップフォントは字高と送り幅が比例するので、**測った行高から範囲が決まる**
   * （px の絶対値をハードコードしない＝録画解像度・ズームに依存しない）。
   */
  pitchMin: 0.35, pitchMax: 1.40, pitchStep: 0.25,
  /** 格子の合致度（セル中央と境界のエネルギー比）がこれ未満なら格子を信用しない */
  gridContrastFloor: 0.25,
  /** 署名の格子（テンプレートの解像度）。アトラスにも刻む */
  cell: { w: 12, h: 20 },
  /** 照合の異物ペナルティ係数 λ（score = cover − λ·alien） */
  lambda: 0.6,
  /** 1位と2位の差がこれ未満なら「曖昧」とする */
  ambiguityMargin: 0.08,
  /** これ未満の score は「一致なし（?）」にする＝**無理に読まない** */
  minScore: 0.35,
  /**
   * ★**1位と2位が拮抗したら読まない**（既定 true）。
   * ⚠⚠ **実測（2026-08-19・合成 3背景 × 3塗り × 10字 = 90 標本）**:
   *   - **誤読 9件は 9件とも `ambiguous`**（＝margin < 0.08）だった。
   *   - 一方 **score の絶対値では分けられない**（誤読 0.564〜0.632 ／ 正解 0.539〜0.999 と重なる）。
   *   ∴ **採否を決めるのは score ではなく「1位と2位の差」**。これを既定の policy にする。
   * ⚠ 代償＝**アトラスと条件が違うフレームでは読めないが増える**（正解のうち曖昧＝
   *   同条件 1/30・別背景 13/30）。★**間違って読むより読めないと言うほうが良い**（本 Phase の憲法）。
   */
  rejectAmbiguous: true,
  /**
   * 採取のクラスタリング閾値（soft Jaccard）。
   * ★★**「同じ字を1つにまとめる」ことは狙わない**（狙って外した）。
   * ⚠ 実測（合成 3背景 × 3塗り × 10字＝90標本・2026-08-19）:
   *   | 閾値 | クラスタ数 | **別の字が混ざったクラスタ** |
   *   |---|---|---|
   *   | 0.62 | 11 | **5**（最大4字が同居） |
   *   | 0.80 | 43 | 3 |
   *   | **0.85** | **53** | **0** |
   *   | 0.95 | 89 | 0 |
   *   ＝**同じ字を1つにまとめる閾値では、別の字も混ざる**（同字 min 0.42 < 異字 max 0.81）。
   * ★∴ 目標を**純度**へ置き換えた＝**1つのクラスタに2つの字を混ぜない**こと。
   *   1つの字が条件ごとに複数クラスタになるのは**正しい**＝それがそのまま `variants` になり、
   *   実測で**読める率が 54/90 → 88/90 に上がる**（誤りは両方ゼロ）。
   *   ⚠ 純度が崩れると**ユーザーが付けたラベルが間違ったテンプレートに付く**＝一番高い代償。
   */
  clusterSimilarity: 0.85,
  /** クラスタ数の上限（超えたら閾値が緩すぎる合図）。★条件ごとに増えるので余裕を持たせる */
  maxClusters: 400,
};

// ─────────────────────────────────────────────────────────────
// 1. 縁取り（エッジ）の場
// ─────────────────────────────────────────────────────────────

/**
 * ROI の輝度場を取り出す。
 * ⚠ 色は使わない（上の⑥＝演出そのものが金色）。
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {{w:number,h:number,lum:Float32Array}}
 */
export function luminanceField(img, rect) {
  const w = Math.max(0, Math.round(rect.w)), h = Math.max(0, Math.round(rect.h));
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.round(rect.y) + y;
    for (let x = 0; x < w; x++) {
      const sx = Math.round(rect.x) + x;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
      const k = (sy * img.width + sx) * 4;
      lum[y * w + x] = 0.299 * img.data[k] + 0.587 * img.data[k + 1] + 0.114 * img.data[k + 2];
    }
  }
  return { w, h, lum };
}

/**
 * 縁取りの強さ（勾配の大きさ）。
 *
 * ★**なぜ勾配か**＝上の④。塗りが金グラデで一定でないので**明るさそのものは使えない**が、
 *   「縁取り（濃い）と塗り（明るい）の境目」は**塗りが何色でも立つ**。
 * ★あわせて**背景の緩い明暗（宇宙背景・光エフェクト）は勾配が小さい**ので自然に落ちる。
 *   ⚠ ただし**強い演出のきらめきは勾配が立つ**＝ここでは落ちない。落とすのは形の照合の仕事。
 */
export function edgeField(field) {
  const { w, h, lum } = field;
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = Math.abs(lum[y * w + x + 1] - lum[y * w + x - 1]);
      const gy = Math.abs(lum[(y + 1) * w + x] - lum[(y - 1) * w + x]);
      mag[y * w + x] = (gx + gy) / 2;
    }
  }
  return { w, h, mag };
}

/** 分位点（配列を壊さない）。 */
export function quantile(arr, p) {
  if (!arr.length) return 0;
  const a = Float64Array.from(arr).sort();
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * a.length)))];
}

// ─────────────────────────────────────────────────────────────
// 2. 行・グリフの切り出し
// ─────────────────────────────────────────────────────────────

/**
 * 射影プロファイルから「盛り上がっている区間」を返す。
 *
 * ★**しきい方は「振幅の中点」ではなく「背景（中央値）を引いた残差の割合」**。
 *   ⚠ CT ドット（`charge_dots.rawHumps`）では中点で足りたが、ここでは足りない＝
 *     **明るい行が1つあると中点が持ち上がり、暗い行が丸ごと消える**（ポップアップは同じ強さで出ない）。
 *   ★参照点を**背景の水準**に置き直すのは、CT で効いた「共通モード除去」と同じ考え方
 *   （閾値の段を足すのではなく、**何を基準に測るかを変える**）。
 */
export function runsAbove(profile, fraction, minLength = 1, gapClose = 0, basePercentile = GLYPH_DEFAULTS.basePercentile) {
  const arr = Array.from(profile, Number);
  if (!arr.length) return { runs: [], base: 0, threshold: 0, peak: 0 };
  const base = quantile(arr, basePercentile);
  let peak = 0;
  for (const v of arr) peak = Math.max(peak, v - base);
  const threshold = base + fraction * peak;
  // ①しきいを超えた区間を拾う
  const spans = [];
  let from = -1;
  for (let i = 0; i <= arr.length; i++) {
    const above = i < arr.length && arr[i] >= threshold && peak > 0;
    if (above && from < 0) from = i;
    else if (!above && from >= 0) { spans.push([from, i]); from = -1; }
  }
  // ②近すぎる隙間を埋める（gapClose）
  const merged = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp[0] - last[1] <= gapClose) last[1] = sp[1];
    else merged.push([...sp]);
  }
  // ③長さで篩い、重心と山の高さを付ける
  const runs = [];
  for (const [a, b] of merged) {
    if (b - a < minLength) continue;
    let s = 0, ws = 0, mx = 0;
    for (let j = a; j < b; j++) { const v = Math.max(0, arr[j] - base); s += j * v; ws += v; mx = Math.max(mx, arr[j]); }
    runs.push({ from: a, to: b, center: ws > 0 ? s / ws : (a + b) / 2, peak: mx });
  }
  return { runs, base, threshold, peak };
}

/** 場を行方向へ射影する（各行のエッジ強度の合計）。 */
export function rowProfile(edge, band = null) {
  const { w, h, mag } = edge;
  const y0 = band ? Math.max(0, band.from) : 0, y1 = band ? Math.min(h, band.to) : h;
  const out = new Float64Array(Math.max(0, y1 - y0));
  for (let y = y0; y < y1; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) s += mag[y * w + x];
    out[y - y0] = s / (w || 1);
  }
  return out;
}

/** 場を列方向へ射影する（行帯の中だけ）。 */
export function colProfile(edge, row) {
  const { w, mag, h } = edge;
  const y0 = Math.max(0, row.from), y1 = Math.min(h, row.to);
  const out = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = y0; y < y1; y++) s += mag[y * w + x];
    out[x] = s / Math.max(1, y1 - y0);
  }
  return out;
}

/**
 * 数字行の候補を返す。⚠ **「数字である」ことはここでは判定しない**（形の照合が決める）。
 */
export function segmentRows(edge, opts = {}) {
  const o = { ...GLYPH_DEFAULTS, ...opts };
  const prof = rowProfile(edge);
  const { runs, base, threshold } = runsAbove(prof, o.rowThresholdFraction, o.minRowHeight, o.rowGapClose, o.basePercentile);
  return { rows: runs.map((r) => ({ from: r.from, to: r.to, height: r.to - r.from, peak: r.peak })),
           profile: prof, base, threshold };
}

/**
 * ★**等間隔の格子を当てて行をグリフへ割る**（固定ビットマップフォント＝送り幅が一定）。
 *
 * ⚠⚠ **最初は「谷で切る」（射影をしきいて塊を拾う）方式で書き、実測で棄却した**。
 *   背景の明るさを変えただけで **10文字が 10 / 4 / 3 個**に化ける（2026-08-19 実測）。
 *   ★原因＝**字間の谷は背景しだいで谷にならない**: 縁取り（暗）と背景の差が大きいほど
 *     字間にもエッジが立ち、隣とつながる。逆に背景が暗いと今度は字の内部が割れる。
 *     しきい値をどう動かしても**両方は満たせない**（3×3 の掃引で全滅）。
 *   ★∴ **問いを変える**＝「どこが谷か」ではなく「**どの周期と位相なら、谷が境界に来るか**」。
 *     これは CT ドットで効いた「**幾何は個々のフレームではなく全体から決める**」と同じ手
 *     （等間隔の格子を延ばして乗るか見る）。実測では**背景3種すべてで P=24（真値 24）・10個**。
 *
 * @returns {{pitch,phase,count,contrast,from,to}|null}
 */
export function fitGlyphGrid(profile, { rowHeight, from, to }, opts = {}) {
  const o = { ...GLYPH_DEFAULTS, ...opts };
  const p = Array.from(profile, Number);
  if (!p.length || !(to > from)) return null;
  const base = quantile(p, o.basePercentile);
  const at = (x) => {
    const i = Math.max(0, Math.min(p.length - 1, Math.round(x)));
    return Math.max(0, p[i] - base);
  };
  const span = to - from;
  const pmin = Math.max(3, o.pitchMin * rowHeight);
  const pmax = Math.min(span, o.pitchMax * rowHeight);
  let best = null;
  for (let P = pmin; P <= pmax; P += o.pitchStep) {
    // ★**セル数を「広がり ÷ 周期」に固定しない**（2026-08-19 に実測で外した）:
    //   広がりは**インクの端**で測るが、端の字のインクはセルの端まで届かない
    //   （`,` のように小さい字が端に来ると 8px 級で足りない）。固定すると**周期が縮んで
    //   格子が末尾に向かってずれる**（実際に 24.0 が 23.3 になり、末尾の字を読み違えた）。
    // ∴ セル数は floor と +1 の両方を試し、**合致度そのものに選ばせる**。
    const nLo = Math.max(1, Math.floor(span / P));
    for (const n of [nLo, nLo + 1]) {
      if (n * P < span - 0.25 * P) continue;   // 格子がインクを覆っていること
      for (let ph = -P / 2; ph < P / 2; ph += o.pitchStep) {
        let bE = 0, bN = 0, cE = 0, cN = 0;
        for (let k = 0; k <= n; k++) { bE += at(from + ph + k * P); bN++; }
        for (let k = 0; k < n; k++) { cE += at(from + ph + (k + 0.5) * P); cN++; }
        const b = bE / bN, c = cE / cN;
        const contrast = (c - b) / (c + b + 1e-9);
        // ★同点なら**短い周期**を採る（2P も境界が谷に乗るため＝倍音の罠）
        if (!best || contrast > best.contrast + 1e-9
            || (Math.abs(contrast - best.contrast) < 0.02 && P < best.pitch)) {
          best = { pitch: P, phase: ph, count: n, contrast, from, to };
        }
      }
    }
  }
  return best;
}

/**
 * 行の中をグリフへ割る。
 *
 * ★**主経路＝等間隔の格子**（`fitGlyphGrid`）。
 *   ⚠ 退避路として従来の「谷で切って幅で分割」も残すが、**格子の合致度が床を割ったときだけ**使う。
 *     退避路は背景に弱いことが実測で分かっている＝**使ったことを診断に出す**（黙って劣化させない）。
 * ★返す箱は**送り幅の固定サイズ**＝`1` のように細い字でも同じ物理範囲を見る。
 *   ∴ 署名がアスペクト比の歪みを受けず、**周囲の余白そのものが手がかりになる**。
 */
export function segmentGlyphs(edge, row, opts = {}) {
  const o = { ...GLYPH_DEFAULTS, ...opts };
  const prof = colProfile(edge, row);
  const { runs } = runsAbove(prof, o.colThresholdFraction, o.minGlyphWidth, o.colGapClose, o.basePercentile);
  if (!runs.length) return { boxes: [], pitch: null, medianWidth: null, profile: prof, splits: 0, method: 'none', grid: null, runs };

  const rowHeight = row.to - row.from;
  // ★広がり（ink span）は**両端の塊**から採る＝途中がくっついても割れても端は動かない
  const from = runs[0].from, to = runs[runs.length - 1].to;
  const grid = fitGlyphGrid(prof, { rowHeight, from, to }, o);
  const widths = runs.map((r) => r.to - r.from).sort((a, b) => a - b);
  const medianWidth = widths[Math.floor(widths.length / 2)];

  if (grid && grid.contrast >= o.gridContrastFloor) {
    const boxes = [];
    for (let k = 0; k < grid.count; k++) {
      const x = from + grid.phase + k * grid.pitch;
      boxes.push({ x, y: row.from, w: grid.pitch, h: rowHeight, center: x + grid.pitch / 2, split: false });
    }
    return { boxes, pitch: grid.pitch, medianWidth, profile: prof, splits: 0, method: 'grid', grid, runs };
  }

  // ── 退避路（★格子が合わなかったときだけ）─────────────────
  const gaps = runs.slice(1).map((r, i) => r.center - runs[i].center).sort((a, b) => a - b);
  const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : medianWidth * 1.3;
  const centers = [];
  let splits = 0;
  for (const r of runs) {
    const wRun = r.to - r.from;
    const k = wRun > o.mergeWidthFactor * medianWidth ? Math.max(2, Math.round(wRun / pitch)) : 1;
    if (k === 1) { centers.push(r.center); continue; }
    splits++;
    for (let i = 0; i < k; i++) centers.push(r.from + (wRun * (i + 0.5)) / k);
  }
  const boxes = centers.map((c) => ({
    x: c - pitch / 2, y: row.from, w: pitch, h: rowHeight, center: c, split: false,
  }));
  return { boxes, pitch, medianWidth, profile: prof, splits, method: 'runs', grid, runs };
}

/**
 * ★★**囲みの中の「字の帯」へ縦に締める**（2026-08-20・実機のアトラスが壊れた原因への答え）。
 *
 * ⚠⚠ **テンプレートが「人がどう囲んだか」に依存していた**＝上下に余白を付けて囲むと、
 *   同じ字の署名どうしの類似度が **0.65〜0.73** まで落ちる。**別の字どうしが 0.879** なので
 *   **順序が逆転する**＝アトラスが自分自身を読めなくなる（実機で 32枚中 18枚が別の字に化けた）。
 *
 * ⚠ **素朴に「行の射影がしきい値を超える範囲」では取れない**（1度そう書いて効かなかった）＝
 *   背景（キャラ絵・床グリッド）のエッジが**どの行にもある**ので、帯が囲み全体に広がる。
 *
 * ★∴ **共通モードを差し引く**＝**字のあるセル中央の列**と**字間の境界の列**で行射影を作り、
 *   **その差**を見る。背景は両方に等しく乗るので消え、**字だけが残る**。
 *   ⭐ これは CT の点灯を読むときに効いた手と同じ（**新しい閾値ではなく参照点の選び方**）。
 *
 * @param {Array<number>} centers セル中央の x（グリッドの1段目のフィット結果）
 * @param {Array<number>} bounds  セル境界の x
 * @returns {{from:number,to:number,tightened:boolean,residual:Array<number>}}
 */
export function tightenBand(edge, box, centers, bounds, opts = {}) {
  const o = { ...GLYPH_DEFAULTS, ...opts };
  const y0 = Math.max(0, Math.round(box.y)), y1 = Math.min(edge.h, Math.round(box.y + box.h));
  if (!(y1 > y0) || !centers?.length || !bounds?.length) return { from: y0, to: y1, tightened: false, residual: [] };
  const colsAt = (xs) => xs.map((x) => Math.max(0, Math.min(edge.w - 1, Math.round(x))));
  const cc = colsAt(centers), bb = colsAt(bounds);
  const residual = [];
  for (let y = y0; y < y1; y++) {
    let a = 0, b = 0;
    for (const x of cc) a += edge.mag[y * edge.w + x];
    for (const x of bb) b += edge.mag[y * edge.w + x];
    residual.push(a / cc.length - b / bb.length);
  }
  const peak = Math.max(...residual);
  if (!(peak > 0)) return { from: y0, to: y1, tightened: false, residual };
  const thr = peak * o.rowThresholdFraction;
  let from = -1, to = -1;
  for (let i = 0; i < residual.length; i++) if (residual[i] >= thr) { if (from < 0) from = i; to = i + 1; }
  if (from < 0 || to - from < 4) return { from: y0, to: y1, tightened: false, residual };
  return { from: y0 + from, to: y0 + to, tightened: true, residual };
}

/**
 * ★★**教わった文字列に格子を合わせる**（P3-1 のアトラス取得の主経路・2026-08-19c 新設）。
 *
 * ⚠⚠ **採取＋クラスタリングでアトラスを作る経路は、実機で破綻した**（2026-08-19c 実走）:
 *   `dmg` ROI は**キャラ絵・床グリッド・光**でエッジが埋まっており、
 *   **行の射影は「文字行」を切り出さない**（実測: 行の高さ p50 32 / p90 230 / max 561、
 *   「TOTAL / STING! / 数字」が **1つの帯 h=308** に潰れ、背景のグリッド線が行として4本出た）。
 *   ∴ 集まった代表の大半が**背景の模様**で、ラベルを付ける対象になっていなかった。
 *
 * ★**問いを変える**＝「どこに文字があるか当てる」のではなく、
 *   **人が「ここに 5,044,282 と出ている」と教える**。憲法そのもの（観測と判断はユーザー）で、
 *   しかも**人の手間は数字を1つ打つだけ**（60個の謎の絵にラベルを付けるより軽い）。
 *
 * ★**教わると何が効くか**:
 *   ①**文字数が既知になる**＝格子探索でいちばん効く自由度が消える
 *   ②**ラベルが自動で付く**（i 文字目のテンプレート＝`text[i]`）
 *   ③**カンマの送り幅比が測れる**＝フォントの寸法そのもの（以後の読み取りで使える）
 *
 * @param {*} edge  切り抜きのエッジ場
 * @param {{x,y,w,h}} box  ユーザーが囲んだ矩形（**数字だけを囲む**）
 * @param {string} text  そこに出ている文字列（例 `5,044,282`）
 * @returns {{ok:boolean, pitch:number, commaRatio:number, contrast:number,
 *            boxes:Array<{x,y,w,h,ch:string}>, reason:string|null}}
 */
export function fitTaughtGrid(edge, box, text, opts = {}) {
  const o = { ...GLYPH_DEFAULTS, ...opts };
  const chars = [...(text ?? '')].filter((c) => c.trim().length);
  if (!chars.length) return { ok: false, reason: '文字列が空', boxes: [], pitch: 0, commaRatio: 0, contrast: 0 };
  const nComma = chars.filter((c) => c === ',').length;
  const nWide = chars.length - nComma;

  // ★**2段で当てる**: ①囲み全体で横の格子を当てる → ②その格子を使って**縦に締める**
  //   → ③締めた帯でもう一度横を当てる。②の理由は `tightenBand` の注記（人の囲みに依存させない）。
  const pass1 = fitOnce(edge, box, chars, nWide, nComma, o);
  if (!pass1) return { ok: false, reason: '格子を当てられない', boxes: [], pitch: 0, commaRatio: 0, contrast: 0 };
  const band = tightenBand(edge, box, pass1.centers, pass1.bounds, o);
  const box2 = { ...box, y: band.from, h: band.to - band.from };
  const best = fitOnce(edge, box2, chars, nWide, nComma, o) ?? pass1;

  const boxes = [];
  let bx = best.start;
  chars.forEach((ch, i) => {
    boxes.push({ x: bx, y: band.from, w: best.adv[i], h: band.to - band.from, ch, center: bx + best.adv[i] / 2 });
    bx += best.adv[i];
  });
  return {
    ok: true, reason: null,
    pitch: best.pitch, commaRatio: best.commaRatio, phase: best.phase,
    contrast: best.contrast, boxes, band,
  };
}

/** `fitTaughtGrid` の1段ぶん（送り幅・カンマ比・位相を当てる）。 */
function fitOnce(edge, box, chars, nWide, nComma, o) {
  const prof = colProfile(edge, { from: Math.round(box.y), to: Math.round(box.y + box.h) });
  const base = quantile(Array.from(prof), o.basePercentile);
  const at = (x) => {
    const i = Math.max(0, Math.min(prof.length - 1, Math.round(x)));
    return Math.max(0, prof[i] - base);
  };
  const x0 = box.x, W = box.w;

  let best = null;
  // ★カンマの送り幅は**数字より狭い**（実機の見た目）。比そのものを探索して**測る**。
  for (let c = 0.30; c <= 1.0001; c += 0.05) {
    const units = nWide + c * nComma;
    // 囲みは人の手なので少し緩める（±10%）。★囲みが厳密でなくても壊れないため。
    for (let scale = 0.88; scale <= 1.1201; scale += 0.01) {
      const pitch = (W * scale) / units;
      if (pitch < 3) continue;
      const adv = chars.map((ch) => (ch === ',' ? pitch * c : pitch));
      const total = adv.reduce((a, b) => a + b, 0);
      for (let ph = -pitch * 0.6; ph <= pitch * 0.6; ph += 0.5) {
        const start = x0 + ph + (W - total) / 2;
        let bE = 0, bN = 0, cE = 0, cN = 0, x = start;
        bE += at(x); bN++;
        for (let i = 0; i < chars.length; i++) {
          cE += at(x + adv[i] / 2); cN++;
          x += adv[i];
          bE += at(x); bN++;
        }
        const b = bE / bN, cc = cE / cN;
        const contrast = (cc - b) / (cc + b + 1e-9);
        if (!best || contrast > best.contrast + 1e-9) {
          best = { pitch, commaRatio: c, phase: ph, contrast, start, adv };
        }
      }
    }
  }
  if (!best) return null;
  // セル中央と境界の x（②の縦締めで使う）
  const centers = [], bounds = [];
  let x = best.start;
  bounds.push(x);
  for (let i = 0; i < chars.length; i++) { centers.push(x + best.adv[i] / 2); x += best.adv[i]; bounds.push(x); }
  return { ...best, centers, bounds, profile: prof };
}

// ─────────────────────────────────────────────────────────────
// 3. 署名（テンプレートの単位）と照合
// ─────────────────────────────────────────────────────────────

/**
 * 箱の中身を固定格子へ落とす（面積平均でリサンプル）。
 *
 * @param {*} edge     エッジ場
 * @param {*} box      画素座標の箱（小数可）
 * @param {*} opts     `{cell, scale}` — `scale` は**行で共通の正規化係数**
 * ★`scale` を**行ごと**に採る理由: グリフごとに正規化すると**空白セルの雑音が増幅**され、
 *   「何も無い」が「何かある」に化ける。行の p95 を共通の物差しにすれば空白は空白のまま残る。
 */
export function signature(edge, box, opts = {}) {
  const cell = opts.cell ?? GLYPH_DEFAULTS.cell;
  const { w: W, h: H, mag } = edge;
  const data = new Float32Array(cell.w * cell.h);
  const seen = new Float32Array(cell.w * cell.h);
  for (let cy = 0; cy < cell.h; cy++) {
    const y0 = box.y + (box.h * cy) / cell.h, y1 = box.y + (box.h * (cy + 1)) / cell.h;
    for (let cx = 0; cx < cell.w; cx++) {
      const x0 = box.x + (box.w * cx) / cell.w, x1 = box.x + (box.w * (cx + 1)) / cell.w;
      let s = 0, n = 0, inside = 0;
      for (let y = Math.floor(y0); y < Math.max(Math.floor(y0) + 1, Math.ceil(y1)); y++) {
        for (let x = Math.floor(x0); x < Math.max(Math.floor(x0) + 1, Math.ceil(x1)); x++) {
          n++;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          inside++; s += mag[y * W + x];
        }
      }
      const i = cy * cell.w + cx;
      data[i] = inside ? s / inside : 0;
      seen[i] = n ? inside / n : 0;
    }
  }
  const scale = opts.scale ?? Math.max(1e-6, quantile(data, 0.95));
  for (let i = 0; i < data.length; i++) data[i] = Math.min(1, data[i] / scale);
  return { cell, data, seen, scale };
}

/**
 * ★箱の中の**実画素**を切り出す（人に見せるのは常にこれ）。
 *
 * ⚠ **署名（`signature`）と混同しない**＝署名は機械が照合するための表現で、
 *   **人が見て「7 だ」と言える表現ではない**（2026-08-19b にユーザー報告で判明）。
 * @returns {{w:number,h:number,data:Uint8ClampedArray}} 範囲外なら w=h=0
 */
export function cropPatch(img, box) {
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.width, Math.ceil(box.x + box.w)), y1 = Math.min(img.height, Math.ceil(box.y + box.h));
  const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x1) * 4), y * w * 4);
  }
  return { w, h, data };
}

/** 署名を平坦な配列（0〜255 の整数）へ。★アトラス JSON はこの形で持つ（小さく・可読）。 */
export function packSignature(sig) {
  return Array.from(sig.data, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
}
/** `packSignature` の逆。 */
export function unpackSignature(arr, cell) {
  const data = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) data[i] = arr[i] / 255;
  return { cell, data, seen: null, scale: 1 };
}

/**
 * ★**遮蔽に強い照合**（上の②③が要求するもの）。
 *
 *   cover = Σ m·min(T,S) / Σ m·T        … テンプレートの筆画がどれだけ「在る」か
 *   alien = Σ m·max(0,S−T) / Σ m·(1−T)  … テンプレートが「無い」と言う場所にどれだけ画素が在るか
 *   score = cover − λ·alien
 *
 * ★**なぜ2項に分けるか**: cover だけだと**画面が明るいほど何にでも一致する**
 *   （とくに `8` は他の全数字を内包するので、cover 単独では常に勝つ）。
 *   alien が「`8` のつもりで見たら真ん中の横棒が無い」を罰する。
 * ★**mask（観測できた重み）を両方の分母から外す**のが遮蔽対策の本体＝
 *   ラベルで潰した画素は「白でも黒でもなく**分からない**」として**票を持たない**。
 *   ⚠ 「潰した画素を 0 として扱う」は誤り＝**筆画が消えた**と読んでしまう。
 * ⚠ 半透明の重なり（③）は cover を下げ alien を上げる**両方**に効く。
 *   ∴ **1位の絶対値ではなく1位と2位の差**で採否を決める（`classify` の `margin`）。
 */
export function matchSignature(sample, template, opts = {}) {
  const o = { ...GLYPH_DEFAULTS, ...opts };
  const S = sample.data, T = template.data;
  if (S.length !== T.length) throw new Error(`署名の格子が違う: ${S.length} vs ${T.length}`);
  const mask = opts.mask ?? null;
  let ct = 0, cs = 0, ss = 0;
  for (let i = 0; i < S.length; i++) {
    const m = mask ? mask[i] : 1;
    if (m <= 0) continue;
    ct += m * T[i];
    cs += m * Math.min(T[i], S[i]);
    ss += m * S[i];
  }
  const cover = ct > 1e-9 ? cs / ct : 0;
  // ★**異物は「標本のインク」に対して測る**。
  //   ⚠⚠ **分母をテンプレートの空白にしていて外した**（2026-08-20・実機データで判明）＝
  //     `,` のように**ほとんど空のテンプレート**は空白が広いので異物項が薄まり、
  //     **何にでも一致する吸い込み口**になった（誤りの約半分が `,` 行き＝`2→,` が5件など）。
  //   ⭐ これは [16-6] の「8 の罠」の**裏返し**＝空のテンプレートは cover が飽和しやすい。
  //   ★実測（受領アトラス 63点・教示回を1つ抜いて残りで読む）＝**旧 37/63 → 新 41/63**、
  //     かつ `,` への吸い込みが消えた。
  const explained = ss > 1e-9 ? cs / ss : 0;
  const alien = 1 - explained;
  return { cover, explained, alien, score: cover - o.lambda * alien, observed: mask ? null : 1 };
}

/**
 * ★**遮蔽の場所をセル重みへ落とす**（ラベル検出 → マスク → 照合、の「→」の部分）。
 *
 * @param {object} box   グリフの箱（画素座標）
 * @param {Array<{x,y,w,h}>} rects  潰す領域（検出済みラベルの外接矩形など・画素座標）
 * @param {{w:number,h:number}} cell
 * @returns {Float32Array} セルごとの「観測できた割合」（1=全部見えた / 0=全部隠れた）
 *
 * ⚠ **0 を「筆画が無い」ではなく「分からない」として使う**のが要点（`matchSignature` の注記）。
 */
export function maskFromRects(box, rects, cell = GLYPH_DEFAULTS.cell) {
  const m = new Float32Array(cell.w * cell.h).fill(1);
  if (!rects || !rects.length) return m;
  for (let cy = 0; cy < cell.h; cy++) {
    const y0 = box.y + (box.h * cy) / cell.h, y1 = box.y + (box.h * (cy + 1)) / cell.h;
    for (let cx = 0; cx < cell.w; cx++) {
      const x0 = box.x + (box.w * cx) / cell.w, x1 = box.x + (box.w * (cx + 1)) / cell.w;
      const area = Math.max(1e-9, (x1 - x0) * (y1 - y0));
      let covered = 0;
      for (const r of rects) {
        const ow = Math.min(x1, r.x + r.w) - Math.max(x0, r.x);
        const oh = Math.min(y1, r.y + r.h) - Math.max(y0, r.y);
        if (ow > 0 && oh > 0) covered += ow * oh;
      }
      m[cy * cell.w + cx] = Math.max(0, 1 - Math.min(1, covered / area));
    }
  }
  return m;
}

/** アトラスの1エントリを署名の配列へ（1枚でも複数 variants でも受ける）。 */
export function templatesOf(entry, cell) {
  if (!entry) return [];
  if (entry.data) return [entry];
  // ⚠ 署名オブジェクトの配列（メモリ上の形）も受ける＝`selfCheckAtlas` がこの形を渡す
  if (Array.isArray(entry) && entry[0]?.data) return entry;
  if (Array.isArray(entry) && Array.isArray(entry[0])) return entry.map((e) => unpackSignature(e, cell));
  if (Array.isArray(entry)) return [unpackSignature(entry, cell)];
  if (Array.isArray(entry.variants)) return entry.variants.map((e) => unpackSignature(e, cell));
  return [];
}

/**
 * アトラス全体と照合し、**候補を順に**返す（決めつけない＝P3 は「候補生成のみ」）。
 * @returns {{best:object|null, candidates:Array, ambiguous:boolean, margin:number}}
 */
export function classify(sample, atlas, opts = {}) {
  const o = { ...GLYPH_DEFAULTS, ...opts };
  const cands = [];
  for (const [key, tmpl] of Object.entries(atlas.glyphs ?? {})) {
    // ★1つの字に**複数の見え方**を持たせられる（`variants`）。
    //   ⚠ 動機は実測: 同じ字でも**背景が変わると署名が変わる**（同字の類似度が 0.48 まで落ちる）。
    //     ∴ 「1字＝1テンプレート」に固執せず、**採取した条件ごとに1枚ずつ持つ**。
    //     照合は variants の**最良**を採る（どれか1つに似ていれば良い）。
    //   ⚠⚠ **ただし多ければ良いわけではない**（2026-08-19c 実測）＝
    //     **同じ条件**の variants を足したら読める文字が **8 → 7 に減った**（誤りは 0 のまま）。
    //     各 key の score は上がるが**競合 key の score も上がる**ので margin が縮み「読めない」に倒れる。
    //     ∴ **効くのは条件が違う variants だけ**。アトラスは闇雲に太らせない。
    let bestM = null;
    for (const t of templatesOf(tmpl, atlas.cell)) {
      const m = matchSignature(sample, t, o);
      if (!bestM || m.score > bestM.score) bestM = m;
    }
    if (bestM) cands.push({ key, ...bestM });
  }
  cands.sort((a, b) => b.score - a.score);
  const margin = cands.length >= 2 ? cands[0].score - cands[1].score : Infinity;
  return {
    best: cands[0] ?? null,
    candidates: cands.slice(0, 3),
    ambiguous: cands.length >= 2 && margin < o.ambiguityMargin,
    margin,
  };
}

/**
 * 行に共通の正規化係数（`signature` の `scale`）。
 * ★**行ごとに採る**理由は `signature` の注記のとおり（グリフごとだと空白が増幅される）。
 */
export function fieldScale(edge, row, p = 0.95) {
  const { w, h, mag } = edge;
  const y0 = Math.max(0, row?.from ?? 0), y1 = Math.min(h, row?.to ?? h);
  const vals = [];
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) vals.push(mag[y * w + x]);
  return Math.max(1e-6, quantile(vals, p));
}

/**
 * ★**1行を読む**（P3 の入口）。切り出し → 署名 → 照合 → 数値の組み立て、までを1本にする。
 *
 * ⚠ **決めつけない**＝`minScore` に届かないグリフは `?` のまま返し、`readNumber` が
 *   「読めない」と言う。`hp_bar.js` で確立した規律（読めないときは読めないと言う）と同じ。
 * @param {Array} [opts.occluders] 先に検出したラベル等の矩形（画素座標）＝**マスクして票を持たせない**
 */
export function readRow(edge, row, atlas, opts = {}) {
  const o = { ...GLYPH_DEFAULTS, ...opts };
  const cell = atlas?.cell ?? o.cell;
  const seg = segmentGlyphs(edge, row, o);
  const scale = fieldScale(edge, row);
  const tokens = seg.boxes.map((b) => {
    const sig = signature(edge, b, { cell, scale });
    const mask = o.occluders?.length ? maskFromRects(b, o.occluders, cell) : null;
    const c = classify(sig, atlas, { ...o, mask });
    const accepted = !!c.best && c.best.score >= o.minScore && !(o.rejectAmbiguous && c.ambiguous);
    return {
      box: b, key: accepted ? c.best.key : '?', score: c.best?.score ?? 0, margin: c.margin,
      ambiguous: !!c.ambiguous, accepted, candidates: c.candidates ?? [], signature: sig,
    };
  });
  return { ...seg, scale, tokens, number: readNumber(tokens, o.range ?? { minDigits: 1, maxDigits: 9 }) };
}

// ─────────────────────────────────────────────────────────────
// 4. アトラス（実機グリフの台帳）
// ─────────────────────────────────────────────────────────────

/**
 * ★**空のアトラス**。⚠ これが既定＝**推測テンプレートを同梱しない**。
 *   実機の走から採取し、ユーザーがラベルを付けたものだけが入る（本モジュール冒頭の段取り）。
 */
export const EMPTY_ATLAS = { version: 0, cell: { ...GLYPH_DEFAULTS.cell }, provenance: null, glyphs: {}, labels: {} };

/**
 * ★★**アトラスが自分自身を読めるか**（自己整合性）。
 *
 * ⚠⚠ **これが無くて壊れたアトラスを出荷した**（2026-08-20・実機）:
 *   46枚のうち **10枚が別のラベルと画素まで同一**（＝同じ囲みのまま別の数字を教えた）で、
 *   さらに掃除しても **32枚中 18枚が別の字に分類された**（＝囲みの余白でテンプレートが歪んでいた）。
 *   ★**「保存できた」は「使える」ではない**。∴ 保存の前に**自分で自分を読ませて**確かめる。
 *
 * @returns {{ok:boolean, correct:number, ambiguous:number, wrong:number,
 *            confusions:object, crossLabelDuplicates:Array}}
 */
export function selfCheckAtlas(atlas, opts = {}) {
  const cell = atlas?.cell ?? GLYPH_DEFAULTS.cell;
  const entries = [];
  for (const [k, v] of Object.entries(atlas?.glyphs ?? {})) {
    templatesOf(v, cell).forEach((t, i) => entries.push({ k, i, t }));
  }
  // ①**別のラベルどうしで画素まで同じ**＝どちらが正しいか決められない（教え方の事故）
  const byPix = new Map();
  for (const e of entries) {
    const key = Array.from(e.t.data, (x) => Math.round(x * 255)).join(',');
    (byPix.get(key) ?? byPix.set(key, []).get(key)).push(e);
  }
  const crossLabelDuplicates = [];
  for (const list of byPix.values()) {
    const labels = new Set(list.map((x) => x.k));
    if (labels.size > 1) crossLabelDuplicates.push(list.map((x) => `${x.k}#${x.i}`));
  }
  // ②各テンプレを**自分を除いたアトラス**で分類する（＝実際の読み取りと同じ条件）
  //   ⚠ **1枚しか無い字は検査できない**（自分を除くとその字がアトラスから消える）＝
  //     「必ず外れる」ので誤りに数えない。**検査できないこと自体を数えて報告する**
  //     （2枚以上教われば検査できるようになる＝そう促すための数字）。
  const count = {};
  for (const e of entries) count[e.k] = (count[e.k] ?? 0) + 1;
  let correct = 0, ambiguous = 0, wrong = 0, unchecked = 0;
  const confusions = {};
  for (const e of entries) {
    if (count[e.k] < 2) { unchecked++; continue; }
    const glyphs = {};
    for (const other of entries) {
      if (other === e) continue;
      (glyphs[other.k] ||= []).push(other.t);
    }
    const c = classify(e.t, { cell, glyphs }, opts);
    if (!c.best) continue;
    if (c.best.key !== e.k) { wrong++; const kk = `${e.k}→${c.best.key}`; confusions[kk] = (confusions[kk] ?? 0) + 1; }
    else if (c.ambiguous) ambiguous++;
    else correct++;
  }
  return { ok: wrong === 0 && crossLabelDuplicates.length === 0,
           entries: entries.length, correct, ambiguous, wrong, unchecked, confusions, crossLabelDuplicates };
}

/**
 * ★★**教示回を1つ抜いて、残りで読めるか**（アトラスの本当の品質指標）。
 *
 * ⚠ `selfCheckAtlas` の leave-one-out（1枚だけ抜く）は**同じ回の他の字**が残るので甘い。
 *   実際の読み取りは「**まだ見ていない表示**を読む」ので、**回ごと**に抜くのが正しい。
 * ★これで受領アトラス（46枚・7回）を測ったら **正 37/63** で、使えないことが分かった。
 * @param {Array<{ch:string,sig:Array<number>,ti:number}>} taught 教えた順のテンプレート
 */
export function leaveOneTeachingOut(taught, cell = GLYPH_DEFAULTS.cell, opts = {}) {
  const groups = [...new Set(taught.map((t) => t.ti))];
  let correct = 0, ambiguous = 0, wrong = 0, total = 0;
  const confusions = {};
  for (const g of groups) {
    const glyphs = {};
    for (const t of taught) if (t.ti !== g) (glyphs[t.ch] ||= []).push(t.sig);
    if (!Object.keys(glyphs).length) continue;
    for (const t of taught) {
      if (t.ti !== g || !glyphs[t.ch]) continue;
      total++;
      const c = classify(unpackSignature(t.sig, cell), { cell, glyphs }, opts);
      if (!c.best) continue;
      if (c.best.key !== t.ch) { wrong++; const k = `${t.ch}→${c.best.key}`; confusions[k] = (confusions[k] ?? 0) + 1; }
      else if (c.ambiguous) ambiguous++;
      else correct++;
    }
  }
  return { total, correct, ambiguous, wrong, confusions,
           rate: total ? +(correct / total).toFixed(3) : 0 };
}

/** アトラスの健全性検査。★**読み取りを始める前の関門**。 */
export function validateAtlas(atlas) {
  const problems = [];
  if (!atlas || typeof atlas !== 'object') return { ok: false, problems: ['アトラスが無い'] };
  const keys = Object.keys(atlas.glyphs ?? {});
  if (!keys.length) problems.push('グリフが1つも登録されていない（採取パスを先に回す）');
  const need = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const missing = need.filter((d) => !keys.includes(d));
  if (keys.length && missing.length) problems.push(`数字が欠けている: ${missing.join(',')}`);
  const size = (atlas.cell?.w ?? 0) * (atlas.cell?.h ?? 0);
  for (const k of keys) {
    for (const t of templatesOf(atlas.glyphs[k], atlas.cell)) {
      if (t.data.length !== size) problems.push(`グリフ ${k} の格子が cell と違う（${t.data.length} vs ${size}）`);
    }
    if (!templatesOf(atlas.glyphs[k], atlas.cell).length) problems.push(`グリフ ${k} が空`);
  }
  if (!atlas.provenance) problems.push('provenance が無い（どの録画・いつ採取したかは E1 の必須項目）');
  const self = keys.length ? selfCheckAtlas(atlas) : null;
  // ★①**別のラベルどうしで画素が同一**＝教え方の事故。どちらが正しいか決められない＝**関門**。
  if (self?.crossLabelDuplicates.length) {
    problems.push(`別のラベルどうしで画素が同一＝${self.crossLabelDuplicates.length}組`
      + `（${self.crossLabelDuplicates.slice(0, 3).map((g) => g.join('=')).join(' / ')}）`
      + '＝同じ囲みのまま別の数字を教えた疑い。どちらが正しいか決められないので両方捨てる');
  }
  // ★②**教えるたびの寸法が揃っているか**＝フォントは固定なので、送り幅と字の高さは走の中で一定のはず。
  //   ⚠ ばらつくのは「囲み方が違う」か「別の大きさの表示を教えた」＝**テンプレートが混ざる**。
  // ⚠⚠ **絶対値（送り幅・字高）で揃えろと言ってはいけない**（2026-08-20・実機データで判明）＝
  //   実機の表示は**大きさそのものが変わる**（個別ヒットとバースト TOTAL で送り幅 72〜113px）。
  //   ★フォントが固定なら定数なのは**比**（字高/送り幅）。∴ 比だけを見る。
  const T = atlas.provenance?.teachings;
  if (Array.isArray(T) && T.length >= 2) {
    const rs = T.map((t) => (t.pitch > 0 ? t.bandH / t.pitch : 0)).filter((x) => x > 0);
    if (rs.length >= 2) {
      const mn = Math.min(...rs), mx = Math.max(...rs);
      // ⚠ 基準は**中央値**（[min,max] の中点だと外れ値そのものに引っぱられ、
      //   「いちばん外れている回」を取り違える＝実際に取り違えた）
      const sorted = [...rs].sort((a, b) => a - b);
      const mid = sorted[Math.floor(sorted.length / 2)];
      if (mx > mn * 1.15) {
        const worst = T.filter((t) => t.pitch > 0)
          .map((t) => ({ t, r: t.bandH / t.pitch }))
          .sort((a, b) => Math.abs(b.r - mid) - Math.abs(a.r - mid))[0];
        problems.push(`教えるたびに「字高/送り幅」の比が揃っていない（${mn.toFixed(2)}〜${mx.toFixed(2)}・±15% 超）`
          + `＝切り出しが安定していない。いちばん外れているのは t=${worst.t.at}「${worst.t.text}」`
          + `（比 ${worst.r.toFixed(2)}）＝この回を教え直す`);
      }
    }
  }
  // ⚠⚠ **自己読み（leave-one-out）は関門にしない**（2026-08-20 に測って却下）＝
  //   **健全なアトラスも落とす**（条件をまたぐ variants を持つ合成アトラスで 14/22 枚が落ちた）。
  //   理由＝1枚抜くと「その条件のテンプレート」が消えるので、**読み取り時より不利な条件**になる。
  //   ★情報としては出す（`self`）が、判定には使わない。★**測って落ちた指標を関門にしない**。
  return { ok: problems.length === 0, problems, self,
           digits: need.filter((d) => keys.includes(d)).length };
}

// ─────────────────────────────────────────────────────────────
// 5. 採取（形の分類まで＝ラベルは付けない）
// ─────────────────────────────────────────────────────────────

/** 中央値（空なら 0）。 */
function median(a) {
  if (!a.length) return 0;
  const v = [...a].sort((x, y) => x - y);
  return v[Math.floor(v.length / 2)];
}

/** 署名どうしの類似度（soft Jaccard）。0〜1。 */
export function similarity(a, b) {
  let mn = 0, mx = 0;
  for (let i = 0; i < a.length; i++) { mn += Math.min(a[i], b[i]); mx += Math.max(a[i], b[i]); }
  return mx > 1e-9 ? mn / mx : 0;
}

/**
 * 走を通してグリフ候補を集め、**似た形をまとめる**。
 *
 * ★ここまでが機械の仕事＝「同じ形が何回も出た」までは正解ラベル無しで言える。
 *   「その形が 7 である」はユーザーが1回答える（憲法＝観測と判断はユーザー）。
 * ⚠ **クラスタ数が上限に張り付いたら閾値が緩すぎる合図**（`T1-DETECT-006`）＝
 *   数字は10種類しかないので、数百に割れるのは「同じ字が別物として散っている」こと。
 */
export class GlyphHarvest {
  constructor(opts = {}) {
    this.o = { ...GLYPH_DEFAULTS, ...opts };
    this.clusters = [];   // {sum:Float32Array, count, centroid, times:[], boxes:[]}
    this.seen = 0;
    this.overflow = 0;
  }

  /**
   * @param {{data:Float32Array}} sig 署名（照合に使う）
   * @param {number} t 秒
   * @param {object} box 画素座標の箱
   * @param {{w:number,h:number,data:Uint8ClampedArray}} [patch] ★**実画素の切り抜き**
   *
   * ⚠⚠ **`patch` は 2026-08-19b に追加した**（ユーザー報告で判明した設計ミスの修正）:
   *   代表を**署名（12×20 の縁取りの強さ）**として画面に描いていたが、
   *   **人はそれを見て「7 だ」と判断できない**（荒い・白黒・字の一部にしか見えない）。
   *   ★署名は**機械が照合するための表現**であって、**人が見るための表現ではない**。
   *   ∴ 人に見せるものは**実画素**（色つき・元の解像度）にする。
   *   ★教訓の一般形＝**人に判断を頼むなら、人が判断できる形で見せる**（憲法の運用側の条件）。
   */
  push(sig, t = null, box = null, patch = null, meta = null) {
    this.seen++;
    let best = null, bestSim = -1;
    for (const c of this.clusters) {
      const s = similarity(sig.data, c.centroid);
      if (s > bestSim) { bestSim = s; best = c; }
    }
    if (best && bestSim >= this.o.clusterSimilarity) {
      for (let i = 0; i < sig.data.length; i++) best.sum[i] += sig.data[i];
      best.count++;
      best.centroid = Float32Array.from(best.sum, (v) => v / best.count);
      if (best.times.length < 8) best.times.push(t);
      if (best.boxes.length < 8) best.boxes.push(box);
      if (patch && best.patches.length < 3) best.patches.push(patch);
      if (meta) best.meta.push(meta);
      return best;
    }
    if (this.clusters.length >= this.o.maxClusters) { this.overflow++; return null; }
    const sum = Float32Array.from(sig.data);
    const c = { sum, count: 1, centroid: Float32Array.from(sum), times: [t], boxes: [box],
                patches: patch ? [patch] : [], meta: meta ? [meta] : [] };
    this.clusters.push(c);
    return c;
  }

  /**
   * 出現回数の多い順に代表を返す（ユーザーがラベルを付ける対象）。
   * ⚠ **実画素（`patches`）は返さない**＝診断 JSON に載せると桁違いに膨らむため。
   *   画面へ描くときは `patchAt(i)` を使う（順序は本メソッドと同じ）。
   */
  report(topN = 40) {
    const cs = [...this.clusters].sort((a, b) => b.count - a.count).slice(0, topN);
    this._reported = cs;
    return {
      seen: this.seen,
      clusters: this.clusters.length,
      overflow: this.overflow,
      representatives: cs.map((c, i) => ({
        index: i,
        count: c.count,
        times: c.times.filter((t) => t != null).map((t) => +t.toFixed(2)),
        // ★箱の実寸も返す（**字の一部しか映っていない**ことに人が気づける）
        box: c.boxes[0] ? { w: +c.boxes[0].w.toFixed(1), h: +c.boxes[0].h.toFixed(1) } : null,
        // ★★「これは文字か、背景の模様か」を後で切り分けるための材料（**まだ篩には使わない**）。
        //   ⚠ 実データを見る前に篩を入れない（本 Phase の規律）。まずは**測って持ち帰る**:
        //   `contrast`＝出てきた行の格子の合致度（文字行なら高いはず）
        //   `spread`＝箱の位置のばらつき（背景の模様は同じ位置に出続ける／数字は動く）
        contrast: c.meta.length ? +median(c.meta.map((x) => x.contrast ?? 0)).toFixed(3) : null,
        spread: c.boxes.filter(Boolean).length >= 2
          ? { x: +(Math.max(...c.boxes.filter(Boolean).map((b) => b.x)) - Math.min(...c.boxes.filter(Boolean).map((b) => b.x))).toFixed(0),
              y: +(Math.max(...c.boxes.filter(Boolean).map((b) => b.y)) - Math.min(...c.boxes.filter(Boolean).map((b) => b.y))).toFixed(0) }
          : null,
        signature: packSignature({ data: c.centroid }),
      })),
    };
  }

  /** ★`report()` と同じ並び順で、代表の**実画素**を返す（画面描画専用）。 */
  patchAt(i) { return this._reported?.[i]?.patches?.[0] ?? null; }
}

// ─────────────────────────────────────────────────────────────
// 6. 数値の組み立てと、その場でできる検算
// ─────────────────────────────────────────────────────────────

/**
 * ★**桁区切り（カンマ）の文法検査**＝検算③④の一部を、OCR のその場で回すもの。
 *
 * 実機表示は `6,012,442` 形式。∴ **カンマとカンマの間はちょうど3桁**。
 * ⚠ **この検査が捕まえるのは「中の桁の脱落/混入」だけ**＝
 *   先頭グループ（1〜3桁）の欠けは文法上正しく見えるので**捕まらない**。
 *   そこは検算⑦（`TOTAL` ↔ 個別ヒットの合計）と値域が受け持つ。
 */
export function checkCommaGrammar(text) {
  if (!/^[0-9,]+$/.test(text || '')) return { ok: false, reason: '数字とカンマ以外が混じっている' };
  if (!/^\d{1,3}(,\d{3})*$/.test(text)) {
    const groups = text.split(',');
    const bad = groups.slice(1).findIndex((g) => g.length !== 3);
    return {
      ok: false,
      reason: bad >= 0
        ? `${bad + 2}番目のグループが ${groups[bad + 1].length} 桁（3桁であるべき）`
        : 'カンマの位置が桁区切りとして成立しない',
    };
  }
  return { ok: true, reason: null };
}

/**
 * 分類済みのトークン列を数値へ組み立てる。**読めない要素があれば読めないと言う**
 * （`hp_bar.js` で確立した規律＝推測で埋めない）。
 *
 * @param {Array<{key:string, ambiguous:boolean, score:number}>} tokens 左から順に
 * @param {{minDigits:number,maxDigits:number}} [range] 値域（桁数）
 */
export function readNumber(tokens, range = { minDigits: 1, maxDigits: 9 }) {
  const text = tokens.map((t) => t.key).join('');
  const unknown = tokens.filter((t) => !t.key || t.key === '?').length;
  const ambiguous = tokens.filter((t) => t.ambiguous).length;
  if (unknown) return { ok: false, text, value: null, reason: `${unknown} 文字が未一致`, unknown, ambiguous };
  const g = checkCommaGrammar(text);
  if (!g.ok) return { ok: false, text, value: null, reason: g.reason, unknown, ambiguous };
  const digits = text.replace(/,/g, '');
  if (digits.length < range.minDigits || digits.length > range.maxDigits) {
    return { ok: false, text, value: Number(digits), reason: `桁数 ${digits.length} が値域 ${range.minDigits}〜${range.maxDigits} の外`, unknown, ambiguous };
  }
  return { ok: true, text, value: Number(digits), reason: null, unknown, ambiguous,
           minScore: tokens.reduce((m, t) => Math.min(m, t.score ?? 1), 1) };
}

// ─────────────────────────────────────────────────────────────
// 7. 診断
// ─────────────────────────────────────────────────────────────

/** 採取パスの結果を Diag に載せる。⚠ 判定ではなく**測定**なので FATAL にはしない。 */
export function reportHarvest(diag, rep, atlasState) {
  if (!rep) return null;
  if (rep.clusters === 0) {
    diag.add('T1-MATCH-001', 'WARN', {
      where: { roi: 'dmg' },
      expected: '数字らしい塊が1つ以上',
      got: 'グリフ候補が0件',
      hint: '行の切り出し閾値（rowThresholdFraction）が高すぎるか、その窓に数字が出ていない。'
        + 'digest の行プロファイルを見て決め直す。',
    });
  }
  if (rep.overflow > 0 || rep.clusters >= GLYPH_DEFAULTS.maxClusters) {
    diag.add('T1-DETECT-006', 'WARN', {
      where: { clusters: rep.clusters },
      expected: `クラスタ数は数十（数字10種＋カンマ＋ラベル）`,
      got: `${rep.clusters} 個（あふれ ${rep.overflow} 件）`,
      hint: '同じ字が別物として散っている＝clusterSimilarity が高すぎる、'
        + 'または切り出しの箱が字ごとにずれている（送り幅の推定を見る）。',
    });
  }
  if (atlasState && !atlasState.ok) {
    diag.add('T1-MATCH-006', 'ERROR', {
      where: { stage: 'MATCH' },
      expected: '実機グリフのアトラス（0〜9＋カンマ）',
      got: atlasState.problems.join(' / '),
      hint: '★採取 → ユーザーがラベル付け → アトラス登録、の順。'
        + '推測テンプレートでは動かさない（合成だけ通って実機で静かに外れるため）。',
    });
  }
  return rep;
}
