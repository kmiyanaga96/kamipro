// data/weapons.js — 手持ちウェポンマスタ（<script src="data/weapons.js"> でindex.htmlから読み込み）
// skills の box キーは GEAR_BOXES キーに対応（assault/elem/vigor/spec/dmgup/acute/crit_rate/
//   other/technica/na_dmg/abi_dmg/burst_dmg/na_cap/abi_cap/burst_cap）。
//   technica: 通常攻撃/アビには乗るがバーストからは除外される枠（実機: バースト=通常ダメ(テクニカ除く)基準）。
// defender: HP専用。ダメージGEAR計算では無視し、calcDisplayHp()で使用する。
// stinger:true → 急所固定+20%・weapon_ampは発動率(rate)にのみ適用。
// condition:{mainOf:'heroKey'} → そのキャラのメイン装備(slot0)時のみ有効。
// droidUpgrade:{mult,cap} → applyGearがDMG.droid_react_mult/capを上書き(メインエジソン限定)。
// burstHeroExtra:{mult,cap} → applyGearがDMG.edison_burst_extra_mult/capをセット(英霊バースト追加ダメ)。
// betaiaUpgrade:{mult,cap} → applyGearがDMG.betaia_mult/capを上書き(メインナポレオン限定)。
// atk/hp は最大Lv想定の最大値。育成途中の実機表示は理論値より低くなる。
const WEAPON_MASTER = {
  directorel: {
    jp: '六欲天デレクターレ', atk: 4934, hp: 302, type: '杖', elem: 'light',
    skills: [
      { box: 'burst_dmg', pct: 65 },      // エクシード性能65%
      { box: 'burst_cap', pct: 50 },      // エクシード上限50%
      { box: 'abi_dmg',   pct: 50 },      // エラボレイト性能50%
      { box: 'abi_cap',   pct: 25 },      // エラボレイト上限25%
      { box: 'technica',  pct: 22 },      // テクニカ22%（暴走枠・通常ダメUP・バースト除外）
      { box: 'na_cap',    pct: 7.5 },     // テクニカ上限UP(中)7.5%
      { box: 'crit_rate', pct: 15 },      // クリティカ15%（会心発動率）
      { box: 'defender',  pct: 26 },      // ディフェンダー26%（HP専用）
      { box: 'assault',   pct: 23 },      // アサルト23%
    ],
  },
  zodiac_cannon: {
    jp: '煌獅砲ゾディアックカノン', atk: 4496, hp: 230, type: '銃', elem: 'light',
    skills: [
      { box: 'vigor',   pct: 19.1 },      // ヴィゴラス19.1%
      { box: 'assault', pct: 20 },        // アサルト20%
      // バレッジ（三段攻撃確率）: 未実装・スキップ
    ],
  },
  sheol_blade: {
    jp: '純傲光剣シェオルブレード', atk: 4110, hp: 204, type: '剣', elem: 'light',
    skills: [
      { box: 'burst_dmg', pct: 80 },      // エクシード性能80%
      { box: 'burst_cap', pct: 40 },      // エクシード上限40%
      { box: 'assault',   pct: 20 },      // アサルト20%
    ],
  },
  corel_snipe: {
    jp: '機光銃コレールスナイプ', atk: 4641, hp: 217, type: '銃', elem: 'light',
    skills: [
      { box: 'defender', pct: 26 },       // ディフェンダー26%（HP専用）
      { box: 'technica', pct: 18 },       // テクニカ18%（通常ダメUP・バースト除外）
      { box: 'na_cap',   pct: 5 },        // テクニカ上限UP(小)5%
    ],
  },
  ishtar: {
    jp: '天意剣イシュタル', atk: 4881, hp: 230, type: '剣', elem: 'light',
    skills: [
      { box: 'defender',  pct: 23 },      // ディフェンダー23%（HP専用）
      { box: 'acute', stinger: true, rate: 40 }, // スティンガー発動率40%（+20%固定・rateにのみweapon_amp）
      { box: 'assault',   pct: 23 },      // アサルト23%
      { box: 'crit_rate', pct: 15 },      // クリティカ15%（会心発動率）
    ],
  },
  launcher_tank: {
    jp: '自走光砲ランチャータンク', atk: 4543, hp: 272, type: '銃', elem: 'light',
    skills: [
      // 発明王の覇気+: 属性攻撃UP(%未確定・TODO) + 最終ダメUP5% — メインエジソン限定
      { box: 'dmgup', pct: 5, condition: { mainOf: 'edison' } },
      // プログラムアプティマイズ+: ドロイドアナバシス(攻撃ロボ反応)の倍率3.0→3.5・減衰50万→65万へ強化。
      // メインエジソン装備時のみ。applyGearがdroidUpgradeを検出しDMG.droid_react_mult/capを上書きする。
      { droidUpgrade: { mult: 3.5, cap: 650000 }, condition: { mainOf: 'edison' } },
      // 英霊の戦記(バースト追加ダメージ): メインエジソン装備時のみ。倍率2〜2.5倍・減衰80万。
      // 倍率変動条件未確定のため現在はmax2.5を採用(TODO: 実機確認後に更新)。
      { burstHeroExtra: { mult: 2.5, cap: 800000 }, condition: { mainOf: 'edison' } },
    ],
  },
  les_bonaparte: {
    jp: '光皇刃レス・ボナパルト', atk: 4721, hp: 245, type: '剣', elem: 'light',
    skills: [
      // 革命皇の覇気: 味方全体の光属性攻撃UP(30%)
      { box: 'elem', pct: 30 },
      // 淀みなき進軍: ベタイア・コンヴェフティの倍率3.0→3.5・上限50万→80万へ強化(メインナポレオン限定)
      { betaiaUpgrade: { mult: 3.5, cap: 800000 }, condition: { mainOf: 'napoleon' } },
      // バースト発動時、自身の全アビCD-1短縮(メインナポレオン限定)
      { napoBurstCdReduce: true, condition: { mainOf: 'napoleon' } },
    ],
  },
};

export { WEAPON_MASTER };
