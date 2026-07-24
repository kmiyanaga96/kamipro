# 引継ぎ — 現状スナップショット

> **種別**: 引継ぎ（現状スナップショット・有界） ／ **用途**: 新セッション起動時に **CLAUDE.md と本書のみ**を読めば「今どこにいて次に何をするか」が分かる状態を保つ。
> **次タスクの詳細リスト**は `workspace/TODO.md`。過去の経緯・provenance は `archive/SESSION_LOG.md`（オンデマンド）。
> **更新規律（セッション末）**: 本書は「今」だけを短く保つ。現状化した記述は `archive/SESSION_LOG.md` の先頭へ1ブロック畳み、本書は最新状態へ上書きする（青天井化させない・規律は REPO_STANDARDS §6）。
>
> 最終更新: 2026-07-24

---

## 現フェーズ
**Phase 4 = 統計的較正 × 反復可能ボス**（PHASE4_PLAN §3.5.1）。全分析を Claude Code 担当（Antigravity 不使用）。
次の焦点＝**sim05（ナポ/アリアン編成移行＋追撃 C3/C5 較正）**。土台の frame calib（sim04）は確定・編成非依存で継承。

## 直近セッションの成果（2026-07-24）
- **sim05前タスク①②実装＋両面宿儺登録**（golden 不変 raw 197,775,394 / cal 211,462,826）:
  - ①鬼神障壁＝敵側 final-dmg 枠別cap（`DMG.enemy_barrier`＋`Sim._barrier`・burst本体/streak に適用）。
  - ②アビ回数上限＝`DMG.enemy_abil_cap`（`abilCapPerTurn:19`・`_candidates`/`_stepStatic` で剪定）。
  - 両面宿儺を `ENEMY_REGISTRY` 登録（UIドロップダウン自動出現＝**実機で生存確認できる状態**）。
  - ⚠ 補正率 rate=0.70 の解釈・barrier.abi 上限は **sim05 第1走で実測**して registry/md 更新。
- **ドキュメント運用刷新**（本刷新）: `workspace/HANDOFF.md`＋`workspace/TODO.md` 新設・進行ログを `archive/SESSION_LOG.md` へ分離・CLAUDE.md 減量。

## アクティブ作業ライン
| ライン | 状態 | 次アクション | 詳細 |
|---|---|---|---|
| **sim05 追撃較正** | ⏳ データ取得待ち | Q3=configC（月末・ウェポン強化中）受領＋**生存/討伐再現性の実機確認**（両面宿儺 全滅時計 鬼の魔力≥10）。揃えば D×5 走→C3/C5 fit・rate/abi上限実測 | `simulation/sim05/README.md` §0 |
| **(A) ナポ/アリアン構造修正** | ⏳ 要実機検証 | 闘気の数え方・A3再確認・アリアン絶対値fit/係数矛盾（5.5/3000 vs 5.0/2500） | `gamedata/md/英霊/napoleon.md` §2.2・`神姫/arianrhod.md` §1.2 |
| **Phase 8 アクセ実装** | ⏳ intake ゲート | §6 intake（per-char/全体・系統全容・発動系有無）をユーザーと確定後着手 | `PHASE8_PLAN.md` |

→ 全タスクの優先順・チェックは **`workspace/TODO.md`**。

## ドキュメント・ポインタ（詳細は必要時のみ）
- **開発ルール・コード地図・確定仕様・検証**: `CLAUDE.md`（本書と対で必読）
- **較正の確定値・根拠・Cx バックログ全文**: `CALIBRATION_ANALYSIS.md`
- **Phase 一覧・採番**: `ROADMAP.md` ／ **現行フェーズ台帳**: `PHASE4_PLAN.md`
- **ドキュメント規約・振り分け・セッション定型**: `REPO_STANDARDS.md`
- **敵DB intake**: `gamedata/md/敵/`（`ryomen_sukuna.md`＝sim05本命ボス）
- **キャラ一次情報＋シムデータ**: `gamedata/md/神姫|英霊/<key>.md`
- **過去セッションの経緯**: `archive/SESSION_LOG.md`

## 検証（作業後は必ず）
```bash
npm run test:golden   # 期待値: raw 197,775,394 / cal 211,462,826
```
docs のみの変更なら golden は不変（コード非依存）。
