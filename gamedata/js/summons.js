// gamedata/js/summons.js — 幻獣マスターDB
// スロット区分別効果（Phase6・実機仕様 2026-07-10）:
//   mainEffect … メイン枠/サポート枠でのみ発動（加護＝weapon_amp=ウェポンスキル効果量UP はメイン幻獣効果）
//   subEffect  … サブ枠でのみ発動（weapon_amp は書かない）
//   box(トップレベル) … 位置非依存（稀）／ onSummon … 召喚時効果=(B)別Phase
//   condition … 効果の発動条件（省略=無条件）。現在の対応キー: {allSubSummonsElem:'light'}
//               ＝「装備しているサブ幻獣が全て◯属性のとき」。判定は applyGear（未知キーは不成立＝安全側）。
// ⚠ box の値は**素のfraction**（ウェポンスキルと違い weapon_amp 倍率は掛からない）。例: 「光属性攻撃160%UP」→ elem:1.60。
// ⚠ 召喚攻撃（onSummon）は未実装（Phase 6）。召喚時のダメージ/バフは現状シムに乗らない＝md §2 に「未モデル化」と明記すること。
const SUMMON_REGISTRY = {
  shugo: { jp:'守護', atk:3375, hp:990, elem:'light', mainEffect:{ weapon_amp:0.40 } },
  // カタス: ★**configC（sim05 の較正編成）はメイン・サポートともにカタス**＝加護 1.0 / assault +2.00 が
  //   台帳 GEAR に畳み込み済（検算 `gamedata/md/幻獣/catas.md` §2.3）。⚠ `atk`/`hp` は placeholder（一次情報未受領）。
  catas: { jp:'カタス', atk:0, hp:0, elem:'light', mainEffect:{ weapon_amp:0.50, box:{assault:1.0} } },
  oni:   { jp:'鬼',   atk:0, hp:0, elem:'dark',  mainEffect:{ weapon_amp:0.50, box:{assault:1.0, spec:0.10} } },

  // ── configC 向け新規（2026-07-31 登録・一次情報 gamedata/md/幻獣/）──
  // ラジエル（160幻獣）: メイン=光属性攻撃160%UP（属性値枠）／サブ=サブ幻獣が全て光属性なら光属性攻撃50%UP。
  //   属性値枠は _na() で `elemBox = affinity + … + GEAR.elem` として**加算**される（affinity への上乗せ）。
  //   召喚攻撃「オムニシエントスペース」（光ダメ特大＋与ダメDOWN15%/専用・10T初回0T/2T）は未モデル化。
  rasiel: { jp:'ラジエル', atk:3852, hp:945, elem:'light',
            mainEffect:{ box:{ elem:1.60 } },
            subEffect: { box:{ elem:0.50 }, condition:{ allSubSummonsElem:'light' } } },

  // カイザーゴッドドラグーン（カイザー）: **押し順・火力に効く常時効果を持たない**。
  //   メイン=回復力UP+4（回復はシム非モデル化）／サブ=光属性キャラの防御10%UP（防御=生存側＝与ダメに無関与）。
  //   ∴ mainEffect/subEffect は意図的に空（登録は UI 選択と md 対応のため）。
  //   ⚠ 召喚攻撃「龍帝の守護光」の**光属性攻撃UP+50%・闇耐性UP+50%（2T）は火力に効くが未モデル化**（Phase 6 onSummon 待ち）
  //     ＝この幻獣を「効果なし」と誤解しないこと。
  caesar_god_dragoon: { jp:'カイザーゴッドドラグーン', atk:4000, hp:1250, elem:'light' },
};

export { SUMMON_REGISTRY };
