// T1 録画転記 — 右パネルの表示モード判定
//
// ★なぜ要るか（ユーザー回答 2026-08-14）:
//   右パネルは **同じ画面領域に2つの状態**を持つ。
//     list   … 5キャラ分の一覧（HP / BG / Abilityの色 / バフ列）＝**初期状態**
//     detail … 個別キャラ表示（Status / Burst / Ability の 2×2＋CD残ターン）
//   **アビリティ発動のたびに detail へ移り、1本の動画内で無数に行き来する**。
//   ∴ **モードを判定せずに ROI を解釈すると、別レイアウトを読んで静かに壊れる**。
//   これは「ROI を切る前に必ず通す関門」であって、後段の全解釈の前提条件。
//
// ★おまけの価値（これが本命かもしれない）:
//   list → detail の遷移は「**どのキャラが操作されたか**」を直接示す。
//   `TRANSCRIPTION_DESIGN.md` §3.3 の💡「演出を押下境界の検出に使えるかもしれない（要検証）」に対し、
//   **演出のフレーム差分より遥かにきれいな押下シグナル**が UI 側に存在していたことになる。
//
// 判定方法: **行方向の周期性 ── ただし「調和成分まで揃うこと」を要求する**。
//   list は同じ構造の帯が5つ縦に並ぶ＝行プロファイルが周期 L で自己相関を持ち、
//   **2L・3L でも高いまま**（4回以上繰り返すため）。
//   ⚠ **単一ラグ L だけを見ると detail を誤判定する**（2026-08-14 にセルフテストで実際に失敗した）。
//      detail にも **Ability の 2×2 グリッド**という縦の繰り返しがあり、その行ピッチが
//      たまたま h/5 に近いと L で高い相関が出る。**ただし2回しか繰り返さないので 3L では崩れる**。
//   ∴ score = min(autocorr(L), autocorr(2L), autocorr(3L))。
//      「4回以上の繰り返し」という list 固有の性質だけを拾う。
//   ⚠ 中身（HP の数字やバフの種類）には依存しない＝**構造だけを見る**ので編成が変わっても効く。
//
// 純関数（DOM 非依存）＝Node でセルフテストできる（PHASE9_PLAN.md §10.1）。

export const PANEL_DEFAULTS = {
  /** 一覧に並ぶキャラ数。編成が5人固定である前提（ゲーム仕様）。 */
  slots: 5,
  /**
   * 調和自己相関がこの値を超えたら list と判定する。
   * ★実フレームで較正済（2026-08-14・`pic.mp4`）: **list 0.806 / detail 0.073**＝分離 0.733。
   *   中点 0.44 を採る（両側の余裕を等しくする）。実測の余裕は ±0.37 ＝**桁で足りている**。
   * ⚠ **各クラス n=1 の観測**。編成・選択キャラ・バースト説明文の長さで score は動きうる。
   *   `warnBand` に入ったフレームは `T1-ROI-003` で可視化されるので、分布が集まったら見直す。
   */
  listThreshold: 0.44,
  /**
   * この幅に入ったら判定を WARN する（＝実測 2値の中間＝どちらとも言えない帯）。
   * 実測分離が 0.733 あるので、±0.15 は「本来なら誰も来ない領域」。来たら異常の合図。
   */
  warnBand: 0.15,
  /** 探索する周期の範囲（slots からの倍率）。UI の余白ぶんズレるため幅を持たせる。 */
  periodLo: 0.80,
  periodHi: 1.20,
};

/** 矩形内の行ごとの平均輝度プロファイル。 */
export function rowLuminanceProfile(img, rect) {
  const prof = new Float64Array(rect.h);
  for (let j = 0; j < rect.h; j++) {
    const y = rect.y + j;
    if (y < 0 || y >= img.height) continue;
    let s = 0, n = 0;
    for (let i = 0; i < rect.w; i++) {
      const x = rect.x + i;
      if (x < 0 || x >= img.width) continue;
      const k = (y * img.width + x) * 4;
      // Rec.601 の輝度。色ではなく構造を見るため彩度は捨てる。
      s += 0.299 * img.data[k] + 0.587 * img.data[k + 1] + 0.114 * img.data[k + 2];
      n++;
    }
    prof[j] = n ? s / n : 0;
  }
  return prof;
}

/** 平均0・分散1に正規化（明るさ・コントラストの違いを吸収する）。 */
function standardize(a) {
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  s = Math.sqrt(s / a.length) || 1;
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] - m) / s;
  return out;
}

/** 指定ラグの正規化自己相関。 */
function autocorr(a, lag) {
  const n = a.length - lag;
  if (n <= 1) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * a[i + lag];
  return s / n;
}

/**
 * ★右パネルの表示モードを判定する。
 * @param {{width,height,data}} img フレーム全体
 * @param {{x,y,w,h}} rect パネルの画素矩形（roiToPixels(box, ROIS.gauge)）
 * @returns {{mode:'list'|'detail', score:number, period:number|null, slotHeight:number|null}}
 */
export function detectPanelMode(img, rect, opts = {}) {
  const o = { ...PANEL_DEFAULTS, ...opts };
  const prof = standardize(rowLuminanceProfile(img, rect));

  const base = rect.h / o.slots;
  const lo = Math.max(2, Math.round(base * o.periodLo));
  const hi = Math.min(Math.floor(rect.h / 2), Math.round(base * o.periodHi));

  // ★調和成分まで見る（L だけだと detail の Ability 2×2 グリッドを list と誤判定する）。
  // min を採るので「L・2L・3L のすべてで高い」＝4回以上繰り返している場合しか通らない。
  const harmonicScore = (lag) => {
    let s = Infinity;
    for (let k = 1; k <= 3; k++) {
      const l = lag * k;
      if (l >= prof.length - 1) break;      // 標本が尽きたらそこまでの調和で判断する
      s = Math.min(s, autocorr(prof, l));
    }
    return s === Infinity ? -1 : s;
  };

  let best = { score: -Infinity, lag: null };
  for (let lag = lo; lag <= hi; lag++) {
    const c = harmonicScore(lag);
    if (c > best.score) best = { score: c, lag };
  }
  const isList = best.score >= o.listThreshold;
  return {
    mode: isList ? 'list' : 'detail',
    score: best.score,
    period: best.lag,
    slotHeight: isList && best.lag ? best.lag : null,
  };
}

/**
 * list モードのとき、各キャラ行の矩形を返す。
 * ⚠ 周期からの等分割＝UI の見出し余白は吸収しない。行内の細かい ROI は別途詰める。
 */
export function listSlotRects(rect, period, slots = PANEL_DEFAULTS.slots) {
  const out = [];
  for (let i = 0; i < slots; i++) {
    out.push({ x: rect.x, y: Math.round(rect.y + i * period), w: rect.w, h: Math.round(period) });
  }
  return out;
}

/**
 * 判定を Diag に載せる。
 * ⚠ **モード判定を FATAL にしない**。誤判定でその1フレームを捨てるより、
 *    score を出して**後から閾値を較正できる**ほうが価値が高い（§10.5-2 部分成功の保全）。
 */
export function reportPanelMode(diag, det, opts = {}) {
  const o = { ...PANEL_DEFAULTS, ...opts };
  const margin = Math.abs(det.score - o.listThreshold);
  if (margin < o.warnBand) {
    diag.add('T1-ROI-003', 'WARN', {
      where: { roi: 'gauge', mode: det.mode, score: det.score, period: det.period },
      expected: `list/detail の判定が閾値 ${o.listThreshold} から十分離れていること`,
      got: `score ${det.score.toFixed(3)}（差 ${margin.toFixed(3)}）`,
      hint: '実測では list 0.806 / detail 0.073 で分離 0.733 あった（2026-08-14・pic.mp4）。'
        + 'この帯に入るのは異常＝ROI のズレ・別画面・遷移中フレームを疑う。',
    });
  }
  return det.mode;
}
