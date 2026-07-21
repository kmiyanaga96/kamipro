# trial04_quant — 単trial定量分析（trial04・数値のみ）

> **責務（per_trial 層）**: trial04.md 1本のみ入力。**M2a judg単独・N=0（走1/3）**。実機集計のみ（シム突合/fitは構造修正C31〜C35後）。
> 手法・スクリプト: `analysis/m2_aggregate.mjs`（JUDG['04']）。

## 1. judg ph0（テトラ・アビ枠10hit・会心=全hit）
- 合計 4,370,086 / mean 437,009 / hit幅 3.91% / CV 1.43%
- **急所分割**: 非急所 mean **428,152**（3hit=最小群）／ 急所 mean 440,804（7hit）。→ 10hitの振れは主に**急所on/off**（急所≒+3%）で、**同一急所状態のhitは近似決定的**（cap飽和シグナル・C30）。
- droid N=0（confound なし＝素の基準）。omni・ムーンコード有効（§0）。判別はrollup/fitへ。

## 2〜6. （M2a単発走のため非該当：ターン/HP/経済/ゲージは未取得＝judg直後撤退）

## 7. 欠測・異常値
- なし（クリーンなN=0基準走）。
