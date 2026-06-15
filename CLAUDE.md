# 神姫PROJECT R — バーストトラッカー

`index.html` 本体 ＋ 手持ちウェポンマスタ `data/weapons.js` の2ファイルで完結する、
バースト編成のシミュレーター＆最適押し順トラッカー。ビルド不要・外部依存なし（HTML+CSS+vanilla JS）。
ブラウザで直接開いて動作する。ロジック・UI・CSSは全て `index.html` に集約し、装備マスタ実データ
（`WEAPON_MASTER`）のみ `data/weapons.js` に分離（`<script src>` で読込）する。

編成は4パターン（属性混在は不可・runSimがバリデーション）:
- 英霊: エジソン / ナポレオン（elem:null=神姫の最多属性に追従）
- 神姫: 光4人（ヤマト/ヘカテー/テトラ/エレイン）or 火4人（アマテラス/ミネルヴァ/ニケ/ラミエル）

基準編成（検証用ベースライン）: エジソン + 光4人。
火属性キャラ(data2.xlsx)は機構・効果量ともに実装済み。passion/victory のみ効果量が未確定で未配線。

## コード地図（index.html / 約1910行）

セクション編集時は該当範囲だけを Read すればトークンを節約できる。

| 範囲(行) | 内容 |
|---|---|
| 7–200 | CSS（`<style>`、Material白基調UI・スピナー） |
| 202–248 | HTML構造（ヘッダ/サイドバー/メイン/ローディング）＋ `data/weapons.js` 読込 |
| 251–262 | ゲーム定数（確定仕様・後述） |
| 263–386 | **`DMG`**（概算火力モデル定数・末尾に火属性セクション） |
| 387–488 | **`GEAR`/`SUMMON_REGISTRY`/`GEAR_K`**（装備設定・幻獣プリセット）＋**表示攻撃力**（`SSR_LV_RELEASE`/`DISPLAY_ATK_OVERRIDE`/`calcDisplayAtk`/`calcDisplayHp`） |
| 489–953 | **`CHAR_REGISTRY`**（全キャラ定義の唯一の集約先。光5キャラ→火5キャラの順） |
| 954–1022 | 編成グローバル構築（`buildFormation`/`ELEM`/`CHAR_SIM_STATES`/`MILESTONES`/`computeBaseScore`） |
| 1023–1397 | `class Sim` エンジン（tick/procR/burst/use/`_na`/beam等） |
| 1398–1469 | UI helpers（`uiFeats`/loopsHTML/gaugesHTML/cdBadgesHTML等） |
| 1470–1524 | カード描画（cardHTML/toggleCard） |
| 1525–1691 | **Web Worker**（`_buildWorkerCode`/`runSim`/`_fallbackRunSim`/`renderSim`） |
| 1692–1749 | 編成選択UI（編成・装備とも▶実行時にrunSimが読み取り反映） |
| 1750–1877 | 装備設定UI（renderGearPanel/applyGear・per-char `GEAR_K_C` 構築） |
| 1878–末尾 | INIT（renderParty等） |

最適化の最上位目標は**概算総ダメージ**（`DMG` モデル）。FB回数/総バースト/総ジャッジ/連理魔力
は補助指標として目的関数の下位次元に残る。詳細は「概算火力モデル」節を参照。

### 実行アーキテクチャ（Web Worker）

ビームサーチは重い（数秒〜10秒）ため、シムエンジン（`// ===== ゲーム定数` 〜 `// ===== UI HELPERS`
直前）を `_buildWorkerCode()` が文字列抽出 → Blob URL で Worker 化し、メインスレッドをブロックしない。
Worker はターン毎に `{type:'progress'}`（スピナー進捗）と `{type:'turn',row}`（カード逐次追記）を送り、
最後に `{type:'done',baseDmg}` を送る。`row` は `greedyTakeTurn` の戻り値（構造化複製可能な
plainオブジェクト）をそのまま転送する。Worker 非対応環境は `_fallbackRunSim()`（`setTimeout(0)`同期実行）へ。

**相対比率評価**: 最適シム（ビーム）と基準シム（`planDepth=2` 強制＝静的greedy）の総ダメージ比を
`renderSim(baseDmg)` がサマリーに「対基準比」として表示する（押し順最適化の効きを相対値で可視化）。

**編成依存UI（`uiFeats()`）**: ロボ（エジソン`state.droid`）・🌙ムーン（ヘカテー`ABIL.effond`）・
⚡連理/HELIX/ジャッジ（テトラ`ABIL.judg`）・⚡ニケ連理/20（`state.nike_renri`）・💎契晶（kc>0アビ＝エレイン）
の表示は編成から導出したフラグで出し分ける（凡例/ターンカード/サマリーバー/サマリー表）。
新キャラのループ系UIを追加する場合も `uiFeats()` にフラグを足し、固定表示にしない。
HELIX解禁ターン検出は `def.helix` 宣言（reached/doneKey）から汎用判定（エンジンにキャラ名リテラルなし）。
ニケのHELIX最速解禁は `milestones:{nike_renri:20}` がテトラ`renri:30`と同じ連理次元で目的関数に効く。

## アーキテクチャ原則

**`CHAR_REGISTRY` が唯一の編集先。** エンジン本体（`class Sim`）にキャラ名リテラルを書かない。

### CHAR_REGISTRY エントリの構造

```
CHAR_REGISTRY[charKey] = {
  type: 'hero'|'kamihime',
  jp, gcls,                        // 表示名・ゲージCSSクラス
  elem: 'light'|'fire'|null,       // 属性。英霊はnull=編成の主属性(神姫の最多属性)に追従
                                   // buildFormationがELEM(実効属性マップ)とelemCount(e)を構築
  state: { key: initVal, ... },    // キャラ固有sim状態変数（自動管理）
  abilities: { key:[col,cd,kc] },  // [色, CD, 契晶コスト]
  labelSuffix: { key: '...' },
  cdShow: { key: '表示名' },
  cands: {                         // 押し順エンジンが参照する候補定義
    key: {
      s: 数値|関数,                 // 静的スコア（デフォルト50）
      guard?: (sim,T,t)=>bool,
      exec?: (sim,T,ord,bset,t)=>void,  // 省略時: sim.use(key,T,ord)
      lookahead?: (sim,t)=>bool,   // ターン先読みガード（_primeLookaheadsで計算）
      atkBuf?: true,               // 攻撃/防御バフ系の分類タグ
      burstTrigger?: true,         // 誘発バースト系の分類タグ
    }
  },
  def: {
    gmax: 数値,                    // BG上限（省略時 other_max=100）
    keigyoGain: 数値,
    milestones?: { 状態変数キー: 上限 },   // 目的関数が min(sim[key],上限) を合算評価
    helix?: { reached:(sim)=>bool, doneKey:'stateキー' }, // HELIX解禁検出(初回到達ターン表示・テトラrenri30/ニケnike_renri20)
    onBurst?: (sim, atk, owner)=>void,     // 自分のバースト時
    onPartyBurst?: (sim, owner, T, atk)=>void, // 誰かのバースト時(ニケ連理/ラミエル等)
    onAbility?: (sim, name, color, T)=>void,   // 誰かのアビ使用時(闘気/赤カウント/祝福等)
    turnEnd?: (sim, T)=>void,              // ターン終了時(全キャラ呼出)
  },
}
```

### 新キャラ追加・編成差し替えは CHAR_REGISTRY 1箇所だけ

1. `CHAR_REGISTRY` に新エントリを追加（上記構造に従う）
2. `buildFormation(heroKey, [kamihimeKeys...])` の引数を変更
3. `CHAR_SIM_STATES` は `buildFormation` が自動構築 → Sim の init/snap/clone も自動

### state フィールドの規約

キャラ固有のバトル持続変数（一度限りフラグ・独自タイマー等）を宣言する。
`buildFormation()` が全キャラの state を集約し、Sim が自動管理する。
エンジン共通変数（renri/mooncode/mburst/keigyo/cum/dmg/buf）はここに含めない。

## 概算火力モデル（`DMG` 定数・231行付近）

`damageCalculator.txt` の実機ダメージ式は乗算ボックスが多数あり、全変数の厳密追跡は非現実的。
そこで**押し順で動く加算枠のみ追跡し、押し順非依存の枠は概算定数 `DMG.misc` に一括で畳む**。

### バフ期間管理（`buf` 辞書・エンジン共通変数）

バフは**上限なしで独立累積**し、各スタックが固有の持続ターンを持つ。
`buf = {abilityKey: [残ターン数, ...]}` でスタック毎に管理し、`tick()` が毎ターン
デクリメント・失効削除する。各 cands の exec で `(sim.buf.KEY??=[]).push(DMG.dur_KEY)` を実行。

**累積可バフ**(`push`で独立累積・各スタック固有持続)と**閾値refreshバフ**(`=[dur]`で単発上書き)の2系統。

| buf キー | 枠 | 効果量 | 持続 | 累積 |
|---|---|---|---|---|
| `banoshik` | アサルト | `assault_banoshik=0.10`(ロボ作動中の黄アビ毎・use内付与) | 3 | 累積 |
| `absolute` | アサルト+バーストダメUP+旺盛+会心+急所 | `assault_absolute=0.30`/`burst_dmg_absolute=0.30` | 2 | 累積 |
| `puvoir` | 属性値+急所 | `elem_puvoir=0.15` | 6 | 累積 |
| `legend` | 急所 | `acute_legend=0.005` | 3 | 累積 |
| `leg_aslt` | アサルト | `assault_legend=0.20`(レジェンドアシ・契晶cum≥10) | 3 | refresh |
| `leg_vigor` | 旺盛 | `vigor_legend=0.3552`(契晶cum≥70) | 3 | refresh |
| `leg_spec` | 特殊攻撃 | `spec_legend=0.20`(契晶cum≥80) | 3 | refresh |
| `roy` | 独立フラット(全攻撃) | 通常`roy_na_frac`/アビ`roy_abi_frac`/バースト`roy_burst_frac`×`_na()`(原文効果量表÷100万・tier=強化効果数 0-5/6-10/11-15/16+) | 2 | 累積 |
| `pike` | 旺盛 | `vigor_pike=0.3552`(基礎値42・フルHP) | 2 | 累積 |
| `pike_def` | 防壁 | buffCount精度用(ダメージ無寄与) | 2 | 累積 |
| `pike_crit` | 急所+会心 | `acute_pike_crit=0.30`(確実100%×倍率1.3) | 2 | 累積 |
| `consort_def` | 防御DOWN→`defdown` | `defdown_consort=0.10`/stack | 6 | 累積 |
| `enten` | 属性値+急所 | `elem_enten=0.10`/`acute_enten=0.03` | 4 | 累積 |
| `fastes` | 属性値 | `elem_fastes=0.20`/stack | 4 | 累積 |
| `fastes_acute` | 急所(祝福消費時) | `acute_fastes=0.02`/stack | 4 | 累積 |
| `logos` | 属性値(耐性DOWN→elem近似) | `defdown_logos=0.40`(有効化で一括elem加算) | 6 | 累積 |
| `divine` | アサルト+急所 | `assault_divine=0.05`/`acute_divine=0.03` | 3 | 累積 |
| `hobby_def` | 防御DOWN→`defdown` | `defdown_hobby=0.10`/stack | 4 | 累積 |
| `hydro_def` | 防御DOWN→`defdown` | `defdown_hydro=0.30`(推定) | 3 | 累積 |
| `universa` | 敵デバフ→`defdown` | `defdown_universa=0.20`/stack | 2 | 累積 |
| `universa_b` | バースト耐性DOWN→`defdown` | `defdown_universa_b=0.15`/stack | 2 | 累積 |
| `ama_link` | 特殊攻撃 | `spec_ama_link=0.30` | 1 | 累積 |
| `lami_power` | バースト威力 | `lami_power_val=0.10`/stack(burst係数に加算) | 6 | 累積 |

- 通常攻撃概算 `_na()` = `(base + royFlat) × (1+defdown)`
  - `base` = `GEAR_K × (1+aslt)(1+elem)(1+vigor)(1+crit)(1+acute)(1+spec)`
  - `royFlat` = `(roy本数) × base × roy_na_frac[roy_tier]`（ロワ・クモンド独立枠）
  - `defdown` = 防御/耐性DOWN各ソースの合算（独立乗算枠）
  - `aslt` = banoshik×0.10 + absolute×0.30 + (leg_aslt?0.20:0) + divine×0.05 + GEAR
  - `elem` = puvoir×0.15 + enten×0.10 + fastes×0.20 + (logos?0.40:0) + GEAR
  - `vigor` = min(absolute→0.30 + leg_vigor→0.3552 + pike→0.3552 + GEAR, 1.0)
  - `crit` = min(0.20 + absolute×0.25 + GEAR, 1.0) × 0.5
  - `acute` = puvoir×0.010 + absolute×0.030 + legend×0.005 + enten×0.03 + fastes_acute×0.02 + divine×0.03 + pike_crit×0.30 + GEAR
  - `spec` = (leg_spec?0.20:0) + (ama_link?0.30:0) + GEAR
  - `defdown` = hydro_def×0.30 + consort_def×0.10 + hobby_def×0.10 + universa×0.20 + universa_b×0.15
    ※ 敵火耐性DOWN(logos)はゲームでは独立ボックスだが、近似として elem に0.40加算している

### 装備設定（`GEAR` 定数・幻獣/ウェポン）

押し順非依存の常時ボックス補正。シミュ開始時にUIから設定し、`_na()` の各ボックスへ flat 加算する。
`GEAR_BOXES` が `[key, 表示名]` のボックス定義、`GEAR` が各ボックスの加算値(fraction)。
- **幻獣**: `SUMMON_REGISTRY`(守護/カタス/鬼の3プリセット)から `SUMMON_SLOTS`(=2)枠を**重複可**で採用。
  各プリセットは `weapon_amp`(ウェポンスキル倍率UP・2枠分を加算)と `box:{ボックスキー:加算fraction}`(直接補正)を持つ。
  実効ウェポンスキル = 入力% × (1 + Σ weapon_amp) で計算し、各ボックスへ加算する(効果量は実測確定)。
  - 守護: weapon_amp=0.40 / カタス: weapon_amp=0.50, assault+1.0 / 鬼: weapon_amp=0.50, assault+1.0, spec+0.10
- **ウェポンスキル**: 各ボックスの合計%を1欄ずつ入力(スキル個数は問わず合算値のみ・%→/100でfraction)。
- UI: `renderGearPanel()`/`applyGear()`。全0で倍率1.0=ベースライン不変。
  シミュは重い(ビームサーチ・数秒〜10秒)ため入力変更での自動再実行はせず、`runSim()` 冒頭で
  `applyGear()` を呼んで実行時に同期する(▶ボタンで明示実行)。Worker へは `gearState:{...GEAR}` で全キー転送。
- **`GEAR_K`**: `_na()` ホットパス用の事前畳み込み係数 = `base_atk×(1+dmgup)(1+other)×misc/enemy_def`。
  `recalcGearK()` で GEAR 変更時に再計算。`_na()` は乗算ボックスにこれを掛けるだけ。
  per-char版 `GEAR_K_C[charKey]` は各キャラの表示攻撃力ベースで `applyGear()` が構築し、`_na()` が
  オーナー別に参照する（武器マスタ設定時。未設定なら共通 `GEAR_K`）。

#### 表示攻撃力（per-char ATK）の算出

`calcDisplayAtk(charKey, slots, summonAtkTotal, heroRank, heroMasterAtkPct)` が
**武器ATK×得意補正(1.2) ＋ 幻獣ATK合計 ＋ キャラ基本ATK** で満凸 target build の表示攻撃力を推定する
（`calcDisplayHp` も同型）。武器実データは `data/weapons.js` の `WEAPON_MASTER`（最大Lv値）。
- **`SSR_LV_RELEASE`**: レベル上限解放の累積ステータス増分（型非依存・公式有志検証）。
  Lv80=±0 / Lv85=ATK+1950,HP+375 / Lv90=ATK+3900,HP+750。神姫 `baseAtk`/`baseHp` はLv80基準値とし、
  `def.lvCap`(80/85/90) の解放分を `calcDisplayAtk`/`calcDisplayHp` が上乗せする。
  （例: テトラ `lvCap:90` がヘカテーとの実機表示差6210＝base差2310+解放3900を厳密再現。）
- **`DISPLAY_ATK_OVERRIDE`**: ゲーム画面の確定表示ATKをキャラ毎に直接指定する0-fudge較正。
  +99/育成途中/placeholder/Lv解放を全て内包した実測値で `calcDisplayAtk`(満凸推定) を上書きする。
  `applyGear()` のper-charループで override優先・無指定キャラは満凸推定へフォールバック（現状維持）。
  満凸decompose(target build)と実機現状(override)は別状態のため両立せず、現状合わせはoverrideが担う。
- **フレーム別ダメージUP枠**(実機の通常/アビ/バーストダメージUPは該当フレーム限定・`_na()`のbaseに含めない):
  `na_dmg`(通常=judge ph2に`×(1+na_dmg)`) / `abi_dmg`(アビ=judge ph0・コンソートに`×(1+abi_dmg)`) /
  `burst_dmg`(バースト=`burst()`係数に加算 `a+...+burst_dmg`)。`dmgup`(白虎/与ダメ)は全フレーム共通でGEAR_K側。
- **減衰(上限)モデル `_decay(frame,raw,base)`**(有志実測): 公称「上限」だが超過分も寄与率(slope)で
  減衰しつつ伸びる区分線形。計算ダメージ raw → 実ダメージ。上限UP枠 `na_cap`/`abi_cap`/`burst_cap` は
  第一上限を `×(1+up)`(第二以降の差分は固定オフセット)。
  - `na`: 第一35万/第二45万/第三55万(実ダメ)・寄与率 1→1/2→1/4→1/8(raw閾値35/55/95万)
  - `burst`: 100万・寄与率 1→1/10  /  `abi`: 基準=キャラ毎(`judg_cap`/`consort_cap`)・超過 1/25
  - `hard`(追撃/城塞): 寄与率0=完全頭打ち(betaiaは `betaia_cap` のmin)
  - 値は**実ダメージ単位**。本シムは抽象スケール(`_na()`~数百)で raw≪上限のため**恒等(休眠)**。
    `base_atk` 等を実ダメ較正した時点で自動的に減衰が効く基盤。バーストストリーク上限750万は寄与率不明で未実装。
- バースト = `_decay('burst', _na()×(burst_coef_a + absolute本数×burst_dmg_absolute + burst_dmg)) + royBurst独自枠`、
  フルバースト5人時は攻撃フェイズ合計に `×(1+burst_streak)`。
- ジャッジ循環: ph0=10ヒット(`_decay('abi', _na()×3×(1+abi_dmg), judg_cap)`＋amplifa＋royAbi独自枠) / ph1=バースト / ph2=通常(`_decay('na', _na()×(1+na_dmg))`)
- `dmg`(総ダメージ累計)は burst()/judg exec/通常攻撃で加算。反逆は無視。急所は本来有利属性のみだが期待値で一律計上。

### 値の所在と原則

値は**全て `DMG` 定数に集約**し、各キャラの加算ロジックは `CHAR_REGISTRY[*].cands[*].exec` 内で
`DMG.*` を参照する（エンジン本体・キャラ定義のどちらにも数値リテラルを散らさない）。
非有利属性も一括シミュするため属性相性倍率は考慮しない（ベース1.0）。
火力は**プランのランキング（相対比較）**用途であり、絶対値の厳密性は問わない。

目的関数 `_objective()` は `[総ダメージ(整数), FB数, 総バースト, 総ジャッジ, renri, cum, keigyo]` を
辞書式で返す（**総ダメージが最上位**、以降は補助指標／タイブレーク）。

## 変更禁止スペック（確定ゲーム定数）

`index.html` 219行付近の定数。値の変更は実機仕様と乖離するため不可。

- `RENRI_CAP=5`（コヴァレントproc 同ターン発動上限＝連理魔力獲得＆ジャッジ再発動の共通カウンタ）
- `JUDG_REACT=RENRI_CAP`（ジャッジ再発動はprocと同一カウンタ。初回自然分を含め最大6回）
- `TENYA_FROM=2`（天矢乱舞 使用可能開始ターン）
- `FB_THR=100`（フルバースト閾値。カスケード+10で90/80…でも連鎖発火）
- `MACH_BG=5`（マシーンタクトゥ ロボ作動1回あたりBG増加）
- `KEIGYO_MAX=15`（契晶最大値）

### 設計上の不変条件（壊さない）

- **ジャッジ即発動**: CD=0になり次第即発動。同ターン上限 `judgCap = JUDG_REACT + (開始時cd.judg===0?1:0)` = 最大6。
- **コヴァレント・アルカナ(renri＆ジャッジ再発動)**: abi/12・burst/2 の2チャネルでprocが発火し、
  「連理魔力+1」＆「ジャッジ即使用可(arm: cd.judg=0)」を同時付与。proc は同ターン5回上限。
  通常攻撃チャネル(9回)はフルバースト前提では未到達のため未実装。
- **arm非蓄積**: proc arm は cd.judg>0 の時のみ有効（cd=0ならスキップ）。二値制御。
- **テトラのバースト効果(onBurst)**: 自バーストのみ対象。誘発バーストではjudgを除外してCD短縮。
- **モビウスムーンズ**: partyバースト5回毎にヘカテー(puvoir所有者)の全アビCDリセット。
- **天矢乱舞**: ゲージ不足キャラが存在するターン(T2以降)のみ使用可。
- **proc機会損失の最小化**: alone・judg が攻撃バフより先に発動するのは意図的最適化。
  alone→judg→攻撃バフ の順でburst-2 procとabi-12 procの両方を同一ターンで取得できる。
- **ロワ・クモンドの3枠**: 「全攻撃ダメージプラス」は通常/アビダメ/バーストで別効果量(原文表)。
  `roy_na_frac`(通常=`_na()`内)・`roy_abi_frac`(アビダメ=ジャッジph0)・`roy_burst_frac`(バースト=`burst()`)の
  3枠を独自枠加算する。ロワは味方全体付与のため全員のバーストに乗る(burst内で`buf.roy`判定)。
- **buffCount=強化効果数のみ**: tier判定の「(英霊/自分の)強化効果の数」は味方バフのみ。
  敵デバフ系(`DEBUFF_KEYS`=consort_def/hobby_def/hydro_def/universa/universa_b/logos)は除外する。
- **ロボ独立追跡**: ドロイド(2アビ)＝攻撃ロボ(`sim.droid`)、バノーシク(1アビ)＝補助ロボ(`sim.banoshik_robot`)。
  両者は独立した3T変数で管理し、互いに干渉しない。
  BG増加(T.ra)は攻撃ロボ=赤アビ反応・補助ロボ=黄アビ反応（同一アビに両ロボが反応することはない）。
  バノーシクアサルトバフ(`buf.banoshik`)は補助ロボ作動中の黄アビ限定。

## 検証方法

リファクタ後は FB10/10 維持＆概算総ダメージが基準と一致するか確認する。
目的関数の最上位が総ダメージのため、押し順は火力最大化方向に決まる（renriは線形ではない）。

```bash
node -e '
const html=require("fs").readFileSync("index.html","utf8");
let code=html.slice(html.indexOf("// ===== ゲーム定数"), html.indexOf("// ===== UI HELPERS"));
code+="\nglobalThis.Sim=Sim;globalThis.buildFormation=buildFormation;";
(0,eval)(code);
globalThis.buildFormation("edison",["yamato","hecate","tetra","elaine"]);
const sim=new globalThis.Sim();
let fb=0;
for(let t=1;t<=10;t++){const r=sim.takeTurn(t); if(r.full)fb++;
  console.log("T"+t,"FB:"+r.atk.length,"J:"+r.ju,"renri:"+r.renri,"dmg:"+Math.round(r.dmg));}
console.log("FullBurst:",fb+"/10","TotalDmg:",Math.round(sim.dmg));
'
```

期待値（基準・DMG定数が現行値の場合）:
```
T1  FB:5 J:1 renri:4  dmg:152,321     T6  FB:5 J:3 renri:29 dmg:2,025,131
T2  FB:5 J:4 renri:9  dmg:501,296     T7  FB:5 J:4 renri:34 dmg:3,064,597
T3  FB:5 J:4 renri:14 dmg:842,389     T8  FB:5 J:6 renri:39 dmg:4,173,194
T4  FB:5 J:4 renri:19 dmg:1,208,648   T9  FB:5 J:2 renri:44 dmg:4,655,377
T5  FB:5 J:5 renri:24 dmg:1,729,075   T10 FB:5 J:6 renri:49 dmg:5,801,386
```
（FullBurst:10/10、TotalDmg:5,801,386。`DMG` 定数を変えると数値も変わる＝この基準も更新する。
バフは上限なしで独立累積し持続ターンで失効(buf辞書管理)。
エンジン: BEAM_W=24/BEAM_W_INNER=4、目的関数最上位=概算総ダメージ。）

## 開発ルール

- 開発ブランチ: `claude/wizardly-dirac-JIdyw`
- 火力は `DMG` 概算モデルで算出（押し順依存の加算枠のみ追跡・残りは misc に概算）。
- 単一ファイル構成を維持する（JS/CSSの外部ファイル分割はしない方針）。
