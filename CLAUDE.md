# 神姫PROJECT R — バーストトラッカー 開発ガイド

## 概要
バースト編成シミュレーター＆最適押し順トラッカー。**Phase5 S5（2026-06-30）で Vite/ESM モジュール構成へ移行**：`index.html`=薄いシェル、エンジン＝`src/app.js`、Worker＝`src/worker.js`、DB＝`data/*.js`（ESM）。開発は `npm run dev`、配布は `npm run build`→`dist/`（`npm run preview` で確認。**ESM は file:// 直開き不可＝要http**）。移行の一次情報は archive/VITE_MIGRATION.md。

## ドキュメント体系（Antigravityエージェントとの共有用）

### 現役ドキュメント（ルート）
- **CLAUDE.md**（本書）: 生きた開発ガイド。コード地図・開発ルール・確定仕様・検証方法・実機較正ステータス。**現状の一次情報**。
- **.agents/AGENTS.md**: Antigravity（Gemini）エージェント用のルール／ガイドライン定義。開発不変条件（循環インポートにおける遅延評価規律・Worker用export）・Gitワークフロー・検証ゲート（raw 187,186,834 / calibrated 208,689,608）を規定。
- **CALIBRATION_ANALYSIS.md**: 実機較正の確定値＆**根拠アーカイブ**（なぜその値・枠か）＋乖離バックログ（Cx）。較正・英霊武器は実装済み。
- **PHASE4_PLAN.md**: Phase 4（実機較正の反復＝**現行フェーズ**）の進め方台帳。**押し順優先**・序数比較ハーネス・「押し順は蓄積誤差に頑健、系統誤差だけを狙う」方針・乖離バックログ駆動を規定。
- **KILL_TURN_DESIGN.md**: **最速撃破モード（kill-turn 自動目標）の設計草案（未実装・2026-07-07 起草＋§7必要性検討）**。§7で「演算量は非障害・真のブロッカーは絶対値精度（実機比×2級）」と整理し、**S3保留・S1+S2はsim02試行2の絶対乖離実測をゲート**に着手判断。ROADMAP の未確定Phase(ii)。
- **ROADMAP.md**: **Phase 一覧・採番の一次台帳（2026-07-09 再編・2026-07-15 採番改訂）**。Phase 6=幻獣システム拡張／**Phase 7=静的スコア s の機械学習化（新設・大規模Phase）**／**Phase 8=アクセ実装（旧Phase 7から繰り下げ）**／未確定Phase=敵行動・味方生存(i)・kill-turn(ii)・VM/ワークフロー(iii)。各Phase詳細は個別docへ委譲。
- **PHASE7_ML_PLAN.md**: **Phase 7（静的スコア s の機械学習化）の設計台帳＋PoC結果（2026-07-15 起票・PoC×2完了→park推奨）**。`s`＝ダメージ非関与の探索ヒューリスティック（ロールアウト既定ポリシー＋タイブレーク）である前提の下、ML化のレベル分け（A=重み/定数のオフライン最適化・JS線形維持／B=極小GBDT/MLP既定ポリシー／C=RL方策・非推奨）と工数/リスクを規定。**PoC結論(§6/§7)＝安価サロゲートによる s 最適化はNO-GO**（proxyは不感かつ非転移・浅ビームは full と反整合で退行・ビーム幅掃引で cal×beamW=64 が大域最良＝production は実用上限）。ハーネス`tools/ml_fit_static.mjs`(phase-1)・`tools/ml_fit_static_v2.mjs`(phase-2・`npm run poc:ml`)は温存。**src改修は `src/sim.js` の beamW 注入フックのみ・golden不変(inert-by-default)**。★スコープ外＝絶対値乖離(C25/C5)はダメージ式問題で本Phase非対象。
- **CHARACTER_ANALYSIS.md**: キャラ個別評価＆採用論の生きた考察台帳（2026-07-11 起草）。ヤマトvsアリアンのホライズン別比較・ナポレオン評・併用仮説（暫定）。序数比較ベース＝新キャラ/較正確定のたびに更新。

### 現役データディレクトリ
- **enemies/**: 敵DB intake。`enemies/README.md`（命名・追加手順・スキーマ）＋ `TEMPLATE.md` ＋ `<key>.md`（実機詳細＝根拠）。`data/enemies.js` の `ENEMY_REGISTRY` がそこから蒸留した現在値。Phase4較正ボス `walpurgis_loki`・sim03較正ボス `fimbulvetr` を登録。
- **simulation/**: Phase 4 の試行データ蓄積。`simulation/README.md`（命名規約・ワークフロー・**較正カデンツ=統計的較正×反復可能ボス（2026-07-12転換）**）＋ `TEMPLATE/` ＋ `simNN/`。**sim03以降の新構造（ユーザー決定）**: `data/`（`config.json`基本情報JSON=探索キャッシュexport兼用 / `trialXX.md`実機原本）＋ `analysis/`（`quantitative_analysis.md`定量のみ=旧design_report後継 / `qualitative_analysis.md`定性のみ / `integrated_analysis.md`統合のみ）＋分類不能ファイルはsim直下。sim01/02は旧構造のまま凍結。**新試行は `cp -r simulation/TEMPLATE simulation/simNN` で開始**。

### archive/（クローズ済み・歴史台帳＝現状の一次情報ではない）
完了・クローズした計画/設計レポート置き場。バックログ（Cx）行から旧パスで参照されている場合も実体はここ。
- 設計レポート: `BEAM_SEARCH_DESIGN.md`（C9）/ `ORDER_OPTIMIZATION_DESIGN.md`（C12）/ `SEARCH_ROLLOUT_DESIGN.md`（C13-C15・自動較正§6含む）/ `OPTIMIZATION_ENGINE.md`（エンジン解説旧版）
- 完了フェーズ台帳: `PHASE2_PLAN.md` / `PHASE3_PLAN.md` / `PHASE5_PLAN.md`（UX刷新+Vite化・完了）/ `VITE_MIGRATION.md`（S5作業記録）/ `PERF_NOTES.md`（高速化台帳）
- 運用メモ: `BRANCH_WORKFLOW.md`（main恒久トランク運用）
- `tools/`: 較正・探索ハーネス（`search_calibrate.mjs`＝自動較正の再fit実行・`search_probe.mjs`・`c27_refine_probe.mjs`＝C27定石リファイン監査等。**現役で使用**。旧pre-Vite CJSツール3本＝calib_t1/calib_t1_forced/t1_dumpは2026-07-14削除＝git履歴参照）
- `caches/`: 無効化済み探索キャッシュの歴史保全置き場（C26 followupON・C27証拠キャッシュ。2026-07-14 sim03/data から移設）

---

## ファイル構成 & コード地図

Vite/ESM移行完了後の物理ファイル構成および責務の定義です。

### 1. プロジェクトルート
- `index.html`: 薄いシェル（エントリーポイントとして `src/app.js` を module 読み込みするのみ）。
- `package.json` / `vite.config.mjs`: Viteビルド、依存モジュール、Workerバンドル設定。
- `test/golden.mjs`: ローカルNode.js環境から `src/app.js` を読み込み、10ターンのシミュレーション結果アサートを行う回帰テスト用ハーネス。

### 2. `data/` 配下 (データ層 / ESM)
- `data/weapons.js`: 武器マスターDB (`WEAPON_MASTER`)
- `data/summons.js`: 幻獣マスターDB (`SUMMON_REGISTRY`)
- `data/enemies.js`: 敵DB (`ENEMY_REGISTRY`)
- `data/characters.js`: 統一キャラDB (`CHAR_REGISTRY`、`DEBUFF_KEYS`/`buffCount` 同梱)。`src/app.js` からの循環インポートを持つが、関数内での遅延評価に限定することでTDZを回避。

### 3. `src/` 配下 (エンジン・UI層 / ESM)
- `src/constants.js`: ゲーム定数と、乗算補正および減衰上限などを管理する定数 `DMG`。他モジュールへの依存を持たない葉モジュール。
- `src/sim.js`: シミュレーターコアエンジン。`class Sim`（状態管理、`tick`, `burst`, `use` メソッド、減衰計算等）、およびビーム探索やルート選抜ロジック（`cmpVec`, `_candidates`, `_stepStatic`, `_runRootPlan`, `_selectRootPrefixes` 等）を収録。
- `src/worker.js`: Web Workerの背景並列計算用エントリポイント。`src/app.js` 等からシミュレータコアをインポートして並行実行。
- `src/app.js`: UIバインディング、Web Worker管理プール、リプレイモード、INIT処理を含むメインエントリ。

---

## 開発ルール & 不変条件

### 1. キャラクター追加・変更の原則
- **`CHAR_REGISTRY`（data/characters.js）が唯一の編集先。** エンジン本体（`class Sim`）にキャラ名リテラルを記述しない。
- **⚠ 循環参照回避ルール**: `data/characters.js` のオブジェクトリテラルの**トップレベル即時評価フィールド**（例: `gmax`）で `BG`/`DMG`/`GEAR` を直接参照してはならない（TDZ / 循環死によるUI全消失の原因）。ゲージ上限は素の数値で持つ（100=`BG.other_max`）。**関数本体（`cands.exec`/`def`フック）内の参照は遅延評価のため安全**。
- キャラ固有状態は `state` に宣言（Simが snap/clone/init で自動同期）。
- 累積アサルトやバーストプラス等の状態は、クローン時の参照共有を防ぐため、オブジェクトではなく**フラットな数値変数**として `state` に宣言すること。
- **毎ターン自動デクリメントする残ターン系state**（ロボ残T・ムーンコード等）は `tickStates: ['key', ...]` を宣言（`buildFormation`が`TICK_STATES`へ集約し`tick()`が汎用処理）。
- **キャラ固有の反応・マイルストーン処理は汎用フックに記述**（エンジンに分岐を足さない）: `def.onAbility(sim,name,color,T)` / `def.onPartyBurst(sim,owner,T,atk)` / `def.onBurst(sim,atk,owner)` / `def.turnEnd(sim,T)`。フックは`CHARS`順で全キャラ走査され、不在編成では未宣言として自然スキップ。

### 2. 確定仕様・設計不変条件
- **ジャッジ再発動（C18で表現修正）**: proc で cd.judg=0 になれば**押下可能**（自動発火ではなく押す位置はプレイヤー/探索の裁量。セオリー上デバフ等を先行させうる）。同ターン上限 `judgCap = 5 + (開始時cd===0?1:0)`（`T.ju`・毎ターンリセット）。
- **ジャッジ3フェーズ循環（C23実機較正 2026-07-12）**: ph0=敵全体10回ダメージ / ph1=バースト / ph2=通常攻撃 の循環は**戦闘通算で連続**（`sim.judgPhase%3`・ターン毎リセットしない）。同ターン発動上限（`T.ju`）とは別カウンタ。旧実装は `T.ju%3`（毎ターンph0リセット）で、実機の各ターン開始judgフェーズ（T4=ph1/T5=ph0/T6=ph2）を3/3外していた（根拠 CALIBRATION_ANALYSIS.md C23）。
- **コヴァレント・アルカナ**: アビ12回 / バースト2回ごとにproc発火（**メイン＋攻撃フェイズ両対象**・攻撃フェイズprocのcd.judg=0は次ターンへ持ち越し）。連理魔力+1 ＆ ジャッジCD=0を同時付与。同ターン5回上限。
- **モビウスムーンズ**: パーティ全体のバースト5回ごとに、ヘカテーの全アビCDをリセット。
- **ムーンコード（ヘカテー2アシ・C18実機較正 2026-07-07）**: 「戦闘開始時または**ヘカテー自身**がアビリティ**12回使用する毎**（戦闘通算 `moon_acc`）に発動・**持続2ターン**（開始時発動も同じ）」。判定は**アビ終了後**（C18r2）＝12回目の押下自身には効かず**同一ターンの後続ヘカテーアビから**有効（effond は `mcAtPress` で押下時点の状態を捕捉）。effond は「ムーンコード発動時のみ即座にゲージ消費なしでバースト」。旧実装（パーティ全体アビ12回・ターン内カウント＝実質常時ON）は誤りで、sim02 試行1 raw の T4/T6「ヘカテー2バースト無し」交互パターン・試行2 T4 の judg#12 発動不能を再現できなかった（根拠 CALIBRATION_ANALYSIS.md C18）。
- **イフィシャント早撃ち抑止**: `IFISHANT_MIN_CD = 3`（CD中アビが3つ未満は使用不可）。
- **ロワ・クモンドの3枠加算**: 通常（`roy_na_frac`）、アビ（`roy_abi_frac`）、バースト（`roy_burst_frac`）をそれぞれ独自枠加算。
- **ゲージ経済（実機確認済・2026-07-04／実装＝実機一致・乖離なし）**: 黄アビのBG付与（funki+10/legend+10/sleur+15/absolute+20/pactcore+100）・マシーンタクトゥ（ロボ反応1回あたり `MACH_BG=5`）は**すべて味方全体対象**（`addG(CHARS,…)`）。エジソンのバーストで攻撃ロボ/補助ロボ**両方のCDを−1**（`edison.def.onBurst`）＝ロボ3T稼働に対し3T周期の再設置が回りきり**常時稼働**しうる。∴ **中盤(T3〜)以降に全員ゲージ満量になるのは正しい帰結**（過去に「ロボ常時稼働はありえない／満量は不自然」と疑義が出たが、実機仕様として3点とも一致・アンプリファ×攻撃ロボの効果窓も整合＝再調査不要）。エジソン4(アンプリファ)の+10万は攻撃ロボ反応（`sim.droid>0` の赤アビ反応）にのみ加算。
- **Phase3-1 事前計算マップ（ホットパス高速化・実装済）**: `buildFormation` で `ABIL_KEYS`/`ABIL_KC`/`ABIL_CANDS`/`ABIL_BASE_S` を一度だけ構築し、`_stepStatic`/`_candidates` が `Object.entries(ABIL)`・ネスト参照・`computeBaseScore` 再計算をせず `ABIL_KEYS` を1パス走査する。**⚠不変条件**: 走査順は `ABIL` 挿入順（=`Object.keys`順）でタイブレークは厳密 `>`（先頭最大）。キャラ追加・`abilities`/`cands` 変更時はこのマップ構築を経由するため自動追従するが、**走査順や `>` 比較を崩すと最適押し順の選択がズレる**（ゴールデン値 raw 187,186,834 / calibrated 208,689,608 で検証すること）。
- **ESM Worker起動規律**: 旧 `_buildWorkerCode`（文字列 slice）は廃止済み。Worker は `new Worker(new URL('./worker.js', import.meta.url), {type:'module'})` で起動。**`src/app.js` の worker 用 export に必要な探索関数（`buildFormation`, `recalcGearK`, `Sim`, `_runRootPlan` 等）を含めること**。UI/DOM 依存は INIT の `if(typeof document!=='undefined')` ガード内・window ブリッジに隔離すること。
- **2段ルート選抜（①-A・実装済）**: `runSim`/`_fallbackRunSim` は `enumerateRootPrefixes()` の全prefixを `_staticPrefixDmg`（静的greedy・約数ms）で安価採点し、上位 `PREFIX_TOPK`(=8・C16で10→8) 本のみ本選(BW64・C16で128→64)へ回す（`_selectRootPrefixes`）。空prefixは常に確保。**品質低下は PoC 実測で最大0.013%**（top-8が実証済み安全床・BW64で0%損実測）。新キャラ追加時は PoC（scratchpad `poc.js`）を再実行し `PREFIX_TOPK` の余裕を再確認する。

### 3. Git 開発ワークフロー (強制ルール)
- **作業開始時**
  1. `git checkout main` で main に切り替え、`git pull origin main` を実行。
  2. 作業用ブランチを切って開発を開始。
- **検証 (作業完了時)**
  - 必ず `npm run test:golden`（期待値: raw 187,186,834 / calibrated 208,689,608）を実行しパスを確認。
- **反映・プッシュ**
  - コミット後、`main` に戻って `pull`、作業ブランチをマージし、再度検証テストをパスして `git push origin main`。不要な作業ブランチは削除。

### 4. 実機乖離・最適順序不整合の改善フロー
シミュレーターの計算値やアビ実行順序が実機と乖離した場合は、`simulation/simNN/` に分析結果を蓄積し、ドキュメントをハブにして解決する。
1. **リプレイ照合**: 「リプレイモード」に実機手順を入力し、乖離の発生起点を特定。実測を `simNN/raw_data.md` に、replay画面は `simNN/replay_screenshots.md` へテキスト転記。
2. **課題のDB化**: [CALIBRATION_ANALYSIS.md](CALIBRATION_ANALYSIS.md) のバックログ（Cx）に追記。
3. **計画・検証策定（Antigravity 主担当）**: 設計担当が原因特定し、`simNN/design_report.md` を**必須5節構成**（1.総合比較 / 2.敗北要因 / 3.乖離分析 / 4.影響度検証 / 5.引継ぎ）で作成。
4. **自律修正とテスト**: 実装担当（Claude Code）が `design_report.md` を検証して `simNN/integrated_analysis.md` にまとめ、コード修正後テスト実行。期待値 `raw 187,186,834 / calibrated 208,689,608` と追加検証ケースのパスを確認。

---

## 検証方法

リファクタリング・機能追加後は、以下でゴールデン値の一致を確認すること。

```bash
npm run test:golden          # = node test/golden.mjs（src/app.js を import し10T総ダメージを検証）
```

**期待値**（C27 探索リファインに伴い 2026-07-14 更新）:
- FullBurst: `10/10`
- TotalDmg（raw・較正なし＝…＋C23 judgフェーズ通算連続＋**C27 赤アビ後出しリファイン**モデル）: `187,186,834`
- TotalDmg（**calibrated**・自動較正 `{judg:160,pactcore:1}` 適用＝production 出荷値。overrideはルート選択を制御し、C27リファインは選択後の単調パスのため選択最適overrideは据置）: `208,689,608`
  - ※C27移動理由: 確定ルートに「赤アビ(color 'r')を同ターンの攻撃ロボ設置(`deploysRobot`)＋アンプリファ(`prelude`)の後へ」局所改善（厳密改善のみ採用＝単調安全）を追加＝ビームのgreedyロールアウト近似が赤アビ前出しを誤選択する系統ミス(C27)の是正。raw +552,510(+0.296%)/ cal +342,131(+0.164%)・FB不変(10/10)。旧C23 raw 186,634,324 / cal 208,347,477。

> 探索は `runSim` 実行時に config別に静的スコア s を自動較正する（`calibrateStaticScores`・proxy-shortlist+full-verify・単調安全）。golden.mjs は決定的検証のため較正結果 `{judg:160,pactcore:1}` を `setStaticOverride` で明示適用する（毎回の較正走行を避ける）。詳細 archive/SEARCH_ROLLOUT_DESIGN.md §6。

補助検証（大きな構造変更・Worker/ビルド変更時）:
```bash
npm run build                # dist/ 生成（worker 別チャンク・minify ON）が成功すること
npm run preview              # dist を http 配信 → ブラウザで探索/中断/UIを実機確認（ESMは file:// 直開き不可）
```

---

## 実機較正ステータス（詳細は CALIBRATION_ANALYSIS.md 参照）
- **確定パラメータ**:
  - バースト係数: ヤマト/ヘカテー/テトラ = 5.0/2500, エレイン = 5.5/3000
  - 追加ダメージフレーム: **アビ枠 (`'abi'` / 減衰率 0.04)**
  - エレインバースト追加: 常時1回、契晶80以上で3回発動
  - エジソン英霊武器追加ダメ: 2.5倍/80万 (アビ枠・onBurst実装済み)
  - ヤマト1アシ バーストダメージプラス: +10万/stack・味方全体のバースト対象 (C8)
  - ナイツサプレス(エレイン3): バーストダメ+20%・非累積(refresh)・2T (C11)
- **バックログ状態**:
  - C1, C2: open
  - C18: fixed (**ムーンコードのモデル乖離**＝真因。旧「即発動未強制」診断は誤りで撤回。実機仕様=ヘカテー自身アビ累積12毎・持続2T・即時発動へ修正し、試行2 T4実機トラブル(judg#12不可→13アビ目)と試行1 T4/T6バースト無しパターンを再現。golden再fit。詳細 CALIBRATION_ANALYSIS.md C18)
  - C19: fixed (**tenya_re=実機ではアビ使用扱い**＝ロボ反応発火＋アビ12proc計数[T2#12連理+2で実機確認]。`Sim._countAbilityUse`新設しtenya_re.execで発火。golden再fit)
  - C20: fixed→**C21で修正**(旧「無条件で各guard上限+1」は過剰付与と判明)
  - C21: fixed (**ifishant+1は押下時点でクォータ消化済み(=実機CD中)のエレインアビのみ**＝「CD中のアビを起こすだけで、発動可能な状態のアビの使用可能回数は+1できない」。sim02試行2で発見: T2#15 ifishant押下時 alone未使用→実機は上限2のまま→シム推奨のalone3回目(T2#25)が実機で不可。同押下時に消化済みだったlegendの3回目(T2#17)は実機通過＝条件付きモデルが両観測を同時に再現。アビ別フラット枠 ifAlone/ifLegend/ifPactcore で実装。golden再fit)
  - C22: **resolved候補** (試行2実測=B3で**契晶/累計/連理が全10チェックポイント完全一致＝非再現**。旧観測はC18/C21系の下流症状。クローズ確定は済=sim02統合分析)
  - C23: **fixed** (**真因=judgフェーズがターン毎リセット→戦闘通算連続へ是正**。実機3/3裏取り[T4 ph1/T5 ph0/T6 ph2]。`sim.judgPhase`新設。#19 re-armズレは下流症状。golden再fit raw 203.7M→186.6M[-8.4%=旧モデルのph1水増しの是正]/cal→208,347,477[override判130→160]。ENGINE_VERSION C23-judgphase-continuous)
  - C24: 診断済・fixは実機ゲート・低severity (**ゲージ±5〜10の系統乖離**=一様・+5はMACH_BG一意・FB非反転。sim赤反応は実機ロボ追撃と完全一致・黄反応もゲージ生む[赤のみは−50〜60過小]=残差は黄反応の1〜2計数差に局在[実機非表示で帰属未確定]。エレイン1はsimゲージ付与なし=欠陥3は逆符号で無関係。sim03で黄反応ゲージ量/エレイン1仕様を実測)
  - C25: open・再定式化 (**★絶対値較正の本丸: 乖離はpre-capのrawに局在**=cap値/slopeは飽和成分の一致で妥当と検証済み。B4の「cap外し(会心・急所を減衰後乗算)」仮説は**B5定量テストで棄却**=θ不整合・ヤマトT1会心のみで32%過剰予測・streak一致は飽和の鈍感さ。core=baseline不足+成長不足(F1正味実在)・**追撃はC5較正capでは実機737〜770万に到達不能=式/capレベルの独立乖離(C5再較正・C3合流)**。決定打=**非会心非急所アンカー→sim03プロトコル**。def=10維持)
  - C26: **fixed** (真因=純粋なシムUI設定忘れ[追撃有効化漏れ・applyGearバグではない]・LB IIはエジソンstat UPで追撃無関係。`_configSig`にmult/cap追加済。**追撃ON再探索キャッシュ受領=sim03執行対象**。★批判的再評価: 「推奨順系統バイアス」は過大評価=追撃ONでも押し順ほぼ不変[T1入替1・T2完全一致・T3小差]・追撃はcap飽和でsim総ダメ約1.1%。ただし追撃cap過小[sim≈156万 vs実機445〜1001万=3〜6×]はC25追撃点を裏付け。新課題=キャッシュがper-char ATK非埋込で再構成replayが1.7%非再現→sim03で表示ATKスナップ必須)
  - C3: investigating
  - C4, C5, C8, C9, C11, C12, C13, C14: fixed
  - C6: wontfix
  - C7: **撤回・改訂済** (試行2=B3で与ダメ側2フェーズ倍率×0.7/×1.2は非実在と確定→モデル化も手補正もしない。de-cutなしでフラット・リリース跨ぎ連続・表示ダメ≒総HP。B1のF1はde-cutアーティファクト。[web]出典は敵被弾側の取り違え疑い＝再確認のみ保留。enemies/walpurgis_loki.md §2改訂済)
  - C10: Phase5昇格
  - C15: closed (自動較正 `{judg:122,pactcore:1,effond:93}` を適用)
  - C16: fixed (探索高速化・キャッシュ・UIキャッシュ入出力・火力指数分母修正完了)
  - C17: wontfix (第4較正レバー検討＝BW64新baseで再検証。full生存はsleur/puvoirのみ+0.4〜0.5%・joint掃引27点で相互作用なし=単独加算どまり・3変数が実質飽和点。工数対効果不成立で見送り。データはCALIBRATION_ANALYSIS.md C17)
  - C27: **fixed** (探索品質。真因＝ビーム目的関数が将来ターンを静的greedyで代理採点＝赤アビ前出しを damage-max と誤選択。修正＝確定ルートへ whole-route 局所改善 `_refineRoute`(赤アビ color 'r' を同ターンの`deploysRobot`+`prelude`後へ・厳密改善のみ＝単調安全・タグ駆動でキャラ名リテラル無)を`_runRootPlan`(production/worker)とgolden.mjsに結線。golden再fit raw→**187,186,834**/cal→**208,689,608**・FB10/10・冪等(固定点)確認。ENGINE_VERSION `C27-red-after-setup-refine`。実gear損失は既定gearの8〜9×[T1約450〜490万]。全設定の履歴は CALIBRATION_ANALYSIS.md C27)
  * 現ゴールデン値: **raw 187,186,834 / calibrated 208,689,608** (C27 赤アビ後出しリファインにて再fit・2026-07-14)

---

## 現在の進行状況（引き継ぎ用・2026-07-13 更新）
- **現フェーズ**: Phase 4 = **統計的較正 × 反復可能ボス（2026-07-12 転換・PHASE4_PLAN §3.5.1）**。**Antigravity はワークフロー除外**＝全分析を Claude Code 担当。
- **sim02 完了（旧構造・凍結）**: walpurgis_loki T2較正。成果=①経済系（契晶/累計/連理）全10チェックポイント完全一致（C18/C19/C21受入成立・C22クローズ候補） ②C7撤回（与ダメ2フェーズ倍率は非実在） ③C25再定式化（乖離はpre-cap rawに局在・cap/slope妥当・「cap外し」仮説はB5で棄却） ④C26 fixed（エジソン追撃OFF探索=UI設定忘れ・`_configSig`拡張済） ⑤**C23 fixed＝judgフェーズ戦闘通算連続へ是正（実機3/3裏取り・golden再fit raw 187,186,834 / cal 208,689,608・ENGINE_VERSION `C23-judgphase-continuous`）** ⑥C24診断済（ゲージ±5〜10=黄ロボ反応の計数差に局在・低severity・fixは実機ゲート）。詳細は sim02 の B1〜B5・c23/c24 findings・integrated_analysis。
- **方針転換（2026-07-12 ユーザー決定・セッション末）**:
  1. **較正対象を「回数制限のない反復可能ボスバトル」へ転換・統計的較正を導入**（合意済み。論理は PHASE4_PLAN §3.5.1 / simulation/README.md）。
  2. **simフォルダ新構造（sim03以降）**: `data/`（config.json＋trialXX.md）＋`analysis/`（quantitative=定量のみ/qualitative=定性のみ/integrated=統合のみ）。TEMPLATE 改訂済み。
  3. **kill-turn は延期継続**。walpurgis での追撃ON再探索は転換により不要化（新ボスで探索し直す）。
- **sim03 boss緊急置換（2026-07-14 本セッション）＝フィンブルヴェトル→キャスパリーグ**:
  1. **契機**: フィンブル sim03 trial01 で**パーティ全滅**＝先の7T討伐は偶然・再現性なし＝統計的較正の「確実に反復」前提を満たさない。→ **フィンブル無期限延期**（`enemies/fimbulvetr.md` 冒頭注記・`ENEMY_REGISTRY` エントリは保持）。
  2. **新較正ボス＝キャスパリーグ**（`cath_palug`・**闇属性/affinity=1.5**・実機**2T討伐＝確実**・def/max_hp placeholder→sim03推定）。一次情報 `enemies/cath_palug.md`。**キャスパリーグの価値**: 闇=光有利アンカーの本命＋**「ライトレジスト＝光*以外*への耐性UP」が敵特性で明文化→光編成に隠れ耐性スカラ非適用がゲーム内保証**＝絶対レベル較正の理想。敵防御UP・味方ゲージDOWン**なし**＝フィンブルの系統交絡2種が構造的に消失。
  3. **プロトコルv3確定**（`simulation/sim03/README.md`）: ホライズン10T→**2T**・測定モードを**D（全深測定撃破・K/P統合）×5走**へ・**固定押し順は【要ユーザー確定・推奨シム推奨順】**（ゲージDOWNなしで実行不能リスク消失＝シム順が現実的＋序数検証も同時取得）。P1〜P3継続・P4延期継続。max_hp推定はT1終了HP%が鍵（2T=オーバーキル切断）。
- **第1バッチ準備完了（2026-07-15 セッション末時点＝全ゲート充足）**:
  1. ✅ ゲート2完了: `sim03/data/configA.json`＝**キャスパリーグ版・C27エンジン**（refine固定点検証済・override `{judg:200,pactcore:1}`・装備一次記録=`configA_gear_panel.md`）。
  2. ✅ ユーザー確定: **固定押し順=シム推奨順**（configAのT1 19手/T2 24手・`data/trial01.md`に採録済み）・**第1バッチ=D×5**。
  3. ✅ 表示ATKをLv95後実機値へ更新済み（`DISPLAY_ATK_OVERRIDE`・app.js。新ATK下でも固定ルートはrefine固定点=順序影響なし。**バッチ途中で押し順を差し替えないこと**）。表示HPは未更新（必要時対応・ユーザー合意）。
- **次セッションの申し送り（優先順）**:
  1. **実機第1バッチ受領**（trial01〜05・D×5・様式=`sim03/data/trial01.md`と`_recording_skeletons.md`・全hit毎・**T1終了HP%必記**・メタヘッダ必須）→ 定量/定性/統合のフロー厳守で分析（**情報の多さと正確さ優先**・quantitativeは手法/スクリプト/入力の明記=P3）。モデル分業の推奨= `essays/MODEL_ROLE_GUIDE.md` §4.2（Sonnet一次集計→Fable統合分析→Opus実装・切替はセッション境界）。
  2. 中間分析ゲート（P間決定性・ボス挙動安定性・max_hp収束・ディスペル一貫性）→第2バッチ配分（序数A/B・追加走など）。
  3. 較正順: **絶対レベル（キャスパリーグ=ライトレジスト光非適用でボス耐性=1保証＝本命アンカー）**→C25 raw枠帰属→C5追撃cap再較正（C3統合）→def/耐性→golden再fit。C24の2点・C23追検証は sim03 §3.2 に組込済み。
  4. 第2バッチ前: UIのdispAtk入力をLv95実機値へ更新→configA再export（`configA_gear_panel.md` §3.5）。
