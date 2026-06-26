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
  // 採用理由: 幻属性=全属性等倍(歪み無し) / ムーンコードで被弾無効化しT7-8までソロ生存
  //           → turn-by-turn ホライズン全域(T2〜HELIXターン=C1)を1体でカバー。根拠は enemies/walpurgis_loki.md。
  // ⚠ 較正メモ(エンジン未消費・絶対逆算時に手で補正): HP依存の2フェーズ被ダメ倍率を持つ。
  //    フェーズ1(HP>50%)=常時30%カット→与ダメ×0.7 / HP50%「ファントムリリース」後=カット解除+被ダメ+20%→×1.2。
  //    序数/成分比は同一フェーズで相殺。C1絶対逆算はフェーズ倍率を除算し、測定ターンのボスHP%を要記録。
  walpurgis_loki: {
    label:    'ヴァルプルギス・ロキ',  // Lv160 ANONYMOUS
    def:      25,          // 敵防御値 [有志・未確証/公式wiki表は空欄] 要再確認
    max_hp:   250000000,   // 敵最大HP 2.5億 [有志・未確証] 要再確認
    element:  'phantom',   // 幻属性（レイドボス）[web]
    affinity: 1.0,         // 光→幻=等倍 [web]（幻は全属性等倍・光に不利なし）。当初想定1.5は誤り
  },
};
