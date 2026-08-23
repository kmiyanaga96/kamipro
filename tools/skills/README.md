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
| **skills-doctor**<br>`skill_doctor.mjs` | **スキル群そのものの点検**（オーケストレーター）＝登録の5点整合／description 予算／検査の根拠／関門の緩み／必要性／発火確認／スモーク。§4 の運用規律のうち**機械で見られるものを全部見る** | 約20秒（`--quick` で1秒未満） |
| （実体のみ）<br>`negative_tests.mjs` | **検査器の発火確認**（13ケース）。`SKILL_ROOT` でサンドボックスへ複製し、わざと壊して検査が鳴るかを見る。**本物のリポジトリは触らない** | 約15秒 |

npm 経由でも同じ:

```bash
npm run skill:invariants -- --skip-golden
npm run skill:experiment -- --exp exp_prefix_sweep --sim sim06
npm run skill:handoff -- --bump-counter
npm run skill:transcribe
npm run skill:doctor -- --quick
npm run skill:negtest
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

## 4. 運用規律（オーケストレーション）── 何を機械が見て、何を人が見るか

**この節が「スキルで開発を進めるときの正」**。各条に「見張り」を書き、機械が見られるものは `skills-doctor` の
どの区分が見るかを明記した。⚠ **見張りが「人」の条は、機械化できていないという意味**＝そこだけは意識して守る。

| # | 規律 | 見張り |
|---|---|---|
| **S1** | **規定が正・スキルは写し**。検査を足す/変えるときは `ENGINE_INVARIANTS.md`・`REPO_STANDARDS.md` を**先に**更新する | 機械 `[C] 検査の根拠`（`doc:` の節が実在するか） |
| **S2** | **検査を足したら負のテストを足す**。ケースの無い検査は「あるだけ」で信用しない | 機械 `[F] 発火確認`（`negative_tests.mjs`） |
| **S3** | **関門は締める方向にだけ動かす**。golden 期待値・`test:t1` [16-15]・T1 ベースラインを緩めない | 機械 `[D] 関門の緩み`（台帳＝`baselines/guardrails.json`・変更は `--reason` 必須） |
| **S4** | **登録は5点で揃える**（SKILL.md／実体／npm script／本 README／CLAUDE.md・tools/README §5）＝同一コミットで | 機械 `[A] 5点整合` |
| **S5** | **description は短く**（1本 ≤300字・合計 ≤1200字）。全セッションの起動時に読まれる恒常コスト | 機械 `[B] 予算` |
| **S6** | **スキルは資産ではなく維持コスト**。新設は「同じ手順を**手で3回**やってから」。使われなくなったら消す | 機械 `[E] 必要性`（最終実行日）＋ **人**（消す判断） |
| **S7** | **実験は同時実行しない**（E5）。重い掃引は1本ずつ・背景実行 | **人**（ツールは他プロセスを知らない） |
| **S8** | **simNN の新設は振り分け判断**（REPO_STANDARDS §1）。`--new-sim` を惰性で使わない | **人**（ツールは明示フラグを要求するだけ） |
| **S9** | **HANDOFF の中身は言語化が本体**。コミット数とファイル一覧の羅列で済ませない。検品は「2. 課題・ブロッカーに**誰待ち**が書いてあるか」 | **人** |
| **S10** | **緑を信頼しすぎない**。静的検査が見るのは機械判定できるものだけで、「その変更が仕様として正しいか」は一次情報（`gamedata/md/`）と `ENGINE_INVARIANTS.md` §1 に照らす | **人** |

### 4.1 なぜ「文書だけ」にしなかったか

規律を文書に書くだけなら、**それを読むのは検査を素通りさせた当人（Claude）**なので、同じ失敗を止められない。
実際、初版で `app.js の export 漏れ検査` と `ESM Worker 検査` は**常に ✅ を返していた**（`stripJs` の取り違え）。
文書に「気を付ける」と書いても発見できなかった類で、**わざと壊して鳴らす**以外に確かめる方法がない。
∴ S1〜S5 は機械へ、S6〜S10 は「機械化できていない」と明示して人に残す — **どちらかを曖昧にしない**のが要点。

### 4.2 セッションでの回し方（典型）

```bash
# 着手前（エンジン層を触るとき）
npm run skill:invariants -- --skip-golden      # 数秒。今の状態が汚れていないかを見る

# 締める前
npm run skill:invariants                       # golden 込み 2分20秒・背景実行
npm run skill:doctor                           # スキル側の健全性（検査を触ったなら必須）

# セッション末
npm run skill:handoff -- --bump-counter        # md 新設があったなら --reset-counter
```

---

## 更新履歴

| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-22 | **`skills-doctor` と `negative_tests.mjs` を追加＋§4 運用規律を制定**。スキル群の乖離（登録漏れ・description 肥大・根拠の無い検査・関門の緩み・未使用・素通り・起動不能）を1本で見るオーケストレーターにした。`baselines/guardrails.json` を新設し、関門の変更は `--reason` を要求する | **負のテスト 13/13 通過**（invariants 7 ＋ doctor 4 ＋ clean 2）。⚠ 実装中に2件の穴を自分で検出＝①サンドボックスに規定 md を入れ忘れ **clean が doc-anchor-missing で落ちた**（＝検査の失敗と読み違える罠） ②末尾の npm script を消すパッチが **trailing comma で JSON を壊し**別の失敗になった（doctor 側も落ちないよう硬化）。`src/`・`gamedata/js/` 未変更＝**golden 3/3 不変** |
| 2026-08-22 | 新設（4スキル＋`lib/skill_util.mjs`＋`baselines/t1_baseline.json`）。`.gitignore` を `.claude/*` ＋ `!.claude/skills/` へ変更しスキル定義を共有対象に。`tools/doc_refs.mjs` は `.claude/` を検査対象外へ | 静的検査は**負のテストで5種の発火を確認**（TDZ・キャラ名リテラル・`_refineRoute`・export 漏れ・golden 期待値）。クリーン状態で違反0・`test:t1` 337件・`doc:check` 現役層グリーン。`src/`・`gamedata/js/` 未変更＝**golden 3/3 不変** |

---

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 3）

- [CLAUDE.md](../../CLAUDE.md)
- [workspace/HANDOFF.md](../../workspace/HANDOFF.md)
- [workspace/TODO.md](../../workspace/TODO.md)

_他に 凍結sim/archive/essays から 1 件（更新対象外）_
<!-- doc_refs:end -->
