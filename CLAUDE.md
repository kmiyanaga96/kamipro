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
| [REPO_STANDARDS.md](./REPO_STANDARDS.md) | **規約の正**。§1 リクエスト振り分け／§3 ID レジストリ／§4 MDテンプレ・末尾ブロック／§6 セッション定型と実験の作法 **E1〜E10**／§7 参照の統一文言。**着手前に §1 を通す** |
| [CALIBRATION_ANALYSIS.md](./CALIBRATION_ANALYSIS.md) | **較正の確定値と根拠アーカイブ＋乖離バックログ（Cx）**。**Cx の状態と根拠はここが正**（本書の較正ステータスは索引にすぎない） |
| [ROADMAP.md](./ROADMAP.md) | **Phase 採番の一次台帳**。Phase 6=幻獣拡張／7=ML化（クローズ）／8=アクセ実装／未確定=敵行動・味方生存・kill-turn・VM |
| [PHASE4_PLAN.md](./PHASE4_PLAN.md) | **現行フェーズ**（実機較正の反復）の進め方。押し順優先・「押し順は蓄積誤差に頑健、系統誤差だけを狙う」方針 |
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
| `TRANSCRIPTION_DESIGN.md` | 実機録画→trial 転記の半自動化（**凍結**・ユーザーが再起票するまで着手しない） |
| `archive/caches/` | 無効化済み探索キャッシュの保全（engineVersion が古く再現不能なものを含む） |

## ファイル構成 & コード地図

Vite/ESM移行完了後の物理ファイル構成および責務の定義です。

### 1. プロジェクトルート
- `index.html`: 薄いシェル（エントリーポイントとして `src/app.js` を module 読み込みするのみ）。
- `package.json` / `vite.config.mjs`: Viteビルド、依存モジュール、Workerバンドル設定。
- `test/golden.mjs`: ローカルNode.js環境から `src/app.js` を読み込み、10ターンのシミュレーション結果アサートを行う回帰テスト用ハーネス。

### 2. `gamedata/` 配下（データ層 / ESM。`js/`＝シムが読む現在値・`md/`＝一次情報）
#### `gamedata/js/` (シムが読む現在値 / ESM)
- `gamedata/js/weapons.js`: 武器マスターDB (`WEAPON_MASTER`)
- `gamedata/js/summons.js`: 幻獣マスターDB (`SUMMON_REGISTRY`)
- `gamedata/js/enemies.js`: 敵DB (`ENEMY_REGISTRY`)
- `gamedata/js/characters.js`: 統一キャラDB (`CHAR_REGISTRY`、`DEBUFF_KEYS`/`buffCount` 同梱)。`src/app.js` からの循環インポートを持つが、関数内での遅延評価に限定することでTDZを回避。
#### `gamedata/md/` (一次情報・基礎データ / source of record)
- カテゴリ別サブフォルダ `神姫/` `英霊/` `幻獣/` `敵/` `その他/`（各サブフォルダ直下の README に用途）。詳細は `gamedata/md/README.md`。md=根拠 / js=現在値。
- `gamedata/md/敵/`: 敵DB intake。`gamedata/js/enemies.js` の蒸留元。
- `gamedata/md/その他/damage_frames.md`: **ダメージ枠（バフ/ウェポンスキルの乗り方）の一次情報**（ユーザー提供・原文ママ）。エンジンとの突合結果は CALIBRATION_ANALYSIS.md C31〜C35。
- `gamedata/md/その他/attack_phase.md`: **攻撃フェイズの仕様の一次情報**（ユーザー回答・2026-08-03・原文ママ）。**バーストと通常攻撃は排他**（ゲージ100以上かつ「バースト発動」ボタンONならバースト・**OFFなら通常攻撃**）／**反撃は「自身が攻撃されたとき」に発動**（ムーンコード中は回避率ほぼ100%＝**被ダメ0でも反撃する**）／**ゲージは「1ヒット +10」が仕様**。現行シムとの差＝**C45（反撃 未モデル化＝ダメージ式は hecate.md §1.2 にあり・残るブロッカーは敵の行動モデル）/ C46（ボタンOFF不在・非バーストキャラの通常攻撃 未加算）**、ゲージ生成の観測は C24 の材料。

### 3. `src/` 配下 (エンジン・UI層 / ESM)
- `src/constants.js`: ゲーム定数と、乗算補正および減衰上限などを管理する定数 `DMG`。他モジュールへの依存を持たない葉モジュール。
- `src/sim.js`: シミュレーターコアエンジン。`class Sim`（状態管理、`tick`, `burst`, `use` メソッド、減衰計算等）、およびビーム探索やルート選抜ロジック（`cmpVec`, `_candidates`, `_stepStatic`, `_runRootPlan`, `_selectRootPrefixes` 等）を収録。
- `src/worker.js`: Web Workerの背景並列計算用エントリポイント。`src/app.js` 等からシミュレータコアをインポートして並行実行。
- `src/app.js`: UIバインディング、Web Worker管理プール、リプレイモード、INIT処理を含むメインエントリ。

---

## 開発ルール & 不変条件

### 1. キャラクター追加・変更の原則
- **`CHAR_REGISTRY`（gamedata/js/characters.js）が唯一の編集先。** エンジン本体（`class Sim`）にキャラ名リテラルを記述しない。
- **⚠ 循環参照回避ルール**: `gamedata/js/characters.js` のオブジェクトリテラルの**トップレベル即時評価フィールド**（例: `gmax`）で `BG`/`DMG`/`GEAR` を直接参照してはならない（TDZ / 循環死によるUI全消失の原因）。ゲージ上限は素の数値で持つ（100=`BG.other_max`）。**関数本体（`cands.exec`/`def`フック）内の参照は遅延評価のため安全**。
- キャラ固有状態は `state` に宣言（Simが snap/clone/init で自動同期）。
- 累積アサルトやバーストプラス等の状態は、クローン時の参照共有を防ぐため、オブジェクトではなく**フラットな数値変数**として `state` に宣言すること。
- **毎ターン自動デクリメントする残ターン系state**（ロボ残T・ムーンコード等）は `tickStates: ['key', ...]` を宣言（`buildFormation`が`TICK_STATES`へ集約し`tick()`が汎用処理）。
- **キャラ固有の反応・マイルストーン処理は汎用フックに記述**（エンジンに分岐を足さない）: `def.onAbility(sim,name,color,T)` / `def.onPartyBurst(sim,owner,T,atk)` / `def.onBurst(sim,atk,owner)` / `def.turnEnd(sim,T)`。フックは`CHARS`順で全キャラ走査され、不在編成では未宣言として自然スキップ。
- **導入フローの正＝ROADMAP.md §5（新キャラ/新敵 md-first intake）**: ①ユーザーが一次情報md作成・格納→②Claudeが要検証洗い出し（Ax起票）→③registry配線＋golden→④実機/sim走で解消→md更新。本§はその③のコード原則を定める。
- **キャラ単位 md**（`gamedata/md/神姫/<key>.md`）: 1キャラ=1md で一次情報とシムデータを集約する様式。**§1 一次情報（Claude Code編集不可）**＝ユーザー収集の実機値/文言/有志検証。**§2 シムデータ（Claude Code編集可）**＝§2.1 各データのシム内呼称（`characters.js` のアビキー/バフキー/フック）＋§2.2 シム判明データ（`characters.js`＋`src/constants.js` に現在エンコード済みの値・挙動を**配置**。新規導出はしない）。⚠**一次情報にありシム未モデル化の項目は §2 に「未モデル化」と明記してよい。ただし当該機能を実装した際は、必ず同キャラ md の §2 の該当箇所を更新すること**（実装と md の乖離防止＝ユーザー規律 2026-07-19）。

### 2. 確定仕様・設計不変条件
- **ジャッジ再発動**（C18）: proc で cd.judg=0 になれば**押下可能**（自動発火ではなく押す位置はプレイヤー/探索の裁量。セオリー上デバフ等を先行させうる）。同ターン上限 `judgCap = 5 + (開始時cd===0?1:0)`（`T.ju`・毎ターンリセット）。
- **ジャッジ3フェーズ循環**（C23）: ph0=敵全体10回ダメージ / ph1=バースト / ph2=通常攻撃 の循環は**戦闘通算で連続**（`sim.judgPhase%3`・ターン毎リセットしない）。同ターン発動上限（`T.ju`）とは別カウンタ。旧実装は `T.ju%3`（毎ターンph0リセット）で、実機の各ターン開始judgフェーズ（T4=ph1/T5=ph0/T6=ph2）を3/3外していた（根拠 CALIBRATION_ANALYSIS.md C23）。
- **コヴァレント・アルカナ**: アビ12回 / バースト2回ごとにproc発火（**メイン＋攻撃フェイズ両対象**・攻撃フェイズprocのcd.judg=0は次ターンへ持ち越し）。連理魔力+1 ＆ ジャッジCD=0を同時付与。同ターン5回上限。
- **モビウスムーンズ**: パーティ全体のバースト5回ごとに、ヘカテーの全アビCDをリセット。
- **ムーンコード**（ヘカテー2アシ・C18）: 「戦闘開始時または**ヘカテー自身**がアビリティ**12回使用する毎**（戦闘通算 `moon_acc`）に発動・**持続2ターン**（開始時発動も同じ）」。判定は**アビ終了後**（C18r2）＝12回目の押下自身には効かず**同一ターンの後続ヘカテーアビから**有効（effond は `mcAtPress` で押下時点の状態を捕捉）。effond は「ムーンコード発動時のみ即座にゲージ消費なしでバースト」。旧実装（パーティ全体アビ12回・ターン内カウント＝実質常時ON）は誤りで、sim02 試行1 raw の T4/T6「ヘカテー2バースト無し」交互パターン・試行2 T4 の judg#12 発動不能を再現できなかった（根拠 CALIBRATION_ANALYSIS.md C18）。
- **イフィシャント早撃ち抑止**: `IFISHANT_MIN_CD = 3`（CD中アビが3つ未満は使用不可）。
- **ロワ・クモンドの3枠加算**: 通常（`roy_na_frac`）、アビ（`roy_abi_frac`）、バースト（`roy_burst_frac`）をそれぞれ独自枠加算。
- **ダメージ上限UP枠**（C36）: 「ダメージ上限UP」は通常/バースト/アビの**各減衰枠の cap へ加算**（damage_frames 一次情報）。`Sim._partyCapUp()`＝アブソ（presence+20%）＋プヴワール（累積+6%/stack）を na/burst/abi 共通で cap に加算。burst は同枠加算（自 `burstCapBonus`[奮起/アリアン2アシ]＋パーティ passiveCap[ARRIVE `cap`]＋`_partyCapUp`＋sub＋GEAR）、**特別減衰[アリアン]のみ別枠乗算**（`burstCapSpecial`）。**golden は default gear で cap 未到達＝不変**（実gear/sim05でのみ binding）。⚠abs-calib スカラは cap-UP 無しで fit 済＝sim05 で再検証。
- **ゲージ経済**（実機確認済・実装は実機一致＝乖離なし）: 黄アビのBG付与（funki+10/legend+10/sleur+15/absolute+20/pactcore+100）・マシーンタクトゥ（ロボ反応1回あたり `MACH_BG=5`）は**すべて味方全体対象**（`addG(CHARS,…)`）。エジソンのバーストで攻撃ロボ/補助ロボ**両方のCDを−1**（`edison.def.onBurst`）＝ロボ3T稼働に対し3T周期の再設置が回りきり**常時稼働**しうる。∴ **中盤(T3〜)以降に全員ゲージ満量になるのは正しい帰結**（過去に「ロボ常時稼働はありえない／満量は不自然」と疑義が出たが、実機仕様として3点とも一致・アンプリファ×攻撃ロボの効果窓も整合＝再調査不要）。エジソン4(アンプリファ)の+10万は攻撃ロボ反応（`sim.droid>0` の赤アビ反応）にのみ加算。
- **事前計算マップ**（ホットパス高速化）: `buildFormation` で `ABIL_KEYS`/`ABIL_KC`/`ABIL_CANDS`/`ABIL_BASE_S` を一度だけ構築し、`_stepStatic`/`_candidates` が `Object.entries(ABIL)`・ネスト参照・`computeBaseScore` 再計算をせず `ABIL_KEYS` を1パス走査する。**⚠不変条件**: 走査順は `ABIL` 挿入順（=`Object.keys`順）でタイブレークは厳密 `>`（先頭最大）。キャラ追加・`abilities`/`cands` 変更時はこのマップ構築を経由するため自動追従するが、**走査順や `>` 比較を崩すと最適押し順の選択がズレる**（ゴールデン値 raw 197,775,394 / calibrated 211,462,826 で検証すること）。
<!-- doc_refs:ignore-line ── 次行の `./worker.js` は Worker 起動のコード片であってパス参照ではない -->
- **ESM Worker起動規律**: 旧 `_buildWorkerCode`（文字列 slice）は廃止済み。Worker は `new Worker(new URL('./worker.js', import.meta.url), {type:'module'})` で起動。**`src/app.js` の worker 用 export に必要な探索関数（`buildFormation`, `recalcGearK`, `Sim`, `_runRootPlan` 等）を含めること**。UI/DOM 依存は INIT の `if(typeof document!=='undefined')` ガード内・window ブリッジに隔離すること。
- **局所探索による後処理（`_localSearchRoute`）**: `_runRootPlan` は確定ルートに3種の近傍（①ターン内move ②ターン内swap ③**ターン跨ぎswap**）を総当たりし、`_replayResult` で採点して**厳密改善のみ採用**する。**不変条件**: (1) 改善のみ採用＝総ダメージは単調非減少（golden は下がらない） (2) 停止条件は評価回数 `LS_MAX_EVALS` であって**時間ではない**＝決定的（時間バジェットは golden を環境依存で壊す） (3) ③を move ではなく swap にするのは手数保存＝`abilCapPerTurn` を持つ敵で受け側が黙って落ちるのを防ぐため。目的関数は `_objective` 第1要素と同一＝エンジンの主目的は変えていない。⚠ **`_refineRoute`（旧 C27）は production 非経路・新規結線禁止**（再現性のため残置）。根拠 C37。
- **探索の2段実行（LS の重複除去）**: `runSim`/`_fallbackRunSim` は **①全 prefix をビームのみで走らせ（`_runRootPlan(...,skipLS=true)`）→ ②キー列で重複除去 → ③一意ルートにのみ LS（`_runRouteLS`）** の順で回す。LS は **(キー列, config) の決定的な純関数**なので、同一キー列に複数回掛けるのは完全な無駄（ロキ条件では 8本中6本が同一ルートに潰れる）。**⚠不変条件: 結果は不変**（同一入力→同一出力）でコストのみ削減＝品質のトレードオフは無い。
- **LS 評価の高速化（★結果不変が不変条件）**: 2点。①**`_execKey` の短絡**＝`_stepStatic` と同じく `ABIL_KEYS` を1パス走査して一致で即実行する（走査順とフィルタが `_candidates` と同一・`guard`/`s`/`variants` はすべて純粋な参照）。②**インクリメンタル replay `_LSReplay`**＝近傍候補は基準ルートと**最初に異なるターン t0 以降しか変わらない**ので、各ターン開始時のスナップショットから t0 以降だけを再生する。**⚠不変条件**: (1) 評価値は full replay と**ビット一致**（復元は `Sim._snapshotForReplay()`＝`clone()` から**planDepth を上げない**点だけが違う。`_primeLookaheads` が内部で `clone()` して +1 するため、深度がズレると lookahead が fresh replay と変わる） (2) **走査順・受理順・評価回数・着地点はすべて不変**＝golden は1円も動かない。**回帰は `node tools/exp_ls_incremental_verify.mjs`**（近傍1,000件のビット一致＋受理後の一致）。
- **forcedKeys リプレイの正規化**: `greedyTakeTurn(t, forcedKeys)` は**実際に実行できたキーだけ**を行に記録する（`_execKey` が実行可否を返す）。押せなかったキー（CD中/契晶不足/`abilCap`到達）が「押した手」として残る幽霊キーを防ぐ＝ターン跨ぎ swap を持つ LS の前提。**総ダメージは不変**（元から不成立キーは計算に入っていない）。
- **2段ルート選抜**: `runSim`/`_fallbackRunSim` は `enumerateRootPrefixes()` の全prefixを `_staticPrefixDmg`（静的greedy・約数ms）で安価採点し、上位 `PREFIX_TOPK`(=8・C16で10→8) 本のみ本選(BW64・C16で128→64)へ回す（`_selectRootPrefixes`）。空prefixは常に確保。**品質低下は PoC 実測で最大0.013%**（top-8が実証済み安全床・BW64で0%損実測）。新キャラ追加時は PoC（scratchpad `poc.js`）を再実行し `PREFIX_TOPK` の余裕を再確認する。

### 3. Git 開発ワークフロー (強制ルール)
- **作業開始時**
  1. `git checkout main` で main に切り替え、`git pull origin main` を実行。
  2. 作業用ブランチを切って開発を開始。
- **検証 (作業完了時)**
  - 必ず `npm run test:golden` を実行しパスを確認（**期待値は「検証方法」節が正**＝同じ値を2箇所に書かない）。⚠**約2分・背景実行を推奨**。
- **反映・プッシュ**
  - コミット後、`main` に戻って `pull`、作業ブランチをマージし、再度検証テストをパスして `git push origin main`。不要な作業ブランチは削除。

### 4. 実機乖離・最適順序不整合の改善フロー
シミュレーターの計算値やアビ実行順序が実機と乖離した場合は、`simulation/simNN/` に分析結果を蓄積し、ドキュメントをハブにして解決する。
1. **リプレイ照合**: 「リプレイモード」に実機手順を入力し、乖離の発生起点を特定。実測を `simNN/raw_data.md` に、replay画面は `simNN/replay_screenshots.md` へテキスト転記。
2. **課題のDB化**: [CALIBRATION_ANALYSIS.md](CALIBRATION_ANALYSIS.md) のバックログ（Cx）に追記。
3. **計画・検証策定（Antigravity 主担当）**: 設計担当が原因特定し、`simNN/design_report.md` を**必須5節構成**（1.総合比較 / 2.敗北要因 / 3.乖離分析 / 4.影響度検証 / 5.引継ぎ）で作成。
4. **自律修正とテスト**: 実装担当（Claude Code）が `simNN/design_report.md` を検証して `simNN/integrated_analysis.md` にまとめ、コード修正後テスト実行。期待値 `raw 197,775,394 / calibrated 211,462,826` と追加検証ケースのパスを確認。

### 5. 編成間の転移可能性（同型の失敗が4例に到達したため明文化）

> **原則: エジソン編成で確立した機構・定数は、新編成では必ず再測する。**
> 「エジソンで最適／飽和／有効」は**エジソン条件下の測定値**であって一般則ではない。編成・敵（`abilCapPerTurn` 等の有無）・ギアのいずれが変わっても転移は保証されない。

**該当事例（いずれも実測で外れが判明）**:

| # | 対象 | エジソンでの結論 | 新編成での実態 |
|---|---|---|---|
| 1 | `BEAM_W=64`（C16） | 幅64で飽和＝広げても得なし | ナポ/アリアン×宿儺では**最悪点**。幅で総ダメが +3.0〜+5.6% 変動し**非単調**（BW384=+5.64%） |
| 2 | Phase 7 §7.2「BW64が大域最良＝実用上限」 | ML化クローズの根拠の一つ | ①がエジソン依存＝**クローズ根拠が再評価対象**（ROADMAP 上の扱いは要相談） |
| 3 | `CALIB_GRID`（静的スコア較正の格子） | エジソン編成のアビを網羅 | ナポ/アリアンのアビを**1つも含まない**＝新編成の主役2人を較正できない**構造的欠落** |
| 4 | C27 定石リファイン | 赤アビ後出しで +0.140% | ナポ/アリアンは `deploysRobot`/`prelude` **タグ不在で一度も発火しない** |
| 5 | `judg_calib=0.62`（C30・エジソン×configB fit） | judg ph0 の過大を是正 | ナポ/アリアン×宿儺では judg ph0 が **×1.25 不足**（⚠cap 拘束のため単独では切り分け不能） |
| 6 | `calib_burst=2.07`（C25・エジソン×configB fit） | バースト本体の絶対値を実機 mean へ寄せる | ナポ/アリアン×宿儺（configC v3）では **1バーストあたり ×0.73＝シムが 37% 過大**（C44） |

**⚠ ただし「必ず外れる」わけでもない（2026-08-03・肯定側の実例）**: 同じ sim04 fit でも **na 枠は burst 枠ほど外れていない**
（judg ph2 の通常攻撃 1ヒットで 実機/シム ×0.99 / ×0.89・キャスパリーグでも ×1.15）。**同じ走・同じ config で burst 枠が大きく外れ、na 枠は近かった**。
∴ 原則は「**転移するかどうかを枠ごとに測る**」であって「転移しない/する」と一括で決めつけることではない。
**測れば安いものから測る**（成分別の強制リプレイは約3秒）。
⚠**2026-08-06 訂正**: 初版は「**`calib_na=1.835` は転移していた**」と書いていたが、これは**言い過ぎ**だった。
judg ph2 の「1ヒット ×0.99」は**シムの1加算を実機1ヒットと見た比**で、**実機は三段攻撃＝3ヒット**＝
**発動あたりでは ×2.96 不足**していた（**C48**）。**枠ごとに測る**という原則は変わらないが、
**「比が 1.0 に見えた」ときは、その比の分母と分子が同じものを数えているかを先に確認する**（ヒット多重度・集約単位）。

**⚠⚠ 測る前に config の同一性を担保する（2026-08-03・実際に結論が反転した）**: 上の C44 は、初回の突合では
「×1.04＝転移していた」と出ていた。原因は**ハーネスに 2 世代前の GEAR を手でハードコードしていた**こと
（`src/app.js` の ATK override も走行時点より古かった）。正しい config で再計算すると **T1 全体が ×1.77 → ×1.41**、
**バースト本体は ×1.04 → ×0.77 と符号ごと反転**した。∴ **config（GEAR/サブ枠/表示ATK/敵）は必ずデータ側から与える**
（受領キャッシュ JSON の `_configSig` ＋ trial md ヘッダの実機表示ATK）。**E2 は「既知値との bit 一致」まで通すこと。**

さらに**改善幅そのものも条件依存**: C37 局所探索の利得は同じエジソンでも **実gear +0.78% / default gear +2.09%**（＝ギア・敵でも変わる）。

**運用**:
- 編成・敵・ギアのいずれかを変えたら、**探索パラメータ（`BEAM_W` / `PREFIX_TOPK` / `BEAM_DIVERSITY_K`）と較正格子（`CALIB_GRID`）は再測対象**として扱う。据え置く場合は「未再測」と明示する。
- **タグ駆動の機構**（`deploysRobot` / `prelude` 等）は**タグを持つキャラが編成に居て初めて発火する**。新編成で「効かない」のは不具合ではなく前提不成立でありうる＝まずタグの有無を確認する。
- 定数のコメントには**測定条件（編成・敵・ギア）を併記する**。条件不明の数値は REPO_STANDARDS §6 E1 により実験設計の前提にできない。
- **一般則として書いてよいのは、2編成以上で再現したときだけ。**

---

## 検証方法

```bash
npm run test:golden      # 3 fixture を並列実行（--serial で逐次 / --fixture <name> で単体）
npm run doc:check        # md 相互参照の検査（現役層の壊れた参照があれば exit 1）
```

⚠ **golden は約2分**。600秒上限に余裕はあるが**背景実行を推奨**。docs のみの変更なら golden は不変。
⚠ `_replayResult` / `_execKey` / `clone` / `_snapshotForReplay` を触ったら
**`node tools/exp_ls_incremental_verify.mjs`（約4分）も回す**。

**編成別マルチfixture（「1編成=1golden」）**:

| fixture | 期待値 | 備考 |
|---|---|---|
| **edison/raw**（beam+LS・較正なし） | `202,005,923` | FB 10/10・maxPress 30 |
| **edison/cal**（`{judg:145,pactcore:1}` 適用＝production 出荷値） | `215,161,915` | FB 10/10・maxPress 33 |
| **napoleon/static**（**静的greedy**＋ maxPress<60 ハングガード） | `299,523,354` | FB 10/10・maxPress 34 |

- ⚠ **napoleon は静的greedy値＝beam 最適ではない**。「回帰ガード」であって較正確定値ではない
  （フルビーム10Tは重く頻回テストに不適）。**buffCount の実機修正（C38）後に再fit**。
- ⚠ **override `{judg:145,pactcore:1}` は C39 のモデル変更後 未再fit**（`search_calibrate.mjs` の再fit が未履行）。
- 各値の由来と再fit の経緯は [CALIBRATION_ANALYSIS.md](./CALIBRATION_ANALYSIS.md)（C25/C30/C31/C34/C37/C39）が正。

> 探索は `runSim` 実行時に config 別の静的スコア s を自動較正する（`calibrateStaticScores`・単調安全）。
> golden は決定的検証のため較正結果を `setStaticOverride` で明示適用する（毎回の較正走行を避ける）。

補助検証（大きな構造変更・Worker/ビルド変更時）:

```bash
npm run build      # dist/ 生成（worker 別チャンク・minify ON）が成功すること
npm run preview    # dist を http 配信 → ブラウザで探索/中断/UI を実機確認
```

### 実測コスト（実験設計の前提に使う＝E1）
| 対象 | 実測 |
|---|---|
| `npm run test:golden` 全体 | **2分07秒**（3 fixture を並列実行・律速は最重量の edison/raw）。**逐次では 4分07秒**（`--serial`）。旧 約10分（C27 時代は116秒） |
| 〃 の内訳 | edison ビーム ~43s×2 ＋ 局所探索 計 ~161s ／ napoleon 静的greedy は瞬時。user 時間 3分50秒 vs real 2分07秒＝**実効 ×1.94** |
| LS 1評価（edison・default gear・10T） | **0.63ms**（旧 **1.27ms**＝**×2.0**）。内訳＝`_execKey` 短絡で 1.27→0.88・インクリメンタル replay で 0.88→0.63 |
| LS 1評価（napoleon configC・宿儺） | **0.88ms**（旧 **2.15ms**＝**×2.4**）。内訳＝1.27→ `_execKey` 1.29・→ インクリメンタル 0.88 |
| 局所探索 1ルート（edison・default gear・10T） | 旧 **324秒**（raw・177,961評価）／**177秒**（cal・124,152評価）→ 高速化後は上の 1評価コストで按分（評価回数は**不変**）。**ターン跨ぎ swap が評価の約73%** |
| edison ビーム 1ルート | **43秒**（旧記載 ~60s） |
| napoleon configC（両面宿儺）ビーム 1ルート | **130〜138秒**（旧記載 ~127s） |
| BW384 1ルート | 545秒（単独）／762秒（他ジョブと同時実行時＝**約40%増**）※LS 高速化前の値 |

> **LS 高速化は結果不変**が不変条件（評価回数・受理順・着地点まで同一）。機構は「開発ルール §2」が正。

⚠**旧 `test/golden.mjs` コメントの「edison ~2s」は約29倍の誤りだった**（napoleon ~90s はほぼ整合）。
**コード内の性能数値は測定条件が不明なら実験計画の前提にしない**（必ず実測してから使う）。根拠 CALIBRATION_ANALYSIS C37。


---

## 実機較正ステータス

> ⚠ **状態（open/fixed）と根拠の正は [CALIBRATION_ANALYSIS.md](./CALIBRATION_ANALYSIS.md) の Cx 行**。
> 本節は**索引**であって台帳ではない（REPO_STANDARDS §7.2＝状態は例外なく ID 参照）。

**確定パラメータ**（日常的に参照する値・変更時は Cx を起票）:

| 項目 | 値 | 根拠 |
|---|---|---|
| バースト係数 | ヤマト/ヘカテー/テトラ = 5.0/2500 ／ エレイン = 5.5/3000 | — |
| 追加ダメージフレーム | **アビ枠**（`'abi'` / 減衰率 0.04） | — |
| エレインバースト追加 | 常時1回・契晶80以上で3回 | — |
| エジソン英霊武器 追加ダメ | 2.5倍 / 80万（アビ枠・`onBurst`） | — |
| ヤマト1アシ バーストダメージプラス | +10万/stack・**味方全体**のバースト対象 | C8 |
| ナイツサプレス（エレイン3） | バーストダメ +20%・非累積（refresh）・2T | C11 |

**open な乖離バックログ（索引）**:

| ID | 一行要約 | ゲート |
|---|---|---|
| **C25** | 絶対値較正の本丸。乖離は**成分ごとに符号が逆**＝一律スカラ不可 | C40/C41/C44 の解決 |
| **C40** | バースト「追加ダメージ」の定式化が違う（cap 引上げでは解けない）。**編成横断＋敵横断（M2 で確定）** | 関数形の分離＝実機 M3 |
| **C41** | `DMG.betaia_cap` が過小 | 実機 M4 |
| **C44** | バースト本体の過大は **(a) アリアン固有 ＋ (b) 宿儺固有**に分解された（M2） | (a)=M3 / (b)=G4.9 |
| **C42** | 同ターン発動回数の上限が実機より厳しい（M2 で `alone`3・`legend`3 が確定・残りは `holy`） | 実機 M5 |
| **C47** | シムがアリアンの①バースト追加ダメージと②1アシ追撃を**同一値**で加算（実機は ① が ② の 5.71倍） | C40 と同時 |
| **C48** | judg ph2 の通常攻撃が **1ヒット**（実機は三段攻撃＝3ヒット）。C46/C24 と同根 | C24/C46 と同時 |
| **C49** | 急所枠がシムは**期待値**・実機は**確定発動**。⚠**有利属性走からは同定不能**（表示が二値・実効倍率は加算で可変） | 非有利属性走・**低優先**（cap 拘束で raw の効きが 1/25） |
| **C43** | アビ上限超過ペナルティが「硬い剪定」（実機は超えられる） | 宿儺固有・後ろ倒し可 |
| **C3 / C5** | 追撃 cap が過小（2026-08-03 に主題から降格・寄与 1.3%） | C40 と同時 |
| **C37** | 探索パラメータが編成依存／枝刈りの代理採点は未解決 | LS は実装済・幅は open |
| **C38** | `buffCount` が実機と別のものを数えている＝tier が機能停止 | 実機データ |
| **C45** | 反撃が未モデル化（ダメージ式は一次情報にあり・**敵の行動モデルが本体**） | ROADMAP 未確定Phase |
| **C46** | 攻撃フェイズが実機と2点違う（バースト/通常攻撃の排他・非バーストキャラの通常攻撃） | FB 非成立ターンのみ binding |
| **C24** | ゲージ生成（1ヒット +10）が未実装。低 severity | 較正走に相乗り |
| **C1 / C2** | — | — |
| **C33 / C35** | damage_frames 突合の軽微な残り | — |

**現ゴールデン値**: raw **202,005,923** / calibrated **215,161,915** / napoleon/static **299,523,354**
（ENGINE_VERSION `sim05-c39-naowner`。⚠ override `{judg:145,pactcore:1}` は C39 のモデル変更後**未再fit**）

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
| 2026-08-06 | 較正ステータス索引に **C49** を追加（急所枠の期待値モデル） | 根拠＝`gamedata/md/その他/damage_frames.md` ⑧⑨（一次情報）と `src/constants.js` の突合。**会心はズレていない**ことも確認。sim05 README §4.3 の「非会心・非急所アンカー」原則は同日 retire |
| 2026-08-06 | 開発ルール §5 の**肯定側の実例を訂正**（「`calib_na` は転移していた」→ヒット多重度の誤読＝C48）。較正ステータス索引に **C47 / C48** を追加し C40/C42/C44 の一行要約を M2 の結果へ更新 | 状態と根拠の正は CALIBRATION_ANALYSIS の Cx 行（本節は索引）。golden 3/3 不変（`src/`・`gamedata/js/` 未変更）。統合は `simulation/sim05/analysis/integrated_analysis.md` |
| 2026-08-05 | 本文内の変更経緯・重複説明を整理（28,985→19,819字）。較正ステータスを索引化・ドキュメント体系を表へ | **Git ワークフロー節が2世代前の golden 値を持っていた**のを検出し「検証方法」節への参照へ一本化。仕様16項目は全て健在を差分確認 |
| 2026-08-05 | 末尾ブロックを新設（DOC_RELATION_PLAN S4・種別=規定・台帳・計画） | 参照関係は `npm run doc:check` がグリーン |

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 18）

- [CALIBRATION_ANALYSIS.md](./CALIBRATION_ANALYSIS.md)
- [DOC_RELATION_PLAN.md](./DOC_RELATION_PLAN.md)
- [KILL_TURN_DESIGN.md](./KILL_TURN_DESIGN.md)
- [PHASE4_PLAN.md](./PHASE4_PLAN.md)
- [PHASE8_PLAN.md](./PHASE8_PLAN.md)
- [REPO_STANDARDS.md](./REPO_STANDARDS.md)
- [ROADMAP.md](./ROADMAP.md)
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

_他に 凍結sim/archive/essays から 32 件（更新対象外）_
<!-- doc_refs:end -->
