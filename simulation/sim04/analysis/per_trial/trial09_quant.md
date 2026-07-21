# trial09_quant — 単trial定量分析（trial09・数値のみ）

> **責務（per_trial 層）**: trial09.md 1本のみ入力。**M2a judg単独・N=2（走6/7）**。実機集計のみ。
> 手法・スクリプト: `analysis/m2_aggregate.mjs`（JUDG['09']）。押下列: droid→alone→**effond**→judg。

## 1. judg ph0（テトラ・アビ枠10hit・会心=全hit）
- 合計 4,570,080 / mean 457,008 / hit幅 4.31% / CV 1.41%
- droid **N=2**。**⚠confound**: effond が**敵防御DOWN（effond_def）**を付与済み（所感: アビ→デバフ→バースト→ロボ追撃）＝judgに**droid+2 とデバフの二重変化**が乗る。→ N=0対比の増分（後述rollup +4.42%）は純droidでない。
- 急所分割: 非急所 mean 444,707（2hit）／ 急所 mean 460,083（8hit）。

## 2〜6. 付随データ（M2a副産物）
- alone（T1・omni有効下）: 本体 3,480,464 / 追加 1,570,524 / ロボ追撃 1,462,293。
- effond（ヘカテー・N=2＋defdown下）: **アビ 721,934**（アビ枠1hit）/ 本体 3,514,788 / 追加 2,160,930 / ロボ追撃 1,486,790。

## 7. 欠測・異常値
- **[構造的confound] effond_def によりN=2はclean droid点にならない**（rollupでdefdown寄与として分離）。
