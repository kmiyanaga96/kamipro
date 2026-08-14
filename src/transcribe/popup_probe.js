// T1 録画転記 — ポップアップ「存在」検出（P2-2 の設計やり直し）
//
// ★なぜ作り直したか（2026-08-14・M3-1.mp4 120秒の実走で判明）:
//   当初 P2-2 は **フレーム間の変化**でフレームを選別した。実走で **採用率 88.1%** となり失敗。
//   距離の分位点が原因を明かした ── **中央値 16.9 が閾値 6 の 2.8倍**、つまり
//   **`dmg` ROI は静止しない**。598×798 の中に敵スプライト・床グリッド・光エフェクトが入っており、
//   「背景に埋もれないよう ROI ごとに見る」という当初の対策では足りなかった。
//
//   ⚠ **閾値を p90（67.6）まで上げれば採用率は 10% になる**が、それは**この1走に当てた数字**であり、
//      低コントラストの本物のポップアップも一緒に落とす。**症状に合わせただけの修正**になる。
//
//   ★根本原因は**問いの立て方**だった:
//     欲しいのは「**前フレームから変わったか**」ではなく「**このフレームに数字が出ているか**」。
//     前者は背景アニメが常に真にしてしまう。後者は背景が動いていても影響を受けない。
//   ∴ **変化検出（temporal）から存在検出（appearance）へ切り替える**。
//
// 検出の手掛かり（P1 の `dmg` クロップ実物より）:
//   ダメージ数字は **金グラデ塗り＋濃い縁取り**＝**輝度が高く、青が相対的に低い**（金・クリーム色）。
//   宇宙背景（紫〜藍）とグリッド（マゼンタ）は青が高く、この向きで分離できる見込みがある。
//
// ⚠ **閾値は実走でしか決まらない**（P2-2 の失敗がまさにその教訓）。
//    ∴ 本モジュールは**まず「候補しきい値の格子で分布を測る」ことに徹する**。
//    判定を先に固定せず、**分布が二峰性を示す組み合わせを選んでから**閾値を決める。
//
// 純関数（DOM 非依存）＝Node でセルフテストできる。

/** 候補しきい値の格子。yThr=輝度・gThr=金らしさ（(R+G)/2 − B）。 */
export const PROBE_GRID = {
  yThr: [160, 190, 220],
  gThr: [20, 50, 80],
};

/**
 * ROI 内で「金色に光る画素」が占める割合を、しきい値の組ごとに返す。
 * @returns {Object<string, number>} キー `y{Y}g{G}` → 0〜1 の割合
 */
export function goldenFractions(img, rect, grid = PROBE_GRID) {
  const counts = {};
  for (const y of grid.yThr) for (const g of grid.gThr) counts[`y${y}g${g}`] = 0;
  let n = 0;

  // 走査は 2px 間引き（割合の推定に十分で、実時間再生に間に合わせるため）
  for (let py = rect.y; py < rect.y + rect.h; py += 2) {
    if (py < 0 || py >= img.height) continue;
    for (let px = rect.x; px < rect.x + rect.w; px += 2) {
      if (px < 0 || px >= img.width) continue;
      const k = (py * img.width + px) * 4;
      const R = img.data[k], G = img.data[k + 1], B = img.data[k + 2];
      const Y = 0.299 * R + 0.587 * G + 0.114 * B;
      const gold = (R + G) / 2 - B;          // 金・クリームで大きく、青紫の背景で小さい（負にもなる）
      n++;
      for (const yt of grid.yThr) {
        if (Y <= yt) continue;
        for (const gt of grid.gThr) {
          if (gold > gt) counts[`y${yt}g${gt}`]++;
        }
      }
    }
  }
  const out = {};
  for (const key of Object.keys(counts)) out[key] = n ? counts[key] / n : 0;
  return out;
}

/**
 * 走を通して割合の分布を溜め、しきい値の組ごとに「二峰性の強さ」を評価する。
 *
 * ★二峰性を見る理由: ポップアップの有無は本来2状態なので、
 *   **良い特徴量なら分布が2つの山に割れる**。割れない組み合わせは特徴量として使えない。
 *   これは「正解ラベルが無くても特徴量の良し悪しを判定できる」ための設計。
 */
export class PopupProbe {
  constructor(grid = PROBE_GRID) {
    this.grid = grid;
    this.series = {};
    for (const y of grid.yThr) for (const g of grid.gThr) this.series[`y${y}g${g}`] = [];
  }

  push(fractions) {
    for (const k of Object.keys(this.series)) this.series[k].push(fractions[k] ?? 0);
  }

  /**
   * 各組の分位点と、**分割の質**を返す。
   *
   * ⚠ **大津法の分離度（クラス間分散/全分散）は使わない**。
   *    分割点を最大化して選ぶ量なので、**単峰分布でも高く出る**
   *    （2026-08-14 に実測: 一様分布 0.750 / 正規分布 0.669）。
   *    これを品質指標にすると「割れていない特徴量」を見抜けない。
   * ★代わりに **Fisher 型の分離**を使う: |m1 − m0| / (sd0 + sd1)。
   *    山の間隔を山の広がりで割るので、連続分布では 1〜2 程度にしかならず、
   *    本当に2つの塊に割れているときだけ大きくなる。
   *    目安（同日実測）: 一様 1.73 ／ 正規 1.32 ／ 分離した2峰 10 以上。
   */
  report() {
    const out = {};
    for (const [key, arr] of Object.entries(this.series)) {
      if (!arr.length) { out[key] = null; continue; }
      const a = [...arr].sort((x, y) => x - y);
      const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
      const mean = a.reduce((s, v) => s + v, 0) / a.length;
      const varAll = a.reduce((s, v) => s + (v - mean) ** 2, 0) / a.length;

      // 分割点は大津法で選ぶ（クラス間分散が最大の点）。**質の評価には使わない**（上記の注記）。
      let best = { cut: null, between: 0, i: 0 };
      for (let i = 1; i < a.length; i++) {
        if (a[i] === a[i - 1]) continue;
        const w0 = i / a.length, w1 = 1 - w0;
        const m0 = a.slice(0, i).reduce((s, v) => s + v, 0) / i;
        const m1 = a.slice(i).reduce((s, v) => s + v, 0) / (a.length - i);
        const between = w0 * w1 * (m0 - m1) ** 2;
        if (between > best.between) best = { cut: (a[i - 1] + a[i]) / 2, between, i };
      }

      // ★Fisher 型の分離＝|m1−m0| / (sd0+sd1)。連続分布では小さく、2峰なら大きい。
      let bimodality = 0;
      if (best.i > 0 && best.i < a.length) {
        const lo = a.slice(0, best.i), hi = a.slice(best.i);
        const mn = (v) => v.reduce((s, x) => s + x, 0) / v.length;
        const sd = (v, m) => Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
        const m0 = mn(lo), m1 = mn(hi);
        const spread = sd(lo, m0) + sd(hi, m1);
        // 両クラスとも分散ゼロ（完全な2点分布）なら上限で打ち切る
        bimodality = spread > 1e-9 ? Math.abs(m1 - m0) / spread : 999;
      }

      out[key] = {
        p10: q(0.10), p50: q(0.50), p90: q(0.90), p99: q(0.99), max: a[a.length - 1],
        /** ★特徴量の良し悪しはこれで見る。目安: 一様 1.73 / 正規 1.32 / 分離した2峰 10+ */
        bimodality,
        /** 参考値（単峰でも高く出るので判定には使わない） */
        otsuSeparability: varAll > 0 ? best.between / varAll : 0,
        otsuCut: best.cut,
      };
    }
    return out;
  }

  /** 二峰性が最も強い組み合わせ（＝採用すべき特徴量の候補）。 */
  bestKey() {
    const r = this.report();
    let best = null;
    for (const [k, v] of Object.entries(r)) {
      if (v && (!best || v.bimodality > r[best].bimodality)) best = k;
    }
    return best;
  }
}

/**
 * 二峰と認めるための下限。⚠ **単峰の実測値より上に置く**のが要点。
 * 一様 1.73 / 正規 1.32（2026-08-14 実測）なので、余裕を見て 2.5 とする。
 */
export const BIMODALITY_MIN = 2.5;

/** 探索結果を Diag に載せる。⚠ 判定ではなく**測定**なので FATAL/ERROR にはしない。 */
export function reportProbe(diag, probe) {
  const rep = probe.report();
  const best = probe.bestKey();
  if (!best) return null;
  const b = rep[best];
  if (b.bimodality < BIMODALITY_MIN) {
    diag.add('T1-DETECT-004', 'WARN', {
      where: { bestKey: best },
      expected: `分布が2つの山に割れること（Fisher 分離 ${BIMODALITY_MIN} 以上）`,
      got: `Fisher 分離 ${b.bimodality.toFixed(3)}（単峰の目安＝一様 1.73 / 正規 1.32）`,
      hint: '金色画素の割合ではポップアップの有無を分けられない。'
        + '特徴量を変える（縁取りのエッジ密度・特定色相の連結成分など）必要がある。',
    });
  }
  return { best, ...b };
}
