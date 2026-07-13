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
| `data/trialXX.md` | **実機データ原本**（試行XX・加工せず） | 一次情報。手を加えない |
| `analysis/quantitative_analysis.md` | **定量分析のみ**: 定量データの集計・演算・操作など数学的な分析。他は行わない | 所感・解釈・統合を書かない |
| `analysis/qualitative_analysis.md` | **定性分析のみ**: 定性データの集計・整理（ユーザー実機所感・Claude Code所感など言語的な分析）。他は行わない | 数値演算・統合を書かない |
| `analysis/integrated_analysis.md` | **統合分析のみ**: 定量・定性の両分析**のみ**に基づく統合。他は行わない | 新規の集計・新規の所感を持ち込まない（両analysisへ差し戻す） |

## ワークフロー
1. `data/config.json` を確定（探索キャッシュexport＝GEARスナップ+dispAtk同梱を推奨）→ 実測開始前に格納。
2. 実機試行ごとに `data/trialXX.md` を追加（原本・加工せず。冒頭にメタヘッダ: 日付/参照config/装備config名/敵HP開始状態）。
3. `analysis/quantitative_analysis.md`: replay照合・成分集計・統計量（平均/分散/率）・スクリプト参照。
4. `analysis/qualitative_analysis.md`: 実機所感・観測メモ・仮説の種の整理。
5. `analysis/integrated_analysis.md`: 1〜4のみを入力に統合判断（Cx起票/クローズ・モデル修正可否・golden影響・次アクション）。
6. Cx 起票は CALIBRATION_ANALYSIS.md へ、確定仕様は CLAUDE.md へ反映。
