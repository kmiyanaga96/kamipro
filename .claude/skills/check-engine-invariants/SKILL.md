---
name: check-engine-invariants
description: src/sim.js・src/constants.js・gamedata/js/・test/golden.mjs を触ったときのエンジン不変条件チェック。ENGINE_INVARIANTS.md と CLAUDE.md 開発ルールの制約を静的検査し、golden（3 fixture）と test:t1 を実行して、違反をファイル・行・修正案つきで報告する。エンジン改修・キャラ追加・較正値の再fit・リファクタの完了前に必ず使う。
---

# check-engine-invariants

## いつ使うか

**エンジン層（`src/`・`gamedata/js/`・`test/golden.mjs`）に触れた変更を締める前**に必ず。
docs だけの変更なら不要（golden は不変）。判断に迷ったら走らせる — 静的検査だけなら数秒で終わる。

## 手順

### 1. 制約をコンテキストへ読み込む

検査を走らせる**前**に、触った層に対応する規定を開く（全文を読まない — 該当節だけ）。

| 触ったもの | 開く節 |
|---|---|
| `src/sim.js` の探索（`_stepStatic` / `_candidates` / `cmpVec` / ビーム） | `ENGINE_INVARIANTS.md` §2.1・§2.2 |
| 局所探索（`_localSearchRoute` / `_LSReplay` / `_execKey` / `_replayResult` / `clone`） | `ENGINE_INVARIANTS.md` §2.3 ＋ CLAUDE.md「検証方法」の⚠ |
| `gamedata/js/characters.js`（キャラ追加・変更） | CLAUDE.md 開発ルール §1（TDZ・state 宣言・汎用フック） |
| ダメージ枠・較正値 | `ENGINE_INVARIANTS.md` §1 ＋ `CALIBRATION_ANALYSIS.md` の該当 Cx |
| Worker・ビルド | `ENGINE_INVARIANTS.md` §2.4 |
| 新編成での定数・パラメータ | `ENGINE_INVARIANTS.md` §3（**エジソンで測った値は転移しない**＝再測） |

### 2. 走らせる

```bash
node tools/skills/check_engine_invariants.mjs --skip-golden    # 静的検査 + test:t1（数秒）＝作業中はこれ
node tools/skills/check_engine_invariants.mjs                  # + golden 3 fixture（2分07秒）＝締める前
node tools/skills/check_engine_invariants.mjs --full           # + exp_ls_incremental_verify（+約4分）
```

⚠ **golden を含む実行は 2分を超える＝`run_in_background` で回す**（前景の 600 秒上限に近い）。
⚠ `_replayResult` / `_execKey` / `clone` / `_snapshotForReplay` を触ったら **`--full` が必須**（`[1.8]` が警告する）。
⚠ `--base <ref>` で差分の基点を変えられる（既定 `origin/main` → `main` → `HEAD~1`）。

### 3. 出力を読む

`[1.1]`〜`[1.8]` が静的検査、その下が回帰。違反は **`id` / 根拠（規定の節）/ ファイル:行 / 修正案** の形で出る。
機械可読レポートは `tools/skills/.reports/invariants_*.json`。

| id | 意味 |
|---|---|
| `tdz-immediate-field` | オブジェクトリテラルの即時評価フィールドで `BG`/`DMG`/`GEAR` を参照＝**循環インポートで UI 全消失** |
| `char-literal-in-engine` | エンジン本体にキャラ名リテラル＝汎用フックへ移す |
| `refine-route-wiring` | `_refineRoute` を呼んでいる＝production 非経路（新規結線禁止） |
| `app-export-missing` | app.js の export 漏れ＝**Worker 側でだけ落ちる**（UI では気付けない） |
| `esm-worker-init` | `new Worker(new URL(…),{type:'module'})` の形が壊れた |
| `hotpath-scan-order` | ホットパスが `ABIL_KEYS` 1パス走査でない＝走査順が変わると最適押し順がズレる |
| `golden-expectation-sync` | golden の期待値が CLAUDE.md「検証方法」表に無い＝**表が正**・同一コミットで揃える |
| `engine-version-sync`（警告） | ダメージ層を触ったのに `ENGINE_VERSION` 据え置き |
| `ls-incremental-required`（警告） | LS 感応シンボルを触ったのに `--full` 未実行 |

### 4. 判断（ツールはここまで踏み込まない）

- **golden が動いた** → まず「意図した再fit か」を切り分ける。意図したなら `tools/search_calibrate.mjs` で再fit し、
  **期待値・override・CLAUDE.md の表・`ENGINE_VERSION`** を同一コミットで揃え、根拠を `CALIBRATION_ANALYSIS.md` の Cx 行へ。
  意図しないなら静的検査の結果（走査順・LS・TDZ）と突き合わせて原因を特定する — **値を期待値に合わせて書き換えない**。
- **違反ゼロでも自動で「OK」と言わない**。静的検査が見るのは**機械的に判定できる不変条件だけ**で、
  「その変更が仕様として正しいか」は `ENGINE_INVARIANTS.md` §1 と一次情報（`gamedata/md/`）に照らす。
- 新しい不変条件が確立したら、**規定（`ENGINE_INVARIANTS.md`）を先に更新**してから
  `tools/skills/check_engine_invariants.mjs` に検査を足す（規定が正・ツールは写し）。

## 制約

- 検査 ID（`tdz-immediate-field` 等）は**ツール内のチェック名**であり、REPO_STANDARDS §3 の文書 ID（Cx/Dx/Ax/Mx/Hx/Ex）ではない。新規に Cx を立てるときは台帳（`CALIBRATION_ANALYSIS.md`）で採番する。
- 検査を**緩めて通す**のは退行。閾値や期待値は締める方向にだけ動かす。
