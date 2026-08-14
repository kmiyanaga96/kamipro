// T1 録画転記ツール — canvas 正規化（PHASE9_PLAN.md §4 P2 の最初の工程）
//
// ★なぜ要るか（P1 新発見② / 2026-08-14）:
//   録画対象は「ブラウザウィンドウ全体」であって、ゲーム canvas ではない。
//   ページのスクロール位置・ウィンドウサイズ・ブラウザズームで canvas の位置と大きさが動くため、
//   **ROI を固定クロップにできない**。∴ 毎フレーム canvas を検出して正規化座標に載せ替える。
//   ⚠ これが全 ROI 由来の検算（PHASE9_PLAN §5 の 1/3/4/5）の前提条件。
//
// 設計方針:
//   - **純関数**（DOM・fs に触れない）＝ブラウザと Node の両方で動き、Node でセルフテストできる。
//     ⚠ Claude はブラウザを見られない（§10.1）ので、検証可能性は実装より優先する。
//   - ROI は **canvas に対する正規化座標 [0,1]** で定義する。
//     ∴ マジックな解像度定数を持たず、スクロール/ズーム/録画解像度が変わっても同じ ROI が同じ物を指す。
//
// 入力は ImageData 互換のオブジェクト: { width, height, data }（data は RGBA の Uint8ClampedArray）。

/** 既定パラメータ。実フレームで再測するまでの暫定値であることを明示する（CLAUDE.md 開発ルール §5）。 */
export const DEFAULTS = {
  /** 背景（ページの白）とみなす色差の許容値。0-255 のチャンネル最大差。 */
  bgTolerance: 24,
  /** 行/列がコンテンツとみなされる占有率のしきい値。 */
  runThreshold: 0.35,
  /** canvas が画面に占める最小の面積割合。これ未満は検出失敗とみなす。 */
  minAreaRatio: 0.10,
  /**
   * 想定アスペクト比とその許容幅。⚠ 目測由来の暫定値（2026-08-14・P1 第2便フレーム）。
   * 外れても FATAL にはせず WARN にとどめる（未再測の値で処理を止めない＝E1）。
   */
  expectAspect: 1.49,
  aspectTolerance: 0.25,
  /** 走査の間引き。大きいほど速いが精度が粗い。境界は後段で 1px 精度に詰める。 */
  coarseStep: 4,
};

/** 画素 (x,y) の RGB を返す。 */
function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/** 2色のチャンネル最大差。 */
function maxDiff(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/**
 * ページ背景色を推定する。
 * 画像の左右端の列（ブラウザのページ余白）から最頻色を取る。
 * ⚠ 上端は使わない（ブラウザ chrome＝タブ・URL バーが載っており背景ではない）。
 */
export function estimateBackground(img, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const bins = new Map();
  const band = Math.max(2, Math.floor(img.width * 0.01));
  const y0 = Math.floor(img.height * 0.25);           // chrome を避けて下 3/4 を見る
  const step = Math.max(1, o.coarseStep);
  for (let y = y0; y < img.height; y += step) {
    for (const xs of [[0, band], [img.width - band, img.width]]) {
      for (let x = xs[0]; x < xs[1]; x += step) {
        const c = px(img, x, y);
        // 8 階調に量子化してヒストグラムを作る（微妙なグラデーションを1つに畳む）
        const key = ((c[0] >> 5) << 10) | ((c[1] >> 5) << 5) | (c[2] >> 5);
        const e = bins.get(key);
        if (e) { e.n++; e.r += c[0]; e.g += c[1]; e.b += c[2]; }
        else bins.set(key, { n: 1, r: c[0], g: c[1], b: c[2] });
      }
    }
  }
  let best = null;
  for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  if (!best) return [255, 255, 255];
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
}

/**
 * 1次元の占有率配列から、しきい値を超える最長の連続区間を返す。
 * @returns {{start:number,end:number,len:number}} end は排他
 */
function longestRun(profile, threshold) {
  let best = { start: 0, end: 0, len: 0 };
  let s = -1;
  for (let i = 0; i <= profile.length; i++) {
    const on = i < profile.length && profile[i] >= threshold;
    if (on && s < 0) s = i;
    else if (!on && s >= 0) {
      const len = i - s;
      if (len > best.len) best = { start: s, end: i, len };
      s = -1;
    }
  }
  return best;
}

/**
 * ★canvas の矩形を検出する。
 *
 * 手順（2パス射影）:
 *   1. 行ごとの「非背景率」を取り、最長の連続帯を選ぶ
 *      → ブラウザ chrome（薄い帯）や下部バナー（短い帯）より canvas が背が高いことを利用する
 *   2. その帯の中だけで列ごとの非背景率を取り、最長の連続区間を選ぶ
 *      → chrome が全幅を占めることによる汚染を受けない（1 で行を絞ってあるため）
 *   3. 境界を 1px 精度に詰める
 *
 * @returns {{ok:boolean, box?:{x,y,w,h}, aspect?:number, areaRatio?:number, reason?:string}}
 */
export function detectCanvas(img, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const bg = o.background ?? estimateBackground(img, o);
  const step = Math.max(1, o.coarseStep);

  const isContent = (x, y) => maxDiff(px(img, x, y), bg) > o.bgTolerance;

  // --- 1. 行の射影 ---
  const rowProf = new Float32Array(img.height);
  let nx = 0;
  for (let x = 0; x < img.width; x += step) nx++;
  for (let y = 0; y < img.height; y++) {
    let n = 0;
    for (let x = 0; x < img.width; x += step) if (isContent(x, y)) n++;
    rowProf[y] = n / nx;
  }
  const rows = longestRun(rowProf, o.runThreshold);
  if (rows.len < 2) return { ok: false, reason: 'コンテンツ行が見つからない（背景推定を疑う）' };

  // --- 2. その帯の中での列の射影 ---
  const colProf = new Float32Array(img.width);
  let ny = 0;
  for (let y = rows.start; y < rows.end; y += step) ny++;
  for (let x = 0; x < img.width; x++) {
    let n = 0;
    for (let y = rows.start; y < rows.end; y += step) if (isContent(x, y)) n++;
    colProf[x] = n / ny;
  }
  const cols = longestRun(colProf, o.runThreshold);
  if (cols.len < 2) return { ok: false, reason: 'コンテンツ列が見つからない' };

  // --- 3. 境界を 1px 精度に詰める（列を確定してから行を取り直す） ---
  const rowProf2 = new Float32Array(img.height);
  const nx2 = cols.end - cols.start;
  for (let y = 0; y < img.height; y++) {
    let n = 0;
    for (let x = cols.start; x < cols.end; x++) if (isContent(x, y)) n++;
    rowProf2[y] = n / nx2;
  }
  const rows2 = longestRun(rowProf2, o.runThreshold);
  const box = {
    x: cols.start,
    y: rows2.len >= 2 ? rows2.start : rows.start,
    w: cols.end - cols.start,
    h: (rows2.len >= 2 ? rows2.end - rows2.start : rows.end - rows.start),
  };

  const areaRatio = (box.w * box.h) / (img.width * img.height);
  const aspect = box.w / box.h;
  if (areaRatio < o.minAreaRatio) {
    return { ok: false, box, aspect, areaRatio, reason: `canvas が小さすぎる（面積比 ${areaRatio.toFixed(3)}）` };
  }
  return { ok: true, box, aspect, areaRatio };
}

/**
 * ★正規化 ROI → 画素矩形。
 * ROI は canvas の左上を (0,0)・右下を (1,1) とする比率で定義する。
 * ∴ スクロール・ズーム・録画解像度が変わっても同じ ROI が同じ物を指す（これが正規化の目的）。
 */
export function roiToPixels(box, roi) {
  const x = box.x + roi.x * box.w;
  const y = box.y + roi.y * box.h;
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(roi.w * box.w),
    h: Math.round(roi.h * box.h),
  };
}

/** 画素矩形 → 正規化 ROI（実フレームから ROI を採寸するときに使う逆変換）。 */
export function pixelsToRoi(box, rect) {
  return {
    x: (rect.x - box.x) / box.w,
    y: (rect.y - box.y) / box.h,
    w: rect.w / box.w,
    h: rect.h / box.h,
  };
}

/**
 * 検出結果を Diag に載せる。§10.5.1 のコード台帳に対応。
 * @param {import('./diag.js').Diag} diag
 */
export function reportDetection(diag, det, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!det.ok) {
    diag.add('T1-ROI-001', 'FATAL', {
      where: { roi: 'canvas' },
      expected: 'ページ内にゲーム canvas の矩形が1つ',
      got: det.reason,
      hint: '録画にブラウザのページ余白（白）が写っているか確認する。'
        + 'ページを全画面表示にすると背景推定が効かなくなる。',
    });
    return false;
  }
  const d = Math.abs(det.aspect - o.expectAspect);
  if (d > o.aspectTolerance) {
    diag.add('T1-ROI-002', 'WARN', {
      where: { roi: 'canvas', box: det.box },
      expected: `アスペクト比 ${o.expectAspect} ± ${o.aspectTolerance}`,
      got: det.aspect.toFixed(3),
      hint: 'canvas 以外（バナー等）を掴んでいる可能性。'
        + '⚠ 既定の期待値は 2026-08-14 の目測由来の暫定値で、未再測（PHASE9_PLAN §4 P1 ⑨-a）。',
    });
  }
  return true;
}
