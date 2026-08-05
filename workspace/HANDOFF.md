# 引継ぎ — 現状スナップショット

> **種別**: 引継ぎ（現状スナップショット・有界） ／ **用途**: 新セッション起動時に **CLAUDE.md と本書のみ**を読めば「今どこにいて次に何をするか」が分かる状態を保つ。
> **次タスクの詳細リスト**は `workspace/TODO.md`。過去の経緯・provenance は `archive/SESSION_LOG.md`（オンデマンド）。
> **更新規律（セッション末）**: 本書は「今」だけを短く保つ。現状化した記述は `archive/SESSION_LOG.md` の先頭へ1ブロック畳み、本書は最新状態へ上書きする（規律は REPO_STANDARDS §6）。
>
> 最終更新: 2026-08-05（セッション末・クローズ）

---

## 現フェーズ

**Phase 4 = 統計的較正 × 反復可能ボス**（PHASE4_PLAN §3.5.1）。全分析を Claude Code 担当。

**sim05 の主題は 2026-08-03 に入れ替わった**。当初＝【追撃 C3/C5】＋【tier 観測 C38】＋【鬼神障壁】。
現在＝**バーストまわりの成分別較正（C40 / C41 / C44）**。詳細は `simulation/sim05/README.md` §1。
押し順の序数検証は目的外＝**実走はフリー押しでよく、実際に押した順の記録が必須要件**。

## ✅ 直近の成果（2026-08-05）── 実機走待ちの間に「土台」を3つ直した

詳細な経緯は [archive/SESSION_LOG.md](../archive/SESSION_LOG.md) の 2026-08-05 の3ブロック。

**① ハーネスの config 汚染を根治**（A トラックの前提）
2026-08-03 の事故（GEAR が2世代前で `calib_burst` の転移判定が反転）で直したのは1本だけだった。
**残り15本を台帳駆動へ移行**（`tools/lib/config_c.mjs`＝受領キャッシュから config を復元し、走行前に
**記録ルートの強制リプレイ bit 一致（E2）を自動で通す**）。規律は **REPO_STANDARDS §6 E10**。
⚠ 汚染は GEAR だけでなく**サブ枠・パーティ順・override** にも及んでいた。
✅ **エジソン系（configB）は無汚染**＝C37 の A1「エジソンは健全」は影響を受けない。
⏳ **残＝汚染された数値の再取得は未実施**（C37 の BW 掃引ほか）。**C43 実装後に**・優先度は A トラックより下。

**② md 相互参照の整備（S1〜S5 完了＝運用フェーズ）** → [DOC_RELATION_PLAN.md](../DOC_RELATION_PLAN.md)
検査ツール `npm run doc:check` ／ 規約 REPO_STANDARDS **§4.1・§7・§6-6** ／ **現役層の壊れた参照 48→0・曖昧 33→0** ／
末尾ブロックを**現役層 51本**へ（冪等）／**常駐サブタスク稼働**（カウンタは TODO 冒頭・5到達でツールが警告）。
⚠ **セッション末の手順が増えた**: カウンタ +1／md を新設・改名したら `node tools/doc_refs.mjs --write` も回す。
⏳ 残＝常駐が2周回ること（完了条件③）。

**③ 高被参照 md の可読性整理**
本文内の変更経緯・重複説明を末尾の更新履歴と ID 参照へ寄せた。**CLAUDE.md 32%減**・仕様16項目は全て健在。
⚠**副産物として実害のある陳腐化を3件検出**＝CLAUDE.md と ROADMAP が**2世代前の golden 値**を保持、
REPO_STANDARDS の **ID レンジが陳腐化**。→ 値の正を1箇所へ集約し、**件数は持たせない**形に変えた。
⚠ `gamedata/md` の16本は「原文ママ・編集不可」＝**本文は触っていない**（触ったのは README のみ）。

## ✅ 直近の成果（2026-08-03）

**実機の押し順をそのまま強制リプレイして成分別に突き合わせる**方式を確立
（`tools/calib_replay_compare.mjs` / `calib_burst_formula.mjs` / `calib_m1_sim03.mjs`・1走 約3秒）。
これを **sim05 pre-trial（ナポ/アリアン×宿儺×configC）** と **M1＝sim03 D走5本（エジソン×cath_palug×configA）** に適用した。

### ★最大の発見 ── 乖離は成分ごとに符号が逆

| | 成分 | pre-trial（configC・T1） | M1（configA・T1/T2） |
|---|---|---|---|
| **過大** | **バースト本体** | **×0.77**（1発 ×0.73） | **×0.705** |
| **不足** | betaia（cap 過小＝C41） | ×2.89 | — |
| **不足** | **バースト追加ダメージ**（式が違う＝C40） | ×2.4〜5.6 | **×2.689** |
| **不足** | holy（cap 過小） | ×2.15 | — |
| **不足** | ロボ追撃 | — | ×1.641 |
| **未モデル化** | 反撃（C45） | T3 で 7.8M | 実機 21.8M |
| ✅ 一致 | アビリティ | — | ×1.008 |
| ✅ 一致 | バーストストリーク | — | ×1.019 |
| ✅ 一致 | DOT | — | ×1.000 |
| ✅ 一致 | 通常攻撃（`calib_na` は転移） | ×0.99 | ×1.094 |
| （合計） | **相殺後** | ×1.41 | ×1.065 |

**★ここが要点**: 合計値は「**不足と過大の差引**」にすぎない。
∴ **総ダメージ一致を狙った一律スカラ調整は最悪手**（両方向の誤差を同時に固定する）。**受入基準にもしない**。
**修正順序は C44（本体の過大）→ C40（追加ダメージ）**（本体が過大のままだと本体連動式も過大になる）。

### 確定したこと / できなかったこと

- ✅ **C40 は編成横断**（エジソン×configA でも ×2.689）＝ナポ/アリアン固有ではなく **edison golden にも効く**。
- ✅ **`decay_burst.slope=0.10` は支持**（`calib_burst` を通らないストリークで検証・上げると単調悪化）。
- ✅ **環境妥当性**: sim03 T1/T2 は押下却下ゼロ＋4成分一致＝`calib_na`/`judg_calib` は C37/C39 を経ても健全。
  ∴ **C42（同ターン発動上限の不足）は新編成固有**と確定。
- ❌ **`calib_burst` の値は確定できない**（configA ≈1.46 / configC ≈1.66 で 13% 食い違い・原因未特定＝
  A7 / 編成依存 / config 誤差 / 敵 def のいずれも未排除）。**値を決めない**まま M2〜M6 へ送る。

**起票**: **C40 / C41 / C42 / C43 / C44**（pre-trial）＋ **C45（反撃）/ C46（攻撃フェイズの排他）**（M1）。
**成果物**: `simulation/sim05/analysis/`（`per_trial/pre-trial_{quant,quali}.md` ／ `PROVISIONAL_ANALYSIS.md` ／ `m1_history_replay.md`）。
<!-- doc_refs:ignore-line ── 未作成: 本trial 受領後に作成する -->
⚠ trial が1本のみのため **rollup は作らず**、正式 `simulation/sim05/analysis/integrated_analysis.md` は**本trialに対して**行う（ユーザー指示）。

### ⚠ 同日中に結論が5つ動いた（読み手への警告）

`archive/SESSION_LOG.md` の 2026-08-03 ブロック冒頭に**訂正対応表**がある。
**現在値として引用してよいのは `CALIBRATION_ANALYSIS.md` の Cx 行と本書**であって、ログの途中経過ではない。
主な訂正＝①ハーネスの GEAR が2世代前で `calib_burst` の転移判定が反転 ②slope 仮説を棄却
③「環境妥当性 合格」は押下しか見ていなかった ④「1ヒット=+10 は反証」は転記漏れが原因で誤り
⑤「反撃の一次情報は無い」はリポジトリ内の `hecate.md` §1.2 を読んでいなかっただけ。

## ⏳ 次の一手 ── **M5 → M3 → M4 の実機走**（★具体手順は [workspace/TODO.md](./TODO.md) 冒頭）

**★M2 は取得済（ユーザー報告 2026-08-05）。ただし記録原本がリポジトリに無い。**
`simulation/sim05/data/trialNN.md` が未受領＝**Claude Code は M2 を分析できない**。
**次セッションの最初の一手＝ trial md の受領**（＋ `configC_slot.json`）。それまで A トラックは動かない。

**⚠ 順序は `M5 → M3 → M4`**（`simulation/sim05/README.md` §4.8「依存順」＝
**カウントで閉じる → 比で閉じる → 絶対で閉じる**）。M5 はダメージモデルに依存せず、
その結果が M3/M4 の解釈前提になるため先に潰す。

| ID | 何を閉じるか | 走らせ方の要点 | 実機コスト |
|---|---|---|---|
| **M5** | **C42**（同ターン発動上限）＋ **C38**（tier） | CD0 の `holy`/`alone`/`legend`/`knights` を押せなくなるまで連打。**毎押下で契晶を記録**し、押せない理由を CD / 契晶 / 上限 で書き分ける | 1〜2走 |
| **M3** | **C40**（追加ダメージの定式化・**編成横断**） | **バーストボタン OFF で溜め**、黄アビの本数を変えた4条件で**1ターンだけバースト**。本体と追加ダメを**別行で**記録 | 3〜4走 |
| **M4** | **C41**（betaia cap）＋ DOT ＋ **C45**（反撃） | **ボタン OFF のまま赤アビを一切押さない**。HP 4億で溶けないようにするのが設計の要 | 1〜2走 |

⚠ **M7 は全走に相乗り**（反撃の押下/値/キャラ＋**直前の敵の行動**）。
⚠ **バーストボタン OFF はシムに無い（C46）**＝そのターンは C46 の影響下と明記して測る。

## 3トラックとゲート状況

| トラック | 内容 | ゲート |
|---|---|---|
| **A. ダメージ較正** | **C40 / C41 / C44**（＋C42/C43）／C3/C5 は縮小／C45/C46 は新規 | ⏳ **M2 の原本受領 → M5→M3→M4**（宿儺での fit は変数過多＝G4.9 へ後ろ倒し） |
| **B. 探索の安定化** | C37 | ✅ LS 実装＋ボス切替で回避。⚠**根治せず**（代理採点は手つかず）＝open。**C43 が入ると探索空間が変わる＝測り直し** |
| **C. 押し順・tier** | C38（buffCount）・予測探索 | ⏳ 実機データ待ち。**実機では tier 切替が実在すると確認**（bc<15→≥20 が同一ターン内で動く） |

## アクティブ作業ライン

| ライン | 状態 | 次アクション |
|---|---|---|
| **★実機走 M5→M3→M4** | ⏳ **M2 は取得済だが原本が未受領＝これが唯一のブロッカー** | **`trialNN.md` を `simulation/sim05/data/` へ**（＋`configC_slot.json`）。手順は TODO 冒頭 |
| **宿儺での最終検証（G4.9）** | ⏳ **後ろ倒し** | ≦19手の走を1本／C43 は「≦19手運用」で無期限に後回し可 |
| **★メタトロン A7（AnotherLink 重複規則）** | ⏳ **M6 で閉じる** | `final_dmg` 1.10 vs 1.21。**サブ枠は `[metatron, artemis]` で確定**。⚠ **`calib_burst` の configA/configC 食い違い 13% の第1候補**（1.21 が正なら configC 0.800→0.73 で configA 0.705 に近づく） |
| **★他ハーネスの config 汚染** | ✅ **2026-08-05 根治**（15本を台帳駆動へ・E10 制定） | ⏳ 残＝**汚染された数値の再取得**（C37 の BW 掃引ほか）。⚠**C43 実装後に**（探索空間が変わる）・優先度は A トラックより下 |
| **★override の再fit** | ⏳ **未履行・ただし着手禁止** | C39 でモデルが動いたが、**C40/C41/C44 でまた動く**＝二重fitになるので**確定後に1回だけ** |
| **長時間ジョブ** | ✅ ①②並列化済 | 残＝③LS内部の投機並列・他ハーネス横展開・ローカル移行 |
| **Phase 8 アクセ実装** | ⏳ intake ゲート | §6 intake をユーザーと確定後 |

→ 全タスクの優先順・チェックは **`workspace/TODO.md`**。

## ドキュメント・ポインタ（詳細は必要時のみ）

- **開発ルール・コード地図・確定仕様・検証・実測コスト**: `CLAUDE.md`（本書と対で必読）
- **較正の確定値・根拠・Cx バックログ**: `CALIBRATION_ANALYSIS.md`（**C37/C38/C40〜C46 が open**）
- **攻撃フェイズの仕様（一次情報・2026-08-03 ユーザー回答）**: `gamedata/md/その他/attack_phase.md`
  （バーストと通常攻撃は**排他**／ボタンOFFで溜められる／**反撃は被回避でも発動**／**ゲージは1ヒット +10**＝**C45/C46/C24**）
- **sim05**: `simulation/sim05/README.md`（**§4.4=較正ボス2段構え / §4.4.2=T1局在[決着済] / §4.6=tier観測 / ★§4.8=アイソレーション走 M1〜M7 / §6=残ゲート / §7=受入基準**）
  ／**`simulation/sim05/analysis/PROVISIONAL_ANALYSIS.md`（暫定統合＝ここから読む）**／`simulation/sim05/analysis/m1_history_replay.md`（★M1 の全成分突合）
  ／`simulation/sim05/analysis/per_trial/pre-trial_{quant,quali}.md`／`simulation/sim05/data/pre-trial.md`（実機原本）／`simulation/sim05/data/record_skeleton.md`（記入テンプレ）
  ／**`simulation/sim05/data/configC_gear_panel.md`（★冒頭注記2＝GEAR の正）**／**`simulation/sim05/data/configC_cache_20260803.json`（config の正・E2 通過）**
- **計測ハーネス**: `tools/`（`tools/README.md` が索引・**§0 に並列実行**・**★§0.5 に config の台帳駆動（`tools/lib/config_c.mjs`）**・**`calib_replay_compare.mjs` が sim05 の較正方式そのもの**）
- **実験・計測の作法**: `REPO_STANDARDS.md` §6 の **E1〜E10**（着手前に通す。**★E10=config は台帳から読む**）
- **探索品質の実験の全数値**: `archive/SEARCH_QUALITY_EXPERIMENTS.md`（C37 の根拠アーカイブ）
- **新キャラ/幻獣の一次情報と Ax**: `gamedata/md/神姫/metatron.md`（§3.2 A0〜A10）／`gamedata/md/幻獣/`
- **Phase 一覧**: `ROADMAP.md` ／ **現行フェーズ**: `PHASE4_PLAN.md` ／ **規約**: `REPO_STANDARDS.md`
- **過去セッションの経緯**: `archive/SESSION_LOG.md`（**2026-08-03 ブロックは冒頭の訂正対応表から読む**）

## 検証（作業後は必ず）

```bash
npm run test:golden   # edison/raw 202,005,923・edison/cal 215,161,915・napoleon/static 299,523,354（全 FB10/10）
```
⚠**実測 2分07秒**（fixture 並列。`--serial` で逐次・`--fixture <name>` で単体）。**背景実行を推奨**。docs のみの変更なら golden は不変。
`_replayResult`/`_execKey`/`clone`/`_snapshotForReplay` を触ったら **`node tools/exp_ls_incremental_verify.mjs`（約4分）も回す**。

---

## 更新履歴

<!-- 直近5件のみ（それ以前は git log）。「波及確認」列が本体＝git が持たない情報はここだけ。 -->

| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-05 | 末尾ブロックを新設（DOC_RELATION_PLAN S4・種別=現状スナップショット） | 参照関係は `npm run doc:check` がグリーン |

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 4）

- [CLAUDE.md](../CLAUDE.md)
- [DOC_RELATION_PLAN.md](../DOC_RELATION_PLAN.md)
- [REPO_STANDARDS.md](../REPO_STANDARDS.md)
- [workspace/TODO.md](./TODO.md)

_他に 凍結sim/archive/essays から 1 件（更新対象外）_
<!-- doc_refs:end -->
