// data/summons.js — 幻獣マスターDB
// スロット区分別効果（Phase6・実機仕様 2026-07-10）:
//   mainEffect … メイン枠/サポート枠でのみ発動（加護＝weapon_amp=ウェポンスキル効果量UP はメイン幻獣効果）
//   subEffect  … サブ枠でのみ発動（weapon_amp は書かない）
//   box(トップレベル) … 位置非依存（稀）／ onSummon … 召喚時効果=(B)別Phase
const SUMMON_REGISTRY = {
  shugo: { jp:'守護', atk:3375, hp:990, elem:'light', mainEffect:{ weapon_amp:0.40 } },
  catas: { jp:'カタス', atk:0, hp:0, elem:'light', mainEffect:{ weapon_amp:0.50, box:{assault:1.0} } },
  oni:   { jp:'鬼',   atk:0, hp:0, elem:'dark',  mainEffect:{ weapon_amp:0.50, box:{assault:1.0, spec:0.10} } },
};

export { SUMMON_REGISTRY };
