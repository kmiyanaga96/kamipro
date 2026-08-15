// T1 録画転記 — P2-4 重複除去（AI 不要）
//
// ★出口条件（PHASE9_PLAN.md §4 P2）: **人が見るフレーム数が1桁減る**。
//   ⚠ **その実際の担い手はここ**（P2-2 のフレーム選別ではない・TODO 2026-08-15 で確定）。
//
// ★★本モジュールの立て方（P2-2 の失敗を踏まえた設計判断）:
//
//   P2-2 は「**変わったか**」を問うて失敗した。ゲーム画面は背景・立ち絵・光が常時動くので
//   「変わっていないフレーム」が存在せず、採用率は 61.8% にしかならなかった
//   （閾値を p90 へ上げれば 10% になるが、それは**本物のポップアップを捨てる**ので採らない）。
//
//   ∴ ここでは問いを変える: 「**取りこぼさないと保証できる最大の間引きはどれか**」。
//
//   ⭐ **等間隔の間引きには証明がある**: s フレームおきに採ると、任意の連続 s フレームの窓に
//      採用フレームがちょうど1枚入る。∴ **s フレーム以上表示され続けるものは必ず1回は捕まる**。
//      賢い検出器はこの保証を持たない（P2-2 が実際に取りこぼした）。
//      **検出が信用できない場面では、鈍いが証明のある方法を採る。**
//
//   ⚠⚠ ただしこの保証は **s ≦ ポップアップの寿命 L** のときだけ成り立つ。
//      **L は未測定**＝PHASE9_PLAN §4 P1 の**発見⑧**（「寿命は想定より短い可能性」＝
//      連続フレームなら入れ替わりが **33ms 級**＝**L が 1〜2 フレームなら間引きは一切できない**）。
//      P2 の進捗表が P2-4 に「発見⑧の実測が先」と書いているのはこのため。
//
// ∴ **本モジュールは測定を先に出し、間引きは測定が許した分しかしない**:
//   ①`LagProfile`  … 持続性の実測（ラグ別の距離・セル差分の分布）＝**発見⑧への回答**
//   ②`EventDeduper` … `stride` が**未較正のうちは間引かない**（完全重複の除去だけ行う）
//
//   ★`stride` を推測で埋めない。**「読めないときは読めないと言う」の間引き版**
//     （P2-5 で7回踏んだ「正常値はこうなるはず」の型に戻らないための構造）。
//     較正後は ROI や `listThreshold` と同じく **provenance 付きの定数として固定**する。
//
// 純関数／DOM 非依存＝Node でセルフテストできる。

export const DEDUP_DEFAULTS = {
  /** 持続性を測る最大ラグ（フレーム）。20 ≒ 0.67秒 @30fps。 */
  maxLag: 20,
  /**
   * ★何フレームおきに採るか。**null＝未較正**（＝間引かない）。
   * `lagProfile` を見て決め、決めたら provenance 付きでここに固定する。
   */
  stride: null,
  /**
   * 安全率。`stride = floor(L / safety)`。
   * 2＝**寿命の半分**で採る＝どのイベントも**最低2回**捕まえる余裕を持たせる
   * （OCR の読みを2枚で突き合わせられる＝§5 の検算に効く）。
   */
  safety: 2,
  /** 出口条件（採用率がこれ以下なら「1桁減った」）。 */
  exitRatio: 0.1,
};

/** 2つの署名の平均絶対差（0〜255）。`frame_select.js` と同じ定義。 */
function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/** 昇順配列から分位点を引く。 */
function quantile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * ★持続性の実測（発見⑧への回答）。
 *
 * **ラグ k フレーム離れた2枚の距離** d(k) を全フレームで集める。
 *   - ポップアップが L フレーム表示され続けるなら、**k < L では同じポップアップを共有する組**が
 *     多くなるので d(k) は低く抑えられ、**k ≧ L で立ち上がる**。
 *   - 背景アニメだけなら d(k) は k=1 から既に高く、**寝たまま**になる。
 *
 * ⚠ **膝の位置をコードで自動抽出しない**（それ自体が新しいヒューリスティック＝また外す）。
 *   **曲線を生データとして持ち帰り、人／Claude が読んで `stride` を決める**
 *   （憲法 §1.1＝観測はユーザー・導出は Claude・転記はツール）。
 */
export class LagProfile {
  constructor(opts = {}) {
    this.o = { ...DEDUP_DEFAULTS, ...opts };
    this.ring = [];                                     // 直近 maxLag 枚の署名
    this.dists = Array.from({ length: this.o.maxLag }, () => []);
    /** ★セル単位の |Δ|（ラグ1）のヒストグラム＝**ノイズ床がどこかを分布に語らせる**。 */
    this.cellHist = new Uint32Array(256);
    this.frames = 0;
    /** 距離がちょうど 0 の隣接対＝**同じフレームを二度取っている**（seek の重複）。 */
    this.exactDuplicates = 0;
  }

  push(sig) {
    this.frames++;
    for (let k = 1; k <= this.ring.length; k++) {
      const prev = this.ring[this.ring.length - k];
      if (prev.length !== sig.length) continue;
      const d = distance(prev, sig);
      this.dists[k - 1].push(d);
      if (k === 1) {
        if (d === 0) this.exactDuplicates++;
        for (let i = 0; i < sig.length; i++) this.cellHist[Math.abs(sig[i] - prev[i]) | 0]++;
      }
    }
    this.ring.push(sig);
    if (this.ring.length > this.o.maxLag) this.ring.shift();
  }

  /** セル |Δ| ヒストグラムから分位点を引く。 */
  cellQuantiles(ps = [0.5, 0.9, 0.99]) {
    let total = 0;
    for (const c of this.cellHist) total += c;
    if (!total) return null;
    const out = {};
    for (const p of ps) {
      let want = Math.floor(p * total), acc = 0, v = 0;
      for (let i = 0; i < 256; i++) { acc += this.cellHist[i]; if (acc > want) { v = i; break; } }
      out[`p${Math.round(p * 100)}`] = v;
    }
    // ★0 のセルの割合＝「まったく動かない画素」がどれだけあるか（静止領域の存在証明）
    out.zeroFraction = +(this.cellHist[0] / total).toFixed(4);
    return out;
  }

  /**
   * ★「画面が1つの状態にとどまる長さ」の分布＝**寿命 L の直接の候補**。
   *
   * 隣接距離が cut を超えたフレームを**遷移**とみなし、遷移と遷移のあいだの長さを数える。
   *
   * ⚠ cut を1つに決め打ちしない。**複数の cut で測って、L が cut によらず安定かを見る**
   *   （`popup_probe.js` で確立した「候補しきい値の格子で分布を測り、割れてから決める」と同じ作法）。
   *   cut ごとに L が大きく動くなら、その走からは L が決まっていない＝**stride を決めてはいけない**。
   */
  stateRuns(cuts) {
    const series = this.dists[0];
    if (!series.length) return [];
    return cuts.map(({ label, cut }) => {
      const runs = [];
      let run = 0;
      for (const d of series) {
        if (d >= cut) { if (run) runs.push(run); run = 0; } else run++;
      }
      if (run) runs.push(run);
      const a = runs.sort((x, y) => x - y);
      return {
        label, cut: +cut.toFixed(3), count: a.length,
        p50: a.length ? quantile(a, 0.50) : null,
        // ★p50 と p90 が近い cut ほど「長さが揃っている」＝そこが L を読むべき行
        p90: a.length ? quantile(a, 0.90) : null,
        max: a.length ? a[a.length - 1] : null,
      };
    });
  }

  report() {
    const lags = [];
    for (let k = 1; k <= this.o.maxLag; k++) {
      const a = [...this.dists[k - 1]].sort((x, y) => x - y);
      if (!a.length) continue;
      lags.push({
        k,
        p10: +quantile(a, 0.10).toFixed(3),
        p50: +quantile(a, 0.50).toFixed(3),
        p90: +quantile(a, 0.90).toFixed(3),
      });
    }
    const one = [...this.dists[0]].sort((x, y) => x - y);
    const q50 = one.length ? quantile(one, 0.50) : 0;
    const q75 = one.length ? quantile(one, 0.75) : 0;
    const q90 = one.length ? quantile(one, 0.90) : 0;

    return {
      frames: this.frames,
      maxLag: this.o.maxLag,
      exactDuplicates: this.exactDuplicates,
      /** ★ラグ別の距離（生データ）。**上側分位点 p90 が立ち上がりきるラグが L の候補**。 */
      lags,
      /** ★セル単位 |Δ|（ラグ1）の分布＝ノイズ床の在り処。 */
      cellDeltas: this.cellQuantiles(),
      /**
       * ★**この ROI に離散的な出来事があるか**（正解ラベル無しの健全性検査）。
       * ラグ1の距離の p90/p50。**1 に近い＝滑らかに動いているだけで「出現・消滅」が無い**
       * ＝間引きも変化検出も意味を持たない（そもそも捕まえる対象が信号に出ていない）。
       *
       * ⚠⚠ **かつてここに `persistenceRatio`（ラグ1 p50 ÷ ラグ20 p50）を置いていたが撤去した**
       *   （2026-08-15・実装中に自分で反証した）。**ポップアップが1つも無い背景だけの列で 0.537**
       *   ＝「持続性あり」に見えてしまう。**背景アニメの遅さと、ポップアップの寿命を区別できない**
       *   指標だった。★**同じ罠に戻らないこと**＝ラグ曲線の低い側（p10/p50）は背景の床であって、
       *   ポップアップの信号は**上側（p90）にしか出ない**。
       */
      eventContrast: q50 > 0 ? +(q90 / q50).toFixed(3) : null,
      /** ★状態が続く長さの分布＝**L の直接の候補**（cut を変えても安定かを見る）。 */
      stateRuns: this.stateRuns([
        { label: 'p50', cut: q50 }, { label: 'p75', cut: q75 }, { label: 'p90', cut: q90 },
      ]),
    };
  }
}

/**
 * ★重複除去。**取りこぼさないと証明できる範囲でだけ間引く**。
 *
 * `stride` が null（未較正）のあいだは**完全重複（距離ちょうど 0）だけ**を落とす。
 * これは「同じフレームを二度デコードした」場合だけなので**情報を一切失わない**。
 */
export class EventDeduper {
  constructor(opts = {}) {
    this.o = { ...DEDUP_DEFAULTS, ...opts };
    this.total = 0;
    this.index = 0;          // stride 判定用のフレーム番号（完全重複を除いた通し番号）
    this.prev = null;
    this.kept = [];          // { t, reason }
    this.droppedDuplicate = 0;
    this.lastKeptT = null;
    this.maxGapSeconds = 0;
  }

  /**
   * @param {number} t   mediaTime（秒）
   * @param {Uint8ClampedArray} sig
   * @returns {boolean} 採用したか
   */
  push(t, sig) {
    this.total++;
    if (this.prev && sig.length === this.prev.length && distance(this.prev, sig) === 0) {
      // ★完全重複＝同じフレームを二度見ている。落としても情報を失わない。
      this.droppedDuplicate++;
      return false;
    }
    this.prev = sig;
    const s = this.o.stride;
    const keep = !s || s <= 1 || this.index % s === 0;
    this.index++;
    if (keep) {
      if (this.lastKeptT != null) {
        this.maxGapSeconds = Math.max(this.maxGapSeconds, t - this.lastKeptT);
      }
      this.lastKeptT = t;
      this.kept.push({ t, reason: s > 1 ? 'stride' : 'all' });
    }
    return keep;
  }

  summary() {
    const ratio = this.total ? this.kept.length / this.total : 1;
    return {
      totalFrames: this.total,
      keptFrames: this.kept.length,
      keptRatio: +ratio.toFixed(4),
      reductionFactor: ratio > 0 ? +(1 / ratio).toFixed(2) : null,
      meetsExitCriterion: ratio <= this.o.exitRatio,
      /** ★完全重複として落とした枚数（情報の損失ゼロ）。 */
      droppedDuplicates: this.droppedDuplicate,
      stride: this.o.stride,
      calibrated: !!(this.o.stride && this.o.stride > 1),
      /**
       * ★採用フレーム間の最大の穴（秒）。
       * **これより短命なものは取りこぼしうる**＝保証の中身がこの1数値に出る。
       */
      // ⚠ 丸めすぎない: `stride/fps` と突き合わせる値なので、表示都合の桁で切ると比較が壊れる
      maxGapSeconds: +this.maxGapSeconds.toFixed(6),
    };
  }
}

/**
 * 診断へ載せる。⚠ **未較正であることを黙って通さない**
 * （「間引けていない」と「間引いたが取りこぼしている」を混ぜないため）。
 */
export function reportDedup(diag, sum, lag) {
  if (!sum || !sum.totalFrames) return false;

  if (!sum.calibrated) {
    diag.add('T1-DEDUP-001', 'WARN', {
      where: { stride: sum.stride },
      expected: '`stride` が実測（発見⑧＝ポップアップの寿命）から較正されていること',
      got: '未較正＝完全重複の除去のみ（間引きなし）',
      hint: '`lagProfile.lags` の p50 が立ち上がるラグ k が寿命 L の候補。'
        + '`stride = floor(L / safety)` を provenance 付きで DEDUP_DEFAULTS に固定する。'
        + '⚠ 推測で埋めない（P2-5 で同型の失敗を7回踏んだ）。',
    });
  } else if (!sum.meetsExitCriterion) {
    diag.add('T1-DEDUP-002', 'WARN', {
      where: { stride: sum.stride, keptRatio: sum.keptRatio },
      expected: `採用率 ${DEDUP_DEFAULTS.exitRatio * 100}% 以下（§4 P2 の出口条件）`,
      got: `採用率 ${(sum.keptRatio * 100).toFixed(1)}%（${sum.keptFrames}/${sum.totalFrames}）`,
      hint: '寿命 L が短いと stride を上げられない＝間引きでは出口条件に届かない。'
        + 'その場合は「フレームを減らす」ではなく「1フレームから読む量を増やす」方向へ設計を戻す（§4 P2 を要相談）。',
    });
  }

  // ★正解ラベル無しの健全性検査: 離散的な出来事が信号に出ていないなら、間引きも変化検出も意味が無い。
  if (lag && lag.eventContrast != null && lag.eventContrast < 1.5) {
    diag.add('T1-DEDUP-003', 'WARN', {
      where: { eventContrast: lag.eventContrast, lag1: lag.lags[0] },
      expected: 'ラグ1の距離に上側の裾があること（＝出現・消滅という離散的な出来事がある）',
      got: `p90/p50 = ${lag.eventContrast}（1 に近い＝滑らかに動いているだけ）`,
      hint: '★捕まえる対象が信号に出ていない＝ROI が外れているか、この窓に何も起きていない。'
        + '⚠ この状態で `stateRuns` から stride を決めてはいけない（背景の周期を寿命と読むことになる）。',
    });
  }
  // ⚠ **`stateRuns` に自動判定を足さない**（2026-08-15・実装中に一度足して撤去した）。
  //   「cut を変えても run 長が安定していれば L が実在する」という検査を書いたが、
  //   **cut を下げれば遷移が増えて run が短くなるのは構造上あたりまえ**で、
  //   真の L=10 の合成でも発火した（[1,3,9]）＝**安定性の検査になっていない**。
  //   ★どの cut で読むかは**出来事の発生率**に依存し、それは走ごとに違う＝**人が読んで決める**
  //   （膝の自動抽出をしないのと同じ理由）。ここでは生データを返すことに徹する。
  return true;
}
