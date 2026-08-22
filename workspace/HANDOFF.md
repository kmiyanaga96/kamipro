# 引継ぎ — 現状スナップショット

> **種別**: 引継ぎ（現状スナップショット・有界） ／ **用途**: 新セッション起動時に **CLAUDE.md と本書のみ**を読めば「今どこにいて次に何をするか」が分かる状態を保つ。
> **次タスクの詳細リスト**は `workspace/TODO.md`。過去の経緯・provenance は `archive/SESSION_LOG.md`（オンデマンド）。
> **更新規律（セッション末）**: 本書は「今」だけを短く保つ。現状化した記述は `archive/SESSION_LOG.md` の先頭へ1ブロック畳み、本書は最新状態へ上書きする（規律は REPO_STANDARDS §6）。
>
> 最終更新: 2026-08-22（スキル5本＋運用規律 S1〜S10。Phase 9 は P3-1 完了・**P3-1b が次の着手点**）

---

## 現フェーズ ── **Phase 9（実機観測 intake の自動化）／P3-1 完了・次は P3-1b（読み取り＋検算）**

**sim05（Phase 4）は凍結**（2026-08-07 ユーザー決定）。憲法＝「**観測と判断はユーザー／導出・分析は Claude Code／転記・検算・整形はツール**」。
計画の正＝[PHASE9_PLAN.md](../PHASE9_PLAN.md)（一次設計＝`TRANSCRIPTION_DESIGN.md`）。

| 段 | 状態 |
|---|---|
| **P0** 先行整備 ／ **§10** 確定仕様 | ✅ 完了（⚠§10 の変更にはユーザー承認が要る） |
| **P1** 実測ゲート | ✅ 通過（2026-08-14）＝進む |
| **P2** 抽出基盤 | ✅✅ 通過（2026-08-19・出口確認済）。P2-1 / 1b / 1b′ / 3 / 5 / 5b ✅ ／ P2-2 ❎close ／ P2-4 ➡️P3-2 |
| **P3** OCR＋検算 | ⏳ **ここ**。P3-0 設計 ✅ ／ P3-1 アトラス取得 ✅（2026-08-22） ／ **P3-1b 読み取り＋検算 ⏳＝次の着手点** |

## 1. 直近の実装内容

**本セッション＝ワークフロー自動化**（ユーザー指示）。**シム本体・T1 実装ともに未変更**＝振る舞いは1行も動いていない。

| 層 | 変更 | 証拠 |
|---|---|---|
| スキル定義 | `.claude/skills/` に4本（`check-engine-invariants` / `run-sim-experiment` / `sync-workspace-handoff` / `verify-transcribe-pipeline`）。`.gitignore` を `.claude/*` ＋ `!.claude/skills/` へ | — |
| 実体 | `tools/skills/*.mjs` 4本 ＋ `tools/skills/lib/skill_util.mjs`（**Node 標準のみ**＝E7）＋ `tools/skills/baselines/t1_baseline.json` | 静的検査 **負のテストで5種の発火を確認** |
| 索引・台帳 | `tools/skills/README.md` 新設／`tools/README.md` §5 新設／`CLAUDE.md` に登録行・`npm run skill:*`・更新履歴 | `doc:check` 現役層 **0 件**（グリーン） |
| 検査ツール | `tools/doc_refs.mjs` が `.claude/` と `tools/skills/.reports/` を検査対象外へ | スキル本文に被参照ブロックを注入しない |
| **オーケストレーター** | **`skills-doctor`**（`tools/skills/skill_doctor.mjs`）＝5点整合／description 予算／**検査の根拠**／**関門の緩み**／必要性／発火確認／スモーク。関門の台帳＝`tools/skills/baselines/guardrails.json`（変更は `--reason` 必須） | 違反0・警告0 |
| **発火確認** | `tools/skills/negative_tests.mjs`＝`SKILL_ROOT` でサンドボックスへ複製し**わざと壊す**（本物のリポジトリは触らない） | **13/13 通過**（invariants 7・doctor 4・clean 2） |
| **運用規律** | `tools/skills/README.md` §4 に **S1〜S10**。**S1〜S5 は機械が見張り・S6〜S10 は人**と明示 | — |

**回帰**: `test:golden` **3/3**（202,005,923 / 215,161,915 / 299,523,354）・`test:t1` **337件**・`doc:check` グリーン。

**★副産物**: `doc_refs.mjs --write` で**既存の被参照ブロック4本の陳腐化**を検出・解消
（`workspace/HANDOFF.md`・`workspace/TODO.md` がもう参照していない先が `cath_palug.md`・`catastrophia_light.md`・
`simulation/README.md`・`simulation/sim05/analysis/integrated_analysis.md` に残っていた）。**手書きしない設計が効いた実例**。

**★実装中に踏んだ罠**（同型を繰り返さないため）: 文字列リテラルを見る検査で `stripJs`（文字列も潰す）を使うと
**検査が黙って空振りする**（import 文のパス文字列の中身まで潰れる）。負のテストを書いていなければ気付けなかった。
∴ `tools/skills/lib/skill_util.mjs` は `stripJs`（識別子だけ見る）と `stripComments`（文字列を見る）を**使い分ける**。

## 2. 現在の課題・ブロッカー

| # | 課題 | 状態 / 誰待ち | 根拠 |
|---|---|---|---|
| 1 | **緩い囲み2枚の教え直し**＝誤り6件中5件が2枚に集中（`5,125,605` 153.53s ／ `5,553,703` 25.33s）。他11枚は誤0 | ⏳ **👤 ユーザー待ち**（依頼本文＝PHASE9_PLAN §4.3.1） | 実切り抜き14枚・101点で 正80/曖昧15/誤6 |
| 2 | 混同は **`3`/`5` の対**が中心。枚数の薄い字＝`7`×6 | ⏳ ①と同じ受領で解消しうる | `tools/fixtures/t1_glyph_atlas_M3-1.json` の `samples` |
| 3 | **決定性の残差 0.2%**（走ごとに 3506〜3515 フレーム） | ⏳ P5 の受入で確定（出口条件ではない） | P2 の持ち越し |
| 4 | HP 違反の残り5件（遮蔽が空区間検査を通る型・**0.16%**） | ⏳ 低優先 | 3090 フレーム中5件 |
| 5 | sim05 の本丸 **C40 / C41 / C44** は open のまま（**意図的コスト**＝Phase 9 先行のため凍結） | ⏸ 凍結中 | `CALIBRATION_ANALYSIS.md` の Cx 行が正 |
| 6 | 新設スキルは**まだ実戦を1周していない**（エンジン改修・重い掃引で通していない） | ⏳ 次にエンジン/実験を触るとき | `workspace/TODO.md`「スキル」節 |
| 7 | **S6〜S10 は機械化できていない**（同時実行しない・simNN 新設の判断・HANDOFF の言語化・緑を信じすぎない・スキルを増やしすぎない） | ⏳ **人が見る**と明示済み | `tools/skills/README.md` §4 |

⚠ ユーザー手元の**アトラスJSON（v0.35.0・cell 12×20）は世代が古い**＝受け取ってもそのままは使わない。
正は `tools/fixtures/t1_glyph_atlas_M3-1.json`（cell 16×26・カンマを覚えない）。新しい切り抜きが来たら
`node tools/t1_teach_probe.mjs --atlas … --source … <切り抜き>.json` で**作り直す**（手順＝`tools/README.md` §4）。

## 3. 次回の Next Steps

1. **⏳ P3-1b 読み取り＋検算**（Phase 9 の本線）＝[PHASE9_PLAN.md](../PHASE9_PLAN.md) §4 P3-1b。
   切り抜きが無くてもフィクスチャの `samples` 101点で **`leaveOneTeachingOut` がオフラインで回る**＝
   照合パラメータの掃引は続行できる。関門＝`npm run test:t1` [16-15]（誤≦6 / 正≧80 / 曖昧≦20）を**締める方向にだけ**動かす。
2. **👤 緩い囲み2枚の教え直しを依頼**（枚数を足すより効く。①2枚の教え直し ②`3`/`7` を含む表示 ③条件を混ぜる）。
3. **スキルを実戦で1周する**（`workspace/TODO.md`「スキル」節）。エンジンを触るセッションでは
   `npm run skill:invariants`（golden 込み 2分20秒・**背景実行**）を、検査や閾値を触ったら
   `npm run skill:doctor` を締めの手順に入れる（回し方＝`tools/skills/README.md` §4.2）。
4. DOC_RELATION_PLAN の完了条件③（常駐サブタスク2周）— 本セッションで**トリガ該当のため 0 リセット**済み。

**ポインタ**: 成果物＝`transcribe/index.html` ＋ `src/transcribe/*.js`（12本・**シム本体と非結線＝golden に非干渉**）。
工具の版＝**T1 v0.36.0**。オフライン検証＝`tools/t1_teach_probe.mjs` ＋ `tools/lib/png.mjs`。
スキルの索引＝[tools/skills/README.md](../tools/skills/README.md)。

---

## 更新履歴

<!-- 直近5件のみ（それ以前は git log）。「波及確認」列が本体＝git が持たない情報はここだけ。 -->

| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-05 | 末尾ブロックを新設（DOC_RELATION_PLAN S4・種別=現状スナップショット） | 参照関係は `npm run doc:check` がグリーン |

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 5）

- [CLAUDE.md](../CLAUDE.md)
- [DOC_RELATION_PLAN.md](../DOC_RELATION_PLAN.md)
- [REPO_STANDARDS.md](../REPO_STANDARDS.md)
- [simulation/sim05/README.md](../simulation/sim05/README.md)
- [workspace/TODO.md](./TODO.md)

_他に 凍結sim/archive/essays から 2 件（更新対象外）_
<!-- doc_refs:end -->
