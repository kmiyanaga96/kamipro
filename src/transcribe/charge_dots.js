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
   * ⚠⚠ **既定では空（抑止しない）**。2026-08-18 に**登録されていた値 [0.50, 0.72] を撤回した**。
   *
   * ── 撤回の経緯（★この Phase で最も高くついた誤りなので詳しく残す）──────────────
   *   2026-08-17、`hpbar` の中央帯に等間隔6山（バー幅 53〜69%・間隔 21.3px）を見つけ、
   *   「これは CT か」とユーザーに尋ねたところ「**バーの目盛り・模様など**」と回答された。
   *   そこで**その位置を「CT ではない」と恒久的に記録した**のが本項だった。
   *
   *   2026-08-18 に `ct` を**直接採寸**したところ、canvas x **693〜855**。
   *   6山の位置は canvas x **700〜802**＝**採寸された `ct` の中に完全に入る**。
   *   ★**あれは CT だった。**
   *
   *   ⚠ 誤りの本体は回答ではなく**質問**だった。旧 `hpbar` は 640×54px で、
   *   **実際のバー（29px）の下にある CT の行まで含んでいた**。
   *   ∴ 「**HPバーの中の**構造」として尋ねたので、「バーの模様だろう」という回答は自然だった。
   *
   * ⭐⭐ **教訓＝1つの回答から恒久的な抑止規則を作らない**。
   *   「誤報告は見つからないより悪い」（2026-08-17 の教訓）は正しいが、
   *   その対策として**抑止をハードコードすると、静かで恒久的なブロッカーになる**＝もっと悪い。
   *   ★位置の問題は**抑止規則ではなく採寸**で解く（憲法＝観測はユーザー）。
   *
   * ⚠ 機構自体は残す＝**本当に確認できた装飾**があれば呼び出し側が明示的に渡せる。
   *   ただし**既定で何かを抑止することは二度としない**。
   */
  knownDecorX: null,
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
   * ★周期を探す窓の**最小**幅（ROI 幅に対する比）。
   * ⚠ **全域の自己相関では見つからない**（2026-08-17 実測）＝
   *   実走では周期構造が **バー幅の約 16%（x 341〜443px）にしか無く**、全域で測ると希釈されて
   *   スコアが**負**になった（-0.047）。同じ列を窓 bin62〜88 に絞ると **0.518**。
   *   ★**局所にしか無い構造は、局所で測る**。窓の位置自体も観測値（どこにドットがあるか）。
   *
   * ⚠⚠ **2026-08-18: これを「窓の固定幅」として使っていたのが検出器の穴だった**。
   *   固定幅 0.25W と `minRepeats` 4 が掛かって、**探せる周期の上限が W/16（687px の ROI で 43px）**に
   *   潰れていた。∴ **バー全幅に散らばるドット列（5個なら間隔 ≈107px）は原理的に見えなかった**。
   *   実走 v0.18.0 の帯探索が **8帯中5帯で上限 43/43/43/41 を報告**していたのがその指紋。
   *   ★今は**窓幅は試している周期から決まる**（`max(minRepeats × period, windowRatio × W)`）＝
   *   「4周期入ること」という**測定の成立条件は保ったまま**、上限だけを外した。
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

/**
 * 平均0・分散1へ（明るさ・コントラストの差を吸収する）。
 *
 * ⚠⚠ **平坦な入力を標準化してはいけない**（2026-08-18・v0.19.0 で実際に踏んだ）。
 *   何も写っていない帯（一様な背景）は高域通過後の残差が **1e-14 級の浮動小数のゴミ**になる。
 *   それを「分散1」へ引き伸ばすと、**ゴミの中の周期性が score 0.995 として最良候補に浮上する**
 *   （合成で実際に、空の帯が本物のドット列（0.50）を押しのけて 1位になった）。
 *   ★∴ **変動が輝度の量子化幅より桁で小さいものは「測る対象ではない」**として 0 を返す
 *   ＝これは調整つまみではなく**測定が成立しないことの宣言**（`fitStepEdge` の「読めないと言う」と同型）。
 */
const FLAT_EPS = 1e-6;      // 輝度単位。8bit の量子化幅 1/255 ≈ 0.004 よりさらに3桁小さい

function standardize(a) {
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  s = Math.sqrt(s / a.length);
  const out = new Float64Array(a.length);
  if (!(s > FLAT_EPS)) return out;         // ★平坦＝全部 0 のまま返す（自己相関も 0 になる）
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
 * ★★**周期を「窓を周期に合わせて広げながら」探す**（2026-08-18・v0.19.0）。
 *
 * ⚠⚠ **なぜ作り直したか（実測に基づく検出器の穴）**:
 *   v0.17.0 の帯探索は**固定幅 0.25W の窓**の中で自己相関を測っていた。
 *   そこに「窓へ `minRepeats`(=4) 周期入ること」という**測定の成立条件**が掛かるので、
 *   **探せる周期の上限が W/16 に潰れていた**（`hp` ROI 687px なら **43px**）。
 *   ∴ **バーの全幅に散らばるドット列は原理的に検出できなかった**
 *   （一次情報の観測は「**バー上の丸ドット5個**」＝640px のバーなら間隔 ≈107px）。
 *   ★指紋: v0.18.0 実走の帯探索は **8帯中5帯が上限側の 43/43/43/41** を報告していた
 *   ＝「最良周期が探索範囲の端に張り付く」は**範囲の外に真の構造がある**ときの典型。
 *
 * ★直し方は「閾値をいじる」ではなく「**窓の決め方を物理に合わせる**」:
 *   窓幅 = `max(minRepeats × period, windowRatio × W)` ＝**試している周期ごとに窓を広げる**。
 *   ∴ ①「4周期入ること」という成立条件は**そのまま保たれる** ②上限だけが外れる
 *   ③小さい周期では従来と同じ幅（≧0.25W）＝**既存の挙動を狭めない**。
 *
 * ⚠ 高域通過の窓も**試している周期から決める**（2×period）。
 *   固定の「最大周期の2倍」だと、大きい周期を試すときに**バーの塗り段差が引き切れない**。
 *   ★これは調整つまみではない＝「捕まえたい信号より広い構造を落とす」という定義そのもの。
 *
 * @returns {{best:{period,score,from,to}|null, curve:Array, top:object|null}}
 */
export function scanPeriodMultiScale(profile, opts = {}) {
  const o = { ...CT_DEFAULTS, ...opts };
  const W = profile.length;
  const lo = Math.max(2, o.minPeriodPx ?? Math.round(W * o.minPeriodRatio));
  // ★上限を決めるのは**窓ではなく ROI**＝「ROI に minRepeats 回入る」ことだけを要求する。
  const hi = Math.min(Math.floor(W / o.minRepeats), Math.ceil(W * o.maxPeriodRatio));
  if (hi < lo) return { best: null, curve: [], top: null };
  const minWin = Math.max(8, Math.round(W * o.windowRatio));
  const curve = [];
  let top = null;
  for (let p = lo; p <= hi; p += o.periodStep) {
    const z0 = highpass(profile, 2 * p);
    const win = Math.min(W, Math.max(o.minRepeats * p, minWin));
    const step = Math.max(1, Math.round(win / 4));
    let here = null;
    for (let a = 0; a + win <= W; a += step) {
      const z = standardize(z0.slice(a, a + win));
      const a1 = autocorr(z, p);
      const a2 = 2 * p < z.length ? autocorr(z, 2 * p) : a1;
      const score = Math.min(a1, a2);
      if (!here || score > here.score) here = { score, from: a, to: a + win };
    }
    if (!here) continue;
    const row = { period: p, score: +here.score.toFixed(4), from: here.from, to: here.to };
    curve.push(row);
    if (!top || row.score > top.score) top = row;
  }
  // ★★倍音ではなく基本周期を採る。ただし **同じ構造の中でだけ**（v0.19.0 で条件を足した）。
  //   ⚠ 窓が周期ごとに違う今、単に「最短で同点のもの」を採ると
  //   **ROI の別の場所にある別物**（例: バーの目盛り）へ飛び移りうる。
  //   ∴ **最良の窓と重なっている候補**の中から最短を選ぶ＝多義性の解消を構造単位に閉じる。
  const overlaps = (a, b) => a.from < b.to && b.from < a.to;
  const best = top && top.score > 0
    ? (curve.find(c => c.score >= top.score * (1 - o.harmonicMargin) && overlaps(c, top)) ?? top)
    : top;
  return { best, curve, top };
}

/**
 * ★**等間隔に並ぶ山の列**を、周期性（自己相関）を使わずに直接探す（v0.19.0）。
 *
 * ⚠ なぜ自己相関と別に要るか＝**少数のドットは自己相関では出ない**。
 *   自己相関は「繰り返し」を測るので、**3〜5個しかない列**は窓の大半を占める背景に希釈される
 *   （v0.18.0 実走の band[0.75,0.875] がまさにこれ＝**等間隔の山が4つあるのに score 0.056**）。
 *   ★列そのものを幾何として拾えば、**個数が少なくても位置と間隔が出る**。
 *
 * ⚠ **判定はしない**（採否の閾値を置かない）＝**間隔のばらつき（CV）を生値で返す**。
 *   読む側が「これは等間隔か」を判断できる材料だけを渡す（§10.5 の思想）。
 *
 * @returns {{count,spacing,cv,from,to,xs,meanHeight,baseline}|null}
 */
export function evenlySpacedRun(profile, opts = {}) {
  const o = { ...CT_DEFAULTS, ...opts };
  const arr = Array.from(profile, Number);
  const pk = [];
  for (let i = 1; i < arr.length - 1; i++) {
    if (arr[i] > arr[i - 1] && arr[i] >= arr[i + 1]) pk.push(i);
  }
  if (pk.length < 3) return null;
  // ★**尺度は中央値で取る**（絶対閾値を置かない）＝背景のさざ波を落として「山」だけ残す。
  //
  // ⚠⚠ **中央値を取る対象は「プロファイル全体」であって「山の高さ」ではない**（2026-08-18 に修正）。
  //   山の高さの中央値を下限にすると、**構造上つねに山の半分が落ちる**。
  //   ★これは CT では致命的＝**消灯のドットは点灯のドットより暗い**ので、
  //   **数えたい当のものが体系的に落ちる**（実測: 7個のうち4個しか数えられなかった）。
  //   ∴ 下限は**プロファイル自身の水準**にする＝「背景より高い山」を全部残し、
  //   点灯/消灯の明暗差では選別しない（点灯判定はここの仕事ではない）。
  const level = Array.from(arr).sort((a, b) => a - b);
  const med = level[Math.floor(level.length / 2)];
  const cand = pk.filter((i) => arr[i] > med);
  if (cand.length < 3) return null;
  const minSp = Math.max(2, o.minPeriodPx ?? Math.round(arr.length * o.minPeriodRatio));
  let best = null;
  for (let a = 0; a < cand.length - 2; a++) {
    for (let b = a + 1; b < cand.length; b++) {
      const sp = cand[b] - cand[a];
      if (sp < minSp) continue;
      // ★許容は「間隔の 1/4」＝**同じ列かどうかの多義性解消規則**（新しいつまみではない）。
      const tol = Math.max(1, sp * 0.25);
      const xs = [cand[a], cand[b]];
      let next = cand[b] + sp;
      for (;;) {
        let hit = null;
        for (const x of cand) if (Math.abs(x - next) <= tol && (hit == null || Math.abs(x - next) < Math.abs(hit - next))) hit = x;
        // ★★**同族条件で連鎖を止める**（2026-08-18・合成で実際に踏んだ）。
        //   ⚠ これが無いと、本物の列の先にある**背景のさざ波**へ chain が伸びていく
        //   （装飾6個の列が 13 個まで伸び、ドット5個の列は 12 個のさざ波に順位を奪われた）。
        //   ★根拠は幾何ではなく**同じ列の要素は似た見え方をする**という物理＝
        //   採否の閾値ではなく **grouping 規則**（`harmonicMargin` と同じ種類のもの）。
        if (hit != null) {
          const hs = xs.map((x) => arr[x]).sort((u, v) => u - v);
          const medRun = hs[Math.floor(hs.length / 2)];
          if (arr[hit] < 0.4 * medRun) hit = null;
        }
        if (hit == null) break;
        xs.push(hit);
        next = hit + sp;
      }
      if (xs.length < 3) continue;
      const gaps = xs.slice(1).map((x, i) => x - xs[i]);
      const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
      const cv = Math.sqrt(gaps.reduce((s, v) => s + (v - mean) ** 2, 0) / gaps.length) / (mean || 1);
      const meanH = xs.reduce((s, x) => s + arr[x], 0) / xs.length;
      // ★★順位は「**目立ちの総量**」で決める＝Σ(高さ − 中央値)。
      //   ⚠ **「山の数」で順位をつけてはいけない**（2026-08-18 に実際に外した）＝
      //   背景のさざ波は**数だけは多い**ので、本物の少数ドット列を必ず押しのける。
      const prom = xs.reduce((s, x) => s + (arr[x] - med), 0);
      if (!best || prom > best.prom) best = { prom, xs, spacing: mean, cv, meanHeight: meanH };
    }
  }
  if (!best) return null;
  return {
    count: best.xs.length,
    spacing: +best.spacing.toFixed(2),
    /** ★間隔のばらつき（0 に近いほど等間隔）。**判定はしない＝読む側が決める**。 */
    cv: +best.cv.toFixed(3),
    from: best.xs[0],
    to: best.xs.at(-1),
    xs: best.xs,
    meanHeight: +best.meanHeight.toFixed(2),
    /** ★目立ちの総量 Σ(高さ − 中央値)＝順位の根拠（生値）。 */
    prominence: +best.prom.toFixed(2),
    /** 山の高さの中央値＝**この列がどれだけ目立つか**の尺度（生値）。 */
    baseline: +med.toFixed(2),
  };
}

/**
 * ★★**生の輝度プロファイルから「山」を直接取り出す**（2026-08-18c 追加）。
 *
 * ⚠⚠ **なぜ必要になったか（実際に外した読み）**: digest がプロファイルを**上位10山**に畳んでいたため、
 *   **平坦な背景の上の ±1 のノイズが「山」として並び**、CT の枠を **7 と誤読**した。
 *   全120値を見たら右端 29bin は **56〜63（幅7）の平坦**で、山は1つも無かった。
 *   ★**山の判定は「局所最大か」ではなく「どれだけ高いか」で決めるべきだった。**
 *
 * ∴ **プロファイルの振幅の中点でしきい、連結した塊を1つの山と数える**。
 *   ⚠ しきい値は外から与えない＝**そのプロファイル自身の (最小+最大)/2**（自己スケール）。
 *   位置は頂点1点ではなく**重心**で取る（頂点は 1bin のノイズで動く／重心は動かない）。
 *
 * @returns {{count, centers:number[], spacing:number|null, cv:number|null, level:{min,max,mid}}}
 */
export function rawHumps(profile) {
  const arr = Array.from(profile, Number);
  if (arr.length < 3) return { count: 0, centers: [], spacing: null, cv: null, level: null };
  const min = Math.min(...arr), max = Math.max(...arr), mid = (min + max) / 2;
  const centers = [];
  let s = 0, w = 0, open = false;
  for (let i = 0; i <= arr.length; i++) {
    const above = i < arr.length && arr[i] >= mid;
    if (above) { open = true; s += i * (arr[i] - mid); w += arr[i] - mid; }
    else if (open) { if (w > 0) centers.push(+(s / w).toFixed(2)); s = 0; w = 0; open = false; }
  }
  let spacing = null, cv = null;
  if (centers.length >= 2) {
    const g = centers.slice(1).map((c, i) => c - centers[i]);
    const m = g.reduce((a, b) => a + b, 0) / g.length;
    spacing = +m.toFixed(3);
    cv = +(Math.sqrt(g.reduce((t, v) => t + (v - m) ** 2, 0) / g.length) / (m || 1)).toFixed(4);
  }
  return { count: centers.length, centers, spacing, cv, level: { min, max, mid: +mid.toFixed(1) } };
}

/**
 * ★★**山ごとの明るさを、走の全フレームぶん分布で見る**（2026-08-18c 追加）。
 *
 * ⚠ **点灯/消灯のエンコードが未確認**なので判定はしない＝**分位点を生値で返す**。
 *   ★実走の標本で **1番目の山だけ 127 → 210/198 に跳ぶ瞬間**（t=56.4 / 124.9）が観測された。
 *   もし「点灯＝明るい」なら、山ごとの分布は**二峰**になり、
 *   **高い方に居る時間の割合が山ごとに階段状**になるはず＝それが CT の時系列そのもの。
 *   ⚠ そうならなければ、明るさは点灯を表していない（別の手掛かりを探す）。
 */
export function humpSeries(profiles, centers, halfWidth) {
  const q = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)))];
  return centers.map((c) => {
    const vals = [];
    for (const prof of profiles) {
      let s = 0, n = 0;
      for (let x = Math.round(c - halfWidth); x <= Math.round(c + halfWidth); x++) {
        if (x >= 0 && x < prof.length) { s += prof[x]; n++; }
      }
      if (n) vals.push(s / n);
    }
    vals.sort((a, b) => a - b);
    if (!vals.length) return null;
    return {
      center: c,
      p05: +q(vals, 0.05).toFixed(1), p25: +q(vals, 0.25).toFixed(1), p50: +q(vals, 0.50).toFixed(1),
      p75: +q(vals, 0.75).toFixed(1), p95: +q(vals, 0.95).toFixed(1), max: +vals.at(-1).toFixed(1),
      /** ★中央値より 30 以上明るいフレームの割合＝「点灯していた時間」の候補（判定ではない）。 */
      brightFrac: +(vals.filter((v) => v > q(vals, 0.5) + 30).length / vals.length).toFixed(4),
    };
  });
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

    // ★★**色も走全体で平均する**（2026-08-18e 追加）。
    //   ⚠⚠ 動機＝**輝度では点灯を説明できなかった**（実測）。5つのピップは p25/p50/p75 がすべて
    //     **120±0.5** で、明るいフレームの割合も 2〜5 個目が **0.084/0.087/0.086/0.088 と横並び**＝
    //     単調に減る階段になっていない＝**充電の状態を表していない**（全体演出と左寄りのアニメが支配）。
    //   ★∴ 残る仮説は「**点灯は色で表されている**」＝輝度がほぼ同じでも彩度・色相が違いうる
    //     （`lum()` は色を潰す）。**モードゲージにも同じことが言える**（輝度は平坦だった）。
    //   ⚠ 判定は書かない＝**R/G/B の生値を返すだけ**（実物の見え方は未確認のまま）。
    if (img?.width && img.height >= this.o.minHeight) {
      const y0 = Math.max(0, Math.floor(img.height * this.o.band[0]));
      const y1 = Math.min(img.height, Math.ceil(img.height * this.o.band[1]));
      const rows = Math.max(1, y1 - y0);
      if (!this.rgb || this.rgb.n0 !== img.width) {
        this.rgb = { n0: img.width, n: 0,
          r: new Float64Array(img.width), g: new Float64Array(img.width), b: new Float64Array(img.width) };
      }
      for (let x = 0; x < img.width; x++) {
        let sr = 0, sg = 0, sb = 0;
        for (let y = y0; y < y1; y++) {
          const k = (y * img.width + x) * 4;
          sr += img.data[k]; sg += img.data[k + 1]; sb += img.data[k + 2];
        }
        this.rgb.r[x] += sr / rows; this.rgb.g[x] += sg / rows; this.rgb.b[x] += sb / rows;
      }
      this.rgb.n++;
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
    const [dx0, dx1] = this.o.knownDecorX ?? [Infinity, -Infinity];   // null＝抑止しない
    return this.bandAcc.map((accRaw, b) => {
      const acc = Array.from(accRaw, (v) => v / this.bandN);
      // ★★窓を周期に合わせて広げながら探す（v0.19.0）＝**上限 43px の穴を塞いだ経路**。
      const r = scanPeriodMultiScale(acc, { ...this.o, minPeriodPx: minPx });
      const best = r.best
        ? { from: r.best.from, to: r.best.to, period: r.best.period, score: r.best.score } : null;
      // ★自己相関に依らない交差検査＝**少数のドットはここにしか出ない**。
      const peakRun = evenlySpacedRun(acc, { ...this.o, minPeriodPx: minPx });
      // ★装飾かどうかは「**実際に並んでいる山の範囲**」で見る（窓の中点ではない）。
      //   ⚠ 窓は周期ごとに広がるので、中点だけで判定すると**別の場所の構造を装飾と誤ラベル**しうる。
      const core = peakRun ?? best;
      const mid = core ? (core.from + core.to) / 2 / this.bandW : null;
      return {
        band: [+(b / this.o.bandCount).toFixed(3), +((b + 1) / this.o.bandCount).toFixed(3)],
        best,
        /** ★等間隔に並ぶ山の列（個数・間隔・ばらつき）。**判定はせず生値で返す**。 */
        peakRun,
        /** ★既知の装飾（ユーザー確認 2026-08-17）と重なるか＝CT と呼んではいけない。 */
        decor: mid != null && mid >= dx0 && mid <= dx1,
        profile: downsample(acc, this.o.profileBins),
      };
    });
  }

  /** ★走全体を集約して幾何を決める。 */
  solveGeometry() {
    if (this.profiles.length < 2 || !this.width) return { found: false, reason: 'フレームが足りない' };
    // ★★生の輝度の平均と、列ごとの時間σ（＝走の間に変化した列）。
    //   ⚠ どちらも**閾値を通さない生の集計**＝実物の見え方が未確認なので判定はしない。
    const N = this.profiles.length;
    const rawMean = new Float64Array(this.width);
    const sigma = new Float64Array(this.width);
    for (const p of this.profiles) for (let x = 0; x < this.width; x++) rawMean[x] += p[x];
    for (let x = 0; x < this.width; x++) rawMean[x] /= N;
    for (const p of this.profiles) {
      for (let x = 0; x < this.width; x++) { const d = p[x] - rawMean[x]; sigma[x] += d * d; }
    }
    for (let x = 0; x < this.width; x++) sigma[x] = Math.sqrt(sigma[x] / N);
    // 時刻を散らした標本（最大8本）
    const rawHumpsResult = rawHumps(rawMean);
    const nSample = Math.min(8, N);
    const sampleIdx = Array.from({ length: nSample }, (_, k) => Math.floor(k * (N - 1) / Math.max(1, nSample - 1)));

    const hi = Math.min(Math.floor(this.width / 2), Math.ceil(this.width * this.o.maxPeriodRatio));
    const acc = new Float64Array(this.width);
    for (const p of this.profiles) {
      const hp = highpass(p, hi * 2);
      for (let x = 0; x < this.width; x++) acc[x] += Math.abs(hp[x]);
    }
    for (let x = 0; x < this.width; x++) acc[x] /= this.profiles.length;

    // ★★**窓を切って探す**（全域だと局所構造が希釈される＝実走で実際にそうなった）。
    //   ⚠⚠ **ただし窓を固定幅にしてはいけない**（v0.19.0 で修正）＝
    //   固定幅 0.25W と「4周期入ること」が掛かると**探せる周期が W/16 で頭打ち**になり、
    //   **バー全幅に散らばるドット列（5個＝間隔 ≈107px）が原理的に見えなくなる**。
    //   ∴ 窓は**試している周期に合わせて広げる**（`scanPeriodMultiScale`）。
    const minPx = Math.max(2, Math.round(this.width * this.o.minPeriodRatio));
    const ms = scanPeriodMultiScale(acc, { ...this.o, minPeriodPx: minPx });
    const windows = ms.curve.slice().sort((x, y) => y.score - x.score);
    const win = ms.best ?? null;
    const best = win ? { period: win.period, score: win.score } : null;
    const scan = ms.curve.map(({ period, score }) => ({ period, score }));
    const bandScan = this.scanBands();
    const out = {
      /** ★★**帯ごとの探索結果**＝縦のどこに周期構造があるか。**これが今の主要な生データ**。 */
      bandScan,
      /**
       * ★**この走査が探せた周期の範囲**（2026-08-18 追加）。
       * ⚠ v0.18.0 は上限が 43px に潰れていたのに出力からそれが見えず、
       *   「どの帯も低い＝CT は ROI の外」という誤った結論に進みかけた。
       *   ★**測定器の可視範囲を測定結果と一緒に出す**＝範囲外の「無し」は情報ではない。
       */
      searchRange: {
        width: this.width,
        min: Math.max(2, minPx),
        max: Math.min(Math.floor(this.width / this.o.minRepeats), Math.ceil(this.width * this.o.maxPeriodRatio)),
      },
      /** ★窓ごとの最良周期（上位）。**どこに周期構造があるか**が読める生データ。 */
      windowScan: windows.slice(0, 12),
      /** ★採用した窓（構造のある範囲）。 */
      window: win ? { from: win.from, to: win.to } : null,
      /** ★集約プロファイル（**高域通過の絶対値**の平均）＝周期検出の入力。 */
      meanProfile: downsample(acc, this.o.profileBins),
      /**
       * ★★**色の走全体平均**（2026-08-18e）＝**点灯が色で表されているかはここが答える**。
       * ⚠ 輝度（`rawProfile`）では5つのピップが区別できなかった（すべて 120±0.5）。
       * ★灰色なら R≈G≈B ＝ `chroma` はほぼ 0。色が付いていれば大きく振れる。
       */
      rgb: this.rgb && this.rgb.n ? {
        frames: this.rgb.n,
        r: downsample(Array.from(this.rgb.r, (v) => v / this.rgb.n), this.o.profileBins),
        g: downsample(Array.from(this.rgb.g, (v) => v / this.rgb.n), this.o.profileBins),
        b: downsample(Array.from(this.rgb.b, (v) => v / this.rgb.n), this.o.profileBins),
      } : null,
      /**
       * ★★**色みの強さ**（R−B）＝**灰色なら 0 付近・暖色は正・寒色は負**。
       * ⚠ 1本の配列で「色が付いているか」が読めるので、判断はまずここを見る。
       */
      chroma: this.rgb && this.rgb.n
        ? downsample(Array.from(this.rgb.r, (v, i) => (v - this.rgb.b[i]) / this.rgb.n), this.o.profileBins)
        : null,
      /**
       * ★★**生の輝度の平均**（高域通過を通していない）＝**要素が何なのかはここが答える**。
       * ⚠ 2026-08-18 追加。`meanProfile` は |高域通過| なので**山がドットの縁に立つ**＝
       *   **離散ドットか連続ゲージかの判別には使えない**（合成で周期の半分を掴んだ）。
       *   生の輝度なら「山が離散的に並ぶ」か「境界が1つだけある」かがそのまま見える。
       */
      rawProfile: downsample(rawMean, this.o.profileBins),
      /**
       * ★★**列ごとの時間方向の標準偏差**＝**走の間に変化した列はどこか**。
       * ⭐ これは**点灯/消灯のエンコードを仮定しない**localizer＝
       *   CT のピップは戦闘中に必ず状態が変わるので σ が立ち、背景・装飾は σ ≈ 0 になる。
       * ⚠ 走の間ずっと同じ状態だったピップは立たない＝`rawProfile` と**併せて**読む。
       */
      sigmaProfile: downsample(sigma, this.o.profileBins),
      /**
       * ★★**生の輝度から数えた山**（自己スケールのしきい＋重心）。
       * ⚠ 上位N山の抽出は**平坦な背景のノイズを山と数える**（2026-08-18c に実際に誤読した）。
       */
      humps: rawHumpsResult,
      /**
       * ★★**山ごとの色**（走全体の平均 R/G/B と R−B）。
       * ⚠ ピップが「点灯＝色つき／消灯＝灰」なら、**山ごとに R−B が階段状に変わる**はず。
       *   輝度では横並びだったので、**ここが違えば点灯は色で表されている**と分かる。
       */
      humpColors: rawHumpsResult.count && this.rgb && this.rgb.n
        ? rawHumpsResult.centers.map((c) => {
            const h = Math.max(1, Math.round((rawHumpsResult.spacing ?? 8) / 4));
            let r = 0, g = 0, b = 0, n = 0;
            for (let x = Math.round(c - h); x <= Math.round(c + h); x++) {
              if (x < 0 || x >= this.rgb.n0) continue;
              r += this.rgb.r[x]; g += this.rgb.g[x]; b += this.rgb.b[x]; n++;
            }
            const k = Math.max(1, n) * this.rgb.n;
            return { center: c, r: +(r / k).toFixed(1), g: +(g / k).toFixed(1), b: +(b / k).toFixed(1),
                     chroma: +((r - b) / k).toFixed(1) };
          })
        : [],
      /** ★山ごとの明るさの分布（走の全フレーム）＝**点灯のエンコードはここが答える**。 */
      humpSeries: rawHumpsResult.count
        ? humpSeries(this.profiles, rawHumpsResult.centers,
            Math.max(1, (rawHumpsResult.spacing ?? 8) / 4))
        : [],
      /**
       * ★**時刻を散らした生プロファイルの標本**＝どう変化するかを実物で見る。
       * ⚠ 「変化した」だけでは読み方が決まらない。**どの形からどの形へ変わったか**が要る。
       */
      sampleProfiles: sampleIdx.map((i) => ({
        t: this.times[i], profile: downsample(this.profiles[i], this.o.profileBins),
      })),
      /** ★等間隔に並ぶ山の列（自己相関に依らない交差検査・**少数ドットはここに出る**）。 */
      peakRun: evenlySpacedRun(acc, { ...this.o, minPeriodPx: minPx }),
      periodScan: scan.filter((_, i) => i % Math.max(1, Math.ceil(scan.length / 40)) === 0),
      bestPeriod: best,
      frames: this.profiles.length,
    };
    if (!best || best.score < this.o.periodicityFloor) {
      return { ...out, found: false,
        reason: `ドット列の周期性が弱い（score ${best ? best.score : '-'} < ${this.o.periodicityFloor}）` };
    }
    // ★★**周期は自己相関で「見つけ」、櫛フィルタで「測り直す」**（v0.19.0）。
    //   ⚠ 整数ラグの自己相関は繰り返しが 4〜5 回しかないと**周期を数%外す**（合成で真値 106 に対し 110）。
    //   3.8% の誤差でも格子を5個ぶん伸ばせば 20px ずれる＝**ドットを取りこぼす**（5個を3個と数えた）。
    //   ∴ 粗い周期のまわりを**小数刻みで掃いて、格子点と格子の谷の差が最大になる (P, 位相) を採る**。
    //   ★新しい閾値は増えない（最大化するだけ）＝「位置で解ける問題を推定で済ませない」の一例。
    //   ⚠ **山の chain（`evenlySpacedRun`）でこれをやってはいけない**＝2026-08-18 に試して外した。
    //     背景のさざ波が本物の列より多く並ぶので、**数で順位をつけると必ず負ける**。
    const wa = win.from, wb = win.to;
    const combScore = (P, ph) => {
      let on = 0, non = 0, off = 0, noff = 0;
      for (let x = ph; x < wb; x += P) {
        const i = Math.round(x);
        if (i >= wa && i < this.width) { on += acc[i]; non++; }
        const j = Math.round(x + P / 2);
        if (j >= wa && j < this.width) { off += acc[j]; noff++; }
      }
      if (non < this.o.minRepeats || !noff) return -Infinity;
      return on / non - off / noff;
    };
    let P = best.period, phase = wa, bestMag = -Infinity;
    for (let p = best.period * 0.85; p <= best.period * 1.15; p += 0.25) {
      if (p < 2) continue;
      for (let ph = wa; ph < wa + p; ph += 0.25) {
        const m = combScore(p, ph);
        if (m > bestMag) { bestMag = m; P = p; phase = ph; }
      }
    }
    P = Math.max(2, Math.round(P));
    phase = Math.round(phase);
    // ★ドットは「**周期の格子のうち、実際に山になっている**」位置だけ採る。
    //   ⚠ 格子には端の空白も並ぶので、そのまま数えると**必ず1個多くなる**（実装時に n+1 を返した）。
    //   ∴ **隣の谷（±P/2）より高いか**という**局所の形**で判定する＝
    //   全体に対する閾値を置かずに済む（★位置で解ける問題を閾値で解こうとしない）。
    // ★★**独立な2つの測り方が一致したときだけ、山の位置をそのまま採る**（v0.19.0）。
    //   ① 自己相関＋櫛フィルタ（`P`）… 「繰り返しがあるか」と「その間隔」
    //   ② 山の chain（`evenlySpacedRun`）… 「実際にどこに並んでいるか」
    //   ⚠ ②は**窓の外にも伸びる**ので、窓に閉じた格子走査が取りこぼす端のドットを拾える
    //     （合成でドット5個の左端・7個の左3個を実際に取りこぼしていた）。
    //   ⚠⚠ ただし**②だけを信用しない**＝間隔が①と 25% 以内で一致することを要求する。
    //     食い違ったら格子走査へ落ちる（そして食い違い自体が `peakRun` として出力に残る）。
    const runFit = evenlySpacedRun(acc, { ...this.o, minPeriodPx: minPx });
    const agree = runFit && Math.abs(runFit.spacing - P) / P <= 0.25;
    const at = (x) => (x >= 0 && x < this.width ? acc[x] : null);
    const centers = [];
    if (agree) centers.push(...runFit.xs);
    else {
      // ★格子は **ROI 全体**に張り、**山が連続している区間**だけを列として採る（v0.19.0）。
      //   ⚠ 旧実装は格子を「最良の窓の中」に閉じていたので、**窓からはみ出したドットを落としていた**
      //     （合成で 687px の ROI に 5個置いたら 3個しか数えなかった＝窓幅 440px に収まらない）。
      //   ★窓は「構造がどこにあるか」を見つけるためのもので、**列の端を決める権限は無い**。
      //   ∴ 列の端は「**次の格子点がもう山ではない**」という構造で決める（閾値を置かない）。
      const isDot = (x) => {
        const h = Math.round(P / 2);
        const l = at(x - h), r = at(x + h);
        // ⚠ **両隣の谷が ROI 内にあることを要求する**。片側しか無い格子点＝ROI の端であり、
        //   そこは判定材料が足りない。片側で代用すると**端に必ず偽のドットが1個生える**
        //   （実装時に合成でドット数が n+1 になった）。
        if (l == null || r == null) return false;
        return acc[x] > l && acc[x] > r;
      };
      // 窓の中に足場を1つ見つけ、そこから左右へ「山が続くかぎり」伸ばす。
      let seed = null;
      for (let x = phase; x < wb; x += P) if (isDot(x)) { seed = x; break; }
      if (seed != null) {
        for (let x = seed; x >= 0 && isDot(x); x -= P) centers.unshift(x);
        for (let x = seed + P; x < this.width && isDot(x); x += P) centers.push(x);
      }
    }
    // ★★見つけた構造が**既知の装飾**の範囲なら「CT を見つけた」と言ってはいけない。
    //   ★範囲は「**実際に並んでいる山の範囲**」で見る（窓は周期に応じて広がるので中点は当てにならない）。
    const core = centers.length >= 2
      ? { from: centers[0], to: centers.at(-1) } : { from: win.from, to: win.to };
    const mid = (core.from + core.to) / 2 / this.width;
    const [dx0, dx1] = this.o.knownDecorX ?? [Infinity, -Infinity];   // null＝抑止しない
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
      hint: '★まず `searchRange` を見る＝**探せなかった範囲の「無し」は情報ではない**'
        + '（2026-08-18 に実際にここで誤りかけた）。次に `bandScan[].peakRun`＝'
        + '**少数のドット列は自己相関では出ず、等間隔の山の列としてだけ出る**。'
        + '⚠ `periodicityFloor` は**合成フィクスチャ由来の未較正値**＝実測分布で決め直す（推測でいじらない）。'
        + '⚠ どの帯にも山の列が無いなら、はじめて「ドットは ROI の外」を疑う。',
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
