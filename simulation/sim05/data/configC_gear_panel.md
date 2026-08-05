# configC 装備パネル転記＋実機表示ATK/HP（一次情報・2026-07-27 ユーザー提供）

> **種別**: 一次情報（ユーザー提供・実機画面転記）
> **出所**: ユーザーによる実機スクリーンショット＋表示値の直接申告 ／ **受領日**: 2026-07-27 ／ **原文ママ**（本文は書き換えない。訂正は冒頭注記で行う＝damage_frames.md 方式）
> configC の装備の一次記録（探索キャッシュ `archive/caches/sim05_configC_provisional.json`・engineVersion `sim04-abscal-C31C34-calib` を補完する）。スクショは保存しない方針のためテキスト転記（simulation/README「データ成型の原則」）。
> 関連: sim05 README §5（golden 干渉・per-formation ATK）・`src/app.js` `DISPLAY_ATK_OVERRIDE_BY_FORMATION.napoleon`
>
> ⚠ **暫定configC**（ウェポン強化継続中・Q3 は月末確定予定）。本値は暫定版として受領した時点のスナップショット。
>
> ### ⚠ 冒頭注記（2026-08-03・ユーザー確認による訂正）
> **§1 の「（幻獣=freyja_christmas / artemis）」はサブ枠の記載として陳腐化している。**
> pre-trial の実機走のサブ枠（アシスト）は **metatron + artemis**（ユーザー確認 2026-08-03）。
> ∴ ハーネスの `setCurrentSubs` は `['metatron','artemis']` が正で、**A7（AnotherLink の重複規則）は現役の未確定変数**。
> ⚠ 本文は書き換えない（原文ママ原則）。**サブ枠・幻獣・ウェポンの正は、今後 `configC_slot.json`（UI の編成保存スロット JSON）とする**。
>
> ### ⚠ 冒頭注記2（2026-08-03・**ハーネスが本書を参照していなかった**）
> **本書 §2.0 の「proper v2（現行）」列が最初から正しかった**。にもかかわらず `tools/` のハーネスは
> **§2.0 の「暫定(v3抽出時)」列（2026-07-27 の最古値）をコピーしたまま**動いており、
> `simulation/sim05/analysis/` の初版はその GEAR で計算されていた（elem だけ 0.54 と本書のどの列とも違う）。
>
> | 枠 | ハーネスが使っていた値（**誤**） | **§2.0 proper v2 ＝正** |
> |---|---|---|
> | assault / elem / vigor | 3.06 / 0.54 / 0.6876 | **5.56 / 1.10 / 1.074** |
> | acute / crit_rate | 0.144 / 0.405 | **0.32 / 0.45** |
> | na_dmg / abi_dmg / burst_dmg | 1.116 / 2.52 / 5.22 | **1.24 / 2.00 / 7.10** |
> | na_cap / abi_cap / burst_cap | 0.36 / 0.99 / 2.016 | **0.40 / 1.00 / 2.34** |
>
> **★この誤りで分析の結論が1つ反転した**: T1 全体 ×1.77 → **×1.41**、
> バースト本体 ×1.04（一致）→ **×0.77（シムが 30% 過大）**。詳細 `../analysis/per_trial/pre-trial_quant.md` §0。
> **対策**: `tools/calib_replay_compare.mjs` は GEAR/サブ枠/パーティ順/敵を
> **`configC_cache_20260803.json` の `_configSig` から読む**ようにした（ハードコード廃止・E2 bit 一致で検証済み）。
> ⚠ **他のハーネスは未修正**（`exp_t1_abilcap_sweep.mjs` 等が同じ最古 GEAR を持つ＝出した数値は再取得が必要）。
>
> ### 受領キャッシュ（2026-08-03・`configC_cache_20260803.json`）
> UI からエクスポートした結果キャッシュ。`_configSig` キーに **GEAR / サブ枠 `[metatron,artemis]` /
> パーティ順 `[hecate,tetra,elaine,arianrhod]` / 敵（def20・HP9.8億・barrier・abilCap19）** が入っており、
> 記録ルートの強制リプレイで **dmg 2,823,338,240.3926167 が bit 一致＝E2 通過**。GEAR は §2.0 proper v2 と同値。
>
> **実機表示ATK / HP（ユーザー申告 2026-08-03・全員 Lv95）**:
> ナポレオン 111143/14442 ／ ヘカテー 86683/12784 ／ テトラ 88993/12034 ／ エレイン 90944/12815 ／ アリアンロッド 90045/12324
>
> ⚠ **pre-trial（2026-08-02）走行時の表示ATK は `pre-trial.md` ヘッダが正**（hecate だけ 80833＝Lv80 時点。
> 他4人は上記と同一）。**表示ATK は武器構成の関数**なので、4/5 が一致する＝**武器構成は pre-trial 以降不変**
> と判断した（残る穴＝幻獣由来のボックス補正は表示ATK に現れない）。
> ⚠ `src/app.js` の `DISPLAY_ATK/HP_OVERRIDE_BY_FORMATION.napoleon`（107861 等）は **golden の napoleon fixture に
> 効くため未更新のまま**＝注入は C38 の buffCount 修正と同時に1回で行う（二重再fit回避）。
>
> **感度の実測（2026-08-03・旧 GEAR 条件で測定）**: サブ枠を metatron→freyja に替えても
> pre-trial T1 の全体比は ×1.77→×1.78 と**ほぼ動かない**（動くのは metatron 固有の `sub_abi_*`/`sub_na_*` と
> フレイヤの `streak_dmgup 1.1` だけ。バースト枠は AnotherLink が現行 `Math.max` のため
> **アルテミスの 0.25 に張り付いて両者同値**）。
> ∴ **サブ枠の取り違えは誤差だが、GEAR の取り違えは結論を反転させる**（×1.77→×1.41）＝
> **config の同一性担保が分析の前提条件**という教訓。

---

## 1. 編成

英霊=**ナポレオン** / パーティ=**ヘカテー・テトラ・アリアンロッド・エレイン**（幻獣=freyja_christmas / artemis）。

## 2. 実機表示ATK / HP（ユーザー申告・原文ママ）

> **⚠ GEAR は 2026-07-31 中に2回更新された**。**現行は v2**（下記 §2.0）。ATK/HP は §2.1 のまま。
>
> ### 2.0 GEAR の変遷（すべて受領キャッシュから抽出・E2 リプレイ bit 一致で検証済み）
>
> | 枠 | 暫定(v3抽出時) | proper v1 | **proper v2（現行）** |
> |---|---|---|---|
> | assault | 3.06 | 3.204 | **5.56** |
> | elem | 1.04 | 1.04 | **1.1** |
> | vigor | 0.6876 | 0.9666 | **1.074** |
> | acute | 0.144 | 0.288 | **0.32** |
> | crit_rate | 0.405 | 0.405 | **0.45** |
> | na_dmg | 1.116 | 1.116 | **1.24** |
> | abi_dmg | 2.52 | 1.8 | **2** |
> | burst_dmg | 5.22 | 6.39 | **7.1** |
> | na_cap | 0.36 | 0.36 | **0.4** |
> | abi_cap | 0.99 | 0.9 | **1** |
> | burst_cap | 2.016 | 2.106 | **2.34** |
>
> 10T 総ダメージ（ロキ・同一 override `{judg:130,pactcore:1}`）: v1 **5,007,484,343** → v2 **6,240,027,981**（**+24.6%**）。
> ⚠ **G3 v4 は proper v1 で抽出したため陳腐化**＝再抽出が必要（較正ボス確定後に1回で回す方針）。

### 2.1 ✅ proper configC の表示ATK/HP（2026-07-31 受領・**現行**）

| キャラ | Lv | 表示ATK | 表示HP |
|---|---|---|---|
| ナポレオン | — | **107861** | **13545** |
| ヘカテー | **80** | **78269** | **11300** |
| テトラ | **95** | **86429** | **11675** |
| アリアンロッド | **80** | **81631** | **10840** |
| エレイン | **95** | **88380** | **12456** |

- `src/app.js` の `DISPLAY_ATK_OVERRIDE_BY_FORMATION.napoleon` / `DISPLAY_HP_OVERRIDE_BY_FORMATION.napoleon` へ**そのまま登録済み**（2026-07-31・0-fudge）。
- ⚠ **受領キャッシュ（`configC_proper` 相当）の同梱 `dispAtk` は旧暫定値のまま**（napoleon 102288 等）＝UI 更新前に export されたもの。
  キャッシュのリプレイ検証（E2）を行うときは**キャッシュ内の `dispAtk` を使う**こと（本表の proper 値では bit 一致しない）。

### 2.2 旧・暫定 configC（2026-07-27 受領・**参考**）

| キャラ | 表示ATK | 表示HP |
|---|---|---|
| ナポレオン | 102288 | 12677 |
| ヘカテー | 75558 | 10714 |
| テトラ | 83718 | 11089 |
| アリアンロッド | 77297 | 10119 |
| エレイン | 85054 | 11807 |

proper との差は全キャラで上振れ（+2.7%〜+5.6%）＝装備強化の進行。**実験2 より ATK が動けば押し順は変わる**ため、
暫定 ATK で抽出した G3 v3（2026-07-31 午前）は**無効**。
- ⚠ **configB（sim04・edison編成）の共有キャラ値より高い**（hecate 73727→75558 / tetra 81887→83718 / elaine 82248→85054）＝**編成差ではなく装備強化の時点差**。∴ 単一グローバル override では両立不能 → per-formation 構造へ改修（sim05 README §5 実装上の注意の解決）。
- ⚠ Lv 記載は override 優先のため `calcDisplayAtk`（満凸推定・`SSR_LV_RELEASE`）経路には乗らない＝Lv95 増分未取得（`src/app.js` L100 注記）は本 config では非ブロッカー。

## 3. 装備パネル（一次情報・スクリーンショット転記）

| 区分 | 項目 | 値 |
|---|---|---|
| 基本効果 | HPUP | 116.0% |
| 基本効果 | 攻撃UP | 170.0% |
| 基本効果 | 三段攻撃確率UP | 6.0% |
| HPに応じた効果 | 旺盛効果 ※HP100%時の効果量 | 38.2% |
| 通常攻撃系効果 | 通常攻撃ダメージUP | 62.0% |
| 通常攻撃系効果 | 通常攻撃ダメージ上限UP | 20.0% |
| アビリティ系効果 | アビリティダメージUP | 140.0% |
| アビリティ系効果 | アビリティダメージ上限UP | 55.0% |
| バースト系効果 | バーストダメージUP | 290.0% |
| バースト系効果 | バーストダメージ上限UP | 112.0% |
| 確率系効果 | 会心効果 ※効果量の期待値 | 22.5% |
| 確率系効果 | 急所攻撃効果 ※効果量の期待値 | 8.0% |

## 4. パネル値 ↔ 受領キャッシュ同梱 GEAR の突合（検証済み・2026-07-27）

<!-- ⚠ 参照先の JSON は 2026-08-02 に `archive/caches/sim05_configC_provisional.json` へ退避（engineVersion 2世代前＝再現不能）。以下の突合結果は転記済みなので本節だけで完結する。 -->

受領キャッシュ内の GEAR は、**全項目がパネル値 ×1.8 に厳密一致**（＝`weaponAmp=0.8` 適用後の値・`applyGear` の `GEAR[box]+=v/100*(1+weaponAmp)`）:

| GEAR キー | キャッシュ値 | パネル値 | 比 |
|---|---|---|---|
| assault | 3.06 | 170.0% | ×1.8 |
| vigor | 0.6876 | 38.2% | ×1.8 |
| na_dmg | 1.116 | 62.0% | ×1.8 |
| na_cap | 0.36 | 20.0% | ×1.8 |
| abi_dmg | 2.52 | 140.0% | ×1.8 |
| abi_cap | 0.99 | 55.0% | ×1.8 |
| burst_dmg | 5.22 | 290.0% | ×1.8 |
| burst_cap | 2.016 | 112.0% | ×1.8 |
| acute | 0.144 | 8.0% | ×1.8 |
| crit_rate | 0.405 | 22.5% | ×1.8 |

**⇒ 受領キャッシュの GEAR は configC パネルそのもの**＝GEAR 側に不一致は無く、コード修正は不要（UI 入力値が正しく反映されている）。`elem: 0.54`（属性）はパネル外の別入力。

- **configB（sim04）との GEAR 差分**: `elem` 0 → **0.54** ／ `dmgup` 0.09 → **0**。ダメージ枠（assault/na/abi/burst の dmg・cap）は configB と同値。

## 5. 受領キャッシュの素性（実体は `archive/caches/sim05_configC_provisional.json`）

- `engineVersion`: `sim04-abscal-C31C34-calib`（現行エンジンと一致）
- 敵条件: HP `100,000,000`・affinity `0`・barrier `null`・abilCapPerTurn `null` ＝**デフォルト敵**（両面宿儺ではない）
- `override`: `{judg:130, pactcore:1}` ／ `prefix`: `["effond"]` ／ `dmg`: 4,054,843,556
- 同梱 `dispAtk` は **旧値**（napoleon 30041 / arianrhod 31737 ＝ override 未登録時の満凸推定フォールバック値）＝**本 md §2 の実機値が正**。sim04 configB と同じ「キャッシュ同梱 dispAtk は旧値」問題（sim04 README §2 注記と同型）。
- ∴ このキャッシュの探索ルート（`turnsKeys` 10ターン）は**旧ATKスケールで探索された順**＝G3 の「較正前 基準順」として使う場合は **override 登録後に headless 再探索で取り直す**こと。

---

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 9）

- [CALIBRATION_ANALYSIS.md](../../../CALIBRATION_ANALYSIS.md)
- [DOC_RELATION_PLAN.md](../../../DOC_RELATION_PLAN.md)
- [simulation/sim05/README.md](../README.md)
- [simulation/sim05/analysis/per_trial/pre-trial_quant.md](../analysis/per_trial/pre-trial_quant.md)
- [simulation/sim05/data/pre-trial.md](./pre-trial.md)
- [simulation/sim05/data/record_skeleton.md](./record_skeleton.md)
- [tools/README.md](../../../tools/README.md)
- [workspace/HANDOFF.md](../../../workspace/HANDOFF.md)
- [workspace/TODO.md](../../../workspace/TODO.md)

_他に 凍結sim/archive/essays から 2 件（更新対象外）_
<!-- doc_refs:end -->
