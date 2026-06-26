// data/enemies.js — 敵DB（ランタイム ENEMY_REGISTRY）
// ※ 各エントリの「根拠・実機詳細」は enemies/<key>.md（intake）を正とし、本ファイルは
//    シムが読む現在値（distilled runtime）。新規追加の手順・命名は enemies/README.md 参照。
//
// エントリ・スキーマ:
//   label   : 表示名（日本語可）
//   def     : 敵防御値（recalcGearK の除数。実機較正対象）
//   max_hp  : 敵最大HP（DOT計算・撃破ターン用）
//   element : 敵属性（メタ情報・'phantom'/'dark'/… 任意）
//   affinity: 本編成(光)に対する属性相性（有利=1.5 / 中立=1.0）。
//             指定時のみ applyEnemy() が DMG.affinity を上書きし、UIの属性相性トグルより優先する。
//             省略時はUI/既定(DMG.affinity)に従う（= 従来挙動）。
//   limit   : 限定行動（将来拡張用・任意）
const ENEMY_REGISTRY = {
  default: {
    label:   '汎用(placeholder)',
    def:     10,          // 敵防御値(placeholder)
    max_hp:  100000000,   // 敵最大HP(placeholder)
    // affinity 省略 → UIの属性相性トグルに従う（従来どおり）
  },
  // ── Phase 4 較正ボス（PHASE4_PLAN §7 のPhase5前倒し・1体のみ）──
  // 採用理由: 有利属性で per成分の歪み無し / ムーンコードで被弾無効化しT7-8までソロ生存
  //           → turn-by-turn ホライズン全域(T2〜HELIXターン=C1)を1体でカバー。
  // ⚠ def / max_hp / affinity は実機未取得のプレースホルダ。確定値は enemies/walpurgis_loki.md を埋めてから反映。
  walpurgis_loki: {
    label:    'ヴァルプルギス・ロキ',
    def:      10,          // PLACEHOLDER・要実機（暫定=default相当。enemies/walpurgis_loki.md で確定）
    max_hp:   100000000,   // PLACEHOLDER・要実機
    element:  'phantom',   // 幻属性（レイドボス）
    affinity: 1.5,         // 光→幻=有利（暫定×1.5・要実機確認。倍率自体も較正対象になりうる）
  },
};
