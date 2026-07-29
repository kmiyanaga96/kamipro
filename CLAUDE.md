# 神姫PROJECT R — バーストトラッカー 開発ガイド

## 概要
バースト編成シミュレーター＆最適押し順トラッカー。**Phase5 S5（2026-06-30）で Vite/ESM モジュール構成へ移行**：`index.html`=薄いシェル、エンジン＝`src/app.js`、Worker＝`src/worker.js`、DB＝`gamedata/js/*.js`（ESM。**旧 `data/`＝2026-07-16 に sim内 `data/` との混同防止で `gamedata/` へリネーム→2026-07-19 に `gamedata/js/`（現在値）と `gamedata/md/`（一次情報）へ大別**）。開発は `npm run dev`、配布は `npm run build`→`dist/`（`npm run preview` で確認。**ESM は file:// 直開き不可＝要http**）。移行の一次情報は archive/VITE_MIGRATION.md。

## ドキュメント体系

> **⚠ セッション起動時（必読）**: 起動時に読むのは **本書（CLAUDE.md）＋ `workspace/HANDOFF.md`（現状スナップショット）の2本のみ**。次タスクは `workspace/TODO.md`。他doc（sim / CALIBRATION_ANALYSIS / ROADMAP / Phase / essays / キャラmd）は**下記リストのポインタ経由で必要時のみ**読む（トークン節約＝新セッション移行のコスト低減）。過去の経緯は `archive/SESSION_LOG.md`。**セッション末**は HANDOFF/TODO を更新し、現状化した進行を SESSION_LOG へ畳む（REPO_STANDARDS §6）。
>
> **⚠ 全セッション共通ルール**: 新規ドキュメント作成・新規タスク着手の前に **REPO_STANDARDS.md §1 の振り分け表**を必ず通すこと（分類が曖昧・複数フロー跨ぎならユーザーへ選択肢つきでフロー確認）。ID採番（Cx/Dx/Ax/Mx/Hx）・MD必須ヘッダ（ゴール/完了条件）・archive移動と台帳更新の同一コミット規律も同書が正。

### 起動時必読（workspace/）
- **workspace/HANDOFF.md**: **引継ぎ＝現状スナップショット（有界・生きた台帳）**。現フェーズ・直近成果・アクティブ作業ライン・ポインタ表。CLAUDE.md と対で起動時に読む唯一の「現状」source。
- **workspace/TODO.md**: **次タスク（優先順・チェックボックス）**。sim05 残ゲート／(A)構造修正／Phase8／並行タスク。完了項はセッション末に SESSION_LOG へ畳む。

### 現役ドキュメント（ルート）
- **REPO_STANDARDS.md**: **ドキュメント規約＆リクエスト振り分けフロー（2026-07-16 制定・生きた台帳）**。リクエスト種別→フロー/ID/置き場所の分類表・ID接頭辞レジストリ・MD統一テンプレート・ライフサイクルgit運用・セッション定型。
- **CLAUDE.md**（本書）: 生きた開発ガイド＝**安定リファレンス**。コード地図・開発ルール・確定仕様・検証方法・実機較正ステータス（open-Cx 要約）。**「現状/次タスク」は持たない**（→ workspace/HANDOFF・TODO）。
- **CALIBRATION_ANALYSIS.md**: 実機較正の確定値＆**根拠アーカイブ**（なぜその値・枠か）＋乖離バックログ（Cx）。較正・英霊武器は実装済み。
- **PHASE4_PLAN.md**: Phase 4（実機較正の反復＝**現行フェーズ**）の進め方台帳。**押し順優先**・序数比較ハーネス・「押し順は蓄積誤差に頑健、系統誤差だけを狙う」方針・乖離バックログ駆動を規定。
- **KILL_TURN_DESIGN.md**: **最速撃破モード（kill-turn 自動目標）の設計草案（未実装・2026-07-07 起草＋§7必要性検討）**。§7で「演算量は非障害・真のブロッカーは絶対値精度（実機比×2級）」と整理し、**S3保留・S1+S2はsim02試行2の絶対乖離実測をゲート**に着手判断。ROADMAP の未確定Phase(ii)。
- **ROADMAP.md**: **Phase 一覧・採番の一次台帳（2026-07-09 再編・2026-07-15 採番改訂）**。Phase 6=幻獣システム拡張／**Phase 7=静的スコア s の機械学習化（クローズ・archive＝PoC×2で安価サロゲートNO-GO）**／**Phase 8=アクセ実装（旧Phase 7から繰り下げ・詳細は PHASE8_PLAN.md）**／未確定Phase=敵行動・味方生存(i)・kill-turn(ii)・VM/ワークフロー(iii)。各Phase詳細は個別docへ委譲。
- **PHASE8_PLAN.md**: **Phase 8（アクセサリー実装）の計画台帳（2026-07-22 起草・実装未着手）**。アクセ＝押し順非依存の常時ボックス補正が主という仮説のもと `ACCESSORY_REGISTRY` 新設＋`applyGear` 集約で `class Sim` 非改修を狙う設計。一次情報＝damage_frames.md の枠マッピング（攻撃枠40%上限/与ダメ枠=タイムピース・ブレスレット/会心枠=天使）。§6 に着手ゲートの intake（per-char/全体の別・系統全容・発動系有無）。未装備 golden 不変を不変条件とする。
- **CHARACTER_ANALYSIS.md**: キャラ個別評価＆採用論の生きた考察台帳（2026-07-11 起草）。ヤマトvsアリアンのホライズン別比較・ナポレオン評・併用仮説（暫定）。序数比較ベース＝新キャラ/較正確定のたびに更新。

### 現役データディレクトリ
- **gamedata/md/敵/**（旧 `enemies/`＝2026-07-19 に `gamedata/md/` 配下へ移動）: 敵DB intake。`README.md`（命名・追加手順・スキーマ）＋ `TEMPLATE.md` ＋ `<key>.md`（実機詳細＝根拠）。`gamedata/js/enemies.js` の `ENEMY_REGISTRY` がそこから蒸留した現在値。Phase4較正ボス `walpurgis_loki`・sim03較正ボス `fimbulvetr` を登録。
- **simulation/**: Phase 4 の試行データ蓄積。`simulation/README.md`（命名規約・ワークフロー・**較正カデンツ=統計的較正×反復可能ボス（2026-07-12転換）**）＋ `TEMPLATE/` ＋ `simNN/`。**sim03以降の新構造（ユーザー決定）**: `data/`（`config.json`基本情報JSON=探索キャッシュexport兼用 / **`record_skeleton.md`＝各simで唯一の記録テンプレ（コピー原本）** / `trialNN.md`実機原本＝record_skeletonを複製して作成）＋ `analysis/`（**2層構造・コンテキスト有界化**: `per_trial/trialNN_{quant,quali}.md`＝**単trial中間集計**[trialNN1本のみ入力] → `quantitative_analysis.md`/`qualitative_analysis.md`＝**trial横断rollup**[per_trial全trial入力・決定性/分散/max_hp収束はここ専用] → `integrated_analysis.md`＝統合[両rollupのみ]）＋分類不能ファイルはsim直下。sim01/02は旧構造のまま凍結。**新試行は `cp -r simulation/TEMPLATE simulation/simNN` で開始**。**⚠テンプレは record_skeleton のみ・trialNN の複製とpushはユーザーが行う・sim内mdフォーマットは record_skeleton に統一必須（混同防止）**。

### archive/（クローズ済み・歴史台帳＝現状の一次情報ではない）
完了・クローズした計画/設計レポート置き場。バックログ（Cx）行から旧パスで参照されている場合も実体はここ。
- **SESSION_LOG.md**: **セッション進行ログ（append-only・provenance 保全）**。旧 CLAUDE.md「現在の進行状況」を移設。セッション末に現状化した進行を先頭へ畳む。現状は workspace/HANDOFF が正。
- 設計レポート: `BEAM_SEARCH_DESIGN.md`（C9）/ `ORDER_OPTIMIZATION_DESIGN.md`（C12）/ `SEARCH_ROLLOUT_DESIGN.md`（C13-C15・自動較正§6含む）/ `OPTIMIZATION_ENGINE.md`（エンジン解説旧版）
- 完了フェーズ台帳: `PHASE2_PLAN.md` / `PHASE3_PLAN.md` / `PHASE5_PLAN.md`（UX刷新+Vite化・完了）/ `VITE_MIGRATION.md`（S5作業記録）/ `PERF_NOTES.md`（高速化台帳）/ **`PHASE7_ML_PLAN.md`（静的スコア s のML化・クローズ＝安価サロゲートNO-GO。§6/§7にPoC結果。`s`＝ダメージ非関与の探索ヒューリスティック前提・レベルA/B/C吟味・★スコープ外＝絶対値乖離C25/C5）**
- 運用メモ: `BRANCH_WORKFLOW.md`（main恒久トランク運用）
- `tools/`: 較正・探索ハーネス（`search_calibrate.mjs`＝自動較正の再fit実行・`search_probe.mjs`・`c27_refine_probe.mjs`＝C27定石リファイン監査・**`ml_fit_static{,_v2}.mjs`＝Phase7 静的スコアML化PoC（`npm run poc:ml`・クローズ済だが再開用に温存）**等。**現役で使用**。旧pre-Vite CJSツール3本＝calib_t1/calib_t1_forced/t1_dumpは2026-07-14削除＝git履歴参照）
- `caches/`: 無効化済み探索キャッシュの歴史保全置き場（C26 followupON・C27証拠キャッシュ。2026-07-14 sim03/data から移設）

---

## ファイル構成 & コード地図

Vite/ESM移行完了後の物理ファイル構成および責務の定義です。

### 1. プロジェクトルート
- `index.html`: 薄いシェル（エントリーポイントとして `src/app.js` を module 読み込みするのみ）。
- `package.json` / `vite.config.mjs`: Viteビルド、依存モジュール、Workerバンドル設定。
- `test/golden.mjs`: ローカルNode.js環境から `src/app.js` を読み込み、10ターンのシミュレーション結果アサートを行う回帰テスト用ハーネス。

### 2. `gamedata/` 配下 (データ層 / ESM。2026-07-19 に `js/`＝現在値・`md/`＝一次情報へ大別。旧 `data/`＝2026-07-16 リネーム)
#### `gamedata/js/` (シムが読む現在値 / ESM)
- `gamedata/js/weapons.js`: 武器マスターDB (`WEAPON_MASTER`)
- `gamedata/js/summons.js`: 幻獣マスターDB (`SUMMON_REGISTRY`)
- `gamedata/js/enemies.js`: 敵DB (`ENEMY_REGISTRY`)
- `gamedata/js/characters.js`: 統一キャラDB (`CHAR_REGISTRY`、`DEBUFF_KEYS`/`buffCount` 同梱)。`src/app.js` からの循環インポートを持つが、関数内での遅延評価に限定することでTDZを回避。
#### `gamedata/md/` (一次情報・基礎データ / source of record)
- カテゴリ別サブフォルダ `神姫/` `英霊/` `幻獣/` `敵/` `その他/`（各 `README.md` に用途）。詳細は `gamedata/md/README.md`。md=根拠 / js=現在値。
- `gamedata/md/敵/`: 敵DB intake（旧 `enemies/`）。`gamedata/js/enemies.js` の蒸留元。
- `gamedata/md/その他/damage_frames.md`: **ダメージ枠（バフ/ウェポンスキルの乗り方）の一次情報**（ユーザー提供・2026-07-16・原文ママ。旧 `gamedata/damage_frames.txt`）。エンジンとの突合結果は CALIBRATION_ANALYSIS.md C31〜C35。

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
- **キャラ単位 md（`gamedata/md/神姫/<key>.md`・2026-07-19 ユーザー導入。tetra.md が先例）**: 1キャラ=1md で一次情報とシムデータを集約する様式。**§1 一次情報（Claude Code編集不可）**＝ユーザー収集の実機値/文言/有志検証。**§2 シムデータ（Claude Code編集可）**＝§2.1 各データのシム内呼称（`characters.js` のアビキー/バフキー/フック）＋§2.2 シム判明データ（`characters.js`＋`src/constants.js` に現在エンコード済みの値・挙動を**配置**。新規導出はしない）。⚠**一次情報にありシム未モデル化の項目は §2 に「未モデル化」と明記してよい。ただし当該機能を実装した際は、必ず同キャラ md の §2 の該当箇所を更新すること**（実装と md の乖離防止＝ユーザー規律 2026-07-19）。

### 2. 確定仕様・設計不変条件
- **ジャッジ再発動（C18で表現修正）**: proc で cd.judg=0 になれば**押下可能**（自動発火ではなく押す位置はプレイヤー/探索の裁量。セオリー上デバフ等を先行させうる）。同ターン上限 `judgCap = 5 + (開始時cd===0?1:0)`（`T.ju`・毎ターンリセット）。
- **ジャッジ3フェーズ循環（C23実機較正 2026-07-12）**: ph0=敵全体10回ダメージ / ph1=バースト / ph2=通常攻撃 の循環は**戦闘通算で連続**（`sim.judgPhase%3`・ターン毎リセットしない）。同ターン発動上限（`T.ju`）とは別カウンタ。旧実装は `T.ju%3`（毎ターンph0リセット）で、実機の各ターン開始judgフェーズ（T4=ph1/T5=ph0/T6=ph2）を3/3外していた（根拠 CALIBRATION_ANALYSIS.md C23）。
- **コヴァレント・アルカナ**: アビ12回 / バースト2回ごとにproc発火（**メイン＋攻撃フェイズ両対象**・攻撃フェイズprocのcd.judg=0は次ターンへ持ち越し）。連理魔力+1 ＆ ジャッジCD=0を同時付与。同ターン5回上限。
- **モビウスムーンズ**: パーティ全体のバースト5回ごとに、ヘカテーの全アビCDをリセット。
- **ムーンコード（ヘカテー2アシ・C18実機較正 2026-07-07）**: 「戦闘開始時または**ヘカテー自身**がアビリティ**12回使用する毎**（戦闘通算 `moon_acc`）に発動・**持続2ターン**（開始時発動も同じ）」。判定は**アビ終了後**（C18r2）＝12回目の押下自身には効かず**同一ターンの後続ヘカテーアビから**有効（effond は `mcAtPress` で押下時点の状態を捕捉）。effond は「ムーンコード発動時のみ即座にゲージ消費なしでバースト」。旧実装（パーティ全体アビ12回・ターン内カウント＝実質常時ON）は誤りで、sim02 試行1 raw の T4/T6「ヘカテー2バースト無し」交互パターン・試行2 T4 の judg#12 発動不能を再現できなかった（根拠 CALIBRATION_ANALYSIS.md C18）。
- **イフィシャント早撃ち抑止**: `IFISHANT_MIN_CD = 3`（CD中アビが3つ未満は使用不可）。
- **ロワ・クモンドの3枠加算**: 通常（`roy_na_frac`）、アビ（`roy_abi_frac`）、バースト（`roy_burst_frac`）をそれぞれ独自枠加算。
- **ダメージ上限UP枠（C36・2026-07-22）**: 「ダメージ上限UP」は通常/バースト/アビの**各減衰枠の cap へ加算**（damage_frames 一次情報）。`Sim._partyCapUp()`＝アブソ（presence+20%）＋プヴワール（累積+6%/stack）を na/burst/abi 共通で cap に加算。burst は同枠加算（自 `burstCapBonus`[奮起/アリアン2アシ]＋パーティ passiveCap[ARRIVE `cap`]＋`_partyCapUp`＋sub＋GEAR）、**特別減衰[アリアン]のみ別枠乗算**（`burstCapSpecial`）。**golden は default gear で cap 未到達＝不変**（実gear/sim05でのみ binding）。⚠abs-calib スカラは cap-UP 無しで fit 済＝sim05 で再検証。
- **ゲージ経済（実機確認済・2026-07-04／実装＝実機一致・乖離なし）**: 黄アビのBG付与（funki+10/legend+10/sleur+15/absolute+20/pactcore+100）・マシーンタクトゥ（ロボ反応1回あたり `MACH_BG=5`）は**すべて味方全体対象**（`addG(CHARS,…)`）。エジソンのバーストで攻撃ロボ/補助ロボ**両方のCDを−1**（`edison.def.onBurst`）＝ロボ3T稼働に対し3T周期の再設置が回りきり**常時稼働**しうる。∴ **中盤(T3〜)以降に全員ゲージ満量になるのは正しい帰結**（過去に「ロボ常時稼働はありえない／満量は不自然」と疑義が出たが、実機仕様として3点とも一致・アンプリファ×攻撃ロボの効果窓も整合＝再調査不要）。エジソン4(アンプリファ)の+10万は攻撃ロボ反応（`sim.droid>0` の赤アビ反応）にのみ加算。
- **Phase3-1 事前計算マップ（ホットパス高速化・実装済）**: `buildFormation` で `ABIL_KEYS`/`ABIL_KC`/`ABIL_CANDS`/`ABIL_BASE_S` を一度だけ構築し、`_stepStatic`/`_candidates` が `Object.entries(ABIL)`・ネスト参照・`computeBaseScore` 再計算をせず `ABIL_KEYS` を1パス走査する。**⚠不変条件**: 走査順は `ABIL` 挿入順（=`Object.keys`順）でタイブレークは厳密 `>`（先頭最大）。キャラ追加・`abilities`/`cands` 変更時はこのマップ構築を経由するため自動追従するが、**走査順や `>` 比較を崩すと最適押し順の選択がズレる**（ゴールデン値 raw 197,775,394 / calibrated 211,462,826 で検証すること）。
- **ESM Worker起動規律**: 旧 `_buildWorkerCode`（文字列 slice）は廃止済み。Worker は `new Worker(new URL('./worker.js', import.meta.url), {type:'module'})` で起動。**`src/app.js` の worker 用 export に必要な探索関数（`buildFormation`, `recalcGearK`, `Sim`, `_runRootPlan` 等）を含めること**。UI/DOM 依存は INIT の `if(typeof document!=='undefined')` ガード内・window ブリッジに隔離すること。
- **2段ルート選抜（①-A・実装済）**: `runSim`/`_fallbackRunSim` は `enumerateRootPrefixes()` の全prefixを `_staticPrefixDmg`（静的greedy・約数ms）で安価採点し、上位 `PREFIX_TOPK`(=8・C16で10→8) 本のみ本選(BW64・C16で128→64)へ回す（`_selectRootPrefixes`）。空prefixは常に確保。**品質低下は PoC 実測で最大0.013%**（top-8が実証済み安全床・BW64で0%損実測）。新キャラ追加時は PoC（scratchpad `poc.js`）を再実行し `PREFIX_TOPK` の余裕を再確認する。

### 3. Git 開発ワークフロー (強制ルール)
- **作業開始時**
  1. `git checkout main` で main に切り替え、`git pull origin main` を実行。
  2. 作業用ブランチを切って開発を開始。
- **検証 (作業完了時)**
  - 必ず `npm run test:golden`（期待値: raw 197,775,394 / calibrated 211,462,826）を実行しパスを確認。
- **反映・プッシュ**
  - コミット後、`main` に戻って `pull`、作業ブランチをマージし、再度検証テストをパスして `git push origin main`。不要な作業ブランチは削除。

### 4. 実機乖離・最適順序不整合の改善フロー
シミュレーターの計算値やアビ実行順序が実機と乖離した場合は、`simulation/simNN/` に分析結果を蓄積し、ドキュメントをハブにして解決する。
1. **リプレイ照合**: 「リプレイモード」に実機手順を入力し、乖離の発生起点を特定。実測を `simNN/raw_data.md` に、replay画面は `simNN/replay_screenshots.md` へテキスト転記。
2. **課題のDB化**: [CALIBRATION_ANALYSIS.md](CALIBRATION_ANALYSIS.md) のバックログ（Cx）に追記。
3. **計画・検証策定（Antigravity 主担当）**: 設計担当が原因特定し、`simNN/design_report.md` を**必須5節構成**（1.総合比較 / 2.敗北要因 / 3.乖離分析 / 4.影響度検証 / 5.引継ぎ）で作成。
4. **自律修正とテスト**: 実装担当（Claude Code）が `design_report.md` を検証して `simNN/integrated_analysis.md` にまとめ、コード修正後テスト実行。期待値 `raw 197,775,394 / calibrated 211,462,826` と追加検証ケースのパスを確認。

---

## 検証方法

リファクタリング・機能追加後は、以下でゴールデン値の一致を確認すること。

```bash
npm run test:golden          # = node test/golden.mjs（src/app.js を import し10T総ダメージを検証）
```

**編成別マルチfixture（2026-07-25 導入・「1編成=1golden」）**。golden.mjs は各編成の回帰アンカーを検証:
- **edison/raw**（beam+refine・較正なし）: `197,775,394`・FB `10/10`（構造修正C31/C34＋絶対値較正calib_na1.835/calib_burst2.07/judg_calib0.62）
- **edison/cal**（beam+refine・`{judg:145,pactcore:1}` 適用＝production 出荷値）: `211,462,826`・FB `10/10`
- **napoleon/static**（移行編成・**静的greedy**の回帰ガード＋**maxPress<60 ハングガード**）: `299,534,299`・FB `10/10`・maxPress `34`
  - ⚠ napoleon は**静的greedy値＝beam最適ではない・「回帰ガード」であって較正確定値ではない**。フルビーム10Tは~90sで頻回テストに不適のため静的greedyを採用。**buffCount/閾値の実機修正（sim05・点1/2）後に再fit**。beam版napoleon回帰は将来 `test:golden:full` 等へ。
  - ※sim04較正の内訳（edison）: C31=アビダメUP加算化・C34=バーストダメUP+500%上限・C32=M3で2段cap不支持のため1.0クランプ維持・C25=通常×1.835/バースト×2.07・C30=judg ph0×0.62。根拠 `simulation/sim04/analysis/`・CALIBRATION_ANALYSIS C25/C30/C31/C32/C34。残: C5/C3追撃cap。

> 探索は `runSim` 実行時に config別に静的スコア s を自動較正する（`calibrateStaticScores`・proxy-shortlist+full-verify・単調安全）。golden.mjs は決定的検証のため較正結果 `{judg:145,pactcore:1}` を `setStaticOverride` で明示適用する（毎回の較正走行を避ける）。詳細 archive/SEARCH_ROLLOUT_DESIGN.md §6。

補助検証（大きな構造変更・Worker/ビルド変更時）:
```bash
npm run build                # dist/ 生成（worker 別チャンク・minify ON）が成功すること
npm run preview              # dist を http 配信 → ブラウザで探索/中断/UIを実機確認（ESMは file:// 直開き不可）
```

---

## 実機較正ステータス（詳細は CALIBRATION_ANALYSIS.md 参照）
- **確定パラメータ**:
  - バースト係数: ヤマト/ヘカテー/テトラ = 5.0/2500, エレイン = 5.5/3000
  - 追加ダメージフレーム: **アビ枠 (`'abi'` / 減衰率 0.04)**
  - エレインバースト追加: 常時1回、契晶80以上で3回発動
  - エジソン英霊武器追加ダメ: 2.5倍/80万 (アビ枠・onBurst実装済み)
  - ヤマト1アシ バーストダメージプラス: +10万/stack・味方全体のバースト対象 (C8)
  - ナイツサプレス(エレイン3): バーストダメ+20%・非累積(refresh)・2T (C11)
- **バックログ状態（open のみ・fixed/wontfix/closed の詳細と根拠は CALIBRATION_ANALYSIS.md が正）**:
  - **C25**（★絶対値較正の本丸・open/再定式化）: 乖離は pre-cap raw に局在（cap/slope は飽和一致で妥当）。core=baseline不足＋成長不足。sim04 で frame calib（calib_na/burst/judg）確定・**追撃成分は残**。
  - **C3 / C5**（追撃・investigating）: 追撃 cap 過小（実機比×2.3〜6.9・非決定fitで残差保留）＝**sim05 の主題**（新編成アンカーで解く）。
  - **C1 / C2**（open）・**C24**（診断済・低severity・fixは実機ゲート＝ゲージ±5〜10 の系統乖離・黄ロボ反応の計数差に局在）。
  - **C31〜C35**（damage_frames 突合起票・修正は較正セッションゲート）: C31/C34 は sim04 で fixed（アビダメUP加算化・バーストダメUP+500%上限）。C32=M3実測で現行1.0クランプ維持。C33/C35 は軽微・open。
  - **C37**（open・**起票のみ／実装しない**）: **探索パラメータ `BEAM_W=64` は編成依存**＝ナポ/アリアン×宿儺では最悪点で、幅を変えると総ダメが **+3.0〜+5.6% 変動しかつ非単調**（BW384=+5.64%）。根拠の C16 はエジソン編成の測定値で本編成へ転移せず。本質は幅不足でなく**枝刈りの代理採点（ロールアウト静的greedy）**＝近似最適順どうしの優劣が識別できていない。**`PREFIX_TOPK`/`BEAM_DIVERSITY_K` も同様に再測が必要**。⚠**編成を移したら探索パラメータは再測する**を一般則に。
  - **fixed 済の主要 Cx**（詳細は CALIBRATION_ANALYSIS.md）: C4/C8/C9/C11/C12/C13/C14/C16・C18（ムーンコード）・C19（tenya_re アビ計数）・C21（ifishant 条件付き+1）・C22（経済 clean・クローズ）・C23（judgフェーズ戦闘通算）・C26（追撃UI設定・_configSig拡張）・C27（whole-route refine）。**wontfix**: C6/C17。**撤回**: C7（与ダメ2フェーズ倍率は非実在）。
  * 現ゴールデン値: **raw 197,775,394 / calibrated 211,462,826** (sim04 絶対値較正にて再fit・2026-07-21・override {judg:145,pactcore:1}・ENGINE_VERSION `sim04-abscal-C31C34-calib`)

---

## 現状・次タスク（→ workspace/）

**現在の進行状況・次タスクは本書では持たない**（青天井化と新セッションのトークン浪費を避けるため 2026-07-24 に分離）。

- **現状スナップショット**: `workspace/HANDOFF.md`（現フェーズ・直近成果・アクティブ作業ライン・ポインタ）
- **次タスク（優先順）**: `workspace/TODO.md`
- **過去の進行経緯・provenance**: `archive/SESSION_LOG.md`（append-only 履歴）

> セッション末は HANDOFF/TODO を更新し、現状化した進行を SESSION_LOG の先頭へ畳む（規律は REPO_STANDARDS §6）。
