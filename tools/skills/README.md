# tools/skills/ — カスタムスキルの実体（ワークフロー自動化）

> **種別**: 規定・台帳 ／ **ゴール**: 「毎セッション同じ手順を人が思い出す」ことをやめ、規約に定めた検査・転記・整形を**機械が同じ順で**回す状態を保つ ／ **完了条件**: なし（生きた台帳・規約が変わったら追随）
> **状態**: 生きた台帳
> 作成 2026-08-22 ／ 関連: [REPO_STANDARDS.md](../../REPO_STANDARDS.md) §1・§6（E1〜E11）・[CLAUDE.md](../../CLAUDE.md)・[ENGINE_INVARIANTS.md](../../ENGINE_INVARIANTS.md)

---

## 0. 構成（なぜ2層か）

| 層 | 置き場所 | 責務 |
|---|---|---|
| **スキル定義**（Claude が読む手順書） | `.claude/skills/<name>/SKILL.md` | いつ使うか・何を判断するか・規約のどの節に照らすか |<!-- doc_refs:ignore-line ─ .claude/ は doc_refs の検査対象外 -->
| **実体**（機械がやること） | `tools/skills/<name>.mjs` | 検出・実行・突合・転記・整形。**判断はしない** |

**分けた理由**は PHASE9_PLAN の憲法と同じ ──「観測と判断はユーザー／導出・分析は Claude／**転記・検算・整形はツール**」。
実体を `tools/` に置くことで ①npm から直接叩ける ②`.claude/` を使わない経路（CI・手動）でも同じ検査が回る
③スキル本文を短く保てる（読み込みのたびに長文を読ませない）。

⚠ **依存は Node 標準のみ**（E7＝外部コマンドの存在を前提にしない）。使うのは `node` と `git` だけ。

## 1. スキル一覧

| スキル / 実体 | 何をするか | 実測コスト |
|---|---|---|
| **check-engine-invariants**<br>`check_engine_invariants.mjs` | 不変条件の静的検査 8 種（TDZ・キャラ名リテラル・`_refineRoute` 結線・app.js export 漏れ・ESM Worker・ホットパス走査順・golden 期待値の台帳同期・`ENGINE_VERSION`）＋ `test:t1` ＋ `test:golden`（`--full` で `exp_ls_incremental_verify`） | 静的のみ 数秒／golden 込み **2分20秒**／`--full` **+約4分** |
| **run-sim-experiment**<br>`run_sim_experiment.mjs` | `tools/exp_*.mjs` を1条件=1プロセスで実行し、生ログ・provenance（HEAD/`ENGINE_VERSION`/config バナー/E2）・数値行を `simulation/simNN/` の TEMPLATE 様式へ転記 | 実験の所要時間＋1秒未満 |
| **sync-workspace-handoff**<br>`sync_workspace_handoff.mjs` | git 差分（未コミット含む）とコミットを層別に集計し、TODO のチェックボックス／点検カウンタを転記、HANDOFF ドラフト（3項目）を生成・検査つきで反映 | 1秒未満（`--doc-check` 込みで数秒） |
| **verify-transcribe-pipeline**<br>`verify_transcribe_pipeline.mjs` | `tools/fixtures/` の実走フィクスチャで glyph（1回抜き）・hp_bar（塗り率）・ROI 9枠を測り、ベースラインとの精度差分・検査の消滅・パースエラーを報告 | 約15秒（`--skip-selftest` で1秒未満） |

npm 経由でも同じ:

```bash
npm run skill:invariants -- --skip-golden
npm run skill:experiment -- --exp exp_prefix_sweep --sim sim06
npm run skill:handoff -- --bump-counter
npm run skill:transcribe
```

## 2. 共通の約束

- **判断を書かない**: ツールが出すのは観測値と「規定のどの節に反しているか」まで。修正方針の決定は Claude/ユーザー。
- **既定は無改変**: `sync_workspace_handoff.mjs` は明示フラグ（`--check-todo` / `--bump-counter` / `--apply-handoff` 等）を
  付けたときだけ書き込む。`run_sim_experiment.mjs` は `--new-sim` を付けたときだけ simNN を作る。
- **レポートは `tools/skills/.reports/`**（git 管理外）。機械可読 JSON と HANDOFF ドラフトが溜まる。
- **ベースラインは `tools/skills/baselines/`**（git 管理下）。`t1_baseline.json` が T1 精度の基準。
  退行がある状態では更新しない（`--force` が要る）＝**退行を焼き付けないための安全弁**。
- 検査 ID（`tdz-immediate-field` 等）は**ツール内のチェック名**。REPO_STANDARDS §3 の文書 ID 体系とは別軸で、新接頭辞の発明ではない。

## 3. 検査を足すとき

1. **規定を先に更新する**（`ENGINE_INVARIANTS.md` / `REPO_STANDARDS.md`）。ツールは規定の写しであって、正ではない。
2. 実体へ検査を足し、**負のテストで発火を確認する**（わざと壊して検出されることを見る）。
   ⚠ 実際に踏んだ罠: 文字列リテラルを見る検査で `stripJs`（文字列も潰す）を使うと**検査が黙って空振りする**。
   文字列を見るなら `stripComments`、識別子だけ見るなら `stripJs` を使う（`lib/skill_util.mjs`）。
3. クリーンな状態で**全件グリーン**になることを確認する（誤検出のある検査は使われなくなる＝`doc_refs.mjs` 初版の教訓）。
4. スキル定義（`.claude/skills/<name>/`）の表と本 README の一覧を同一コミットで更新する。<!-- doc_refs:ignore-line -->

---

## 更新履歴

| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-22 | 新設（4スキル＋`lib/skill_util.mjs`＋`baselines/t1_baseline.json`）。`.gitignore` を `.claude/*` ＋ `!.claude/skills/` へ変更しスキル定義を共有対象に。`tools/doc_refs.mjs` は `.claude/` を検査対象外へ | 静的検査は**負のテストで5種の発火を確認**（TDZ・キャラ名リテラル・`_refineRoute`・export 漏れ・golden 期待値）。クリーン状態で違反0・`test:t1` 337件・`doc:check` 現役層グリーン。`src/`・`gamedata/js/` 未変更＝**golden 3/3 不変** |

---

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 3）

- [CLAUDE.md](../../CLAUDE.md)
- [workspace/HANDOFF.md](../../workspace/HANDOFF.md)
- [workspace/TODO.md](../../workspace/TODO.md)
<!-- doc_refs:end -->
