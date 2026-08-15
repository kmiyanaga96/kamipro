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
   * ★「塗られている」の判定は **絶対値ではなく、そのフレームの「塗られた列」に対する相対**で決める。
   *
   * ⚠ **絶対閾値 0.50 は実走で崩壊した**（2026-08-14・`M3-1.mp4`）。実測プロファイルでは
   *   **完全に塗られた列でも占有率は 0.375〜0.86**（1.0 にならない）で、
   *   **列の 76% が閾値 0.50 の ±0.13 にひしめいていた**。わずかな明滅で閾値を跨ぎ、
   *   塗りの右端が 0 と 1 の間を飛んで **単調性違反 237回**になった。
   *   （占有率が 1.0 にならない理由＝ROI の上下帯がバーの縁やわずかな傾きで部分的に外れるため。
   *     人の採寸を 1px 精度で要求するのは筋が悪い＝**アルゴリズム側で吸収すべき**）
   *
   * ★**空の部分は厳密に 0** だった（実測）。∴ 分離は本来とても易しく、低い閾値で足りる。
   *   `threshold = max(absFloor, peak × relFloor)`。peak はそのフレームの塗り列の代表値。
   */
  absFloor: 0.10,
  relFloor: 0.20,
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
  if (peak < o.visibleFloor) {
    return {
      ok: true, visible: false, fillRatio: null, peak: +peak.toFixed(4),
      bands, redFraction: redPixels / (img.width * rows),
      colProfile: downsample(colProfile, o.profileBins),
      reason: `バーが見えない（peak ${peak.toFixed(3)} < ${o.visibleFloor}）＝演出でフラッシュしている`,
    };
  }

  // --- 5. ★塗りの右端 ＝ 最後に「塗られている」列 ---
  //     閾値は peak に対する相対（絶対値だと実走で崩壊した＝上記の注記）。
  const threshold = Math.max(o.absFloor, peak * o.relFloor);
  let edge = 0;
  for (let x = 0; x < img.width; x++) if (colProfile[x] >= threshold) edge = x + 1;

  return {
    ok: true,
    visible: true,
    bands,
    peak: +peak.toFixed(4),
    threshold: +threshold.toFixed(4),
    fillEdge: edge,
    /** ★0〜1。分母は **ROI 幅**（人が採寸したバー全長）＝塗りとは独立な基準。 */
    fillRatio: edge / img.width,
    /** 参考: ROI 全体に占める赤画素の割合（ROI がズレていれば極端な値になる）。 */
    redFraction: redPixels / (img.width * rows),
    colProfile: downsample(colProfile, o.profileBins),
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
  }

  /** バーが見えなかったフレーム。★数値を捏造せず、読めなかったこととして数える。 */
  skip() { this.skipped++; }

  push(t, fillRatio) {
    if (fillRatio == null) { this.skip(); return; }
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
      hint: '抽出が壊れているか、演出でバーが隠れるフレームがある。'
        + 'violationSample の時刻の crop を見る。',
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
