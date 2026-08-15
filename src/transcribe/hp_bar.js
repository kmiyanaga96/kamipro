// T1 録画転記 — P2-5: 敵HPバー ＋ チャージターン(CT) の抽出
//
// ★方針転換の経緯（重要・2026-08-14）:
//   P2-2 では「外見をこう仮定すれば検出できるはず」で2回続けて外した
//   （①フレーム差分＝dmg ROI は静止しない ②金色画素＝バースト演出そのものが金色）。
//   ∴ 本モジュールは **判定より先に「実物のプロファイルを持ち帰る」ことを優先**する。
//   抽出は試みるが、**同時に必ず生プロファイルを返す**ので、外していても次の一手が決まる。
//
// ★正解ラベル無しで検証する仕掛け（P2-2 の二峰性テストと同じ発想）:
//   **敵HPは戦闘中に単調減少する**。∴ 抽出値の系列が単調でなければ抽出が壊れている。
//   これはユーザーに正解を訊かずに自分で判定できる（憲法＝§1.1 の「二度と人に訊かない」）。
//
// ★設計上の要点（P1 の `hp` クロップ実物より）:
//   - バーは赤系の塗り。右端に `100%` の白文字が**重なる**＝右端から探すと文字で切れる。
//   - **CT ドット5個がバー上に重畳**（灰色）＝塗り画素の**計数**は壊れるが、
//     「左から塗りが続く範囲」で測れば穴として飛ばせる。
//   - ⚠ CT は**邪魔物ではなく観測値**（敵の限定行動の発動条件・シム未実装＝C45）。
//
// ⚠⚠ **入力は「バーだけ」を切り出した crop であること**（`ROIS.hpbar`）。
//   `ROIS.hp` をそのまま渡してはいけない。**敵アイコンが赤系**でバーと色で区別できず、
//   ヒューリスティックで分離しようとすると必ずどこかで破綻する
//   （実装中に実際に破綻させた: アイコンを塗りの一部として拾い、HP 20% を 100% と報告した）。
//   ★**位置で解ける問題を色で解こうとしない**。ROI は人がドラッグで採寸する仕組みが既にあり、
//   そこで切れば**構造的に**混入しない（P2-1 の正規化 ROI がそのための道具）。
//
// 純関数（DOM 非依存）＝Node でセルフテストできる。

export const HP_DEFAULTS = {
  /** 「赤い」とみなす閾値。redness = R − (G+B)/2。 */
  redness: 40,
  /**
   * ★走査する行は**バーの上下の細い帯**（ROI 高さに対する比）。
   *   **CT ドットも `100%` の文字も縦方向の中央にある**ので、上下端を見れば
   *   遮蔽そのものが起きない＝穴を埋める小細工（ギャップ許容）が要らなくなる。
   *   ⚠ 中央を見て「穴を許容する」方式は**系統的な過大**を生んだ（最大 +0.19・実測）。
   */
  stripTop: [0.06, 0.26],
  stripBottom: [0.74, 0.94],
  /**
   * ★**塗りの右端の判定に閾値を使わない**（v0.12.0・2026-08-15）。
   *
   * ⚠ 閾値方式は**2世代続けて崩壊した**（どちらも `M3-1.mp4` の実走で判明）:
   *   - **絶対閾値 0.50**（v0.10.0 以前）→ 単調性違反 **237回**。
   *     実測プロファイルでは**完全に塗られた列でも占有率は 0.375〜0.86**（1.0 にならない）で、
   *     **列の 76% が閾値の ±0.13 にひしめいていた**＝わずかな明滅で閾値を跨いだ。
   *     （1.0 にならない理由＝ROI の上下帯がバーの縁やわずかな傾きで部分的に外れる。
   *       人の採寸に 1px 精度を要求するのは筋が悪い＝**アルゴリズム側で吸収すべき**）
   *   - **相対閾値 `max(absFloor, peak×0.20)` ＋「閾値を超えた最後の列」**（v0.11.0）→ 違反 **118回**。
   *     ★真因は閾値の高さではなく**「最後の列」という探し方**だった。
   *     実測 `colProfile` では、真の境界（idx 105）より右に**孤立した 1〜2 列**が
   *     0.11〜0.31 で立つことがあり（末尾のみ・間は 0）、それだけで右端が末尾へ飛んで
   *     **塗り率がぴったり 1.0 になった**（違反の 9/10 がこの型）。
   *
   * ∴ **右端は「2区間の階段フィット」で求める**（`fitStepEdge`）＝**閾値パラメータがゼロ**。
   *   孤立列は左区間の平坦性を壊すので採用されない。演出で `peak` が 1.0 に化けても影響しない。
   *
   * `absFloor` は**右端の判定には使わない**。残る唯一の用途は
   * **「空の区間が本当に空か」の検査**＝実測事実「**空の部分は厳密に 0**」の確認である
   * （実測の余裕: 正常フレームの空区間平均 0.000〜0.046 に対し 0.10）。
   */
  absFloor: 0.10,
  /**
   * ★バーが「見えている」と認めるための peak の下限。
   * ⚠ **バースト演出中は画面が白金色にフラッシュしてバーが読めなくなる**（実走で確認）。
   *   そのフレームで無理に数値を返すと嘘の HP を報告する。**読めないときは読めないと言う**。
   */
  visibleFloor: 0.15,
  /**
   * 上下帯方式が成立する最小の ROI 高さ（px）。
   * ⚠ これより低いと上下の帯が重なって**同じ行を二重に数える**（実装時に踏んだ）。
   */
  minHeight: 8,
  /** プロファイルを診断に載せるときの間引き後の長さ。 */
  profileBins: 120,
};

const redness = (r, g, b) => r - (g + b) / 2;

/**
 * ★列プロファイルの「塗り→空」の境界を、**閾値を使わずに**求める。
 *
 * HPバーは構造上「左が塗り・右が空」の**階段**なので、区分定数モデル
 * （左区間の平均・右区間の平均）で**残差平方和が最小になる分割点**がそのまま境界になる。
 * 累積和で O(W)。決定的（同じ入力なら同じ出力）。
 *
 * ★なぜ閾値方式より強いか（実測 `colProfile` で確認済み）:
 *   - **孤立列に釣られない**。右端の 1〜2 列が立っても、そこへ境界を動かすと
 *     左区間へ「ほぼ 0 の列」が入って残差が跳ね上がるので選ばれない。
 *   - **`peak` に依存しない**。演出で ROI が赤く覆われて peak が 1.0 になっても指標が動かない。
 *   - **塗り列の占有率が 0.375 でも 0.86 でも同じに効く**（絶対水準を見ていない）。
 *
 * ⚠ 分割点が W（＝右区間が空）になるのは「空の区間が見つからなかった」ということ。
 *   **満タンのバーと、ROI 全体が赤く覆われたフレームは、プロファイルだけでは区別できない**
 *   ＝呼び出し側で「読めない」と扱う（数値を捏造しない）。
 *
 * @param {ArrayLike<number>} profile 列ごとの占有率（0〜1）
 * @returns {{edge:number, leftMean:number, rightMean:number, cost:number}}
 */
export function fitStepEdge(profile) {
  const W = profile.length;
  if (!W) return { edge: 0, leftMean: 0, rightMean: 0, cost: 0 };

  const sum = new Float64Array(W + 1), sq = new Float64Array(W + 1);
  for (let i = 0; i < W; i++) {
    sum[i + 1] = sum[i] + profile[i];
    sq[i + 1] = sq[i] + profile[i] * profile[i];
  }
  /** 区間 [a,b) の残差平方和（平均まわり）。空区間は 0。 */
  const sse = (a, b) => {
    const n = b - a;
    if (n <= 0) return 0;
    const s = sum[b] - sum[a];
    return Math.max(0, (sq[b] - sq[a]) - s * s / n);
  };

  // ★2パス: ①最小コストを求める ②同点なら**大きい k** を採る。
  //   同点は「プロファイルが一様＝どこで切っても同じ」ときにだけ起きる。
  //   そのとき境界は「右端」＝空区間なし（＝読めない）と扱うのが正しい。
  //   ⚠ 1パスで `<` を使うと同点時に k=0（塗りゼロ）へ落ちて、意味が逆になる。
  const eps = 1e-9 * (sq[W] + 1);
  let best = Infinity;
  for (let k = 0; k <= W; k++) best = Math.min(best, sse(0, k) + sse(k, W));
  let edge = 0;
  for (let k = 0; k <= W; k++) if (sse(0, k) + sse(k, W) <= best + eps) edge = k;

  return {
    edge,
    leftMean: edge > 0 ? sum[edge] / edge : 0,
    // ★右区間が空（edge===W）なら「空の区間が無い」＝ 0 とは呼べない。呼び出し側が別扱いする。
    rightMean: edge < W ? (sum[W] - sum[edge]) / (W - edge) : null,
    cost: best,
  };
}

/** 配列を指定長へ平均で間引く（診断 JSON を膨らませないため）。 */
function downsample(arr, bins) {
  if (arr.length <= bins) return Array.from(arr, (v) => +v.toFixed(4));
  const out = [];
  for (let i = 0; i < bins; i++) {
    const a = Math.floor(i * arr.length / bins), b = Math.floor((i + 1) * arr.length / bins);
    let s = 0;
    for (let j = a; j < b; j++) s += arr[j];
    out.push(+(s / Math.max(1, b - a)).toFixed(4));
  }
  return out;
}

/**
 * ★HPバーを解析する。
 *
 * ⚠⚠ **設計の要（3度間違えた末の形）**:
 *   **バーの全長（分母）を、塗り（分子）と同じ信号から求めてはいけない。**
 *   最初の実装は「赤が始まる列〜赤が終わる列」をバーの範囲としたため、
 *   HP が減ると分母も一緒に縮み、**塗り率が常に 1.000 になった**（実測で発覚）。
 *   また「赤い行を探して帯にする」も、HP が低いと赤い画素が足りず**帯を見失う**（HP 20% で失敗）。
 *
 *   ∴ **幾何は入力 ROI から与える**: `ROIS.hpbar` は**バーそのもの**を人が採寸したものなので、
 *   バーの全長 ＝ `img.width`、走査する行 ＝ 高さの中央部。
 *   アルゴリズムがやるのは**塗りの右端を見つけることだけ**にする。
 *   ★測るものの基準系を、測る対象そのものから作らない。
 *
 * @param {{width,height,data}} img **バーだけ**を切り出した画像（`ROIS.hpbar`・原点基準）
 * @returns {{ok, bands, fillEdge, fillRatio, colProfile, redFraction, reason?}}
 */
export function analyzeHpBar(img, opts = {}) {
  const o = { ...HP_DEFAULTS, ...opts };
  if (!img?.width || !img?.height) return { ok: false, reason: '画像が空', colProfile: null };
  if (img.height < o.minHeight) {
    // ⚠ 低すぎると上下の走査帯が重なり、同じ行を二重に数えて占有率が壊れる
    return { ok: false, colProfile: null,
      reason: `ROI が低すぎる（${img.height}px < ${o.minHeight}px）＝上下の走査帯が分離できない` };
  }

  // --- 1. 走査する行は「バーの上下の細い帯」。★中央を避けることで遮蔽を構造的に消す ---
  const bands = [o.stripTop, o.stripBottom].map(([a, b]) => [
    Math.max(0, Math.floor(img.height * a)),
    Math.min(img.height, Math.ceil(img.height * b)),
  ]).filter(([a, b]) => b - a >= 1);
  // 念のため重なりを排除する（帯が接すると二重計上になる）
  if (bands.length === 2 && bands[0][1] > bands[1][0]) bands[0][1] = bands[1][0];
  const rows = bands.reduce((n, [a, b]) => n + (b - a), 0);
  if (!rows) return { ok: false, reason: 'ROI が薄すぎて走査帯を取れない', colProfile: null };

  // --- 2. 列ごとの「赤さ」占有率 ---
  const colProfile = new Float64Array(img.width);
  let redPixels = 0;
  for (let x = 0; x < img.width; x++) {
    let n = 0;
    for (const [a, b] of bands) {
      for (let y = a; y < b; y++) {
        const k = (y * img.width + x) * 4;
        if (redness(img.data[k], img.data[k + 1], img.data[k + 2]) > o.redness) n++;
      }
    }
    colProfile[x] = n / rows;
    redPixels += n;
  }

  // --- 3. ★「塗られた列」の代表値（peak）を取る ---
  //     ⚠ 単純な max は1列の外れ値に引きずられるので、上位側の分位点を使う。
  const sorted = Array.from(colProfile).sort((a, b) => a - b);
  const peak = sorted[Math.floor(sorted.length * 0.95)];

  // --- 4. ★バーが見えているか（バースト演出中は白金色にフラッシュして読めない） ---
  const common = {
    ok: true, bands, peak: +peak.toFixed(4),
    redFraction: redPixels / (img.width * rows),
    colProfile: downsample(colProfile, o.profileBins),
  };
  if (peak < o.visibleFloor) {
    return {
      ...common, visible: false, fillRatio: null, cause: 'flash',
      reason: `バーが見えない（peak ${peak.toFixed(3)} < ${o.visibleFloor}）＝演出でフラッシュしている`,
    };
  }

  // --- 5〜6. 塗りの右端と、読めたかどうか（★プロファイルだけで決まる＝純関数へ委譲） ---
  return { ...common, ...readFillRatio(colProfile, o) };
}

/**
 * ★列プロファイルから塗り率を読む。**画像経路とテスト経路で同じ実装を通すため**に切り出してある
 * （実走で観測されたプロファイルを、画像を再現せずにそのまま回帰フィクスチャにできる）。
 *
 * @param {ArrayLike<number>} profile 列ごとの占有率（0〜1）
 * @returns {{visible, fillRatio, fillEdge?, leftMean?, rightMean?, cause?, reason?}}
 */
export function readFillRatio(profile, opts = {}) {
  const o = { ...HP_DEFAULTS, ...opts };
  const W = profile.length;
  const fit = fitStepEdge(profile);

  // ★「空の区間が本当に空か」＝読めたかどうかの検査。
  //   実測事実「**空の部分は厳密に 0**」の確認。ここを通らないフレームは
  //   ROI が別のもので覆われている（＝境界の推定値に意味が無い）。
  //   ⚠ **数値を捏造しない**＝読めないときは読めないと言う。
  //   実走で捕まる型（2026-08-15 `M3-1.mp4` t=14.0834）:
  //     平坦部 0.2083（正常は 0.375〜0.4583）／中央と末尾に**占有率 1.0 のブロック**
  //     ＝赤い演出が ROI を覆っている。旧実装はこれを「HP 100%」と報告していた。
  //   ⚠ **満タンのバーもここで「読めない」になる**（空の区間が無いので上の汚染と区別できない）。
  //     取りこぼすのは戦闘開始前の 100% 区間だけで、そこは推測する価値が無い＝許容する。
  if (fit.rightMean === null || fit.rightMean >= o.absFloor) {
    return {
      visible: false, fillRatio: null, cause: 'noEmptyRegion',
      fillEdge: fit.edge, leftMean: +fit.leftMean.toFixed(4),
      rightMean: fit.rightMean === null ? null : +fit.rightMean.toFixed(4),
      reason: fit.rightMean === null
        ? '空の区間が無い（バーが満タン か ROI 全体が覆われている）＝プロファイルだけでは区別できない'
        : `空の区間が空でない（平均 ${fit.rightMean.toFixed(3)} ≧ ${o.absFloor}）＝ROI が何かで覆われている`,
    };
  }

  return {
    visible: true,
    fillEdge: fit.edge,
    /** ★0〜1。分母は **プロファイル長＝ROI 幅**（人が採寸したバー全長）＝塗りとは独立な基準。 */
    fillRatio: fit.edge / W,
    /** 塗り区間・空区間それぞれの平均占有率（診断用＝境界の妥当性が目で分かる）。 */
    leftMean: +fit.leftMean.toFixed(4),
    rightMean: +fit.rightMean.toFixed(4),
  };
}

/**
 * ★HP 系列の検証。**正解ラベル無しで抽出の健全性を判定する**。
 * 敵HPは単調減少するので、増加したら抽出が壊れている（または演出で一時的に隠れた）。
 */
export class HpSeries {
  constructor(tolerance = 0.01) {
    this.tolerance = tolerance;   // 1% ぶんの増加は誤差として許す
    this.points = [];
    this.violations = [];
    this.skipped = 0;             // バーが見えず読めなかったフレーム数
    /**
     * ★読めなかった理由の内訳。`flash`（演出で白くとぶ）と
     * `noEmptyRegion`（空の区間が無い＝満タン or ROI 汚染）は原因も対処も別物なので分けて数える。
     */
    this.causes = { flash: 0, noEmptyRegion: 0, other: 0 };
  }

  /** バーが見えなかったフレーム。★数値を捏造せず、読めなかったこととして数える。 */
  skip(cause) { this.skipped++; this.causes[cause in this.causes ? cause : 'other']++; }

  push(t, fillRatio, cause) {
    if (fillRatio == null) { this.skip(cause); return; }
    const prev = this.points.length ? this.points[this.points.length - 1] : null;
    if (prev && fillRatio > prev.v + this.tolerance) {
      this.violations.push({ t, from: +prev.v.toFixed(4), to: +fillRatio.toFixed(4) });
    }
    this.points.push({ t, v: fillRatio });
  }

  summary() {
    if (!this.points.length) return null;
    const first = this.points[0].v, last = this.points[this.points.length - 1].v;
    return {
      frames: this.points.length,
      /** ★演出でバーが読めず捨てたフレーム（捏造せずに数える） */
      skippedFrames: this.skipped,
      /** その内訳（flash＝白フラッシュ / noEmptyRegion＝満タン or ROI 汚染） */
      skipCauses: { ...this.causes },
      firstRatio: +first.toFixed(4),
      lastRatio: +last.toFixed(4),
      /** ★単調減少していれば抽出は健全（HP は戦闘中に増えない） */
      monotonic: this.violations.length === 0,
      violations: this.violations.length,
      violationSample: this.violations.slice(0, 10),
      /** 実際に減った量（0 なら何も測れていない可能性） */
      drop: +(first - last).toFixed(4),
    };
  }
}

/** 解析結果を Diag に載せる。⚠ **抽出できなくても生プロファイルを返す**（次の一手を決めるため）。 */
export function reportHp(diag, res, series) {
  if (!res?.ok) {
    diag.add('T1-ROI-004', 'ERROR', {
      where: { roi: 'hp' },
      expected: 'HPバーの帯と塗り列',
      got: res?.reason ?? '解析に失敗',
      hint: '`redness` / `bandOccupancy` の閾値が実物と合っていない。'
        + '診断の rowProfile / colProfile を見て決め直す。',
    });
    return false;
  }
  const s = series?.summary();
  if (s && !s.monotonic) {
    diag.add('T1-ROI-005', 'WARN', {
      where: { roi: 'hp', violations: s.violations },
      expected: 'HP 割合が単調減少すること（敵HPは戦闘中に増えない）',
      got: `${s.violations} 回の増加`,
      hint: '`hpViolationSamples` の `colProfile` を `hpProfileSample`（正常フレーム）と並べる。'
        + '★到達点が「ぴったり 1.0」に偏っていたら右端の探し方（境界の推定）が壊れている。'
        + 'v0.11.0 の「閾値を超えた最後の列」がこの型だった＝孤立した末尾 1〜2 列に釣られていた。',
    });
  }
  if (s && s.drop === 0) {
    diag.add('T1-ROI-006', 'WARN', {
      where: { roi: 'hp' },
      expected: '走の間に HP が減ること',
      got: '減少ゼロ',
      hint: 'バーの右端を常に同じ位置で拾っている（＝塗り境界を見ていない）可能性。',
    });
  }
  return true;
}
