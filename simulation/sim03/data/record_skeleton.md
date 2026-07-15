# trialNN — 実機データ原本（加工せず）／sim03 第1バッチ D×5

<!--
  ■ このファイルは記録スケルトン（コピー原本）。**複製して trial01.md〜trial05.md を作成**し実機値を記入する。
  ■ フォーマットは sim03 全 trial で厳守（統一様式）。整形・解釈は analysis/ 側で行い、ここは加工しない。
  ■ 記録項目の定義は sim03/README §3.2 ／ 記入のコツは §3.4。
-->

<!-- メタヘッダ（必須・§3.2） -->
- 試行番号: NN
- 日付:
- モード: D（全深測定撃破・T1〜T2 全hit毎記録）
- 装備config名: configA（full-crit）
- ENGINE_VERSION: C27-red-after-setup-refine
- 使用キャッシュ: data/configA.json（キャスパリーグ版・総ダメ1,644,858,119・baseDmg1,151,462,227・prefix["alone"]・override {judg:200,pactcore:1}）
- 敵: cath_palug（キャスパリーグ・闇/affinity1.5・def10/max_hp1億placeholder）
- UI装備パネル一致確認（ゲート3・表示ATK5人分）: edison=____ / yamato=____ / hecate=____ / tetra=____ / elaine=____
  ※configA同梱dispAtk（Lv95実機値・2026-07-15更新）= edison93489 / yamato73346 / hecate70664 / tetra78824 / elaine79696。UI表示と一致するか確認し実値を記入。
- 固定押し順: シム推奨順（下記）。逸脱の有無と内容: なし / あり（内容:____）

---

## 固定押し順（シム推奨順・全trial共通＝trial01〜05もこの順で）

**T1（19手）**: banoshik → droid → funki → divinus → amplifa → **effond(赤)** → **alone(赤)** → funki → absolute → puvoir → sleur → judg → inori → funki → legend → legend → funki → judg → knights
**T2（24手）**: judg → alone(赤) → alone(赤) → puvoir → legend → legend → **effond(赤)** → funki → sleur → judg → tenya → judg → judg → ifishant → legend → funki → tenya_re → tenya_re → puvoir → sleur → judg → alone(赤) → effond(赤) → judg

> ※キャスパリーグは2T討伐。万一T3へ続いた場合はconfigAのT3順で継続し、その旨と回避率UP(ハシルニャン・MISS要因)の有無を記録。

---

## T1 記録

- 開始時ボスHP%: 100
- メイン開始 契晶ストック/累計/連理魔力: ____ / ____ / ____
- バフ実stack（アサルト/旺盛/光属性UP/legend閾値/特殊/防御DOWN）: ____

<!-- 押下毎・hit毎: キャラ/成分(通常/バースト本体/追撃/ロボ追撃/エジソン英霊武器追撃/judg/streak)/値/会心/急所 -->
| 押下# | key | 発生hit（成分・キャラ） | 値 | 会心 | 急所 |
|---|---|---|---|---|---|
| 1 | banoshik |  |  |  |  |
| 2 | droid |  |  |  |  |
| 3 | funki |  |  |  |  |
| 4 | divinus |  |  |  |  |
| 5 | amplifa |  |  |  |  |
| 6 | effond(赤) |  |  |  |  |
| 7 | alone(赤) |  |  |  |  |
| 8 | funki |  |  |  |  |
| 9 | absolute |  |  |  |  |
| 10 | puvoir |  |  |  |  |
| 11 | sleur |  |  |  |  |
| 12 | judg（ph? 10hit?） |  |  |  |  |
| 13 | inori |  |  |  |  |
| 14 | funki |  |  |  |  |
| 15 | legend |  |  |  |  |
| 16 | legend |  |  |  |  |
| 17 | funki |  |  |  |  |
| 18 | judg |  |  |  |  |
| 19 | knights |  |  |  |  |
| (攻撃フェイズ) | 通常/バースト/追撃 |  |  |  |  |

- C24①補助ロボ黄反応のゲージ増分（該当押下 前→後・5人分）: ____
- C24②エレイン1押下の前→後ゲージ（対象・英霊100条件）: ____
- C23: T1最初のjudgのフェーズ（ph0アビ/ph1バースト/ph2通常）: ____
- メイン終了 契晶/累計/連理: ____ / ____ / ____
- バーストゲージ5人分（敵フェイズ前 / 後）: ____ / ____
- 味方HP%5人分: ____
- **T1終了時ボスHP%（★max_hp推定の鍵）**: ____
- 敵行動名 / ディスペル(チョットホンキニャン)有無・時刻 / 猫鈴の音の個数 / 回避UP有無: ____

## T2 記録

- 開始時ボスHP%: ____（★T1終了HP%と一致確認）
- メイン開始 契晶/累計/連理: ____ / ____ / ____
- バフ実stack（ディスペル後なら=0確認）: ____

| 押下# | key | 発生hit（成分・キャラ） | 値 | 会心 | 急所 |
|---|---|---|---|---|---|
| 1 | judg |  |  |  |  |
| 2 | alone(赤) |  |  |  |  |
| 3 | alone(赤) |  |  |  |  |
| 4 | puvoir |  |  |  |  |
| 5 | legend |  |  |  |  |
| 6 | legend |  |  |  |  |
| 7 | effond(赤) |  |  |  |  |
| 8 | funki |  |  |  |  |
| 9 | sleur |  |  |  |  |
| 10 | judg |  |  |  |  |
| 11 | tenya |  |  |  |  |
| 12 | judg |  |  |  |  |
| 13 | judg |  |  |  |  |
| 14 | ifishant |  |  |  |  |
| 15 | legend |  |  |  |  |
| 16 | funki |  |  |  |  |
| 17 | tenya_re |  |  |  |  |
| 18 | tenya_re |  |  |  |  |
| 19 | puvoir |  |  |  |  |
| 20 | sleur |  |  |  |  |
| 21 | judg |  |  |  |  |
| 22 | alone(赤) |  |  |  |  |
| 23 | effond(赤) |  |  |  |  |
| 24 | judg |  |  |  |  |
| (攻撃フェイズ) | 通常/バースト/追撃 |  |  |  |  |

- C23: T2最初のjudgのフェーズ: ____
- メイン終了 契晶/累計/連理: ____ / ____ / ____
- 撃破ターン: ____（想定T2）
- **最終累計表示ダメ（→max_hp上界・T1終了HP%と併せて推定）**: ____
- 敵行動名 / ディスペル有無 / 猫鈴の音 / 回避UP・MISS有無: ____

---

## 所感（自由記入・qualitative へ転記される一次メモ）
-
