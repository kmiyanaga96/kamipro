# 引継ぎ — 現状スナップショット

> **種別**: 引継ぎ（現状スナップショット・有界） ／ **用途**: 新セッション起動時に **CLAUDE.md と本書のみ**を読めば「今どこにいて次に何をするか」が分かる状態を保つ。
> **次タスクの詳細リスト**は `workspace/TODO.md`。過去の経緯・provenance は `archive/SESSION_LOG.md`（オンデマンド）。
> **更新規律（セッション末）**: 本書は「今」だけを短く保つ。現状化した記述は `archive/SESSION_LOG.md` の先頭へ1ブロック畳み、本書は最新状態へ上書きする（規律は REPO_STANDARDS §6）。
>
> 最終更新: 2026-08-14（CLAUDE.md 分冊セッションの申し送りを追補）

---

## 現フェーズ ── **Phase 9（実機観測 intake の自動化）**

**2026-08-07 に注力先を切り替えた**（ユーザー決定）。**sim05（Phase 4）は凍結**し、**転記の自動化基盤を先に作る**。

**なぜ**: 転記コストが較正全体の律速で、**分担が逆だった**（人間が機械的作業を担っていた）。
**憲法**＝「**観測と判断はユーザー／導出・分析は Claude Code／転記・検算・整形はツール**」。
系として「**既に記録されたものから導けることは二度と人に訊かない**」。

**計画の正＝[PHASE9_PLAN.md](../PHASE9_PLAN.md)**（一次設計＝`TRANSCRIPTION_DESIGN.md`）。

## ⏳ 次の一手 ── **P1 実測ゲート（ユーザー作業）**

**静止画3枚 ＋ `ffprobe -hide_banner <file>` の出力**を共有してもらう（`PHASE9_PLAN.md` §4 P1）。

| # | 共有物 |
|---|---|
| 1 | ①HPバー＋%表示の周辺 ②多段ヒットが重なっている瞬間 ③`CRITICAL!`/`STING!` が出ている瞬間 |
| 2 | `ffprobe` の出力テキスト（fps・VFR か・解像度） |

⚠ **これが進む/降りるの分岐点**（撤退条件＝同 §9.2）。⚠ **Claude はコンテナ内で動画を見られない**＝サンプル共有が唯一の設計手段。
⚠ **動画は git に入れない**（セッションへの共有は可）。

**急がなくてよい**＝**録画を貯めるほうが優先**（`PHASE9_PLAN.md` §4.0.1 のチェックリストを守れば後から全部処理できる）。

## 進捗（Phase 9）

| 段 | 状態 | 中身 |
|---|---|---|
| **P0** | ✅ 完了 | **E11**（走の無効化条件）／**録画時チェックリスト**／`TRANSCRIPTION_DESIGN.md` 解凍＋陳腐化訂正 |
| **§10** | ✅ 確定 | 実行場所／ツール類型と関門／**動画は共有しない**／trial・analysis の新構造／**エラー診断仕様**／**フロー10工程**。⚠**変更にはユーザー承認が要る** |
| **P1** | ⏳ **現在ここ** | 上記 |
| P2〜P5 | ⏳ | 抽出基盤（AI不要）→ OCR＋検算 → config 版管理 → 受入 |

**§10 の決定で押さえておくこと**（詳細は `PHASE9_PLAN.md` §10）:
- **録画転記は Webアプリの新規ページ**（動画がPCから出ない／シムエンジンが既にあり検算②がその場で回る／
  **固定ビットマップフォント＝テンプレートマッチング**＝**パイプラインから AI が消える**）。シム本体と golden に**非干渉**。
- **エラーは `<ツールID>-<stage>-<3桁>`** で構造化し、**部分成功を必ず保全**（走をやり直さない）。
- **フローはユーザーが数値を入力する工程がゼロ**／**Claude は工程9から登場**＝intake は Claude の可用性に律速されない。

## ⏸ sim05 は凍結中（2026-08-07〜）

**M3〜M6 の実走・分析は Phase 9 完成まで止める**（`PHASE9_PLAN.md` §8）。
**C40 / C41 / C44 は open のまま**＝**意図的に受け入れたコスト**。
**凍結解除**＝P5 受入通過、または P1 で降りた場合の代替路線確定。

⚠ **ランクアップで走を捨てない**（**E11**＝ノイズ床の 1/1000。M3 が実際にこれで中断・再取得された）。
⚠ **録画は貯めてよい**（§4.0.1 のチェックリスト＝**config を「書く」から「映す」へ**）。

**sim05 の到達点**（凍結時点）: M1・M2 完了＝**C40 を編成横断＋敵横断で確定**（cap では解けない）／
**C44 を分解**（アリアンだけ ×0.83）／**C42 確定**（`alone`3・`legend`3）／**C45・C47〜C50 を起票**。
詳細は `simulation/sim05/README.md` §2.2（現在位置）と `simulation/sim05/analysis/integrated_analysis.md`（統合の正）。

## アクティブ作業ライン

| ライン | 状態 | 次アクション |
|---|---|---|
| **★Phase 9** | ⏳ P1 ゲート | **静止画3枚＋ffprobe**（ユーザー） |
| sim05（M3〜M6 / C40・C41・C44） | ⏸ 凍結 | Phase 9 完成後 |
| `configC_slot.json` の受領 | ⏳ 長期未受領 | Phase 9 の **P4** で効く（幻獣枠・サブ枠・ウェポンが1本で埋まる） |
| サポート幻獣の加護が全量スタックするか | ⏳ 未確認 | シムの前提。外れると全成分が一律 ×0.83 |
| override の再fit／他ハーネスの数値再取得 | ⏳ 着手禁止 | C40/C41/C44 確定後に1回だけ |
| Phase 8 アクセ実装 | ⏳ intake ゲート | — |

## ドキュメント・ポインタ

- **開発ルール・コード地図・確定仕様・検証**: `CLAUDE.md`（本書と対で必読）
  ／**不変条件の詳細**: `ENGINE_INVARIANTS.md`（§1 ゲーム仕様・§2 実装不変条件・§3 転移可能性＝**該当コードを触るときだけ開く**）
- **Phase 9**: `PHASE9_PLAN.md`（**§10 確定仕様**・§4 段階計画）／`TRANSCRIPTION_DESIGN.md`（一次設計）
- **較正の Cx**: `CALIBRATION_ANALYSIS.md`（**C37/C38/C40〜C49 が open**・C50 は closed）
- **sim05**: `simulation/sim05/README.md`（**6章構成**・§2.2＝現在位置）／`simulation/sim05/analysis/integrated_analysis.md`（統合の正）
- **実験・計測の作法**: `REPO_STANDARDS.md` §6 **E1〜E11**（着手前に通す）
- **過去の経緯**: `archive/SESSION_LOG.md`（**2026-08-14 ブロックが最新**）

## 検証（作業後は必ず）

```bash
npm run test:golden   # edison/raw 202,005,923・edison/cal 215,161,915・napoleon/static 299,523,354（全 FB10/10）
npm run doc:check     # md 相互参照（現役層に壊れた参照があれば exit 1）
```
⚠**golden は実測 2分07秒**（背景実行を推奨）。docs のみの変更なら golden は不変。
`_replayResult`/`_execKey`/`clone`/`_snapshotForReplay` を触ったら **`node tools/exp_ls_incremental_verify.mjs`（約4分）も回す**。

---

## 更新履歴

<!-- 直近5件のみ（それ以前は git log）。「波及確認」列が本体＝git が持たない情報はここだけ。 -->

| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-14 | **2026-08-14 の CLAUDE.md 分冊セッションを追補**（`ENGINE_INVARIANTS.md` へのポインタ追加・SESSION_LOG の最新ブロック表記を更新）。**Phase 9 の現在地は不変**＝P1 ゲート待ち | ★**申し送り漏れを検出して埋めたもの**＝当該セッションは `CLAUDE.md`/`ENGINE_INVARIANTS.md` の更新履歴だけを書き、**SESSION_LOG・HANDOFF・TODO を更新せずに終了していた**。実害は台帳の記録漏れのみ（`doc_refs --write`・`doc:check` は実行済み）。golden 3/3 不変（`src/`・`gamedata/js/` 未変更） |
| 2026-08-07 | **セッション末クローズ＝本書を Phase 9 中心へ全面書き換え**（317行→約100行）。当日の成果8ブロックは `archive/SESSION_LOG.md` の 2026-08-07 ブロックへ畳んだ | **新セッションは「現フェーズ→次の一手」の2節だけ読めば動ける**状態にした。sim05 の到達点は1段落へ圧縮し、詳細は sim05 README §2.2 と integrated_analysis へポインタ化。golden 3/3 不変・doc:check 現役層グリーン |
| 2026-08-07 | Phase 9 採番・sim05 凍結・§10 確定仕様を反映 | 詳細は SESSION_LOG 2026-08-07 |
| 2026-08-06 | M2（trial01）受領・分析完了を反映 | 統合の正を `integrated_analysis.md` へ切り替え |

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 5）

- [CLAUDE.md](../CLAUDE.md)
- [DOC_RELATION_PLAN.md](../DOC_RELATION_PLAN.md)
- [REPO_STANDARDS.md](../REPO_STANDARDS.md)
- [simulation/sim05/README.md](../simulation/sim05/README.md)
- [workspace/TODO.md](./TODO.md)

_他に 凍結sim/archive/essays から 1 件（更新対象外）_
<!-- doc_refs:end -->
