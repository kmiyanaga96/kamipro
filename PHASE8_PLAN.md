# PHASE8_PLAN — アクセサリー実装

> **種別**: フェーズ計画台帳（Phase 8・ROADMAP §3.5 の詳細化） ／ **ゴール**: 新装備系統「アクセサリー」をシムのダメージモデルへ反映し、未装備時 golden 不変・装備時は damage_frames.md の枠規約どおりに火力が動く状態にする ／ **完了条件**: (a) `ACCESSORY_REGISTRY` とUI枠が入り、(b) 未装備で golden 不変（raw 197,775,394 / cal 211,462,826）、(c) 代表アクセ数種で枠加算が damage_frames.md と一致することを replay で確認 ／ **状態**: 策定中（2026-07-22 起草・実装未着手）
>
> 作成 2026-07-22 ／ 関連: ROADMAP.md §3.5（Phase 8 採番元）・gamedata/md/その他/damage_frames.md（アクセ枠の一次情報）・src/app.js `applyGear`/`GEAR_BOXES`

---

## 0. 読み順・位置づけ

本書は ROADMAP §3.5（プレースホルダ）の詳細化。**押し順・較正（sim05）とは独立に進められる自己完結タスク**で、アクセは「未装備で無影響」を不変条件とするため既存の golden／較正環境を壊さない。着手時はまず §6 の intake（ユーザー一次情報）を埋めてから §5 の実装ステップへ入る。

## 1. 目的とスコープ

- **やること**: アクセサリー（新装備系統）の**常時ボックス補正**をダメージ計算へ反映する。想定効果は攻撃UP・与ダメUP・通常攻撃ダメUP・会心など（§2）。
- **やらないこと（初期スコープ外）**: 発動系・CD系・フレーム差動・HP参照などの**押し順に絡む効果**（もし該当アクセが存在すれば §4.6 の分岐で別途設計）。生存モデル依存の効果は未確定Phase(i)へ委譲。
- **前提の仮説（ROADMAP §3.5）**: アクセが「押し順非依存の常時ボックス補正」主体なら、幻獣2枠・ウェポンスキルと同じく `applyGear()` への集約で `class Sim`（エンジン本体・押し順探索）を一切触らずに入る＝Phase 6(A) と同系統の軽量拡張。§2 の一次情報はこの仮説を支持している。

## 2. 一次情報の現状（damage_frames.md からの枠マッピング）

現時点で判明しているアクセ→枠の対応（`gamedata/md/その他/damage_frames.md`・ユーザー提供の一次情報）:

| アクセ系統 | 効果 | 帰属枠（damage_frames） | 対応する GEAR box | 備考 |
|---|---|---|---|---|
| （攻撃系アクセ） | 攻撃UP | ①攻撃枠 | `assault` | **アクセの攻撃UPは40%上限**（アクセ固有cap・§4.2） |
| タイムピースシリーズ | 与ダメUP | ⑥与ダメUP枠 | `dmgup` | 上限未確認 |
| ブレスレットシリーズ | 通常攻撃ダメージUP | ⑥与ダメUP枠 | `dmgup` | ⚠**ウェポンスキルのテクニカ（通常ダメUP=`na_dmg`枠）とは別枠**。ブレスレットは与ダメ枠側に入る点に注意 |
| 天使シリーズ | 会心 | ⑨会心枠 | `crit_rate` | 有利属性でなくても発動 |

**要点**: 判明分はすべて**既存の GEAR box に写る**＝新規 box を増やさずに実装できる可能性が高い（＝`_configSig` の構造も不変・キャッシュ名前空間を壊さない。§4.5）。ただし系統の全容・スロット数・per-char/全体の別・数値は未取得（§6）。

## 3. 現行装備アーキテクチャの要点（実装の土台）

- **GEAR_BOXES**（src/app.js:32〜）: `assault/elem/vigor/spec/dmgup/acute/crit_rate/other` ＋フレーム別 `na_dmg/abi_dmg/burst_dmg` ＋上限UP `na_cap/abi_cap/burst_cap`。各 box は fraction を持ち、`_na()`/`burst()`/`_decay()` が参照。全0で倍率1.0＝ベースライン不変。
- **applyGear()**（src/app.js:1317〜）: ①GEAR を0クリア → ②幻獣の `weapon_amp`(加護)と box を収集 → ③ウェポンスキルを box へ（×(1+weaponAmp)）→ ④手動補完 `wpn-<box>` → ⑤幻獣直接 box → ⑥`recalcGearK()`。**アクセはこのループに1段追加するのが自然**。
- **`_configSig`**: `JSON.stringify(GEAR)` を含む（src/app.js:222 周辺）。**既存 box に加算する限り、アクセ寄与は自動的に config 署名へ入り、結果キャッシュの正しさは保たれる**（別アクセ構成は別キーになる）。⚠ GEAR のキー順は署名に効くため **GEAR_BOXES の並びは変更しない**（新 box が必要な場合のみ末尾追加＋ENGINE_VERSION更新）。
- **GEAR_K / GEAR_K_C**: `recalcGearK()` が box から探索用の集約係数 `GEAR_K` を作る。per-char は表示ATKから `GEAR_K_C`。**アクセが全体枠なら GEAR_K 経由で自然に乗る**。per-char 装備なら別処理が要る（§4.3）。
- **未装備=無影響**: box は全0初期化なので、アクセ0個ならループが何も足さず golden 不変（§4.5・受入基準）。

## 4. 設計方針（推奨）

### 4.1 DBスキーマ — `ACCESSORY_REGISTRY` 新設（推奨）

- **推奨**: `gamedata/js/accessories.js` に `ACCESSORY_REGISTRY` を新設（`SUMMON_REGISTRY`/`WEAPON_MASTER` と並列の source-of-record）。各アクセは**box宣言型**（幻獣 box と同型）:
  ```js
  export const ACCESSORY_REGISTRY = {
    timepiece_x: { name:'タイムピース〇〇', series:'timepiece',
                   box:{ dmgup:0.10 } },              // 与ダメ枠へ +10%
    bracelet_x:  { name:'ブレスレット〇〇', series:'bracelet',
                   box:{ dmgup:0.08 } },              // 通常攻撃UP→与ダメ枠
    attack_x:    { name:'（攻撃系）',        series:'attack',
                   box:{ assault:0.20 }, accCap:'assault40' }, // §4.2 の40%上限対象
    angel_x:     { name:'天使〇〇',          series:'angel',
                   box:{ crit_rate:0.05 } },
  };
  ```
- **却下案**: 既存 GEAR の手動 `wpn-<box>` 入力へ相乗り。→ アクセを「装備品」としてDB化できず、系統ごとの上限（40%）や将来の発動系拡張を表現できないため不採用。
- md 一次情報は `gamedata/md/その他/`（または新設 `gamedata/md/アクセ/`）にシリーズ別で intake（キャラmd と同じ §1一次情報/§2シムデータ様式）。

### 4.2 applyGear 統合 — アクセ収集ループ＋攻撃UP 40%上限

- applyGear の④と⑤の間に**アクセ収集ループ**を1段追加:
  ```js
  // アクセサリー: 位置非依存の box 加算。攻撃UPはアクセ固有40%上限で別集計→クランプ。
  let accAssault = 0;
  for(const accKey of CURRENT_ACCESSORIES){            // §4.4 のスロット
    const a = ACCESSORY_REGISTRY[accKey]; if(!a?.box) continue;
    for(const [box,amt] of Object.entries(a.box)){
      if(box==='assault' && a.accCap==='assault40'){ accAssault += amt; }
      else if(GEAR[box]!==undefined){ GEAR[box] += amt; }
    }
  }
  GEAR.assault += Math.min(accAssault, 0.40);           // アクセ攻撃UP合計の40%上限
  ```
- **40%上限の帰属**: 一次情報「アクセでの攻撃UPは40%上限」は**アクセ由来の攻撃UP合計**に対する上限であり、ウェポン/幻獣由来の攻撃枠には掛からない（＝別集計してからクランプ→assault box へ合流）。他系統（与ダメ・会心）は現状「上限未確認」なので初期はクランプなし（判明したら同型で追加）。
- **weaponAmp（加護）を掛けるか**: アクセは幻獣加護の乗算対象**外**とみなす（アクセは装備品で、加護＝幻獣メイン効果の増幅なので別系統）。＝アクセ box は `×(1+weaponAmp)` を通さず素の値で加算。※一次情報で加護がアクセにも乗ると判明したら見直し（§6 Q5）。

### 4.3 装備モデル — per-character か 全体/アカウント か（**最重要の分岐・要ユーザー確定**）

神姫のアクセは通常キャラ個別装備だが、damage_frames の記述は枠（全体挙動）で語られている。ここで実装難度が二分する:

- **案A（全体枠として近似）**: アクセ効果をパーティ共通の GEAR box へ集約（＝現行のウェポン/幻獣と同じ扱い）。**軽量・golden 影響は box 加算のみ・GEAR_K 経由で自然**。編成全員が同種アクセを積む前提の近似。→ **初期実装の推奨**。
- **案B（per-char 装備）**: アクセをキャラ単位で装備し、そのキャラのダメージにのみ乗せる。`GEAR_K_C`（per-char 係数）と同様に per-char box を持つ必要があり、`_na()`/`burst()` が owner 別に box を引く改修が要る（`class Sim` に踏み込む＝軽量でない）。実機がキャラ個別で効果が偏るなら必要。

→ **§6 Q1 で確定**。まず案Aで骨格を入れ、per-char 必須と判明した箇所だけ案Bへ段階拡張する方針を推奨。

### 4.4 UI枠・スロット

- アクセ用のセレクタ枠を追加（スロット数・per-char/party は §6 Q1・Q2 依存）。案Aなら「パーティ共通アクセ ×N スロット」、案Bなら「キャラ×アクセスロット」のグリッド。
- 保存/復元（既存の slot 保存機構・`wpnBoxes` と同様に `accessories` を config へ）。
- 表示順・ラベルは GEAR_BOXES_DISPLAY と同じく描画専用配列で管理（計算/署名に非影響）。

### 4.5 golden 不変担保・キャッシュ整合

- **未装備=無影響**: アクセ0個でループが何も足さない＝GEAR 全0維持＝golden 完全不変。**受入の第一条件**。
- **_configSig**: 既存 box への加算に留める限り `JSON.stringify(GEAR)` が自動で捕捉＝キャッシュ正当性は保たれる。**新規 box を足す場合のみ** GEAR_BOXES 末尾追加＋`ENGINE_VERSION` 更新（旧キャッシュ fast-reject）。判明分（§2）は既存 box で足りるため**新 box 不要の見込み**。
- **golden.mjs**: アクセ未装備が既定なので改変不要。装備時検証は別途 replay ケースで（§7）。

### 4.6 押し順に絡む効果が出た場合（将来分岐）

もし発動系（例: バースト時に○○）・CD短縮・フレーム差動・HP参照アクセが存在したら、それは box 補正では表現できず `CHAR_REGISTRY` 汎用フック（onBurst/turnEnd 等）や新 state と同型の設計が要る＝**別タスクとして切り出し**、初期スコープ（§1）には含めない。§6 Q4 で棚卸しして仕分ける。

## 5. 実装ステップ（依存順・着手時）

1. **intake（§6）を埋める** — ユーザーからアクセ系統・効果・数値・スロット/装備モデルを受領。branch を切る（CLAUDE.md Git ワークフロー）。
2. **`gamedata/js/accessories.js` に `ACCESSORY_REGISTRY`** を作成（判明系統から・box宣言型）。md 一次情報を intake として格納。
3. **applyGear にアクセ収集ループ＋40%クランプ**（§4.2）。案Aで実装。
4. **UI枠**（§4.4）＋ config 保存/復元。
5. **検証**: `npm run test:golden`＝未装備で **raw 197,775,394 / cal 211,462,826 不変**を確認。代表アクセ数種を装備した replay で枠加算が damage_frames.md と一致することを確認（§7）。
6. **ドキュメント**: ROADMAP §3.5 を「実装済み」へ、CLAUDE.md 台帳を更新、本書を archive/ へ移送（同一コミット規律）。押し順に絡む効果が残れば §4.6 として繰り越し記録。

## 6. 未確定・ユーザー確認事項（intake checklist・着手ゲート）

| # | 質問 | なぜ効くか |
|---|---|---|
| Q1 | アクセは**キャラ個別装備**か、パーティ/アカウント共通の効果か | §4.3 の案A/案B＝軽量実装か class Sim 改修かの分岐 |
| Q2 | 1キャラ（または編成）あたりの**アクセ枠数**・シリーズ併用可否 | UI枠・上限計算の設計 |
| Q3 | 現在使う**アクセ系統と数値**の全容（攻撃/タイムピース/ブレスレット/天使/他）・各上限 | ACCESSORY_REGISTRY の実データ |
| Q4 | **発動系/CD系/フレーム差動/HP参照**のアクセはあるか | 初期スコープ（常時box）に収まるか §4.6 送りかの仕分け |
| Q5 | 幻獣**加護（weapon_amp）はアクセ攻撃UPにも乗る**か | §4.2 の乗算経路 |
| Q6 | ブレスレット「通常攻撃ダメUP」は本当に**⑥与ダメ枠**か（テクニカの na_dmg 枠と別か）を実機で再確認 | §2 の枠帰属の裏取り |

## 7. 受入基準

1. **未装備で golden 不変**: `npm run test:golden` = raw 197,775,394 / cal 211,462,826 / FB 10/10。
2. **装備時の枠準拠**: 代表アクセ（攻撃系・タイムピース・天使 各1）を装備した headless replay で、該当 GEAR box への加算が §2 の枠マッピングと一致（攻撃UP合計>40%で40%にクランプされることを含む）。
3. **キャッシュ整合**: アクセ構成違いが別 `_configSig` になり、同一構成の再探索がキャッシュヒット時に決定的 replay で1円一致（既存のヒント検証機構で担保）。
4. **押し順非改変**: アクセ導入で `class Sim`・探索ロジックに分岐が入らない（常時box のみ）。発動系が必要になった時点で本条件を明示的に解除し §4.6 を起票。
