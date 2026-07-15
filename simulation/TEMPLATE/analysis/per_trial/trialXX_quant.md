# trialXX_quant — 単trial定量分析（trialXX・数値のみ）

<!--
  ■ per_trial 層（中間集計）の雛形。**複製して trial01_quant.md〜 を作成**する（1 trial=1ファイル）。
  ■ 命名規則: `trialNN_quant.md`（NN=試行番号2桁・元データ trialNN.md と1:1対応）。配置: analysis/per_trial/。
-->

> **責務（per_trial 層・中間集計）**: **trialXX.md 1本のみ**を入力に、そのtrial**内**の定量集計・整合だけを行う。
> - 書くもの: 成分別集計・ターン別実ダメ合計・HP%↔ダメ整合（**単trialの**max_hp点推定）・会心/急所率・judgフェーズ予実・経済チェックポイント・ゲージ。
> - **書かないもの**: **trial横断の統計（平均/分散/決定性/max_hp収束）＝上位 `quantitative_analysis.md` へ**。所感・解釈・統合も書かない（→qualitative / integrated）。
> - **P3（再現性）**: 各節に「手法・使用スクリプト（scratchpad名）・入力（=trialNN.md）」を明記。

## 0. 入力・メタ
- 入力: `data/trialNN.md`（**本trialのみ**）／ config: `data/configA.json`（総ダメ/override/dispAtk）
- 手法・スクリプト参照:

## 1. 成分別集計（全hit）
成分（通常/アビリティ/バースト本体/追加ダメージ/追撃/ロボ追撃/エジソン英霊武器追撃/judg/streak）ごとに 件数・合計・代表値。

## 2. ターン別 実ダメージ合計（全hit ＋ DOT ＋ 反撃 ＋ その他敵フェイズ）
- T1 / T2 / T3 …（各ターンの内訳と合計）

## 3. HP%↔実ダメ整合（**このtrialの**max_hp点推定）
- 各ターン HP%差 と ターン実ダメ合計 → max_hp 点推定（複数式・§3.3）。※収束評価は上位rollupへ。

## 4. 会心/急所率（マーク頻度・full-crit想定の実測確認）

## 5. judgフェーズ予実（C23）／経済チェックポイント（契晶ストック/累計/連理・予実）

## 6. ゲージ（敵フェイズ前後・C24）／その他数値

## 7. 本trialの欠測・異常値（確度タグ付き・上位rollupへ申し送る点）
