// Phase5 S5: SIM ENGINE（class Sim ＋ cmpVec ＋ ビーム/ルート探索）。詳細は VITE_MIGRATION.md。
// 定数は constants.js から、可変編成状態(CHARS/ABIL/CHAR_DEF/GEAR_K…)は app.js から import（循環・遅延参照で安全）。
import { DMG, BG, FB_THR, MACH_BG, KEIGYO_MAX, BEAM_W, PREFIX_TOPK, BEAM_DIVERSITY_K, JUDG_REACT } from './constants.js';
import { GEAR, GEAR_K, GEAR_K_C, CHARS, ABIL, ABIL_KEYS, ABIL_KC, ABIL_CANDS, ABIL_BASE_S, CHAR_DEF, ownerOf, MILESTONES, TICK_STATES, CHAR_SIM_STATES, CHAR_SIM_STATE_KEYS, LABEL, CHAR_REGISTRY } from './app.js';

// ===== SIM ENGINE =====
class Sim {
  constructor() {
    this.g=Object.fromEntries(CHARS.map(c=>[c,BG.other_max]));
    this.cd=Object.fromEntries(Object.keys(ABIL).map(k=>[k,0]));
    // エンジン共通変数（キャラ非依存）
    this.keigyo=4; this.cum=4; this.renri=0;
    // C23: judg(ジャッジメント)の3フェーズ循環(ph0敵全体/ph1バースト/ph2通常)は戦闘通算で連続する
    //   (ターン毎リセットではない・実機3/3裏取り sim02 c23_judg_phase_findings.md)。
    //   同ターン発動上限は別途 T.ju(毎ターン0リセット)が担う。フェーズは judgPhase%3。
    this.judgPhase=0;
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
    // バーストゲージ上昇量UP(汎用バフキー bg_gain_up・presence判定=非累積)。全ゲージ付与に一律乗算の近似。
    const a = this.buf.bg_gain_up?.length ? amt*(1+DMG.bg_gain_up) : amt;
    for(const c of targets){
      if(excl&&excl.has(c)) continue;
      this.g[c]=Math.min(this.g[c]+a, this.gmax[c]);
    }
  }

  grif(owner) {
    const gain = CHAR_DEF[owner].keigyoGain;
    this.keigyo=Math.min(this.keigyo+gain, KEIGYO_MAX);
    this.cum+=gain;
  }

  // 減衰(上限)モデル: 計算ダメージ raw → 実ダメージ。
  _naForAbi(){ const na=this._na(); const c1=DMG.decay_na.cap1*(1+(GEAR.na_cap||0)); return na>=c1?this._decay('na',na):na; }
  _droidAbiBuf(){ const n=this.buf.droid_buf?.length||0; return {dmg:n*DMG.abi_dmg_droid, cap:n*DMG.abi_cap_droid}; }
  // 汎用: ownerのバーストゲージを spent 消費し、アビ枠ダメージ(mult/cap)を加算して use(key) する。
  _spendGaugeAbi(key, spent, mult, cap, T, ord){
    const owner=ownerOf(key); this.g[owner]=Math.max(0, this.g[owner]-spent); this._naOwner=owner;
    const db=this._droidAbiBuf();
    this.dmg += this._decay('abi', this._naForAbi()*mult*(1+GEAR.abi_dmg+db.dmg), cap*(1+db.cap));
    this.use(key, T, ord, `(消費${spent})`);
  }

  _decay(frame, raw, base){
    const up = GEAR[frame+'_cap']||0;
    if(frame==='na'){
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
      // バーストストリーク減衰。base=参加人数(2〜5)。
      const d=DMG.decay_streak, cap=d.caps[base??5]||d.caps[5], c1=cap[0], c2=cap[1];
      if(raw<=c1) return raw;
      if(raw<=c2) return c1+(raw-c1)*d.slope1;
      return c1+(c2-c1)*d.slope1+(raw-c2)*d.slope2;
    }
    if(frame==='abi'){
      const c1=(base??Infinity)*(1+up);
      return raw<=c1 ? raw : c1+(raw-c1)*DMG.decay_abi_slope;
    }
    return Math.min(raw, (base??Infinity)*(1+up)); // hard: 寄与率0
  }

  // 概算通常攻撃ダメージ
  _na(){
    const D=DMG, b=this.buf, G=GEAR;
    const nAbs=b.absolute?.length||0, nPuv=b.puvoir?.length||0;
    const nBan=b.banoshik?.length||0, nLeg=b.legend?.length||0;
    const nPikeCrit=b.pike_crit?.length||0;
    const nPuvAcute=b.puvoir_acute?.length||0;  // プヴワール急所
    // ムーンコード自己バフ(ヘカテー2アシ)
    const mc = (ABIL.effond && this.mooncode>0 && this._naOwner===ownerOf('effond')) ? 1 : 0;
    // アサルト枠
    const fAslt = (this._naOwner && this['freyja_a_' + this._naOwner]) || 0;
    const aslt = nBan*D.assault_banoshik + nAbs*D.assault_absolute
               + (b.leg_aslt?D.assault_legend:0) + G.assault + fAslt;
    // 属性値枠
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
    // アリアンロッド2アビ(A5実機確定): 奇数回=味方全体(arian_spec/arian_acute)・偶数回=自分のみ(arian_*_self)。
    // self枠は _naOwner がアリアン自身(ownerOf('holy'))のときだけ適用。ABIL.holy 不在編成では arSelf=0 で無害
    // (?. で ownerOf 相当の ABIL['holy'][0] を安全参照＝arianrhod非編成の golden ホットパスを壊さない)。
    const arAcuteSelf=b.arian_acute_self?.length||0, arSpecSelf=b.arian_spec_self?.length||0;
    const arSelf = (arAcuteSelf||arSpecSelf) && this._naOwner===ABIL.holy?.[0] ? 1 : 0;
    // 急所枠: 光(puvoirはムーンコード時のみ/absolute/legend/pike_crit) + 装備
    const acute = nPuvAcute*D.acute_puvoir + nAbs*D.acute_absolute + nLeg*D.acute_legend
                + nPikeCrit*D.acute_pike_crit + (b.refine_acute?.length?D.acute_refine:0)
                + (b.arian_acute?.length||0)*D.acute_arian + arSelf*arAcuteSelf*D.acute_arian + G.acute;
    // 特殊攻撃枠: leg_spec(光) + omni(テトラ1アシ・光) + 装備
    const spec = (b.leg_spec?D.spec_legend:0)+(b.omni?.length?D.spec_omni:0)
               + (b.mobius_spec?.length||0)*D.spec_mobius
               + (b.arian_spec?.length||0)*D.spec_arian + arSelf*arSpecSelf*D.spec_arian
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

  // C19: use() の「帳簿部分だけ」を発火する（CD設定・契晶消費・ord表示は呼び出し側が独自に行うケース用）。
  // 天矢乱舞の再発動(tenya_re)が実機で赤アビ使用扱い＝アビ計数＋onAbility(ロボ反応・連理arcana proc)を
  // 受けるため使用。発火内容(_naOwner→T.ability++→CHARS走査 onAbility)は use() 本体と厳密一致させること。
  _countAbilityUse(name, color){
    this._naOwner = ownerOf(name);
    this.T.ability++;
    for(const c of CHARS) CHAR_DEF[c].onAbility?.(this, name, color, this.T);
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
        // nextは既にcmpVecでソート済みなため、top以外の要素は単にnext.slice(beamW)で取得可能です
        const extra=next.slice(beamW).sort((a,b)=>(b.orth||0)-(a.orth||0)).slice(0,BEAM_DIVERSITY_K);
        beam=extra.length?top.concat(extra):top;
      } else beam=top;
    }
    return beam[0]?.keys??[];
  }

  // forcedKeys!=null のときはビーム探索せず与えられたアビキー列をそのまま実行する（C16 持続化の
  // 決定的リプレイ用）。末尾の行組立は共通のため、返り値の行形状は通常探索と完全一致する。
  // 同一エンジン/overrideなら全キーが有効候補として同順再生され、変化時は _execKey が no-op で
  // skip→総ダメージ不一致となり呼び出し側の検証が破棄する（ヒント検証原則）。
  greedyTakeTurn(t, forcedKeys=null) {
    this._beginTurn(t);
    // planDepth=0: 本ターン(フルビーム) / >=2: ロールアウト(静的greedy)。
    // ※greedyTakeTurnはdepth0(実ターン)か_objective内のdepth>=2クローンからのみ呼ばれ、depth1は構造上発生しない。
    let usedKeys=null;
    if(forcedKeys){
      this._primeLookaheads(t);
      for(const key of forcedKeys) this._execKey(key);
      usedKeys=forcedKeys.slice();
    } else if(this.planDepth>=2){
      for(let i=0;i<300;i++) if(!this._stepStatic()) break;
    } else {
      this._primeLookaheads(t);
      // forcePrefix: ルート分散ワーカーが本ターン(t===_forceTurn)の開幕だけ強制する。
      // 内部ロールアウトのクローンには伝播しない(clone()がコピーしない独自フィールドのため)。
      const fp=(this.planDepth===0 && this._forcePrefix && t===this._forceTurn) ? this._forcePrefix : [];
      // this.beamW 未設定(既定)なら BEAM_W＝production 幅で完全不変(inert-by-default・golden影響なし)。
      // Phase7 PoC の「浅ビーム整合サロゲート」がオフラインで小さい幅を注入するためのフック(§6.5b)。
      const keys=this._beamSearch(this.beamW??BEAM_W, fp);
      for(const key of keys) this._execKey(key);
      usedKeys=keys.slice();  // 採用アビキー列を行へ保存（持続化キャッシュのリプレイ検証に使う）
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
      dmg:this.dmg,gauge:{...this.g},state:this.snap(),keys:usedKeys};
  }

  _beginTurn(t){
    this.tick();
    // クエスト開始時自動発動アシスト(テトラ1アシのspec+30%等)。tick後・T1のみ付与。
    if(t===1) for(const c of CHARS) CHAR_DEF[c].onBattleStart?.(this);
    this.T={ability:0,burst:0,proc:0,ra:0,tenya:0,
            ju:0,mobius:0,legend:0,pactcoreN:0,alone:0,knightsN:0,
            // C21: ifishant押下時点でクォータ消化済み(=実機CD中)だったエレインアビにのみ+1リキャスト枠。
            // 発動可能な状態のアビには+1しない(実機較正 2026-07-11・sim02試行2 T2#25 alone3回目不可)。アビ別フラット変数。
            ifAlone:0,ifLegend:0,ifPactcore:0,ifKnights:0,
            holy:0,elegant:0,  // アリアンロッド: 1アビ(ホーリーターボ)ターン内発動数/3アビ(エレガントルミナス)ターン内バースト数
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
      renri:this.renri,judgPhase:this.judgPhase,
      dmg:this.dmg,buf,...cs};
  }

  // 先読み/ロールアウト用の複製。planDepth+1 で深度管理し再帰を防ぐ。
  // ターン途中(this.T存在)ならターンローカル状態も複製し、続きをクローン上で完遂できるようにする。
  // Phase3-E: snap() を経由せず this から直接コピー（snap の中間オブジェクト生成と buf の二重 deep copy を排除）。
  // buf は配列を slice で独立化・CHAR_SIM_STATES はフラット数値のため値コピーで安全（aliasing は従来と同一）。
  clone(){
    const s=new Sim();
    s.g={...this.g}; s.cd={...this.cd};
    s.keigyo=this.keigyo; s.cum=this.cum; s.renri=this.renri; s.judgPhase=this.judgPhase; s.dmg=this.dmg;
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
  // C27 定石リファイン: 確定ルートに「赤アビは攻撃ロボ設置＋アンプリファ後に撃つ」局所改善を適用。
  // ビームのgreedyロールアウト近似が赤アビ前出しを選ぶ系統ミス(C27)を、実ルート上で厳密改善のみ採用して補正。
  const ref=_refineRoute(rows.map(r=>r.keys), n);
  if(ref.improved){ const rep=_replayResult(ref.turnsKeys, n); return {prefix, dmg:rep.dmg, rows:rep.rows}; }
  return {prefix, dmg:sim.dmg, rows};
}

// C27 定石リファイン（whole-route 局所改善・単調安全）: 確定した per-turn キー列に対し、各ターン内で
// 「攻撃ロボ設置(deploysRobot) or アンプリファ(prelude) より前に置かれた赤アビ(color 'r')」を、その最後の
// setup 直後へ移し、10T総ダメージが**厳密に増える時のみ**採用する。ビームの目的関数(将来ターンを静的greedyで
// 代理採点)は赤アビ前出しを damage-max と誤選択しうる(C27)が、実際の後続ターン(=このキー列)で replay 採点すると
// 赤アビ後出しの方がロボ反応＋ダメージプラス(+10万)分だけ高い。改善のみ採用のため golden/総ダメは単調非減少。
// タグ駆動(deploysRobot/prelude/色)でキャラ名リテラル不使用＝新キャラ/編成に自動追従。
function _refineRoute(turnsKeys, n){
  const redSet=new Set(ABIL_KEYS.filter(k=>ABIL[k]&&ABIL[k][1]==='r'));
  const setupSet=new Set(ABIL_KEYS.filter(k=>{ const c=ABIL_CANDS[k]; return c&&(c.deploysRobot||c.prelude); }));
  let cur=turnsKeys.map(a=>a.slice());
  let curDmg=_replayResult(cur, n).dmg;
  let improved=false;
  for(let ti=0; ti<n; ti++){
    let step=true;
    while(step){ step=false;
      const turn=cur[ti];
      let lastSetup=-1;
      for(let i=0;i<turn.length;i++){ if(setupSet.has(turn[i])) lastSetup=i; }
      if(lastSetup<0) break;
      for(let i=0;i<lastSetup;i++){
        if(!redSet.has(turn[i])) continue;
        const nt=turn.slice(); const [red]=nt.splice(i,1); nt.splice(lastSetup,0,red); // setup 直後へ移動
        const trial=cur.map((a,k)=>k===ti?nt:a);
        const d=_replayResult(trial, n).dmg;
        if(d>curDmg+1e-6){ cur=trial; curDmg=d; improved=true; step=true; break; }
      }
    }
  }
  return { turnsKeys:cur, dmg:curDmg, improved };
}

// 基準シム(静的greedyのみ・planDepth=2で強制): 対基準比の分母に使う総ダメージを返す。
function _runBaselinePlan(n, onTurn){
  const base=new Sim(); base.totalTurns=n; base.planDepth=2;
  for(let t=1;t<=n;t++){ base.greedyTakeTurn(t); if(onTurn) onTurn(t); }
  return base.dmg;
}

// C16 持続化: 保存済みの per-turn アビキー列(turnsKeys)を現行エンジンで決定的にリプレイし {dmg, rows} を返す。
// ビーム探索を張らず forcedKeys で確定再生するため n ターン≈数十ms(探索skip)。行形状は _runRootPlan と同一。
// ⚠ ダメージは押し順で決まり静的スコア override 非依存(override は探索の舵のみ)ため、リプレイ検証に override 設定は不要。
// 呼び出し側は現在の編成/ギア/敵(=configSig の対象)を buildFormation/applyGear 済みにしてから呼ぶこと。
function _replayResult(turnsKeys, n){
  const sim=new Sim(); sim.totalTurns=n;
  const rows=[]; for(let t=1;t<=n;t++){ rows.push(sim.greedyTakeTurn(t, turnsKeys[t-1]||[])); }
  return {dmg:sim.dmg, rows};
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


export { Sim, cmpVec, enumerateRootPrefixes, _runRootPlan, _runBaselinePlan, _staticPrefixDmg, _selectRootPrefixes, _replayResult, _refineRoute };
