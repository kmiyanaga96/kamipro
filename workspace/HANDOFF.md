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
- **sim05前タスク①②実装＋両面宿儺登録**（golden 不変 raw 197,775,394 / cal 211,462,826）: ①鬼神障壁（`DMG.enemy_barrier`＋`Sim._barrier`・burst/streak）②アビ上限（`DMG.enemy_abil_cap`=19・候補剪定）。両面宿儺 `ENEMY_REGISTRY` 登録＝実機で生存確認可能。⚠ rate=0.70/barrier.abi は第1走で実測。
- **新キャラ/新敵 導入フローを md-first intake（確立版）へ改訂**（ROADMAP §5 に一本化・REPO_STANDARDS/CLAUDE はポインタ整合）。
- **機獣系フォールバック2体 intake＋実機更新**（`variant_chimera_chi`=強機獣・`variant_chimera`=弱機獣）: 強機獣 HP6.8億/T3撃破・弱機獣 HP4.5億/T2撃破＝**両者とも T1オーバーキル無し＝T1クリーンアンカー可**。
- **ドキュメント運用刷新**: `workspace/HANDOFF.md`＋`TODO.md` 新設・進行ログを `archive/SESSION_LOG.md` へ分離・CLAUDE.md 減量。

## 直近セッションの成果（2026-07-25）
- **アリアン holy 無限ループ修正**（探索が終わらない主因＝guard `2+holy_plus` と効果cap `>=2` の不一致）＋ **_na 過剰再計算の perf 修正**（holy 8×→1× 等・_na 48%減・ビット同一）。探索は有限化（_runRootPlan 10T=94s）。
- **編成別 golden 先行実装（点4）**: `test/golden.mjs` を マルチfixture化＝edison(beam raw/cal 凍結)＋napoleon(静的greedy `299,534,299`・**ハングガード maxPress<60**)。回帰ガード＝要再fit。
- **buffCount 過大カウント判明（閾値 pike/consort/factor の本丸・未解決）**: シムの `buffCount` は非デバフ buf の全スタック総和で T5=118（`arian_bplus` 44 等）＝実機「強化効果数」と乖離。ナポ閾値(15/20)がT2以降トリビアル到達＝閾値実質無効化。**要実機カウント規則**（→TODO ①）。⚠これは下記「闘気」とは別мех。
- **ナポ闘気（aura）の数え方を実機確定＋実装**: 「味方に強化効果を付与するアクション」を per-action 計数。①atkBufアビ ②戦闘開始時パッシブ除外 ③ヘカテーバースト(`burstGrantsBuff`) ④自動holy(arianHolyFire直接加算)。golden edison 不変・napoleon 再fit(`299,534,299`)。napoleon.md §2.2/arianrhod.md 更新。

## sim05 実施順（合意 2026-07-24）
**① engine押し順（構造）を先に固める → ② 3体の敵でダメージ較正**。理由＝追撃 anchor は特定押し順上の per-hit で測る（順バグを damage スカラが補償する誤 fit を防ぐ）／順は絶対スカラにほぼ不変（sim04 実証）＝先に固めても damage fit で覆らない。
- 押し順の狙いは **sim の推奨順/ランキングを構造的に動かす major項目のみ**（系統誤差だけ・些細な序数ゆらぎは追わない）。ナポ/アリアン押し順は **golden 不変**（新編成は golden 不在）＝golden はエジソン回帰ガードとして据え置き。
- 順の**最終検証は实机ボス走と結合**：「固定押し順＝シム推奨順」で走らせ、1走で (a)序数検証 と (b)追撃 anchor を同時取得（sim03/04 と同型）。
- 3体は全て**光有利クリーン**＝追撃スカラの**クロスバリデーション**に使える（主アンカーで fit → 別1〜2体で確認）。順検証は多ターンの**両面宿儺が最良**（機獣系は clean が T1のみ）。
- **着手カデンツ**: エンジン修正＝**主作業**（無制限ボスで押し順確認＝configC/1日1回に非依存・アンブロック）。**両面宿儺 生存確認は毎日1枠を並行消化**（1日1回＝カレンダー律速・早期に全滅の壁を判定→ダメなら機獣系FBへ）。エンジンが固まると ≤19アビ最大火力の順が出て生存率も上がる＝直列にしない。

## アクティブ作業ライン
| ライン | 状態 | 次アクション | 詳細 |
|---|---|---|---|
| **① ナポ/アリアン押し順（構造）** | ⏳ 要実機検証 | **残＝閾値 buffCount の実機カウント規則（過大是正）→ 最大化検証**。A3再確認・係数矛盾（5.5/3000 vs 5.0/2500）。✅闘気の数え方=実装済・✅アリアン1/2早期投入=整合(変更不要)。G1 構造は実装済 | `gamedata/md/英霊/napoleon.md` §2.2・`神姫/arianrhod.md` §1.2 |
| **② sim05 追撃較正（3体）** | ⏳ データ取得待ち | Q3=configC（月末）受領＋ボス生存確認 → 固定＝シム推奨順で D×5 走（両面宿儺→機獣系で cross-val）→ C3/C5 fit・rate/abi上限実測 | `simulation/sim05/README.md` §0 |
| **Phase 8 アクセ実装** | ⏳ intake ゲート | §6 intake をユーザーと確定後着手 | `PHASE8_PLAN.md` |

→ 全タスクの優先順・チェックは **`workspace/TODO.md`**。

## ドキュメント・ポインタ（詳細は必要時のみ）
- **開発ルール・コード地図・確定仕様・検証**: `CLAUDE.md`（本書と対で必読）
- **較正の確定値・根拠・Cx バックログ全文**: `CALIBRATION_ANALYSIS.md`
- **Phase 一覧・採番**: `ROADMAP.md` ／ **現行フェーズ台帳**: `PHASE4_PLAN.md`
- **ドキュメント規約・振り分け・セッション定型**: `REPO_STANDARDS.md`
- **敵DB intake**: `gamedata/md/敵/`（sim05 候補＝本命 `ryomen_sukuna`／主FB `variant_chimera_chi`（強機獣）／最終FB `variant_chimera`（弱機獣））
- **キャラ一次情報＋シムデータ**: `gamedata/md/神姫|英霊/<key>.md`
- **過去セッションの経緯**: `archive/SESSION_LOG.md`

## 検証（作業後は必ず）
```bash
npm run test:golden   # 編成別: edison/raw 197,775,394・edison/cal 211,462,826・napoleon/static 299,534,299（全 FB10/10）
```
docs のみの変更なら golden は不変。napoleon fixture は静的greedy回帰ガード＝モデル変更時は再fit。
