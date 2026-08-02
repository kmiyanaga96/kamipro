// ==========================================================================
// Phase5 S5 (A案): ESM エントリ。旧 index.html の inline <script id="engine-code">
// (ゲーム定数〜INIT) を丸ごと移設したもの。data と相互 import（循環）になるが、
// data 側の外部参照は全て関数本体＝遅延評価で TDZ に当たらない（ロード順不変条件）。
// ⚠ 詳細・保守方針は VITE_MIGRATION.md を一次情報とすること。
// ==========================================================================
import { WEAPON_MASTER } from '../gamedata/js/weapons.js';
import { SUMMON_REGISTRY } from '../gamedata/js/summons.js';
import { ENEMY_REGISTRY } from '../gamedata/js/enemies.js';
import { CHAR_REGISTRY } from '../gamedata/js/characters.js';

import { RENRI_CAP, RENRI_MAX, JUDG_REACT, TENYA_FROM, FB_THR, MACH_BG, KEIGYO_MAX, BEAM_W, PREFIX_TOPK, BEAM_DIVERSITY_K, IFISHANT_MIN_CD, LS_MAX_EVALS, BG, DMG, DMG_DEFAULTS } from './constants.js';
import { Sim, cmpVec, enumerateRootPrefixes, _runRootPlan, _runRouteLS, _runBaselinePlan, _staticPrefixDmg, _selectRootPrefixes, _replayResult, _localSearchRoute, _LSReplay, _refineRoute } from './sim.js';


let CURRENT_ENEMY_KEY = 'default';

function applyEnemy(key){
  const e = ENEMY_REGISTRY[key] ?? ENEMY_REGISTRY['default'];
  CURRENT_ENEMY_KEY = key;
  DMG.enemy_def    = e.def;
  DMG.enemy_max_hp = e.max_hp;
  // 敵側 final-dmg 枠別cap(鬼神障壁・sim05前タスク①)＋アビ回数上限(鬼神一擲回避・②)。
  // 未指定の敵は null にリセット(enemy切替で前ボスの特性が残らないよう常時代入)。null=従来挙動=golden不変。
  DMG.enemy_barrier  = e.barrier         ?? null;
  DMG.enemy_abil_cap = e.abilCapPerTurn  ?? null;
  // 敵DB指定の属性相性(本編成=光に対する有利1.5/中立1.0)があれば上書き(UIトグルより優先)。
  // 省略時は DMG.affinity を据え置き(UI/既定に従う=従来挙動)。
  if(e.affinity != null) DMG.affinity = e.affinity;
}

// ===== 装備設定(幻獣・ウェポン) =====
// 押し順非依存の常時ボックス補正。幻獣2枠(プリセット・重複可)とウェポンスキル合計を集約し、
// 各ボックスへの加算値(fraction)として _na() が参照する。シミュ開始時にUIから applyGear() で設定。
// 全0なら倍率1.0でベースライン不変。ウェポンは % 入力 → ×(1+Σweapon_amp) → fraction で格納。
const GEAR_BOXES = [
  ['assault',  'アサルト'],      // (1+アサルト...) 枠: キャラUP幻獣・アサルトスキル
  ['elem',     '属性値'],        // 属性値枠: 属性値UP幻獣・属性スキル
  ['vigor',    '旺盛'],          // 旺盛枠(+100%上限はpush分と合算): 旺盛UP幻獣・ヴィゴラス
  ['spec',     '特殊攻撃'],      // 特殊攻撃枠: 特殊攻撃UP幻獣・特殊スキル
  ['dmgup',    '与ダメージ'],    // 与ダメージUP枠(白虎等)
  ['acute',    '急所'],          // 急所枠: 急所スキル(期待寄与を直接入力)
  ['crit_rate','会心発動率'],    // 会心発動率枠(min1.0でクランプ)
  ['other',    'その他バフ補正'],// その他バフ補正枠(全フレーム共通・与ダメ以外の常時乗算補正)
  // ─── フレーム別ダメージUP枠(該当フレームのみ加算・_na()のbaseには含めない) ───
  // テクニカ(通常攻撃ダメUP)はエラボレイト/エクシードと同じウェポンスキル枠。
  // ダメUP%→na_dmg / 上限UP%→na_cap に入力。GEAR_Kには含まない(アビ/バーストに誤適用しない)。
  ['na_dmg',   '通常攻撃ダメUP'], // 通常攻撃のみ: judge ph2(通常)に ×(1+na_dmg)。テクニカのダメUPはここへ
  ['abi_dmg',  'アビダメUP'],     // アビダメのみ: judge ph0/コンソートに ×(1+abi_dmg)
  ['burst_dmg','バーストダメUP'], // バーストのみ: burst()係数に加算(a+...+burst_dmg)
  // ─── 上限UP枠(基盤のみ・基準上限×(1+上限UP)) ───
  ['na_cap',   '通常ダメ上限UP'], // 基準上限 DMG.decay_na.cap1 を ×(1+na_cap)
  ['abi_cap',  'アビダメ上限UP'], // 基準上限 judg_cap/consort_cap を ×(1+abi_cap)
  ['burst_cap','バーストダメ上限UP'], // 基準上限 DMG.decay_burst.cap1 を ×(1+burst_cap)
];
const GEAR = Object.fromEntries(GEAR_BOXES.map(([k])=>[k,0]));

// ウェポンスキル入力欄の【表示順のみ】を実機装備パネルの並びへ寄せる（UX・2026-07-14）。
// ⚠ GEAR オブジェクトのキー順（=GEAR_BOXES 順）は _configSig の JSON.stringify(GEAR) に効くため**変更しない**
//    （格納済みキャッシュ/結果署名を保つ）。ここは描画順の分離＝計算/署名/ゴールデンに一切影響しない純UI。
// 実機パネル並び: 攻撃UP(assault)→旺盛(vigor)→通常dmg/上限(na)→アビdmg/上限(abi)→バーストdmg/上限(burst)→会心/急所。
// パネル非掲載の枠(属性値/特殊攻撃/与ダメージ/その他)は末尾へ（多くの編成で0・使用頻度低）。
const GEAR_DISPLAY_ORDER = [
  'assault', 'vigor',
  'na_dmg', 'na_cap', 'abi_dmg', 'abi_cap', 'burst_dmg', 'burst_cap',
  'crit_rate', 'acute',
  'elem', 'spec', 'dmgup', 'other',
];
// 表示順に並べた [key, 日本語ラベル] の配列（描画専用）。GEAR_BOXES を正とし、漏れ/重複があれば末尾に補完して安全側に倒す。
const GEAR_BOXES_DISPLAY = (()=>{
  const label = Object.fromEntries(GEAR_BOXES);
  const ordered = GEAR_DISPLAY_ORDER.filter(k=>k in label).map(k=>[k, label[k]]);
  for(const [k,jp] of GEAR_BOXES) if(!GEAR_DISPLAY_ORDER.includes(k)) ordered.push([k,jp]); // 未掲載キーの取りこぼし防止
  return ordered;
})();

// 幻獣スロット構成（実機・Phase6 2026-07-10）: メイン1 + サブ5 + サポート1 = 計7枠（重複可）。
// メイン/サポートは mainEffect（加護 weapon_amp 含む）、サブは subEffect のみ発動（weapon_amp 禁止）。
const SUMMON_LAYOUT = [
  { role:'main',    label:'メイン',   n:1 },
  { role:'sub',     label:'サブ',     n:5 },
  { role:'support', label:'サポート', n:1 },
];
// 展開した区分配列 ['main','sub','sub','sub','sub','sub','support']（index=summon-i の枠区分）
const SUMMON_ROLES = SUMMON_LAYOUT.flatMap(g=>Array(g.n).fill(g.role));
const SUMMON_SLOTS = SUMMON_ROLES.length; // = 7

// _na() ホットパス用: 押し順非依存の固定係数を事前畳み込み(GEAR変更時に再計算)
let GEAR_K = 0;
let GEAR_K_C = {};      // per-character GEAR_K: {charKey: 表示攻撃力ベースのスケール係数}
let DISPLAY_ATK_C = {}; // per-character 表示攻撃力(UI表示用)
let DISPLAY_HP_C = {};  // per-character 表示HP(UI表示用)

// SSRレベル上限解放の累積ステータス増加量(攻撃力増加列・型非依存／公式有志検証データ)。
// 解放前(Lv80)=増分なし。神姫のbaseAtk/baseHpはLv80基準値とし、解放分をここで上乗せする。
const SSR_LV_RELEASE = {
  80: { atk: 0,    hp: 0   },
  85: { atk: 1950, hp: 375 },
  90: { atk: 3900, hp: 750 },
  // ⚠ Lv95(2026-07 上限解放アップデート)の増分は未取得。満凸推定(calcDisplayAtk)フォールバックを
  //    Lv95キャラに使う場合は公式/有志の増分値を追記すること。現編成は DISPLAY_ATK_OVERRIDE(実機値)が優先のため非ブロッカー。
};

// 実機表示ATKの直接指定(0-fudge較正)。Lv上限解放/+99/育成途中/placeholderを全て内包した
// ゲーム画面の確定表示値をキャラ毎に上書きする。指定があれば calcDisplayAtk(満凸推定) より優先する。
// decompose(満凸WEAPON_MASTER + 得意補正 + SSR_LV_RELEASE)は target build 用途として温存し、
// ここは現状の実機合わせ。{} なら従来どおり全キャラ calcDisplayAtk へフォールバック(現状維持)。
// ⚠ **per-formation 構造（2026-07-27・sim05 §5 実装上の注意）**: 共有キャラ(hecate/tetra/elaine)の実機表示ATKは
//    編成ごとに異なる（装備強化の進行で configB≠configC）。単一グローバルmapでは両編成を同時に持てず、
//    一方を入れると他方の回帰(golden)が壊れる。∴ **英霊キー(=LEADER)を編成IDとしたネスト構造**にし、
//    applyGear が現編成のmapだけを引く。編成が未登録なら {} ＝全キャラ満凸推定へフォールバック（従来挙動）。
const DISPLAY_ATK_OVERRIDE_BY_FORMATION = {
  // configB（sim04 較正編成・エジソン基軸）＝**回帰基準として凍結**。触ると sim04 の較正前提が動く。
  // 2026-07-16 sim04開始ゲート: 装備強化後(configB)の実機値(旧2026-07-15 Lv95時点: 93489/73346/70664/78824/79696)。
  // ⚠ configB(simulation/sim04/data/config.json)の同梱dispAtkは旧値のままexportされた(UI更新前)＝
  //    そのキャッシュの探索ルートは旧ATKスケール計算。M走(押し順自由)には非影響・
  //    序数diffの較正前基準順はheadless再探索で取り直す(sim04/README §2 注記)。
  edison:   { edison: 96756, yamato: 75898, hecate: 73727, tetra: 81887, elaine: 82248 },
  // configC（sim05 移行編成・ナポレオン基軸）＝**proper configC**・ユーザー実機表示値 2026-07-31 受領（0-fudge）。
  // 旧暫定値(2026-07-27): 102288/75558/83718/77297/85054。全キャラで上振れ＝装備強化の進行。
  // 共有キャラ(hecate/tetra/elaine)が configB より高いのは**編成差ではなく時点差**。
  // Lv: hecate=80 / tetra=95 / arianrhod=80 / elaine=95（override 優先のため lvCap 推定は非経路）。
  napoleon: { napoleon: 107861, hecate: 78269, tetra: 86429, arianrhod: 81631, elaine: 88380 },
};
// 現編成(英霊キー)の実機表示ATK override を引く。未登録編成は {}＝満凸推定へフォールバック。
function displayAtkOverrideFor(heroKey){ return DISPLAY_ATK_OVERRIDE_BY_FORMATION[heroKey] || {}; }

// ゲーム画面の確定表示HPをキャラ毎に上書きする(ATK overrideと完全対称・0-fudge)。
// 将来「旺壮」(最大HPを参照して特殊攻撃力UPを付与する仕様)を実装する際、その最大HP基準値となる土台。
// (※「旺盛/ヴィゴラス」は現在HP参照の別スキルで、シムは最大HP前提に簡略化し vigor 枠で実装済み)
// +99/育成途中/placeholder武器/Lv上限解放を全て内包した実測値で calcDisplayHp(満凸推定) を上書きする。
// 空 {} なら従来どおり全キャラ calcDisplayHp へフォールバック(現状維持・挙動不変)。
// ATK override と完全対称の per-formation 構造（同一編成ID・同一出典）。
const DISPLAY_HP_OVERRIDE_BY_FORMATION = {
  // configB（sim04 較正編成）＝凍結。2026-07-16 装備強化後の実機値(旧: 9689/7628/8332/8332/8345)。
  edison:   { edison: 12252, yamato: 9668, hecate: 10495, tetra: 10870, elaine: 11513 },
  // configC（sim05 移行編成）＝**proper configC**・ユーザー実機表示値 2026-07-31 受領（0-fudge）。
  // 旧暫定値(2026-07-27): 12677/10714/11089/10119/11807。
  napoleon: { napoleon: 13545, hecate: 11300, tetra: 11675, arianrhod: 10840, elaine: 12456 },
};
function displayHpOverrideFor(heroKey){ return DISPLAY_HP_OVERRIDE_BY_FORMATION[heroKey] || {}; }

// 表示攻撃力算出: 武器ATK×得意補正 + 幻獣ATK合計 + キャラ基本ATK(神姫) or 英霊基本値
// slots: 長さ10の武器キー配列(slot0=メイン, 1-9=サブ。空文字=未装備)
// summonAtkTotal: 編成画面のメイン+サブ幻獣ATK合計(表示寄与分・手動入力)
// heroRank: ランク値（マスターボーナスは対象英霊をシミュ対象外としたため非適用）
// 神姫/英霊で武器・幻獣は共通だが、得意補正は各キャラのfavWeaponで個別に効く。
function calcDisplayAtk(charKey, slots, summonAtkTotal, heroRank){
  const def = CHAR_REGISTRY[charKey];
  if(!def || typeof WEAPON_MASTER==='undefined') return 0;
  const fav = def.favWeapon||[];
  let weaponAtk=0;
  for(let i=0;i<slots.length;i++){
    const w=WEAPON_MASTER[slots[i]]; if(!w) continue;
    weaponAtk += Math.floor(w.atk*(fav.includes(w.type)?1.2:1.0));
  }
  if(def.type==='hero'){
    const r=heroRank, lvUp=def.lvUpAtk||0;
    const rankBonus=Math.min(r,100)*40+Math.max(0,Math.min(r,200)-100)*20+Math.max(0,r-200)*10;
    return Math.round(1000+lvUp+rankBonus+weaponAtk+summonAtkTotal);
  }
  // 神姫はマスターボーナス非適用。baseAtk(Lv80基準)にレベル上限解放の累積増分を上乗せ。
  return (def.baseAtk||0)+(SSR_LV_RELEASE[def.lvCap||80]?.atk||0)+weaponAtk+summonAtkTotal;
}
// 表示HP算出: 武器HP×得意補正 + 幻獣HP合計 + キャラ基本HP(神姫) or 英霊基本値
// summonHpTotal: 幻獣HP合計(表示寄与分・手動入力)（マスターボーナスHPは非適用）
function calcDisplayHp(charKey, slots, summonHpTotal, heroRank){
  const def = CHAR_REGISTRY[charKey];
  if(!def || typeof WEAPON_MASTER==='undefined') return 0;
  const fav = def.favWeapon||[];
  let weaponHp=0;
  for(let i=0;i<slots.length;i++){
    const w=WEAPON_MASTER[slots[i]]; if(!w) continue;
    weaponHp += Math.floor((w.hp||0)*(fav.includes(w.type)?1.2:1.0));
  }
  if(def.type==='hero'){
    const r=heroRank, lvUpHp=def.lvUpHp||0;
    const rankBonus=Math.min(r,100)*8+Math.max(0,Math.min(r,200)-100)*2+Math.max(0,r-200)*1;
    return Math.round(600+lvUpHp+rankBonus+weaponHp+summonHpTotal);
  }
  return (def.baseHp||0)+(SSR_LV_RELEASE[def.lvCap||80]?.hp||0)+weaponHp+summonHpTotal;
}

// 属性相性(affinity)は属性枠の中に加算で入る(実機式: 属性枠=属性相性+属性値…)ため、
// GEAR_Kには畳み込まず _na() の属性枠で (affinity + elem) として加算する。
// ATK→スケール係数の唯一の式（recalcGearK / recalcGearKCFromDispAtk が共有＝二重定義の解消・2026-07-14 D9）。
// GEAR.dmgup/other と DMG.misc/enemy_def は呼び出し前に確定していること。
function _gearKScale(atk){ return atk*(1+GEAR.dmgup)*(1+GEAR.other)*DMG.misc/DMG.enemy_def; }
function recalcGearK(){ GEAR_K = _gearKScale(DMG.base_atk); }
recalcGearK();
// per-char 表示ATKマップ → GEAR_K_C を再構築。UI(applyGear)とキャッシュ復元(結果キャッシュのdispAtk)で
// _gearKScale を共有（affinityは_na()属性枠で加算/technicaはna_dmg枠）。
function recalcGearKCFromDispAtk(dispAtkMap){
  GEAR_K_C={}; DISPLAY_ATK_C={};
  for(const [charKey,dispAtk] of Object.entries(dispAtkMap||{})){
    if(dispAtk>0){
      DISPLAY_ATK_C[charKey]=dispAtk;
      GEAR_K_C[charKey]=_gearKScale(dispAtk);
    }
  }
}

// 選択中サブメンバーのキー配列（UIで変更・applyGear()で反映）。
const SUB_SLOTS = 2;  // サブ枠数(最大)
let CURRENT_SUBS = [];  // 例: ['freyja_christmas', '']

// ===== 編成グローバル（buildFormationで構築） =====
// ABIL形式: [owner, color, cd, keigyo_cost]
let CHARS, LEADER, JP, JP_SHORT, GCLS, ABIL, CHAR_DEF, LABEL_SUFFIX, LABEL, CD_SHOW;
// Phase3-1: ホットパス(_stepStatic/_candidates)のアロケーション削減用 事前計算マップ。
// buildFormationで一度だけ構築し、探索中の Object.entries(ABIL)/ネスト参照/computeBaseScore 再計算を排除する。
// ABIL_KEYS=Object.keys(ABIL)順(=Object.entries順=挿入順)で走査順を完全保存。
// ABIL_KC[key]=契晶コスト, ABIL_CANDS[key]=CHAR_REGISTRY[owner].cands[key](無ければundefined),
// ABIL_BASE_S[key]=静的スコア(関数sのみnull→走査時評価/定数sおよびcomputeBaseScore結果は事前確定)。
let ABIL_KEYS = [], ABIL_KC = {}, ABIL_CANDS = {}, ABIL_BASE_S = {};
// 案(c) STEP2 自動較正（C15）: config別に rollout ポリシーの静的スコア s を定数で上書きするマップ（key→数値）。
// 診断(SEARCH_ROLLOUT_DESIGN §4)で「探索の準最適性の根本＝静的sがモデル/ギア依存で脆い」と判明したため、
// s を config ごとに機械的に fit した結果をここへ載せて ABIL_BASE_S に反映する。
// **空(既定)では ABIL_BASE_S が自然値と完全一致＝挙動/golden 不変**（inert by default）。
let S_OVERRIDE = {};
// C15 案(c) runtime 較正: 掃引 grid（多パラメータ機構・直積を proxy で絞り full-verify）と config別採用overrideのキャッシュ。
// null=そのkeyは上書きしない(自然値)。有効レバー＝**judg・pactcore・effond の3変数**（§6.7/§6.10・強い相互作用）。
// pactcore を下げると judg 最適が 122〜150 へシフト、さらに effond≈93 で generic 206,846,142(raw比+18.4%) へ（C16: BW64で再fit=judg122が優位）。
// ⚠ funki は検証の上棄却(自然値最適・§6.6)。3変数まで（4変数以上はユーザー決定で却下）。
// 機構は多パラメータ+粗→細対応（§6.8）。config署名→override をキャッシュし再探索はskip。
const CALIB_GRID = { judg: [null, 100, 130, 145, 160, 200], pactcore: [null, 1], effond: [null, 100, 120] };
const _calibCache = new Map();

// ===== C16 持続化: 探索結果キャッシュ（ヒント検証・A+B の土台 / Increment 1）=====
// 探索結果の per-turn アビキー列を config署名でキャッシュし、再探索を skip する。保存値は「ヒント」であり
// 現行エンジンで決定的リプレイし総ダメージが記録と一致した時のみ信頼する（不一致=エンジン差/改ざん→破棄して再探索）。
// ダメージは押し順で決まり静的スコア override 非依存のため、リプレイ検証に override は不要（勝者orderが override 効果を内包）。
// ENGINE_VERSION: 探索/ダメージに影響する変更を入れたら必ず更新する（キャッシュ名前空間＝古い版を fast-reject）。
//   ※正しさの最終担保はリプレイ検証（版更新忘れも総ダメージ不一致で捕捉）。版はあくまで高速化のための粗い無効化。
// スリム保存（turnsKeys+dmg+prefix+baseDmg）＝レンダー用の重い行は保存せず、命中時にリプレイで再生成する。
const ENGINE_VERSION = 'sim05-c39-naowner';  // C39: `_naOwner` の是正＝(a) effond/betaia が自分を _naOwner に設定していなかった (b) clone() が _naOwner を落としていた。**ダメージモデルの変更**＝旧キャッシュ無効化。前身 C37: 探索後処理を C27 リファイン→局所探索(_localSearchRoute)へ置換。較正スカラは sim04 のまま（C31/C34＋calib_na1.835/calib_burst2.07/judg_calib0.62）。
const _resultCache = new Map();   // _resultKey(configSig) -> {turnsKeys, dmg, prefix, baseDmg, override, n}
function _resultKey(configSig){ return ENGINE_VERSION + '|' + configSig; }
// config署名: 結果キャッシュ(tryResultCache/storeResult)と較正キャッシュ(_calibCache)の共通キー。
// runSim(worker並列)と_fallbackRunSim(非並列)で完全同一であることが正しさ条件のためここに一元化する。
// C26: edison_burst_extra_mult/cap（英霊武器追撃・applyGearで可変）をキーに含める。
// 旧キー形式のキャッシュエントリは以後マッチしない（英霊武器の有無だけ違う設定の衝突＝stale cacheハザードを解消）。
function _configSig(heroKey,kamihimeKeys,n){
  return JSON.stringify([heroKey,kamihimeKeys,GEAR,[...CURRENT_SUBS],DMG.enemy_def,DMG.enemy_max_hp,
    DMG.edison_burst_extra_mult,DMG.edison_burst_extra_cap,n,
    DMG.enemy_barrier,DMG.enemy_abil_cap]);  // 敵側cap/アビ上限は探索結果(押し順/総ダメ)に効くため署名へ含める
}

// 命中時: 保存キー列を現行エンジンでリプレイし、総ダメージが記録と一致すれば {rows,dmg,prefix,baseDmg} を返す（探索skip）。
// 不一致なら該当エントリを破棄し null（=呼び出し側が本探索へ）。buildFormation/applyGear は呼び出し前に config へ反映済みのこと。
function tryResultCache(configSig, n){
  const key=_resultKey(configSig);
  const hit=_resultCache.get(key);
  if(!hit) return null;
  let rep;
  try{ rep=_replayResult(hit.turnsKeys, n); }catch(e){ _resultCache.delete(key); return null; }
  if(Math.round(rep.dmg)!==Math.round(hit.dmg)){ _resultCache.delete(key); return null; }  // ヒント検証
  return { rows:rep.rows, dmg:hit.dmg, prefix:hit.prefix||[], baseDmg:hit.baseDmg };
}

// 本探索完了後: 採用ルートの per-turn キー列をスリム保存する。keys 欠落（万一 rollout 行等）なら保存しない。
function storeResult(configSig, n, best, baseDmg, override){
  if(!best || !Array.isArray(best.rows) || !best.rows.length) return;
  const turnsKeys=best.rows.map(r=>r.keys);
  if(turnsKeys.some(k=>!Array.isArray(k))) return;
  // dispAtk(per-char表示ATK)を同梱＝キャッシュだけで GEAR_K_C を完全再構成可能にする(C26 データ品質)。
  // configSig は GEAR ボックス/def を含むが per-char ATK は含まないため、越境replay(headless分析)で
  // 絶対値が再現できなかった課題への対処。UI の tryResultCache は live GEAR_K_C を使うため挙動不変。
  _resultCache.set(_resultKey(configSig), { turnsKeys, dmg:best.dmg, prefix:best.prefix||[], baseDmg:baseDmg||0, override:override||{}, dispAtk:{...DISPLAY_ATK_C}, n });
}

// ===== C16 持続化 Increment 3: 越境（JSON入出力）=====
// 現在の結果キャッシュを JSON 文字列へシリアライズ / 復元する。configSig は実UI実行が生成した本物を
// そのまま持ち運ぶため、Increment2(プリコンピュート)のような configSig 再現問題が起きない（correct by construction）。
// キーは `ENGINE_VERSION|configSig` 込みで保存＝別版のエントリは現行の tryResultCache と名前空間が合わず
// 自然に無視される（＝古い版の混入で誤ヒットしない）。命中時は従来どおりリプレイ検証で最終担保。
function exportResultCache(){
  const entries=[]; for(const [k,v] of _resultCache) entries.push([k,v]);
  return JSON.stringify({ kind:'kamipro-result-cache', engineVersion:ENGINE_VERSION, entries });
}
// 取込: JSON をパースし _resultCache へマージ。turnsKeys を持つ妥当エントリのみ採用。取込件数を返す。
function importResultCache(jsonStr){
  const obj=JSON.parse(jsonStr);
  if(!obj || !Array.isArray(obj.entries)) throw new Error('形式不正（entries 配列なし）');
  let n=0;
  for(const pair of obj.entries){
    if(!Array.isArray(pair) || pair.length!==2) continue;
    const [k,v]=pair;
    if(typeof k==='string' && v && Array.isArray(v.turnsKeys)){ _resultCache.set(k,v); n++; }
  }
  return n;
}
// UI glue（ブラウザのみ・onclick から呼ぶ）: キャッシュを .json でダウンロード / ファイルから取込。
function downloadResultCache(){
  const count=_resultCache.size;
  if(count===0){ alert('キャッシュが空です。先にシミュレーションを1回以上実行してください（結果はメモリ上に保存され、リロードで消えます）。'); return; }
  const json=exportResultCache();
  const blob=new Blob([json],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`kamipro_cache_${ENGINE_VERSION}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  alert(`${count}件のキャッシュを書き出しました`);
}
function uploadResultCacheFile(input){
  const f=input.files&&input.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{ const n=importResultCache(String(r.result)); alert(`${n}件のキャッシュを取込みました`); }
                 catch(e){ alert('取込失敗: '+(e&&e.message||e)); } input.value=''; };
  r.readAsText(f);
}

// CHAR_SIM_STATES: 編成キャラの state フィールドを合流させたマスター初期値。
// Sim の constructor/snap/clone がこれを参照して自動管理する。
let CHAR_SIM_STATES = {};
// CHAR_SIM_STATE_KEYS: CHAR_SIM_STATES のキー配列を buildFormation で事前確定（clone/snap の毎回 Object.keys 回避）。
let CHAR_SIM_STATE_KEYS = [];
// MILESTONES: 編成キャラが宣言した目的関数マイルストーン。
// def.milestones の同一キーは最大値で集約（例: renri はHELIX解禁閾値30）。
// 目的関数はこの値で頭打ち評価し、解禁後の超過分を無駄に追わない。
let MILESTONES = {};
// ELEM: 各キャラの実効属性 {charKey: 'light'|null}。
// 英霊(elem:null)はウェポン依存のため編成の主属性(神姫の最多属性)を採用する。
// elemCount(e)が「編成内のe属性キャラ数」(英霊込み)を返す共通ヘルパ。
let ELEM = {};
// TICK_STATES: 編成キャラが宣言した「毎ターン自動デクリメントするstate変数」キー一覧。
// 各キャラの tickStates 宣言を buildFormation で集約。tick() が汎用ループで0まで減算する。
// (例: droid/banoshik_robot=エジソンのロボ残T, mooncode=ヘカテーのムーンコード残T)
let TICK_STATES = [];
const ownerOf = k => ABIL[k][0];
const elemCount = e => CHARS.filter(c=>ELEM[c]===e).length;

function buildFormation(heroKey, kamihimeKeys) {
  LEADER = heroKey;
  CHARS  = [heroKey, ...kamihimeKeys];
  JP = {}; JP_SHORT = {}; GCLS = {};
  // jp=正式名称(編成identity表示用) / shortJp=略称(アビチップ・ゲージ等の密な表示用・省略時jp)
  for(const c of CHARS){ JP[c]=CHAR_REGISTRY[c].jp; JP_SHORT[c]=CHAR_REGISTRY[c].shortJp||CHAR_REGISTRY[c].jp; GCLS[c]=CHAR_REGISTRY[c].gcls; }
  // 実効属性: 神姫はelem宣言値、英霊(null)は神姫の最多属性に追従
  const tally = {};
  for(const c of kamihimeKeys) tally[CHAR_REGISTRY[c].elem]=(tally[CHAR_REGISTRY[c].elem]||0)+1;
  const mainElem = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? null;
  ELEM = Object.fromEntries(CHARS.map(c=>[c, CHAR_REGISTRY[c].elem ?? mainElem]));
  ABIL = {};
  for(const c of CHARS)
    for(const [k,[col,cd,kc]] of Object.entries(CHAR_REGISTRY[c].abilities))
      ABIL[k]=[c,col,cd,kc];
  LABEL_SUFFIX = {};
  for(const c of CHARS) Object.assign(LABEL_SUFFIX, CHAR_REGISTRY[c].labelSuffix);
  const cnt={};
  LABEL = Object.fromEntries(Object.entries(ABIL).map(([k,[owner]])=>{
    cnt[owner]=(cnt[owner]||0)+1;
    return [k, `${JP_SHORT[owner]}${cnt[owner]}${LABEL_SUFFIX[k]||''}`];
  }));
  // Phase3-1: ホットパス用の事前計算マップを構築（走査順=ABIL挿入順を保存）。
  ABIL_KEYS = Object.keys(ABIL);
  ABIL_KC = {}; ABIL_CANDS = {}; ABIL_BASE_S = {};
  for(const key of ABIL_KEYS){
    const owner = ABIL[key][0];
    ABIL_KC[key] = ABIL[key][3];
    const cand = CHAR_REGISTRY[owner]?.cands?.[key];
    ABIL_CANDS[key] = cand;
    // s が関数のものだけ走査時評価(null)。定数sおよび未定義(computeBaseScore)は事前確定。
    const nat = cand ? (typeof cand.s==='function' ? null : (cand.s ?? computeBaseScore(key,cand))) : null;
    // 案(c) 自動較正: S_OVERRIDE[key] があれば静的sを定数上書き（関数sも定数へ差替え）。空なら nat＝golden不変。
    ABIL_BASE_S[key] = (key in S_OVERRIDE) ? S_OVERRIDE[key] : nat;
  }
  CHAR_DEF = {};
  for(const c of CHARS) CHAR_DEF[c]=CHAR_REGISTRY[c].def;
  CD_SHOW = {};
  for(const c of CHARS) Object.assign(CD_SHOW, CHAR_REGISTRY[c].cdShow);
  // キャラ固有 sim 状態の初期値を集約（新キャラ追加時は CHAR_REGISTRY[c].state に記述するだけ）
  CHAR_SIM_STATES = Object.fromEntries(
    CHARS.flatMap(c => Object.entries(CHAR_REGISTRY[c].state ?? {}))
  );
  // Phase3-E: clone()/snap() のホットパスで毎回 Object.keys する代わりに事前確定（キー配列を共有）。
  CHAR_SIM_STATE_KEYS = Object.keys(CHAR_SIM_STATES);
  // 毎ターン自動デクリメントするstate変数キーを集約（tick() が汎用処理する）
  TICK_STATES = CHARS.flatMap(c => CHAR_REGISTRY[c].tickStates ?? []);
  // 目的関数マイルストーンを集約（同一キーは最大値を採用）
  MILESTONES = {};
  for(const c of CHARS)
    for(const [k,v] of Object.entries(CHAR_REGISTRY[c].def.milestones ?? {}))
      MILESTONES[k] = Math.max(MILESTONES[k] ?? -Infinity, v);

  // サブとメインのアシスト効果（streak_dmgup ＋ AnotherLink系の編成パッシブ）を集約（光統一時のみ適用）。
  // subAssists はサブメンバー時にも発動するアシスト効果（例: アルテミスAnotherLink）をメイン/サブ共通で拾う。
  // ⚠ 合成は **Math.max（非累積）**＝複数キャラの AnotherLink が同枠で重複しても最大値のみ採る。
  //    実機で加算されるのか最大値なのかは**未検証**（メタトロン登録時に A7 として起票・2026-07-31）。
  //    アルテミス単独時は挙動不変のため、この前提は従来の golden/較正値に影響していない。
  const acc = { streak_dmgup:1.0, burst_dmg:0, burst_cap:0, final_dmg:1.0,
                na_dmg:0, na_cap:0, abi_dmg:0, abi_cap:0 };
  const collect = key => {
    const s = CHAR_REGISTRY[key]?.subAssists; if(!s) return;
    if(s.streak_dmgup) acc.streak_dmgup = Math.max(acc.streak_dmgup, s.streak_dmgup);
    if(s.final_dmg)    acc.final_dmg    = Math.max(acc.final_dmg,    1 + s.final_dmg);
    for(const k of ['burst_dmg','burst_cap','na_dmg','na_cap','abi_dmg','abi_cap'])
      if(s[k]) acc[k] = Math.max(acc[k], s[k]);
  };
  for(const key of CURRENT_SUBS) collect(key);
  for(const c of CHARS) collect(c);
  const allLight = CHARS.every(c => ELEM[c] === 'light');
  DMG.streak_dmgup  = allLight ? acc.streak_dmgup : 1.0;
  DMG.sub_burst_dmg = allLight ? acc.burst_dmg    : 0;
  DMG.sub_burst_cap = allLight ? acc.burst_cap    : 0;
  DMG.final_dmg     = allLight ? acc.final_dmg    : 1.0;
  DMG.sub_na_dmg    = allLight ? acc.na_dmg       : 0;
  DMG.sub_na_cap    = allLight ? acc.na_cap       : 0;
  DMG.sub_abi_dmg   = allLight ? acc.abi_dmg      : 0;
  DMG.sub_abi_cap   = allLight ? acc.abi_cap      : 0;
}

// 候補スコア自動算出: s を省略したアビに対して構造的特徴から標準スコアを導出する。
// 既存の明示的 s 値はそのまま上書き優先。
function computeBaseScore(key, cand) {
  const [,col, cd, kc] = ABIL[key];
  // グループ基準: atkBuf=300(バフ先行) > default=100 > burstTrigger=50(後置)
  let s = cand.atkBuf ? 300 : cand.burstTrigger ? 50 : 100;
  // 色補正: 黄(確実高効果)+15 / 青(サブ効果)+5 / 赤(誘発多い)−5 / 白(コスト高い)−15
  s += { y: 15, b: 5, r: -5, w: -15 }[col] ?? 0;
  if (cand.partyBG)      s += 10;  // 全体BG増加: 早めに打つとBG恩恵が次の行動に波及
  if (cand.deploysRobot) s += 20;  // ロボ展開: 毎バーストBG+5が早いほど総獲得量が増える
  s -= (kc ?? 0) * 5;              // 契晶コスト: 高いほど使いにくい
  if (cd >= 10) s += 5;            // 長CDアビ: 早く使うほど次回使用機会が増える
  if (cd === 0)  s -= 10;          // CD=0 即再使用アビ: 引きつけ可能なためやや後回し
  return Math.max(s, 1);
}

// ===== 案(c) STEP2 静的スコア自動較正（C15・SEARCH_ROLLOUT_DESIGN §6） =====

// 静的スコア上書きを設定し、buildFormation 済みの ABIL_BASE_S へ即時反映する。
// ov=空/未指定 で自然値へ戻す（＝golden不変の既定へ復帰）。探索/rollout は ABIL_BASE_S を参照するため、
// これで rollout ポリシーの s（診断のレバー）を差替えられる。走査順・比較規律は不変（定数化のみ）。
function setStaticOverride(ov){
  S_OVERRIDE = ov ? {...ov} : {};
  if(ABIL_KEYS.length) for(const key of ABIL_KEYS){
    const cand=ABIL_CANDS[key];
    const nat = cand ? (typeof cand.s==='function' ? null : (cand.s ?? computeBaseScore(key,cand))) : null;
    ABIL_BASE_S[key] = (key in S_OVERRIDE) ? S_OVERRIDE[key] : nat;
  }
}
function getStaticOverride(){ return {...S_OVERRIDE}; }

// 較正用スコアラ: 純static greedy（安価proxy・planDepth=2）／単一ビームfull（takeTurn）の N ターン総ダメージ。
function _calProxyDmg(n){ const s=new Sim(); s.totalTurns=n; s.planDepth=2; for(let t=1;t<=n;t++) s.greedyTakeTurn(t); return s.dmg; }
function _calFullDmg(n){  const s=new Sim(); s.totalTurns=n; for(let t=1;t<=n;t++) s.takeTurn(t); return s.dmg; }

// grid の直積で override 候補を列挙（多パラメータ較正）。各 key の値配列で null=そのkeyを上書きしない。
// 例 {judg:[null,130], funki:[null,30]} → [{}, {funki:30}, {judg:130}, {judg:130,funki:30}]（重複排除）。
function _calibCombos(grid){
  let combos=[{}];
  for(const k of Object.keys(grid)){
    const next=[];
    for(const base of combos) for(const v of grid[k]) next.push(v==null ? base : {...base, [k]:v});
    combos=next;
  }
  const seen=new Set(); const out=[];
  for(const c of combos){ const t=JSON.stringify(c); if(!seen.has(t)){ seen.add(t); out.push(c); } }
  return out;
}

// 粗grid の勝者 override 周辺に「細grid」を生成（§6.8 粗→細2段）。粗winner の各 set-key について、
// 粗grid の隣接点との間隔を ~6分割した step で v±2step の点を張る（非genericギアで点間に埋もれた最適を回収）。
// 非null 候補が1つしかない軸（例 pactcore=[null,1]）は細分化不能のため [null,v] のまま。
function _fineGridAround(winner, coarseGrid){
  const fine={};
  for(const k of Object.keys(winner)){
    const v=winner[k];
    const cs=(coarseGrid[k]||[]).filter(x=>x!=null).sort((a,b)=>a-b);
    if(cs.length<2 || typeof v!=='number'){ fine[k]=[null, v]; continue; }
    const idx=cs.indexOf(v);
    const lo = idx>0 ? cs[idx-1] : v-(cs[1]-cs[0]);
    const hi = idx<cs.length-1 ? cs[idx+1] : v+(cs[cs.length-1]-cs[cs.length-2]);
    const step=Math.max(1, Math.round((hi-lo)/6));
    const pts=new Set([null]);
    for(let x=v-2*step; x<=v+2*step; x+=step) if(x>0) pts.add(x);
    fine[k]=[...pts];
  }
  return fine;
}

// runtime 較正の分割API（worker分散用）:
//  - calibrationShortlist: 安価proxyで grid直積を採点し、full-verify すべき override 候補（baseline{}を必ず含む）を返す。
//    §6.8 粗→細: proxy 段で「粗grid採点→粗winner周辺の細grid採点」を行う（proxy ~20ms/点で安価）。
//    ⚠ 多変数で proxy が粗winner をズラすと fine 点が shortlist を占拠し真の最適 coarse 領域を押し出す（§6.10）。
//    よって shortlist は【粗の上位 Kc】と【細の上位 Kf】を別枠で確保し粗の多様性を保証する。full-verify(worker
//    分散)は shortlist のみ＝runSim配線は不変。
//  - _runCalibrationProbe: 1 override を適用し単一ビームfullで採点（worker が並列に回す・返り値=総ダメージ）。
// runSim は shortlist を worker へ分散採点→最大dmgの override を採用（baseline含むため退行しない）。
function calibrationShortlist(n=10, grid, opts={}){
  grid = grid ?? CALIB_GRID;
  const Kc = opts.coarseK ?? 3;   // 粗の上位枠（真の最適 coarse 領域を確保）
  const Kf = opts.fineK ?? 2;     // 細の上位枠（粗winner 周辺の解像度）
  const saved = getStaticOverride();
  try{
    const score = combos => combos.map(ov=>{ setStaticOverride(ov); return {ov, s:_calProxyDmg(n)}; });
    const coarse = score(_calibCombos(grid)).sort((a,b)=>b.s-a.s);   // 粗段
    const coarseWin = coarse[0].ov;
    const fine = Object.keys(coarseWin).length                       // 細段（粗winner 周辺）
      ? score(_calibCombos(_fineGridAround(coarseWin, grid))).sort((a,b)=>b.s-a.s) : [];
    const out=[]; const seen=new Set();
    const add=ov=>{ const t=JSON.stringify(ov); if(!seen.has(t)){ seen.add(t); out.push(ov); } };
    add({});                                       // baseline{} を必ず full-verify（単調安全の要）
    for(let i=0;i<Kc && i<coarse.length;i++) add(coarse[i].ov);   // 粗の上位枠
    for(let i=0;i<Kf && i<fine.length;i++)   add(fine[i].ov);     // 細の上位枠
    return out;
  } finally { setStaticOverride(saved); }
}
function _runCalibrationProbe(override, n){ setStaticOverride(override||{}); return _calFullDmg(n); }

// 静的スコアの config別自動較正（proxy-shortlist + full-verify・**単調安全**・多パラメータ対応）。
// grid: {abilityKey:[null, v1, ...], ...}（null=そのkeyは上書きしない）。既定は module 定数 CALIB_GRID。
// 手順: (1) 安価proxy(≈20ms/点)で grid直積の全 combo を採点し shortlist へ（proxy上位K＋**baseline{} を必ず含む**）。
//       (2) shortlist のみ単一ビームfull で採点し最大を採用（baseline を必ず含むため現行以上＝**退行しない**）。
// 返り値 {override, shortlist, full}。override は setStaticOverride にそのまま渡せる形（{}=baseline維持）。
// この関数は測定後に呼び出し前の override を必ず復元する（呼び出し側が選択 override を明示適用する）。
function calibrateStaticScores(n=10, grid, opts={}){
  grid = grid ?? CALIB_GRID;
  const shortlist = calibrationShortlist(n, grid, opts);
  const saved = getStaticOverride();
  try{
    const full = shortlist.map(ov=>{ setStaticOverride(ov); return {ov, s:_calFullDmg(n)}; });
    full.sort((a,b)=>b.s-a.s);
    const best = full[0];
    // 同dmgタイは baseline{} を優先（無駄な上書き回避・安定）。
    const tieBase = full.find(f=>f.s===best.s && Object.keys(f.ov).length===0);
    return { override: tieBase ? tieBase.ov : best.ov, shortlist, full };
  } finally { setStaticOverride(saved); }
}

// ===== リプレイモード =====

// LABEL(abilityKey→表示名)の逆引きマップを構築。labelSuffix込みの完全形と省略形の両方を登録。
function buildReplayNameMap(){
  const m={};
  for(const [k,v] of Object.entries(LABEL)){
    if(!m[v]) m[v]=k;
    const bare=v.replace(/\([^)]*\)/g,'').trim(); if(!m[bare]) m[bare]=k;
  }
  // 「キャラ略称+番号」形式 (例: テトラ3, エジソン1) のマッピングを追加。
  // abilities のプロパティ挿入順が 1-indexed の番号に対応する。
  for(const charKey of CHARS){
    const def=CHAR_DEF[charKey];
    const short=def.shortJp||def.jp;
    const abilKeys=Object.keys(def.abilities||{});
    for(let i=0;i<abilKeys.length;i++){
      const alias=short+(i+1); // 例: "テトラ3"
      if(!m[alias]) m[alias]=abilKeys[i];
    }
  }
  // カスタムチップの完全一致往復: sim.use 非経由で別キーのラベルを表示するアビ(例: tenya_re=「ヤマト2(再-40)」)を
  // 自キーへ復元する。parseReplayToken は full-token を先に照合するため、末尾()剥がしで誤って初回キー(tenya)へ
  // 化ける前にここで捕捉される。表示ラベルは不変(往復のみ修正)。
  for(const charKey of CHARS){
    const cands=CHAR_REGISTRY[charKey].cands||{};
    for(const [key,cand] of Object.entries(cands)){
      if(cand.refireOf) m[`${LABEL[cand.refireOf]}${cand.refireSuffix||''}`]=key;
    }
  }
  return m;
}

// トークン1個をabilityKeyへ変換。N.プレフィックス・末尾()サフィックスを除去してマッチを試みる。
function parseReplayToken(token, nameMap){
  token=token.replace(/^\d+\./,'').trim();
  if(nameMap[token]) return nameMap[token];
  const bare=token.replace(/\([^)]*\)$/,'').trim();
  return nameMap[bare]||null;
}

// 1ターン分のリプレイ実行。abilityKeysを順に強制実行(guard無視・CD有効)し攻撃フェイズへ。
// スキップされたキー(CD中等)はskipped配列で返す。
function replayTakeTurn(sim, t, abilityKeys){
  sim._beginTurn(t);
  const skipped=[];
  // frame別内訳: burst/streak/judg/effond/droid_react/other_abi
  const bdmg={burst:0,streak:0,judg:0,effond:0,droid_react:0,other_abi:0};
  // アビ実行中に誘発したバースト(エフォンドのムーンコード発動burst等)はburst枠へ計上する。
  // sim.burstを一時ラップし、アビ exec 内のburst寄与をabi枠から切り離す。
  let burstInAbi=0;
  const origBurst=sim.burst.bind(sim);
  sim.burst=function(o,bset,T){const b=this.dmg;const r=origBurst(o,bset,T);burstInAbi+=this.dmg-b;return r;};
  for(const key of abilityKeys){
    const before=sim.dmg; burstInAbi=0;
    if(!sim._execKeyNoGuard(key)){skipped.push(LABEL[key]||key);continue;}
    const delta=sim.dmg-before;
    bdmg.burst+=burstInAbi;
    const abiPart=delta-burstInAbi;
    if(abiPart<=0) continue;
    if(key==='judg') bdmg.judg+=abiPart;
    else if(key==='effond') bdmg.effond+=abiPart;
    else if(key==='droid'||key==='banoshik') bdmg.droid_react+=abiPart;
    else bdmg.other_abi+=abiPart;
  }
  // 攻撃フェイズ: burstラップを継続しFBバースト総量を直接計上、ストリークは残差で厳密分離。
  let fbBurstSum=0;
  sim.burst=function(o,bset,T,atk){const b=this.dmg;const r=origBurst(o,bset,T,atk);fbBurstSum+=this.dmg-b;return r;};
  const beforeAtk=sim.dmg;
  const atk=sim._attackPhase();
  sim.burst=origBurst;
  const atkTotal=sim.dmg-beforeAtk;
  bdmg.burst+=fbBurstSum;            // FB本体(全バースト)
  bdmg.streak=atkTotal-fbBurstSum;   // ストリーク(減衰後・残差=式どおり)
  const T=sim.T, ord=sim.ord;
  const helix=CHARS.some(c=>{const h=CHAR_DEF[c].helix;return h&&h.reached(sim)&&!sim[h.doneKey];});
  sim._endBookkeep(t);
  return{t,ord,atk,full:atk.length===5,burst:T.burst,ju:T.ju,ra:T.ra,
         renri:sim.renri,keigyo:sim.keigyo,cum:sim.cum,mooncode:sim.mooncode,
         helix,droid:sim.droid,banoshik_robot:sim.banoshik_robot,
         dmg:sim.dmg,skipped,bdmg,gauge:{...sim.g}};
}

// リプレイ結果レンダリング
function renderReplay(rows){
  const el=document.getElementById('replay-results');
  if(!rows.length){el.innerHTML='<div style="color:var(--muted)">データなし</div>';return;}
  const f=uiFeats();
  const extraCols=(f.renri?1:0)+(f.moon?1:0)+(f.robot?1:0)+(f.keigyo?1:0);
  const hdr=[
    '<th>T</th>','<th>FB</th>','<th>J</th>',
    f.renri?'<th>⚡</th>':'',
    f.moon?'<th>🌙</th>':'',
    f.robot?'<th>ロボ</th>':'',
    f.keigyo?'<th>💎</th>':'',
    '<th>累計ダメ</th>','<th>+増分</th>','<th>内訳</th>','<th>押し順</th>',
  ].join('');
  const fmt=n=>Math.round(n).toLocaleString();
  let prevDmg=0;
  const trs=rows.map(r=>{
    const incr=Math.round(r.dmg)-prevDmg; prevDmg=Math.round(r.dmg);
    const ordStr=ordChipsHTML(r.ord);
    const sk=r.skipped.length
      ?`<span title="CDあり等でスキップ: ${r.skipped.join(', ')}" style="color:var(--muted);font-size:10px;cursor:help;"> ⚠${r.skipped.length}スキップ</span>`:'';
    const hx=r.helix?`<span style="color:var(--red);font-weight:bold;">★</span> `:'';
    const fbc=r.full
      ?`<span style="color:var(--green)">●5</span>`
      :`<span style="color:var(--orange)">●${r.atk.length}</span>`;
    const bd=r.bdmg||{};
    const bdParts=[];
    if(bd.burst) bdParts.push(`B:${fmt(bd.burst)}`);
    if(bd.streak) bdParts.push(`ST:${fmt(bd.streak)}`);
    if(bd.judg) bdParts.push(`JD:${fmt(bd.judg)}`);
    if(bd.effond) bdParts.push(`EF:${fmt(bd.effond)}`);
    if(bd.droid_react) bdParts.push(`DR:${fmt(bd.droid_react)}`);
    if(bd.other_abi) bdParts.push(`他:${fmt(bd.other_abi)}`);
    const bdStr=`<span style="font-size:10px;color:var(--muted);white-space:nowrap;">${bdParts.join(' ')}</span>`;
    return `<tr style="border-bottom:1px solid var(--border);">
      <td style="white-space:nowrap;">${hx}T${r.t}</td>
      <td>${fbc}</td><td>${r.ju}</td>
      ${f.renri?`<td>${r.renri}</td>`:''}
      ${f.moon?`<td>${r.mooncode}</td>`:''}
      ${f.robot?`<td>${r.droid||0}</td>`:''}
      ${f.keigyo?`<td>${r.keigyo}/${r.cum}</td>`:''}
      <td style="white-space:nowrap;">${fmt(r.dmg)}</td>
      <td style="white-space:nowrap;">+${incr.toLocaleString()}</td>
      <td style="text-align:left;padding:4px 6px;">${bdStr}</td>
      <td style="text-align:left;padding:4px 6px;">${ordStr}${sk}</td>
    </tr>`;
  }).join('');
  const totalDmg=Math.round(rows[rows.length-1].dmg);
  // 診断: リプレイが per-char 実ATK(GEAR_K_C)を使えているか・抽象スケールに落ちていないかを可視化。
  // 抽象スケールだと実機照合が無意味になるため警告を出す。
  const kcChars=CHARS.filter(c=>GEAR_K_C[c]);
  const usingKC=kcChars.length>0;
  const atkStr=usingKC
    ? CHARS.map(c=>`${JP_SHORT[c]}:${(DISPLAY_ATK_C[c]||0).toLocaleString()}`).join(' / ')
    : `（未設定）`;
  const scaleWarn=usingKC
    ? `<span style="color:var(--green)">✓ per-char実ATK適用 (GEAR_K_C)</span>`
    : `<span style="color:var(--red);font-weight:bold;">⚠ 抽象スケール (base_atk=${DMG.base_atk}) — 実機照合不可。装備設定で表示ATKを確認してください</span>`;
  const diag=`
    <div style="font-size:11px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 10px;margin-bottom:8px;line-height:1.7;">
      <div>スケール: ${scaleWarn}</div>
      <div style="color:var(--muted);">使用ATK: ${atkStr}</div>
      <div style="color:var(--muted);">主要GEAR: アサルト+${(GEAR.assault*100).toFixed(1)}% / バーストダメ+${(GEAR.burst_dmg*100).toFixed(1)}% / 通常ダメ+${(GEAR.na_dmg*100).toFixed(1)}% / 旺盛+${(GEAR.vigor*100).toFixed(1)}%</div>
    </div>`;
  el.innerHTML=`
    ${diag}
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">概算ダメージ（モデル計算値 / 実機と異なる場合があります）</div>
    <div style="overflow-x:auto;">
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr style="border-bottom:2px solid var(--border);background:var(--surface);">${hdr}</tr></thead>
        <tbody>${trs}</tbody>
        <tfoot><tr style="border-top:2px solid var(--border);font-weight:bold;background:var(--surface);">
          <td colspan="3">合計</td>
          <td colspan="${extraCols}"></td>
          <td style="white-space:nowrap;">${totalDmg.toLocaleString()}</td>
          <td colspan="3"></td>
        </tr></tfoot>
      </table>
    </div>`;
}

// リプレイ実行エントリポイント: テキストエリアから押し順を読み取り、固定順でシムを実行する。
function runReplay(){
  if(!CHARS.length){alert('先に編成を確認してください');return;}
  applyGear();
  const raw=document.getElementById('replay-input')?.value.trim();
  if(!raw){alert('押し順を入力してください');return;}
  const nameMap=buildReplayNameMap();
  // 各行をターンとして解析。"T1:", "T1 押し順:" 等のプレフィックスを除去し空行をスキップ。
  const lines=raw.split('\n')
    .map(l=>l.replace(/^[Tt]\d+[\s:]*(?:押し順[\s:]*)?/,'').trim())
    .filter(Boolean);
  const n=lines.length;
  const sim=new Sim(); sim.totalTurns=n;
  const rows=[];
  for(let i=0;i<n;i++){
    const tokens=lines[i].split(/[→\s,　]+/).filter(Boolean);
    const keys=tokens.map(tk=>parseReplayToken(tk,nameMap)).filter(Boolean);
    rows.push(replayTakeTurn(sim,i+1,keys));
  }
  renderReplay(rows);
}

function toggleReplayPanel(){
  const body=document.getElementById('replay-body');
  const tog=document.getElementById('replay-toggle');
  const hidden=body.style.display==='none';
  body.style.display=hidden?'':'none';
  tog.textContent=hidden?'▲':'▼';
}

// ===== UI HELPERS =====

// 編成依存のUI機能フラグ。buildFormation後に評価し、不在キャラ固有のUI(ロボ/ムーン/連理/契晶)を隠す。
function uiFeats(){
  return {
    robot:  'droid' in CHAR_SIM_STATES,             // エジソン: マシーンタクトゥ
    moon:   !!ABIL.effond,                         // ヘカテー: ムーンコード
    renri:  !!ABIL.judg,                           // テトラ: 連理魔力(/30)・ジャッジ・HELIX
    keigyo: Object.values(ABIL).some(a=>a[3]>0),   // 契晶コスト持ちアビの有無
  };
}

function gaugesHTML(g){
  return `<div class="gauges">${CHARS.map(c=>{
    const max=CHAR_DEF[c].gmax, pct=Math.min(100,(g[c]/max)*100);
    return `<div class="gauge-row">
      <div class="gauge-name">${JP_SHORT[c]}</div>
      <div class="gauge-wrap"><div class="gauge-fill ${GCLS[c]}" style="width:${pct}%"></div></div>
      <div class="gauge-val">${g[c]}</div>
    </div>`;
  }).join('')}</div>`;
}

function renriHTML(r,cap=30,marks=[10,20]){
  const pct=Math.min(100,(r/cap)*100);
  return `<div class="renri-wrap">
    <div class="renri-fill" style="width:${pct}%"></div>
    ${marks.map(m=>`<div class="renri-mark" style="left:${(m/cap)*100}%"></div>`).join('')}
  </div>
  <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);">
    <span>0</span>${marks.map(m=>`<span>${m}</span>`).join('')}
    <span style="color:${r>=cap?'var(--red)':'var(--muted)'}">${cap}★</span>
  </div>`;
}

// アビリティ色パレット（黄=y 赤=r 青=b 緑=g）。背景/文字/枠
const ACOL={
  y:{bg:'#fff8e1',fg:'#b7791f',bd:'#f6c344',name:'黄'},
  r:{bg:'#ffebee',fg:'#c62828',bd:'#ef5350',name:'赤'},
  b:{bg:'#e3f2fd',fg:'#1565c0',bd:'#42a5f5',name:'青'},
  g:{bg:'#e8f5e9',fg:'#2e7d32',bd:'#66bb6a',name:'緑'},
  w:{bg:'#fafafa',fg:'#616161',bd:'#bdbdbd',name:'白'},
};
function ordChipsHTML(ord){
  return ord.map(o=>{
    const c=ACOL[o.color]||ACOL.y;
    return `<span class="abi-chip" style="background:${c.bg};color:${c.fg};border-color:${c.bd};">${o.text}</span>`;
  }).join('<span class="ord-arrow">→</span>');
}

function loopsHTML(r){
  const f=uiFeats(), b=[];
  if(f.robot){
    b.push(`<div class="loop-badge ${r.droid>0?'la':'li'}"><span class="ln">攻撃ロボ</span><span class="lv">${r.droid}T</span></div>`);
    b.push(`<div class="loop-badge ${r.banoshik_robot>0?'la':'li'}"><span class="ln">補助ロボ</span><span class="lv">${r.banoshik_robot}T</span></div>`);
  }
  if(f.moon)  b.push(`<div class="loop-badge ${r.mooncode>0?'la':'lw'}"><span class="ln">🌙ムーン</span><span class="lv">${r.mooncode}T</span></div>`);
  if(f.renri) b.push(`<div class="loop-badge ${r.renri>=30?'la':(r.renri>=20?'lw':'li')}"><span class="ln">⚡連理</span><span class="lv">${r.renri}/30</span></div>`);
  if(f.keigyo)b.push(`<div class="loop-badge lp"><span class="ln">💎契晶</span><span class="lv">${r.keigyo}/15</span></div>`);
  return b.length?`<div class="loops">${b.join('')}</div>`:'';
}

function cdBadgesHTML(cd){
  return Object.entries(CD_SHOW).map(([k,v])=>{
    const n=cd[k]||0, cls=n===0?'bg':(n<=2?'bo':'bm');
    return `<span class="badge ${cls}" title="${v}">${v.slice(0,4)}:${n}</span>`;
  }).join('');
}

// ===== AUTO SIM =====
let SIM_ROWS=[];
const EXPANDED={};

function toggleCard(t){
  EXPANDED[t]=!EXPANDED[t];
  document.getElementById(`cb-${t}`).classList.toggle('collapsed',!EXPANDED[t]);
  document.getElementById(`ci-${t}`).textContent=EXPANDED[t]?'▲':'▼';
}

function cardHTML(r,first=false){
  EXPANDED[r.t]=first;
  const f=uiFeats();
  const cls=r.helix?'helix-turn':(r.full?'full-burst':'partial');
  const fb=r.full
    ?`<span class="badge bg">✅ 5人FB</span>`
    :`<span class="badge bo">⚠ ${r.atk.length}人 (${r.atk.map(c=>JP_SHORT[c]).join(',')})</span>`;
  const hx=r.helix?`<span class="badge br">★ HELIX!</span>`:'';
  const ordHtml=ordChipsHTML(r.ord);
  return `<div class="turn-card ${cls}">
    <div class="card-header" onclick="toggleCard(${r.t})">
      <div class="turn-label">
        <span class="turn-num">T${r.t}</span>${fb}${hx}
        <span class="badge bp">バ×${r.burst}</span>
        <span class="badge bp">アビ×${r.ability}</span>
        ${f.renri?`<span class="badge ${r.ju>0?'br':'bm'}">J×${r.ju}</span>
        <span class="badge bp">連理${r.renri}/30</span>`:''}
        <span class="badge br" title="概算累計ダメージ">💥${Math.round(r.dmg).toLocaleString()}</span>
      </div>
      <div style="display:flex;align-items:center;gap:7px;">
        <span style="color:var(--muted);font-size:11px;" id="ci-${r.t}">${first?'▲':'▼'}</span>
      </div>
    </div>
    <div class="card-body${first?'':' collapsed'}" id="cb-${r.t}">
      <div class="action-order">${ordHtml}</div>
      ${loopsHTML(r)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:5px;">終了ゲージ</div>
          ${gaugesHTML(r.gauge)}
        </div>
        <div>
          ${f.renri?`<div style="font-size:10px;color:var(--muted);margin-bottom:5px;">連理魔力 累計${r.renri}/30</div>
          ${renriHTML(r.renri)}`:''}
          <div style="margin-top:${f.renri?9:0}px;font-size:10px;color:var(--muted);margin-bottom:5px;">アビCT（再使用まで残りT・0=使用可）</div>
          <div style="display:flex;flex-wrap:wrap;gap:3px;">${cdBadgesHTML(r.state.cd)}</div>
        </div>
      </div>
    </div>
  </div>`;
}

// ===== Web Worker プール =====
// T1の開幕候補ごとにWorkerへ分散して並列実行し、最終ダメージ最大のルートを採用する。
let _workerPool=null, _workerCodeCache=null;
// 中断フラグ。runSim/フォールバック開始時に false、cancelSim()で true。
let _simCancelled=false;

function _terminateWorkerPool(){
  if(_workerPool){ for(const w of _workerPool) w.terminate(); _workerPool=null; }
}

// Phase5-S3: 探索の中断。Worker経路はプール破棄、フォールバックは _simCancelled で次ルートを止める。
// 中断後はプレースホルダへ復帰(clearSim)。以降の遅延メッセージは各ハンドラの _simCancelled ガードで無視。
function cancelSim(){
  _simCancelled=true;
  _terminateWorkerPool();
  clearSim();
}

// 採用ルート確定後の共通仕上げ: SIM_ROWS反映→カード描画→サマリー(renderSim)。
// プール完了(onAllDone)とフォールバックの双方から呼ぶ。
function _finishSim(best, baseDmg){
  document.getElementById('sim-loading').classList.remove('active');
  SIM_ROWS = best ? best.rows : [];
  document.getElementById('sim-results').innerHTML =
    SIM_ROWS.map((r,i)=>cardHTML(r,i===0)).join('');
  renderSim(baseDmg, best ? best.prefix : []);
}

// Phase5-S2: 探索進捗UI(プログレスバー/ターンチップ/ETA)。runSim・フォールバック共用の純UI関数。
function _initSimProgress(n){
  const wrap=document.getElementById('sim-prog-wrap');
  const chips=document.getElementById('sim-prog-chips');
  chips.innerHTML=Array.from({length:n},(_,i)=>`<span class="sim-prog-chip" data-t="${i+1}">T${i+1}</span>`).join('');
  document.getElementById('sim-prog-fill').style.width='0%';
  document.getElementById('sim-prog-eta').textContent='';
  wrap.style.display='flex';
}

// C16 体感改善 B1: ローディング内に編成キャラ(名前バッジ)を描画/点灯する。
// 較正の進捗(_litProgChars(done/total))でグレー→点灯し、待ち時間を計算の進捗に同期させる。
function _renderProgChars(){
  const el=document.getElementById('sim-prog-chars'); if(!el) return;
  el.innerHTML=(CHARS||[]).map(c=>{
    const nm=(JP_SHORT&&JP_SHORT[c])||c;
    return `<span class="sim-char" data-c="${c}"><span class="sim-char-name">${nm}</span></span>`;
  }).join('');
}
function _litProgChars(frac){
  const el=document.getElementById('sim-prog-chars'); if(!el) return;
  const kids=el.children; const lit=Math.max(0,Math.min(kids.length,Math.ceil((frac||0)*kids.length)));
  for(let i=0;i<kids.length;i++) kids[i].classList.toggle('lit', i<lit);
}
// lsActive: C37 局所探索が1本でも走っているか。LS はターン単位の進捗を出さないため、
// ターン数ベースの ETA は「残り約 10s」などと大きく過小に出る＝嘘をつく。LS 中は残り時間を出さない。
function _updateSimProgress(completedSteps, totalSteps, baselineTurn, startTime, lsActive){
  const pct=totalSteps>0?Math.min(100,completedSteps/totalSteps*100):0;
  const fill=document.getElementById('sim-prog-fill');
  if(fill) fill.style.width=pct+'%';
  const bar=document.getElementById('sim-prog-bar');  // Phase5-S4: aria-valuenow を同期(読み上げ)
  if(bar) bar.setAttribute('aria-valuenow', Math.round(pct));
  // ターンチップ: 代表ルート(baseline=空prefix)の到達ターンまでを done 表示(計画 §5.2-2)。
  // C16 体感改善 B1: 到達済みは done(点灯)、直後の計算中ターンを current(パルス)にして「順に光る」演出。
  const chips=document.getElementById('sim-prog-chips');
  if(chips) for(const c of chips.children){ const t=+c.dataset.t;
    c.classList.toggle('done', t<=baselineTurn);
    c.classList.toggle('current', t===baselineTurn+1); }
  // ETA: 完了ステップあたり平均所要 × 残ステップ(計画 §5.2-3)
  const eta=document.getElementById('sim-prog-eta');
  if(eta && (completedSteps>0 || lsActive)){
    const elapsed=(performance.now()-startTime)/1000;
    if(lsActive){
      eta.textContent=`経過 ${Math.round(elapsed)}s ・ 押し順を最適化中（残り時間は不定）`;
    } else {
      const remain=Math.max(0,totalSteps-completedSteps)*(elapsed/completedSteps);
      eta.textContent=`経過 ${Math.round(elapsed)}s ・ 残り約 ${Math.round(remain)}s`;
    }
  }
}


function runSim(){
  const heroEl=document.querySelector('input[name="hero-sel"]:checked');
  if(!heroEl){ alert('英霊を選択してください'); return; }
  const kamihimeKeys=[0,1,2,3].map(i=>document.getElementById(`kslot-${i}`)?.value||'');
  if(kamihimeKeys.some(k=>!k)){ alert('神姫を4人選択してください'); return; }

  const n=Math.max(1,Math.min(30,parseInt(document.getElementById('turns-n').value)||10));
  const heroKey=heroEl.value;

  // 編成・装備をメインスレッド側でも反映(renderParty用)。enumerateRootPrefixes()もこのCHAR_REGISTRY状態に依存する。
  applyGear();
  buildFormation(heroKey,kamihimeKeys);
  renderParty();

  // ローディング表示
  const ld=document.getElementById('sim-loading');
  const prog=document.getElementById('spin-progress');
  document.getElementById('summary-bar').style.display='none';
  document.getElementById('sim-results').innerHTML='';
  ld.classList.add('active');
  prog.textContent='準備中';
  _renderProgChars(); _litProgChars(0);   // C16 体感改善 B1: 編成キャラをグレーで描画(較正進捗で点灯)

  SIM_ROWS=[];
  _simCancelled=false;  // Phase5-S3: 新規探索開始でリセット

  // 既存プールを破棄して新規生成
  _terminateWorkerPool();

  // C16 持続化: config署名。結果キャッシュ命中→リプレイ検証OKなら探索/較正を丸ごとskipして即描画。
  const configSig=_configSig(heroKey,kamihimeKeys,n);
  const _cached=tryResultCache(configSig,n);
  if(_cached){
    prog.textContent='キャッシュ命中（リプレイ検証済）';
    _finishSim({rows:_cached.rows, prefix:_cached.prefix}, _cached.baseDmg);
    return;
  }

  const prefixes=_selectRootPrefixes(n); // 2段選抜: 静的proxyで上位PREFIX_TOPK本に絞る(品質劣化≤0.013%・PERF_NOTES.md)
  const poolSize=Math.max(1,Math.min(navigator.hardwareConcurrency||4, prefixes.length+1));

  // Phase5-S5: ESM worker(Viteがバンドル)。旧 slice+Blob 方式(_buildWorkerCode)は撤廃。
  // registry はモジュール共有のため serialize 不要。実行時設定のみ init メッセージで渡す。
  let workers;
  try{
    workers=Array.from({length:poolSize},()=>new Worker(new URL('./worker.js', import.meta.url), {type:'module'}));
  } catch(err){ _fallbackRunSim(heroKey,kamihimeKeys,n); return; }
  _workerPool=workers;

  // D10(2026-07-14): dmgBase は「applyGear/applyEnemy 等が上書きした DMG キーの自動diff」で全送信する。
  // 旧実装は対象キーの手動列挙（新武器/新キャラの DMG 定数追加のたび追記が必要＝宣言漏れで worker だけ
  // 旧値で走る C26 型のサイレント乖離の温床）。既定値スナップショット(DMG_DEFAULTS)との差分検出により
  // 宣言漏れが構造的に発生しない。worker 側でも buildFormation が再計算するキー(streak_dmgup 等)が
  // 含まれるが、同値適用後に buildFormation が走るため無害（冪等）。ネスト値(オブジェクト)は JSON.stringify 比較で
  // diff 検出＝送信対象（例 enemy_barrier=鬼神障壁の枠別cap。null 既定→非送信でworker既定null＝従来ボス不変）。
  const dmgDiff=Object.fromEntries(Object.entries(DMG).filter(([k,v])=>
    typeof v==='object' ? JSON.stringify(v)!==JSON.stringify(DMG_DEFAULTS[k]) : v!==DMG_DEFAULTS[k]));
  const initMsg={type:'init',heroKey,kamihimeKeys,currentSubs:[...CURRENT_SUBS],gearState:{...GEAR},
    enemyState:{enemy_def:DMG.enemy_def,enemy_max_hp:DMG.enemy_max_hp},
    gearKC:{...GEAR_K_C},dmgBase:dmgDiff};
  // C15 案(c) 自動較正: 「較正phase→本探索phase」の2段。configキャッシュ命中なら較正skip。
  // 較正phase: 安価proxyで絞った override 候補を worker へ分散し単一ビームfullで採点、最大dmg(baseline{}含むため退行なし)を採用。
  // 較正列挙で例外が出ても override なし(=funki修正のみ)で本探索へ graceful fallback。
  let chosenOverride=_calibCache.get(configSig)||null;
  let calibTasks=[];
  if(!chosenOverride){
    try{ calibTasks=calibrationShortlist(n,CALIB_GRID).map((override,ci)=>({type:'calibrate',override,n,ci})); }
    catch(err){ chosenOverride={}; }
  }
  const calibResults=[];
  // 2段実行（2026-07-31）: ①全 prefix をビームのみで走らせ ②キー列で**重複除去**してから LS を掛ける。
  // LS は (キー列, config) の決定的な純関数なので、同一ルートに複数回掛けるのは完全な無駄。
  // ロキ条件では prefix 分散が空回りして 8本中6本が同一ルートになる（search_quality_experiments §12）＝
  // 旧実装は LS を最大8回重複実行していた。**結果は不変**（同一入力→同一出力）でコストだけが減る。
  const buildMainTasks=()=>{
    const t=prefixes.map((prefix,rootId)=>({type:'rootBeam',rootId,prefix,n,override:chosenOverride||{}}));
    t.push({type:'baseline',n,override:chosenOverride||{}});
    return t;
  };

  let phase = calibTasks.length ? 'calib' : 'main';
  let mainTasks = phase==='main' ? buildMainTasks() : null;

  let nextTask=0, done=0, failed=false;
  const rootResults=[]; let baseDmg=0;
  const beamResults=[]; let lsTasks=null;

  // Phase5-S2: per-turn 進捗(総ステップ=本探索タスク数×n)。較正phase中はバー据置＋テキスト表示。
  const totalSteps=(prefixes.length+1)*n; let completedSteps=0; const turnByRoot={}; let startTime=performance.now();
  // C37: 局所探索中のルート -> {sweep,evals,accepted}。LS は全ターン完遂後に数分走り、その間ターン進捗が
  // 一切動かない（バーが 10/10 で止まって見える＝ハングと区別できない）ため、活動を別途表示する。
  const lsByRoot={};
  const _lsActive=()=>Object.keys(lsByRoot).length>0;
  function _setProgText(){
    const total = phase==='ls' ? (lsTasks?lsTasks.length:0) : (mainTasks?mainTasks.length:0);
    const head = phase==='ls' ? `最適化 ${done}/${total} 完了(${poolSize}並列)…`
                              : `ルート ${done}/${total} 計算中(${poolSize}並列)…`;
    const ids=Object.keys(lsByRoot);
    if(!ids.length){ prog.textContent=head; return; }
    let ev=0, acc=0;
    for(const k of ids){ ev+=lsByRoot[k].evals; acc+=lsByRoot[k].accepted; }
    // ⚠ ev/acc は**実行中ルートの合計**。1ルートの上限は LS_MAX_EVALS なので、平均も併記して
    //    「合計値が上限を超えている＝暴走」と誤読されないようにする。
    prog.textContent=`${head} 押し順を最適化中 ${ids.length}本`
      + `（評価 計${ev.toLocaleString()} / 平均${Math.round(ev/ids.length).toLocaleString()}・上限${LS_MAX_EVALS.toLocaleString()} ・ 改善 ${acc}件）`;
  }
  _initSimProgress(n);
  if(phase==='calib') prog.textContent=`較正中… (${calibTasks.length}候補)`;
  else _litProgChars(1);   // C16 体感改善 B1: 較正skip(キャッシュ命中/override確定)時は全キャラ点灯で本探索へ

  const curTasks=()=>phase==='calib'?calibTasks:(phase==='ls'?lsTasks:mainTasks);
  function dispatch(w){ const ts=curTasks(); if(nextTask<ts.length) w.postMessage(ts[nextTask++]); }

  function startMainPhase(){
    phase='main'; mainTasks=buildMainTasks();
    nextTask=0; done=0; startTime=performance.now(); prog.textContent='準備中';
    for(const w of workers) dispatch(w);
  }
  function finishCalib(){
    // baseline{} を必ず含むため最大dmgを採れば退行しない。同dmgタイは baseline({}) を優先(安定・無駄な上書き回避)。
    let best=calibResults[0];
    for(const r of calibResults) if(r.dmg>best.dmg) best=r;
    const tieBase=calibResults.find(r=>r.dmg===best.dmg && Object.keys(r.override).length===0);
    chosenOverride=tieBase?tieBase.override:best.override;
    _calibCache.set(configSig, chosenOverride);
    _litProgChars(1);   // C16 体感改善 B1: 較正完了＝全キャラ点灯してから本探索(ターン点灯)へ
    startMainPhase();
  }

  // ビーム完了 → キー列で重複除去 → LS フェーズへ。
  function startLsPhase(){
    const uniq=new Map();
    for(const r of beamResults){
      const sig=JSON.stringify(r.keys);
      const hit=uniq.get(sig);
      if(hit) hit.dupes++;
      else uniq.set(sig,{prefix:r.prefix, keys:r.keys, dupes:0});
    }
    lsTasks=[...uniq.values()].map((u,i)=>
      ({type:'rootLS', rootId:'ls'+i, prefix:u.prefix, keys:u.keys, n, override:chosenOverride||{}}));
    if(!lsTasks.length){ onAllDone(); return; }   // 異常系(ビーム全滅)でも進行を止めない
    phase='ls'; nextTask=0; done=0;
    prog.textContent=`押し順を最適化中… (${lsTasks.length}本${beamResults.length>lsTasks.length?` / ビーム${beamResults.length}本から重複除去`:''})`;
    for(const w of workers) dispatch(w);
  }

  function onAllDone(){
    if(failed||_simCancelled) return;
    _workerPool=null;
    rootResults.sort((a,b)=>b.dmg-a.dmg);
    storeResult(configSig, n, rootResults[0], baseDmg, chosenOverride);  // C16 持続化: 採用ルートをスリム保存
    _finishSim(rootResults[0], baseDmg);
  }

  for(const w of workers){
    w.onmessage=function(e){
      if(_simCancelled) return;  // Phase5-S3: 中断後の遅延メッセージを無視
      const d=e.data;
      if(d.type==='ready'){ dispatch(w); return; }
      if(d.type==='progress'){
        const prev=turnByRoot[d.rootId]||0;
        if(d.t>prev){ completedSteps+=(d.t-prev); turnByRoot[d.rootId]=d.t; }
        _updateSimProgress(completedSteps, totalSteps, turnByRoot['baseline']||0, startTime, _lsActive());
        return;
      }
      if(d.type==='lsProgress'){
        lsByRoot[d.rootId]={sweep:d.sweep, evals:d.evals, accepted:d.accepted};
        _setProgText();
        _updateSimProgress(completedSteps, totalSteps, turnByRoot['baseline']||0, startTime, true);
        return;
      }
      if(d.type==='calibResult'){
        calibResults.push(d); done++;
        prog.textContent=`較正中… ${done}/${calibTasks.length}`;
        _litProgChars(done/calibTasks.length);   // C16 体感改善 B1: 較正進捗に同期して編成キャラを点灯
        if(done>=calibTasks.length){ finishCalib(); return; }
        dispatch(w); return;
      }
      if(d.type==='rootBeamResult') beamResults.push(d);
      else if(d.type==='rootResult'){ rootResults.push(d); delete lsByRoot[d.rootId]; }
      else if(d.type==='baselineResult') baseDmg=d.baseDmg;
      done++;
      _setProgText();
      if(phase==='main' && done>=mainTasks.length){ startLsPhase(); return; }
      if(phase==='ls'   && done>=lsTasks.length){ onAllDone(); return; }
      dispatch(w);
    };
    w.onerror=function(){
      // Worker初期化/実行に失敗した場合はメインスレッド(非同期分割)フォールバックへ。
      if(failed) return; failed=true;
      _terminateWorkerPool();
      _fallbackRunSim(heroKey,kamihimeKeys,n);
    };
    w.postMessage(initMsg);
  }
}

// Workerが使えない環境向けフォールバック(メインスレッド非同期分割実行・フリーズ防止)
function _fallbackRunSim(heroKey,kamihimeKeys,n){
  const prog=document.getElementById('spin-progress');
  document.getElementById('sim-loading').classList.add('active');
  _simCancelled=false;  // Phase5-S3: フォールバック開始でリセット(runSim未経由の直接呼び出しにも対応)
  setTimeout(()=>{
    buildFormation(heroKey,kamihimeKeys); applyGear();
    // C15 案(c): 非並列フォールバックでも自動較正を適用（同期・configキャッシュ）。例外時は override なしへ。
    const configSig=_configSig(heroKey,kamihimeKeys,n);
    // C16 持続化: 結果キャッシュ命中→リプレイ検証OKなら探索/較正を丸ごとskip。
    const _cached=tryResultCache(configSig,n);
    if(_cached){ prog.textContent='キャッシュ命中（リプレイ検証済）'; _finishSim({rows:_cached.rows,prefix:_cached.prefix}, _cached.baseDmg); return; }
    let chosenOverride=_calibCache.get(configSig);
    if(!chosenOverride){
      prog.textContent='較正中…';
      try{ chosenOverride=calibrateStaticScores(n,CALIB_GRID).override; }catch(err){ chosenOverride={}; }
      _calibCache.set(configSig, chosenOverride);
    }
    setStaticOverride(chosenOverride);   // 以降の _runRootPlan/_runBaselinePlan は較正済み s で走る
    const prefixes=_selectRootPrefixes(n); // 本選と同じ2段選抜(フォールバックも上位PREFIX_TOPK本のみ)
    // Phase5-S2: 進捗(非並列は同期実行のためターン単位のライブ描画は不可＝ルート境界で更新)。
    const totalSteps=(prefixes.length+1)*n; let completedSteps=0; const startTime=performance.now();
    _initSimProgress(n);
    _renderProgChars(); _litProgChars(1);   // C16 体感改善 B1: 非並列較正は同期(incremental不可)のため全キャラ点灯で本探索へ
    let best=null;
    let i=0;
    // 2段実行（worker 経路と同じ）: ①ビームのみ ②キー列で重複除去して LS。
    const beamRoutes=[]; const uniqLS=new Map(); let lsList=null, li=0;
    function nextRoute(){
      if(_simCancelled) return;  // Phase5-S3: 中断でフォールバックループ停止
      if(i<prefixes.length){
        prog.textContent=`ルート ${i+1}/${prefixes.length} 計算中(非並列フォールバック・ビーム)…`;
        setTimeout(()=>{
          if(_simCancelled) return;
          const r=_runRootPlan(prefixes[i],n,()=>{ completedSteps++; },null,true);  // skipLS
          beamRoutes.push({prefix:r.prefix, keys:r.rows.map(x=>x.keys), dmg:r.dmg});
          i++;
          _updateSimProgress(completedSteps, totalSteps, 0, startTime);
          nextRoute();
        }, 0);
      } else if(lsList===null){
        for(const r of beamRoutes){ const sig=JSON.stringify(r.keys); if(!uniqLS.has(sig)) uniqLS.set(sig,r); }
        lsList=[...uniqLS.values()];
        nextRoute();
      } else if(li<lsList.length){
        // C37: フォールバックは同期実行のため LS 中も再描画されない（onLS を渡しても表示は更新できない）。
        // ∴ 着手前に本数を明示して、無反応区間が想定内であることを伝える。
        prog.textContent=`押し順を最適化中 ${li+1}/${lsList.length}(非並列フォールバック${beamRoutes.length>lsList.length?`・ビーム${beamRoutes.length}本から重複除去`:''})…`;
        setTimeout(()=>{
          if(_simCancelled) return;
          const u=lsList[li];
          const r=_runRouteLS(u.prefix, u.keys, n);
          if(!best||r.dmg>best.dmg) best=r;
          li++;
          nextRoute();
        }, 0);
      } else {
        setStaticOverride({});   // C16: baseline は素直押し=自然s（override無し）。分子(opt)のみ較正・分母は素直押し。
        const baseDmg=_runBaselinePlan(n,()=>{ completedSteps++; });
        _updateSimProgress(completedSteps, totalSteps, n, startTime);
        storeResult(configSig, n, best, baseDmg, chosenOverride);  // C16 持続化: 採用ルートをスリム保存
        _finishSim(best, baseDmg);
        // override は既に上で {} 済み（次回探索/他処理へ漏らさない）。
      }
    }
    nextRoute();
  },0);
}

function renderSim(baseDmg, winningPrefix=[]){
  const rows=SIM_ROWS; if(!rows.length) return;
  const f=uiFeats();
  // ルート分散で採用された開幕(CD_SHOW表示名で汎用表示・空ならビーム単体=従来通り)
  const rootHtml=winningPrefix.length
    ?`<div class="summary-stat"><span class="val" style="font-size:13px;">${winningPrefix.map(k=>CD_SHOW[k]||k).join('→')}</span><span class="lbl">採用ルート(開幕)</span></div>`:'';
  const fb=rows.filter(r=>r.full).length;
  const ht=rows.find(r=>r.helix);
  const fin=rows[rows.length-1];
  const optDmg=fin.dmg;
  // 火力指数: optimal÷baseline×100。基準(素直押し)=100。baseDmg未提供時はindex非表示。
  const idx=baseDmg>0 ? optDmg/baseDmg*100 : 0;
  const grade=idx>=130?'S':idx>=115?'A':idx>=105?'B':'C';
  const gcls=grade==='S'?'gs':grade==='A'?'ga':grade==='B'?'gb':'gc';
  const barColor=grade==='S'?'#d97706':grade==='A'?'var(--accent2)':grade==='B'?'var(--green)':'var(--muted)';
  // バー: 100=左端, 160=右端(60pt幅)でクランプ
  const barPct=Math.min(100,Math.max(0,(idx-100)/60*100));
  const fiHtml=baseDmg>0?`
    <div class="fi-block">
      <div class="fi-top">
        <span class="fi-val" style="color:${barColor}">${idx.toFixed(1)}</span>
        <span class="fi-grade ${gcls}">${grade}</span>
      </div>
      <div class="fi-bar-wrap"><div class="fi-bar-fill" style="width:${barPct}%;background:${barColor}"></div></div>
      <div class="fi-sub">🔥 火力指数（素直押し=100）</div>
    </div>`:'';
  document.getElementById('summary-bar').style.display='';
  document.getElementById('summary-bar').innerHTML=`
    <div class="summary-bar">
      ${fiHtml}
      <div class="summary-stat"><span class="val" style="color:var(--green)">${fb}/${rows.length}</span><span class="lbl">フルバースト</span></div>
      ${f.renri?`<div class="summary-stat"><span class="val">${ht?`T${ht.t}`:'未達'}</span><span class="lbl">HELIX解禁</span></div>`:''}
      ${f.renri?`<div class="summary-stat"><span class="val">${fin.renri}/30</span><span class="lbl">最終連理魔力</span></div>`:''}
      ${f.keigyo?`<div class="summary-stat"><span class="val">${fin.keigyo}/15</span><span class="lbl">最終契晶</span></div>
      <div class="summary-stat"><span class="val">${fin.cum}</span><span class="lbl">累計契晶</span></div>`:''}
      <div class="summary-stat"><span class="val">${rows.reduce((s,r)=>s+r.burst,0)}</span><span class="lbl">総バースト</span></div>
      <div class="summary-stat"><span class="val">${rows.reduce((s,r)=>s+r.ability,0)}</span><span class="lbl">総アビ</span></div>
      ${rootHtml}
    </div>
    <table class="summary-table">
      <tr><th>T</th><th>FB</th><th>火力推移</th><th>バースト</th><th>アビ</th>${f.robot?'<th>ロボ作動</th>':''}${f.renri?'<th>ジャッジ</th><th>連理累計</th>':''}${f.keigyo?'<th>契晶(現/累)</th>':''}${f.moon?'<th>🌙ムーン</th>':''}</tr>
      ${rows.map(r=>{
        const fb2=r.full?`<span class="tg">✅5人</span>`:`<span class="to">${r.atk.length}人</span>`;
        const dmgDisp=baseDmg>0?(r.dmg/baseDmg*100).toFixed(1):`${Math.round(r.dmg).toLocaleString()}`;
        return `<tr><td><b>T${r.t}</b></td><td>${fb2}</td><td>${dmgDisp}</td><td>${r.burst}</td><td>${r.ability}</td>${f.robot?`<td>${r.ra}</td>`:''}${f.renri?`<td>${r.ju}</td><td>${r.renri}/30</td>`:''}${f.keigyo?`<td>${r.keigyo}/${r.cum}</td>`:''}${f.moon?`<td>${r.mooncode}T</td>`:''}</tr>`;
      }).join('')}
    </table>`;
  // ターンカードは呼び出し元(runSim/_fallbackRunSim)が採用ルート確定後に描画済み。
}

function clearSim(){
  SIM_ROWS=[];
  document.getElementById('sim-results').innerHTML=
    `<div class="sim-placeholder"><div class="ph-icon">⚡</div>
     <div class="ph-msg">▶ シミュレーション実行 を押して最適押し順を計算します</div></div>`;
  document.getElementById('summary-bar').style.display='none';
  document.getElementById('sim-loading').classList.remove('active');
}

// ===== 編成選択UI =====

function renderFormationPanel(){
  const heroes   = Object.entries(CHAR_REGISTRY).filter(([,v])=>v.type==='hero');
  const kamihime = Object.entries(CHAR_REGISTRY).filter(([,v])=>v.type==='kamihime');

  const heroHtml = heroes.map(([k,v])=>`
    <input class="hero-card" type="radio" name="hero-sel" id="hr-${k}" value="${k}" ${LEADER===k?'checked':''} onchange="syncSlots()">
    <label for="hr-${k}">${v.jp}</label>`).join('');

  const kamOptions = kamihime.map(([k,v])=>`<option value="${k}">${v.jp}</option>`).join('');
  const slotsHtml = [0,1,2,3].map(i=>`
    <div class="kslot-wrap">
      <span class="slot-num">${i+1}番目</span>
      <select id="kslot-${i}" onchange="syncSlots()">
        <option value="">-- 未選択 --</option>
        ${kamOptions}
      </select>
    </div>`).join('');

  const subSlotsHtml = Array.from({length:SUB_SLOTS},(_,i)=>`
    <div class="kslot-wrap">
      <span class="slot-num">サブ${i+1}</span>
      <select id="sub-slot-${i}" onchange="syncSlots()">
        <option value="">-- なし --</option>
        ${kamOptions}
      </select>
    </div>`).join('');

  document.getElementById('formation-panel').innerHTML=`
    <div class="formation-panel">
      <div class="cfg-title" style="margin-bottom:0;">⚔ 編成選択</div>
      <div class="fp-row">
        <div class="fp-section">
          <div class="fp-label">英霊（先頭固定）</div>
          <div class="hero-cards">${heroHtml}</div>
        </div>
        <div class="fp-section">
          <div class="fp-label">神姫</div>
          <div class="kslots">${slotsHtml}</div>
        </div>
        <div class="fp-section">
          <div class="fp-label">サブメンバー</div>
          <div class="kslots">${subSlotsHtml}</div>
        </div>
      </div>
    </div>`;

  // 現在の編成をスロットに反映
  const currentKami = CHARS.filter(c=>c!==LEADER);
  currentKami.forEach((c,i)=>{ document.getElementById(`kslot-${i}`).value=c; });
  // サブメンバー選択を復元
  CURRENT_SUBS.forEach((k,i)=>{ const el=document.getElementById(`sub-slot-${i}`); if(el&&k) el.value=k; });
  syncSlots();
}

function syncSlots(overrideVals){
  const kamihime = Object.entries(CHAR_REGISTRY).filter(([,v])=>v.type==='kamihime');
  const allKeys = [
    'kslot-0', 'kslot-1', 'kslot-2', 'kslot-3',
    'sub-slot-0', 'sub-slot-1'
  ];
  const vals = overrideVals || allKeys.map(id => document.getElementById(id)?.value || '');

  allKeys.forEach((id, i) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = vals[i];
    const isSub = id.startsWith('sub-slot-');
    
    const emptyText = isSub ? '-- なし --' : '-- 未選択 --';
    sel.innerHTML = `<option value="">${emptyText}</option>`;
    
    for (const [k,v] of kamihime) {
      const takenElsewhere = vals.some((v2, j) => j !== i && v2 === k);
      // UI-fix: 他スロットで選択済みのキャラは「除外」せず disabled で残す。除外すると select の
      // 幅(=最広optionに追従)がスロット毎に変わり、サブ選択でメインの入力ボックスが伸縮する不具合になる。
      // 全option常在＝最広optionが常に存在し幅が安定する（選択不可の担保は disabled が行う）。
      const dis = (takenElsewhere && k !== cur) ? ' disabled' : '';
      sel.innerHTML += `<option value="${k}"${k === cur ? ' selected' : ''}${dis}>${v.jp}</option>`;
    }
  });
  // メインスレッドかつUI変更時の場合、編成状態を即座に更新して上部の編成バッジを同期する
  if (typeof window !== 'undefined' && !overrideVals) {
    const heroEl = document.querySelector('input[name="hero-sel"]:checked');
    if (heroEl) {
      const kamihimeKeys = [0,1,2,3].map(i => document.getElementById(`kslot-${i}`)?.value || '');
      // 4人全員が選択されているときのみ buildFormation を走らせる
      if (kamihimeKeys.every(k => k)) {
        buildFormation(heroEl.value, kamihimeKeys);
        renderParty();
      }
    }
  }
}

// ===== 装備設定UI =====
function renderGearPanel(){
  const sumOpts = '<option value="none">-- なし --</option>'+
    Object.entries(SUMMON_REGISTRY).map(([k,v])=>`<option value="${k}">${v.jp}</option>`).join('');
  // メイン/サブ1-5/サポート のラベルを SUMMON_LAYOUT から生成
  const summonLabels = SUMMON_LAYOUT.flatMap(g=>Array.from({length:g.n},(_,j)=>g.n>1?`${g.label}${j+1}`:g.label));
  const summonRows = Array.from({length:SUMMON_SLOTS},(_,i)=>`
    <div class="gear-row">
      <span class="slot-num">${summonLabels[i]}</span>
      <select id="summon-${i}">${sumOpts}</select>
    </div>`).join('');
  const wOpts = '<option value="">-- 未装備 --</option>'+
    (typeof WEAPON_MASTER!=='undefined'
      ? Object.entries(WEAPON_MASTER).map(([k,v])=>`<option value="${k}">${v.jp}</option>`).join('')
      : '');
  const weaponRows = Array.from({length:10},(_,i)=>`
    <div class="gear-row">
      <span class="slot-num" style="min-width:40px">${i===0?'メイン':'サブ'+i}</span>
      <select id="wslot-${i}">${wOpts}</select>
    </div>`).join('');
  const wpnRows = GEAR_BOXES_DISPLAY.map(([k,jp])=>`
    <div class="gear-row">
      <span class="wpn-lbl">${jp}</span>
      <input type="number" id="wpn-${k}" value="0" min="0" step="1" style="width:60px"> %
    </div>`).join('');
  document.getElementById('gear-panel').innerHTML=`
    <div class="gear-card">
      <div class="cfg-title">⚙️ 幻獣・ウェポン設定</div>
      <div class="gear-row" style="margin-bottom:8px;gap:12px;flex-wrap:wrap;">
        <span class="wpn-lbl">敵</span>
        <select id="enemy-select">${
          Object.entries(ENEMY_REGISTRY).map(([k,v])=>`<option value="${k}"${k===CURRENT_ENEMY_KEY?' selected':''}>${v.label}</option>`).join('')
        }</select>
      </div>
      <div class="gear-row" style="margin-bottom:8px;gap:12px;flex-wrap:wrap;">
        <span class="wpn-lbl">属性相性</span>
        <select id="dmg-affinity">
          <option value="neu"${DMG.affinity===1.0?' selected':''}>中立（×1.0）</option>
          <option value="adv"${DMG.affinity===1.5?' selected':''}>有利（×1.5）</option>
        </select>
        <span class="wpn-lbl" style="margin-left:8px;">プレイヤーランク</span>
        <input type="number" id="hero-rank" value="165" min="1" max="300" step="1" style="width:65px">
      </div>
      <div class="gear-row" style="margin-bottom:8px;gap:12px;flex-wrap:wrap;">
        <span class="wpn-lbl">幻獣総合攻撃力</span>
        <input type="number" id="summon-atk-total" value="0" min="0" step="1" style="width:80px">
        <span class="wpn-lbl" style="margin-left:8px;">幻獣総合HP</span>
        <input type="number" id="summon-hp-total" value="0" min="0" step="1" style="width:80px">
        <span style="font-size:10px;color:var(--muted);">※編成画面のメイン+サブ幻獣の表示寄与合計</span>
      </div>
      <div class="gear-grid">
        <div>
          <div class="gear-sub">幻獣（メイン1+サブ5+サポート1・重複可／ダメージ用）</div>${summonRows}
          <div class="gear-sub" style="margin-top:10px;">ウェポン（メイン1＋サブ9）</div>${weaponRows}
        </div>
        <div>
          <div class="gear-sub">追加補正（ウェポンマスタ外・各ボックス%）</div>${wpnRows}
        </div>
      </div>
    </div>`;
}

// 英霊武器専用強化の基準値(未装備時)。applyGear() 冒頭でこれにリセット後、装備検出時に上書き。
const HERO_WEAPON_BASE = {
  droid_react_mult:       DMG.droid_react_mult,
  droid_react_cap:        DMG.droid_react_cap,
  edison_burst_extra_mult: DMG.edison_burst_extra_mult,  // 0=OFF
  betaia_mult:            DMG.betaia_mult,
  betaia_cap:             DMG.betaia_cap,
  napo_burst_cd_reduce:   false,  // ナポレオン英霊武器バーストCDリダクション
};

function applyGear(){
  // 敵パラメータを先に同期(GEAR_K_Cの enemy_def 参照より前に実行)
  applyEnemy(document.getElementById('enemy-select')?.value||CURRENT_ENEMY_KEY);
  CURRENT_SUBS = Array.from({length:SUB_SLOTS},(_,i)=>document.getElementById(`sub-slot-${i}`)?.value||'');
  // 属性相性: 選択中の敵DBが affinity を定義していればそれを正とし(UIトグルより優先)、
  // 未定義の敵(default等)のみ UIトグルで決める(従来挙動)。
  {
    const _e = ENEMY_REGISTRY[CURRENT_ENEMY_KEY];
    DMG.affinity = (_e && _e.affinity != null)
      ? _e.affinity
      : (document.getElementById('dmg-affinity')?.value==='adv'?1.5:1.0);
  }
  for(const [box] of GEAR_BOXES) GEAR[box]=0;
  // 英霊武器専用強化定数を基準値にリセット(ループで武器を検出した場合に上書き)
  DMG.droid_react_mult        = HERO_WEAPON_BASE.droid_react_mult;
  DMG.droid_react_cap         = HERO_WEAPON_BASE.droid_react_cap;
  DMG.edison_burst_extra_mult = HERO_WEAPON_BASE.edison_burst_extra_mult;
  DMG.betaia_mult             = HERO_WEAPON_BASE.betaia_mult;
  DMG.betaia_cap              = HERO_WEAPON_BASE.betaia_cap;
  DMG.napo_burst_cd_reduce    = HERO_WEAPON_BASE.napo_burst_cd_reduce;

  // 幻獣のweapon_amp合計と直接ボックス補正を収集(ダメージ用。表示攻撃力の幻獣寄与は手動合計入力)
  // スロット区分ゲート: main/support → mainEffect(加護 weapon_amp 含む), sub → subEffect のみ(weapon_amp 禁止)。
  // トップレベル box は位置非依存として全枠共通で加算。
  let weaponAmp=0;
  const summonBoxes=[];
  // 条件付き効果の判定材料: サブ枠に**実際に装備されている**幻獣の属性一覧（空枠は数えない）。
  // 例: ラジエル サブ効果「装備しているサブ幻獣が全て光属性のとき」。
  const subElems=[];
  for(let i=0;i<SUMMON_SLOTS;i++){
    if(SUMMON_ROLES[i]!=='sub') continue;
    const s=SUMMON_REGISTRY[document.getElementById('summon-'+i)?.value];
    if(s) subElems.push(s.elem);
  }
  // condition は宣言的（registry 側に持つ＝エンジンに幻獣名リテラルを書かない）。未知キーは**不成立**＝安全側。
  const condOK=(c)=>{
    if(!c) return true;
    if(c.allSubSummonsElem) return subElems.length>0 && subElems.every(e=>e===c.allSubSummonsElem);
    return false;
  };
  for(let i=0;i<SUMMON_SLOTS;i++){
    const key=document.getElementById('summon-'+i)?.value;
    const s=SUMMON_REGISTRY[key]; if(!s) continue;
    const isMainSlot=(SUMMON_ROLES[i]!=='sub'); // main または support
    if(s.box) summonBoxes.push(s.box); // 位置非依存
    const eff = isMainSlot ? s.mainEffect : s.subEffect;
    if(eff && condOK(eff.condition)){
      if(isMainSlot) weaponAmp+=eff.weapon_amp||0; // 加護はメイン幻獣効果=main/supportのみ
      if(eff.box) summonBoxes.push(eff.box);
    }
  }

  // ウェポンスキルからGEAR_BOXESを自動計算
  const heroKey=document.querySelector('input[name="hero-sel"]:checked')?.value||LEADER;
  const slots=Array.from({length:10},(_,i)=>document.getElementById('wslot-'+i)?.value||'');
  if(typeof WEAPON_MASTER!=='undefined'){
    for(let i=0;i<slots.length;i++){
      const w=WEAPON_MASTER[slots[i]]; if(!w) continue;
      const isMain=(i===0);
      for(const sk of (w.skills||[])){
        if(sk.condition?.mainOf&&!(isMain&&sk.condition.mainOf===heroKey)) continue;
        if(sk.droidUpgrade){ // ランチャータンク: 攻撃ロボ反応の倍率/減衰を強化(メインエジソン限定)
          DMG.droid_react_mult = sk.droidUpgrade.mult;
          DMG.droid_react_cap  = sk.droidUpgrade.cap;
          continue;
        }
        if(sk.burstHeroExtra){ // 英霊武器バースト追加ダメージ(エジソン等・メイン装備時)
          DMG.edison_burst_extra_mult = sk.burstHeroExtra.mult;
          DMG.edison_burst_extra_cap  = sk.burstHeroExtra.cap;
          continue;
        }
        if(sk.betaiaUpgrade){ // 英霊武器ベタイア強化(ナポレオン・メイン装備時)
          DMG.betaia_mult = sk.betaiaUpgrade.mult;
          DMG.betaia_cap  = sk.betaiaUpgrade.cap;
          continue;
        }
        if(sk.napoBurstCdReduce){ // ナポレオン英霊武器バーストCDリダクション
          DMG.napo_burst_cd_reduce = true;
          continue;
        }
        if(sk.box==='defender') continue; // HP専用・ダメージGEAR外
        if(sk.stinger){
          GEAR.acute += (sk.rate/100)*(1+weaponAmp)*0.20; // 発動率×weapon_amp×固定+20%
        } else if(GEAR[sk.box]!==undefined){
          GEAR[sk.box] += (sk.pct/100)*(1+weaponAmp);
        }
      }
    }
  }

  // 追加補正(手動入力・ウェポンマスタ外の補完用)
  for(const [box] of GEAR_BOXES){
    const v=parseFloat(document.getElementById('wpn-'+box)?.value)||0;
    GEAR[box]+=v/100*(1+weaponAmp);
  }
  // 幻獣直接ボックス補正
  for(const sb of summonBoxes)
    for(const [box,amt] of Object.entries(sb))
      if(GEAR[box]!==undefined) GEAR[box]+=amt;

  recalcGearK();

  // per-character 表示攻撃力/HP & GEAR_K_C
  GEAR_K_C={}; DISPLAY_ATK_C={}; DISPLAY_HP_C={};
  if(typeof WEAPON_MASTER!=='undefined'&&CHARS.length>0&&Object.keys(ELEM).length>0){
    const heroRank=parseInt(document.getElementById('hero-rank')?.value)||165;
    const sumAtkTotal=parseFloat(document.getElementById('summon-atk-total')?.value)||0;
    const sumHpTotal=parseFloat(document.getElementById('summon-hp-total')?.value)||0;
    const dispAtkMap={};
    // per-formation: 現編成(LEADER=英霊キー)の override だけを引く。未登録編成は全キャラ満凸推定。
    const atkOv=displayAtkOverrideFor(LEADER), hpOv=displayHpOverrideFor(LEADER);
    for(const charKey of CHARS){
      // 実機表示の直接指定があれば最優先(Lv上限解放/+99等を0-fudgeで内包)。無ければ満凸decompose推定。
      const dispAtk=atkOv[charKey]||calcDisplayAtk(charKey,slots,sumAtkTotal,heroRank);
      // 実機表示HPの直接指定があれば最優先(ATKと対称)。無ければ満凸decompose推定。
      const dispHp=hpOv[charKey]||calcDisplayHp(charKey,slots,sumHpTotal,heroRank);
      if(dispAtk>0){ dispAtkMap[charKey]=dispAtk; DISPLAY_HP_C[charKey]=dispHp; }
    }
    recalcGearKCFromDispAtk(dispAtkMap); // DISPLAY_ATK_C / GEAR_K_C を共有式で構築
  }
  // シミュは重い(ビームサーチ・数秒〜10秒)ため自動再実行しない。▶ボタンで明示実行する。
}

// ===== 編成保存スロット(GitHub Gist同期) =====
// 単一ユーザー前提・ブラウザ間共有用。トークンは各ブラウザのlocalStorageに保持し、
// 編成データ本体(スロット配列)はSecret Gist 1個に集約してGET/PATCHで同期する。
const GIST_FILE = 'kamipro_slots.json';
let SLOTS = [];
let SLOTS_LOADED = false;

function ghToken(){ return localStorage.getItem('kp_gh_token')||''; }
function ghGistId(){ return localStorage.getItem('kp_gist_id')||''; }

async function ghRequest(path, opts={}){
  const res = await fetch('https://api.github.com'+path, {
    ...opts,
    headers: { 'Authorization':'token '+ghToken(), 'Accept':'application/vnd.github+json', ...(opts.headers||{}) },
  });
  if(!res.ok) throw new Error('GitHub API '+res.status+': '+(await res.text()).slice(0,200));
  return res.json();
}

async function loadSlotsFromGist(){
  const id = ghGistId();
  if(!id){ SLOTS=[]; SLOTS_LOADED=true; return; }
  const data = await ghRequest('/gists/'+id);
  const content = data.files?.[GIST_FILE]?.content;
  SLOTS = content ? JSON.parse(content) : [];
  SLOTS_LOADED = true;
}

async function persistSlots(){
  const body = { description:'神姫PROJECT R 編成保存スロット', public:false,
    files:{ [GIST_FILE]:{ content: JSON.stringify(SLOTS, null, 1) } } };
  if(ghGistId()){
    await ghRequest('/gists/'+ghGistId(), { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  } else {
    const data = await ghRequest('/gists', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    localStorage.setItem('kp_gist_id', data.id);
  }
}

// 現在のUI入力(編成・幻獣・ウェポン・補正値)を1スロット分のプレーンオブジェクトに集約
function captureFormation(){
  const heroKey = document.querySelector('input[name="hero-sel"]:checked')?.value||LEADER;
  const kamihimeKeys = [0,1,2,3].map(i=>document.getElementById(`kslot-${i}`)?.value||'');
  const subKamihimeKeys = [0,1].map(i=>document.getElementById(`sub-slot-${i}`)?.value||'');
  const summon = Array.from({length:SUMMON_SLOTS},(_,i)=>document.getElementById('summon-'+i)?.value||'none');
  const weapons = Array.from({length:10},(_,i)=>document.getElementById('wslot-'+i)?.value||'');
  const wpnBoxes = {};
  for(const [k] of GEAR_BOXES) wpnBoxes[k]=document.getElementById('wpn-'+k)?.value||'0';
  return {
    hero: heroKey, kamihime: kamihimeKeys, subKamihime: subKamihimeKeys, summon, weapons, wpnBoxes,
    affinity: document.getElementById('dmg-affinity')?.value||'neu',
    heroRank: document.getElementById('hero-rank')?.value||'165',
    summonAtkTotal: document.getElementById('summon-atk-total')?.value||'0',
    summonHpTotal: document.getElementById('summon-hp-total')?.value||'0',
  };
}

// 保存済みスロットの内容をUIへ反映し、編成・シムを再構築する
function applyFormation(slot){
  document.getElementById('hr-'+slot.hero).checked = true;
  const subKam = slot.subKamihime || [];
  const overrideVals = [
    slot.kamihime[0] || '',
    slot.kamihime[1] || '',
    slot.kamihime[2] || '',
    slot.kamihime[3] || '',
    subKam[0] || '',
    subKam[1] || ''
  ];
  syncSlots(overrideVals);
  renderGearPanel();
  // 旧length-2プリセット移行: 旧index1は加護源(実質サポート枠)だったため、7枠化に伴いサポート枠(末尾)へ寄せて加護を保存。
  let summonSaved = slot.summon || [];
  if(summonSaved.length<=2 && summonSaved.some(k=>k&&k!=='none')){
    const migrated=Array(SUMMON_SLOTS).fill('none');
    migrated[0]=summonSaved[0]||'none';                       // メイン
    if(summonSaved[1]&&summonSaved[1]!=='none') migrated[SUMMON_SLOTS-1]=summonSaved[1]; // 旧サブ扱い→サポート
    summonSaved=migrated;
  }
  for(let i=0;i<SUMMON_SLOTS;i++){ const el=document.getElementById('summon-'+i); if(el) el.value = summonSaved[i]||'none'; }
  for(let i=0;i<10;i++){ const el=document.getElementById('wslot-'+i); if(el) el.value = slot.weapons?.[i]||''; }
  for(const [k] of GEAR_BOXES){ const el=document.getElementById('wpn-'+k); if(el) el.value = slot.wpnBoxes?.[k]||'0'; }
  document.getElementById('dmg-affinity').value = slot.affinity||'neu';
  document.getElementById('hero-rank').value = slot.heroRank||'165';
  document.getElementById('summon-atk-total').value = slot.summonAtkTotal||'0';
  document.getElementById('summon-hp-total').value = slot.summonHpTotal||'0';
  buildFormation(slot.hero, slot.kamihime);
  applyGear();
  renderParty();
  clearSim();
}

function slotSummaryText(slot){
  const heroJp = CHAR_REGISTRY[slot.hero]?.jp||slot.hero;
  const kamJp = slot.kamihime.map(k=>CHAR_REGISTRY[k]?.jp||'?').join('/');
  const subKam = slot.subKamihime || [];
  const subJp = subKam.filter(Boolean).map(k=>CHAR_REGISTRY[k]?.jp||'?').join('/');
  return `${heroJp} ＋ ${kamJp}${subJp ? ` (サブ: ${subJp})` : ''}`;
}

function renderSlotsPanel(){
  const panel = document.getElementById('slots-panel');
  if(!ghToken()){
    panel.innerHTML = `
      <div class="gear-card">
        <div class="cfg-title">💾 編成保存スロット</div>
        <div class="gear-row" style="gap:8px;">
          <input type="password" id="gh-token-input" placeholder="GitHub Personal Access Token (gist権限)" style="flex:1;min-width:240px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;">
          <button class="btn btn-primary btn-sm" onclick="saveTokenAndInit()">連携</button>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:6px;">
          このブラウザのlocalStorageにのみ保存されます。トークンはGitHub設定→Developer settings→
          Personal access tokens で「gist」権限のみ付与して発行してください。
        </div>
      </div>`;
    return;
  }
  if(!SLOTS_LOADED){
    panel.innerHTML = `<div class="gear-card"><div class="cfg-title">💾 編成保存スロット</div><div class="slot-status">読込中…</div></div>`;
    return;
  }
  const cards = SLOTS.map(s=>`
    <div class="slot-card">
      <div class="slot-name">${s.name}</div>
      <div class="slot-members">${slotSummaryText(s)}</div>
      <div class="slot-btns">
        <button class="btn btn-secondary btn-sm" onclick="loadSlotById('${s.id}')">呼出</button>
        <button class="btn btn-secondary btn-sm" onclick="overwriteSlotById('${s.id}')">上書き</button>
        <button class="btn btn-secondary btn-sm" onclick="deleteSlotById('${s.id}')">削除</button>
      </div>
    </div>`).join('') || `<div class="slot-empty">保存済みの編成はありません</div>`;
  panel.innerHTML = `
    <div class="gear-card">
      <div class="cfg-title">💾 編成保存スロット</div>
      <div class="gear-row" style="gap:8px;">
        <input type="text" id="slot-name-input" placeholder="新しいスロット名（例: 光エジソン基準）" style="flex:1;min-width:200px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;">
        <button class="btn btn-primary btn-sm" onclick="saveNewSlot()">＋ 現在の編成を保存</button>
      </div>
      <div class="slot-grid">${cards}</div>
      <div id="slot-status" class="slot-status"></div>
    </div>`;
}

function slotStatus(msg){ const el=document.getElementById('slot-status'); if(el) el.textContent=msg; }

async function saveTokenAndInit(){
  const v = document.getElementById('gh-token-input')?.value.trim();
  if(!v) return;
  localStorage.setItem('kp_gh_token', v);
  await refreshSlotsPanel();
}

async function refreshSlotsPanel(){
  renderSlotsPanel();
  try{
    await loadSlotsFromGist();
    renderSlotsPanel();
  } catch(err){
    SLOTS_LOADED = true;
    renderSlotsPanel();
    slotStatus('読込エラー: '+err.message);
  }
}

async function saveNewSlot(){
  const name = document.getElementById('slot-name-input')?.value.trim();
  if(!name){ alert('スロット名を入力してください'); return; }
  const slot = { id: String(Date.now()), name, savedAt: new Date().toISOString(), ...captureFormation() };
  SLOTS.push(slot);
  slotStatus('保存中…');
  try{ await persistSlots(); renderSlotsPanel(); }
  catch(err){ SLOTS.pop(); slotStatus('保存エラー: '+err.message); }
}

async function overwriteSlotById(id){
  const idx = SLOTS.findIndex(s=>s.id===id);
  if(idx<0) return;
  if(!confirm(`「${SLOTS[idx].name}」を現在の編成で上書きしますか？`)) return;
  const prev = SLOTS[idx];
  SLOTS[idx] = { ...prev, ...captureFormation(), savedAt: new Date().toISOString() };
  slotStatus('上書き中…');
  try{ await persistSlots(); renderSlotsPanel(); }
  catch(err){ SLOTS[idx]=prev; slotStatus('上書きエラー: '+err.message); }
}

async function deleteSlotById(id){
  const idx = SLOTS.findIndex(s=>s.id===id);
  if(idx<0) return;
  if(!confirm(`「${SLOTS[idx].name}」を削除しますか？`)) return;
  const removed = SLOTS.splice(idx,1)[0];
  slotStatus('削除中…');
  try{ await persistSlots(); renderSlotsPanel(); }
  catch(err){ SLOTS.splice(idx,0,removed); slotStatus('削除エラー: '+err.message); }
}

function loadSlotById(id){
  const slot = SLOTS.find(s=>s.id===id);
  if(!slot) return;
  applyFormation(slot);
}

// ===== INIT =====
function renderParty(){
  const chips=CHARS.map(c=>{
    const role=c===LEADER?'<span class="pc-role">英霊</span>':'';
    const atkVal=DISPLAY_ATK_C[c];
    const atkBadge=atkVal?`<span class="pc-atk">⚔${atkVal.toLocaleString()}</span>`:'';
    const hpVal=DISPLAY_HP_C[c];
    const hpBadge=hpVal?`<span class="pc-hp">❤${hpVal.toLocaleString()}</span>`:'';
    return `<span class="party-chip">${role}${JP[c]}${atkBadge}${hpBadge}</span>`;
  }).join('');
  document.getElementById('party-bar').innerHTML=
    `<span class="pb-label">編成</span>${chips}`;
  renderLegend();
}

// 凡例のキャラ固有項目(ロボ/ムーン/連理/契晶)を編成に合わせて出し分ける
function renderLegend(){
  const f=uiFeats(), b=[];
  if(f.renri) b.push(`<div><span style="color:var(--red)">★</span> HELIX解禁ターン</div>`);
  if(f.robot) b.push(`<div style="margin-top:6px;"><b style="color:var(--accent2)">ロボ</b> 展開残T</div>`);
  if(f.moon)  b.push(`<div><b style="color:var(--accent2)">🌙</b> ムーンコード残T</div>`);
  if(f.renri) b.push(`<div><b style="color:var(--accent2)">⚡</b> 連理魔力/30</div>`);
  if(f.keigyo)b.push(`<div><b style="color:var(--accent2)">💎</b> 契晶現在/累計</div>`);
  document.getElementById('legend-dyn').innerHTML=b.join('');
}

// ===== INIT (ブラウザのみ・worker/node import 時は document 不在でスキップ) =====
if (typeof document !== 'undefined') {
  buildFormation('edison',['yamato','hecate','tetra','elaine']);
  renderFormationPanel();
  renderGearPanel();
  renderParty();
  clearSim(); // 初期表示はプレースホルダ（▶ボタンで実行）
  refreshSlotsPanel();
} else {
  // worker/テスト向け: UI無しでも既定編成を1回構築（buildFormation はgolden/worker初期化で明示再実行される）。
  buildFormation('edison',['yamato','hecate','tetra','elaine']);
}

// ==========================================================================
// Phase5 S5: モジュール公開
// ==========================================================================
// worker.js は CURRENT_SUBS を再代入するため setter を用意（import 束縛へは直接代入不可）。
export function setCurrentSubs(v){ CURRENT_SUBS = v; }

// data/characters.js（フック遅延参照）・worker.js・test・window が参照する記号を公開。
// let 宣言（CHARS/ABIL/ELEM/LEADER/LABEL 等）は buildFormation が再代入する live binding。
export {
  Sim, buildFormation, applyGear, applyEnemy, recalcGearK, recalcGearKCFromDispAtk,
  _runRootPlan, _runRouteLS, _runBaselinePlan, enumerateRootPrefixes, _selectRootPrefixes, _replayResult, _localSearchRoute, _LSReplay, _refineRoute,
  setStaticOverride, getStaticOverride, calibrateStaticScores, calibrationShortlist, _runCalibrationProbe,
  tryResultCache, storeResult, _resultCache, _resultKey, ENGINE_VERSION, exportResultCache, importResultCache,
  GEAR, DMG, BG, GEAR_K_C, CHARS, ABIL, ownerOf, ELEM, LEADER, LABEL,
  // per-formation 実機表示ATK/HP（headless の基準順再探索・golden への ATK 注入で参照）
  DISPLAY_ATK_OVERRIDE_BY_FORMATION, DISPLAY_HP_OVERRIDE_BY_FORMATION,
  displayAtkOverrideFor, displayHpOverrideFor, calcDisplayAtk, calcDisplayHp,
  RENRI_CAP, RENRI_MAX, TENYA_FROM, IFISHANT_MIN_CD,
  WEAPON_MASTER, SUMMON_REGISTRY, ENEMY_REGISTRY, CHAR_REGISTRY,
  // sim.js が app.js（可変編成状態）から import する記号（barrel 再公開）:
  GEAR_K, ABIL_KEYS, ABIL_KC, ABIL_CANDS, ABIL_BASE_S, CHAR_DEF,
  MILESTONES, TICK_STATES, CHAR_SIM_STATES, CHAR_SIM_STATE_KEYS
};

// HTML の inline ハンドラ（onclick 等）はモジュール化でグローバルでなくなるため window へ橋渡し。
if (typeof window !== 'undefined') {
  Object.assign(window, {
    runSim, clearSim, cancelSim, toggleCard, toggleReplayPanel, runReplay,
    downloadResultCache, uploadResultCacheFile,
    saveTokenAndInit, loadSlotById, overwriteSlotById, deleteSlotById, saveNewSlot, syncSlots
  });
}
