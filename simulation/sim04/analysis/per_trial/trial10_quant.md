# trial10_quant — 単trial定量分析（trial10・数値のみ）

> **責務（per_trial 層）**: trial10.md 1本のみ入力。**M2a judg単独・N=2（走7/7＝M2aバッチ最終）**。実機集計のみ。
> 手法・スクリプト: `analysis/m2_aggregate.mjs`（JUDG['10']）。押下列: droid→alone→effond→judg。

## 1. judg ph0（テトラ・アビ枠10hit・会心=全hit）
- 合計 4,578,931 / mean 457,893 / hit幅 3.53% / CV 1.02%
- droid **N=2**・**⚠effond_def（敵防御DOWN）有効**（trial09と同条件の2走目）。
- 急所分割: 非急所 mean 446,113（1hit）／ 急所 mean 459,202（9hit）。

## 2〜6. 付随データ
- alone（T1・omni有効下）: 本体 3,516,724 / 追加 1,587,400 / ロボ追撃 1,454,384。
- effond（N=2＋defdown下）: アビ 721,151 / 本体 3,538,211 / 追加 2,117,277 / ロボ追撃 1,494,094。

## 7. 欠測・異常値
- effond_def confound（trial09同）。N=2の2走（trial09/10）は mean 457,008/457,893 で一致＝再現性は高い。
