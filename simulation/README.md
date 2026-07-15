# Phase 4 シミュレーション試行ディレクトリ

Phase 4（実機較正の反復・押し順優先）は今後も繰り返し行うため、1試行=1サブフォルダで
データと分析を蓄積する。一次方針は [PHASE4_PLAN.md](../PHASE4_PLAN.md)、確定値は
[CALIBRATION_ANALYSIS.md](../CALIBRATION_ANALYSIS.md)、開発不変条件は [CLAUDE.md](../CLAUDE.md)。

## 較正カデンツ（2026-07-12 転換）: 統計的較正 × 反復可能ボス

**sim03 以降は「回数制限のない反復可能ボスバトル」を較正対象とし、統計的較正へ転換**（ユーザー決定）。
- 旧 turn-by-turn ホライズン（sim01=T1・sim02=T2）は「会心の分離測定が実機で不可能＝単一サンプル・会心RNGに脆い」ことへの守りだった。
  反復可能ボスでは **N試行の集計で会心RNGを平均化・非会心アンカーを反復捕捉・会心/急所率を頻度で実測**でき、この制約が解ける。
- 未定量の敵耐性（エンドコンテンツボス・有志検証なし）は**最終ダメに乗る大域スカラ＝形状較正（比/形状ベース）に非依存**。
  絶対レベルは光有利（闇）ボス1体をアンカーに確定 → モデル確定後は各ボスの耐性を実測残差として定量化（副産物）。
  **モデルとボス耐性を同時にfitしない**（識別不能）: 形状→有利ボスでレベル→残差で耐性、の順。
- 序数A/B比較（PHASE4_PLAN §4）も反復により**同一stateでのA/B実測**が可能になる。
- 第1走の詳細プロトコル: [sim03/README.md](sim03/README.md)（装備2config×N試行・有利/中立×会心あり/低の2×2分離）。

## 命名規約
- 試行フォルダ: `simNN/`（ゼロ埋め2桁・連番）。例: `sim01`, `sim02`, …
- 新規試行は `TEMPLATE/` を `simNN/` へコピーして開始する。

```bash
cp -r simulation/TEMPLATE simulation/sim04   # 次の試行を開始
```

## 各試行フォルダの構成（sim03以降・2026-07-12 ユーザー決定の新構造）

各simは **`data/` と `analysis/` に大別**。README・一時ファイルなど分類できないものは simNN 直下に置く。

| パス | 役割 | 責務の境界 |
|---|---|---|
| `data/config.json` | **基本情報JSON**＝使用した編成・押し順・敵・GEAR・per-char表示ATK等をすべて記録（探索キャッシュexport兼用を推奨=dispAtk同梱） | 一次情報・不加工 |
| `data/record_skeleton.md` | **記録スケルトン（各simで唯一のテンプレ・コピー原本）**。複製して `trialNN.md` を作る | 様式定義。sim内の全trialをこれに統一 |
| `data/trialNN.md` | **実機データ原本**（`record_skeleton.md` を複製して作成・加工せず・冒頭にメタヘッダ） | 一次情報・不加工 |
| `analysis/per_trial/trialNN_quant.md` | **単trial定量（中間集計層）**: **trialNN.md 1本のみ**を入力に、そのtrial内の定量集計。命名=`trialNN_quant.md` | trial横断（平均/分散/決定性/max_hp収束）は書かない→rollup。所感・統合も不可 |
| `analysis/per_trial/trialNN_quali.md` | **単trial定性（中間集計層）**: **trialNN.md の所感/観測**を入力に、そのtrialの定性整理。命名=`trialNN_quali.md` | trial横断テーマは書かない→rollup。数値演算・統合も不可 |
| `analysis/quantitative_analysis.md` | **定量まとめ（rollup）**: **per_trial/*_quant 全trial**を入力に**trial横断**集計（決定性・分散・max_hp収束等） | 生trialを再オープンしない・所感/統合を書かない |
| `analysis/qualitative_analysis.md` | **定性まとめ（rollup）**: **per_trial/*_quali 全trial**を入力に**trial横断**テーマ整理 | 数値演算・統合を書かない |
| `analysis/integrated_analysis.md` | **統合分析のみ**: 上記2つの**rollupのみ**に基づく統合。他は行わない | 新規集計・新規所感を持ち込まない（各analysisへ差し戻す） |
| `README.md` | その試行の1ページ要約（結論と次アクションへのインデックス） | — |

> **分析2層構造（sim03以降・コンテキスト有界化）**: **生trial（大）を読むのは per_trial 層だけ**、rollup 以降は小さい per_trial ファイル群のみ読む。
> `trial → per_trial/(trialNN_quant, trialNN_quali) → (quantitative, qualitative) → integrated` の map-reduce。**trial横断分析（決定性/分散/max_hp収束）は rollup 専用**（単trialでは測れないため per_trial には置かない）。

> **sim01・sim02 は旧構造のまま凍結**（`raw_data.md`/`replay_screenshots.md`/`design_report.md` 5節構成/`integrated_analysis.md`）。
> 旧構造・設計レポート5節構成の規定は git 履歴と各simのREADMEを参照。**Antigravity は 2026-07-12 にワークフロー除外済み＝全分析を Claude Code が担当**。

## データ成型の原則（再利用性）
- **生データ（`data/trialNN.md`・`data/config.json`）は不可侵**: 実機測定・設定の原本。verbatim 保全（整形・解釈は analysis/ 側）。**テンプレは `record_skeleton.md` のみ**＝trialNN はこれを複製して作成（複製・push はユーザーが行う）。**sim内のmdフォーマットは record_skeleton に統一必須**。
- **スクショは転記する**: 画像はリポジトリ肥大化と grep 不能のため保存しない。テキスト化すると diff・フィクスチャ化・他試行比較が可能。
- **統計で語る**: 反復試行の平均・分散・実測率を主指標に（会心RNGはアンサンブルで隔離）。序数（A vs B の符号）も反復で直接測る。

## 履歴管理の原則（simNN凍結・現在値分離・前方ポインタ）
ダブルエージェントPJでは履歴を積極的に残すが、**処理変更を記録する archive MD は作らない**。
変更履歴は既に二重に保全されている（コード差分＝`git`、意思決定・根拠＝simNNフォルダ）ため、
専用の履歴MDを足すと三重化し肥大する。代わりに**層の役割を固定**して矛盾と肥大を同時に防ぐ:

| 層 | 役割 | 時間軸 | 編集 |
|---|---|---|---|
| `simNN/`（data / analysis） | その試行**時点**のデータ・分析・実装結果 | **過去の一点（凍結）** | クローズ後は **retro編集禁止** |
| コード（`DMG`/`CHAR_REGISTRY`）＋ CLAUDE.md ＋ CALIBRATION_ANALYSIS.md | **現在の確定状態** | 常に最新 | 都度更新 |
| git commit ＋ CALIBRATION の Cx 行 | 両者を繋ぐ索引（どの試行がどの較正を今どの状態にしたか） | 連続 | append |

ルール:
1. **simNN は凍結スナップショット**: 試行クローズ後は内容を retro編集しない。後続試行で値が変わっても旧 simNN は当時の記録としてそのまま残す。
2. **「現在値」は simNN から読まない**: 確定値・現行仕様は必ず**コード ＋ CALIBRATION_ANALYSIS.md** を正とする。
3. **追跡は新規MDでなく既存の安い場所で**: 実装結果は simNN/analysis/integrated_analysis の「実装結果」節、状態遷移は CALIBRATION の Cx、変更差分は git コミット（メッセージで `simNN` を参照）。**新たな archive/履歴MDは作らない。**
4. **前方ポインタ（唯一足す例外）**: 後続試行が旧試行の結論を**上書き**したら、旧試行の `README.md` に**1行だけ**前方注記を足す（analysis 本文は書き換えない）。

## ワークフロー（1試行の流れ・新構造）
1. `TEMPLATE/` をコピーして `simNN/` を作成。測定設計（必要データ・分離手段・前提）を `README.md` に先に固める。
2. `data/config.json`（探索キャッシュexport）を格納 → `data/record_skeleton.md` を整備 → 実機試行毎に **record_skeleton を複製して `data/trialNN.md`** を追加（複製・push はユーザー）。
3. **per_trial（中間集計層・trial毎）**: 各 `data/trialNN.md` を入力に `analysis/per_trial/trialNN_quant.md`（数値のみ）と `analysis/per_trial/trialNN_quali.md`（言語のみ）を作成（**1 trial ずつ＝入力小**）。
4. `analysis/quantitative_analysis.md`（rollup）: **per_trial/*_quant 全trial**を入力に**trial横断**集計（決定性・分散・max_hp収束・手法/スクリプト明記）。
5. `analysis/qualitative_analysis.md`（rollup）: **per_trial/*_quali 全trial**を入力に**trial横断**テーマ整理。
6. `analysis/integrated_analysis.md`: 上記2つの**rollupのみ**に基づく統合 → 較正案 → **golden への影響を scratchpad で実測** → 結論。
7. 確定した較正は `DMG` / `CHAR_REGISTRY` の宣言的記述として実装し、`CALIBRATION_ANALYSIS.md` のバックログ（Cx）を更新。
8. `simNN/README.md` に結論を1ページ要約。

## 試行一覧
| 試行 | 形成 | 主題 | 結論 / 状態 |
|---|---|---|---|
| [sim01](sim01/README.md) | エジソン＋ヤマト/ヘカテー/テトラ/エレイン（vs 84M木人） | シム推奨 vs 実機勘の優劣＋バースト追撃減衰上限の較正（C5） | **C5実装済み**（旧構造・凍結） |
| [sim02](sim02/README.md) | 同編成 vs walpurgis_loki | **T2 漸進較正**（turn-by-turn=T2・試行2でT6撃破） | **完了・統合分析済み**（C22クローズ候補/C7撤回/C23 fixed/C24診断/C25・C26。旧構造・凍結） |
| [sim03](sim03/README.md) | 同編成 vs **キャスパリーグ**（`cath_palug`・闇/2T討伐・DB登録済み） | **統計的較正・第1走**（絶対レベル本命＝闇有利×ライトレジスト光非適用・raw較正C25/C5/C3・D×5全深測定撃破） | **プロトコルv3（2026-07-14・boss緊急置換）・実機第1バッチ待ち**。~~フィンブルヴェトルはtrial01全滅で無期限延期~~ |
