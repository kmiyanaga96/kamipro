# simNN — <主題>（テンプレート・sim03以降の新構造）

> **新構造（2026-07-12 ユーザー決定）**: 各simは `data/` と `analysis/` に大別。READMEや一時ファイルなど分類できないものは simNN 直下。
> 開始: `cp -r simulation/TEMPLATE simulation/simNN` → 本READMEの<>を埋める。

- **主題**:
- **較正ボス**:
- **状態**:

## フォルダ構成（固定）

| パス | 内容 | 責務の境界 |
|---|---|---|
| `data/config.json` | **基本情報JSON**＝使用した編成・押し順・敵・GEAR・per-char表示ATK等をすべて記録 | 一次情報。手を加えない |
| `data/record_skeleton.md` | **記録スケルトン（各simで唯一のテンプレ・コピー原本）**。複製して `trialNN.md` を作る | 様式定義。sim内の全trialをこれに統一 |
| `data/trialNN.md` | **実機データ原本**（`record_skeleton.md` を複製して作成・加工せず） | 一次情報。手を加えない |
| `analysis/per_trial/trialNN_quant.md` | **単trial定量（中間集計層）**: `trialNN.md` **1本のみ**を入力にそのtrial内の定量集計。雛形=`trialXX_quant.md` | trial横断（平均/分散/決定性/max_hp収束）は書かない→rollup。所感/統合も不可 |
| `analysis/per_trial/trialNN_quali.md` | **単trial定性（中間集計層）**: `trialNN.md` の所感/観測を入力にそのtrialの定性整理。雛形=`trialXX_quali.md` | trial横断テーマは書かない→rollup。数値演算/統合も不可 |
| `analysis/quantitative_analysis.md` | **定量まとめ（rollup）**: `per_trial/*_quant` **全trial**を入力に**trial横断**集計（決定性・分散・max_hp収束等） | 生trialを再オープンしない・所感/統合を書かない |
| `analysis/qualitative_analysis.md` | **定性まとめ（rollup）**: `per_trial/*_quali` **全trial**を入力に**trial横断**テーマ整理 | 数値演算・統合を書かない |
| `analysis/integrated_analysis.md` | **統合分析のみ**: 上記2つの**rollupのみ**に基づく統合。他は行わない | 新規の集計・新規の所感を持ち込まない（両analysisへ差し戻す） |

> **分析2層構造（コンテキスト有界化）**: `trial → per_trial/(trialNN_quant, trialNN_quali) → (quantitative, qualitative) rollup → integrated` の map-reduce。
> **生trial（大）を読むのは per_trial 層だけ**、rollup 以降は小さい per_trial ファイルのみ読む。**trial横断分析（決定性/分散/max_hp収束）は rollup 専用**（単trialでは測れないため per_trial に置かない）。
> **命名規則（固定）**: `trialNN.md`（原本）／`trialNN_quant.md`・`trialNN_quali.md`（per_trial・NN2桁で原本と1:1）。

## ワークフロー
1. `data/config.json` を確定（探索キャッシュexport＝GEARスナップ+dispAtk同梱を推奨）→ 実測開始前に格納。
2. 実機試行ごとに **`data/record_skeleton.md` を複製して `data/trialNN.md`** を作成（原本・加工せず・メタヘッダ）。**トライアルの複製・push はユーザーが行う**（テンプレは record_skeleton のみ）。
3. **per_trial（trial毎）**: 各 `trialNN.md` を入力に `analysis/per_trial/trialNN_quant.md`（数値のみ）＋ `trialNN_quali.md`（言語のみ）を作成（**1 trialずつ＝入力小**）。
4. `analysis/quantitative_analysis.md`（rollup）: `per_trial/*_quant` 全trialを入力に**trial横断**集計（決定性/分散/max_hp収束・手法/スクリプト明記）。
5. `analysis/qualitative_analysis.md`（rollup）: `per_trial/*_quali` 全trialを入力に**trial横断**テーマ整理。
6. `analysis/integrated_analysis.md`: 上記2つの**rollupのみ**を入力に統合判断（Cx起票/クローズ・モデル修正可否・golden影響・次アクション）。
7. Cx 起票は CALIBRATION_ANALYSIS.md へ、確定仕様は CLAUDE.md へ反映。
