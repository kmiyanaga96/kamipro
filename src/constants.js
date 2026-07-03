// Phase5 S5: ゲーム定数 ＋ 概算火力モデル定数 DMG。葉モジュール（import 無し）。
// ⚠ DMG/GEAR 等のオブジェクトは実行時に applyGear/applyEnemy が「プロパティ変更」する（再代入はしない）。

// ===== ゲーム定数 =====
const RENRI_CAP = 5;   // コヴァレント: procの同ターン発動上限
const RENRI_MAX = 30;  // 連理魔力の総上限
const JUDG_REACT = RENRI_CAP; // ジャッジ再発動上限
const TENYA_FROM = 2;   // 天矢乱舞: 使用可能開始ターン
const FB_THR = 100; // フルバースト閾値（カスケードあり）
const MACH_BG = 5;   // マシーンタクトゥ: ロボ作動1回あたりBG増加
const KEIGYO_MAX = 15;  // 契晶最大値
const BEAM_W = 64; // ビームサーチ幅（C16: 128→64。較正rollout改善後は幅が品質を買わず逆効果=非単調の崖。他ギア退行なし・両phase約1.4倍高速。BW64では較正が新winner{judg:122,effond:93}を再fit=production出荷値206,846,142）
const PREFIX_TOPK = 10;  // 2段ルート選抜: 静的proxyで全prefixを採点し本選へ回す数
const BEAM_DIVERSITY_K = 24; // ビーム多様性枠: 定石性(T.orthodoxy)上位の追加保護数
const IFISHANT_MIN_CD = 3; // イフィシャント使用可の最小CD中アビ数
const BG = {
  inori: 100, funki: 10, absolute: 20, sleur: 15, legend: 10,
  pactcore: 100, cascade: 10, yamato_max: 200, other_max: 100
};

// ===== 概算火力モデル定数 =====
const DMG = {
  base_atk: 1500,            // 表示攻撃力（UIから上書き可）
  enemy_def: 10,             // 敵防御
  affinity: 1.0,             // 属性相性: 有利=1.5 / 中立=1.0（UIから上書き可）
  misc: 1.0,                 // 特殊攻撃/各種ダメージ上限等の押し順非依存枠の一括概算

  // ─── アサルト枠(1スタックあたり) ───
  assault_banoshik: 0.10,    // バノーシク: 補助ロボ作動中のアサルト+10%
  assault_absolute: 0.30,    // アブソ: アサルト+30%

  // ─── 攻撃ロボ(ドロイドアナバシス・赤アビ反応)枠 ───
  droid_react_mult: 3.0,     // 攻撃ロボ反応ダメージ: 通常攻撃比3倍(ランチャータンク装備時3.5倍)
  droid_react_cap: 500000,  // 反応ダメージ減衰上限(50万・ランチャータンク装備時65万)
  abi_dmg_droid: 0.03,    // 攻撃ロボ反応毎: 味方全体アビダメ+3%(累積可)
  abi_cap_droid: 0.02,    // 攻撃ロボ反応毎: 味方全体アビダメ上限+2%(累積可)

  // ─── 属性値枠(1スタックあたり) ───
  elem_puvoir: 0.15,    // プヴワール: 光属性攻撃+15%

  // ─── バーストダメージUP枠(1スタックあたり) ───
  burst_dmg_absolute: 0.30,  // アブソ: バーストダメージ+30%

  // ─── 旺盛 ───
  vigor_absolute: 0.30,      // アブソ: 旺盛 基礎値36 → ×1.3
  vigor_legend: 0.3552,    // レジェンド(契晶70+): 旺盛 基礎値42 → ×1.3552

  // ─── 会心 ───
  crit_mult: 0.5,   // 会心倍率1.5倍 → +0.5
  crit_rate_arrive: 0.20,  // ARRIVE(エレイン3アシ): 会心発動率+20%(永続)
  crit_rate_absolute: 0.25,  // アブソ(テトラ2): 会心発動率+25%
  crit_rate_pike: 1.00,  // パイク(ナポ2・バフ15+): 確実会心=発動率100%

  // ─── 急所枠(1スタックあたりの期待寄与 = 発動率×(倍率-1)) ───
  acute_puvoir: 0.010,     // ヘカテー1: 発動率10% × (1.10-1)
  acute_absolute: 0.090,     // テトラ2(アブソ): 急所攻撃確率+30% × (倍率1.30-1)
  acute_legend: 0.005,     // エレイン2: 発動率10% × (1.05-1)

  // ─── レジェンドアシスト閾値バフ ───
  assault_legend: 0.20,      // 契晶10+: アサルト+20%
  spec_legend: 0.20,      // 契晶80+: 特殊攻撃+20%

  // ─── テトラ1アシ(ゴッド・オムニポンテス) ───
  spec_omni: 0.30,      // 特殊攻撃+30%
  dur_omni: 1,         // 効果ターン(実機確定1T)

  // ─── 旺壮ライズ(ウェポンスキル・最大HP参照で特殊攻撃力UP) ───
  rise_per_slv: 0.0017,      // SLvあたり効果量最大値
  rise_hp_div: 1000000,     // 戦闘中効果量の最大HP除数
  rise_floor: 0.01,        // 最大HP非依存の下限

  // ─── バフ効果ターン ───
  dur_absolute: 2,           // アブソ効果ターン
  dur_puvoir: 6,           // プヴワール効果ターン
  dur_banoshik: 5,           // バノーシク効果ターン
  dur_droid_buf: 5,          // 攻撃ロボ効果ターン
  dur_legend: 3,           // レジェンド効果ターン

  // ─── バーストダメージ式 ───
  streak_count: { 2: 0.30, 3: 0.35, 4: 0.41, 5: 0.50 }, // 参加人数→人数補正
  streak_dmgup: 1.0,        // ダメージUP効果量

  // ─── ヤマトタケル ───
  burst_inori: 5.0,          // 現神の祈り中ヤマトバースト係数増分
  burst_funki: 0.15,         // 大和の奮起: バーストダメージ+15%/stack
  burst_cap_funki: 0.10,     // 大和の奮起: バースト上限+10%/stack
  dur_inori_burst: 3,        // 現神の祈りバースト性能UP効果ターン
  dur_funki_burst: 3,        // 大和の奮起バースト性能UP効果ターン
  elem_yamato: 0.05,        // ヤマトバースト: 味方全体の光属性攻撃+5%/stack
  dur_yamato_elem: 3,        // ヤマトバースト光属性攻撃UP効果ターン
  bplus_yamato: 100000,      // 1アシ: ヤマト自バーストダメージプラス+10万/stack
  dur_bplus_yamato: 3,       // 1アシバーストダメージプラス効果ターン

  // ─── ヘカテー ───
  effond_mult: 3,           // エフォンド倍率(通常比3倍・アビ枠)
  effond_cap: 350000,      // エフォンド減衰上限
  defdown_effond: 0.10,      // エフォンド防御DOWN
  defdown_effond_max: 0.40,  // エフォンド防御DOWN上限
  dur_effond_def: 6,         // エフォンド防御DOWN効果ターン
  hecate_extra_mult: 3,      // ヘカテーバースト追加ダメージ倍率
  hecate_extra_cap: 1000000,  // ヘカテーバースト追加ダメージ減衰上限

  // ─── メイビームーンズ(ヘカテー2アシ) ───
  vigor_mooncode: 0.3552,  // ムーンコード: 旺盛
  crit_rate_mooncode: 0.50,   // ムーンコード: 会心発動率+50%

  // ─── モビウスムーンズ(ヘカテー1アシ) ───
  spec_mobius: 0.05,        // 特殊攻撃+5%/stack
  dur_mobius: 4,           // モビウス特殊攻撃UP効果ターン
  mobius_burst_cycle: 4,      // ヘカテー自バースト回数サイクル
  tetra_burst_mult: 3,       // テトラバースト追加ダメージ倍率
  tetra_burst_cap: 1000000,   // テトラバースト追加ダメージ減衰上限
  tetra_burst_mult2: 6,      // テトラバーストHELIX後の追加ダメージ倍率
  tetra_burst_cap2: 1000000, // テトラバーストHELIX後の追加ダメージ減衰上限
  burst_followup_mult: 3,     // 追撃倍率
  burst_followup_cap: 1000000, // 追撃減衰上限

  // ─── エレイン ───
  elaine_burst_extra_mult: 2,    // バースト追加ダメージ倍率
  elaine_burst_extra_cap: 800000, // 追加ダメージ減衰上限
  dur_sleur_def: 3,          // スリール防壁効果ターン

  // ─── 英霊武器専用強化 ───
  edison_burst_extra_mult: 0,      // OFF(0)=英霊武器なし。applyGear()でセット。
  edison_burst_extra_cap: 800000,  // 減衰上限80万(武器固定)
  judg_mult: 3,             // ジャッジメント: 通常比3倍
  judg_cap: 350000,        // ジャッジ1ヒット減衰上限
  amplifa_flat: 100000,      // アンプリファ: ロボ反応ダメ+10万
  dur_amplifa: 3,            // アンプリファ効果ターン

  // ─── 減衰(上限)モデル ───
  decay_na: { cap1: 350000 }, // na第1上限35万(×cap_up)
  decay_burst: { cap1: 1000000, slope: 0.10 },  // 100万・寄与率 1/10
  decay_abi_slope: 0.04,                       // アビ超過寄与率1/25
  decay_streak: {
    slope1: 0.25, slope2: 0.40,
    caps: { 2: [2100000, 2800000], 3: [3300000, 4400000], 4: [5100000, 6800000], 5: [7500000, 10000000] }
  },

  // ─── ナポレオン ───
  dur_roy: 2,                // ロワ・クモンド効果ターン
  roy_na_frac: [0.06, 0.07, 0.10, 0.20],  // 通常攻撃プラス
  roy_abi_frac: [0.05, 0.06, 0.08, 0.10],  // アビダメプラス
  roy_burst_frac: [0.10, 0.30, 0.50, 1.00],  // バーストプラス
  dur_pike: 2,               // オーンフォッセモ・パイク効果ターン
  dur_consort_def: 6,        // コンソート効果ターン
  consort_cap: 2500000,      // コンソート減衰上限
  betaia_mult: 3.0,          // ベタイア倍率3倍
  betaia_cap: 500000,        // ベタイア減衰上限
  betaia_bg_per_aura: 3,     // ベタイア闘気1個あたりBG
  factor_bg: 30,             // ファクター全体BG
  dur_factor: 2,             // ファクター効果ターン

  // ─── 効果量確定値 ───
  vigor_pike: 0.3552,  // パイク旺盛
  acute_pike_crit: 0.30,    // パイク急所期待値
  defdown_consort: 0.10,    // コンソート防御DOWN

  // ─── 青アビ実効果 ───
  burst_dmg_nights: 0.20,    // ナイツサプレス効果
  burst_dmg_arrive: 0.20,    // ARRIVEバーストダメージUP
  bplus_arrive: 343000,  // ARRIVEバーストダメージプラス
  dur_nights: 2,       // ナイツサプレス効果ターン
  defdown_divinus: 0.30,    // ディウィヌス防御DOWN
  dur_divinus_def: 2,       // ディウィヌス防御DOWN効果ターン
  divinus_dot_cap: 100000,  // DOT上限
  divinus_dot_types: 4,      // DOT種類数
  dur_divinus_dot: 2,       // DOT持続

  // ─── アシスト由来グローバル枠 ───
  sub_burst_dmg: 0,           // サブバーストダメージUP
  sub_burst_cap: 0,           // サブバースト上限UP
  final_dmg: 1.0,         // 最終倍率

  // ─── アルテミス ───
  arrow_mult1: 3, arrow_cap1: 300000,
  arrow_mult2: 5, arrow_cap2: 500000,
  arrow_mult3: 7, arrow_cap3: 700000,
  arrow_mult4: 10, arrow_cap4: 1000000,
  arrow_mult5: 12, arrow_cap5: 1500000,
  kyosho_per_ailment: 0.02,
  kyosho_cap: 0.30,
  dur_kyosho: 3,
  acute_refine: 0.09,
  refine_followup_mult: 3,
  refine_followup_cap: 300000,
  dur_refine: 3,
  bg_manapolite: 10,
  streak_manapolite: 0.02,
  dur_manapolite: 10,
  spec_artemis: 0.30,
  dur_artemis_spec: 1,
  bplus_artemis: 150000,
  dur_artemis_bplus: 3,

  // 敵パラメータ
  enemy_def: 10,
  enemy_max_hp: 100000000,
};

export {
  RENRI_CAP, RENRI_MAX, JUDG_REACT, TENYA_FROM, FB_THR, MACH_BG, KEIGYO_MAX,
  BEAM_W, PREFIX_TOPK, BEAM_DIVERSITY_K, IFISHANT_MIN_CD, BG, DMG
};
