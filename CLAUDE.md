# 神姫PROJECT R — バーストトラッカー 開発ガイド

## 概要
バースト編成シミュレーター＆最適押し順トラッカー。**Phase5 S5（2026-06-30）で Vite/ESM モジュール構成へ移行**：`index.html`=薄いシェル、エンジン＝`src/app.js`、Worker＝`src/worker.js`、DB＝`data/*.js`（ESM）。開発は `npm run dev`、配布は `npm run build`→`dist/`（`npm run preview` で確認。**ESM は file:// 直開き不可＝要http**）。移行の一次情報は VITE_MIGRATION.md。

## ドキュメント体系（Antigravityエージェントとの共有用）
- **CLAUDE.md**（本書）: 生きた開発ガイド。コード地図・開発ルール・確定仕様・検証方法・実機較正ステータス。**現状の一次情報**。
- **.agents/AGENTS.md**: Antigravity（Gemini）エージェント用のルール／ガイドライン定義。開発不変条件（循環インポートにおける遅延評価規律・Worker用export）・Gitワークフロー・検証ゲート（raw 174,253,492 / calibrated 191,141,005）を規定。
- **archive/PERF_NOTES.md**: 探索エンジン高速化の調査・実装・採否判断の台帳（待ち時間の支配式・実装済み施策D/E/①-A・路線①PoC実測・WASMの位置づけ降格）。性能面の過去の一次台帳。
- **BEAM_SEARCH_DESIGN.md**: 探索エンジンの**準最適性（C9）設計レポート**（5節構成）。ビーム幅32の枝刈り不足で「バフ/デバフ先・ダメージアビ後」最適枝を取りこぼす件の原因分析・実測台帳（greedy/BW32/64/128/C2比較・非単調の崖）・修正候補（②賢い枝刈り推奨）。索引は CALIBRATION_ANALYSIS.md C9。
- **ORDER_OPTIMIZATION_DESIGN.md**: 押し順最適化の精緻化（**C12＝C9-②「賢い枝刈り」本設計**）。sim2押し順の5症状（amplifa表示/effond先行/judg空転/hecate順/tenya分割）の根本原因と設計案（僅差タイブレークに定石性スコア・tenya多段分割等）・段階実装計画。索引は CALIBRATION_ANALYSIS.md C12。
- **SEARCH_ROLLOUT_DESIGN.md**: 探索ロールアウトの**準最適性診断＋自己適応化設計（C13-C15）**。2026-07-02セッションの一次資料。①funki解禁バグ（C14）・②リプレイ往復スキップ（C13・修正済）・**探索rolloutポリシー脆弱性（C15＝本丸）**の全検証データ・再現手順（スキャフォールド編集＋`archive/tools/search_probe.mjs`/`search_validate.mjs`）・根本原因（静的スコアがモデル固有に手調整され脆い）・頑健解の方向（静的s非依存のlookaheadロールアウト＝STEP2次セッション）を収録。索引は CALIBRATION_ANALYSIS.md C13-C15。
- **CALIBRATION_ANALYSIS.md**: 実機較正の確定値＆**根拠アーカイブ**（なぜその値・枠か）。較正・英霊武器は実装済み。
- **archive/PHASE2_PLAN.md**: Phase 2（汎用化）完了計画（アーカイブ退避済み）。
- **archive/PHASE3_PLAN.md**: Phase 3（高速化）**完了・クローズ**。Phase3-1（アロケフリー化）/D（死コード除去）/E（clone二重コピー排除）/①-A（2段ルート選抜）まで実装し準備時間を大幅短縮。性能の過去台帳は archive/PERF_NOTES.md。
- **PHASE4_PLAN.md**: Phase 4（実機較正の反復＝**現行フェーズ**）の進め方台帳。**押し順優先**・序数比較ハーネス・「押し順は蓄積誤差に頑健、系統誤差だけを狙う」方針・乖離バックログ駆動を規定。§5.5 に Phase4で判明した重大エンジン改善（C8/C9）の履歴。
- **PHASE5_PLAN.md**: Phase 5（**探索UX刷新＝待機画面の本格リニューアル**＋後半＝Vite/モジュール化）の計画台帳。前半S1-S4（進捗可視化・ETA・中断・演出）および後半S5（A案=フルVite化・複数モジュール分割）は**すべて実装・統合完了**。
- **VITE_MIGRATION.md**: Phase 5 S5（Vite導入・A案）の**唯一の作業記録・引継ぎ書**。ビルドコマンドや協調ESM化の設計経緯・残タスク情報を収録。
- **enemies/**: 敵DB intake ディレクトリ。`enemies/README.md`（命名・追加手順・スキーマ）＋ `TEMPLATE.md` ＋ `<key>.md`（実機詳細＝根拠）。`data/enemies.js` の `ENEMY_REGISTRY` がそこから蒸留した現在値。Phase4較正ボス `walpurgis_loki`（ヴァルプルギス・ロキ）を登録。
- **simulation/**: Phase 4 の試行データ蓄積ディレクトリ。`simulation/README.md`（命名規約・ワークフロー・**較正カデンツ=turn-by-turnホライズン**・履歴管理の原則）＋ `TEMPLATE/`（新試行の雛形）＋ `simNN/`（1試行=1サブフォルダ: `raw_data.md`実機原本 / `replay_screenshots.md`シムreplay転記 / `design_report.md`設計レポート（設計担当＝主にAntigravity・**必須5節構成**）/ `integrated_analysis.md`統合分析（実装担当＝主にClaude Code・検証+回帰+Phase方針）/ `user_notes.md`ユーザー所感（仮説の種）/ `README.md`要約）。**新試行は `cp -r simulation/TEMPLATE simulation/simNN` で開始**。
- **ROADMAP.md**: 長期ビジョン（敵行動・味方生存＝**Phase 6**・旧Phase5からリネーム）＋新キャラ導入ワークフロー構想。Phase 4 定義は PHASE4_PLAN.md、Phase 5（UX刷新）は PHASE5_PLAN.md が一次。
- **archive/BRANCH_WORKFLOW.md**: ブランチ運用メモ。`main` を恒久トランク化し、節目で作業ブランチを集約・削除する手順と注意点（ブランチ乱立の防止）。
- 参照ツール（非計画書）: `archive/tools/*.js`（T1較正スクリプト）。

---

## ファイル構成 & コード地図

Vite/ESM移行完了後の物理ファイル構成および責務の定義です。

### 1. プロジェクトルート
- `index.html`: 薄いシェル（エントリーポイントとして `src/app.js` を module 読み込みするのみ）。
- `package.json` / `vite.config.mjs`: Viteビルド、依存モジュール、Workerバンドル設定。
- `test/golden.mjs`: ローカルNode.js環境から `src/app.js` を読み込み、10ターンのシミュレーション結果アサートを行う回帰テスト用ハーネス。

### 2. `data/` 配下 (データ層 / ESM)
- `data/weapons.js`: 武器マスターDB (`WEAPON_MASTER`)
- `data/summons.js`: 幻獣マスターDB (`SUMMON_REGISTRY`)
- `data/enemies.js`: 敵DB (`ENEMY_REGISTRY`)
- `data/characters.js`: 統一キャラDB (`CHAR_REGISTRY`、`DEBUFF_KEYS`/`buffCount` 同梱)。`src/app.js` からの循環インポートを持つが、関数内での遅延評価に限定することでTDZを回避。

### 3. `src/` 配下 (エンジン・UI層 / ESM)
- `src/constants.js`: ゲーム定数と、乗算補正および減衰上限などを管理する定数 `DMG`。他モジュールへの依存を持たない葉モジュール。
- `src/sim.js`: シミュレーターコアエンジン。`class Sim`（状態管理、`tick`, `burst`, `use` メソッド、減衰計算等）、およびビーム探索やルート選抜ロジック（`cmpVec`, `_candidates`, `_stepStatic`, `_runRootPlan`, `_selectRootPrefixes` 等）を収録。
- `src/worker.js`: Web Workerの背景並列計算用エントリポイント。`src/app.js` 等からシミュレータコアをインポートして並行実行。
- `src/app.js`: UIバインディング、Web Worker管理プール、リプレイモード、INIT処理を含むメインエントリ。

---

## 開発ルール & 不変条件

### 1. キャラクター追加・変更の原則
- **`CHAR_REGISTRY`（data/characters.js）が唯一の編集先。** エンジン本体（`class Sim`）にキャラ名リテラルを記述しない。
- **⚠ 循環参照回避ルール**: `data/characters.js` のオブジェクトリテラルの**トップレベル即時評価フィールド**（例: `gmax`）で `BG`/`DMG`/`GEAR` を直接参照してはならない（TDZ / 循環死によるUI全消失の原因）。ゲージ上限は素の数値で持つ（100=`BG.other_max`）。**関数本体（`cands.exec`/`def`フック）内の参照は遅延評価のため安全**。
- キャラ固有状態は `state` に宣言（Simが snap/clone/init で自動同期）。
- 累積アサルトやバーストプラス等の状態は、クローン時の参照共有を防ぐため、オブジェクトではなく**フラットな数値変数**として `state` に宣言すること。
- **毎ターン自動デクリメントする残ターン系state**（ロボ残T・ムーンコード等）は `tickStates: ['key', ...]` を宣言（`buildFormation`が`TICK_STATES`へ集約し`tick()`が汎用処理）。
- **キャラ固有の反応・マイルストーン処理は汎用フックに記述**（エンジンに分岐を足さない）: `def.onAbility(sim,name,color,T)` / `def.onPartyBurst(sim,owner,T,atk)` / `def.onBurst(sim,atk,owner)` / `def.turnEnd(sim,T)`。フックは`CHARS`順で全キャラ走査され、不在編成では未宣言として自然スキップ。

### 2. 確定仕様・設計不変条件
- **ジャッジ即発動**: cd.judg=0になり次第即発動。同ターン上限 `judgCap = 5 + (開始時cd===0?1:0)`。
- **コヴァレント・アルカナ**: アビ12回 / バースト2回ごとにproc発火。連理魔力+1 ＆ ジャッジCD=0を同時付与。同ターン5回上限。
- **モビウスムーンズ**: パーティ全体のバースト5回ごとに、ヘカテーの全アビCDをリセット。
- **イフィシャント早撃ち抑止**: `IFISHANT_MIN_CD = 3`（CD中アビが3つ未満は使用不可）。
- **ロワ・クモンドの3枠加算**: 通常（`roy_na_frac`）、アビ（`roy_abi_frac`）、バースト（`roy_burst_frac`）をそれぞれ独自枠加算。
- **Phase3-1 事前計算マップ（ホットパス高速化・実装済）**: `buildFormation` で `ABIL_KEYS`/`ABIL_KC`/`ABIL_CANDS`/`ABIL_BASE_S` を一度だけ構築し、`_stepStatic`/`_candidates` が `Object.entries(ABIL)`・ネスト参照・`computeBaseScore` 再計算をせず `ABIL_KEYS` を1パス走査する。**⚠不変条件**: 走査順は `ABIL` 挿入順（=`Object.keys`順）でタイブレークは厳密 `>`（先頭最大）。キャラ追加・`abilities`/`cands` 変更時はこのマップ構築を経由するため自動追従するが、**走査順や `>` 比較を崩すと最適押し順の選択がズレる**（ゴールデン値 raw 174,253,492 / calibrated 191,141,005 で検証すること）。
- **ESM Worker起動規律**: 旧 `_buildWorkerCode`（文字列 slice）は廃止済み。Worker は `new Worker(new URL('./worker.js', import.meta.url), {type:'module'})` で起動。**`src/app.js` の worker 用 export に必要な探索関数（`buildFormation`, `recalcGearK`, `Sim`, `_runRootPlan` 等）を含めること**。UI/DOM 依存は INIT の `if(typeof document!=='undefined')` ガード内・window ブリッジに隔離すること。
- **2段ルート選抜（①-A・実装済）**: `runSim`/`_fallbackRunSim` は `enumerateRootPrefixes()` の全prefixを `_staticPrefixDmg`（静的greedy・約数ms）で安価採点し、上位 `PREFIX_TOPK`(=10) 本のみ本選(BW128)へ回す（`_selectRootPrefixes`）。空prefixは常に確保。**品質低下は PoC 実測で最大0.013%**。新キャラ追加時は PoC（scratchpad `poc.js`）を再実行し `PREFIX_TOPK` の余裕を再確認する。

### 3. Git 開発ワークフロー (強制ルール)
- **作業開始時**
  1. `git checkout main` で main に切り替え、`git pull origin main` を実行。
  2. 作業用ブランチを切って開発を開始。
- **検証 (作業完了時)**
  - 必ず `npm run test:golden`（期待値: raw 174,253,492 / calibrated 191,141,005）を実行しパスを確認。
- **反映・プッシュ**
  - コミット後、`main` に戻って `pull`、作業ブランチをマージし、再度検証テストをパスして `git push origin main`。不要な作業ブランチは削除。

### 4. 実機乖離・最適順序不整合の改善フロー
シミュレーターの計算値やアビ実行順序が実機と乖離した場合は、`simulation/simNN/` に分析結果を蓄積し、ドキュメントをハブにして解決する。
1. **リプレイ照合**: 「リプレイモード」に実機手順を入力し、乖離の発生起点を特定。実測を `simNN/raw_data.md` に、replay画面は `simNN/replay_screenshots.md` へテキスト転記。
2. **課題のDB化**: [CALIBRATION_ANALYSIS.md](file:///c:/Users/Kanta%20Miyanaga/kamipro/CALIBRATION_ANALYSIS.md) のバックログ（Cx）に追記。
3. **計画・検証策定（Antigravity 主担当）**: 設計担当が原因特定し、`simNN/design_report.md` を**必須5節構成**（1.総合比較 / 2.敗北要因 / 3.乖離分析 / 4.影響度検証 / 5.引継ぎ）で作成。
4. **自律修正とテスト**: 実装担当（Claude Code）が `design_report.md` を検証して `simNN/integrated_analysis.md` にまとめ、コード修正後テスト実行。期待値 `raw 174,253,492 / calibrated 191,141,005` と追加検証ケースのパスを確認。

---

## 検証方法

リファクタリング・機能追加後は、以下でゴールデン値の一致を確認すること。

```bash
npm run test:golden          # = node test/golden.mjs（src/app.js を import し10T総ダメージを検証）
```

**期待値**（C15 案(c) 自動較正の production 化に伴い 2026-07-02 更新）:
- FullBurst: `10/10`
- TotalDmg（raw・較正なし＝①funki修正モデル）: `174,253,492`
- TotalDmg（**calibrated**・自動較正 `{judg:130}` 適用＝production 出荷値）: `191,141,005`

> 探索は `runSim` 実行時に config別に静的スコア s を自動較正する（`calibrateStaticScores`・proxy-shortlist+full-verify・単調安全）。golden.mjs は決定的検証のため較正結果 `{judg:130}` を `setStaticOverride` で明示適用する（毎回の較正走行を避ける）。詳細 SEARCH_ROLLOUT_DESIGN.md §6。

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
- **バックログ状態**: C1=open / C2=open / C3=investigating / C4=fixed / C5=fixed / C6=wontfix / C7=deferred / C8=fixed / C9=fixed / C10=Phase5昇格 / C11=fixed / C12=fixed (案C＝ビーム多様性枠で定石枝を保持、④b＝tenyaをatomicとreに分割しinterleave化、②定石タイブレーク) / **C13=fixed（リプレイ往復スキップ=tenya_re・commit済）/ C14=fixed（①funki解禁バグ＝毎ターン化を恒久実装・C15較正とセット確定）/ C15=investigating（探索rolloutポリシー脆弱性＝本丸。案(c)自動較正を production 実装＝§6・judg 1次元）**。現ゴールデン値=**raw 174,253,492 / calibrated（自動較正 {judg:130}）191,141,005**（SEARCH_ROLLOUT_DESIGN.md §6）。

---

## 現在の進行状況（引き継ぎ用・2026-06-27）
- **現フェーズ**: Phase 4 = **turn-by-turn ホライズン較正（B案）**。
- **較正ボス**: `walpurgis_loki`（ヴァルプルギス・ロキ・Lv160 ANONYMOUS）。
- **sim02 進行中**（C1ホライズン拡張・T2〜）:
  - 試行1=実機勘(Manual)押し順の実機データ=`raw_data.md`。
  - 同一Manual順のシムreplay=`replay_screenshots.md`。
  - ユーザー所感=`user_notes.md`。
  - **試行2=シム推奨順の実機データ=取得中**。
  - **総合分析(`integrated_analysis.md`)は最後**＝試行2の格納完了かつ全体矛盾なし確認後に着手（現状未着手）。
