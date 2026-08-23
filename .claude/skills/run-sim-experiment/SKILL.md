---
name: run-sim-experiment
description: tools/exp_*.mjs（探索品質・感度・掃引の実験ハーネス）を走らせ、生ログ・provenance・数値を simulation/simNN/ の TEMPLATE 様式（quantitative_analysis.md / qualitative_analysis.md / integrated_analysis.md）へ転記して報告する。較正・探索の実験を回すとき、結果を分析台帳に残すときに使う。
---

# run-sim-experiment

## いつ使うか

`tools/exp_*.mjs`（探索品質・ATK 感度・幅の掃引など。索引＝`tools/README.md` §2）を回して、
その結果を `simulation/simNN/` の 2 層分析へ残すとき。`calib_*` / `search_*` を回すなら `--allow-any`。

## 手順

### 1. 実験の前に確認する（ここを飛ばすと時間が溶ける）

| # | 確認 | 根拠 |
|---|---|---|
| 1 | 過去の数値を前提にしていないか（**測定条件が不明な数値は使わない**） | REPO_STANDARDS **E1** |
| 2 | **同時実行しない**（コスト比較は負荷条件を揃える。同時実行で約40%増の実測あり） | **E5** |
| 3 | 1回の呼び出し＝**1条件**（同一プロセスで条件を反復しない） | **E8** |
| 4 | config は台帳から読むスクリプトか（`loadConfigC()`＋`verifyE2()`） | **E10** |
| 5 | 新編成なら「エジソンで確立した定数」を**再測**する対象ではないか | **E9**・`ENGINE_INVARIANTS.md` §3 |
| 6 | 出力先 `simNN` は既存か新設か（**新設は REPO_STANDARDS §1 の振り分け判断**） | §1 |

### 2. 走らせる

```bash
node tools/skills/run_sim_experiment.mjs --exp exp_prefix_sweep --sim sim06            # 既存 sim へ追記
node tools/skills/run_sim_experiment.mjs --exp exp_beam_width_sweep --sim sim06 --args "384" --timeout 1800
node tools/skills/run_sim_experiment.mjs --exp exp_t1_abilcap_sweep --new-sim          # TEMPLATE から新設
node tools/skills/run_sim_experiment.mjs --exp exp_prefix_sweep --sim sim06 --dry-run  # 実行内容の確認だけ
```

⚠ **重い掃引は `run_in_background`**（edison ビーム 1ルート 43秒／napoleon configC 130〜138秒／BW384 1ルート 545秒）。
⚠ `--new-sim` を付けない限り**ディレクトリは作らない**（simNN を黙って増やさない）。

ツールが機械的にやること:

- 実行前後の `git status` を比べて**生成物**を検出
- 生ログ → `simulation/simNN/data/raw/<run-id>.log`
- provenance（HEAD・`ENGINE_VERSION`・config バナー・E2 の bit 一致・所要時間） → `data/run_manifest.json`
- 3 つの analysis md へ **`<!-- run_sim_experiment:begin <run-id> -->` 付きブロック**を追記
  （章番号はずらさない＝他文書からの参照を壊さないため）

### 3. 分析を書く（ここからが Claude の仕事）

ツールが置くのは**転記だけ**。2 層構造の責務どおりに埋める:

| ファイル | 書くもの | 書かないもの |
|---|---|---|
| `analysis/quantitative_analysis.md` | この走が答える問い・推定量・手法とスクリプト名 | 所感・統合判断 |
| `analysis/qualitative_analysis.md` | 観測の所感・未検証の主張・要る対照 | 数値演算 |
| `analysis/integrated_analysis.md` | 統合判断・Cx 起票/遷移・golden 影響・次アクション | 新規の集計・新規の所感 |

判断の作法:

- **差は絶対値で評価する**。順位の逆転だけで結論しない（E3）。
- **対照実験を取る前に結論を出さない**（E4）— 後処理が加算的なだけ、という型で実際に逆転した。
- `config バナーが無い` と警告が出たら、その数値は**どの条件で測ったか辿れない**＝分析へ採用する前に台帳駆動へ直す。
- `未コミットの変更がある状態で測っている` 警告は、HEAD だけでは条件を復元できないという意味。締める前に測り直す。
- 結論が出たら `CALIBRATION_ANALYSIS.md` の Cx 行（**状態と根拠の正**）を更新する。本文コピーで二重管理しない。

### 4. 新設した場合の追加作業

`simNN/README.md` は TEMPLATE のプレースホルダのまま。**6 章の構成は固定**（章を増やさない・不要な章は「該当なし」）:
① 主題と目的 ② sim フローと現在位置 ③ 測定環境 ④ 実機走フローと測定メニュー ⑤ クローズゲート ⑥ 更新履歴・md 相互参照。
md を新設したので、**そのセッションで `npm run doc:check` と `node tools/doc_refs.mjs --write` を走らせる**
（DOC_RELATION_PLAN §7 の即実行トリガ）。`sync-workspace-handoff` スキルの `--reset-counter` が両方を面倒みる。

## 制約

- **モデル修正は関連する測定が揃うまで着手しない**（部分修正は較正スカラに誤差を吸わせる）。
- trial（実機観測）とは別物。`data/trialNN.md` の複製と push は**ユーザーが行う**＝ツールで作らない。
