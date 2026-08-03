# 引継ぎ — 現状スナップショット

> **種別**: 引継ぎ（現状スナップショット・有界） ／ **用途**: 新セッション起動時に **CLAUDE.md と本書のみ**を読めば「今どこにいて次に何をするか」が分かる状態を保つ。
> **次タスクの詳細リスト**は `workspace/TODO.md`。過去の経緯・provenance は `archive/SESSION_LOG.md`（オンデマンド）。
> **更新規律（セッション末）**: 本書は「今」だけを短く保つ。現状化した記述は `archive/SESSION_LOG.md` の先頭へ1ブロック畳み、本書は最新状態へ上書きする（規律は REPO_STANDARDS §6）。
>
> 最終更新: 2026-08-03（セッション末）

---

## 現フェーズ

**Phase 4 = 統計的較正 × 反復可能ボス**（PHASE4_PLAN §3.5.1）。全分析を Claude Code 担当。

**sim05 の主題＝【追撃 C3/C5 較正】＋【tier 観測（C38）】＋【鬼神障壁の実測】**。
→ **2026-08-03 の pre-trial 分析で主題が動いた**（下記）。押し順の序数検証は目的外＝実走はフリー押しでよく、
**実際に押した順の記録が必須要件**。詳細は `simulation/sim05/README.md` §1。

## ✅ 直近の成果 ── **pre-trial 受領・暫定分析まで完了（2026-08-03）**

実機の押し順を**そのまま強制リプレイして成分別に突き合わせる**方式を確立し（`tools/calib_replay_compare.mjs`）、
T1 の乖離を成分に分解した。**結論3行**:

1. **乖離 ×2.47 ＝ 手数 ×1.39 × ダメージモデル ×1.77**。実機42手のうち**シムは39手を再生できる**
   （`abilCapPerTurn` を外せば）＝「シムの手数モデルが構造的に足りない」という懸念は**反証**。
2. **モデル側 ×1.77 の 77.5% は2グループだけ** ── **betaia（cap 過小＝C41・40.1%）** と
   **バースト「追加ダメージ」4種（cap 非拘束なのに ×4〜7＝式が違う＝C40・37.4%）**。
   **バースト本体は ×1.04 で一致**（sim04 の `calib_burst=2.07` は本編成へ転移）。
3. **T2/T3 は較正に使えない**。実機は T1 でアビ上限を超えて**バフを消去**されており（C43）、シムは非モデル。
   **clean anchor は T1 の1ターンのみ**（要件4）。

**起票**: **C40（追加ダメージの式）／C41（betaia cap）／C42（同ターン発動上限）／C43（上限超過ペナルティ）／C44（judg_calib 非転移）**
**成果物**: `simulation/sim05/analysis/`（`per_trial/pre-trial_{quant,quali}.md` ＋ `PROVISIONAL_ANALYSIS.md`）
⚠ trial が1本のみのため **rollup は作らず**、正式 `integrated_analysis.md` は**本trialに対して**行う（ユーザー指示）。

### 主題の移動（重要）

| これまで | いま |
|---|---|
| **追撃 C3/C5 が本丸** | **降格**。追撃②（1アシ）は ×1.55・寄与 1.3%。従来「×2.3〜6.9」に見えたのは**①バースト効果 追加ダメージを追撃と混同**していたため（C40） |
| 絶対値は一律スカラで寄せられるか | **成分別に分解済み**。本体は一致・不足は betaia / 追加ダメ / holy に局在＝**一律スカラは不要** |
| 「非会心・非急所アンカー」で fit | **成立しない**（実機装備が急所確率UP＝全ヒット会心・急所）。較正方針の変更が要る（PROVISIONAL §5） |

## ⏳ 次の一手 ── **本trial（trial01〜）の設計と取得**

**★最優先の取得物＝「アビ上限を踏まない走（全ターン ≦19手）を1本」**。これ1本で T2 以降も clean anchor になり、
**要件4ターンが1走で埋まる**（現状 1/4）。併せて T1末に消えたバフ／契晶ストック・累計／tier の押下単位観測。
→ 一覧は `analysis/per_trial/pre-trial_quant.md` §9・`analysis/PROVISIONAL_ANALYSIS.md` §6。

**較正ボスは両面宿儺で確定**。両ボスとも**被ダメージ0**で討伐＝生存ゲートは論点ごと消滅。

## 3トラックとゲート状況

| トラック | 内容 | ゲート |
|---|---|---|
| **A. ダメージ較正** | **C40/C41（新・T1 乖離の 77.5%）**／C3/C5 は縮小 | ⏳ **本trial待ち**（定式化の切り分けにバフ状態の違う複数ターンが要る） |
| **B. 探索の安定化** | C37 | ✅ LS 実装＋ボス切替で回避。⚠**根治せず**（代理採点は手つかず）＝open。**C43 が入ると探索空間が変わる＝測り直し** |
| **C. 押し順・tier** | C38（buffCount）・予測探索 | ⏳ 実機データ待ち。**実機では tier 切替が実在すると確認**（bc<15→≥20 が同一ターン内で動く） |

## アクティブ作業ライン

| ライン | 状態 | 次アクション |
|---|---|---|
| **★本trial の設計・受領** | ⏳ **次セッション** | ≦19手の走を1本／欠測5項目（PROVISIONAL §6-A） |
| **★メタトロン A7（AnotherLink 重複規則）** | ⏳ **要実機・絶対値較正より先** | `final_dmg` 1.10 vs 1.21。⚠ pre-trial の**比**は共通因子なので A7 非依存＝C40〜C44 の起票は揺るがない |
| **★override の再fit** | ⏳ **未履行・ただし着手禁止** | C39 でモデルが動いたが、**C40/C41 でまた動く**＝**二重fitになるので確定後に1回だけ**回す |
| **長時間ジョブ** | ✅ ①②並列化済 | 残＝③LS内部の投機並列・他ハーネス横展開・ローカル移行 |
| **Phase 8 アクセ実装** | ⏳ intake ゲート | §6 intake をユーザーと確定後 |

→ 全タスクの優先順・チェックは **`workspace/TODO.md`**。

## ドキュメント・ポインタ（詳細は必要時のみ）

- **開発ルール・コード地図・確定仕様・検証・実測コスト**: `CLAUDE.md`（本書と対で必読）
- **較正の確定値・根拠・Cx バックログ**: `CALIBRATION_ANALYSIS.md`（**C37/C38/C40〜C44 が open**）
- **sim05**: `simulation/sim05/README.md`（**§4.4=較正ボス / §4.4.1=T1局在[決着済] / §4.6=tier観測 / §6=残ゲート**）
  ／**`analysis/PROVISIONAL_ANALYSIS.md`（暫定統合＝ここから読む）**／`analysis/per_trial/pre-trial_{quant,quali}.md`
  ／`data/pre-trial.md`（実機原本）／`data/record_skeleton.md`（記入テンプレ）／`data/configC_gear_panel.md`
- **計測ハーネス**: `tools/`（`README.md` が索引・**§0 に並列実行**・**`calib_replay_compare.mjs` が sim05 の較正方式そのもの**）
- **実験・計測の作法**: `REPO_STANDARDS.md` §6 の **E1〜E9**（着手前に通す）
- **探索品質の実験の全数値**: `archive/SEARCH_QUALITY_EXPERIMENTS.md`（C37 の根拠アーカイブ）
- **新キャラ/幻獣の一次情報と Ax**: `gamedata/md/神姫/metatron.md`（§3.2 A0〜A10）／`gamedata/md/幻獣/`
- **Phase 一覧**: `ROADMAP.md` ／ **現行フェーズ**: `PHASE4_PLAN.md` ／ **規約**: `REPO_STANDARDS.md`
- **過去セッションの経緯**: `archive/SESSION_LOG.md`

## 検証（作業後は必ず）

```bash
npm run test:golden   # edison/raw 202,005,923・edison/cal 215,161,915・napoleon/static 299,523,354（全 FB10/10）
```
⚠**実測 2分07秒**（fixture 並列。`--serial` で逐次・`--fixture <name>` で単体）。**背景実行を推奨**。docs のみの変更なら golden は不変。
`_replayResult`/`_execKey`/`clone`/`_snapshotForReplay` を触ったら **`node tools/exp_ls_incremental_verify.mjs`（約4分）も回す**。
