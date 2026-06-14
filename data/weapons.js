// data/weapons.js — 手持ちウェポンマスタ（<script src="data/weapons.js"> でindex.htmlから読み込み）
// skills の box キーは GEAR_BOXES キーに対応（assault/elem/vigor/spec/dmgup/acute/crit_rate/
//   other/na_dmg/abi_dmg/burst_dmg/na_cap/abi_cap/burst_cap）。
// defender: HP専用。ダメージGEAR計算では無視し、calcDisplayHp()で使用する。
// stinger:true → 急所固定+20%・weapon_ampは発動率(rate)にのみ適用。
// condition:{mainOf:'heroKey'} → そのキャラのメイン装備(slot0)時のみ有効。
// atk/hp は最大Lv想定の最大値。育成途中の実機表示は理論値より低くなる。
const WEAPON_MASTER = {
  directorel: {
    jp: '六欲天デレクターレ', atk: 4934, hp: 302, type: '杖', elem: 'light',
    skills: [
      { box: 'burst_dmg', pct: 65 },      // エクシード性能65%
      { box: 'burst_cap', pct: 50 },      // エクシード上限50%
      { box: 'abi_dmg',   pct: 50 },      // エラボレイト性能50%
      { box: 'abi_cap',   pct: 25 },      // エラボレイト上限25%
      { box: 'other',     pct: 22 },      // テクニカ22%（暴走枠・通常ダメUP）
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
      { box: 'other',    pct: 18 },       // テクニカ18%（通常ダメUP）
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
    jp: '自走ランチャータンク', atk: 4543, hp: 272, type: '銃', elem: 'light',
    skills: [
      // 発明王の覇気+: 属性攻撃UP(%未確定・TODO) + 最終ダメUP5% — メインエジソン限定
      { box: 'dmgup', pct: 5, condition: { mainOf: 'edison' } },
      // プログラムアプティマイズ+: ドロイドアナパシス上限UP — 未実装
    ],
  },
};
