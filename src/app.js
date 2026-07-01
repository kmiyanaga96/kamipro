// ==========================================================================
// Phase5 S5 (A案): ESM エントリ。旧 index.html の inline <script id="engine-code">
// (ゲーム定数〜INIT) を丸ごと移設したもの。data と相互 import（循環）になるが、
// data 側の外部参照は全て関数本体＝遅延評価で TDZ に当たらない（ロード順不変条件）。
// ⚠ 詳細・保守方針は VITE_MIGRATION.md を一次情報とすること。
// ==========================================================================
import { WEAPON_MASTER } from '../data/weapons.js';
import { SUMMON_REGISTRY } from '../data/summons.js';
import { ENEMY_REGISTRY } from '../data/enemies.js';
import { CHAR_REGISTRY } from '../data/characters.js';

import { RENRI_CAP, RENRI_MAX, JUDG_REACT, TENYA_FROM, FB_THR, MACH_BG, KEIGYO_MAX, BEAM_W, PREFIX_TOPK, BEAM_DIVERSITY_K, IFISHANT_MIN_CD, BG, DMG } from './constants.js';


let CURRENT_ENEMY_KEY = 'default';

function applyEnemy(key){
  const e = ENEMY_REGISTRY[key] ?? ENEMY_REGISTRY['default'];
  CURRENT_ENEMY_KEY = key;
  DMG.enemy_def    = e.def;
  DMG.enemy_max_hp = e.max_hp;
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

const SUMMON_SLOTS = 2; // シミュ時に採用する幻獣枠数(重複可)

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
};

// 実機表示ATKの直接指定(0-fudge較正)。Lv上限解放/+99/育成途中/placeholderを全て内包した
// ゲーム画面の確定表示値をキャラ毎に上書きする。指定があれば calcDisplayAtk(満凸推定) より優先する。
// decompose(満凸WEAPON_MASTER + 得意補正 + SSR_LV_RELEASE)は target build 用途として温存し、
// ここは現状の実機合わせ。{} なら従来どおり全キャラ calcDisplayAtk へフォールバック(現状維持)。
const DISPLAY_ATK_OVERRIDE = {
  // 検証編成・育成途中スクショ実測(エジソン + 光4・テトラのみLv90解放)。
  // 別編成に差し替える際はその編成の実機表示ATKに更新するか、行を消せば満凸推定へ戻る。
  edison: 78306, yamato: 62999, hecate: 59226, tetra: 65436, elaine: 63537,
};

// ゲーム画面の確定表示HPをキャラ毎に上書きする(ATK overrideと完全対称・0-fudge)。
// 将来「旺壮」(最大HPを参照して特殊攻撃力UPを付与する仕様)を実装する際、その最大HP基準値となる土台。
// (※「旺盛/ヴィゴラス」は現在HP参照の別スキルで、シムは最大HP前提に簡略化し vigor 枠で実装済み)
// +99/育成途中/placeholder武器/Lv上限解放を全て内包した実測値で calcDisplayHp(満凸推定) を上書きする。
// 空 {} なら従来どおり全キャラ calcDisplayHp へフォールバック(現状維持・挙動不変)。
const DISPLAY_HP_OVERRIDE = {
  // 検証編成・育成途中スクショ実測(DISPLAY_ATK_OVERRIDEと同一編成・同一出典)。
  edison: 9689, yamato: 7628, hecate: 8332, tetra: 8332, elaine: 8345,
};

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
function recalcGearK(){ GEAR_K = DMG.base_atk*(1+GEAR.dmgup)*(1+GEAR.other)*DMG.misc/DMG.enemy_def; }
recalcGearK();

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
    ABIL_BASE_S[key] = cand ? (typeof cand.s==='function' ? null : (cand.s ?? computeBaseScore(key,cand))) : null;
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
  let sdmgup = 1.0, bdmg = 0, bcap = 0, fdmg = 1.0;
  const collect = key => {
    const s = CHAR_REGISTRY[key]?.subAssists; if(!s) return;
    if(s.streak_dmgup) sdmgup = Math.max(sdmgup, s.streak_dmgup);
    if(s.burst_dmg)    bdmg   = Math.max(bdmg,   s.burst_dmg);
    if(s.burst_cap)    bcap   = Math.max(bcap,   s.burst_cap);
    if(s.final_dmg)    fdmg   = Math.max(fdmg,   1 + s.final_dmg);
  };
  for(const key of CURRENT_SUBS) collect(key);
  for(const c of CHARS) collect(c);
  const allLight = CHARS.every(c => ELEM[c] === 'light');
  DMG.streak_dmgup  = allLight ? sdmgup : 1.0;
  DMG.sub_burst_dmg = allLight ? bdmg   : 0;
  DMG.sub_burst_cap = allLight ? bcap   : 0;
  DMG.final_dmg     = allLight ? fdmg   : 1.0;
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

// ===== SIM ENGINE =====
class Sim {
  constructor() {
    this.g=Object.fromEntries(CHARS.map(c=>[c,BG.other_max]));
    this.cd=Object.fromEntries(Object.keys(ABIL).map(k=>[k,0]));
    // エンジン共通変数（キャラ非依存）
    this.keigyo=4; this.cum=4; this.renri=0;
    this.totalTurns=10; this.planDepth=0;
    // 概算火力モデル: バフ期間管理辞書と総ダメージ累計
    // buf = {abilityKey: [remaining_turns, ...]}  スタック毎に残りターン数を管理。
    // tick() でデクリメント・失効削除。_na() がbufから動的に乗数を計算する。
    this.dmg=0; this.buf={};
    this.gmax=Object.fromEntries(CHARS.map(c=>[c,CHAR_DEF[c].gmax??BG.other_max]));
    // キャラ固有状態変数（CHAR_REGISTRY[c].state から自動展開）
    for(const [k,v] of Object.entries(CHAR_SIM_STATES)) this[k]=v;
  }

  tick() {
    for(const k of Object.keys(this.cd)) if(this.cd[k]>0) this.cd[k]--;
    // キャラ宣言の tickStates(droid/banoshik_robot/mooncode 等)を汎用デクリメント
    for(const k of TICK_STATES) if(this[k]>0) this[k]--;
    // バフ残ターンをデクリメントし失効スタックを除去
    for(const k of Object.keys(this.buf)){
      this.buf[k]=this.buf[k].map(x=>x-1).filter(x=>x>0);
      if(!this.buf[k].length) delete this.buf[k];
    }
  }

  addG(targets, amt, excl=null) {
    for(const c of targets){
      if(excl&&excl.has(c)) continue;
      this.g[c]=Math.min(this.g[c]+amt, this.gmax[c]);
    }
  }

  grif(owner) {
    const gain = CHAR_DEF[owner].keigyoGain;
    this.keigyo=Math.min(this.keigyo+gain, KEIGYO_MAX);
    this.cum+=gain;
  }

  // 減衰(上限)モデル: 計算ダメージ raw → 実ダメージ。区分線形で寄与率(slope)を逓減する。
  // frame: 'na'(35/45/55万実ダメ・第1上限のみ×cap_up・第2/第3は+10万/+20万固定・全½傾き反復) / 'burst'(100万・1→1/10)
  //        / 'abi'(base=キャラ毎・1→0.04=1/25) / 'hard'(追撃/城塞・寄与率0=完全頭打ち)。
  // 通常攻撃が上限到達時はアビダメ計算基準をdecay(na)に切替(_naForAbi)。抽象スケールでは全休眠。
  // アビダメ計算基準: 通常攻撃が上限到達時は減衰後naをbase(na_dmg・テクニカ不適用)。未到達はna()そのまま。
  _naForAbi(){ const na=this._na(); const c1=DMG.decay_na.cap1*(1+(GEAR.na_cap||0)); return na>=c1?this._decay('na',na):na; }
  // 攻撃ロボ(droid_buf): 赤アビ反応毎のアビダメ枠加算(累積可・各スタック dur_droid_buf 持続)
  _droidAbiBuf(){ const n=this.buf.droid_buf?.length||0; return {dmg:n*DMG.abi_dmg_droid, cap:n*DMG.abi_cap_droid}; }
  // 汎用: ownerのバーストゲージを spent 消費し、アビ枠ダメージ(mult/cap)を加算して use(key) する。
  // 「ゲージ消費量に応じた段階ダメージ」アビ(アルテミス1)の共通処理。keyは引数=エンジンにキャラ名リテラルなし。
  _spendGaugeAbi(key, spent, mult, cap, T, ord){
    const owner=ownerOf(key); this.g[owner]=Math.max(0, this.g[owner]-spent); this._naOwner=owner;
    const db=this._droidAbiBuf();
    this.dmg += this._decay('abi', this._naForAbi()*mult*(1+GEAR.abi_dmg+db.dmg), cap*(1+db.cap));
    this.use(key, T, ord, `(消費${spent})`);
  }

  _decay(frame, raw, base){
    const up = GEAR[frame+'_cap']||0;
    if(frame==='na'){
      // 第1上限のみcap_up×。第2/第3は+10万/+20万の固定オフセット。各超過分に½を反復適用(有志確定)。
      const c1=DMG.decay_na.cap1*(1+up), c2=c1+100000, c3=c1+200000;
      let r=raw;
      if(r>c1) r=c1+(r-c1)*0.5;
      if(r>c2) r=c2+(r-c2)*0.5;
      if(r>c3) r=c3+(r-c3)*0.5;
      return r;
    }
    if(frame==='burst'){
      const c1=(base??DMG.decay_burst.cap1)*(1+up);
      return raw<=c1 ? raw : c1+(raw-c1)*DMG.decay_burst.slope;
    }
    if(frame==='streak'){
      // バーストストリーク専用減衰。base=参加人数(2〜5)。第一/第二減衰はraw実ダメ閾値。
      // raw≤c1:等倍 / c1〜c2:超過分×slope1(0.25) / c2超:超過分×slope2(0.40)。限界寄与率は人数共通。
      const d=DMG.decay_streak, cap=d.caps[base??5]||d.caps[5], c1=cap[0], c2=cap[1];
      if(raw<=c1) return raw;
      if(raw<=c2) return c1+(raw-c1)*d.slope1;
      return c1+(c2-c1)*d.slope1+(raw-c2)*d.slope2;
    }
    if(frame==='abi'){
      const c1=(base??Infinity)*(1+up);
      return raw<=c1 ? raw : c1+(raw-c1)*DMG.decay_abi_slope;
    }
    return Math.min(raw, (base??Infinity)*(1+up)); // hard(追撃/城塞): 寄与率0
  }

  // 概算通常攻撃ダメージ(中央値): バフ期間管理辞書(buf)から動的に枠を計算する。
  // 各バフキーのスタック数が実効枠値を決定し、失効スタックは tick() で除去済み。
  // ※ フレーム別ダメージUP(na_dmg/abi_dmg/burst_dmg)は base に含めず、各フレームの加算点で乗じる。
  // technicaはGEAR_Kに含まれない(na_dmgへ移動済み)のでバースト基準も_na()そのまま。
  _na(){
    const D=DMG, b=this.buf, G=GEAR;
    const nAbs=b.absolute?.length||0, nPuv=b.puvoir?.length||0;
    const nBan=b.banoshik?.length||0, nLeg=b.legend?.length||0;
    const nPikeCrit=b.pike_crit?.length||0;
    const nPuvAcute=b.puvoir_acute?.length||0;  // プヴワール急所(ムーンコード時のみpush)
    // ムーンコード自己バフ(ヘカテー2アシ): 発動中かつ攻撃者がムーンコード所有者(=effond所有者)のみ。
    // 旺盛/会心をヘカテー自身の_na()に加算する(party全体ではなく自己バフ)。
    const mc = (ABIL.effond && this.mooncode>0 && this._naOwner===ownerOf('effond')) ? 1 : 0;
    // アサルト枠: banoshik/absolute + legend(契晶) + フレイヤ累積攻撃UP + 装備
    const fAslt = (this._naOwner && this['freyja_a_' + this._naOwner]) || 0;
    const aslt = nBan*D.assault_banoshik + nAbs*D.assault_absolute
               + (b.leg_aslt?D.assault_legend:0) + G.assault + fAslt;
    // 属性値枠: 属性相性(affinity・実機式では枠内に加算) + puvoir(光) + ヤマトバースト + 装備。
    // 実機式の属性枠 = (属性相性 + 属性値UP幻獣 + 属性値 + 属性バフ + アシスト)。先頭1+ではなくaffinityが基底。
    const nYel=b.yamato_elem?.length||0;
    const elemBox = D.affinity + nPuv*D.elem_puvoir + nYel*D.elem_yamato + G.elem;
    // 旺盛枠: absolute/leg_vigor/pike(光) + 装備。+100%上限(フルHP前提)
    const vigor = Math.min(
      (nAbs>0?D.vigor_absolute:0)+(b.leg_vigor?D.vigor_legend:0)
      +(b.pike?.length>0?D.vigor_pike:0)+mc*D.vigor_mooncode+G.vigor, 1.0);
    // 会心枠: ARRIVE永続 + absolute + パイク確実会心(100%) + ムーンコード(自己) + 装備
    const critRate = Math.min(D.crit_rate_arrive + nAbs*D.crit_rate_absolute
                            + (nPikeCrit>0?D.crit_rate_pike:0) + mc*D.crit_rate_mooncode + G.crit_rate, 1.0);
    const crit = critRate*D.crit_mult;
    // 急所枠: 光(puvoirはムーンコード時のみ/absolute/legend/pike_crit) + 装備
    const acute = nPuvAcute*D.acute_puvoir + nAbs*D.acute_absolute + nLeg*D.acute_legend
                + nPikeCrit*D.acute_pike_crit + (b.refine_acute?.length?D.acute_refine:0) + G.acute;
    // 特殊攻撃枠: leg_spec(光) + omni(テトラ1アシ・光) + 装備
    const spec = (b.leg_spec?D.spec_legend:0)+(b.omni?.length?D.spec_omni:0)
               + (b.mobius_spec?.length||0)*D.spec_mobius
               + (b.artemis_spec?.length?D.spec_artemis:0) + G.spec;
    // GEAR_K or per-character GEAR_K_C[owner] (武器マスタ設定時)
    const gk = (this._naOwner && GEAR_K_C[this._naOwner]) || GEAR_K;
    const base = gk*(1+aslt)*elemBox*(1+vigor)*(1+crit)*(1+acute)*(1+spec);
    // ロワ・クモンド: 独立枠フラット(tierはbuf使用時に確定・base比率で近似)
    const royFlat = (b.roy?.length||0)*base*D.roy_na_frac[this.roy_tier??0];
    // 防御DOWN: 敵防御/耐性DOWN各ソース合算 → 上限50%(実機: 防御down合計50%で下限・以降切捨)。
    // 実機は敵防御の除数補正だが、枠の概念は追わず暫定的に上限50%の加算近似とする。
    const defdown = Math.min(
      (b.consort_def?.length||0)*D.defdown_consort
    + (b.divinus_def?.length||0)*D.defdown_divinus
    + Math.min((b.effond_def?.length||0)*D.defdown_effond, D.defdown_effond_max), 0.50);
    // 恐傷(アルテミス1・消費100): 敵への被ダメージUP(this.kyosho_amp・buf.kyosho有効中のみ)。全枠の外側に乗算。
    // 最終ダメージ倍率(DMG.final_dmg・AnotherLink等のアシスト由来): 既定1.0で golden 不変。
    const kyo = b.kyosho?.length ? (this.kyosho_amp||0) : 0;
    const res = (base + royFlat) * (1 + defdown) * (1 + kyo) * (DMG.final_dmg ?? 1);
    return res;
  }

  burst(owner, bset, T, atk=false) {
    this._naOwner = owner; // バーストダメージはオーナーのGEAR_K_Cを参照
    this.addG(CHARS.filter(c=>c!==owner), BG.cascade, atk?bset:null);
    this.grif(owner); T.burst++;
    // C12-案C: 定石性報酬 — バースト(ダメージ行動)が攻撃/防御DOWN・アサルト等の有効中に撃たれたら加点。
    // ダメージ非加算のランキング用シグナルのみ(火力計算には不関与・golden不変)。
    T.orthodoxy=(T.orthodoxy||0)+(this.buf.divinus_def?.length?1:0)+(this.buf.effond_def?.length?1:0)+(this.buf.absolute?.length?1:0)+(this.buf.nights?.length?1:0);
    // 編成パッシブのバースト寄与(全員のバーストに乗る永続効果)をCHAR_DEFから汎用合算。
    // 例: ARRIVE(エレイン3アシ・全光属性編成) = バーストダメ+20% & バーストプラス+50万。
    // 返り値 {dmg:バーストダメUP加算, flat:減衰外フラット加算}。キャラ名リテラルはエンジンに置かない。
    let passiveDmg=0, passiveFlat=0;
    for(const c of CHARS){ const p=CHAR_DEF[c].burstPartyPassive?.(this); if(p){ passiveDmg+=p.dmg||0; passiveFlat+=p.flat||0; } }
    // 概算バーストダメージ: absolute(バーストダメUP) + nights(敵バースト耐性DOWN≒バーストダメUP) + 編成パッシブ
    //   + sub_burst_dmg(アシスト由来・AnotherLink等。golden編成は0で不変)。
    const bdmg = (this.buf.absolute?.length||0)*DMG.burst_dmg_absolute
               + (this.buf.nights?.length||0)*DMG.burst_dmg_nights + passiveDmg + DMG.sub_burst_dmg;
    // バースト基準は通常攻撃ダメ。technicaはGEAR_K外のため_na()は自然にtechnica非含。
    const naB = this._na();
    // ロワ・クモンド: バーストプラス(独自枠・味方全体付与のため全員のバーストに加算・上限の外)
    const royBurst = this.buf.roy?.length ? naB*DMG.roy_burst_frac[this.roy_tier??0] : 0;
    // オーナー固有のバースト性能ボーナス(自バフ・CHAR_DEF.burstBonusに集約。例: ヤマト現神/奮起)
    const selfBonus = CHAR_DEF[owner].burstBonus?.(this) || 0;
    // バーストダメージ式: 通常攻撃ダメ(テクニカ除く) × (a + バーストダメUP効果 + 自バフ) + b(定数フラット)。
    // a/b はキャラ毎(CHAR_DEF[owner].def.burst_coef_a/b)。省略時 a=5 / b=2500。
    const coef_a = CHAR_DEF[owner].burst_coef_a ?? 5;
    const coef_b = CHAR_DEF[owner].burst_coef_b ?? 2500;
    const capBonus = (CHAR_DEF[owner].burstCapBonus?.(this) ?? 0) + DMG.sub_burst_cap;
    const core = this._decay('burst', naB*(coef_a + bdmg + GEAR.burst_dmg + selfBonus) + coef_b, DMG.decay_burst.cap1*(1+capBonus));
    this.dmg += core + royBurst + passiveFlat;
    if(atk) bset.add(owner);
    // キャラ固有のバースト時処理（CHAR_DEF記述子に集約）
    CHAR_DEF[owner].onBurst?.(this, atk, owner);
    // パーティ全体のバースト監視フック（モビウスムーンズ等・他キャラのバーストにも反応する機構）。
    // mburst(パーティバースト累計)の加算と5回毎のヘカテーCDリセットはヘカテーdefの onPartyBurst に集約。
    for(const c of CHARS) CHAR_DEF[c].onPartyBurst?.(this, owner, T, atk);
    return core; // D8: ストリーク基底用(バースト本体コアのみ・royBurst/passiveFlat/追加ダメ除く)
  }

  use(name, T, ord, note='') {
    this._naOwner = ownerOf(name); // _na()がアビ所有者のGEAR_K_Cを参照するよう設定
    const [,color,cd,cost]=ABIL[name];
    this.cd[name]=cd; if(cost) this.keigyo-=cost; T.ability++;
    // パーティ全体のアビ使用監視フック（テトラの連理魔力・エジソンのロボ反応・ナポレオン闘気等）。
    // ロボ作動反応(攻撃ロボ赤反応/補助ロボ黄反応・T.ra加算)もこのフック経由でエジソンdefに集約。
    for(const c of CHARS) CHAR_DEF[c].onAbility?.(this, name, color, T);
    ord.push({text:LABEL[name]+(note||''), color});
  }



  // 公開API: ロールアウト探索エンジンへ委譲
  takeTurn(t) {
    return this.greedyTakeTurn(t);
  }

  // ===== ロールアウト探索エンジン =====
  // 各ステップで「合法な候補アビ」を列挙し、実行時は候補ごとにcloneして
  // ターン完遂＋将来ROLL_LAターンをシミュレートし、目的関数で採点して最良を選ぶ。
  // 静的スコア(s)はロールアウト内の既定ポリシー＆同点時のタイブレークに用いる。
  // フェイズ概念は廃止。色順序は静的スコアの大小(黄>青>赤)で既定ポリシーが担保する。

  // 合法候補の列挙。各候補は {s:静的スコア, key:識別子, col:色, exec:適用関数}。
  // CHAR_REGISTRY[owner].cands[key] の定義を読み取って汎用的に生成する。
  // 新キャラ追加時はCHAR_REGISTRYのcandsにエントリを追加するだけでよい。
  _candidates(){
    const sim=this, T=this.T, ord=this.ord, bset=this.bset, t=this._t;
    const c=[];
    for(const key of ABIL_KEYS){
      if(sim.cd[key]!==0) continue;
      const kc=ABIL_KC[key];
      if(kc&&sim.keigyo<kc) continue;
      const cand=ABIL_CANDS[key];
      if(!cand) continue;
      if(cand.guard&&!cand.guard(sim,T,t)) continue;
      const col=ABIL[key][1];
      // variants: 1キーから複数の同CD候補を展開する（例: アルテミス1の部分消費＝消費量別tier）。
      // 各variantは独自key(合成・例 enchant_t3)を持ち _execKey で再生成・実行される。CDは exec 内の use(key) で共有。
      // 宣言キャラのみ・他キャラ/golden編成では cand.variants 不在＝従来の単一candと完全同一挙動。
      if(cand.variants){
        for(const v of cand.variants(sim,T,t))
          c.push({s:v.s, key:v.key, col, exec:()=>v.exec(sim,T,ord,bset,t),
                  deploysRobot:!!cand.deploysRobot, prelude:!!cand.prelude});
        continue;
      }
      const base=ABIL_BASE_S[key];
      const s=base!==null?base:cand.s(sim,T,t);
      const exec=cand.exec?()=>cand.exec(sim,T,ord,bset,t):()=>sim.use(key,T,ord);
      c.push({s,key,col,exec,deploysRobot:!!cand.deploysRobot,prelude:!!cand.prelude});
    }
    return c;
  }

  // 静的ポリシーで1ステップ実行（ロールアウト内の既定ポリシー）。候補が無ければfalse。
  // ホットパス（探索の~43%）。候補配列・クロージャを作らず ABIL_KEYS を1パス走査して
  // 最大s候補を直接実行する（reduce((a,b)=>b.s>a.s?b:a) と完全同一の「先頭最大」選択）。
  _stepStatic(){
    const sim=this, T=this.T, ord=this.ord, bset=this.bset, t=this._t;
    let bestKey=null, bestS=0, bestCand=null;
    for(const key of ABIL_KEYS){
      if(sim.cd[key]!==0) continue;
      const kc=ABIL_KC[key];
      if(kc&&sim.keigyo<kc) continue;
      const cand=ABIL_CANDS[key];
      if(!cand) continue;
      if(cand.guard&&!cand.guard(sim,T,t)) continue;
      const base=ABIL_BASE_S[key];
      const s=base!==null?base:cand.s(sim,T,t);
      if(bestKey===null||s>bestS){ bestKey=key; bestS=s; bestCand=cand; }
    }
    if(bestKey===null) return false;
    if(bestCand.exec) bestCand.exec(sim,T,ord,bset,t); else sim.use(bestKey,T,ord);
    return true;
  }

  // key一致の候補をクローン上で実行（exec内のthisはクローン）。
  _execKey(key){ const m=this._candidates().find(x=>x.key===key); if(m) m.exec(); }

  // リプレイモード用: CDチェックのみ行いguardをスキップして実行。実行した場合trueを返す。
  _execKeyNoGuard(key){
    if(this.cd[key]!==0) return false;
    const [owner]=ABIL[key]; const cand=CHAR_REGISTRY[owner]?.cands?.[key];
    if(!cand) return false;
    if(cand.exec) cand.exec(this,this.T,this.ord,this.bset,this._t);
    else this.use(key,this.T,this.ord);
    return true;
  }

  // 攻撃フェイズ: ゲージ100以上のキャラがバーストするだけ。アビリティ発動は一切なし。
  // procによるjudg arm（cd=0）は次ターンへ持ち越し。
  _attackPhase(){
    const atk=[]; let burstCoreTotal=0;
    for(const c of CHARS){
      if(this.g[c]>=FB_THR){ this.g[c]-=100; burstCoreTotal+=this.burst(c,this.bset,this.T,true); atk.push(c); }
    }
    // バーストストリーク(有志確定式): ストリークダメージ = バースト合計 × 属性補正 × 人数補正 × ダメージUP効果量。
    // バースト合計 = バースト本体コア合計(royBurst/passiveFlat/onBurst追加ダメは除外・D8ストリーク純化)。
    // 人数補正は参加人数依存・属性補正は中立1.0(affinity)・減衰は参加人数別cap(_decay('streak',raw,n))。
    const n=atk.length;
    if(n>=2){
      // マナポライト(アルテミス3): ストリークダメージ+2%/stack(buf不在で素の streak_dmgup＝golden不変)。
      const sdup=DMG.streak_dmgup+(this.buf.manapolite?.length||0)*DMG.streak_manapolite;
      const raw=burstCoreTotal*DMG.affinity*DMG.streak_count[n]*sdup;
      this.dmg += this._decay('streak', raw, n);
    }
    return atk;
  }

  // ターン終了時の状態更新（結果オブジェクトは作らない）。
  _endBookkeep(t){
    this.addG(CHARS, MACH_BG*this.T.ra);
    for(const c of CHARS) CHAR_DEF[c].turnEnd?.(this, this.T);
    if(t%4===0){ this.keigyo=Math.min(this.keigyo+5,KEIGYO_MAX); this.cum+=5; }
    // HELIX解禁の既達マーク(def.helix宣言キャラのみ・初回到達ターン検出用)
    for(const c of CHARS){ const h=CHAR_DEF[c].helix; if(h&&h.reached(this)) this[h.doneKey]=true; }
  }

  // 現在のターン状態から静的ポリシーで残りを完遂（クローン上で使用）。this._atkを設定。
  _finishStatic(){
    for(let i=0;i<300;i++){ if(!this._stepStatic()) break; }
    this._atk=this._attackPhase();
    this._endBookkeep(this._t);
  }

  // 目的関数: 現ターン(完遂済み)＋残り全ターンを評価し
  // [FB数, 総バースト, 総ジャッジ, 連理魔力, 累積契晶, 現在契晶] を返す（辞書式で大きいほど良い）。
  // 連理魔力・契晶を分離して各マイルストーン（HELIX解禁・pactcore使用可）を独立評価。
  _objective(t0){
    let fbTurns=(this._atk.length===5)?1:0;
    let totalBurst=this.T.burst;
    let totalJudg=this.T.ju;
    // C12-②: 定石性スコア(当該ターン・rollout前に捕捉。greedyTakeTurnのrolloutが this.T を上書きする前)。
    // 目的ベクトルの【最終要素】に置き、厳密同ダメージ(前要素すべて同値)のオーダー間でのみタイブレークする
    // ＝火力(第1要素 dmg)を1ポイントも削らずgolden不変のまま、表示を実機定石(バフ/デバフ先・ダメージ後)へ寄せる。
    const orth=this.T.orthodoxy||0;
    const la=this.totalTurns-t0;
    for(let k=1;k<=la;k++){
      const r=this.greedyTakeTurn(t0+k); // ロールアウトは planDepth>=2 で静的greedy
      if(r.atk.length===5) fbTurns++;
      totalBurst+=r.burst;
      totalJudg+=r.ju;
    }
    // マイルストーン汎用評価: 編成キャラが宣言した {状態変数キー: 上限} を合算。
    // 各変数は上限まで評価し超過分は追わない(例: renri30=テトラHELIX)。
    const renriObj = Object.entries(MILESTONES)
      .reduce((a,[k,cap])=>a+Math.min(this[k]??0,cap), 0);
    // 最上位目標は概算総ダメージ(ロールアウト終了時点の this.dmg 累積値)。
    // float 比較ノイズを避けるため整数化。以降は従来のFB/バースト系を補助指標として保持。
    return [Math.round(this.dmg), fbTurns, totalBurst, totalJudg, renriObj, this.cum, this.keigyo, orth];
  }

  // 先読みガードのキャッシュを一括計算し T['_la_'+key] に格納。
  // ビームクローンはTをコピーするため、ビーム開始前に1回呼べば全クローンに伝播する。
  _primeLookaheads(t){
    for(const [key,[owner]] of Object.entries(ABIL)){
      if(this.cd[key]!==0) continue;
      const cand=CHAR_REGISTRY[owner]?.cands?.[key];
      if(!cand?.lookahead) continue;
      if(this.T['_la_'+key]!==null) continue;
      const look=this.clone(); // planDepth+1 のクローンで評価（再帰深度+1）
      this.T['_la_'+key]=cand.lookahead(look,t);
    }
  }

  // ビームサーチ: beamW本の仮想シムを並列維持し最良アビ順序列を返す。
  // 各ステップで全候補をcloneして展開 → _finishStatic()+_objective()で採点 → 上位beamW保持。
  // 本ターン(planDepth=0)からのみ呼ばれBEAM_Wで探索する。ロールアウト(_objective)はビームを張らず静的greedy。
  // forcedPrefix: 探索開始前に強制実行するキー列(ルート分散ワーカーが異なる開幕を強制するために使う)。
  _beamSearch(beamW, forcedPrefix=[]){
    const evalEntry=e=>{
      const cl=e.sim.clone(); cl._finishStatic();
      // C12-案C: orthodoxy は _finishStatic 直後(=当該ターン完遂時点)に捕捉する。
      // _objective() は rollout で cl.T を翌ターン以降に上書きするため、その前に読む。
      e.orth=cl.T.orthodoxy||0;
      e.obj=cl._objective(this._t);
    };
    const seed=this.clone();
    for(const k of forcedPrefix) seed._execKey(k);
    let beam=[{sim:seed, keys:[...forcedPrefix], obj:null}];
    evalEntry(beam[0]);
    for(let step=0;step<300;step++){
      const next=[]; let anyLive=false;
      for(const entry of beam){
        const cands=entry.sim._candidates();
        if(!cands.length){ next.push(entry); continue; }
        anyLive=true;
        for(const cand of cands){
          const cl=entry.sim.clone(); cl._execKey(cand.key);
          const child={sim:cl, keys:[...entry.keys,cand.key], obj:null};
          evalEntry(child); next.push(child);
        }
      }
      if(!anyLive) break;
      next.sort((a,b)=>cmpVec(b.obj,a.obj));
      // C12-案C: 純ダメージ上位 beamW を全保持(=現状)。その上で、上位に入らなかった枝のうち
      // 定石性(orth)上位 BEAM_DIVERSITY_K 本を多様性枠として追加保護する(剪定で消さない)。
      // top は cmpVec 降順なので top[0]=最大ダメージ。extra は末尾に追加するため beam[0] は不変
      // (=純ダメージ最大)。∴ 最終選択は現状と同一以上(ダメージ単調)・golden は top 経路を必ず含む。
      const top=next.slice(0,beamW);
      if(BEAM_DIVERSITY_K>0 && next.length>beamW){
        const inTop=new Set(top);
        const extra=next.filter(e=>!inTop.has(e)).sort((a,b)=>(b.orth||0)-(a.orth||0)).slice(0,BEAM_DIVERSITY_K);
        beam=extra.length?top.concat(extra):top;
      } else beam=top;
    }
    return beam[0]?.keys??[];
  }

  greedyTakeTurn(t) {
    this._beginTurn(t);
    // planDepth=0: 本ターン(フルビーム) / >=2: ロールアウト(静的greedy)。
    // ※greedyTakeTurnはdepth0(実ターン)か_objective内のdepth>=2クローンからのみ呼ばれ、depth1は構造上発生しない。
    if(this.planDepth>=2){
      for(let i=0;i<300;i++) if(!this._stepStatic()) break;
    } else {
      this._primeLookaheads(t);
      // forcePrefix: ルート分散ワーカーが本ターン(t===_forceTurn)の開幕だけ強制する。
      // 内部ロールアウトのクローンには伝播しない(clone()がコピーしない独自フィールドのため)。
      const fp=(this.planDepth===0 && this._forcePrefix && t===this._forceTurn) ? this._forcePrefix : [];
      const keys=this._beamSearch(BEAM_W, fp);
      for(const key of keys) this._execKey(key);
    }
    const atk=this._attackPhase();
    const T=this.T, ord=this.ord;
    const rt=T.proc;
    // HELIX解禁(初回到達ターンのみtrue): def.helix 宣言キャラの閾値到達を汎用検出
    const helix=CHARS.some(c=>{ const h=CHAR_DEF[c].helix; return h&&h.reached(this)&&!this[h.doneKey]; });
    this._endBookkeep(t); // ここでhelix_done=trueに更新
    return {t,ord,atk,full:atk.length===5,burst:T.burst,ability:T.ability,ra:T.ra,ju:T.ju,
      mobius_this:T.mobius,rt,renri:this.renri,keigyo:this.keigyo,cum:this.cum,
      mooncode:this.mooncode,ycount:this.ycount,helix,droid:this.droid,banoshik_robot:this.banoshik_robot,
      dmg:this.dmg,gauge:{...this.g},state:this.snap()};
  }

  _beginTurn(t){
    this.tick();
    // クエスト開始時自動発動アシスト(テトラ1アシのspec+30%等)。tick後・T1のみ付与。
    if(t===1) for(const c of CHARS) CHAR_DEF[c].onBattleStart?.(this);
    this.T={ability:0,burst:0,proc:0,ra:0,tenya:0,
            ju:0,mobius:0,legend:0,pactcoreUsed:false,alone:0,knightsUsed:false,
            freyja_all:false,
            // C12-案C: 定石性スコア(ターンローカル・clone浅コピーで伝播)。ダメージ行動がバフ/デバフ
            // 有効中に撃たれた度合いを加点(報酬)。ビーム多様性枠の選抜キーのみに使い、_objectiveには入れない。
            orthodoxy:0};
    // lookaheadフックを持つアビのキャッシュスロットをnullで初期化（_primeLookaheadsで埋める）
    for(const [key,[owner]] of Object.entries(ABIL)){
      const cand=CHAR_REGISTRY[owner]?.cands?.[key];
      if(cand?.lookahead) this.T['_la_'+key]=null;
    }
    this.T.judgCap = JUDG_REACT + (this.cd.judg===0 ? 1 : 0);
    this.ord=[]; this.bset=new Set(); this._t=t;
  }

  snap(){
    const cs={}; for(const k of CHAR_SIM_STATE_KEYS) cs[k]=this[k];
    const buf={}; for(const k in this.buf) buf[k]=this.buf[k].slice();
    return{g:{...this.g},cd:{...this.cd},keigyo:this.keigyo,cum:this.cum,
      renri:this.renri,
      dmg:this.dmg,buf,...cs};
  }

  // 先読み/ロールアウト用の複製。planDepth+1 で深度管理し再帰を防ぐ。
  // ターン途中(this.T存在)ならターンローカル状態も複製し、続きをクローン上で完遂できるようにする。
  // Phase3-E: snap() を経由せず this から直接コピー（snap の中間オブジェクト生成と buf の二重 deep copy を排除）。
  // buf は配列を slice で独立化・CHAR_SIM_STATES はフラット数値のため値コピーで安全（aliasing は従来と同一）。
  clone(){
    const s=new Sim();
    s.g={...this.g}; s.cd={...this.cd};
    s.keigyo=this.keigyo; s.cum=this.cum; s.renri=this.renri; s.dmg=this.dmg;
    const buf={}; for(const k in this.buf) buf[k]=this.buf[k].slice(); s.buf=buf;
    for(const k of CHAR_SIM_STATE_KEYS) s[k]=this[k];
    s.totalTurns=this.totalTurns; s.planDepth=this.planDepth+1;
    if(this.T){ s.T={...this.T}; s.ord=this.ord.slice(); s.bset=new Set(this.bset); s._t=this._t; }
    return s;
  }
}

// 辞書式ベクトル比較: a>b なら正・a<b なら負・等しければ0
function cmpVec(a,b){
  for(let i=0;i<a.length;i++){ if(a[i]!==b[i]) return a[i]>b[i]?1:-1; }
  return 0;
}

// ルート分散(並列ワーカー)用: T1開幕の強制プレフィックス候補を汎用的に列挙する。
// ビーム本体のカット(BEAM_W)は「今すぐの価値が低いが後続の押し順次第で伸びる」候補
// (例: 補助ロボ起動→直後に黄アビ連打、のような複数手のシナジー)を early に切り落とすため、
// 候補ごとに開幕を強制した独立ビームを並列に走らせ、最終ダメージ最大のものを採用する。
// CHAR_REGISTRYの`deploysRobot`タグ(キャラ名リテラル不使用)を持つ候補同士は2手の順序組も列挙し、
// 同ターン複数ギミックの起動順シナジーも拾う。
// さらに`prelude`タグ(deploysRobot後に使うと火力を底上げするアビ)とのペア/3手順列も列挙する:
//   robot×prelude / prelude×robot / robot×robot×prelude
// タグは CHAR_REGISTRY cands に宣言するだけでエンジンにキャラ名リテラルなし。
function enumerateRootPrefixes(){
  const probe=new Sim(); probe.totalTurns=10;
  probe._beginTurn(1); probe._primeLookaheads(1);
  const cands=probe._candidates();
  const prefixes=[[]]; // 空プレフィックス=現行のビーム単体(回帰確認用に必ず含める)
  for(const c of cands) prefixes.push([c.key]);
  const robotKeys=cands.filter(c=>c.deploysRobot).map(c=>c.key);
  const preludeKeys=cands.filter(c=>c.prelude).map(c=>c.key);
  // deploysRobot × deploysRobot (2手順列)
  for(const a of robotKeys) for(const b of robotKeys) if(a!==b) prefixes.push([a,b]);
  // deploysRobot × prelude / prelude × deploysRobot (異種ペア)
  for(const r of robotKeys) for(const p of preludeKeys){ prefixes.push([r,p]); prefixes.push([p,r]); }
  // deploysRobot × deploysRobot × prelude (3手順列: ロボ2台起動→バフ)
  for(const a of robotKeys) for(const b of robotKeys) if(a!==b) for(const p of preludeKeys) prefixes.push([a,b,p]);
  return prefixes;
}

// ルート分散の1ルート実行: 開幕prefixを強制してnターン完遂し {prefix,dmg,rows} を返す。
// Worker側(タスク処理)とメインスレッドのフォールバック双方から呼ぶ唯一の実装(prefix強制の
// 手順をここに集約し二重管理を防ぐ)。rowsはgreedyTakeTurnの戻り値配列=構造化複製可能。
// Phase5-S1: onTurn(t) は各ターン完遂後に呼ばれる副作用専用フック(省略時=完全に従来通り＝戻り値不変)。
// Worker側は self.postMessage で進捗通知、フォールバックはUI更新に使う。本体に self/document 参照は置かない(slice不変条件)。
function _runRootPlan(prefix, n, onTurn){
  const sim=new Sim(); sim.totalTurns=n;
  if(prefix.length){ sim._forcePrefix=prefix; sim._forceTurn=1; }
  const rows=[]; for(let t=1;t<=n;t++){ rows.push(sim.greedyTakeTurn(t)); if(onTurn) onTurn(t); }
  return {prefix, dmg:sim.dmg, rows};
}

// 基準シム(静的greedyのみ・planDepth=2で強制): 対基準比の分母に使う総ダメージを返す。
function _runBaselinePlan(n, onTurn){
  const base=new Sim(); base.totalTurns=n; base.planDepth=2;
  for(let t=1;t<=n;t++){ base.greedyTakeTurn(t); if(onTurn) onTurn(t); }
  return base.dmg;
}

// 2段ルート選抜の安価proxy: 開幕prefixを強制したうえで全ターンを静的greedyで完遂し総ダメージを返す。
// ビーム不使用(planDepth>=2相当)のため1prefix≈数ms。ロールアウト(_objective)内の静的挙動と同一手順。
function _staticPrefixDmg(prefix, n){
  const sim=new Sim(); sim.totalTurns=n; sim.planDepth=2;
  for(let t=1;t<=n;t++){
    sim._beginTurn(t);
    if(t===1) for(const k of prefix) sim._execKey(k);
    for(let i=0;i<300;i++){ if(!sim._stepStatic()) break; }
    sim._attackPhase(); sim._endBookkeep(t);
  }
  return sim.dmg;
}

// ルート分散の2段絞り込み: enumerateRootPrefixes() の全候補を _staticPrefixDmg で安価に採点し、
// 上位 PREFIX_TOPK 本のみ本選(BW32)へ回す。空prefix(単一ビーム=回帰基準)は常に確保する。
// 静的proxyはビーム先読み利得を捉えないため単独では取りこぼすが、PoC実測で上位8確保なら
// 最大loss0.013%(押し順/火力指数グレードに不可視)。詳細は PERF_NOTES.md。
function _selectRootPrefixes(n){
  const all=enumerateRootPrefixes();
  if(all.length<=PREFIX_TOPK) return all;
  const scored=all.map(p=>({p, s:_staticPrefixDmg(p, n)}));
  scored.sort((a,b)=>b.s-a.s);
  const top=scored.slice(0, PREFIX_TOPK).map(x=>x.p);
  if(!top.some(p=>p.length===0)) top.push([]); // 空prefixは回帰基準として必ず含める
  return top;
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

// ===== Web Worker プール (Blob・ルート分散) =====
// ビームサーチ単体は「今すぐの価値が低いが後続の押し順次第で伸びる」候補(例: 補助ロボ起動の
// 直後に複数の黄アビを連打するシナジー)をBEAM_W幅のカットで早期に切り落としてしまう
// (詳細はCLAUDE.md「ビームのランキング」節)。これを安価に補うため、T1開幕の候補ごとに
// 開幕を強制した独立ビームサーチ(=ルート)を enumerateRootPrefixes() で汎用列挙し、
// navigator.hardwareConcurrency 分のWorkerプールに分散して並列実行、最終ダメージ最大の
// ルートを採用する。各ルートの実コストは従来の単体ビームと同等(~15s)なので、
// P並列なら ceil((K+1)/P)×15s 程度のライブ再計算時間で済む。
// Workerは {type:'init',...} で1回初期化後、{type:'root',...}/{type:'baseline',...} タスクを
// 受け取り次第処理して結果を返す(タスクキューはメインスレッドが管理)。
let _workerPool=null, _workerCodeCache=null;
// Phase5-S3: 中断フラグ。runSim/フォールバック開始時に false、cancelSim()で true。
// 遅延到着メッセージ・フォールバックループの停止判定に使う。
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
function _updateSimProgress(completedSteps, totalSteps, baselineTurn, startTime){
  const pct=totalSteps>0?Math.min(100,completedSteps/totalSteps*100):0;
  const fill=document.getElementById('sim-prog-fill');
  if(fill) fill.style.width=pct+'%';
  const bar=document.getElementById('sim-prog-bar');  // Phase5-S4: aria-valuenow を同期(読み上げ)
  if(bar) bar.setAttribute('aria-valuenow', Math.round(pct));
  // ターンチップ: 代表ルート(baseline=空prefix)の到達ターンまでを done 表示(計画 §5.2-2)
  const chips=document.getElementById('sim-prog-chips');
  if(chips) for(const c of chips.children){ c.classList.toggle('done', (+c.dataset.t)<=baselineTurn); }
  // ETA: 完了ステップあたり平均所要 × 残ステップ(計画 §5.2-3)
  const eta=document.getElementById('sim-prog-eta');
  if(eta && completedSteps>0){
    const elapsed=(performance.now()-startTime)/1000;
    const remain=Math.max(0,totalSteps-completedSteps)*(elapsed/completedSteps);
    eta.textContent=`経過 ${elapsed.toFixed(1)}s ・ 残り約 ${remain.toFixed(1)}s`;
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

  SIM_ROWS=[];
  _simCancelled=false;  // Phase5-S3: 新規探索開始でリセット

  // 既存プールを破棄して新規生成
  _terminateWorkerPool();

  const prefixes=_selectRootPrefixes(n); // 2段選抜: 静的proxyで上位PREFIX_TOPK本に絞る(品質劣化≤0.013%・PERF_NOTES.md)
  const poolSize=Math.max(1,Math.min(navigator.hardwareConcurrency||4, prefixes.length+1));

  // Phase5-S5: ESM worker(Viteがバンドル)。旧 slice+Blob 方式(_buildWorkerCode)は撤廃。
  // registry はモジュール共有のため serialize 不要。実行時設定のみ init メッセージで渡す。
  let workers;
  try{
    workers=Array.from({length:poolSize},()=>new Worker(new URL('./worker.js', import.meta.url), {type:'module'}));
  } catch(err){ _fallbackRunSim(heroKey,kamihimeKeys,n); return; }
  _workerPool=workers;

  const initMsg={type:'init',heroKey,kamihimeKeys,currentSubs:[...CURRENT_SUBS],gearState:{...GEAR},
    enemyState:{enemy_def:DMG.enemy_def,enemy_max_hp:DMG.enemy_max_hp},
    gearKC:{...GEAR_K_C},dmgBase:{base_atk:DMG.base_atk,affinity:DMG.affinity,
      streak_dmgup:DMG.streak_dmgup,
      droid_react_mult:DMG.droid_react_mult,droid_react_cap:DMG.droid_react_cap,
      edison_burst_extra_mult:DMG.edison_burst_extra_mult,edison_burst_extra_cap:DMG.edison_burst_extra_cap,
      betaia_mult:DMG.betaia_mult,betaia_cap:DMG.betaia_cap,
      napo_burst_cd_reduce:DMG.napo_burst_cd_reduce}};
  const tasks=prefixes.map((prefix,rootId)=>({type:'root',rootId,prefix,n}));
  tasks.push({type:'baseline',n});

  let nextTask=0, done=0; const total=tasks.length;
  const rootResults=[]; let baseDmg=0, failed=false;

  // Phase5-S2: per-turn 進捗(総ステップ=タスク数×n)。各Workerの{type:'progress'}を集計しバー/チップ/ETAを更新。
  const totalSteps=total*n; let completedSteps=0; const turnByRoot={}; const startTime=performance.now();
  _initSimProgress(n);

  function dispatch(w){ if(nextTask<total) w.postMessage(tasks[nextTask++]); }

  function onAllDone(){
    if(failed||_simCancelled) return;
    _workerPool=null;
    rootResults.sort((a,b)=>b.dmg-a.dmg);
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
        _updateSimProgress(completedSteps, totalSteps, turnByRoot['baseline']||0, startTime);
        return;
      }
      if(d.type==='rootResult') rootResults.push(d);
      else if(d.type==='baselineResult') baseDmg=d.baseDmg;
      done++;
      prog.textContent=`ルート ${done}/${total} 計算中(${poolSize}並列)…`;
      if(done>=total){ onAllDone(); return; }
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
    const prefixes=_selectRootPrefixes(n); // 本選と同じ2段選抜(フォールバックも上位PREFIX_TOPK本のみ)
    // Phase5-S2: 進捗(非並列は同期実行のためターン単位のライブ描画は不可＝ルート境界で更新)。
    const totalSteps=(prefixes.length+1)*n; let completedSteps=0; const startTime=performance.now();
    _initSimProgress(n);
    let best=null;
    let i=0;
    function nextRoute(){
      if(_simCancelled) return;  // Phase5-S3: 中断でフォールバックループ停止
      if(i<prefixes.length){
        prog.textContent=`ルート ${i+1}/${prefixes.length} 計算中(非並列フォールバック)…`;
        setTimeout(()=>{
          if(_simCancelled) return;
          const r=_runRootPlan(prefixes[i],n,()=>{ completedSteps++; });
          if(!best||r.dmg>best.dmg) best=r;
          i++;
          _updateSimProgress(completedSteps, totalSteps, 0, startTime);
          nextRoute();
        }, 0);
      } else {
        const baseDmg=_runBaselinePlan(n,()=>{ completedSteps++; });
        _updateSimProgress(completedSteps, totalSteps, n, startTime);
        _finishSim(best, baseDmg);
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
    <input class="hero-card" type="radio" name="hero-sel" id="hr-${k}" value="${k}" ${LEADER===k?'checked':''}>
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
          <div class="fp-label">神姫（順序で選択）</div>
          <div class="kslots">${slotsHtml}</div>
        </div>
        <div class="fp-section">
          <div class="fp-label">サブメンバー（アシスト効果のみ反映）</div>
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
      if (!takenElsewhere || k === cur) {
        sel.innerHTML += `<option value="${k}"${k === cur ? ' selected' : ''}>${v.jp}</option>`;
      }
    }
  });
}

// ===== 装備設定UI =====
function renderGearPanel(){
  const sumOpts = '<option value="none">-- なし --</option>'+
    Object.entries(SUMMON_REGISTRY).map(([k,v])=>`<option value="${k}">${v.jp}</option>`).join('');
  const summonRows = Array.from({length:SUMMON_SLOTS},(_,i)=>`
    <div class="gear-row">
      <span class="slot-num">幻獣${i+1}</span>
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
  const wpnRows = GEAR_BOXES.map(([k,jp])=>`
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
        <span class="wpn-lbl" style="margin-left:8px;">英霊ランク</span>
        <input type="number" id="hero-rank" value="165" min="1" max="300" step="1" style="width:65px">
      </div>
      <div class="gear-row" style="margin-bottom:8px;gap:12px;flex-wrap:wrap;">
        <span class="wpn-lbl">幻獣ATK合計</span>
        <input type="number" id="summon-atk-total" value="0" min="0" step="1" style="width:80px">
        <span class="wpn-lbl" style="margin-left:8px;">幻獣HP合計</span>
        <input type="number" id="summon-hp-total" value="0" min="0" step="1" style="width:80px">
        <span style="font-size:10px;color:var(--muted);">※編成画面のメイン+サブ幻獣の表示寄与合計</span>
      </div>
      <div class="gear-grid">
        <div>
          <div class="gear-sub">幻獣（${SUMMON_SLOTS}枠・重複可／ダメージ用）</div>${summonRows}
          <div class="gear-sub" style="margin-top:10px;">ウェポン（メイン1＋サブ9）</div>${weaponRows}
        </div>
        <div>
          <div class="gear-sub">追加補正（ウェポンマスタ外・各ボックス%）</div>${wpnRows}
          <div style="font-size:10px;color:var(--muted);margin-top:6px;">
            ※ウェポン選択でスキルを自動加算。未登録ウェポンは上欄に手動入力。<br>
            　上限UP系は第一上限を増加（区分線形減衰モデル実装済）。</div>
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
  let weaponAmp=0;
  const summonBoxes=[];
  for(let i=0;i<SUMMON_SLOTS;i++){
    const key=document.getElementById('summon-'+i)?.value;
    const s=SUMMON_REGISTRY[key]; if(!s) continue;
    weaponAmp+=s.weapon_amp||0; summonBoxes.push(s.box);
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
    for(const charKey of CHARS){
      // 実機表示の直接指定があれば最優先(Lv上限解放/+99等を0-fudgeで内包)。無ければ満凸decompose推定。
      const dispAtk=DISPLAY_ATK_OVERRIDE[charKey]||calcDisplayAtk(charKey,slots,sumAtkTotal,heroRank);
      // 実機表示HPの直接指定があれば最優先(ATKと対称)。無ければ満凸decompose推定。
      const dispHp=DISPLAY_HP_OVERRIDE[charKey]||calcDisplayHp(charKey,slots,sumHpTotal,heroRank);
      if(dispAtk>0){
        DISPLAY_ATK_C[charKey]=dispAtk;
        DISPLAY_HP_C[charKey]=dispHp;
        GEAR_K_C[charKey]=dispAtk*(1+GEAR.dmgup)*(1+GEAR.other)*DMG.misc/DMG.enemy_def; // affinityは_na()属性枠で加算/technicaはna_dmg枠へ移動済み
      }
    }
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
  for(let i=0;i<SUMMON_SLOTS;i++){ const el=document.getElementById('summon-'+i); if(el) el.value = slot.summon?.[i]||'none'; }
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
        <div class="cfg-title">💾 編成保存スロット（GitHub Gist同期）</div>
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
      <div class="cfg-title">💾 編成保存スロット（GitHub Gist同期）</div>
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
  Sim, buildFormation, applyGear, applyEnemy, recalcGearK,
  _runRootPlan, _runBaselinePlan, enumerateRootPrefixes, _selectRootPrefixes,
  GEAR, DMG, BG, GEAR_K_C, CHARS, ABIL, ownerOf, ELEM, LEADER, LABEL,
  RENRI_CAP, RENRI_MAX, TENYA_FROM, IFISHANT_MIN_CD,
  WEAPON_MASTER, SUMMON_REGISTRY, ENEMY_REGISTRY, CHAR_REGISTRY
};

// HTML の inline ハンドラ（onclick 等）はモジュール化でグローバルでなくなるため window へ橋渡し。
if (typeof window !== 'undefined') {
  Object.assign(window, {
    runSim, clearSim, cancelSim, toggleCard, toggleReplayPanel, runReplay,
    saveTokenAndInit, loadSlotById, overwriteSlotById, deleteSlotById, saveNewSlot, syncSlots
  });
}
