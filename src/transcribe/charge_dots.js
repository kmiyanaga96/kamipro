// T1 録画転記 — P2-5b: チャージターン（CT）ドットの抽出
//
// ★なぜ要るか: CT は**敵の限定行動の発動条件**（`gamedata/md/敵/*` に「チャージターンが最大でない」多数）で、
//   **シムには一切実装が無い**（`charge` 系の記述がゼロ）。
//   ∴ ドットは「マスクすべき邪魔物」ではなく **C45（敵の行動モデル）の観測値**そのもの
//   ＝Phase 9 が C45 に対して開ける唯一の観測経路（PHASE9_PLAN §4 P2 の新発見⑭）。
//
// ⚠⚠ **ドットの個数を定数にしてはいけない**。一次情報に**最大CT が戦闘中に変わる**記述がある:
//   `cath_palug.md`「自分の**最大チャージターンを2つ減少**する」／
//   `ryomen_sukuna.md`「敵からの**最大チャージターン増加**無効」。
//   ∴ **個数は毎フレーム画像から数える**。そして**個数が変わったこと自体が観測すべきイベント**。
//
// ── 設計原則（本セッションで積み上がった教訓をそのまま適用）────────────────
//
//   ①★**位置で解ける問題を色で解こうとしない**（P2-5 の失敗4）。
//     ドットは**等間隔に並ぶ**＝**周期性**という幾何の性質で見つける。「灰色を探す」はしない
//     （バーの塗り部分の上と空部分の上とで、同じドットが別の色に見えるため）。
//   ②★**閾値・個数を推測で埋めない**（P2-5 の失敗7・P2-4 の stride）。
//     点灯/消灯の**エンコード（どちらが明るいか）は未知**なので、**判定しない**。
//   ③★**診断は必ず生データを返す**（P2-5 で実際に一発で原因が割れた）。
//     中央帯の列プロファイルと周期スキャンの全曲線を返す。**外していても次の一手が決まる**。
//   ④★**正解ラベル無しの健全性検査**（HP 単調性と同じ発想）:
//     **CT は毎フレーム変わらない**（ターン境界でしか動かない）＝**変化が頻繁なら抽出が壊れている**。
//   ⑤★**測定器は既知の正解を動かして追随を見るまで信用しない**（P2-4 で2つ捨てた教訓）。
//     セルフテストは**ドット数と点灯数を振って、推定が追随すること**を検査する。
//
// ⚠ 入力は **`ROIS.hpbar` の crop**（バーそのもの）。`hp_bar.js` と同じ。
//   ドットは**バーの上下ではなく中央**にあるので、`hp_bar.js` が避けている**中央帯**を見る
//   （＝2つのモジュールは同じ crop の別の行を見ており、互いに干渉しない）。
//
// 純関数（DOM 非依存）＝Node でセルフテストできる。

import { fitStepEdge } from './hp_bar.js';

export const CT_DEFAULTS = {
  /**
   * 読み取り用に**毎フレームのプロファイルを保存する帯**（ROI 高さに対する比）。
   * ⚠ 幾何の探索はこの帯だけでなく **`bandCount` 本の帯すべて**で行う（下記）。
   */
  band: [0.30, 0.70],
  /**
   * ★★**縦方向にも探す**（2026-08-17 追加）。
   *
   * ⚠ 初版は「ドットはバーの中央にある」という**前提**で1本の帯しか見ていなかった。
   *   実走で見つかった等間隔構造は**ユーザー確認の結果「バーの目盛り・模様」**であり、
   *   **CT ドットではなかった**＝**そもそも見る行が違った可能性がある**。
   *   ∴ ROI の高さを `bandCount` 本に割って**すべての帯で周期構造を探し、どこにあるかを報告する**。
   *   ★**どの行にあるかを人に訊く代わりに、走査に答えさせる**（憲法＝転記はツール）。
   */
  bandCount: 8,
  /**
   * ★**既知の非CT領域**（ROI 幅に対する比）。ここで見つかった周期構造は CT と呼ばない。
   *
   * ⚠ provenance: **ユーザー確認 2026-08-17**＝`M3-1.mp4` の HP バーで、
   *   **左から 53〜69%** に等間隔（間隔 ≈ バー幅の 3.3%・6山）の構造があり、
   *   これは「**バーの目盛り・模様など**」＝CT ドットではないと回答された。
   *   ★**1点観測**（1つの録画・1つの敵）＝別の敵・UI 更新では未再測（E9）。
   *   ⚠ **これを「見つけた」と報告してしまうのは、見つからないより悪い**（偽の CT を作る）。
   */
  knownDecorX: [0.50, 0.72],
  /**
   * 探索するドット間隔（ROI 幅に対する比）の範囲。
   * ⚠ **個数を決め打ちしない**ための範囲指定（個数 = 幅 / 間隔）。
   *
   * ★**下限は実測で広げた**（2026-08-15→17）。初版は 1/14（=45px）だったが、
   *   実走の集約プロファイルに現れた周期は **21.3px（= 幅の 1/30）**＝**最初から探索範囲の外**だった。
   *   ∴ 「見つからない」は検出器の失敗ではなく**探す場所が違った**（provenance: `M3-1.mp4` 120秒走）。
   *   ⚠ **勘で広げたのではない**＝集約プロファイルの山の間隔を実測して決めた。
   */
  minPeriodRatio: 1 / 40,
  maxPeriodRatio: 1 / 3,
  /**
   * ★周期を探す窓の幅（ROI 幅に対する比）と刻み。
   * ⚠ **全域の自己相関では見つからない**（2026-08-17 実測）＝
   *   実走では周期構造が **バー幅の約 16%（x 341〜443px）にしか無く**、全域で測ると希釈されて
   *   スコアが**負**になった（-0.047）。同じ列を窓 bin62〜88 に絞ると **0.518**。
   *   ★**局所にしか無い構造は、局所で測る**。窓の位置自体も観測値（どこにドットがあるか）。
   */
  windowRatio: 0.25,
  windowStepRatio: 0.10,
  /**
   * ★窓の中に周期が何回入ることを要求するか。
   * ⚠ 調整つまみではなく**測定が成立する条件**（1〜2周期では自己相関に意味が無い）。
   * `panel_mode.js` が list 判定で「4回以上の繰り返し」を要求しているのと同じ根拠。
   */
  minRepeats: 4,
  /** 周期スキャンの刻み（画素）。 */
  periodStep: 1,
  /**
   * ★倍音より基本周期を優先する幅。最大スコアの (1-margin) 倍以上のうち**最短の周期**を採る。
   * ⚠ 調整つまみではなく**多義性の解消規則**（等間隔の並びは 2P・3P でも相関が残るため）。
   */
  harmonicMargin: 0.10,
  /**
   * 周期性がこの相関を超えなければ「ドット列が見つからない」とする。
   * ⚠ **未較正**（合成フィクスチャ由来の暫定値）。実フレームの `periodScan` 分布で決め直す。
   *   ここを外しても `centerProfile` と `periodScan` は必ず返るので、次の一手は決まる。
   */
  periodicityFloor: 0.35,
  /** プロファイルを診断に載せるときの間引き後の長さ。 */
  profileBins: 120,
  /** 上下帯方式と同じ最小高さ（これ未満だと中央帯が取れない）。 */
  minHeight: 6,
};

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function downsample(arr, bins) {
  if (arr.length <= bins) return Array.from(arr, (v) => +v.toFixed(3));
  const out = [];
  for (let i = 0; i < bins; i++) {
    const a = Math.floor(i * arr.length / bins), b = Math.floor((i + 1) * arr.length / bins);
    let s = 0;
    for (let j = a; j < b; j++) s += arr[j];
    out.push(+(s / Math.max(1, b - a)).toFixed(3));
  }
  return out;
}

/**
 * ★**移動平均を引いて低周波を落とす**（高域通過）。
 *
 * ⚠⚠ これが無いと周期検出が成立しない（実装時に実際に失敗した）。
 *   中央帯のプロファイルは **バーの塗り境界という巨大な段差**（塗り部 vs 空部）に支配されており、
 *   自己相関はその段差ばかりを見てドットの周期を拾えない（合成で score 0.24＝検出できず）。
 *   ★**捕まえたい信号（等間隔のドット＝高周波）より、邪魔な信号（段差＝低周波）が大きい**という
 *   構図は本 Phase で繰り返し出てくる（ラグ曲線でも背景が床を作っていた）。
 *   ∴ **スケールで分離する**＝ドット間隔より広い窓の移動平均を引く。
 *   ⚠ 窓幅は「探索する最大周期」から決まる＝**新しい調整つまみではない**。
 */
function highpass(prof, win) {
  const W = prof.length, out = new Float64Array(W);
  const half = Math.max(1, Math.min(Math.floor(win / 2), W - 1));
  // ⚠⚠ **端は反射パディングで埋める**（実装時に実際に踏んだ）。
  //   窓を配列の端で切り詰めると、平坦な領域でも**端だけベースラインがずれて残差が出る**＝
  //   **偽のドットが両端に1個ずつ生える**（合成でドット数が必ず n+1 になった）。
  //   ∴ 反射で埋めて、どの位置でも同じ幅の窓で平均する。
  const N = W + 2 * half;
  const pad = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let k = i - half;
    if (k < 0) k = -k;                       // 左端で反射
    if (k >= W) k = 2 * W - 2 - k;           // 右端で反射
    pad[i] = prof[Math.max(0, Math.min(W - 1, k))];
  }
  const cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + pad[i];
  const win2 = 2 * half + 1;
  for (let i = 0; i < W; i++) out[i] = prof[i] - (cum[i + win2] - cum[i]) / win2;
  return out;
}

/** 平均0・分散1へ（明るさ・コントラストの差を吸収する）。 */
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

/** ラグ k の自己相関（standardize 済みの配列に対して）。 */
function autocorr(z, k) {
  if (k <= 0 || k >= z.length) return 0;
  let s = 0;
  for (let i = 0; i + k < z.length; i++) s += z[i] * z[i + k];
  return s / (z.length - k);
}

/**
 * ★等間隔に並ぶドット列の**間隔**を、周期性から求める。
 *
 * ⚠ **単一ラグだけを見ない**（`panel_mode.js` が同じ罠で一度失敗している）。
 *   ドットは3個以上並ぶので **2倍のラグでも相関が残る**。
 *   score = min(autocorr(P), autocorr(2P)) にして「**繰り返している**」性質だけを拾う。
 *
 * @returns {{best:{period,score}|null, scan:Array<{period,score}>}}
 */
export function scanPeriod(profile, opts = {}) {
  const o = { ...CT_DEFAULTS, ...opts };
  const W = profile.length;
  // ★周期の下限は **ROI 幅**から決める（窓の幅からではない）＝窓を狭めても物理的な下限は変わらない。
  const lo = Math.max(2, o.minPeriodPx ?? Math.floor(W * o.minPeriodRatio));
  // ★★上限は「**窓の中に周期が `minRepeats` 回以上入ること**」で決める。
  //   ⚠ これが無いと、窓に1〜2周期しか入らない状態で自己相関を測ってしまい、
  //   **意味のないスコアが最良として選ばれる**（実装時に実際に踏んだ＝ドット3個の合成で
  //   周期 160px が窓 160px に1回しか入らず、代わりに 4px を掴んで 14 個と答えた）。
  //   ★`panel_mode.js` の「4回以上の繰り返しという list 固有の性質だけを拾う」と同じ規則。
  const hi = Math.min(o.maxPeriodPx ?? Math.floor(W / o.minRepeats),
    Math.floor(W / o.minRepeats), Math.ceil(W * o.maxPeriodRatio));
  if (hi <= lo) return { best: null, scan: [] };
  // ★段差（バーの塗り境界）を落としてから周期を見る（上の highpass の注記）
  const z = standardize(highpass(profile, hi * 2));
  const scan = [];
  let top = null;
  for (let p = lo; p <= hi; p += o.periodStep) {
    const a1 = autocorr(z, p);
    const a2 = 2 * p < W ? autocorr(z, 2 * p) : a1;
    const score = Math.min(a1, a2);
    scan.push({ period: p, score: +score.toFixed(4) });
    if (!top || score > top.score) top = { period: p, score: +score.toFixed(4) };
  }
  // ★★**倍音ではなく基本周期を採る**（実装時に実際に 2P を掴んだ＝ドット5個で P=106 なのに 212 を返した）。
  //   等間隔に並ぶものは **2P・3P でも相関が残る**ので、最大値をそのまま採ると「1個おき」を周期と誤る。
  //   ∴ **最大値と同程度に良いもののうち、最も短い周期**を選ぶ（音声の基本周波数推定と同じ定石）。
  //   ⚠ これは調整つまみではなく**多義性の解消規則**＝スコアが同程度なら短い方が真の周期である。
  const best = top && top.score > 0
    ? (scan.find(s => s.score >= top.score * (1 - o.harmonicMargin)) ?? top)
    : top;
  return { best, scan, top };
}

/**
 * ★1フレームから**中央帯の列プロファイル**を取り出す（ここでは判定を一切しない）。
 *
 * ⚠⚠ **幾何（ドットの間隔と位置）を1フレームから決めようとして失敗した**（実装時・合成で score 0.24→0.09）。
 *   理由は2つとも構造的:
 *     ①**バーの塗り境界という巨大な段差**が周期の検出を支配する（高域通過で緩和したが足りない）
 *     ②**消灯ドットはバーの塗りとほぼ同じ明るさ**になりうる＝1フレームでは「並び」が見えない
 *   ★∴ **時間方向に集約する**（`ChargeDotTracker`）。
 *   **バーの塗り境界は HP とともに動くが、ドットは動かない**＝
 *   フレーム間で平均すると**段差は均され、ドットだけが残る**。
 *   ⭐ 1枚で解こうとせず、**動くもの／動かないもので分離する**のがこの問題の正しい切り口。
 *
 * @param {{width,height,data}} img `ROIS.hpbar` の crop（原点基準）
 * @returns {{ok, band?, profile?, centerProfile?, reason?}}
 */
export function centerBandProfile(img, opts = {}) {
  const o = { ...CT_DEFAULTS, ...opts };
  if (!img?.width || !img?.height) return { ok: false, reason: '画像が空', centerProfile: null };
  if (img.height < o.minHeight) {
    return { ok: false, centerProfile: null,
      reason: `ROI が低すぎる（${img.height}px < ${o.minHeight}px）＝中央帯を取れない` };
  }
  const y0 = Math.max(0, Math.floor(img.height * o.band[0]));
  const y1 = Math.min(img.height, Math.ceil(img.height * o.band[1]));
  const rows = y1 - y0;
  if (rows < 1) return { ok: false, reason: '中央帯が薄すぎる', centerProfile: null };

  const prof = new Float32Array(img.width);
  for (let x = 0; x < img.width; x++) {
    let s = 0;
    for (let y = y0; y < y1; y++) {
      const k = (y * img.width + x) * 4;
      s += lum(img.data[k], img.data[k + 1], img.data[k + 2]);
    }
    prof[x] = s / rows;
  }
  return { ok: true, band: [y0, y1], profile: prof, centerProfile: downsample(prof, o.profileBins) };
}

/**
 * ★★CT ドットの追跡器。**幾何は走全体から1回だけ決め、読み取りは各フレームで行う**。
 *
 * ⭐ 要点＝**動くもの（バーの塗り境界）と動かないもの（ドット）を時間で分離する**。
 *   走全体で「高域通過したプロファイルの絶対値」を平均すると、
 *   **HP とともに移動する段差は均されて消え、位置が固定のドットだけが山として残る**。
 *
 * ⚠ 個数は**決め打ちしない**（一次情報に最大CT の増減がある）＝間隔を掃いて周期から数える。
 */
export class ChargeDotTracker {
  constructor(opts = {}) {
    this.o = { ...CT_DEFAULTS, ...opts };
    this.times = [];
    this.profiles = [];
    this.skipped = 0;
    this.width = 0;
  }

  push(t, img) {
    // ★★縦方向の全帯について集約だけ貯める（メモリは 8×幅 の配列だけ＝ただ同然）
    if (img?.width && img?.height >= this.o.minHeight) {
      if (!this.bandAcc) {
        this.bandW = img.width;
        this.bandAcc = Array.from({ length: this.o.bandCount }, () => new Float64Array(img.width));
        this.bandN = 0;
      }
      if (img.width === this.bandW) {
        const hi = Math.min(Math.floor(this.bandW / 2), Math.ceil(this.bandW * this.o.maxPeriodRatio));
        for (let b = 0; b < this.o.bandCount; b++) {
          const y0 = Math.floor(img.height * b / this.o.bandCount);
          const y1 = Math.max(y0 + 1, Math.floor(img.height * (b + 1) / this.o.bandCount));
          const prof = new Float64Array(img.width);
          for (let x = 0; x < img.width; x++) {
            let sum = 0;
            for (let y = y0; y < y1; y++) {
              const k = (y * img.width + x) * 4;
              sum += lum(img.data[k], img.data[k + 1], img.data[k + 2]);
            }
            prof[x] = sum / (y1 - y0);
          }
          const hp = highpass(prof, hi * 2);
          const acc = this.bandAcc[b];
          for (let x = 0; x < this.bandW; x++) acc[x] += Math.abs(hp[x]);
        }
        this.bandN++;
      }
    }

    const r = centerBandProfile(img, this.o);
    if (!r.ok) { this.skipped++; return r; }
    if (!this.width) this.width = r.profile.length;
    if (r.profile.length !== this.width) { this.skipped++; return { ok: false, reason: '幅が揃わない' }; }
    this.times.push(t);
    this.profiles.push(r.profile);
    return r;
  }

  /**
   * ★★**帯ごとに周期構造を探し、どこにあるかを報告する**（縦の探索）。
   * ⚠ 既知の装飾領域（`knownDecorX`）に当たったものは **`decor: true` と明示**する＝
   *   **見つけたと言ってしまうのは、見つからないより悪い**。
   */
  scanBands() {
    if (!this.bandAcc || !this.bandN) return [];
    const minPx = Math.max(2, Math.round(this.bandW * this.o.minPeriodRatio));
    const winW = Math.max(8, Math.round(this.bandW * this.o.windowRatio));
    const step = Math.max(1, Math.round(this.bandW * this.o.windowStepRatio));
    const [dx0, dx1] = this.o.knownDecorX;
    return this.bandAcc.map((accRaw, b) => {
      const acc = Array.from(accRaw, (v) => v / this.bandN);
      let best = null;
      for (let a = 0; a + winW <= this.bandW; a += step) {
        const r = scanPeriod(acc.slice(a, a + winW), { ...this.o, minPeriodPx: minPx });
        if (r.best && (!best || r.best.score > best.score)) {
          best = { from: a, to: a + winW, period: r.best.period, score: r.best.score };
        }
      }
      const mid = best ? (best.from + best.to) / 2 / this.bandW : null;
      return {
        band: [+(b / this.o.bandCount).toFixed(3), +((b + 1) / this.o.bandCount).toFixed(3)],
        best,
        /** ★既知の装飾（ユーザー確認 2026-08-17）と重なるか＝CT と呼んではいけない。 */
        decor: mid != null && mid >= dx0 && mid <= dx1,
        profile: downsample(acc, this.o.profileBins),
      };
    });
  }

  /** ★走全体を集約して幾何を決める。 */
  solveGeometry() {
    if (this.profiles.length < 2 || !this.width) return { found: false, reason: 'フレームが足りない' };
    const hi = Math.min(Math.floor(this.width / 2), Math.ceil(this.width * this.o.maxPeriodRatio));
    const acc = new Float64Array(this.width);
    for (const p of this.profiles) {
      const hp = highpass(p, hi * 2);
      for (let x = 0; x < this.width; x++) acc[x] += Math.abs(hp[x]);
    }
    for (let x = 0; x < this.width; x++) acc[x] /= this.profiles.length;

    // ★★**窓を切って探す**（全域だと局所構造が希釈される＝実走で実際にそうなった）。
    //   窓ごとの最良周期を全部返す＝**どこに構造があるか**自体が観測値になる。
    const winW = Math.max(8, Math.round(this.width * this.o.windowRatio));
    const step = Math.max(1, Math.round(this.width * this.o.windowStepRatio));
    const minPx = Math.max(2, Math.round(this.width * this.o.minPeriodRatio));
    const windows = [];
    for (let a = 0; a + winW <= this.width; a += step) {
      const sub = acc.slice(a, a + winW);
      const r = scanPeriod(sub, { ...this.o, minPeriodPx: minPx });
      if (r.best) windows.push({ from: a, to: a + winW, period: r.best.period, score: r.best.score });
    }
    const full = scanPeriod(acc, { ...this.o, minPeriodPx: minPx });
    if (full.best) windows.push({ from: 0, to: this.width, period: full.best.period, score: full.best.score });
    windows.sort((x, y) => y.score - x.score);
    const win = windows[0] ?? null;
    const best = win ? { period: win.period, score: win.score } : null;
    const scan = full.scan;
    const bandScan = this.scanBands();
    const out = {
      /** ★★**帯ごとの探索結果**＝縦のどこに周期構造があるか。**これが今の主要な生データ**。 */
      bandScan,
      /** ★窓ごとの最良周期（上位）。**どこに周期構造があるか**が読める生データ。 */
      windowScan: windows.slice(0, 12),
      /** ★採用した窓（構造のある範囲）。 */
      window: win ? { from: win.from, to: win.to } : null,
      /** ★集約プロファイル＝**これが幾何の生データ**（外していても次の一手が決まる）。 */
      meanProfile: downsample(acc, this.o.profileBins),
      periodScan: scan.filter((_, i) => i % Math.max(1, Math.ceil(scan.length / 40)) === 0),
      bestPeriod: best,
      frames: this.profiles.length,
    };
    if (!best || best.score < this.o.periodicityFloor) {
      return { ...out, found: false,
        reason: `ドット列の周期性が弱い（score ${best ? best.score : '-'} < ${this.o.periodicityFloor}）` };
    }
    const P = best.period;
    // ★位相も**構造のある窓の中**で決める（窓の外は別の物＝バーの塗り境界の掃引など）
    const wa = win.from, wb = win.to;
    let phase = 0, bestMag = -Infinity;
    for (let ph = 0; ph < P; ph++) {
      let s = 0, n = 0;
      for (let x = wa + ph; x < wb; x += P) { s += acc[x]; n++; }
      const m = n ? s / n : -Infinity;
      if (m > bestMag) { bestMag = m; phase = wa + ph; }
    }
    // ★ドットは「**周期の格子のうち、実際に山になっている**」位置だけ採る。
    //   ⚠ 格子には端の空白も並ぶので、そのまま数えると**必ず1個多くなる**（実装時に n+1 を返した）。
    //   ∴ **隣の谷（±P/2）より高いか**という**局所の形**で判定する＝
    //   全体に対する閾値を置かずに済む（★位置で解ける問題を閾値で解こうとしない）。
    const at = (x) => (x >= 0 && x < this.width ? acc[x] : null);
    const centers = [];
    for (let x = phase; x < wb; x += P) {
      const h = Math.round(P / 2);
      const l = at(x - h), r = at(x + h);
      // ⚠ **両隣の谷が ROI 内にあることを要求する**。片側しか無い格子点＝ROI の端であり、
      //   そこは判定材料が足りない。片側で代用すると**端に必ず偽のドットが1個生える**
      //   （実装時に合成でドット数が n+1 になった）。
      //   ⚠ 代償＝**ROI の端ぎりぎりにある本物のドットは落とす**。採寸に余白を持たせることで避ける。
      if (l == null || r == null) continue;
      if (acc[x] > l && acc[x] > r) centers.push(x);
    }
    // ★★見つけた構造が**既知の装飾**の範囲なら「CT を見つけた」と言ってはいけない。
    const mid = (win.from + win.to) / 2 / this.width;
    const [dx0, dx1] = this.o.knownDecorX;
    const isDecor = mid >= dx0 && mid <= dx1;
    if (isDecor) {
      return { ...out, found: false, decor: true, period: P, phase, centers,
        dotCount: centers.length,
        reason: `見つかった周期構造は既知の装飾の位置（バー幅の ${(mid * 100).toFixed(0)}%・`
          + 'ユーザー確認 2026-08-17「バーの目盛り・模様」）＝CT ドットではない。'
          + '★`bandScan` で他の帯を見る。' };
    }
    return { ...out, found: centers.length >= 2, decor: false, period: P, phase, centers,
      dotCount: centers.length,
      reason: centers.length >= 2 ? undefined : 'ドットらしい位置が2個未満' };
  }

  /**
   * 幾何が決まったあと、各フレームのドットの見え方を読む。
   *
   * ⚠⚠ **生の明るさではなく「高域通過後の値」を読む**（実装時に実際に踏んだ）。
   *   ドットの読み値は**背後にあるもの**（バーの塗りか空部か）に汚染される＝
   *   **HP が減って塗りがドットを通り過ぎるだけで読み値が動く**。
   *   高域通過は**局所の背景を差し引く**ので、「まわりに対してどれだけ目立つか」だけが残り、
   *   塗りの位置に依存しなくなる。★これも「動くもの／動かないもので分離する」の一環。
   *
   * ⚠ **一様なとき（全点灯 or 全消灯）は境界が存在しない**＝`filledPrefix: null` を返す。
   *   ★HPバーの「満タンは読めないと言う」と**まったく同じ扱い**（数値を捏造しない）。
   *   0 と最大のどちらなのかは**系列（鋸波）でしか決まらない**。
   */
  readSeries(geom) {
    if (!geom?.found) return [];
    const half = Math.max(1, Math.floor(geom.period / 4));
    // ★ベースラインの尺度は**ドット間隔**にする（ROI 全体ではない）。
    //   広い窓だと**バーの塗り境界という局所の段差が引き切れず**、
    //   HP が減ってドットの背後が塗り→空へ変わるだけで読み値が動いた（実装時に実際に踏んだ）。
    const hpWin = Math.max(4, geom.period);
    return this.profiles.map((prof, i) => {
      const hp = highpass(prof, hpWin);
      const dots = geom.centers.map((cx) => {
        let s = 0, n = 0;
        for (let d = -half; d <= half; d++) {
          const x = cx + d;
          if (x < 0 || x >= hp.length) continue;
          s += hp[x]; n++;
        }
        return +(s / Math.max(1, n)).toFixed(2);
      });
      const fit = dots.length >= 2 ? fitStepEdge(dots) : null;
      // ★**段差の大きさ**を必ず返す。**一様なフレーム（全点灯 or 全消灯）では ≈0 になる**＝
      //   「0 個なのか最大なのか」を**画像だけでは決められない**ことが数値に出る。
      //   ⚠ ここで「一様かどうか」を閾値で断定しない＝**エンコードが未確認だから**。
      //   実走の `stepSize` 分布を見てから決める（HPバーの `colProfile` と同じ手順）。
      const stepSize = fit && fit.rightMean != null
        ? +(fit.leftMean - fit.rightMean).toFixed(2) : 0;
      return {
        t: this.times[i], dots,
        filledPrefix: fit ? fit.edge : null,
        /** ★前側集団と後側集団の差。**≈0 なら境界は無い**（＝全点灯 or 全消灯）。 */
        stepSize,
      };
    });
  }
}

/**
 * ★CT 系列の検証。**正解ラベル無しで抽出の健全性を判定する**（HP 単調性と同じ発想）。
 *
 * CT は**ターン境界でしか動かない**＝**毎フレーム変わっていたら抽出が壊れている**。
 * ⚠ 逆に**まったく変わらない**のも異常（CT は戦闘中に必ず動く）。
 *
 * ⭐ **ドット総数が変わったこと自体が観測値**（最大CT の増減＝一次情報にある実在の効果）。
 */
export class ChargeSeries {
  constructor() {
    this.rows = [];
    this.prefixChanges = [];
  }

  /** `ChargeDotTracker.readSeries()` の出力を流し込む。 */
  ingest(rows) {
    this.rows = rows;
    this.prefixChanges = [];
    let prev = null;
    for (const r of rows) {
      if (prev != null && r.filledPrefix !== prev) {
        this.prefixChanges.push({ t: +r.t.toFixed(4), from: prev, to: r.filledPrefix });
      }
      prev = r.filledPrefix;
    }
    return this;
  }

  summary(seconds) {
    if (!this.rows.length) return null;
    const hist = new Map();
    for (const r of this.rows) hist.set(r.filledPrefix, (hist.get(r.filledPrefix) ?? 0) + 1);
    return {
      frames: this.rows.length,
      /** ★点灯候補の変化回数。**ターン境界でしか動かないはず**。 */
      prefixChanges: this.prefixChanges.length,
      prefixChangeSample: this.prefixChanges.slice(0, 20),
      /** ★1秒あたりの変化回数。**大きければ抽出が壊れている**（CT はターン単位でしか動かない）。 */
      prefixChangesPerSecond: seconds ? +(this.prefixChanges.length / seconds).toFixed(3) : null,
      /** 観測された値の分布（生データ）。 */
      prefixHistogram: Object.fromEntries([...hist.entries()].sort((a, b) => a[0] - b[0])),
    };
  }
}

/** 診断へ載せる。⚠ **抽出できなくても集約プロファイルを返す**（次の一手を決めるため）。 */
export function reportChargeDots(diag, geom, sum) {
  if (!geom) {
    diag.add('T1-ROI-007', 'ERROR', {
      where: { roi: 'hpbar(中央帯)' },
      expected: 'CT ドット列の幾何',
      got: '解析に失敗（フレームが取れていない）',
      hint: '`hpbar` が未採寸か低すぎる。走査が0フレームでないかも確認する。',
    });
    return false;
  }
  if (!geom.found) {
    diag.add('T1-ROI-008', 'WARN', {
      where: { bestPeriod: geom.bestPeriod, frames: geom.frames },
      expected: `ドット列の周期性 ${CT_DEFAULTS.periodicityFloor} 以上`,
      got: geom.reason ?? '見つからない',
      hint: '★`ctGeometry.meanProfile`（走全体で集約した中央帯プロファイル）と `periodScan` を見る。'
        + '⚠ `periodicityFloor` は**合成フィクスチャ由来の未較正値**＝実測分布で決め直す（推測でいじらない）。'
        + '⚠ 集約プロファイルに山が見えないなら、ドットは中央帯の外にある可能性＝`band` を見直す。',
    });
    return true;
  }
  // ★正解ラベル無しの健全性検査: CT はターン境界でしか動かない。
  if (sum && sum.prefixChangesPerSecond != null && sum.prefixChangesPerSecond > 1.0) {
    diag.add('T1-ROI-009', 'WARN', {
      where: { prefixChangesPerSecond: sum.prefixChangesPerSecond, prefixChanges: sum.prefixChanges },
      expected: 'CT はターン境界でしか動かない（毎秒1回も変われば多すぎる）',
      got: `毎秒 ${sum.prefixChangesPerSecond} 回変化している`,
      hint: '★抽出が壊れている合図。ドットの明るさが演出やバーの塗りで揺れている可能性。'
        + '`prefixChangeSample` の時刻と `meanProfile` を突き合わせる。',
    });
  }
  return true;
}
