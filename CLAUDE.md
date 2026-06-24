# 神姫PROJECT R — バーストトラッカー 開発ガイド

## 概要
`index.html`（UI・ロジック）と `data/` 配下の外部DBファイル群（武器・幻獣・敵・キャラ）で構成される、バースト編成シミュレーター＆最適押し順トラッカー。外部ビルド不要で、直接ブラウザで動作。

## ドキュメント体系（Antigravityエージェントとの共有用）
- **CLAUDE.md**（本書）: 生きた開発ガイド。コード地図・開発ルール・確定仕様・検証方法・実機較正ステータス。**現状の一次情報**。
- **CALIBRATION_ANALYSIS.md**: 実機較正の確定値＆**根拠アーカイブ**（なぜその値・枠か）。較正・英霊武器は実装済み。
- **PHASE2_PLAN.md**: Phase 2（汎用化）完了。残るは**未実装の将来設計＝動的コンテキスト指向優先度**。
- **PHASE3_PLAN.md**: Phase 3 高速化。**実測でホットパス（`_candidates`）最適化を主軸に補正済み**。clone除去/Flat State/VMは棚上げ理由付きでアーカイブ。
- **ROADMAP.md**: 長期ビジョン（敵行動・味方生存シミュレーション）＋新キャラ導入ワークフロー構想。
- 参照データ（非計画書）: `damageCalculator.txt`（計算式）/ `database.txt`（マスター・実機スナップショット）/ `tools/*.js`（較正スクリプト）。

## ファイル構成 & コード地図 (index.html: 2153行)
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
| 710–1170 | `class Sim` エンジン（tick, burst, use, _na, beam 等。Phase2でprocR削除・キャラ反応はDB側フックへ移管） |
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
- **毎ターン自動デクリメントする残ターン系state**（ロボ残T・ムーンコード等）は `tickStates: ['key', ...]` を宣言（`buildFormation`が`TICK_STATES`へ集約し`tick()`が汎用処理）。
- **キャラ固有の反応・マイルストーン処理は汎用フックに記述**（エンジンに分岐を足さない）: `def.onAbility(sim,name,color,T)`=全アビ使用反応（ロボ反応・連理魔力・闘気等） / `def.onPartyBurst(sim,owner,T,atk)`=全バースト反応（モビウス・連理魔力burst側） / `def.onBurst(sim,atk,owner)`=自バースト / `def.turnEnd(sim,T)`=ターン終了（タイマー進行等）。フックは`CHARS`順で全キャラ走査され、不在編成では未宣言として自然スキップ。

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

## 実機較正ステータス（詳細は CALIBRATION_ANALYSIS.md 参照）
- **確定パラメータ**:
  - バースト係数: ヤマト/ヘカテー/テトラ = 5.0/2500, エレイン = 5.5/3000
  - `burst_inori`: +5.0 (現神の祈り中上限cap2倍化は無し)
  - 追加ダメージ倍率: ヤマト/ヘカテー/テトラ(HELIX前) = 3倍/50万, テトラ(HELIX後) = 6倍/100万(推定), エレイン = 2倍/30万
  - 追加ダメージフレーム: **アビ枠 (`'abi'` / 減衰率 0.04)**
  - エレインバースト追加: 常時1回、契晶80以上で3回発動
  - エジソン英霊武器追加ダメ: 2.5倍/80万 (アビ枠・onBurst実装済み)
- **保留 (placeholder・エンジン改善フェーズで再検証)**:
  - テトラHELIX後追加ダメの減衰上限 (推定100万)。テトラ4アビはT6〜T7まで連理魔力を毎ターン蓄積しないと発動条件を満たせず、他アビ効果を除いた純粋なダメージ量の単独検証が困難。実機との火力不整合が顕在化した際に併せて確認する。
