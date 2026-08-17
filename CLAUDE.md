# 神姫PROJECT R — バーストトラッカー 開発ガイド

## 概要

バースト編成シミュレーター＆最適押し順トラッカー。**Vite/ESM モジュール構成**＝`index.html` は薄いシェル、
エンジン＝`src/app.js`、Worker＝`src/worker.js`、DB＝`gamedata/js/*.js`。
開発は `npm run dev`、配布は `npm run build`→`dist/`（`npm run preview` で確認）。
⚠ **ESM は `file://` 直開き不可＝http 配信が要る**。

## ドキュメント体系

> **⚠ 起動時に読むのは本書 ＋ [workspace/HANDOFF.md](./workspace/HANDOFF.md) の2本だけ**。次タスクは
> [workspace/TODO.md](./workspace/TODO.md)。他は下表のポインタ経由で**必要時のみ**開く（トークン節約）。
>
> **⚠ 新規ドキュメント作成・新規タスク着手の前に [REPO_STANDARDS.md](./REPO_STANDARDS.md) §1 の振り分け表を必ず通す**
> （分類が曖昧・複数フロー跨ぎならユーザーへ選択肢つきで確認）。ID採番・MD必須ヘッダ・末尾ブロック・
> archive 移動と台帳更新の同一コミット規律も同書が正。

### 起動時必読（workspace/）

| 文書 | 中身 |
|---|---|
| [workspace/HANDOFF.md](./workspace/HANDOFF.md) | **現状スナップショット**（有界）。現フェーズ・直近成果・アクティブ作業ライン・ポインタ。「今」の唯一の source |
| [workspace/TODO.md](./workspace/TODO.md) | **次タスク**（優先順）。冒頭に md リレーション点検の常駐カウンタ |

### 現役ドキュメント（ルート）

| 文書 | 何が書いてあるか / いつ読むか |
|---|---|
| [REPO_STANDARDS.md](./REPO_STANDARDS.md) | **規約の正**。§1 リクエスト振り分け／§3 ID レジストリ／§4 MDテンプレ・末尾ブロック／§6 セッション定型と実験の作法 **E1〜E11**／§7 参照の統一文言。**着手前に §1 を通す** |
| [ENGINE_INVARIANTS.md](./ENGINE_INVARIANTS.md) | **確定仕様とエンジン不変条件の詳細**（本書「開発ルール & 不変条件」の分冊）。§1 ゲーム仕様／§2 実装不変条件（走査順・LS・Worker）／§3 編成間の転移可能性。**該当コードを触るときだけ開く** |
| [CALIBRATION_ANALYSIS.md](./CALIBRATION_ANALYSIS.md) | **較正の確定値と根拠アーカイブ＋乖離バックログ（Cx）**。**Cx の状態と根拠はここが正**（本書の較正ステータスは索引にすぎない） |
| [ROADMAP.md](./ROADMAP.md) | **Phase 採番の一次台帳**。Phase 6=幻獣拡張／7=ML化（クローズ）／8=アクセ実装／未確定=敵行動・味方生存・kill-turn・VM |
| [PHASE4_PLAN.md](./PHASE4_PLAN.md) | **現行フェーズ**（実機較正の反復）の進め方。押し順優先・「押し順は蓄積誤差に頑健、系統誤差だけを狙う」方針 |
| [PHASE9_PLAN.md](./PHASE9_PLAN.md) | **★現在の注力先**（Phase 9＝実機観測 intake の自動化）。**sim05 を凍結して先行**。憲法＝「観測と判断はユーザー／導出・分析は Claude／転記・検算・整形はツール」。**P1 が進む/降りるの分岐ゲート** |
| [TRANSCRIPTION_DESIGN.md](./TRANSCRIPTION_DESIGN.md) | **Phase 9 の一次設計**（録画→trial の転記自動化）。2026-08-07 に archive から解凍。**OCR を信用せず検算で担保する**方式。⚠冒頭注記に C49 由来の陳腐化訂正あり |
| [PHASE8_PLAN.md](./PHASE8_PLAN.md) | Phase 8（アクセサリー）の設計。`ACCESSORY_REGISTRY` 新設＋`applyGear` 集約で `class Sim` 非改修を狙う。**着手ゲート＝§6 intake** |
| [KILL_TURN_DESIGN.md](./KILL_TURN_DESIGN.md) | 最速撃破モードの設計草案（未実装）。**真のブロッカーは絶対値精度**と整理済み |
| [CHARACTER_ANALYSIS.md](./CHARACTER_ANALYSIS.md) | キャラ評価・採用論の考察台帳。ヤマト vs アリアン／ナポレオン評 |
| [DOC_RELATION_PLAN.md](./DOC_RELATION_PLAN.md) | md 相互参照の整備（S1〜S5 完了＝**運用フェーズ**）。**§7 の常駐サブタスクが稼働中**＝セッション末にカウンタ +1、md を新設/改名したら `node tools/doc_refs.mjs --write` |
| [tools/README.md](./tools/README.md) | **較正・探索ハーネスの索引**（どの数値がどのスクリプト由来か）。§0 並列実行／**§0.5 config は台帳から読む（E10）**／§3 ドキュメント検査 |

### 現役データディレクトリ

| 場所 | 中身 |
|---|---|
| [gamedata/md/](./gamedata/md/README.md) | **一次情報（原文ママ・本文は書き換えない）**。`神姫/` `英霊/` `幻獣/` `敵/` `その他/`。**md=根拠 / js=現在値** |
| [gamedata/md/敵/](./gamedata/md/敵/README.md) | 敵DB intake。`gamedata/js/enemies.js` の `ENEMY_REGISTRY` の蒸留元 |
| [simulation/](./simulation/README.md) | 統計的較正の試行単位。**新試行は `cp -r simulation/TEMPLATE simulation/simNN`**。構造＝`data/`（一次情報）＋`analysis/`（per_trial → rollup → integrated の2層）。**sim01/02 は旧構造のまま凍結**<br>⚠ trialNN の複製と push は**ユーザーが行う**／sim 内 md の様式は `record_skeleton` に統一 |

### archive/（クローズ済み・歴史台帳＝現状の一次情報ではない）

**内容は書き換えない**（歴史資料として安置）。Cx から旧パスで参照されている実体もここ。

| 文書 | 中身 |
|---|---|
| [archive/SESSION_LOG.md](./archive/SESSION_LOG.md) | **セッション進行ログ**（append-only）。過去の経緯・なぜその判断をしたか |
| [archive/SEARCH_QUALITY_EXPERIMENTS.md](./archive/SEARCH_QUALITY_EXPERIMENTS.md) | 探索品質の実験記録＝**C37 の根拠**。⚠ napoleon 系の数値は**旧 config で測定＝要再取得** |
| [archive/PHASE7_ML_PLAN.md](./archive/PHASE7_ML_PLAN.md) | 静的スコアの ML 化（クローズ＝安価サロゲート NO-GO） |
| 設計レポート | `BEAM_SEARCH_DESIGN`（C9）/ `ORDER_OPTIMIZATION_DESIGN`（C12）/ `SEARCH_ROLLOUT_DESIGN`（C13-C15）/ `OPTIMIZATION_ENGINE` |
| 完了フェーズ | `PHASE2_PLAN` / `PHASE3_PLAN` / `PHASE5_PLAN`（UX刷新+Vite化）/ `VITE_MIGRATION` / `PERF_NOTES` |
| `archive/caches/` | 無効化済み探索キャッシュの保全（engineVersion が古く再現不能なものを含む） |

## ファイル構成 & コード地図

| ファイル | 責務 |
|---|---|
| `index.html` | 薄いシェル（`src/app.js` を module 読み込みするだけ） |
| `package.json` / `vite.config.mjs` | Vite ビルド・依存・Worker バンドル設定 |
| `test/golden.mjs` | 回帰ハーネス。Node から `src/app.js` を読み 10T の結果をアサート |
| **`src/constants.js`** | ゲーム定数・乗算補正・減衰上限（`DMG`）。**依存を持たない葉モジュール** |
| **`src/sim.js`** | コアエンジン。`class Sim`（`tick`/`burst`/`use`・減衰）＋探索（`cmpVec`, `_candidates`, `_stepStatic`, `_runRootPlan`, `_selectRootPrefixes`） |
| `src/worker.js` | 背景並列計算の Worker エントリ（コアを import して並行実行） |
| `src/app.js` | UI バインディング・Worker プール・リプレイモード・INIT |
| **`transcribe/index.html`**<br>**`src/transcribe/`** | **Phase 9 T1＝録画転記ページ**（`canvas_detect.js` 正規化＋`diag.js` §10.5 診断＋`main.js` 配線）。⚠ **シム本体と非結線**＝golden に非干渉。回帰は `npm run test:t1` |
| **`gamedata/js/`** | **シムが読む現在値**（ESM）: `weapons.js`(`WEAPON_MASTER`) / `summons.js`(`SUMMON_REGISTRY`) / `enemies.js`(`ENEMY_REGISTRY`) / `characters.js`(`CHAR_REGISTRY`・`DEBUFF_KEYS`/`buffCount`) |
| **`gamedata/md/`** | **一次情報**（`神姫/` `英霊/` `幻獣/` `敵/` `その他/`・各 README に用途）。**md=根拠 / js=現在値** |

⚠ `gamedata/js/characters.js` は `src/app.js` と循環インポートを持つ。**関数内の遅延評価に限定して TDZ を回避**している（開発ルール §1）。

**特に効く一次情報 2本**（エンジン仕様の根拠・原文ママ）:

| md | 中身 | 現行シムとの差 |
|---|---|---|
| `gamedata/md/その他/damage_frames.md` | ダメージ枠（バフ/ウェポンスキルの乗り方） | C31〜C35 |
| `gamedata/md/その他/attack_phase.md` | 攻撃フェイズ。**バーストと通常攻撃は排他**（ボタンOFFなら通常攻撃）／**反撃は被攻撃1回につき1回**（回避しても発動）／**ゲージは1ヒット +10** | **C45**（反撃 未モデル化・本体は敵の行動モデル）／**C46**（ボタンOFF不在・非バーストキャラの通常攻撃）／C24（ゲージ生成） |

---

## 開発ルール & 不変条件

> **本節＝触る前のチェックリスト**（各行1要約）。**機構・根拠・実測の正は [ENGINE_INVARIANTS.md](./ENGINE_INVARIANTS.md)**。
> §2・§3 の表は**該当行に当たったときだけ**詳細を開く（毎セッション全文を読む対象ではない）。

### 1. キャラクター追加・変更

**編集先は `CHAR_REGISTRY`（`gamedata/js/characters.js`）だけ**＝エンジン本体（`class Sim`）にキャラ名リテラルを書かない。

- **⚠ TDZ 回避**: オブジェクトリテラルの**トップレベル即時評価フィールド**（例 `gmax`）で `BG`/`DMG`/`GEAR` を参照しない（循環死でUI全消失）。ゲージ上限は素の数値（100=`BG.other_max`）。**関数本体（`cands.exec`/`def`フック）内は遅延評価＝安全**。
- **状態は `state` に宣言**（Sim が snap/clone/init で自動同期）。累積アサルト等は**オブジェクトでなくフラットな数値**（clone 時の参照共有を防ぐ）。毎ターン減る残ターン系は `tickStates: ['key',…]`（`tick()` が汎用処理）。
- **キャラ固有の反応は汎用フックへ**（エンジンに分岐を足さない）: `def.onAbility` / `onPartyBurst` / `onBurst` / `turnEnd`。`CHARS` 順に全走査され、不在編成では自然スキップ。
- **導入フローの正＝ROADMAP.md §5**（md-first intake: ユーザーが一次情報md→Claude が Ax 洗い出し→registry 配線＋golden→実機/sim で解消→md 更新）。本§はその配線工程のコード原則。
- **キャラ単位 md**（`gamedata/md/神姫|英霊/<key>.md`）: **§1 一次情報＝Claude 編集不可**／**§2 シムデータ＝編集可**（§2.1 シム内呼称・§2.2 現在エンコード済みの値を**配置**。新規導出はしない）。⚠**未モデル化と書いた機能を実装したら、同じ md §2 を必ず同時更新**（ユーザー規律 2026-07-19）。

### 2. 確定仕様・設計不変条件（索引）

**ゲーム仕様**（実機がそうなっている＝勝手に変えない・詳細 [ENGINE_INVARIANTS.md](./ENGINE_INVARIANTS.md) §1）:

| 項目 | 一行 |
|---|---|
| ジャッジ再発動（C18） | proc で `cd.judg=0` なら押下可（自動発火ではない）。同ターン上限 `judgCap = 5 + (開始時cd===0?1:0)` |
| ジャッジ3フェーズ循環（C23） | ph0 ダメ/ph1 バースト/ph2 通常 は**戦闘通算で連続**（`sim.judgPhase%3`・ターン毎にリセットしない） |
| コヴァレント・アルカナ | アビ12回/バースト2回ごと proc（メイン＋攻撃フェイズ両対象）。同ターン5回上限 |
| モビウスムーンズ | パーティ全体バースト5回ごとにヘカテー全アビCDリセット |
| ムーンコード（C18） | **ヘカテー自身**のアビ12回ごと・持続2T・判定は**アビ終了後**（12回目自身には効かない） |
| イフィシャント早撃ち抑止 | `IFISHANT_MIN_CD = 3`（CD中アビが3つ未満は使用不可） |
| ロワ・クモンド | 通常/アビ/バーストを**それぞれ独自枠**で加算 |
| ダメージ上限UP枠（C36） | 通常/バースト/アビの**各減衰枠の cap へ加算**。**特別減衰[アリアン]のみ別枠乗算** |
| ゲージ経済 | 黄アビBG・マシーンタクトゥは**味方全体**対象。∴ **T3〜 全員満量は正しい帰結**＝再調査不要 |

**エンジンの実装不変条件**（崩すと golden が動く／静かに劣化する・詳細 同 §2）:

| 対象 | 守るもの | 壊れると |
|---|---|---|
| `ABIL_KEYS` 事前計算マップ | **走査順＝`ABIL` 挿入順・タイブレークは厳密 `>`** | 最適押し順がズレる（golden が動く） |
| 2段ルート選抜 | `_staticPrefixDmg` で安価採点→上位 `PREFIX_TOPK`(=8) のみ本選(BW64) | 品質 or 実行時間が崩れる。キャラ追加時は PoC 再確認 |
| 探索の2段実行 | ビーム→キー列で重複除去→**一意ルートにのみ LS** | ★**結果不変**が前提＝品質トレードオフは無い |
| `_localSearchRoute` | **厳密改善のみ採用**／停止条件は**評価回数**（時間ではない）／跨ぎは move でなく **swap** | 非決定化・`abilCapPerTurn` 下で手が黙って落ちる |
| LS 高速化（`_execKey`短絡・`_LSReplay`） | ★**full replay とビット一致**・走査順/受理順/評価回数まで不変 | golden が1円動いたら壊れている。回帰＝`exp_ls_incremental_verify.mjs` |
| forcedKeys リプレイ | **実行できたキーだけ**を記録（幽霊キー禁止） | ターン跨ぎ swap の前提が崩れる |
| ESM Worker 起動 | `new Worker(new URL(…),{type:'module'})`／`src/app.js` の export 漏れ禁止／DOM は INIT ガード内 | Worker が落ちる・探索が走らない |

⚠ **`_refineRoute`（旧 C27）は production 非経路・新規結線禁止**（再現性のため残置）。

### 3. Git 開発ワークフロー（強制）

1. `git checkout main` → `git pull origin main` → 作業用ブランチを切る。
2. 完了時に **`npm run test:golden` 必須**（**期待値は「検証方法」節が正**＝同じ値を2箇所に書かない）。⚠約2分・背景実行推奨。
3. コミット後 `main` へ戻って `pull`＋マージ、再度 golden をパスして `git push origin main`。不要ブランチは削除。

### 4. 実機乖離・最適順序不整合の改善フロー

`simulation/simNN/` に分析を蓄積し、ドキュメントをハブに解決する。

1. **リプレイ照合**: 実機手順を「リプレイモード」に入れ、乖離の**発生起点**を特定（実測→`simNN/data/`、replay 画面はテキスト転記）。
2. **課題のDB化**: [CALIBRATION_ANALYSIS.md](CALIBRATION_ANALYSIS.md) のバックログへ **Cx 起票**。
3. **計画・検証策定**（設計担当）: `simNN/design_report.md` を**必須5節構成**（1.総合比較 / 2.敗北要因 / 3.乖離分析 / 4.影響度検証 / 5.引継ぎ）で作成。
4. **修正とテスト**（Claude Code）: `simNN/analysis/integrated_analysis.md` に統合し、修正後に **golden＋追加検証ケース**をパス（期待値は「検証方法」節）。

### 5. 編成間の転移可能性（★原則のみ・本文は [ENGINE_INVARIANTS.md](./ENGINE_INVARIANTS.md) §3）

> **エジソン編成で確立した機構・定数は、新編成では必ず再測する**（REPO_STANDARDS E9）。
> 「エジソンで最適／飽和／有効」は**エジソン条件下の測定値**であって一般則ではない。

- 同型の外れが **6例**（`BEAM_W=64`／Phase7 §7.2／`CALIB_GRID`／C27リファイン／`judg_calib`／`calib_burst`）。
- ただし**一括で「転移しない」と決めつけない**＝**枠ごとに測る**（na 枠は burst 枠ほど外れていなかった）。
- ⚠ **比が 1.0 に見えたら、分母と分子が同じものを数えているか先に確認**（ヒット多重度＝C48 の教訓）。
- ⚠⚠ **測る前に config の同一性を担保**（GEAR/サブ枠/表示ATK/敵は**データ側から与える**・E2 は bit 一致まで通す）。手ハードコードで C44 の結論が符号ごと反転した。
- 編成・敵・ギアを変えたら**探索パラメータと `CALIB_GRID` は再測対象**。据え置くなら「未再測」と明示。
- **一般則として書いてよいのは、2編成以上で再現したときだけ。**

---

## 検証方法

```bash
npm run test:golden      # 3 fixture を並列実行（--serial で逐次 / --fixture <name> で単体）
npm run doc:check        # md 相互参照の検査（現役層の壊れた参照があれば exit 1）
npm run test:t1          # Phase 9 T1 canvas 正規化のセルフテスト（合成フィクスチャ・1秒未満）
```

⚠ **golden は 2分07秒＝背景実行を推奨**。docs のみの変更なら golden は不変。
⚠ `_replayResult` / `_execKey` / `clone` / `_snapshotForReplay` を触ったら **`node tools/exp_ls_incremental_verify.mjs`（約4分）も回す**。

**編成別マルチfixture（「1編成=1golden」）**＝★**この表が期待値の正**（他の md・コードに同じ値を書かない）:

| fixture | 期待値 | 備考 |
|---|---|---|
| **edison/raw**（beam+LS・較正なし） | `202,005,923` | FB 10/10・maxPress 30 |
| **edison/cal**（`{judg:145,pactcore:1}` 適用＝production 出荷値） | `215,161,915` | FB 10/10・maxPress 33 |
| **napoleon/static**（**静的greedy**＋ maxPress<60 ハングガード） | `299,523,354` | FB 10/10・maxPress 34 |

- ⚠ **napoleon は静的greedy値＝beam 最適ではない**（フルビーム10Tは重く頻回テストに不適）。「回帰ガード」であって較正確定値ではない＝**C38 修正後に再fit**。
- ⚠ **override `{judg:145,pactcore:1}` は C39 のモデル変更後 未再fit**（`search_calibrate.mjs` 未履行）。
- 由来と再fit の経緯は [CALIBRATION_ANALYSIS.md](./CALIBRATION_ANALYSIS.md)（C25/C30/C31/C34/C37/C39）が正。
- 探索は `runSim` 時に静的スコア s を config 別に自動較正する（`calibrateStaticScores`・単調安全）が、**golden は決定的検証のため `setStaticOverride` で明示適用**する。

補助検証（大きな構造変更・Worker/ビルド変更時）: `npm run build`（dist/ 生成が成功すること）→ `npm run preview`（http 配信でブラウザ実機確認）。

### 実測コスト（実験設計の前提に使う＝E1）

| 対象 | 実測 |
|---|---|
| `npm run test:golden` 全体 | **2分07秒**（並列・律速は edison/raw）／`--serial` で **4分07秒**。内訳＝edison ビーム ~43s×2 ＋ LS 計 ~161s、napoleon は瞬時 |
| edison ビーム 1ルート | **43秒** |
| napoleon configC（両面宿儺）ビーム 1ルート | **130〜138秒** |
| LS 1評価 | edison/default gear **0.63ms**（旧 1.27ms）／napoleon configC **0.88ms**（旧 2.15ms） |
| 局所探索 1ルート（edison・default gear・10T） | raw 177,961評価 / cal 124,152評価（**評価回数は高速化後も不変**）。**ターン跨ぎ swap が約73%** |
| BW384 1ルート | 545秒（単独）／762秒（他ジョブ同時実行時＝**約40%増**）※LS 高速化前 |

⚠ **コード内の性能数値は、測定条件が不明なら実験計画の前提にしない**（旧 `test/golden.mjs` の「edison ~2s」は約29倍の誤りだった）。根拠 CALIBRATION_ANALYSIS C37。


---

## 実機較正ステータス

> ⚠ **本節は索引**（台帳ではない）。**状態（open/fixed）と根拠の正は [CALIBRATION_ANALYSIS.md](./CALIBRATION_ANALYSIS.md) の Cx 行**
> （REPO_STANDARDS §7.2＝状態は例外なく ID 参照）。ENGINE_VERSION は `sim05-c39-naowner`・ゴールデン値は「検証方法」節が正。

**確定パラメータ**（日常的に参照する値・変更時は Cx を起票）:

| 項目 | 値 |
|---|---|
| バースト係数 | ヤマト/ヘカテー/テトラ = 5.0/2500 ／ エレイン = 5.5/3000 |
| 追加ダメージフレーム | **アビ枠**（`'abi'` / 減衰率 0.04） |
| エレインバースト追加 | 常時1回・契晶80以上で3回 |
| エジソン英霊武器 追加ダメ | 2.5倍 / 80万（アビ枠・`onBurst`） |
| ヤマト1アシ バーストダメージプラス（C8） | +10万/stack・**味方全体**のバースト対象 |
| ナイツサプレス（エレイン3・C11） | バーストダメ +20%・非累積（refresh）・2T |

**open な乖離バックログ（索引）**── ★は現在の本丸:

| ID | 一行要約 | ゲート |
|---|---|---|
| ★**C25** | 絶対値較正の本丸。乖離は**成分ごとに符号が逆**＝一律スカラ不可 | C40/C41/C44 |
| ★**C40** | バースト「追加ダメージ」の定式化が違う（cap 引上げでは解けない）。**編成横断＋敵横断で確定**（M2） | 関数形の分離＝実機 M3 |
| ★**C41** | `DMG.betaia_cap` が過小 | 実機 M4 |
| ★**C44** | バースト本体の過大は **(a) アリアン固有 ＋ (b) 宿儺固有**に分解済（M2） | (a)=M3 / (b)=G4.9 |
| **C42** | 同ターン発動回数の上限が実機より厳しい（`alone`3・`legend`3 確定・残り `holy`） | 実機 M5 |
| **C47** | アリアンの①バースト追加ダメージと②1アシ追撃を**同一値**で加算（実機は ①=②×5.71） | C40 と同時 |
| **C48** | judg ph2 の通常攻撃が **1ヒット**（実機は三段攻撃＝3ヒット） | C24/C46 と同時 |
| **C43** | アビ上限超過ペナルティが「硬い剪定」（実機は超えられる） | 宿儺固有・後ろ倒し可 |
| **C3 / C5** | 追撃 cap が過小（寄与 1.3%＝2026-08-03 に主題から降格） | C40 と同時 |
| **C37** | 探索パラメータが編成依存／枝刈りの代理採点は未解決 | LS は実装済・幅は open |
| **C38** | `buffCount` が実機と別のものを数えている＝tier が機能停止 | 実機データ |
| **C45** | 反撃が未モデル化（ダメージ式は一次情報にあり・**敵の行動モデルが本体**） | ROADMAP 未確定Phase |
| **C46** | 攻撃フェイズが2点違う（バースト/通常の排他・非バーストキャラの通常攻撃） | FB 非成立ターンのみ binding |
| **C24** | ゲージ生成（1ヒット +10）が未実装 | 較正走に相乗り |
| **C49** | 急所枠がシムは**期待値**・実機は**確定発動**。⚠有利属性走からは同定不能 | 非有利属性走・**低優先** |
| **C1 / C2 / C33 / C35** | damage_frames 突合の軽微な残り（詳細は台帳） | — |

## 現状・次タスク（→ workspace/）

**現在の進行状況・次タスクは本書では持たない**（青天井化と新セッションのトークン浪費を避けるため 2026-07-24 に分離）。

- **現状スナップショット**: `workspace/HANDOFF.md`（現フェーズ・直近成果・アクティブ作業ライン・ポインタ）
- **次タスク（優先順）**: `workspace/TODO.md`
- **過去の進行経緯・provenance**: `archive/SESSION_LOG.md`（append-only 履歴）

> セッション末は HANDOFF/TODO を更新し、現状化した進行を SESSION_LOG の先頭へ畳む（規律は REPO_STANDARDS §6）。

---

## 更新履歴

<!-- 直近5件のみ（それ以前は git log）。「波及確認」列が本体＝git が持たない情報はここだけ。 -->

| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-14 | **本書の可読性リファクタ**（ユーザー指示）。②コード地図を表へ／③開発ルールの詳細（確定仕様17項目・転移可能性）を **[ENGINE_INVARIANTS.md](./ENGINE_INVARIANTS.md) へ分冊**し本書は**索引表＝触る前のチェックリスト**に／④検証方法の実測コスト表を圧縮／⑤較正ステータスの索引を整理（★＝本丸・情報ゼロ行を統合）。**22,450→16,535字**（起動時に必ず読む量が −26%） | **削除した情報は無い**（③は移設・②④⑤は重複と歴史記述の圧縮）。★**2世代前のゴールデン値（197,775,394 / 211,462,826）が3か所に残っていた**のを検出＝開発ルール §2・§4 と **PHASE8_PLAN.md 3か所**。すべて「検証方法」節への参照へ一本化（同じ値を2箇所に書かない）。REPO_STANDARDS E9 の参照先も更新。**`src/`・`gamedata/js/` 未変更＝golden 3/3 不変**・doc:check 現役層グリーン |
| 2026-08-07 | **Phase 9（実機観測 intake の自動化）を採番し注力先に**。`PHASE9_PLAN.md` 新設／`TRANSCRIPTION_DESIGN.md` を archive から解凍／**REPO_STANDARDS E11**（走の無効化条件）を制定 | ユーザー決定＝**sim05 は凍結して Phase 9 を先行**（C40/C41/C44 は open のまま＝意図的コスト）。**録画は貯めてよい**（`PHASE9_PLAN.md` §4.0.1 の録画時チェックリスト）。`src/`・`gamedata/js/` 未変更＝**golden 3/3 不変** |
| 2026-08-07 | **C50 を同日クローズ**（wontfix＝現行実装が正しい）。ユーザー回答＝「光属性スキルの接頭辞が『レイ』『シャイン』＝**4名称は光属性スキルの総称**」＝限定ではない。索引からも削除 | 裏取り＝`WEAPON_MASTER` の**全7本が `elem:'light'`**＝対象外スキルが1本も無い。⚠ **非光属性ウェポンを装備したら一律適用は誤りになる**（低severity・非 Cx として `CALIBRATION_ANALYSIS` C50 行に記録）。**実装変更なし＝golden 3/3 不変** |
| 2026-08-07 | 較正ステータス索引に **C50** を追加（加護の一律適用）。契機＝ユーザー申告「**sim05 はメイン・サポート幻獣ともにカタス**」 | **★申告の内容自体は既にシムへ入っていた**（台帳 GEAR の逆算＝9枠一律 ×10/9＋assault +2.00 で裏取り／E2 bit 一致）＝**再計算・再fit なし**。欠けていたのは**幻獣枠の記録**で、`gamedata/md/幻獣/catastrophia_light.md` 新設（§1 未受領）・`record_skeleton.md` §0 に幻獣枠を追加・`config_c.mjs` のバナーに出力を追加して塞いだ。golden 3/3 不変 |
| 2026-08-06 | 較正ステータス索引に **C49** を追加（急所枠の期待値モデル） | 根拠＝`gamedata/md/その他/damage_frames.md` ⑧⑨（一次情報）と `src/constants.js` の突合。**会心はズレていない**ことも確認。sim05 README §4.3 の「非会心・非急所アンカー」原則は同日 retire |
| 2026-08-06 | 開発ルール §5 の**肯定側の実例を訂正**（「`calib_na` は転移していた」→ヒット多重度の誤読＝C48）。較正ステータス索引に **C47 / C48** を追加し C40/C42/C44 の一行要約を M2 の結果へ更新 | 状態と根拠の正は CALIBRATION_ANALYSIS の Cx 行（本節は索引）。golden 3/3 不変（`src/`・`gamedata/js/` 未変更）。統合は `simulation/sim05/analysis/integrated_analysis.md` |
| 2026-08-05 | 本文内の変更経緯・重複説明を整理（28,985→19,819字）。較正ステータスを索引化・ドキュメント体系を表へ | **Git ワークフロー節が2世代前の golden 値を持っていた**のを検出し「検証方法」節への参照へ一本化。仕様16項目は全て健在を差分確認 |
| 2026-08-05 | 末尾ブロックを新設（DOC_RELATION_PLAN S4・種別=規定・台帳・計画） | 参照関係は `npm run doc:check` がグリーン |

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 20）

- [CALIBRATION_ANALYSIS.md](./CALIBRATION_ANALYSIS.md)
- [DOC_RELATION_PLAN.md](./DOC_RELATION_PLAN.md)
- [ENGINE_INVARIANTS.md](./ENGINE_INVARIANTS.md)
- [KILL_TURN_DESIGN.md](./KILL_TURN_DESIGN.md)
- [PHASE4_PLAN.md](./PHASE4_PLAN.md)
- [PHASE8_PLAN.md](./PHASE8_PLAN.md)
- [REPO_STANDARDS.md](./REPO_STANDARDS.md)
- [ROADMAP.md](./ROADMAP.md)
- [gamedata/md/幻獣/catastrophia_light.md](./gamedata/md/幻獣/catastrophia_light.md)
- [gamedata/md/幻獣/rasiel.md](./gamedata/md/幻獣/rasiel.md)
- [gamedata/md/神姫/README.md](./gamedata/md/神姫/README.md)
- [gamedata/md/英霊/edison.md](./gamedata/md/英霊/edison.md)
- [simulation/README.md](./simulation/README.md)
- [simulation/sim05/README.md](./simulation/sim05/README.md)
- [simulation/sim05/analysis/PROVISIONAL_ANALYSIS.md](./simulation/sim05/analysis/PROVISIONAL_ANALYSIS.md)
- [simulation/sim05/analysis/integrated_analysis.md](./simulation/sim05/analysis/integrated_analysis.md)
- [simulation/sim05/analysis/per_trial/pre-trial_quant.md](./simulation/sim05/analysis/per_trial/pre-trial_quant.md)
- [tools/README.md](./tools/README.md)
- [workspace/HANDOFF.md](./workspace/HANDOFF.md)
- [workspace/TODO.md](./workspace/TODO.md)

_他に 凍結sim/archive/essays から 33 件（更新対象外）_
<!-- doc_refs:end -->
