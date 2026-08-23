// T1 録画転記 — 読み取りの検算（Phase 9 P3-1b）
//
// ★本モジュールが答える問い: 「**読んだ数値の並びは、それ自体で矛盾していないか**」。
//   どの成分か・どの押下かの意味づけは P3-2 以降の仕事で、ここでは扱わない。
//
// ─────────────────────────────────────────────────────────────
// ★なぜ検算が要るのか（P3-1 の実測が決めた設計前提）
// ─────────────────────────────────────────────────────────────
//   ⚠⚠ **マージンは安全網にならない**（PHASE9_PLAN §4.3.0h・実切り抜き10枚 73点で測定）＝
//     margin 0.04 → 誤8 ／ margin 0.12 → 誤8。**上げても誤りが1件も減らず、歩留まりだけ落ちる**。
//     ★実機の誤読は「自信のある誤読」だから。
//   ∴ ★★**安全網は照合器の外＝検算に置く**（PHASE9_PLAN §5 の ③値域・④ラベル・⑦TOTAL）。
//
// ─────────────────────────────────────────────────────────────
// ★★検算が何を捕まえ、何を捕まえないか（実データで確かめた区分）
// ─────────────────────────────────────────────────────────────
//   | 誤りの型 | カンマ文法 | 値域 | 先頭ゼロ | **⑦ TOTAL** |
//   |---|---|---|---|---|
//   | 中の桁の脱落・混入（`5,04,101`） | **捕まる** | 場合による | — | 捕まる |
//   | 桁違い（1桁多い/少ない） | — | **捕まる** | — | 捕まる |
//   | 先頭が 0 になる誤読 | — | — | **捕まる** | 捕まる |
//   | **1文字の置換**（`5→3` 等） | 捕まらない | ほぼ捕まらない | — | ★**捕まる** |
//   ★P3-1 に残った実データの誤り 6件は**すべて1文字の置換**（`5→3`×2 `0→7` `6→0` `7→0` `3→5`）＝
//     **文法・値域では原理的に捕まらない**。**⑦ だけが効く**。これが本モジュールの主眼。
//
// ─────────────────────────────────────────────────────────────
// ⚠⚠ 値域に「シムの cap」を使ってはいけない（循環）
// ─────────────────────────────────────────────────────────────
//   `src/constants.js` の `DMG.*_cap` は**較正対象そのもの**であって実機の事実ではない。
//   ★実例＝**C41**: `DMG.betaia_cap = 800,000` に対し実機1ヒットは **206〜247万**＝
//   シムの cap を値域に使えば、**正しい読みを片端から棄却する**（しかも「検算が通らない」という
//   もっともらしい形で）。∴ 既定は**構造的な上限**（敵の全 HP を超える1ヒットは在りえない）に置き、
//   corpus 由来の帯は**参考値として別に**返す。E1＝測定条件を必ず併記する。
//
// 純関数（DOM 非依存）＝Node でセルフテストできる。依存なし（葉モジュール）。

/**
 * 既定値。⚠ **由来を1つずつ明示する**（E1）。
 */
export const VERIFY_DEFAULTS = {
  /**
   * ★値域の構造的上限。**敵の全 HP**（HP 1% = 980万＝P1 実測 → 全 HP ≈ 9.8億）。
   * ⚠ 「1ヒットが敵の全 HP を超えることは無い」という**構造**から来ており、シムの cap ではない。
   * ⚠ 敵が変われば変わる＝`checkValueRange` に `max` を渡して上書きする（P4 の config 版管理で自動化）。
   */
  maxValue: 980_000_000,
  /** 値域の下限＝表示されるダメージは正の整数。0 は「表示が出ない」であって 0 ダメージ表示ではない。 */
  minValue: 1,
  /**
   * ★★参考帯（**判定には使わない**）＝P3-1 の実切り抜き14枚で実際に観測した値の範囲。
   * 測定条件: M3-1.mp4 ／ configC ／ バースト本体11・ストリーク3（2026-08-19〜21 受領）。
   * ⚠ **これは「よくある値」であって「在りうる値」ではない**＝外れても誤りとは言えない。
   *   `checkValueRange` は `unusual` フラグでのみ知らせ、`ok` は落とさない。
   */
  usualBand: { min: 596_000, max: 10_313_546 },
  /** ⑦ 突合の候補探索: 1トークンあたり試す候補数（`classify` の上位から） */
  candidateTopK: 3,
  /**
   * ★⑦ 突合で**採用してよい差し替え文字数**（解の大きさの上限）。
   * ★実測（`tools/t1_verify_probe.mjs`・実切り抜き14枚 101文字・k=2/3/4/6 の全束）＝
   *   **採用 ≤2 / 探索 ≤3 が「偽の訂正 0」を保ったまま歩留まりが最大**（k=2 で 6/36 が直る）。
   *   採用 ≤1 に締めても偽の訂正は 0 のままだが直る件数が 6→1 に落ちる＝**締めすぎ**。
   */
  acceptSwaps: 2,
  /**
   * ★★**採用する深さより深く探す**（`searchSwaps > acceptSwaps`）。
   *
   * ⚠⚠ **これが「偽の訂正」を消した唯一の効いた手**（2026-08-23・実データで測定）＝
   *   `tools/t1_verify_probe.mjs` で観測した事故の機構はこうだった:
   *     真 `4957011`+`5553703` ／ 読 `4957711`+`5553005`
   *     ＝ **+700 と −700 が打ち消し合い**、残差にはもう1つの誤り（+2）しか現れない。
   *   ∴ 「残差 −2 を1文字で説明する」直し方が**一意に**見つかり、**合計は合うのに中身は誤ったまま**通る。
   * ★深く探せば、真の直し方（3文字）も同じ残差を説明することが見え、**一意でなくなる**＝
   *   「読めない」に倒れる。**採用の条件は「解が在る」ではなく「他に説明が無い」**。
   * ⚠ 代償＝歩留まりが落ちる（直せる件数が減る）。**間違って直すよりよい**（本 Phase の憲法）。
   */
  searchSwaps: 3,
  /**
   * ★**この score 以上のトークンは動かさない**（候補探索の固定点）。
   * ⚠ **未較正**＝P3-1 の実測では score の絶対値で正誤を分けられない（`GLYPH_DEFAULTS.rejectAmbiguous`
   *   の注記＝誤読 0.564〜0.632 / 正解 0.539〜0.999 と重なる）。∴ **既定は「固定しない」(1.01)**＝
   *   全トークンを動かしうる。速度が問題になったときだけ下げる（E1＝下げたら測る）。
   */
  trustScore: 1.01,
};

// ─────────────────────────────────────────────────────────────
// 1. その場でできる検算（1つの数値だけを見る）
// ─────────────────────────────────────────────────────────────

/**
 * ★**先頭ゼロは在りえない**（表示は `5,044,101` であって `0,044,101` ではない）。
 * ⚠ 単独の `0` だけは在りうる形なので、**桁数2以上のときだけ**見る。
 * ★これは1文字の置換のうち**先頭の1件だけ**を捕まえる（`5→0` 等）＝安いので入れておく。
 */
export function checkNoLeadingZero(text) {
  const digits = String(text ?? '').replace(/,/g, '');
  if (digits.length >= 2 && digits[0] === '0') {
    return { ok: false, reason: `先頭が 0（${text}）＝表示の数値として在りえない` };
  }
  return { ok: true, reason: null };
}

/**
 * 検算③ — **値域**。桁違いの誤読を捕まえる。
 *
 * @param {number} value
 * @param {object} [opts] `{min, max, usualBand}` — **敵が変われば `max` を渡す**（既定は構造上限）
 * @returns {{ok:boolean, reason:string|null, unusual:boolean, note:string|null}}
 */
export function checkValueRange(value, opts = {}) {
  const o = { ...VERIFY_DEFAULTS, ...opts };
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, reason: '整数として読めていない', unusual: false, note: null };
  }
  if (value < o.minValue) return { ok: false, reason: `${value} が下限 ${o.minValue} 未満`, unusual: false, note: null };
  if (value > o.maxValue) {
    return { ok: false, reason: `${value} が上限 ${o.maxValue}（敵の全 HP 相当）を超える＝桁を1つ多く読んだ疑い`,
             unusual: false, note: null };
  }
  // ⚠ 参考帯の外は**知らせるだけ**（判定しない）＝corpus は「在りうる値」を定義しない。
  const b = o.usualBand;
  const unusual = !!b && (value < b.min || value > b.max);
  return {
    ok: true, reason: null, unusual,
    note: unusual ? `参考帯（P3-1 の実測 ${b.min.toLocaleString()}〜${b.max.toLocaleString()}）の外＝誤りとは限らない` : null,
  };
}

// ─────────────────────────────────────────────────────────────
// 2. 検算⑦ — `TOTAL` ↔ 個別ヒットの合計
// ─────────────────────────────────────────────────────────────
//
// ★**集計単位はユーザー回答で確定済**（PHASE9_PLAN §4「第2便の発見」・2026-08-14）:
//   | 単位 | `TOTAL` の中身 |
//   | アビリティ | 多段ヒットの合計 |
//   | **バースト** | **本体 ＋ 追加ダメージ** |
//   | 攻撃（通常） | 多段攻撃の合計 |
//   ★**含まれないもの** ＝ **追撃**（ロボ追撃・1アシ追撃 等）／**バーストストリーク**。
// ⚠ ∴ 本モジュールは「**同じ押下に属すると判断済みのヒット集合**」を受け取るだけで、
//   その仕分け自体は行わない（＝P3-2 の仕事）。ここで仕分けを始めると循環する。

/**
 * 検算⑦（判定だけ） — 読めているヒットの合計が `TOTAL` と一致するか。
 *
 * @param {Array<number>} hits 同一押下に属する個別ヒット（**追撃・ストリークを含めない**）
 * @param {number} total 画面の `TOTAL` 表示
 * @returns {{ok:boolean, sum:number, residual:number, reason:string|null, missingHitLikely:boolean}}
 */
export function checkTotal(hits, total, opts = {}) {
  const o = { ...VERIFY_DEFAULTS, ...opts };
  const list = (hits ?? []).filter((v) => Number.isFinite(v));
  const sum = list.reduce((a, b) => a + b, 0);
  const residual = total - sum;
  if (residual === 0) return { ok: true, sum, residual, reason: null, missingHitLikely: false };
  // ★**残差そのものが1ヒットとして在りうる大きさ**なら「取りこぼし」の疑い＝
  //   誤読（残差は正にも負にもなり、typical hit と無関係な値になる）と区別する手がかり。
  // ⚠ **下限が要る**（テストが捕まえた）＝残差 2 を「ヒット1つぶん」と言ってはいけない。
  //   ★根拠＝**同じ押下の多段ヒットは同じオーダー**（P1 実測 596〜605千＝ばらつき 2%）。
  //   ∴ 束の最小ヒットの 1/10 に満たない残差は、取りこぼしではなく**誤読**。
  const floor = (list.length ? Math.min(...list) : o.usualBand.min) * 0.1;
  const missingHitLikely = residual > 0 && checkValueRange(residual, o).ok
    && residual >= floor && (!list.length || residual <= Math.max(...list) * 1.5);
  return {
    ok: false, sum, residual,
    reason: missingHitLikely
      ? `合計が ${residual.toLocaleString()} 不足＝**ヒットの取りこぼし**の疑い（残差が1ヒットとして在りうる大きさ）`
      : `合計が TOTAL と ${Math.abs(residual).toLocaleString()} 食い違う（${residual > 0 ? '不足' : '過剰'}）＝**誤読**の疑い`,
    missingHitLikely,
  };
}

/**
 * ★★**検算⑦ の本体＝`TOTAL` との差から、どの文字を読み違えたかを逆算する**。
 *
 * ⚠ これが P3-1b の主眼。**照合器は候補を出すだけでよい**（PHASE9_PLAN §5）＝
 *   1文字の置換は文法でも値域でも捕まらないが、**合計が1円単位で合う直し方は滅多に無い**ので、
 *   `TOTAL` があれば**誤読を特定して直せる**。
 *
 * ★★**全列挙ではなく残差から逆算する**（設計判断・2026-08-23）:
 *   素朴に「各文字の上位3候補を全部試す」と 7桁×3行で 3^21 ＝ 10^10 通りになり成立しない。
 *   だが**1文字を `d` から `d'` に替えたときの合計の動きは `(d'−d)·10^p` と決まっている**ので、
 *   ★**残差 `total − Σ` に一致する差し替えだけを直接引き当てられる**（1文字なら O(文字数)）。
 *   ∴ 探索空間は「差し替える文字数」＝`maxSwaps` だけで決まる。
 *   ⚠ P3-1 の実測では**1つの表示あたりの誤りは最大3文字**（14枚中の最悪が `5,125,605` の3件）＝
 *     既定 2 で 6件中5件の型を覆い、3 まで上げても数千通りで済む。
 *
 * ⚠⚠ **一意でなければ採用しない**（複数の直し方が合うなら「読めない」と言う）＝
 *   本 Phase の憲法「間違って読むくらいなら読めないと言う」。
 *
 * ⚠ 前提＝**`TOTAL` 自身は正しく読めている**こと。TOTAL が誤読なら残差が嘘になる。
 *   ∴ 呼ぶ側は TOTAL 行を**別に検算**する（値域・カンマ文法・ラベルの錨）。
 *
 * @param {Array<{tokens:Array}>} rows `readRow` の結果（`tokens[].candidates` を使う）
 * @param {number} total
 * @returns {{ok:boolean, unique:boolean, baseline:object, solutions:Array, examined:number, reason:string|null}}
 */
export function reconcileWithTotal(rows, total, opts = {}) {
  const o = { ...VERIFY_DEFAULTS, ...opts };
  const built = (rows ?? []).map((r) => baselineOf(r, o));
  const bad = built.find((b) => b.reason);
  if (bad) return { ok: false, unique: false, baseline: null, solutions: [], examined: 0, reason: bad.reason };

  const sum = built.reduce((a, b) => a + b.value, 0);
  const residual = total - sum;
  const baseline = { sum, residual, texts: built.map((b) => b.text) };
  if (residual === 0) {
    // ⚠ 形を揃える（テストが捕まえた）＝呼ぶ側が解の中身を場合分けしなくて済むように。
    return { ok: true, unique: true, baseline, examined: 0, reason: null,
             solutions: [{ swaps: [], rows: built.map((b) => ({ text: b.text, value: b.value })), cost: 0 }] };
  }

  // ★差し替え1手の一覧＝`{row, pos, from, to, delta, cost}`。**delta が合計に効く量**。
  const moves = [];
  for (let ri = 0; ri < built.length; ri++) {
    const b = built[ri];
    for (let pi = 0; pi < b.digits.length; pi++) {
      const place = 10 ** (b.digits.length - 1 - pi);
      const from = b.digits[pi];
      for (const c of b.alts[pi]) {
        if (c.key === from) continue;
        moves.push({ row: ri, pos: pi, from, to: c.key,
                     delta: (Number(c.key) - Number(from)) * place,
                     cost: (b.scores[pi] ?? 0) - (c.score ?? 0) });
      }
    }
  }

  // 残差に一致する差し替えの組（同じ文字を2度動かさない）。
  // ⚠ 一意性が判定できれば十分なので、解が2つ見つかった時点以降は数えるだけにする。
  const solutions = [];
  let examined = 0;
  const used = new Set();
  const pick = [];
  const dfs = (start, remaining, depth) => {
    if (solutions.length > 4) return;                     // 一意でないことは既に確定＝証拠は数件で足りる
    if (remaining === 0 && depth > 0) { solutions.push(pick.map((m) => ({ ...m }))); return; }
    if (depth >= o.searchSwaps) return;
    for (let i = start; i < moves.length; i++) {
      const m = moves[i];
      const k = m.row * 1000 + m.pos;
      if (used.has(k)) continue;
      examined++;
      used.add(k); pick.push(m);
      dfs(i + 1, remaining - m.delta, depth + 1);
      pick.pop(); used.delete(k);
    }
  };
  dfs(0, residual, 0);

  // ★組み立て直した値にも値域・先頭ゼロを通す（在りえない直し方を解として出さない）
  const valid = solutions.filter((sol) => applySwaps(built, sol).every((r) =>
    checkNoLeadingZero(r.text).ok && checkValueRange(r.value, o).ok));

  // ★**採用は浅い解だけ・棄却は深い解も見る**＝上の注記の非対称性がここ。
  const accept = valid.filter((sol) => sol.length <= o.acceptSwaps);
  const unique = accept.length === 1 && valid.length === 1;
  return {
    ok: unique, unique, baseline,
    solutions: valid.map((sol) => ({ swaps: sol, rows: applySwaps(built, sol),
                                     cost: +sol.reduce((a, m) => a + m.cost, 0).toFixed(4) })),
    examined,
    reason: unique ? null
      : valid.length === 0
        ? `残差 ${residual.toLocaleString()} を ${o.searchSwaps} 文字以内の差し替えで説明できない`
          + '＝ヒットの取りこぼし、または候補の外の誤読'
        : accept.length === 0
          ? `説明は ${valid.length} 通り見つかったが、いずれも ${o.acceptSwaps} 文字を超える差し替え`
            + '＝誤りが想定より多い（採用しない）'
          : `${valid.length} 通りの直し方が同じ合計になる＝一意でないので採用しない（読めないと言う）`,
  };
}

/** 1行の「いまの読み」と、各文字の代替候補（内部）。 */
function baselineOf(row, o) {
  const tokens = (row?.tokens ?? []).filter((t) => (t.key ?? '') !== ',');
  if (!tokens.length) return { reason: '行にトークンが無い' };
  const digits = [], scores = [], alts = [];
  for (const t of tokens) {
    const cs = (t.candidates ?? []).filter((c) => /^[0-9]$/.test(c.key)).slice(0, o.candidateTopK);
    // ★baseline は「照合の1位」＝`accepted` でなくても採る。**直す対象は自信のある誤読だから**
    //   （margin が安全網にならない＝GLYPH_DEFAULTS.ambiguityMargin の実測）。
    const head = /^[0-9]$/.test(t.key ?? '') ? t.key : cs[0]?.key;
    if (head == null) return { reason: '数字候補が1つも無いトークンがある（照合の前段が壊れている）' };
    digits.push(head);
    scores.push(cs.find((c) => c.key === head)?.score ?? t.score ?? 0);
    alts.push(cs.length ? cs : [{ key: head, score: t.score ?? 0 }]);
  }
  const text = digits.join('');
  return { digits, scores, alts, text, value: Number(text), reason: null };
}

/** 差し替えを当てて、行ごとの `{text, value}` に戻す（内部）。 */
function applySwaps(built, swaps) {
  const out = built.map((b) => b.digits.slice());
  for (const m of swaps) out[m.row][m.pos] = m.to;
  return out.map((d) => ({ text: d.join(''), value: Number(d.join('')) }));
}

// ─────────────────────────────────────────────────────────────
// 3. まとめて回す
// ─────────────────────────────────────────────────────────────

/**
 * 1フレームぶんの読みに ③（値域）・⑦（TOTAL）を通す。
 * ④（ラベルのテンプレ）は**検出そのものが glyph.js の仕事**なので、ここでは
 * 「検出されたラベルが数値と整合するか」だけを見る（`labels` を渡さなければ素通り）。
 *
 * @returns {{ok:boolean, checks:Array, value:object|null}}
 */
export function verifyReadout({ rows = [], total = null, labels = [] } = {}, opts = {}) {
  const o = { ...VERIFY_DEFAULTS, ...opts };
  const checks = [];
  const readable = rows.filter((r) => r.number?.ok);

  for (const r of readable) {
    const g = checkNoLeadingZero(r.number.text);
    if (!g.ok) checks.push({ id: 'range', level: 'ERROR', ok: false, reason: g.reason });
    const v = checkValueRange(r.number.value, o);
    if (!v.ok) checks.push({ id: 'range', level: 'ERROR', ok: false, reason: `${r.number.text}: ${v.reason}` });
    else if (v.unusual) checks.push({ id: 'range', level: 'INFO', ok: true, reason: `${r.number.text}: ${v.note}` });
  }

  // ④ ラベルは数値の**真上**（固定オフセット・ユーザー確定）＝**孤立したラベルは検出の誤り**
  for (const L of labels) {
    if (L.anchor == null) {
      checks.push({ id: 'label', level: 'WARN', ok: false,
        reason: `ラベル ${L.key} が数値行に紐づかない＝誤検出、または数値が読めていない` });
    }
  }

  let value = null;
  if (total != null) {
    const hits = readable.filter((r) => !r.isTotal).map((r) => r.number.value);
    const t = checkTotal(hits, total, o);
    checks.push({ id: 'total', level: t.ok ? 'INFO' : 'WARN', ok: t.ok, reason: t.reason ?? 'TOTAL と一致' });
    if (!t.ok) {
      const rec = reconcileWithTotal(rows.filter((r) => !r.isTotal), total, o);
      checks.push({ id: 'total-reconcile', level: rec.ok ? 'INFO' : 'WARN', ok: rec.ok,
        reason: rec.ok ? '候補の中に TOTAL と一致する読みが**一意に**ある' : rec.reason });
      if (rec.ok) value = { corrected: rec.solutions[0] };
    }
  }
  return { ok: checks.every((c) => c.ok !== false || c.level === 'INFO'), checks, value };
}
