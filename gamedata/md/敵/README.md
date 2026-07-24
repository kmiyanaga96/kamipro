# 敵DB intake（実機詳細 → ランタイム登録）

敵の実機詳細をテキストで受け渡し・保全し、`gamedata/js/enemies.js`（シムが読むランタイム DB）へ反映するための置き場。
較正方針は [PHASE4_PLAN.md](../../../PHASE4_PLAN.md)（§7 で Phase6 敵DBの前倒し条件を規定）、確定値は [CALIBRATION_ANALYSIS.md](../../../CALIBRATION_ANALYSIS.md)。

## 役割分担（mdとjsの分離・既存の履歴管理原則と同じ）
- **`gamedata/md/敵/<key>.md`** … 実機詳細・根拠（intake／人間・エージェントが記入）。**source of record**。
- **`gamedata/js/enemies.js` の `ENEMY_REGISTRY[<key>]`** … そこから蒸留した**現在のランタイム値**（シムが読む唯一の正）。
- 値の変更履歴は git。md は根拠、js は現在値。**別途の履歴MDは作らない**（simulation/README.md「履歴管理の原則」と同様）。

## 命名規約
- **キー（`ENEMY_REGISTRY` のキー＝ファイル名 stem）**: 小文字 ASCII の snake_case スラッグ。
  例: ヴァルプルギス・ロキ → `walpurgis_loki` → `gamedata/md/敵/walpurgis_loki.md` / `ENEMY_REGISTRY.walpurgis_loki`。
- ファイル名とキーは**必ず一致**させる（相互参照のため）。

## 追加手順
1. `cp gamedata/md/敵/TEMPLATE.md gamedata/md/敵/<key>.md` で intake を作成し、実機値を記入。
2. 記入済みの値を `gamedata/js/enemies.js` の `ENEMY_REGISTRY[<key>]` へ蒸留（def / max_hp / element / affinity / 任意フィールド）。
3. 検証ワンライナー（ゴールデン 175,023,298）が**不変**であることを確認（applyEnemy 非経由のため通常不変）。
4. 必要なら UI の敵セレクタ（`enemy-select`）に出ることを確認。

## `ENEMY_REGISTRY` スキーマ（gamedata/js/enemies.js 冒頭にも記載）
| フィールド | 必須 | 意味 |
|---|---|---|
| `label` | ○ | 表示名（日本語可） |
| `def` | ○ | 敵防御値（`recalcGearK` の除数・較正対象） |
| `max_hp` | ○ | 敵最大HP（DOT・撃破ターン） |
| `element` | 任意 | 敵属性（メタ・'phantom' 等） |
| `affinity` | 任意 | 本編成(光)に対する属性相性（有利1.5/中立1.0）。指定時 `applyEnemy` が `DMG.affinity` を上書き（UIトグルより優先）。省略時はUI/既定。 |
| `limit` | 任意 | 限定行動（将来拡張用） |

## 登録済み
| key | label | 用途 | 状態 |
|---|---|---|---|
| `default` | 汎用 placeholder | 抽象スケール基準（ゴールデン） | — |
| [`walpurgis_loki`](walpurgis_loki.md) | ヴァルプルギス・ロキ | Phase4 較正ボス（T2〜C1） | **実機値待ち**（プレースホルダ登録済み） |
| [`fimbulvetr`](fimbulvetr.md) | フィンブルヴェトル | ~~sim03 較正ボス~~ **無期限延期（2026-07-14）** | trial01全滅・7T討伐は偶然→較正対象外（エントリ保持） |
| [`cath_palug`](cath_palug.md) | キャスパリーグ | **sim03 較正ボス（2026-07-14 緊急置換・第1走）** | **def/HP未確定**（闇=光有利×1.5確定・ライトレジスト=光非適用・2T討伐・placeholder登録済み） |
| [`ryomen_sukuna`](ryomen_sukuna.md) | 両面宿儺 | **sim05 較正候補ボス（本命・2026-07-22 統合／2026-07-24 登録）** | **✅ ENEMY_REGISTRY 登録済み**（CATACLYSM闇レイド・光有利クリーン・**def20/HP9.8億**・**鬼神障壁 `barrier` ＝枠別final-dmg cap 実装済み**・**アビ上限 `abilCapPerTurn:19` 実装済み**・⚠**全滅時計(鬼の魔力≥10)=生存/再現性が採用の最終ゲート**・1日1回。⚠rate/abi上限は第1走で実測） |
| [`variant_chimera_chi`](variant_chimera_chi.md) | PB06 バリアントキメラ-χ（通称 強機獣） | **sim05 較正候補ボス（フォールバック・2026-07-22 intake / 2026-07-24 統合・改称）** | intake のみ（闇=光有利クリーン・def推定10・**変身[攻撃/防御UP]はHP70%動的＝イジェクトドローン→T1窓較正**・2-3T・1日1回・枠別cap無し。max_hp未取得・ENEMY_REGISTRY 未登録） |
