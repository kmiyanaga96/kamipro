# 神姫PROJECT R — バーストトラッカー エージェントルール

このファイルは、Antigravity（Gemini）エージェントが本リポジトリで安全かつ規約に則って開発を行うためのルールとガイドラインを定義しています。

> **現在の進行状況の一次情報は [CLAUDE.md](../CLAUDE.md)「現在の進行状況（引き継ぎ用）」**を参照（Phase4=turn-by-turn較正・較正ボス walpurgis_loki・sim02進行中・総合分析は試行2完了後）。本書は不変ルール集。

## 開発不変条件・ルール

### 1. キャラクター追加・変更の原則
> ⚠ **Phase5 S5（2026-06-30）で Vite/ESM 構成へ移行済み**：`index.html`=薄いシェル、エンジン＝`src/app.js`（class Sim 等）、Worker＝`src/worker.js`、`data/*.js`=ESM、`package.json`=`type:module`。一次情報は [VITE_MIGRATION.md](../VITE_MIGRATION.md)。以下のルールは新構成で読み替える。

* **キャラクター情報の編集先**:
  * [data/characters.js](../data/characters.js)（`CHAR_REGISTRY`）が唯一の編集先です。
  * エンジン本体（`src/` 配下の `class Sim` 等）に、特定のキャラクター名のリテラルや個別処理を直接ハードコードしてはいけません。
* **ロード順／循環importの制限 (ReferenceError 回避)**:
  * `data/characters.js` は `../src/app.js` から `DMG`/`BG`/`GEAR`/`CHARS`/`ABIL`/`ownerOf` 等を **import** します（`app.js` も `data` を import＝相互循環）。
  * この循環は**参照が全て関数本体（`cands.exec`/`def` フック）＝遅延評価**である限り安全に解決します。
  * そのため `data/*.js` のオブジェクトリテラルの**即時評価フィールド**（例: `gmax`）で `BG`/`DMG`/`GEAR` を参照してはなりません（トップレベル即時参照は TDZ/循環死の原因）。素の数値で持つこと（100=`BG.other_max`）。
* **Worker の制限 (ESM 化済み)**:
  * 旧 `_buildWorkerCode`（inline slice＋`__FUNC__` serialize）は**撤廃済み**。Worker は `src/worker.js`（ESM）を `new Worker(new URL('./worker.js', import.meta.url), {type:'module'})` で起動します。
  * Worker が使う関数（`recalcGearK`/`buildFormation`/`Sim`/`_runRootPlan`/`_runBaselinePlan` 等）は `src/app.js` の **export に含める**こと（worker はそこから import）。registry はモジュール共有のため serialize 不要。
  * UI/DOM 依存コードは Worker で動きません。INIT は `if(typeof document!=='undefined')` ガード内に、`onclick` 用のグローバル関数は window ブリッジに隔離してください（`document`/`window` 参照を worker 到達コードに置かない）。
* **フラットな数値変数としての状態管理**:
  * クローン時のオブジェクト参照共有を防ぐため、キャラ固有の累積値などの状態は、オブジェクトではなく**フラットな数値変数**として `state` に宣言してください。
* **自動進行ターン数管理**:
  * 毎ターン自動デクリメントする残ターン系state（例: バフ残りターン等）は、`tickStates` 配列でキーを宣言し、エンジンの `tick()` で汎用処理されるようにしてください。
* **汎用フックの利用**:
  * キャラ固有の反応やマイルストーン処理は、以下の汎用フックに記述してください：
    * `def.onAbility(sim, name, color, T)`: アビリティ使用時
    * `def.onPartyBurst(sim, owner, T, atk)`: 全バースト発生時
    * `def.onBurst(sim, atk, owner)`: 自身のバースト時
    * `def.turnEnd(sim, T)`: ターン終了時
* **2段ルート選抜と新キャラ追加時の再検証 (品質維持)**:
  * `runSim` は全開幕ルートを静的proxyで採点し上位 `PREFIX_TOPK`(=10) 本のみ本選(BW32)へ回します（`_selectRootPrefixes`）。品質低下は PoC 実測で最大0.013%（押し順・火力指数グレードに不可視）。
  * **新キャラ追加や `abilities`/`cands` 変更時は、PoC（scratchpad `poc.js`: 真値=BW32全探索 vs 静的/BW4 proxy 上位K）を数形成で再実行し、真の勝者ルートが上位Kから外れていないか＝`PREFIX_TOPK` の余裕を必ず再確認してください**（外れると静かに品質が落ちます）。詳細は [PERF_NOTES.md](../PERF_NOTES.md) §4/§6。

### 2. Git 開発ワークフロー（強制ルール）
変更を加える際は、以下の手順を必ず厳守してください。
1. `git checkout main` で main ブランチに移動。
2. `git pull origin main` で最新の main を取得。
3. 作業用のトピックブランチへ移動（または作成）。
4. 実装後、必ず下記の「検証用テスト」を実行し、期待値と一致することを確認。
5. `git checkout main` で main に戻り、再度 `git pull origin main`。
6. 作業ブランチを main にマージし、再度テスト。
7. `git push origin main`。
8. 不要になった作業ブランチを削除。

### 3. 実機乖離・最適順序不整合の改善フロー
シミュレーターの計算値やアビ実行順序が実機と乖離した場合は、チャットでの細かな往復を避け、以下の手順でドキュメントをハブにして自律解決すること。各試行は **`simulation/simNN/` に蓄積**する（`simulation/README.md` の命名規約・テンプレに従う。新試行は `cp -r simulation/TEMPLATE simulation/simNN`）。
1. **リプレイ照合**: ユーザー又はエージェントは `index.html` の「リプレイモード」に実機手順を入力し、乖離の発生起点（ターン・バフ・ロボ・ダメージ等）を特定する。実測は `simNN/raw_data.md`（実機ログ＝**ダメージ事象の正**・加工禁止／replayは全アビ押下を含むためダメージ行動で対応付ける）、リプレイ画面は `simNN/replay_screenshots.md` へテキスト転記する（画像バイナリは保存しない）。
2. **課題のDB化**: 乖離の詳細（対象キャラ/アビ/ターン/実機挙動/シム誤挙動）を [CALIBRATION_ANALYSIS.md](file:///c:/Users/Kanta%20Miyanaga/kamipro/CALIBRATION_ANALYSIS.md) のバックログ（Cx）に追記する。
3. **計画・検証策定（あなた＝Antigravity の主担当）**: 設計担当が不整合の原因を特定し、`simNN/design_report.md` を作成する。
   **必ず以下の5節構成を徹底すること**（節の追加は可、削除・順序変更は不可。雛形=`simulation/TEMPLATE/design_report.md`）:
   1. **総合比較**（2ルートのターン別・累計・手数を表で定量比較）
   2. **なぜその差が出たか（敗北要因）**（リソース制約・操作手数・発動順の構造で説明）
   3. **乖離分析（系統誤差の特定）**（cap/frame/倍率トリガーへ分解し数学的に検証）
   4. **影響度検証（回帰）**（ゴールデン値 175,023,298 への影響を予測・論証）
   5. **引継ぎ（実装申し送り）**（適用すべき `DMG`/`CHAR_REGISTRY` の差分を diff 形式で明示）
4. **自律修正とテスト**: 実装担当（主に Claude Code）が `design_report.md` を検証して `simNN/integrated_analysis.md`（較正案・回帰影響・Phase方針所見・結論）にまとめ、コードを修正し、テストを実行。期待値（`175,023,298`）と追加テストケースの双方をアサートして完了する。

### 4. ドキュメント・レガシーファイルの管理ルール
AIエージェントのコンテキスト節約と古い仕様の誤認防止のため、以下のルールを遵守すること。
* **生きたガイドへの集約**: 開発上の確定仕様や決定経緯（棚上げの理由など）は、[CLAUDE.md](file:///c:/Users/Kanta%20Miyanaga/kamipro/CLAUDE.md) に適宜要約して集約する。
* **完了済み計画書の退避**: Phaseが完了し不要となった過去の計画書（例：`PHASE2_PLAN.md` など）は、プロジェクトルートに残さず、`archive/` ディレクトリ（例：[archive/PHASE2_PLAN.md](file:///c:/Users/Kanta%20Miyanaga/kamipro/archive/PHASE2_PLAN.md)）へ速やかに移動（退避）させる。

### 5. simNN試行の履歴管理（凍結スナップショット・現在値分離・前方ポインタ）
較正の変更履歴は既に二重保全されている（コード差分＝`git`、意思決定・根拠＝`simulation/simNN/`）。
**処理変更を記録する archive MD は新たに作らないこと**（三重化＝MD肥大の原因）。代わりに層の役割を固定する（詳細・表は [simulation/README.md](../simulation/README.md)「履歴管理の原則」）:
* **simNN は凍結スナップショット**: 試行クローズ後は `design_report.md`/`integrated_analysis.md` 等を retro編集しない。後続試行で値が変わっても旧 simNN は当時の記録として残す。
* **「現在値」は simNN から読まない**: 確定値・現行仕様は必ず**コード ＋ CALIBRATION_ANALYSIS.md** を正とする（simNN=歴史、生きたドキュ=現在）。
* **追跡は既存の安い場所で**: 実装結果は `integrated_analysis.md` の実装結果節、状態遷移は CALIBRATION の Cx（open→fixed）、差分は git コミット（`simNN` を参照）。
* **前方ポインタ（唯一の例外）**: 後続試行が旧試行の結論を上書きしたら、旧試行の `README.md` に**1行だけ**前方注記（例: 「⚠ 本試行のC5値は再較正済み。現在値は CALIBRATION_ANALYSIS.md C5 参照」）を足す。analysis 本文は書き換えない。

## 検証用テスト

> ⚠ Phase5 S5 で旧 slice ワンライナーは廃止（`index.html` は薄いシェル・data は ESM）。

リファクタリングや機能追加後は、以下を実行し期待値と一致することを確認してください。

```bash
npm run test:golden      # = node test/golden.mjs（src/app.js を import し10T総ダメージを検証）
# 大きな構造/Worker/ビルド変更時: npm run build（成功・worker別チャンク）／npm run preview で実機確認（ESMは file:// 不可）
```

* **期待値**:
  * FullBurst: `10/10`
  * TotalDmg: `175,023,298`
