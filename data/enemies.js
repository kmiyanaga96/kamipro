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
  // 採用理由: 幻属性=相互有利(全属性が幻に有利・幻も全属性に有利)→与ダメは有利×1.5 / ムーンコードで
  //           被弾無効化しソロ生存 → turn-by-turn ホライズン全域(T2〜HELIXターン=C1)を1体でカバー。根拠は enemies/walpurgis_loki.md。
  // ⚠ 較正メモ(エンジン未消費・絶対逆算時に手で補正): HP依存の2フェーズ被ダメ倍率を持つ。
  //    フェーズ1(HP>50%)=常時30%カット→与ダメ×0.7 / HP50%「ファントムリリース」後=カット解除+被ダメ+20%→×1.2。
  //    序数/成分比は同一フェーズで相殺。C1絶対逆算はフェーズ倍率を除算し、測定ターンのボスHP%を要記録。
  walpurgis_loki: {
    label:    'ヴァルプルギス・ロキ',  // Lv160 ANONYMOUS
    def:      10,          // 敵防御値 [暫定=10と目される・実機データ複数回で確定予定]
    max_hp:   980000000,   // 敵最大HP 9.8億 [実機検証]
    element:  'phantom',   // 幻属性（レイドボス）
    affinity: 1.5,         // 光→幻=有利×1.5 [実機]（幻は相互有利: 全属性⇄幻が互いに有利。等倍ではない）
  },
  // ── 旧sim03較正ボス（2026-07-14 無期限延期。根拠 enemies/fimbulvetr.md 冒頭注記）──
  // trial01でパーティ全滅（7T討伐は偶然と判明）→較正対象から除外・cath_palug へ緊急置換。エントリは将来の再挑戦用に保持。
  fimbulvetr: {
    label:    'フィンブルヴェトル',
    def:      10,          // 敵防御値 [不明→暫定10]
    max_hp:   1000000000,  // 敵最大HP [不明→placeholder 10億]
    element:  'phantom',   // 幻属性
    affinity: 1.5,         // 光→幻=有利×1.5（幻は相互有利）
  },
  // ── sim03 較正ボス（2026-07-14 緊急置換・第1走。根拠 enemies/cath_palug.md）──
  // 闇属性=光→闇 有利×1.5＝光有利アンカーの本命。「ライトレジスト」=光以外への耐性UP→光編成には
  // 隠れ耐性スカラ非適用が敵特性記述で保証=絶対レベル較正に理想。敵防御UP・味方ゲージDOWNなし=交絡少。
  // 実機2T討伐=確実に倒せる反復ボス（統計的較正のN確保が安い）。⚠ def/max_hp は placeholder（sim03で推定）。
  cath_palug: {
    label:    'キャスパリーグ',
    def:      10,          // 敵防御値 [不明→暫定10・実機データで確定予定]
    max_hp:   100000000,   // 敵最大HP [不明→placeholder 1億・2T討伐実績・撃破累計+T1終了HP%で推定予定]
    element:  'dark',      // 闇属性
    affinity: 1.5,         // 光→闇=有利×1.5（光⇔闇相互有利）
  },
};

export { ENEMY_REGISTRY };
