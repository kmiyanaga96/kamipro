# integrated_analysis — 統合分析（統合のみ）

> **責務**: quantitative_analysis と qualitative_analysis **のみ**に基づき統合分析を行う。
> 新規の集計・新規の所感を持ち込まない（必要なら各analysisへ差し戻して更新→本書を再統合）。
> 出力: Cx 起票/状態遷移・モデル修正可否・golden影響・Phase方針への含意・次アクション。

## 1. 入力（両analysisの版・要点）

- `quantitative_analysis.md`: **M1層**（trial01-03・baseline）／**M2層**（trial04-10・judg単独）／**M3層**（trial11-13・旺盛）。
- `qualitative_analysis.md`: 同3層の定性テーマ。
- 全データ **configB × cath_palug（affinity1.5）× engine C27-red-after-setup-refine** で内的に閉じる（環境跨ぎなし）。sim03アンカー（configA）はfit時に §2ルール下で併用。
- **横断集計スクリプト**（P3再現）: `m1_aggregate.mjs` / `m2_aggregate.mjs` / `m3_aggregate.mjs`。

## 2. 統合判断

### 2-1. 絶対レベル過小（C25）の主因は baseline 側で確定的
- **M3が旺盛capを容疑から外した**: ヘカテー T2/T3 比 1.175 は一律cap(1.185)の直下＝**C32（旺盛100%超え）不支持**＝旺盛は過小の源ではない。
- **M2aが判定枠を圧縮域と示した**: judg ph0 は非急所 428k/hit で**同一急所状態は近似決定的**（decay/cap固定）＝アビ枠は cap 飽和側。
- **M1の非会心非急所 通常アンカー**（15+7hit）が baseline スカラの直接入力。
- ∴ **×1.43過小は「旺盛」でも「深飽和成分」でもなく baseline/成長・枠帰属**に局在（sim03結論と一致・M1-M3で三方向から裏取り）。

### 2-2. 会心・急所の枠像が判明（fitの前提規約が確定）
- **会心は実効≒100%（全hit・全メニュー）**＝非会心アンカーは存在しない → fitは**会心hit同士の比/割り戻し**で行う（会心倍率は比で相殺）。
- **急所寄与は枠で大きく異なる**: 通常 **+約29%**（減衰浅） vs judg ph0 **+約3%**（減衰深部で圧縮）。→ 急所は必ず**同一急所状態でマッチ**して扱う（M3で実証・両層一致）。
- **C28（per-hitロールRNG）は小さい**: 見かけの hit 変動の主因は急所on/offで、同一急所状態内は判別可能なほど安定（judg非急所 幅1.3%）。

### 2-3. judg（C30/C31）は制約入力が揃った＝あとは構造修正後の同時fit
- 絶対値（N=0非急所 428k）・**clean droidスロープ +1.03%/反応**（非急所基準+1.37%）・**effond defdown +2.37%**・cap飽和像を取得。
- **C31（加算/乗算）は現データで直接判定しない**（configBは減衰深部＝その場の数値差が潰れる／README §3）。判別は naForAbi(M1)＋ph0絶対値＋スロープの**同時fit**。

### 2-4. 新規の枠帰属論点（構造修正セッションで要検討）
- **omni(特殊攻撃+30%)が通常攻撃にほぼ効かない**（T1→T2 edison -5%のみ・乗算なら-23%相当）＝**特殊攻撃UPの適用範囲**（通常に乗るか）の疑い。C31〜C35の `_na` spec項スコープに直結。
- **effond_def のモデル化**: シムが effond_def を damage 乗算に入れているか（orthodoxy採点のみの疑い）。M2aで defdown +2.37% 実測。

## 3. バックログ遷移（CALIBRATION_ANALYSIS.md への反映内容）

| Cx | 現状 | sim04での遷移（提案） |
|---|---|---|
| **C32**（旺盛2段cap） | open | **→ resolved候補（2段cap不支持・現行1.0クランプ維持＝実装変更なし）**。M3 比1.175<1.185で確定的。最終確認は同一バフ状態fit（T3急所3hitの薄さ補強）。 |
| **C25**（★絶対値過小） | investigating | **前進**: 主因を baseline/枠帰属へ限定（旺盛・深飽和・会心を除外）。M1非急所通常アンカーが一次入力。 |
| **C30**（judg ph0 過大） | open | **前進**: 実機ph0=428k/hit（N=0低バフ）・cap飽和像（decay固定・非急所1.3%）を取得。per-hit cap案はこのアンカーへfit。 |
| **C31**（アビダメUP乗算→加算） | open | **制約取得**（絶対値/droidスロープ/defdown）。判定は構造修正＋同時fitで（本データが主入力）。 |
| **C5/C3**（追撃cap） | fixed/investigating | ロボ追撃 実機 mean 1.46M（6発）を追加取得＝sim03アンカー（実機1.58〜2.26M）と同レンジ。fit入力を補強。 |
| **C28**（per-hitロールRNG） | open(低優先) | **downgrade**: 同一急所状態内のロールは小（judg1.3%）。実務上fitは平均/medianで吸収可。 |
| **C29**（DA/TA未モデル） | open(低優先) | **前進/resolved候補**: 通常の per-hit 値は hit数（DA/TA）に依らずほぼ一定（elaine 2hit≒1hit）。総ダメは hit数×単価で表現可＝モデル簡易。 |
| **C35**（急所の有利属性ゲート） | open | 未検証（中立ボスプローブは未実施）。通常の急所寄与+29%は取得。必要時に別枠プローブ。 |
| **新規候補**（omni/特殊攻撃UPの通常非適用） | — | **起票候補**: `_na` の spec 項が通常攻撃に乗る範囲の是正（C31〜C35の枠整合で同時検討・**★較正セッションゲート**）。 |

> ※起票・状態確定の CALIBRATION_ANALYSIS.md 反映は、REPO_STANDARDS の「クローズと台帳更新を同一コミット」規律に従い**構造修正/fitセッションで実施**（本書は判断のハブ）。

## 4. 回帰影響（golden・ENGINE_VERSION）＝**fit実施済み（2026-07-21）**

- **構造修正＋絶対値較正を実装**（`fit_probe.mjs` で configB M走を突合し較正倍率を決定）:
  - C31 アビダメUP 乗算→加算（judg/effond/consort/_spendGaugeAbi）／C34 バーストダメUP+500%上限／**C32 実装せず**（M3で2段cap不支持）。
  - **calib_na=1.835**（通常・`_decay('na')`・`_naForAbi`除外）／**calib_burst=2.07**（バースト本体・`burst()`のdmg加算のみ＝streak基底は素core）／**judg_calib=0.62**（judg site・abi枠blanketにしない）。
  - fit後の実機/sim: 通常 全5キャラ 0.945〜1.038（×0.9-1.1充足）／judg N=0 ≈1.0／バースト本体 4/5キャラ 0.91〜1.0（hecateのみ+11%＝yamato_elem stack/flat帰属の残差）。
- **golden 再fit**: raw 187,186,834→**197,775,394** / cal 208,689,608→**211,462,826**・FB **10/10**維持。override **{judg:160→145,pactcore:1}**（judg×0.62で実力低下→calibrateStaticScoresが自動で判定）。ENGINE_VERSION `sim04-abscal-C31C34-calib`。
- 同期済: test/golden.mjs・CLAUDE.md（検証ゲート/現ゴールデン値/override）・CALIBRATION_ANALYSIS.md（C25部分fix/C30 fixed/C31 fixed/C32 resolved-実装せず/C34 fixed）。`npm run build` 成功。
- **残（別途）**: C5/C3 追撃cap（ロボ追撃/追加ダメが×2-3.3過小・cap飽和で総ダメ影響小）／バースト成長の二次残差（hecate/tetra のyamato_elem依存）／C35・omni spec範囲（低優先）。

## 5. 結論・次アクション

**sim04 データ取得フェーズ（M1-M3）は完了**。単独データ（README §4）で以下が確定/前進：
- C32 **不支持→現行維持でclose見込み**（golden非影響）。
- C25/C30/C31/C5/C3 の **fit制約入力を取得**（baseline通常アンカー・judg ph0絶対値/droidスロープ/defdown・ロボ追撃）。
- 会心100%・急所マッチ・DA/TA非依存の **fit前提規約**を確立。

**次アクション（README §3 依存チェーン・セッションを切らずに通す）**:
1. **構造修正 C31〜C35（コードのみ・fitなし）**＝pre-cap構造を先に是正。C32は「変更なし」を明記して通す。新規論点（omni spec範囲・effond_def）を同席で判断。
2. **スカラfit**: C25 baseline（M1）→ C5/C3 追撃（M2ロボ追撃＋sim03）→ C30 judg ph0（M2a・C31適用後残差）。会心割り戻し・急所マッチ規約で。
3. **golden/override 再fit**＋ENGINE_VERSION更新＋2箇所同期。新推奨順export＋序数diff（`baseline_order_prefix.json`）記録。
4. **CALIBRATION_ANALYSIS.md / CLAUDE.md 台帳更新**（§3の遷移を同一コミットで反映）。
5. **任意**: M4（バーストcap・C34）は実装＋M1バースト本体整合で閉じる。C35中立ボスプローブは必要時のみ。

> **⚠実施規律**: (1)構造修正 と (2)fit の間でセッションを切らない（構造だけ main に入る golden 不整合を作らない・README §3）。
