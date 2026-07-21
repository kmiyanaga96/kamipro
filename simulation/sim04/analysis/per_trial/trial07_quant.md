# trial07_quant — 単trial定量分析（trial07・数値のみ）

> **責務（per_trial 層）**: trial07.md 1本のみ入力。**M2a judg単独・N=1（走4/7）**。実機集計のみ。
> 手法・スクリプト: `analysis/m2_aggregate.mjs`（JUDG['07']）。押下列: droid→alone(赤反応1)→judg。

## 1. judg ph0（テトラ・アビ枠10hit・会心=全hit）
- 合計 4,415,085 / mean 441,509 / hit幅 4.10% / CV 1.31%
- droid **N=1**・**defdown なし**（alone=エレインバースト＝赤反応のみで敵デバフ無）＝**clean droid+1 の点**。
- **急所分割は不可**: §1急所列が**11個**（10hitに対し1個過剰）＝acute分割から除外（rollupでは全hit meanのみ採用）。

## 2〜6. 付随データ（M2a副産物）
- alone（エレインバースト・T1＝**omni有効下**）: 本体 3,494,968 / 追加 1,589,815 / **ロボ追撃 1,438,795**（C5/C3追撃anchor）。

## 7. 欠測・異常値
- **[要確認] 急所列11個の過剰**（軽微・値10hitは健全）。
- **[要確認] trial08とほぼ同値**（judg hit3のみ441,435→441,455差・alone完全一致）＝独立走か原本要確認（独立ならjudgのroll分散が極小＝決定性の傍証／複製ならtrial08再取得）。
