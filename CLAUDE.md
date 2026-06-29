# 神姫PROJECT R — バーストトラッカー 開発ガイド

## 概要
`index.html`（UI・ロジック）と `data/` 配下の外部DBファイル群（武器・幻獣・敵・キャラ）で構成される、バースト編成シミュレーター＆最適押し順トラッカー。外部ビルド不要で、直接ブラウザで動作。

## ドキュメント体系（Antigravityエージェントとの共有用）
- **CLAUDE.md**（本書）: 生きた開発ガイド。コード地図・開発ルール・確定仕様・検証方法・実機較正ステータス。**現状の一次情報**。
- **.agents/AGENTS.md**: Antigravity（Gemini）エージェント用のルール／ガイドライン定義。開発不変条件（ロード順・Workerコード抽出のフリーズ回避等）・Gitワークフロー・検証ゲート（175,023,298）を規定。
- **archive/PERF_NOTES.md**: 探索エンジン高速化の調査・実装・採否判断の台帳（待ち時間の支配式・実装済み施策D/E/①-A・路線①PoC実測・WASMの位置づけ降格）。性能面の過去の一次台帳。
- **BEAM_SEARCH_DESIGN.md**: 探索エンジンの**準最適性（C9）設計レポート**（5節構成）。ビーム幅32の枝刈り不足で「バフ/デバフ先・ダメージアビ後」最適枝を取りこぼす件の原因分析・実測台帳（greedy/BW32/64/128/C2比較・非単調の崖）・修正候補（②賢い枝刈り推奨）。索引は CALIBRATION_ANALYSIS.md C9。
- **ORDER_OPTIMIZATION_DESIGN.md**: 押し順最適化の精緻化（**C12＝C9-②「賢い枝刈り」本設計**）。sim2押し順の5症状（amplifa表示/effond先行/judg空転/hecate順/tenya分割）の根本原因と設計案（僅差タイブレークに定石性スコア・tenya多段分割等）・段階実装計画。索引は CALIBRATION_ANALYSIS.md C12。
- **CALIBRATION_ANALYSIS.md**: 実機較正の確定値＆**根拠アーカイブ**（なぜその値・枠か）。較正・英霊武器は実装済み。
- **archive/PHASE2_PLAN.md**: Phase 2（汎用化）完了計画（アーカイブ退避済み）。
- **archive/PHASE3_PLAN.md**: Phase 3（高速化）**完了・クローズ**。Phase3-1（アロケフリー化）/D（死コード除去）/E（clone二重コピー排除）/①-A（2段ルート選抜）まで実装し準備時間を大幅短縮。性能の過去台帳は archive/PERF_NOTES.md。
- **PHASE4_PLAN.md**: Phase 4（実機較正の反復＝**現行フェーズ**）の進め方台帳。**押し順優先**・序数比較ハーネス・「押し順は蓄積誤差に頑健、系統誤差だけを狙う」方針・乖離バックログ駆動を規定。§5.5 に Phase4で判明した重大エンジン改善（C8/C9）の履歴。
- **PHASE5_PLAN.md**: Phase 5（**探索UX刷新＝待機画面の本格リニューアル**）の計画台帳。C9のBW128化で探索が重くなった緩和策（進捗可視化・ETA・中断・演出／4段実装）。UX専任で火力モデル・ゴールデン値(175,023,298)は不変。⚠Workerコード抽出不変条件に注意。起点はバックログC10。
- **enemies/**: 敵DB intake ディレクトリ。`enemies/README.md`（命名・追加手順・スキーマ）＋ `TEMPLATE.md` ＋ `<key>.md`（実機詳細＝根拠）。`data/enemies.js` の `ENEMY_REGISTRY` がそこから蒸留した現在値。Phase4較正ボス `walpurgis_loki`（ヴァルプルギス・ロキ）を登録（PHASE4_PLAN §7 のPhase6前倒し・1体のみ）。
- **simulation/**: Phase 4 の試行データ蓄積ディレクトリ。`simulation/README.md`（命名規約・ワークフロー・**較正カデンツ=turn-by-turnホライズン**・履歴管理の原則）＋ `TEMPLATE/`（新試行の雛形）＋ `simNN/`（1試行=1サブフォルダ: `raw_data.md`実機原本 / `replay_screenshots.md`シムreplay転記 / `design_report.md`設計レポート（設計担当＝主にAntigravity・**必須5節構成**）/ `integrated_analysis.md`統合分析（実装担当＝主にClaude Code・検証+回帰+Phase方針）/ `user_notes.md`ユーザー所感（仮説の種）/ `README.md`要約）。**新試行は `cp -r simulation/TEMPLATE simulation/simNN` で開始**。
- **ROADMAP.md**: 長期ビジョン（敵行動・味方生存＝**Phase 6**・旧Phase5からリネーム）＋新キャラ導入ワークフロー構想。Phase 4 定義は PHASE4_PLAN.md、Phase 5（UX刷新）は PHASE5_PLAN.md が一次。
- **archive/BRANCH_WORKFLOW.md**: ブランチ運用メモ。`main` を恒久トランク化し、節目で作業ブランチを集約・削除する手順と注意点（ブランチ乱立の防止）。
- 参照ツール（非計画書）: `archive/tools/*.js`（T1較正スクリプト）。
  - ※旧 `damageCalculator.txt`（計算式）/ `database.txt`（実機スナップショット）/ `*.xlsx` は削除済み。計算式は `DMG` 定数＋index.html冒頭コメントに、実機表示値は index.html の `DISPLAY_ATK_OVERRIDE`/`DISPLAY_HP_OVERRIDE` に反映済み。

## ファイル構成 & コード地図 (index.html: 約2240行・行番号は目安)
- `data/weapons.js`: 武器マスターDB (`WEAPON_MASTER`)
- `data/summons.js`: 幻獣マスターDB (`SUMMON_REGISTRY`)
- `data/enemies.js`: 敵DB (`ENEMY_REGISTRY`)。スキーマ: `label/def/max_hp/element/affinity(任意・指定時applyEnemyがDMG.affinity上書き)/limit`。実機詳細の根拠は `enemies/<key>.md` を正とし本jsは現在値。新規追加は `enemies/README.md`（命名: キー=ファイル名=snake_case）。
- `data/characters.js`: 統一キャラDB (`CHAR_REGISTRY` に統一済み。旧 `SUB_REGISTRY` のサブアシストは `subAssists` フィールドへ統合・フレイヤ等。`DEBUFF_KEYS`/`buffCount` 同梱)

### index.html コード地図（行番号は目安）
| 範囲(行) | 内容 |
|---|---|
| 7–209 | CSS |
| 210–282 | HTML構造 |
| 283–288 | 外部JSファイル読込 (`weapons`/`summons`/`enemies`/`characters`) |
| 289–302 | ゲーム定数（確定仕様・後述） |
| 303–493 | **`DMG`**（火力モデル定数） |
| 494–619 | **`GEAR`**（装備設定）＋表示ステータス計算 |
| 620–711 | 編成グローバル ＋ `buildFormation()` 構築処理 |
| 712–1148 | **`class Sim`** エンジン（tick, burst, use, _na, ロールアウト/ビーム探索。Phase2でprocR削除・キャラ反応はDB側フックへ移管）＋ `cmpVec`/`enumerateRootPrefixes` |
| 1149–1332 | リプレイモード |
| 1333–1453 | UI helpers (`AUTO SIM`含む) |
| 1454–1691 | Web Worker プール・並列探索 (`_buildWorkerCode`含む) |
| 1692–2119 | 各種UI（編成・装備・保存） |
| 2120–末尾 | INIT |

---

## 開発ルール & 不変条件

### 1. キャラクター追加・変更の原則
- **`CHAR_REGISTRY`（data/characters.js）が唯一の編集先。** エンジン本体（`class Sim`）にキャラ名リテラルを記述しない。
- **⚠ ロード順不変条件**: `data/*.js` は index.html のインライン定数（`BG`/`DMG`/`GEAR`）より**前**に読み込まれる。そのため**オブジェクトリテラルの即時評価フィールド**（例: `gmax`）に `BG`/`DMG`/`GEAR` を参照してはならない（`ReferenceError` でファイル全体が落ち `CHAR_REGISTRY` 未定義→**UI全消失**）。ゲージ上限は素の数値で持つ（100=`BG.other_max` / 200=`BG.yamato_max`）。**関数本体（`cands.exec`/`def`フック）内の参照は遅延評価のため安全**。
- キャラ固有状態は `state` に宣言（Simが snap/clone/init で自動同期）。
- 累積アサルトやバーストプラス等の状態は、クローン時の参照共有を防ぐため、オブジェクトではなく**フラットな数値変数**として `state` に宣言すること。
- **毎ターン自動デクリメントする残ターン系state**（ロボ残T・ムーンコード等）は `tickStates: ['key', ...]` を宣言（`buildFormation`が`TICK_STATES`へ集約し`tick()`が汎用処理）。
- **キャラ固有の反応・マイルストーン処理は汎用フックに記述**（エンジンに分岐を足さない）: `def.onAbility(sim,name,color,T)`=全アビ使用反応（ロボ反応・連理魔力・闘気等） / `def.onPartyBurst(sim,owner,T,atk)`=全バースト反応（モビウス・連理魔力burst側） / `def.onBurst(sim,atk,owner)`=自バースト / `def.turnEnd(sim,T)`=ターン終了（タイマー進行等）。フックは`CHARS`順で全キャラ走査され、不在編成では未宣言として自然スキップ。

### 2. 確定仕様・設計不変条件
- **ジャッジ即発動**: cd.judg=0になり次第即発動。同ターン上限 `judgCap = 5 + (開始時cd===0?1:0)`。
- **コヴァレント・アルカナ**: アビ12回 / バースト2回ごとにproc発火。連理魔力+1 ＆ ジャッジCD=0を同時付与。同ターン5回上限。
- **モビウスムーンズ**: パーティ全体のバースト5回ごとに、ヘカテーの全アビCDをリセット。
- **イフィシャント早撃ち抑止**: `IFISHANT_MIN_CD = 3`（CD中アビが3つ未満は使用不可）。
- **ロワ・クモンドの3枠加算**: 通常（`roy_na_frac`）、アビ（`roy_abi_frac`）、バースト（`roy_burst_frac`）をそれぞれ独自枠加算。
- **Phase3-1 事前計算マップ（ホットパス高速化・実装済）**: `buildFormation` で `ABIL_KEYS`/`ABIL_KC`/`ABIL_CANDS`/`ABIL_BASE_S` を一度だけ構築し、`_stepStatic`/`_candidates` が `Object.entries(ABIL)`・ネスト参照・`computeBaseScore` 再計算をせず `ABIL_KEYS` を1パス走査する。**⚠不変条件**: 走査順は `ABIL` 挿入順（=`Object.keys`順）でタイブレークは厳密 `>`（先頭最大）。キャラ追加・`abilities`/`cands` 変更時はこのマップ構築を経由するため自動追従するが、**走査順や `>` 比較を崩すと最適押し順の選択がズレる**（ゴールデン値 175,023,298 で検証すること）。詳細は archive/PHASE3_PLAN.md §1.4 / PERF_NOTES.md。高速化はその後 D（死コード除去）・E（clone二重コピー排除）・①-A（2段ルート選抜）まで実施済み。WASM化（per-op）は最終手段に降格（PERF_NOTES.md §5）。
- **⚠ Workerコード抽出不変条件**: `_buildWorkerCode` は `<script id="engine-code">` の **`textContent`**（`innerHTML`は不可＝`<`/`>`/`&`をHTMLエスケープしWorker構文エラー）を取得し、**必ず `// ===== ゲーム定数` 〜 `// ===== UI HELPERS` 直前へ slice** して Worker へ渡す。slice を外して全文を渡すと UI/INIT の `document` 参照が Worker 読込時に `ReferenceError` を投げ、`onerror`→メインスレッド同期フォールバックで**ページがフリーズ**する。Worker が必要とする関数（`recalcGearK`/`buildFormation`/`Sim`/`enumerateRootPrefixes`/`_runRootPlan`/`_runBaselinePlan` 等）は全て `UI HELPERS` マーカーより前＝エンジン領域内に置くこと。検証は scratchpad の worker 再現スクリプト（`document` 無しサンドボックスで `init`→`root`→`baseline` が 175,023,298 を返すか）に準拠。
- **2段ルート選抜（①-A・実装済）**: `runSim`/`_fallbackRunSim` は `enumerateRootPrefixes()` の全prefixを `_staticPrefixDmg`（静的greedy・約数ms）で安価採点し、上位 `PREFIX_TOPK`(=10) 本のみ本選(BW128・C9で32→128)へ回す（`_selectRootPrefixes`）。空prefix（単一ビーム＝回帰基準）は常に確保。**品質低下は PoC 実測で最大0.013%**（押し順・火力指数グレードに不可視・K10は静的top8の上位集合で単調保証）。ゴールデン値ワンライナーは単一 `takeTurn` でこの選抜を経由しないため不変。**⚠ 新キャラ追加・`abilities`/`cands` 変更時は PoC（scratchpad `poc.js`）を数形成で再実行し `PREFIX_TOPK` の余裕を再確認**（真の勝者が上位Kから外れると品質が落ちる）。詳細は PERF_NOTES.md §4。

### 3. Git 開発ワークフロー (強制ルール)
エージェントはタスクを開始・完了する際、ファイルの競合や欠損を防ぐために必ず以下の手順を実行すること。

- **作業開始時**
  1. `git checkout main` で main ブランチに切り替える。
  2. `git pull origin main` を実行し、常に最新の main を基点とする。
  3. Claude Code が自動作成した作業ブランチ（または明示的に切った作業ブランチ）へ移動して開発を開始する。
- **検証 (作業完了時)**
  - 必ず `検証方法` にあるワンライナーテストを実行し、テストが通ることを確認する。
- **反映・プッシュ**
  1. テスト成功後、変更をコミットする。
  2. `git checkout main` で main に戻り、再度 `git pull origin main` で最新変更を取り込む。
  3. 作業ブランチを main にマージ（`git merge <作業ブランチ名>`）する。競合が生じた場合は自律的に解決すること。
  4. マージ後、再度検証テストが通ることを確認し、`git push origin main` でプッシュする。
  5. プッシュ完了後、不要になった作業ブランチを削除する。

### 4. 実機乖離・最適順序不整合の改善フロー
シミュレーターの計算値やアビ実行順序が実機と乖離した場合は、チャットでの細かな往復を避け、以下の手順でドキュメントをハブにして自律解決すること。各試行のデータ・分析は **`simulation/simNN/` に蓄積**する（`simulation/README.md` 参照。新試行は `cp -r simulation/TEMPLATE simulation/simNN`）。
1. **リプレイ照合**: ユーザー又はエージェントは `index.html` の「リプレイモード」に実機手順を入力し、乖離の発生起点（ターン・バフ・ロボ・ダメージ等）を特定する。実測は `simNN/raw_data.txt`（原本・加工禁止）、リプレイ画面は `simNN/replay_screenshots.md` へテキスト転記する（画像バイナリは保存しない）。
2. **課題のDB化**: 乖離の詳細（対象キャラ/アビ/ターン/実機挙動/シム誤挙動）を [CALIBRATION_ANALYSIS.md](file:///c:/Users/Kanta%20Miyanaga/kamipro/CALIBRATION_ANALYSIS.md) のバックログ（Cx）に追記する。
3. **計画・検証策定**: 設計担当（主に Antigravity）が不整合の原因を特定し、`simNN/design_report.md` を**必須5節構成**（1.総合比較 / 2.敗北要因 / 3.乖離分析 / 4.影響度検証 / 5.引継ぎ）で作成する。
4. **自律修正とテスト**: 実装担当（主に Claude Code）が `design_report.md` を検証して `simNN/integrated_analysis.md`（較正案・回帰影響・Phase方針所見・結論）にまとめ、コードを修正し、テストを実行。期待値（`175,023,298`）と追加テストケースの双方をアサートして完了する。

### 5. ドキュメント・レガシーファイルの管理ルール
AIエージェントのコンテキスト節約と古い仕様の誤認防止のため、以下のルールを遵守すること。
* **生きたガイドへの集約**: 開発上の確定仕様や決定経緯（棚上げの理由など）は、[CLAUDE.md](file:///c:/Users/Kanta%20Miyanaga/kamipro/CLAUDE.md) に適宜要約して集約する。
* **完了済み計画書の退避**: Phaseが完了し不要となった過去の計画書（例：`PHASE2_PLAN.md` など）は、プロジェクトルートに残さず、`archive/` ディレクトリ（例：[archive/PHASE2_PLAN.md](file:///c:/Users/Kanta%20Miyanaga/kamipro/archive/PHASE2_PLAN.md)）へ速やかに移動（退避）させる。
* **simNN試行の履歴管理（凍結スナップショット・現在値分離）**: 較正の変更履歴はコード差分＝git、根拠＝`simulation/simNN/` に二重保全済み。**処理変更用の archive MD は新たに作らない**（三重化＝肥大の原因）。`simNN` はクローズ後 retro編集しない凍結スナップショット、**現在値はコード＋CALIBRATION_ANALYSIS.md のみを正**とし、後続が旧結論を上書きした時だけ旧 `simNN/README.md` に前方ポインタ1行を足す。詳細は `simulation/README.md`「履歴管理の原則」。

## 検証方法
リファクタリング・機能追加後は、Node.jsで以下のワンライナーを実行し、既存の検証基準値と一致することを確認すること。

```bash
node -e "const fs = require('fs'); const html = fs.readFileSync('index.html', 'utf8'); let fullCode = ''; fullCode += html.slice(html.indexOf('// ===== ゲーム定数'), html.indexOf('// ===== 概算火力モデル定数')); fullCode += '\n' + fs.readFileSync('data/weapons.js', 'utf8'); fullCode += '\n' + fs.readFileSync('data/summons.js', 'utf8'); fullCode += '\n' + fs.readFileSync('data/enemies.js', 'utf8'); fullCode += '\n' + fs.readFileSync('data/characters.js', 'utf8'); fullCode += '\n' + html.slice(html.indexOf('// ===== 概算火力モデル定数'), html.indexOf('// ===== UI HELPERS')); fullCode += '\nglobalThis.Sim=Sim;globalThis.buildFormation=buildFormation;'; (0, eval)(fullCode); globalThis.buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']); const sim = new globalThis.Sim(); let fb = 0; for (let t = 1; t <= 10; t++) { const r = sim.takeTurn(t); if (r.full) fb++; console.log('T' + t, 'FB:' + r.atk.length, 'dmg:' + Math.round(r.dmg)); } console.log('FullBurst:', fb + '/10', 'TotalDmg:', Math.round(sim.dmg));"
```

**期待値（基準・フォールバック抽象スケール）**:
- FullBurst: `10/10`
- TotalDmg: `175,023,298`

---

## 実機較正ステータス（詳細は CALIBRATION_ANALYSIS.md 参照）
- **確定パラメータ**:
  - バースト係数: ヤマト/ヘカテー/テトラ = 5.0/2500, エレイン = 5.5/3000
  - `burst_inori`: +5.0 (現神の祈り中上限cap2倍化 is 無し)
  - 追加ダメージ倍率: ヤマト/ヘカテー/テトラ(HELIX前) = 3倍/100万(実機較正・sim01 C5), テトラ(HELIX後) = 6倍/100万(推定), エレイン = 2倍/80万(実機較正・sim01 C5)
  - 追加ダメージフレーム: **アビ枠 (`'abi'` / 減衰率 0.04)**
  - エレインバースト追加: 常時1回、契晶80以上で3回発動
  - エジソン英霊武器追加ダメ: 2.5倍/80万 (アビ枠・onBurst実装済み)
  - **ヤマト1アシ バーストダメージプラス: +10万/stack・味方全体のバースト対象 (C8・`burstPartyPassive`・自分のみは誤りだった)**
  - **ナイツサプレス(エレイン3): バーストダメ+20%・非累積(refresh)・2T (C11・有効中は再発動しないguard＝隔ターン発動。length累積は誤りだった)**
- **バックログ状態 (一次は CALIBRATION_ANALYSIS.md §4)**: C1=open(turn-by-turnホライズンがHELIXターン到達≈sim06-07で確定・逆算式は台帳に退避) / C2=open低優先 / C3=investigating / C4=fixed / **C5=fixed(追撃上限100万/80万・ユーザー承認)** / **C6=wontfix(2T総和最大化案・却下)** / **C7=deferred(較正ボスの2フェーズ被ダメ未モデル化・較正時は手補正)** / **C8=fixed(ヤマト1アシ+10万を味方全体化・ゴールデン値92,031,195→154,711,673・ユーザー承認2026-06-28)** / **C9=fixed(ビーム幅BW32→128・「バフ/デバフ先・ダメージアビ後」最適枝の取りこぼし解消・ゴールデン値154,711,673→162,398,625・約4倍重・ユーザー承認2026-06-28・詳細BEAM_SEARCH_DESIGN.md)** / **C10=Phase5昇格(探索中の待機画面の本格刷新・PHASE5_PLAN.md)** / **C11=fixed(ナイツサプレス非累積化＝有効中は再発動しないguard・ゴールデン値162,398,625→150,445,920・実機確認Q2:a 2026-06-28)** / **C12=fixed(順序最適化群・2026-06-29。案C＝ビーム多様性枠で定石枝を保持＋純ダメージ選択=ダメージ単調: 150,445,920→155,756,325・+3.5%generic/+0.8%強。④b＝tenyaをatomic→初回+再発動(tenya_re)に分割しinterleave可能化: 155,756,325→175,023,298・+12.4%generic/+0.17%強。残:②exact-tie定石タイブレーク=表示の定石化(同ダメージ時のみ・golden安全)・無駄リキャスト減点)**。現ゴールデン値=**175,023,298**。

---

## 現在の進行状況（引き継ぎ用・2026-06-27）
- **現フェーズ**: Phase 4 = **turn-by-turn ホライズン較正（B案）**。sim毎にホライズンを1ターン前進し、各ターンで**系統誤差/序数のみ**を潰す（絶対総和は追わない＝PHASE4_PLAN §2/§3.5）。
- **較正ボス**: `walpurgis_loki`（ヴァルプルギス・ロキ・Lv160 ANONYMOUS）。**affinity=1.5(光→幻=有利・実機確定/急所発動で裏付)・def=10暫定(要複数実機で確定)・HP=9.8億(実機)**。⚠**HP依存2フェーズ被ダメ**: HP>50%=30%カット(与ダメ×0.7)/HP50%「ファントムリリース」後=被ダメ+20%(×1.2)。**現行シム未モデル化(C7)→絶対逆算時は手補正・測定ターンのボスHP%必須**。詳細 `enemies/walpurgis_loki.md`。
- **sim02 進行中**（C1ホライズン拡張・T2〜）:
  - 試行1=実機勘(Manual)押し順の実機データ=`raw_data.md`（T1〜T7・**実機ログがダメージ事象の正**）。
  - 同一Manual順のシムreplay=`replay_screenshots.md`（replayは全アビ押下を含む／**T2はユーザー確定で6/3＝実機ログが正**・チップ列の当方転記は×5/×2の誤りでダメージ行動はraw_data.md参照）。
  - ユーザー所感=`user_notes.md`（手動ロス: T2/4/6エレイン3不要再発動・JD空転・HELIX撃ち忘れ／シム乖離候補: エレイン3の2T継続をシムが正しく扱うか）。
  - **試行2=シム推奨順の実機データ=取得中**。
  - **総合分析(`integrated_analysis.md`)は最後**＝試行2の格納完了かつ全体矛盾なし確認後に着手（現状未着手）。
