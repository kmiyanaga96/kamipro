---
name: sync-workspace-handoff
description: セッション末の workspace/ 同期。git 差分（未コミット含む）とコミット履歴を解析し、workspace/TODO.md のチェックボックスと md リレーション点検カウンタを更新、workspace/HANDOFF.md を「直近の実装内容 / 現在の課題・ブロッカー / 次回の Next Steps」の3項目で上書きする。キリの良いタイミングや引継ぎ前に使う。
---

# sync-workspace-handoff

## いつ使うか

セッション末、またはキリの良いタイミング。規律の正は **REPO_STANDARDS §6「セッション末」(3〜6)**。

## 手順

### 1. 収集（リポジトリ無改変）

```bash
node tools/skills/sync_workspace_handoff.mjs
```

出るもの: ブランチ・基点からのコミット・**層別**の変更ファイル・未コミット・
md の新設/改名（＝doc:check の**即実行トリガ**判定）・点検カウンタの現在値・
TODO の未了/完了・**完了かもしれない項の候補**（語の重なりによる提案）・HANDOFF ドラフト。

### 2. TODO を締める

候補は**提案であって確定ではない**。実際に完了したか差分で裏を取ってから:

```bash
node tools/skills/sync_workspace_handoff.mjs --check-todo "P3-1b 読み取り"   # 一意に当たる部分文字列で指定
```

一致が複数あるときツールは触らない（より長い部分文字列を指定する）。
⚠ **完了項は `[x]` にしたうえで `archive/SESSION_LOG.md` へ畳み、TODO からは削除する**のが規律。
削除と SESSION_LOG への要約は**判断**なので Claude が書く（`--fold-session-log <md>` が先頭への挿入だけ担う）。

### 3. 点検カウンタ（DOC_RELATION_PLAN §7）

```bash
node tools/skills/sync_workspace_handoff.mjs --bump-counter    # 非トリガのセッション＝+1
node tools/skills/sync_workspace_handoff.mjs --reset-counter   # md 新設/改名/archive 移動があった＝doc:check を走らせて 0 へ
```

md を新設・改名したら **`node tools/doc_refs.mjs --write`**（被参照ブロックの再生成・冪等）も走らせる。
現役層の壊れた参照が出たら**そのセッションで直す**（凍結 sim01〜04 と archive の警告は対象外）。

### 4. HANDOFF を書く（ここが Claude の仕事）

ツールは `tools/skills/.reports/handoff_draft_*.md` に**器だけ**を作る。3 項目を埋める:

1. **直近の実装内容** — 何を作り/直したか。**証拠を必ず併記**（golden 3/3・test:t1 337件・doc:check グリーン等）。
2. **現在の課題・ブロッカー** — 次の人が同じ壁に当たらないように。**誰待ちか**（ユーザーの実機観測待ち／受領待ち）を明示。推測は推測と書く。
3. **次回の Next Steps** — 優先順に。**手順は書かない**（手順の正は各計画 md、一覧は `workspace/TODO.md`）。

書くときの規律:

- HANDOFF は「**今**」だけを有界に保つ。現状化した経緯は `archive/SESSION_LOG.md` の**先頭**へ畳む（最新が上）。
- 冒頭のヘッダブロック（種別・用途・更新規律・最終更新）は残す（REPO_STANDARDS §4）。
- 状態（open/fixed）を本文へ書き写さない。**Cx を参照する**（正は `CALIBRATION_ANALYSIS.md`）。
- ツールが出した数値（コミット数・ファイル数）をそのまま並べただけの HANDOFF にしない。**何が進んだか**を書く。

反映:

```bash
node tools/skills/sync_workspace_handoff.mjs --apply-handoff tools/skills/.reports/handoff_draft_<stamp>.md
node tools/skills/sync_workspace_handoff.mjs --fold-session-log <畳むブロック>.md   # 任意
```

`--apply-handoff` は必須3項目とヘッダの有無を検査してから差し替える（旧版は `.reports/` へバックアップ）。

## 制約

- **CLAUDE.md には現状・次タスクを書かない**（安定リファレンス。変動情報は `workspace/` と SESSION_LOG が持つ）。
- 新規タスクを TODO に足すときは **REPO_STANDARDS §1 の振り分けを通してから**。
- エンジン層に触れたセッションなら、締める前に `check-engine-invariants` を通す（golden の証拠が HANDOFF の 1. に要る）。
