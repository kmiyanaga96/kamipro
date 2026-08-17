// T1 録画転記 — P2-2 フレーム抽出（AI 不要）
//
// ★目的（PHASE9_PLAN.md §4 P2）: **コマ送りを消す**。
//   5分@30fps ＝ 約9,000フレームのうち、人が見る価値があるのは「何かが変わった瞬間」だけ。
//   出口条件は「**人が見るフレーム数が1桁減る**」。
//
// 方針:
//   - **ROI ごとに独立して差分を見る**。ダメージ ROI は毎ヒット変わるが HP ROI は稀にしか変わらない。
//     全画面の差分では**背景アニメや立ち絵の揺れ**に埋もれる（ゲーム画面は常に動いている）。
//   - **署名は縮小輝度グリッド**＝JPEG ノイズや微小な揺れに鈍く、構造変化に敏感。
//   - **閾値は実データで較正する**。∴ 判定するだけでなく **距離の分布を必ず出す**
//     （Claude は画面を見られないので、分布が唯一の較正材料＝§10.1）。
//
// 純関数（DOM 非依存）＝Node でセルフテストできる。

export const SELECT_DEFAULTS = {
  /** 署名グリッドの解像度。小さすぎると小さな数字の出現を見逃す。 */
  gridW: 24,
  gridH: 24,
  /**
   * この距離（0〜255 の平均絶対差）を超えたら「変化あり」とみなす。
   * ⚠ **未較正**（2026-08-14 時点）。ゲーム画面は背景が常時アニメーションしているため、
   *    静止時のベースライン距離がゼロにならない。実走の分布を見て決める。
   */
  threshold: 6.0,
  /**
   * 変化を検出したあと、続けて何フレーム採るか。
   * ポップアップは出現直後が最も重なりが少ないとは限らないため、少し余裕を持って拾う。
   */
  holdFrames: 2,
};

/**
 * ROI を縮小輝度グリッドに畳んだ署名を返す。
 * @returns {Uint8ClampedArray} 長さ gridW*gridH
 */
export function roiSignature(img, rect, opts = {}) {
  const o = { ...SELECT_DEFAULTS, ...opts };
  const sig = new Uint8ClampedArray(o.gridW * o.gridH);
  const cw = rect.w / o.gridW, ch = rect.h / o.gridH;
  for (let gy = 0; gy < o.gridH; gy++) {
    for (let gx = 0; gx < o.gridW; gx++) {
      const x0 = Math.round(rect.x + gx * cw), x1 = Math.max(x0 + 1, Math.round(rect.x + (gx + 1) * cw));
      const y0 = Math.round(rect.y + gy * ch), y1 = Math.max(y0 + 1, Math.round(rect.y + (gy + 1) * ch));
      let s = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        if (y < 0 || y >= img.height) continue;
        for (let x = x0; x < x1; x++) {
          if (x < 0 || x >= img.width) continue;
          const k = (y * img.width + x) * 4;
          s += 0.299 * img.data[k] + 0.587 * img.data[k + 1] + 0.114 * img.data[k + 2];
          n++;
        }
      }
      sig[gy * o.gridW + gx] = n ? s / n : 0;
    }
  }
  return sig;
}

/** 2つの署名の平均絶対差（0〜255）。 */
export function signatureDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/**
 * ★フレーム選別器。
 * 1本の走を通しで流し、**採用したフレームと距離の分布**を返す。
 *
 * ⚠ 判定結果だけでなく**分布を必ず持ち帰る**のが本クラスの要件。
 *    閾値は実データでしか決まらず、Claude は画面を見られないため（§10.1）。
 */
export class FrameSelector {
  constructor(opts = {}) {
    this.o = { ...SELECT_DEFAULTS, ...opts };
    this.prev = null;
    this.hold = 0;
    this.total = 0;
    this.kept = [];        // { t, dist, reason }
    this.distances = [];   // 全フレームの距離（分布＝較正材料）
  }

  /**
   * 1フレームを投入する。
   * @param {number} t   mediaTime（秒）
   * @param {Uint8ClampedArray} sig  roiSignature() の出力
   * @returns {boolean} 採用したか
   */
  push(t, sig) {
    this.total++;
    if (!this.prev) {
      this.prev = sig;
      this.kept.push({ t, dist: null, reason: 'first' });
      return true;                        // 最初の1枚は基準として必ず採る
    }
    const d = signatureDistance(this.prev, sig);
    this.distances.push(d);
    this.prev = sig;

    if (d >= this.o.threshold) {
      this.hold = this.o.holdFrames;
      this.kept.push({ t, dist: d, reason: 'change' });
      return true;
    }
    if (this.hold > 0) {
      this.hold--;
      this.kept.push({ t, dist: d, reason: 'hold' });
      return true;
    }
    return false;
  }

  /** 距離の分位点（分布の形を1行で持ち帰るため）。 */
  quantiles(ps = [0.5, 0.9, 0.99]) {
    if (!this.distances.length) return null;
    const a = [...this.distances].sort((x, y) => x - y);
    const q = {};
    for (const p of ps) q[`p${Math.round(p * 100)}`] = a[Math.min(a.length - 1, Math.floor(p * a.length))];
    return { min: a[0], max: a[a.length - 1], ...q };
  }

  /** ★§4 P2 の出口条件（人が見るフレーム数が1桁減ったか）を数値で返す。 */
  summary() {
    const reduction = this.total ? this.kept.length / this.total : 1;
    return {
      totalFrames: this.total,
      keptFrames: this.kept.length,
      keptRatio: reduction,
      reductionFactor: reduction > 0 ? 1 / reduction : null,
      /** 出口条件＝1桁減（10分の1以下）。 */
      meetsExitCriterion: reduction <= 0.1,
      threshold: this.o.threshold,
      distanceQuantiles: this.quantiles(),
    };
  }
}

/**
 * 選別結果を Diag に載せる。
 * ⚠ **閾値が外れていても FATAL にしない**＝分布を持ち帰ることのほうが価値がある（§10.5-2）。
 */
export function reportSelection(diag, sum) {
  if (!sum.totalFrames) {
    diag.add('T1-DETECT-001', 'ERROR', {
      expected: '1フレーム以上の走査',
      got: '0フレーム',
      hint: 'タブを前面にして再実行する（背景タブでは再生が抑制される）',
    });
    return false;
  }
  if (!sum.meetsExitCriterion) {
    // ★2026-08-15 にユーザー承認で **WARN → INFO** へ落とした。
    //   採用率 10% は**もう P2 の出口条件ではない**（削減は P3-2＝OCR 後のイベント畳み込みへ移設）。
    //   ⚠ 出口条件でなくなったものを WARN で鳴らし続けるのは誤導なので severity を下げる。
    //   分布自体は較正材料として有用なので**出力は残す**。
    diag.add('T1-DETECT-002', 'INFO', {
      where: { threshold: sum.threshold },
      expected: '（参考）採用率 10% 以下。★これは P2 の出口条件ではなくなった（P3-2 へ移設）',
      got: `採用率 ${(sum.keptRatio * 100).toFixed(1)}%（${sum.keptFrames}/${sum.totalFrames}）`,
      hint: `距離の分位点 ${JSON.stringify(sum.distanceQuantiles)}。`
        + 'ゲーム画面は背景が常時アニメーションするためベースラインがゼロにならない＝'
        + '**変化検出でフレームを減らす路線は close 済み**（P2-2）。分布は較正材料として残している。',
    });
  }
  return true;
}
