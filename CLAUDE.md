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
- **tools/**（2026-07-28 `archive/tools/` からルートへ昇格・ユーザー承認）: **較正・探索ハーネス置き場（現役）**。`README.md` が索引＝どのスクリプトがどの台帳数値を出したかの対応表。従来分（`search_calibrate.mjs`＝**ダメージモデル変更時の再fit必須**・`search_probe.mjs`・`c27_refine_probe.mjs`・`ml_fit_static{,_v2}.mjs`＝Phase7 PoC 温存）＋**実機押し順の強制リプレイ突合 `calib_replay_compare.mjs`（sim05 の較正方式そのもの・C40〜C44 の根拠）**＋**探索品質の実験ハーネス `exp_*.mjs` 15本**（BW掃引/prefix掃引/ATK感度[ナポ・エジソン]/局所探索[単点・多点・対照]/abilCap切り分け/ホライズン感度/C27vsLS[ナポ・エジソン]/prefixルート同一性/buffCount分解/順×ATK比較/**loki安定性[B4]**）＋**押し順抽出 `extract_order_loki.mjs`**。全て production 非改変。
- **CHARACTER_ANALYSIS.md**: キャラ個別評価＆採用論の生きた考察台帳（2026-07-11 起草）。ヤマトvsアリアンのホライズン別比較・ナポレオン評・併用仮説（暫定）。序数比較ベース＝新キャラ/較正確定のたびに更新。

### 現役データディレクトリ
- **gamedata/md/敵/**（旧 `enemies/`＝2026-07-19 に `gamedata/md/` 配下へ移動）: 敵DB intake。`README.md`（命名・追加手順・スキーマ）＋ `TEMPLATE.md` ＋ `<key>.md`（実機詳細＝根拠）。`gamedata/js/enemies.js` の `ENEMY_REGISTRY` がそこから蒸留した現在値。Phase4較正ボス `walpurgis_loki`・sim03較正ボス `fimbulvetr` を登録。
- **simulation/**: Phase 4 の試行データ蓄積。`simulation/README.md`（命名規約・ワークフロー・**較正カデンツ=統計的較正×反復可能ボス（2026-07-12転換）**）＋ `TEMPLATE/` ＋ `simNN/`。**sim03以降の新構造（ユーザー決定）**: `data/`（`record_skeleton.md`＝**各simで唯一の記録テンプレ（コピー原本）** / `trialNN.md`実機原本＝record_skeletonを複製して作成 / `configX_gear_panel.md`＝装備の一次記録。※探索キャッシュ JSON は**無効化したら `archive/caches/` へ退避**する＝sim 直下に溜めない）＋ `analysis/`（**2層構造・コンテキスト有界化**: `per_trial/trialNN_{quant,quali}.md`＝**単trial中間集計**[trialNN1本のみ入力] → `quantitative_analysis.md`/`qualitative_analysis.md`＝**trial横断rollup**[per_trial全trial入力・決定性/分散/max_hp収束はここ専用] → `integrated_analysis.md`＝統合[両rollupのみ]）＋分類不能ファイルはsim直下。sim01/02は旧構造のまま凍結。**新試行は `cp -r simulation/TEMPLATE simulation/simNN` で開始**。**⚠テンプレは record_skeleton のみ・trialNN の複製とpushはユーザーが行う・sim内mdフォーマットは record_skeleton に統一必須（混同防止）**。

### archive/（クローズ済み・歴史台帳＝現状の一次情報ではない）
完了・クローズした計画/設計レポート置き場。バックログ（Cx）行から旧パスで参照されている場合も実体はここ。
- **SESSION_LOG.md**: **セッション進行ログ（append-only・provenance 保全）**。旧 CLAUDE.md「現在の進行状況」を移設。セッション末に現状化した進行を先頭へ畳む。現状は workspace/HANDOFF が正。
- 設計レポート: `BEAM_SEARCH_DESIGN.md`（C9）/ `ORDER_OPTIMIZATION_DESIGN.md`（C12）/ `SEARCH_ROLLOUT_DESIGN.md`（C13-C15・自動較正§6含む）/ `OPTIMIZATION_ENGINE.md`（エンジン解説旧版）
- 完了フェーズ台帳: `PHASE2_PLAN.md` / `PHASE3_PLAN.md` / `PHASE5_PLAN.md`（UX刷新+Vite化・完了）/ `VITE_MIGRATION.md`（S5作業記録）/ `PERF_NOTES.md`（高速化台帳）/ **`PHASE7_ML_PLAN.md`（静的スコア s のML化・クローズ＝安価サロゲートNO-GO。§6/§7にPoC結果。`s`＝ダメージ非関与の探索ヒューリスティック前提・レベルA/B/C吟味・★スコープ外＝絶対値乖離C25/C5）**
- **SEARCH_QUALITY_EXPERIMENTS.md**: **探索品質の実験記録＝C37 の根拠アーカイブ**（2026-07-28 新設 → **2026-08-02 に sim05 から移設**）。BW掃引／PREFIX_TOPK／ATK感度／識別可能性／局所探索（5〜5d）／A1エジソン対照／実測コスト。**状態と結論の要約は C37 が正**・本書は数値の保全に徹する。
- **`TRANSCRIPTION_DESIGN.md`（2026-08-03 archive へ・**凍結**）**: 実機録画→trialNN 転記の半自動化（設計のみ・未実装）。**ユーザー判断でタスクごと取り下げ**＝TODO/HANDOFF からも除去済み。**頃合いを見てユーザーが再起票する**（それまで着手しない）。内容＝OCR を信用せず検算する設計・S1 リプレイ照合が主役（HP は整数%＝分解能 1%=980万で総和チェックの分解能が足りない）。
- 運用メモ: `BRANCH_WORKFLOW.md`（main恒久トランク運用）
- `caches/`: 無効化済み探索キャッシュの歴史保全置き場（C26 followupON・C27証拠キャッシュ。2026-07-14 sim03/data から移設 ／ **`sim05_*.json` 3本を 2026-08-02 に sim05/data から移設**＝engineVersion 2世代前で再現不能だが `tools/exp_{loki_stability,abilcap_isolation,order_compare}.mjs` が読む）

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
- **局所探索による後処理（C37・2026-07-30 実装・`_localSearchRoute`）**: `_runRootPlan` は確定ルートに3種の近傍（①ターン内move ②ターン内swap ③**ターン跨ぎswap**）を総当たりし、`_replayResult` で採点して**厳密改善のみ採用**する。**不変条件**: (1) 改善のみ採用＝総ダメージは単調非減少（golden は下がらない） (2) 停止条件は評価回数 `LS_MAX_EVALS` であって**時間ではない**＝決定的（時間バジェットを入れると golden が環境依存で壊れる） (3) ③を move ではなく swap にするのは手数保存＝`abilCapPerTurn` を持つ敵で受け側が黙って落ちるのを防ぐため。**旧 C27 `_refineRoute` を置換**（LS が包含すると B3b で実測・`_refineRoute` は再現性のため残置＝**production 非経路・新規結線禁止**）。目的関数は `_objective` 第1要素と同一＝エンジンの主目的は変えていない。
- **探索の2段実行（2026-07-31・LS の重複除去）**: `runSim`/`_fallbackRunSim` は **①全 prefix をビームのみで走らせ（`_runRootPlan(...,skipLS=true)`）→ ②キー列で重複除去 → ③一意ルートにのみ LS（`_runRouteLS`）** の順で回す。**LS は (キー列, config) の決定的な純関数**なので、同一キー列に複数回掛けるのは完全な無駄。ロキ条件では prefix 分散が空回りして 8本中6本が同一ルートになる（`archive/SEARCH_QUALITY_EXPERIMENTS.md` §12）＝旧実装は LS を最大8回重複実行していた。**⚠不変条件: 結果は不変**（同一入力→同一出力）でコストのみ削減＝品質のトレードオフは無い。golden は `_localSearchRoute` を直接呼ぶため本変更の影響を受けない。
- **LS 評価の高速化（2026-08-01・★結果不変が不変条件）**: 2点。①**`_execKey` の短絡**＝旧実装は1押下ごとに `_candidates()` で**全候補の配列とクロージャを構築**してから1件を `find` していたが、`_stepStatic` と同じく `ABIL_KEYS` を1パス走査して一致で即実行する。同値の根拠＝走査順とフィルタ（abilCap→cd→契晶→guard→variants）が `_candidates` と同一、`find` は最初の一致、`guard`/`s`/`variants` は**全て純粋な参照**（副作用なし）を確認済。②**インクリメンタル replay `_LSReplay`**＝LS の近傍候補は基準ルートと**最初に異なるターン t0 以降しか変わらない**ので、各ターン開始時のスナップショットから t0 以降だけを再生する。⚠**不変条件**: (1) 評価値は full replay と**ビット一致**（復元は `Sim._snapshotForReplay()`＝`clone()` から**planDepth を上げない**点だけが違う。`_primeLookaheads` が内部で `clone()` して +1 するため、深度がズレると lookahead が fresh replay と変わる。※`_naOwner` の複製は **C39(b) fix で `clone()` 本体の責務**になった） (2) **走査順・受理順・評価回数・着地点はすべて不変**＝golden は1円も動かない。**回帰は `tools/exp_ls_incremental_verify.mjs`**（近傍1,000件のビット一致＋受理後の一致）。実測 golden 約10分→**4分07秒**。
- **forcedKeys リプレイの正規化（2026-07-30）**: `greedyTakeTurn(t, forcedKeys)` は**実際に実行できたキーだけ**を行に記録する（`_execKey` が実行可否を返す）。押せなかったキー（CD中/契晶不足/`abilCap`到達）が「押した手」として残る幽霊キーを防ぐ＝ターン跨ぎ swap を持つ LS の前提。**総ダメージは元から不成立キーを無視して計算されており不変**。
- **2段ルート選抜（①-A・実装済）**: `runSim`/`_fallbackRunSim` は `enumerateRootPrefixes()` の全prefixを `_staticPrefixDmg`（静的greedy・約数ms）で安価採点し、上位 `PREFIX_TOPK`(=8・C16で10→8) 本のみ本選(BW64・C16で128→64)へ回す（`_selectRootPrefixes`）。空prefixは常に確保。**品質低下は PoC 実測で最大0.013%**（top-8が実証済み安全床・BW64で0%損実測）。新キャラ追加時は PoC（scratchpad `poc.js`）を再実行し `PREFIX_TOPK` の余裕を再確認する。

### 3. Git 開発ワークフロー (強制ルール)
- **作業開始時**
  1. `git checkout main` で main に切り替え、`git pull origin main` を実行。
  2. 作業用ブランチを切って開発を開始。
- **検証 (作業完了時)**
  - 必ず `npm run test:golden`（期待値: raw 201,909,711 / calibrated 214,213,430 / napoleon 299,534,299）を実行しパスを確認。⚠**約10分＝背景実行**。
- **反映・プッシュ**
  - コミット後、`main` に戻って `pull`、作業ブランチをマージし、再度検証テストをパスして `git push origin main`。不要な作業ブランチは削除。

### 4. 実機乖離・最適順序不整合の改善フロー
シミュレーターの計算値やアビ実行順序が実機と乖離した場合は、`simulation/simNN/` に分析結果を蓄積し、ドキュメントをハブにして解決する。
1. **リプレイ照合**: 「リプレイモード」に実機手順を入力し、乖離の発生起点を特定。実測を `simNN/raw_data.md` に、replay画面は `simNN/replay_screenshots.md` へテキスト転記。
2. **課題のDB化**: [CALIBRATION_ANALYSIS.md](CALIBRATION_ANALYSIS.md) のバックログ（Cx）に追記。
3. **計画・検証策定（Antigravity 主担当）**: 設計担当が原因特定し、`simNN/design_report.md` を**必須5節構成**（1.総合比較 / 2.敗北要因 / 3.乖離分析 / 4.影響度検証 / 5.引継ぎ）で作成。
4. **自律修正とテスト**: 実装担当（Claude Code）が `design_report.md` を検証して `simNN/integrated_analysis.md` にまとめ、コード修正後テスト実行。期待値 `raw 197,775,394 / calibrated 211,462,826` と追加検証ケースのパスを確認。

### 5. 編成間の転移可能性（2026-08-01 制定・同型の失敗が4例に到達したため明文化）

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

**⚠ ただし「必ず外れる」わけでもない（2026-08-03・肯定側の実例）**: 同じ sim04 fit でも **`calib_na=1.835` は転移していた**
（judg ph2 の通常攻撃 1ヒットで 実機/シム ×0.99 / ×0.89）。**同じ走・同じ config で burst 枠だけが外れ、na 枠は当たった**。
∴ 原則は「**転移するかどうかを枠ごとに測る**」であって「転移しない/する」と一括で決めつけることではない。
**測れば安いものから測る**（成分別の強制リプレイは約3秒）。

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

リファクタリング・機能追加後は、以下でゴールデン値の一致を確認すること。

```bash
npm run test:golden          # = node test/golden.mjs（src/app.js を import し10T総ダメージを検証）
```
⚠**所要は約2分**（2026-08-01 LS 高速化 約10分→4分07秒 → 2026-08-02 **fixture 並列化で 2分07秒**）。600秒上限に余裕はできたが**背景実行を推奨**。
`--serial` で従来の逐次実行、`--fixture <name>` で単体実行（デバッグ用）。**検証内容は不変**＝各 fixture は決定的なので並列化しても値は動かない。

**編成別マルチfixture（2026-07-25 導入・「1編成=1golden」）**。golden.mjs は各編成の回帰アンカーを検証:
- **edison/raw**（beam+**LS**・較正なし）: `202,005,923`・FB `10/10`（構造修正C31/C34＋絶対値較正calib_na1.835/calib_burst2.07/judg_calib0.62＋C37局所探索）
- **edison/cal**（beam+**LS**・`{judg:145,pactcore:1}` 適用＝production 出荷値）: `215,161,915`・FB `10/10`
- **napoleon/static**（移行編成・**静的greedy**の回帰ガード＋**maxPress<60 ハングガード**）: `299,523,354`・FB `10/10`・maxPress `34`
  - ⚠ napoleon は**静的greedy値＝beam最適ではない・「回帰ガード」であって較正確定値ではない**。フルビーム10Tは~90sで頻回テストに不適のため静的greedyを採用。**buffCount/閾値の実機修正（sim05・点1/2）後に再fit**。beam版napoleon回帰は将来 `test:golden:full` 等へ。
  - ※sim04較正の内訳（edison）: C31=アビダメUP加算化・C34=バーストダメUP+500%上限・C32=M3で2段cap不支持のため1.0クランプ維持・C25=通常×1.835/バースト×2.07・C30=judg ph0×0.62。根拠 `simulation/sim04/analysis/`・CALIBRATION_ANALYSIS C25/C30/C31/C32/C34。残: C5/C3追撃cap。
  - ※**C39 による再fit（2026-08-02・★ダメージモデルの変更）**: `_naOwner` の是正＝(a) `effond`/`betaia` が自分を `_naOwner` に設定せず**他キャラのギア係数・自己バフで自分のダメージを計算していた**のを規約どおりに是正／(b) `clone()` が `_naOwner` を落としていた（＝ビーム/先読みだけ本線と評価条件が違った）のを是正。raw +0.048% / cal +0.443% / napoleon/static **−0.004%**。**寄与の切り分けは実行経路から一意**（napoleon/static は静的greedy＝ビーム不使用で `clone()` を通らない＝(a)のみ／edison はナポ不在で `betaia` 無し＝(a)effond+(b)）。⚠**override `{judg:145,pactcore:1}` は未再fit**（モデル変更時の `search_calibrate.mjs` 再fit は未履行＝workspace/TODO に残置）。
  - ※**C37 局所探索による再fit（2026-07-30）**: ダメージモデルは不変（sim04較正のまま）で、**探索後処理の置換による押し順改善のみ**の上振れ＝raw +2.09% / cal +1.30%。単調安全なので値は下がらない。napoleon/static は静的greedy経路のため**不変**。override `{judg:145,pactcore:1}` は据置（下記の留保あり）。

> 探索は `runSim` 実行時に config別に静的スコア s を自動較正する（`calibrateStaticScores`・proxy-shortlist+full-verify・単調安全）。golden.mjs は決定的検証のため較正結果 `{judg:145,pactcore:1}` を `setStaticOverride` で明示適用する（毎回の較正走行を避ける）。詳細 archive/SEARCH_ROLLOUT_DESIGN.md §6。

### 実測コスト（**2026-08-01 の LS 高速化後で再計測**／実験設計の前提に使う）
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

> **LS 高速化（2026-08-01・結果不変）**: ①`_execKey` を「全候補配列を構築して find」から **ABIL_KEYS 1パス短絡**へ
> ②LS の評価を `_LSReplay` の**インクリメンタル replay**（候補が基準と最初に異なるターン t0 以降だけ再生）へ。
> **評価回数・受理順・着地点はすべて不変＝golden 値は1円も動かない**（`tools/exp_ls_incremental_verify.mjs` で
> 近傍1,000件のビット一致を検証＋golden 3/3 一致）。

⚠**旧 `test/golden.mjs` コメントの「edison ~2s」は約29倍の誤りだった**（napoleon ~90s はほぼ整合）。
**コード内の性能数値は測定条件が不明なら実験計画の前提にしない**（必ず実測してから使う）。根拠 CALIBRATION_ANALYSIS C37。

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
  - **C25**（★絶対値較正の本丸・open/再定式化・**2026-08-03 成分別に分解**）: sim04 で frame calib（calib_na/burst/judg）確定。sim05 pre-trial ＋ M1（sim03 過去データ）の**成分別強制リプレイ**で、乖離は**成分ごとに符号が逆**と判明＝**一律スカラは不可**。**不足**＝betaia（C41）/ バースト追加ダメージ（C40・**編成横断**）/ holy / ロボ追撃 ／ **過大**＝バースト本体（C44）。**一致**＝アビリティ ×1.008・ストリーク ×1.019・DOT ×1.000・通常攻撃 ×1.09（`calib_na` は転移）。⚠ **総ダメージ一致は何も保証しない**（過大と過小が相殺する＝pre-trial ×1.41・sim03 ×1.065 とも相殺後の値）。
  - **C3 / C5**（追撃・investigating・**2026-08-03 主題から降格**）: 従来「追撃 実機比×2.3〜6.9」と見えていたのは**アリアンの①バースト効果「追加ダメージ」を追撃と混同**していたため（→C40）。純粋な追撃（②1アシ）は **×1.55・T1 乖離寄与 1.3%**＝「②の cap を実効117.5万→160万級へ」という小さく確定的な作業に縮小。
  - **C40 / C41 / C44**（**★sim05 pre-trial で起票 2026-08-03**・T1 の**不足** 49.7% / 59.9% と**過大** −33.9%）: **C41=`DMG.betaia_cap`=800,000 が過小**（シム raw 281万を硬capが34%切り捨て・実機1ヒットは 206〜247万で**ターン毎に変動＝cap 非拘束**） ／ **C40=バースト「追加ダメージ」の定式化が違う**（**cap を無限大にしても届かない**＝実機はシム raw の 1.8〜2.4倍。実機は**本体の 0.51〜0.77 倍**・4キャラ21バーストが同帯。**★M1 で編成横断と判明**＝エジソン×configA でも ×2.689 で同じ向き・同じオーダー＝**edison golden にも効く**） ／ **C44=バースト本体がシム過大**（configC ×0.77 / configA ×0.705。⚠ `calib_na` は ×0.99 で転移＝**ズレは burst 枠だけ**）。**符号が成分ごとに逆＝一律スカラ不可**。**修正順序は C44 → C40**。⚠ **`calib_burst` の値は確定できない**（configA が要求する ≈1.46 と configC の ≈1.66 が 13% 食い違い、原因未特定＝A7 / 編成依存 / config 誤差 / 敵 def のいずれも未排除）。⚠ **`decay_burst.slope=0.10` は支持**（一時は 0.30〜0.40 と推定したが、本体比では calib と slope が**縮退**する誤り＋sim03 T3 の**打ち切りデータ汚染**による。`calib_burst` を通らない**ストリーク**で破って棄却）。実装はキャスパリーグ M2〜M4 待ち。根拠 `simulation/sim05/analysis/`（`m1_history_replay.md` 含む）。
  - **⚠ C40〜C44 の解き方（2026-08-03 ユーザー判断）**: 両面宿儺は「障壁 rate/abi」「アビ上限＋バフ消去(C43)」「def=20 未検証」を**同時に**抱え、そこで fit すると多変数の連立になる。∴ **ナポ/アリアン固有の仕様は `cath_palug`（キャスパリーグ＝sim04 で frame calib を fit した環境そのもの）で先に確定させ、宿儺は最終検証に回す**。測定メニュー＝`simulation/sim05/README.md` §4.8（M1〜M6）。**順序の原則＝「カウントで閉じる → 比で閉じる → 絶対で閉じる」**。
  - **C42 / C43 / C44**（同上・open）: **C42=同ターン発動回数の上限が実機より厳しい**（alone 2 vs 実機3・holy 6 vs 実機7・legend 2 vs 実機3。⏳契晶記録待ち） ／ **C43=アビ上限超過ペナルティが「硬い剪定」**（実機は**超えられる**＝ペナルティはバフ消去のトレードオフ。実機は T1 に 42手を通した。⏳消去範囲の実機観測待ち・既定敵は golden 影響なし） ／ **C44 は上記**（2026-08-03 の config 訂正で「judg_calib の非転移」から「バースト系基底の過大」へ内容が入れ替わった）。
  - **C45 / C46**（**★M1 で検出・仕様は 2026-08-03 ユーザー回答で確定**・一次情報＝`gamedata/md/その他/attack_phase.md`）: **C45=反撃が未モデル化**（sim03 T1/T2 で実機 21.8M）。**ダメージ側は一次情報でほぼ解ける**＝`gamedata/md/神姫/hecate.md` §1.2「攻撃を回避したとき10倍・減衰150万」で検算 ×0.916。**本当のブロッカーは「いつ・何回 攻撃されるか」＝敵の行動モデル**（ROADMAP 未確定Phase「敵行動」）。⚠ **ムーンコード中は回避率ほぼ100%＝被ダメ0でも反撃する**。 ／ **C46=攻撃フェイズのモデルが2点違う**（実機は**バーストと通常攻撃が排他**・ゲージ100以上**かつボタンON**でバースト＝**「溜める」選択肢がシムに無い**／**非バーストキャラの通常攻撃を加算しない**）。⚠ **影響は限定的**＝全員バーストするターンでは定義上ゼロで、較正走は**ほぼ全ターン FB 成立**（golden 3 fixture 10/10・pre-trial 全3T・sim03 T1/T2）。**ただし C43 や新しい敵/編成で FB が途切れれば即座に binding する**。
  - **C1 / C2**（open）・**C24**（診断済・低severity・fixは実機ゲート＝ゲージ±5〜10 の系統乖離・黄ロボ反応の計数差に局在。**2026-08-03: 「1ヒット +10」はゲームの仕様と確定**＝シムは通常攻撃由来のゲージ生成を持たない。⚠ **T1 だけ全員 0→100 に達する**理由は未解明。**ゲージ増分は通常攻撃ヒット数の転記チェックサムに使える**）。
  - **C31〜C35**（damage_frames 突合起票・修正は較正セッションゲート）: C31/C34 は sim04 で fixed（アビダメUP加算化・バーストダメUP+500%上限）。C32=M3実測で現行1.0クランプ維持。C33/C35 は軽微・open。
  - **C39**（**fixed 2026-08-02**）: `_naOwner`（今の攻撃者）がターンを跨いで残留し `clone()` もコピーしていなかった。`effond`/`betaia` が**他キャラのギア係数・自己バフで自分のダメージを計算**していたのと、**ビーム/先読みのクローンだけ本線と評価条件が違った**のを是正。golden 3件とも再fit（詳細は CALIBRATION_ANALYSIS C39）。
  - **C37**（open・**局所探索は 2026-07-30 に実装済／幅の問題は未解決**）: **探索パラメータ `BEAM_W=64` は編成依存**＝ナポ/アリアン×宿儺では最悪点で、幅を変えると総ダメが **+3.0〜+5.6% 変動しかつ非単調**（BW384=+5.64%）。根拠の C16 はエジソン編成の測定値で本編成へ転移せず。本質は幅不足でなく**枝刈りの代理採点（ロールアウト静的greedy）**。⚠**A1 でエジソンは健全と判明**（ダメージ厳密単調・押し順一致99.2〜100%）＝**エンジン全体の病理ではなくナポ/アリアン×宿儺(abilCap19)に固有**（編成と cap は未分離＝B1 で切り分け）。派生: `PREFIX_TOPK=8` は転移確認（損失0.017%）／**局所探索＝C27 の上位互換・✅2026-07-30 に `_localSearchRoute` として実装（`_refineRoute` を production 経路から置換）**（B3b: エジソンで C27 +0.140% に対し LS +0.779%・refine有/無が同一終点へ収束。ナポでは**C27 自体が発火せず**＝4例目の編成依存。実装時の golden 再fit＝raw +2.09%/cal +1.30%。⚠**改善幅もギア/敵依存**＝B3b の実gear条件 +0.78% に対し golden の default gear では +2.09%）だが**幅の代替にはならない**（5d 対照: 幅と LS は加算的）／**押し順の識別可能性が根本的に低い**（C1: 総ダメが1円単位で同値の別ルートが7本以上・prefix分散は中位で空回り）／`CALIB_GRID` はナポ/アリアンのアビを含まない構造的欠落／**Phase 7 のクローズ根拠もエジソン依存＝再評価対象**。一般則: **編成を移したら探索パラメータは再測する**・**コード内の性能数値は実測してから使う**。**全実験の数値＝`archive/SEARCH_QUALITY_EXPERIMENTS.md`**。
  - **C38**（open・**押し順への影響は最大級**）: **`buffCount` が実機と別のものを数えている**（同一効果の内部スタックを1個ずつ加算）＝T1で既に bc=34・以降88〜100 で**強化効果数tierが全て常時到達＝機能停止**。ナポの4アビは全て tier 依存スコアだが定数に張り付き、「6で撃つか10で撃つか」の判断が存在しない。**予測探索の実装は本Cxが前提**（未解決なら全ルールが即撃ちに縮退）。**取得方式は 2026-08-02 に変更**＝実機UIが付与先を表示せず効果量のストック表示のため**アイコン計数は不可**＝**各 tier の効果の成立/不成立から bc を区間推定**する（`simulation/sim05/data/record_skeleton.md` §3・sim05 README §4.6）。
  - **fixed 済の主要 Cx**（詳細は CALIBRATION_ANALYSIS.md）: C4/C8/C9/C11/C12/C13/C14/C16・C18（ムーンコード）・C19（tenya_re アビ計数）・C21（ifishant 条件付き+1）・C22（経済 clean・クローズ）・C23（judgフェーズ戦闘通算）・C26（追撃UI設定・_configSig拡張）・C27（whole-route refine＝**2026-07-30 に C37 局所探索へ置換・production 非経路**）。**wontfix**: C6/C17。**撤回**: C7（与ダメ2フェーズ倍率は非実在）。
  * 現ゴールデン値: **raw 202,005,923 / calibrated 215,161,915 / napoleon/static 299,523,354** (C39 `_naOwner` 是正にて再fit・2026-08-02・**ダメージモデルの変更**・override {judg:145,pactcore:1} は**未再fit**・ENGINE_VERSION `sim05-c39-naowner`)

---

## 現状・次タスク（→ workspace/）

**現在の進行状況・次タスクは本書では持たない**（青天井化と新セッションのトークン浪費を避けるため 2026-07-24 に分離）。

- **現状スナップショット**: `workspace/HANDOFF.md`（現フェーズ・直近成果・アクティブ作業ライン・ポインタ）
- **次タスク（優先順）**: `workspace/TODO.md`
- **過去の進行経緯・provenance**: `archive/SESSION_LOG.md`（append-only 履歴）

> セッション末は HANDOFF/TODO を更新し、現状化した進行を SESSION_LOG の先頭へ畳む（規律は REPO_STANDARDS §6）。
