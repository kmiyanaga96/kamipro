# 神姫PROJECT R — バーストトラッカー 開発ガイド

## 概要
`index.html`（UI・ロジック）と `data/` 配下の外部DBファイル群（武器・幻獣・敵・キャラ）で構成される、バースト編成シミュレーター＆最適押し順トラッカー。外部ビルド不要で、直接ブラウザで動作。

## ファイル構成 & コード地図 (index.html: 2173行)
- `data/weapons.js`: 武器マスターDB (`WEAPON_MASTER`)
- `data/summons.js`: 幻獣マスターDB (`SUMMON_REGISTRY`)
- `data/enemies.js`: 敵DB (`ENEMY_REGISTRY`)
- `data/characters.js`: 統一キャラDB (`CHAR_REGISTRY` + `SUB_REGISTRY` 統合、フレイヤ定義含む、`DEBUFF_KEYS`/`buffCount`同梱)

### index.html コード地図
| 範囲(行) | 内容 |
|---|---|
| 7–209 | CSS |
| 211–282 | HTML構造 |
| 283–287 | 外部JSファイル読込 (`weapons`/`summons`/`enemies`/`characters`) |
| 289–302 | ゲーム定数（確定仕様・後述） |
| 303–488 | **`DMG`**（火力モデル定数） |
| 489–623 | **`GEAR`**（装備設定）＋表示ステータス計算 |
| 624–709 | `buildFormation()` 構築処理 |
| 710–1189 | `class Sim` エンジン（tick, procR, burst, use, _na, beam 等） |
| 1190–1373 | リプレイモード ＋ ルート分散ヘルパ (`enumerateRootPrefixes`含む) |
| 1374–1494 | UI helpers (`AUTO SIM`含む) |
| 1495–1730 | Web Worker プール・並列探索 (`_buildWorkerCode`含む) |
| 1731–2151 | 各種UI（編成・装備・保存） |
| 2152–末尾 | INIT |

---

## 開発ルール & 不変条件

### 1. キャラクター追加・変更の原則
- **`CHAR_REGISTRY`（data/characters.js）が唯一の編集先。** エンジン本体（`class Sim`）にキャラ名リテラルを記述しない。
- キャラ固有状態は `state` に宣言（Simが snap/clone/init で自動同期）。
- 累積アサルトやバーストプラス等の状態は、クローン時の参照共有を防ぐため、オブジェクトではなく**フラットな数値変数**として `state` に宣言すること。

### 2. 確定仕様・設計不変条件
- **ジャッジ即発動**: cd.judg=0になり次第即発動。同ターン上限 `judgCap = 5 + (開始時cd===0?1:0)`。
- **コヴァレント・アルカナ**: アビ12回 / バースト2回ごとにproc発火。連理魔力+1 ＆ ジャッジCD=0を同時付与。同ターン5回上限。
- **モビウスムーンズ**: パーティ全体のバースト5回ごとに、ヘカテーの全アビCDをリセット。
- **イフィシャント早撃ち抑止**: `IFISHANT_MIN_CD = 3`（CD中アビが3つ未満は使用不可）。
- **ロワ・クモンドの3枠加算**: 通常（`roy_na_frac`）、アビ（`roy_abi_frac`）、バースト（`roy_burst_frac`）をそれぞれ独自枠加算。

## 検証方法
リファクタリング・機能追加後は、Node.jsで以下のワンライナーを実行し、既存の検証基準値と一致することを確認すること。

```bash
node -e "const fs = require('fs'); const html = fs.readFileSync('index.html', 'utf8'); let fullCode = ''; fullCode += html.slice(html.indexOf('// ===== ゲーム定数'), html.indexOf('// ===== 概算火力モデル定数')); fullCode += '\n' + fs.readFileSync('data/weapons.js', 'utf8'); fullCode += '\n' + fs.readFileSync('data/summons.js', 'utf8'); fullCode += '\n' + fs.readFileSync('data/enemies.js', 'utf8'); fullCode += '\n' + fs.readFileSync('data/characters.js', 'utf8'); fullCode += '\n' + html.slice(html.indexOf('// ===== 概算火力モデル定数'), html.indexOf('// ===== UI HELPERS')); fullCode += '\nglobalThis.Sim=Sim;globalThis.buildFormation=buildFormation;'; (0, eval)(fullCode); globalThis.buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']); const sim = new globalThis.Sim(); let fb = 0; for (let t = 1; t <= 10; t++) { const r = sim.takeTurn(t); if (r.full) fb++; console.log('T' + t, 'FB:' + r.atk.length, 'dmg:' + Math.round(r.dmg)); } console.log('FullBurst:', fb + '/10', 'TotalDmg:', Math.round(sim.dmg));"
```

**期待値（基準・フォールバック抽象スケール）**:
- FullBurst: `10/10`
- TotalDmg: `91,723,594`

---

## 実機較正ログ（確定知見・2026-06）

測定条件は特記なき限り **T1アビ一切なし→全員フルバースト・敵単体・属性中立・ウェポン/幻獣編成不変**。
バースト表示は「core（バースト本体・1個目）＋追加ダメージ（2個目以降・キャラ固有）」。会心は**ヒット毎に独立**（◎=会心/○=非会心）。

### 確定したバースト計算式パラメータ

| 項目 | 確定値 | 根拠 |
|---|---|---|
| バースト係数 a/b（ヤマト・ヘカテー） | 5 / 2500 | スクショ |
| バースト係数 a/b（テトラ） | 5 / 2500 | スクショ |
| バースト係数 a/b（エレイン） | 5.5 / 3000 | スクショ |
| `burst_inori`（現神の祈り中の係数増分） | **+5.0**（5→10） | 実機較正＋スクショ |
| inori中のバースト上限cap2倍化 | **無し（据置）** | core_B=145万がcap100万据置と一致（cap200万なら235万で不一致） |
| 追加ダメ倍率（ヤマト/ヘカテー/テトラ HELIX前） | **3倍** | スクショ＋実機 |
| 追加ダメ倍率（テトラ HELIX後） | 6倍（減衰未検証100万） | スクショ |
| 追加ダメ倍率（エレイン） | 2倍/30万・常時1回/契晶80+で3回 | スクショ |
| 追加ダメのフレーム | **アビ枠（'abi'・slope=0.04）** | 有志確定。バースト上限UPでなくアビ上限UPが乗る |

### 較正の数学的根拠（会心・gear非依存の差分/比法）

会心は naB に一様に乗る乗算係数（100%会心=×1.5）。**同一キャラの2試行で会心状態を揃える**か、**core差分（共通項キャンセル）**を使えば、naB絶対値・gear・フラット項に依存せず係数が解ける。

- **burst_inori=5.0 の導出**（ヤマト・両試行非会心）:
  `core_B − core_A = slope_burst × K × inori` → `21万 = 0.10 × K × 5`。
  追撃_B `= K × mult = 127万`。比 `inori/mult = 210万/127万 = 1.654`、mult=3代入で `inori=4.96≈5.0`。
- **naB絶対スケール**: K（ヤマト非会心naB）≈ **42万**、naB_t（テトラ）≈ **40万**（追加ダメ非会心120万÷3）。両者一致。
- **追加ダメの減衰挙動**（テトラ4試行）: 非会心 raw=120万 は線形（cap未到達）、会心 raw≈180万 は減衰（実測150〜155万）。
  逆算で **real機のアビ追加ダメ上限 ≈ 150万**（gearのエラボレイトで base50万から引上げ）。モデルは `_decay('abi', raw, cap×(1+GEAR.abi_cap))` で対応済み。
- **mooncode会心+50%**: ヘカテー追加ダメが全試行◎（常時会心）＝ mooncode会心+50%の傍証。

### 測定済み生データ（参照用）

```
試行A (inoriなし): エジソン164◎+169◎ / ヤマト124○ / ヘカテー186◎+151◎ / テトラ184◎+120○ / エレイン138◎+104○
試行B (inoriのみ): エジソン232◎+139○ / ヤマト145○+127○ / ヘカテー210◎+169◎ / テトラ194◎+137○ / エレイン154○+121○
試行1 (inoriなし): ヘカテー194◎+156◎ / テトラ176◎+155◎
試行2 (inoriなし): ヘカテー190◎+164◎ / テトラ142○+150◎
```

### 未確定（要較正）
- エジソン英霊武器追加ダメ（2.5倍/80万・次の測定対象）
- テトラHELIX後追加ダメ（6倍/減衰未検証100万・renri30到達が条件）
