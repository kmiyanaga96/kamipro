# trial01_quant — 単trial定量分析（trial01・数値のみ）

> **責務（per_trial 層・中間集計）**: **data/trial01.md 1本のみ**を入力に、そのtrial**内**の定量集計・整合だけを行う。
> - 書くもの: 成分別集計・ターン別実ダメ合計・HP%↔ダメ整合（**単trialの**max_hp点推定）・会心/急所率・judgフェーズ予実・経済チェックポイント・ゲージ。
> - **書かないもの**: **trial横断の統計（平均/分散/決定性/max_hp収束）＝上位 `../quantitative_analysis.md` へ**。所感・統合も書かない。
> - **P3**: 各節に「手法・使用スクリプト（scratchpad名）・入力（=trial01.md）」を明記。

## 0. 入力・メタ
- 入力: `data/trial01.md`（本trialのみ・実測3T討伐 T3#16）／ config: `data/configA.json`（総ダメ1,644,858,119・override{judg:200,pactcore:1}）
- 手法・スクリプト参照: （未着手）

## 1. 成分別集計（全hit）

## 2. ターン別 実ダメージ合計（全hit ＋ DOT ＋ 反撃 ＋ その他敵フェイズ）

## 3. HP%↔実ダメ整合（このtrialのmax_hp点推定）

## 4. 会心/急所率

## 5. judgフェーズ予実（C23）／経済チェックポイント

## 6. ゲージ（敵フェイズ前後・C24）／その他数値

## 7. 本trialの欠測・異常値（確度タグ付き・上位rollupへ申し送る点）
