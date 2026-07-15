# Phase 7：静的スコア s の機械学習化（設計台帳・**クローズ／archive**）

> [!NOTE]
> **クローズ（2026-07-15・archive 移設）**: PoC×2（§6 phase-1 / §7 phase-2）で**安価サロゲートによる s の ML 最適化は
> NO-GO**（proxy=不感かつ非転移・浅ビーム=full と反整合で退行・ビーム幅掃引で cal×beamW=64 が大域最良＝production は
> 実用上限）と実測確定。**否定的結論を得た成果としてクローズ**し本書は歴史台帳（archive）へ。将来 grid 較正の飽和が
> 崩れた兆候が出た場合のみ §5 の再開条件（`archive/tools/ml_fit_static_v2.mjs` を `SURR_MODE=fulln` で再測定）を検討する。
> ハーネスは `archive/tools/ml_fit_static{,_v2}.mjs`（`npm run poc:ml`）・src の beamW 注入フックは inert のまま温存。

**状態: クローズ（2026-07-15 起票→同日 PoC×2 完了→archive）**。ROADMAP §3 の歴史台帳。
本書は「探索ヒューリスティック（静的スコア `s`）の直書き定数を、機械学習／最適化で fit した値に置き換える」構想の
スコープ・レベル分け（A/B/C）・工数/リスク吟味・**レベルA PoCハーネス設計**と**PoC結果（§6/§7）**を記録する。

> [!IMPORTANT]
> **本Phaseが触るのは探索ヒューリスティックだけ**。実機との**絶対値乖離**（C25/C5 等）は**ダメージ式側**の問題であり、
> `s` の学習化では 1 ミリも改善しない（§1.3）。両者を混同しないこと。

---

## 1. 現状把握：静的スコア `s` とは何か（設計判断の起点）

### 1.1 `s` の役割（ダメージ非関与）
`s` は **ダメージ計算に一切関与しない探索ヒューリスティック**である。実ダメージは「実際に押したキー列」だけで決まり
（`_replayResult` は override 非依存＝CLAUDE.md 検証節）、`s` が効くのは次の 2 点のみ：

1. **ロールアウトの既定ポリシー** — `Sim._stepStatic()`（`planDepth>=2`）が「合法候補のうち最大 `s`」を選ぶ。
   これは `_objective()` が**将来ターンを安価に代理採点**する部分＝ビームが実ルートを選ぶ際の**推定精度**を左右する。
2. **ビーム／同点時のタイブレーク** — `_candidates()` の `s` と `cmpVec` の辞書式比較の最終手段。

∴ `s` を改善して得られるのは「ロールアウト近似の質」＝**ビームがより良い実ルートを選ぶ**こと。ダメージ式や
ビーム本体（`_finishStatic`+`_objective` の厳密採点）は不変。

### 1.2 `s` の現在の 3 層構造
| 層 | 実体 | 例 | 学習化の対象性 |
|---|---|---|---|
| ①直書き定数 | `data/characters.js` の `cands[key].s`（数値） | `droid:201`, `funki:150`, `inori:160`, `helix:400` | **○ 主対象** |
| ②構造的自動導出 | `computeBaseScore(key,cand)`（`s` 省略時のみ・`src/app.js`） | atkBuf=300 / 色±/partyBG+10/deploysRobot+20/契晶-5×kc … | **○（重み学習の対象）** |
| ③関数 `s`（動的） | `cands[key].s` が**関数** | `ifishant: ct*ct` / `judg` / `puvoir: mburst%5>=2?9999:140` / `pactcore` | **△ 除外気味**（文脈依存クロージャ・§3.6） |
| ④grid較正 override | `calibrateStaticScores()` が数レバーを機械 fit | production `{judg:160, pactcore:1}` | **既に一種の「機械最適化」**（§1.4） |

### 1.3 学習化が触らない領域（誤爆防止）
- **絶対値較正（C25 raw枠不足・C5 追撃cap 未到達 等）**＝`_na()`/`_decay()`/係数の**ダメージ式**問題。`s` 非関与。
- **押し順の実機一致（Phase 4 主目標）**＝これは `s` 改善で*近づく可能性*はあるが、序数（押し順）は蓄積誤差に
  頑健（PHASE4_PLAN）＝ML の主戦場は「押し順そのもの」ではなく「探索がダメージ最大ルートを取りこぼさない」こと。

### 1.4 「既に機械較正済み」という基準線
`calibrateStaticScores()`（proxy-shortlist + full-verify・**単調安全**＝baseline `{}` を必ず含み退行しない）は、
既に `CALIB_GRID` の数キーをグリッド探索で fit している。**ML化の価値は、この既存グリッド較正を実ダメージで
上回ること**。上回れないなら工数は無駄＝**まず PoC で上限を測る**（§4）のが本Phaseの入口。

### 1.5 ハード制約（レベル選択を規定する不変条件）
1. **ホットパス性能**: `_stepStatic` は探索の約 43%（`src/sim.js` コメント）、clone 毎に数百万回、**Web Worker 内・
   純JS・自己完結バンドル（外部ランタイム依存不可）**で走る。∴ 候補×ステップ毎の重い推論は不可。**線形内積までが安全**。
2. **決定性 & golden**: raw `187,186,834` / cal `208,689,608`（C27）は決定的回帰。`s` が変わればルート選択がズレ
   golden も動く。**既定＝現行定数と完全一致（inert by default）**を保ち、採用時のみ再fit する規律（既存 override と同型）。
3. **単調安全**: 現行ベクトルを候補集合に必ず含め、全configで**現行以上のときのみ採用**（`calibrateStaticScores` の
   baseline `{}` 保護と同じ原理）。
4. **キャラ名リテラル禁止**（CLAUDE.md §1）: 特徴量・重みは**タグ駆動**（atkBuf/色/deploysRobot/prelude/burstTrigger…）で
   構成し、新キャラに自動追従させる。

---

## 2. レベル A / B / C の吟味

3 レベルは「JS ホットパスに残す評価器の重さ」で切り分ける。上位ほど表現力↑・性能/決定性リスク↑。

### レベル A：既存スコアの**重み**をオフライン最適化（JS は線形/定数のまま）
**思想**: `s` の値を出す関数の**係数**（②の重み or ①の各定数）を、多config・多ボスで**実ダメージ**を目的に
オフライン fit する。JS 側の評価はこれまで通り「定数読み出し or 線形内積」＝ホットパス性能不変。

2 サブ変種（PoC はまず A2、頭打ちなら A1 へ）:

- **A2：per-key スカラー s の連続最適化（推奨PoC・§4）** — 各 constant-`s` キー（droid/funki/inori/…約15〜20キー）の
  スカラー値を**連続最適化器**（CMA-ES 等）で fit。`setStaticOverride()` を**そのまま再利用**でき配線が最小。
  実体は「`calibrateStaticScores` のグリッドを、全キー×連続最適化へ一般化」＝既存インフラの自然拡張。
  *制約*: 未知キーへは一般化しない（キーが増える度に fit 対象へ足す）。
- **A1：構造特徴の重み学習（`computeBaseScore` のパラメータ化）** — atkBuf/色/partyBG/deploysRobot/kc/cd… の
  重み（現状 300/±15/+10/+20/−5/…）を fit。**新キャラへ自動追従**するが、**明示 `s` を持つキーは触らない**
  （golden 編成の大半は明示 `s`＝A1 単独の可動域は狭い）。∴ A1 は A2 で頭打ち確認後の「汎化用」拡張。

**工数**: 実質 **2〜4 人日**（A2 の PoC〜本採用）。既存 `test/golden.mjs`／`archive/tools/search_calibrate.mjs`／
`setStaticOverride` を土台に流用可。**アーキ変更なし**。

**リスク**: 低。ホットパス不変・単調安全を既存と同型で担保可。主リスクは「**既存グリッド較正比の上積みが小さく
工数対効果が出ない**」こと自体（＝PoC でクロー判定）。

### レベル B：学習モデル（GBDT / 小型MLP）を**既定ポリシー**に
**思想**: `(state, candidate)` の特徴量から `s` を出す**非線形モデル**を、ビーム選択の**模倣学習**（ranking/logistic）
または実ダメージ black-box でオフライン訓練 → **極小モデルを export** → JS で安価推論。`_stepStatic` の
「最大 `s` 選択」を、モデル出力での順位付けに差し替える。

**工数**: **1.5〜3 週間**（特徴量設計・学習データ生成・モデル選定/訓練・**JS推論実装**・性能チューニング・golden 再fit）。

**リスク**: 高。**(a) ホットパス性能が本命ゲート** — GBDT 数十本でも線形内積比 10〜100×、MLP は更に重い。純JS/Worker で
探索が桁単位で遅化しうる。∴「オフライン学習 → *極小*モデル（浅い木少数 or 数ニューロン）を JS で軽量推論」に限定必須。
**(b) 過学習で特定 config 外が退行** → 単調安全（現行以上でのみ採用）を config 横断で厳格に。**(c) 決定性**（float 推論の
再現性・バンドル間一致）に注意。

### レベル C：ビーム自体を RL ポリシー/価値関数で置換
**思想**: 探索そのものを学習方策で代替（self-play/価値反復）。

**工数**: 数ヶ月級。**リスク**: 決定性・検証枠組み（golden/単調安全）が崩壊、性能も未知数。**非推奨**（記録のみ）。

### 2.x 比較サマリ
| レベル | JS 評価器 | 工数目安 | ホットパス | 決定性/golden | 主リスク | 推奨 |
|---|---|---|---|---|---|---|
| **A** | 定数/線形内積 | 2〜4人日 | 不変 | 既存同型で安全 | 上積み不足 | **○ まず着手** |
| B | 極小GBDT/MLP | 1.5〜3週 | 要チューニング | 再fit＋過学習注意 | 性能・汎化 | △ A で頭打ち確認後 |
| C | 学習方策 | 数ヶ月 | 未知 | 枠組み崩壊 | 全般 | ✕ 記録のみ |

---

## 3. 横断的な設計論点（全レベル共通）

- **3.1 目的関数**: 第一義は**実 10T 総ダメージ**（`_runRootPlan`／`_calFullDmg`）。序数（押し順一致）は二次指標。
- **3.2 config セット**: 単一 config 過学習を避け、**golden 編成＋sim03 configA（キャスパリーグ）＋ギア数変種**の
  複数 config で評価。per-config で別 fit する現行思想（`_configSig`）を踏襲。
- **3.3 単調安全**: 候補に**現行ベクトルを必ず含め**、全 config で full-verify 上回り時のみ採用。
- **3.4 決定性 & inert-by-default**: 既定重み＝現行定数と完全一致 → golden 不変。採用時のみ Cx として再fit。
- **3.5 評価コスト**: 内側ループは proxy（`_calProxyDmg`≈20ms/点）、勝者のみ full-verify（`_calFullDmg`）。
  既存 `calibrateStaticScores` の 2 段（proxy→full）を最適化器の評価関数に流用。
- **3.6 関数 `s` の扱い**: `ifishant/judg/puvoir/sleur/pactcore` 等の動的 `s` は文脈依存クロージャ＝A の第一版は
  **除外**（定数/構造 `s` のみ fit）。将来、関数 `s` を「特徴量→係数」へ再定式化するのは B 相当の拡張。
- **3.7 Worker 伝播**: 重み/モデルは module 定数として export に含め Worker へ自動伝播（`ABIL_BASE_S` と同経路）。
  キャラ名リテラル不使用（タグ駆動）＝新キャラ自動追従。

---

## 4. レベル A（A2）PoC ハーネス設計 ★本セッションの具体化対象

**目的（仮説）**: 「per-key スカラー `s` を連続最適化すると、現行の手選び定数＋グリッド較正 `{judg:160,pactcore:1}` を
**実 10T 総ダメージで上回れるか**」を、複数 config で**上限測定**する。Go なら本採用（A2）＋汎化検討（A1/B）、
No-go なら本Phase をクローズ（既存グリッド較正で十分と確定）。

### 4.1 何を最適化するか
- **決定変数** `θ`: constant-`s` を持つ全キーのスカラー値ベクトル（golden 編成で約 15〜20 次元）。
  初期点 `θ0` = **現行の定数値そのもの**（droid=201, funki=150, inori=160, … ＝ `θ0` は現行再現＝単調安全の錨）。
- **除外**: 関数 `s` のキー（§3.6）は `θ` に含めない（そのまま現行クロージャを使用）。
- **目的** `J(θ)` = config セット横断の実ダメージ集約（平均 or 最小＝最悪 config 保護なら min 推奨）。

### 4.2 最適化器
- **CMA-ES**（推奨・derivative-free・15〜20 次元に好適）。代替: Nelder-Mead / ランダム+局所探索 / ベイズ最適化。
- ランタイム外部依存を避けるため**Node 内 純JS 実装 or 単一ファイルの軽量 CMA-ES を tools 配下に同梱**
  （学習は**オフライン専用**＝配布バンドルには入らない）。
- **評価関数**: `θ` → `setStaticOverride(θ)` → 各 config で proxy 採点（内側）。世代ごとに上位を full-verify。
  概算コスト: 15次元・pop≈12・~50世代 ≈ 600 eval × 5 config × proxy20ms ≈ **~60 秒**（オフラインで十分実用）。

### 4.3 ラベル/信号の定義（2 モードを比較）
- **モードα（直接・推奨）**: `J(θ)` = 実ダメージ（proxy→full の 2 段）。目的が真の指標そのもの＝バイアスなし。
- **モードβ（模倣・補助）**: `θ` で `_stepStatic` が**フルビームの選択順を再現**する度合い（ranking/logistic loss）。
  評価が軽く高速だが**間接目的**（ビーム選択の模倣 ≠ ダメージ最大）。α の初期化やサニティに使う。

### 4.4 config セット（過学習ガード）
1. golden 編成（現行既定ギア・回帰基準）
2. sim03 `configA`（キャスパリーグ・override `{judg:200,pactcore:1}`）
3. ギア変種 2〜3（追撃 ON/OFF・cap 変化）で**hold-out 汎化**を測る（学習に使わない config で退行有無を確認）。

### 4.5 成功ゲート（Go/No-go）
- **G1（上積み）**: 学習 config で現行比 **実ダメージ +Δ%**（例: 有意閾 ≥ 0.3〜0.5%）を示す。
- **G2（汎化）**: **hold-out config で退行しない**（単調安全・full-verify で現行以上）。
- **G3（性能）**: JS ホットパス**不変**（A2 は定数読み出しのみ＝自明満足）。
- G1&G2 同時充足で本採用。G1 未達 or G2 で退行 → 本Phase クローズ（記録のみ）。

### 4.6 コード配線（最小・inert-by-default）
- **PoC 段は production 非改変**: 新規 `archive/tools/ml_fit_static.mjs`（`test/golden.mjs`/`search_calibrate.mjs` と同様に
  `src/app.js` を import）が `setStaticOverride`／`calibrateStaticScores` の proxy/full を評価関数として呼ぶだけ。
  **本体 `src/*` への変更ゼロ**で上限測定できる（`setStaticOverride` は全キー任意スカラーを受ける既存API）。
- **A1 へ進む場合のみ**の本体変更: `computeBaseScore` の定数を module 定数 `SCORE_W`（既定＝現行値）に括り出し、
  `setScoreWeights(w)` で `ABIL_BASE_S` を再構築（空/既定 → golden 不変）。PoC（A2）では**不要**。
- **本採用時**: 勝者 `θ*` を per-config override 表（`CALIB_GRID` 隣接）or 既定定数の更新として反映 → Cx 起票 →
  `npm run test:golden` 再fit（raw/cal 更新）→ ENGINE_VERSION 更新。

### 4.7 成果物
- `archive/tools/ml_fit_static.mjs`（オフライン fit ハーネス・配布外）。
- PoC レポート（sim 様式）: config×手法の**現行 vs fit ダメージ表**・hold-out 汎化・**Go/No-go 判定**・
  （Go 時）本採用手順と golden 再fit 値。
- 判定が Go の場合、B（模倣学習ポリシー）の着手可否を本レポートの上積み幅から決める。

### 4.8 リスク（PoC 固有）
- **proxy と full の不一致**: 内側 proxy が勝者をズラすと full で目減り（§6.10 既知）→ 世代ごと full-verify で吸収。
- **config 数不足**: 学習 2 config では過学習しうる → hold-out（4.4-3）を必ず別枠に。
- **上積み過小**: 既存グリッド較正が既に強く、A2 の可動域が飽和している可能性（C17 の「3変数実質飽和」前例）→
  これが判明したら**それ自体が有効な結論**（本Phase クローズ根拠）。

---

## 6. レベルA(A2) PoC 実行結果（2026-07-15・第1回）

**ハーネス**: `archive/tools/ml_fit_static.mjs`（`npm run poc:ml`）。src/* 無改変。`N=10 dim=14 gen=30 λ=12 seed=1`。
θ = constant/derived な s の14キー（`droid,banoshik,amplifa,inori,tenya,funki,tenya_re,effond,absolute,divinus,helix,alone,legend,knights`）。
`judg/pactcore` は per-config アンカーとして固定（θ非対象）。訓練=golden・configA / hold-out=configA ギア ±30% 変種2。

### 6.1 ハーネス健全性（sanity）
- **golden config の base(prod) = 208,689,608**（＝現行 golden calibrated 値に厳密一致）。**FB=10/10 全config**。
  → θ0（自然 s ＋ prodOverride）が production 較正を忠実に再現＝ハーネスの計測系は正しい。

### 6.2 計測事実（性能）
- proxy（静的greedy）≈**11ms** / full（単一ビーム）≈**4.5s(N=3)〜38s(N=10)**。∴ full を ES 内側に置くのは非現実的
  （数百eval×数十s）。**ES 内側は proxy 一択**、full/prod は最終verifyのみ、が本harnessの構成。

### 6.3 結果（prod = production 代表・単一ビーム+C27リファイン）
| config | set | base(prod) | fit(prod) | Δ% | FB |
|---|---|--:|--:|--:|:--:|
| golden | train | 208,689,608 | 214,384,730 | **+2.729** | 10→10 |
| configA | train | 1,474,833,558 | 1,423,344,091 | **−3.491** | 10→10 |
| holdout_lo | HOLD-OUT | 1,176,365,292 | 1,175,232,810 | −0.096 | 10→10 |
| holdout_hi | HOLD-OUT | 1,809,178,292 | 1,747,947,239 | **−3.384** | 10→10 |

- proxy 集約 fitness は +0.39% で**即プラトー**（gen5 以降 succ=0/12）＝**静的greedy proxy は s 再重み付けにほぼ不感**。
- **判定: HOLD**（正確には「共有θ×proxy代理」は不成立）。

### 6.4 結論（第1回 PoC の学び）
1. **proxy は目的と乖離**: proxy を上げた θ* が prod で golden を +2.7% にする一方 configA を **−3.5%** にする＝
   PHASE7_ML_PLAN §4.8 の「proxy と full の不一致」を**実測で確認**。安価サロゲート proxy は s 最適化の目的関数に不適。
2. **単一の共有 θ は異種 config を同時最適化できない**: golden と configA で最適 s 方向が逆符号。production が
   **config 別 override**（`calibrateStaticScores` 逐次）を採る理由が裏取りされた。共有 θ は本質的に無理筋。
3. **既存グリッド較正は既に強い**: 上積みは限定的で、素朴な共有re-weightは退行を生む＝C17「3変数実質飽和」と整合。

### 6.5 次アクション候補（PoC-phase-2・優先順）
- **(a) per-config 連続較正へ切替（最有力）**: 共有θを捨て、`calibrateStaticScores` の**グリッドを config 別の連続最適化**へ
  一般化（＝A2 の正しい形）。目的関数は proxy でなく**full**必須だが、config 別なら候補数を絞れる。full が高価なので
  **予算付き（低N最適化→N=10 verify・多restart）**が現実解。
- **(b) 整合サロゲートの導入**: proxy(静的greedy) の代わりに**浅いビーム**（`BEAM_W` を小さく）を目的に。s に感応しつつ
  full より桁安。ただし `BEAM_W` を per-call 注入するため **src の小改修**（定数→引数）が要る。
- **(c) NO-GO 確定も選択肢**: (a)/(b) でも上積みが装備依存の系統誤差に埋もれる（序数不変）なら、本Phaseは
  「既存グリッド較正で十分」＝クローズが妥当（C16/C17 の到達点と接続）。

> **実行ログ全文**は本節 6.3 の表に集約（生ログは scratchpad・非永続）。再現は `npm run poc:ml`（`POC_VERIFY=0` で
> proxyのみ高速スモーク／`POC_SEED`・`POC_GEN`・`POC_LAMBDA` で探索条件変更）。

---

## 7. PoC-phase-2 実行結果（2026-07-15・(a) per-config連続較正 × (b) 浅ビーム整合サロゲート）

**ハーネス**: `archive/tools/ml_fit_static_v2.mjs`。**src改修**は §6.5(b) の beamW 注入フックのみ（`src/sim.js` `greedyTakeTurn`:
`this._beamSearch(this.beamW??BEAM_W, fp)`・既定＝BEAM_W で **golden 完全不変** inert-by-default を確認済み）。

### 7.1 (a)+(b) 結果（surrogate=浅ビーム beamW=8 N=6 / verify=full prod N=10・config別θ）
| config | base(prod) | fit(prod) | full Δ% | surr Δ% | align |
|---|--:|--:|--:|--:|:--:|
| golden | 208,689,608 | 202,191,125 | **−3.114** | +11.007 | ✕ |
| configA | 1,474,833,558 | 1,442,808,471 | **−2.171** | +2.809 | ✕ |
| geartest_lo | 1,176,365,292 | 1,176,365,292 | 0.000 | 0.000 | ○ |
| geartest_hi | 1,809,178,292 | 1,862,909,054 | +2.970 | +4.497 | ○ |

- **浅ビームサロゲートは full と反整合**: 実 config（golden/configA）で surrogate を +11%/+2.8% 上げた θ* が
  full を **−3.1%/−2.2% 退行**させた。s を「浅ビームの弱さの補償」に最適化するため full 幅探索を害する
  ＝proxy（不感）より悪い（**能動的にミスリード**）。唯一の改善 geartest_hi(+3.0%) は合成ギア config で
  代表性なし。∴ **(b) 浅ビームは s 最適化の整合サロゲートとして不成立**。

### 7.2 副産物: ビーム幅×realized ダメージ 掃引（s固定・§6.5(b)フックの検証中に判明）
production s 固定で beamW を掃引（golden同型・単一ビーム+C27リファイン）:
| beamW | raw | cal({judg:160,pactcore:1}) |
|---|--:|--:|
| 4 | 201,291,200 | 207,737,975 |
| 8 | 201,291,541 | 207,750,398 |
| 16 | 201,491,252 | 207,750,398 |
| 32 | 187,083,736 | 207,540,917 |
| 64(=production) | 187,186,834 | **208,689,608** |

- **raw では狭ビーム(≤16)が広ビームより高い**（+7.6%）＝ビーム目的関数が偏った代理採点（将来ターン静的greedy）
  ゆえの古典的 beam pathology（C27 と同根）。
- **しかし出荷は cal**: cal では **beamW=64 が全掃引の最大（208,689,608）**＝広ビームが最良。**較正override が
  raw の beam-pathology を既に是正している**。∴ **ビーム幅を狭めても production は改善しない（フリーランチ無し）**。
  production の (grid較正 s ＋ beamW=64) は本掃引の**大域最良**＝実用上限に位置する。

### 7.3 統合結論（phase-1 §6 ＋ phase-2 §7）
- **安価サロゲートによる s の最適化は NO-GO**: proxy=不感かつ非転移（§6）／浅ビーム=反整合で退行（§7.1）。
  唯一 full と整合する目的関数は full N=10 自身（≈38s）で、ES 予算に載らない。
- **production は実用上限**: cal×beamW=64 がビーム幅掃引の大域最良（§7.2）。既存 grid 較正が既に強い（C17「実質飽和」と整合）。
- **推奨＝§6.5(c) park/close**: レベルA（安価サロゲート）はクローズ相当。残る唯一の未検証パスは
  「**full 目的の per-config ES（高価）**」だが、§7.2 が示す上限余地の小ささから、**着手コストに見合う見込みは低い**。
  レベルB/C（非線形モデル・RL）は本結論の下では**優先度を下げる**（ホットパス性能ゲートも未クリア）。
- **資産保全**: 両ハーネス（`ml_fit_static.mjs`・`ml_fit_static_v2.mjs`）と beamW フックは温存。将来
  「full 目的の予算付き per-config ES」を試すなら v2 を `SURR_MODE=fulln` で回すだけで再利用できる。

---

## 5. 進め方（段階ゲート）
0. ~~**A2 PoC 第1回**（§4・共有θ×proxy）~~ → **実行済（§6）＝HOLD**（proxy不感・非転移）。
1. ~~**PoC-phase-2**（§6.5 (a)per-config × (b)浅ビーム）~~ → **実行済（§7）＝NO-GO**（浅ビーム反整合で退行・
   ビーム幅掃引で production が大域最良＝上限）。
2. **現状の推奨＝§7.3: レベルA(安価サロゲート)クローズ相当・Phase 7 を park**。以降は着手しない（既存 grid 較正で十分）。
3. **例外的に再開する条件**: 新キャラ/新ボスで grid 較正の飽和が崩れた兆候が出た場合のみ、`ml_fit_static_v2.mjs` を
   **`SURR_MODE=fulln`（full目的・予算付き per-config ES）**で回して full 整合下の上積みを再測定する（唯一の未検証パス）。
4. レベル A1/B/C は本結論の下で優先度を下げる（B のホットパス性能ゲートも未クリア・C は記録のみ）。

各段は **golden 不変（inert-by-default）→ 採用時 Cx 再fit → 単調安全 full-verify** の規律を厳守する。
