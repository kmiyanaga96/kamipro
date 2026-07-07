import { DMG, BG, RENRI_CAP, RENRI_MAX, TENYA_FROM, IFISHANT_MIN_CD } from '../src/constants.js';
import { GEAR, CHARS, ABIL, ownerOf, ELEM, LEADER, LABEL } from '../src/app.js';
const DEBUFF_KEYS = new Set(['consort_def', 'divinus_def', 'effond_def', 'nights', 'divinus_dot']);
const buffCount = sim => Object.entries(sim.buf).reduce((a,[k,v])=>a+(DEBUFF_KEYS.has(k)?0:v.length),0);

// ⚠ ロード順の不変条件: data/*.js は index.html のインライン定数(BG/DMG/GEAR)より「前」に読み込まれる。
// そのため【オブジェクトリテラルの即時評価フィールド】(例: gmax)に BG/DMG/GEAR を参照してはならない
// (= ReferenceError でファイル全体が落ち、CHAR_REGISTRY 未定義→UI全消失する)。
// 関数本体(cands.exec / def フック)内での DMG/BG/GEAR 参照は「遅延評価」のため安全(シム実行時に解決)。
// 即時フィールドのゲージ上限は素の数値で持つ: 100=BG.other_max / 200=BG.yamato_max。
const CHAR_REGISTRY = {
  // ─── state フィールドの規約 ──────────────────────────────────────────
  // キャラ固有のバトル持続状態変数をここに宣言する（初期値付き）。
  // buildFormation() が CHAR_SIM_STATES に集約し、Sim の constructor/snap/clone が
  // 自動的に管理する。新キャラ追加時はこのフィールドを追加するだけでよい。
  // エンジン共通変数（renri/mooncode/mburst/keigyo/cum）はここに含めない。
  // ─────────────────────────────────────────────────────────────────────
  edison: {
    type: 'hero',
    jp: 'エジソン', gcls: 'ge', elem: null,
    favWeapon: ['銃','魔導具'], lvUpAtk: 400,
    state: { droid: 0, banoshik_robot: 0, ycount: 0 },  // droid: 攻撃ロボ残T / banoshik_robot: 補助ロボ残T / ycount: 黄アビ累計
    tickStates: ['droid', 'banoshik_robot'],  // 毎ターン自動デクリメント(ロボ残T)
    abilities: {
      droid:    ['y', 8, 0],
      banoshik: ['y', 8, 0],
      ifishant: ['y', 5, 0],
      amplifa:  ['y', 7, 0],
    },
    labelSuffix: {},
    cdShow: { banoshik:"バノーシク", droid:"ドロイド", ifishant:"イフィシャント", amplifa:"アンプリファ" },
    // cands: 各アビリティの候補登録。{s:優先スコア(数値or関数), guard?:(sim,T,t)=>bool, exec?:(sim,T,ord,bset,t)=>void}
    // exec省略時はデフォルト: sim.use(key,T,ord)
    cands: {
      droid:    { s:201, atkBuf:true, deploysRobot:true, exec:(sim,T,ord)=>{ sim.droid=3; sim.use('droid',T,ord); }},
      banoshik: { s:200, atkBuf:true, deploysRobot:true, exec:(sim,T,ord)=>{ sim.banoshik_robot=3; sim.use('banoshik',T,ord); }},
      // アンプリファ: 効果3T・エジソンの攻撃ロボ反応ダメージに固定+10万(use()のロボ反応点で加算)。
      // prelude:true = ロボ起動後に打つと攻撃ロボ反応の全ヒットを底上げするためルート列挙対象。
      amplifa:  { s:180, atkBuf:true, prelude:true, exec:(sim,T,ord)=>{ (sim.buf.amplifa_buf??=[]).push(DMG.dur_amplifa); sim.use('amplifa',T,ord); }},
      // スコアは(CD中アビ数)²: count=4→16(低),count=8→64(effond直前),count=10→100(高)
      // 多くのアビがCD中のターンで自然に高優先度になり、T1序盤の空打ちを回避する。
      // guard: CD中アビが IFISHANT_MIN_CD 個未満の間は使用不可(空打ち=機会損失を防ぐハード下限)。
      // ビーム目的関数は総ダメージ駆動でスコアより優先するため、早撃ち抑止にはガードが必須。
      // 検証(edison+光4): 下限1→総8.77M / 下限2〜4→総9.52M(最適plateau)。中央値3を採用。
      ifishant: { s:(sim)=>{ const ct=Object.keys(sim.cd).filter(k=>k!=='ifishant'&&sim.cd[k]>0).length; return ct*ct; },
                  guard:(sim)=>{
                    if(sim._t < 2) return false;
                    const ct = Object.keys(sim.cd).filter(k=>k!=='ifishant'&&sim.cd[k]>0).length;
                    if(ct < IFISHANT_MIN_CD) return false;
                    for(const key of Object.keys(ABIL)){
                      if(key==='ifishant') continue;
                      if(sim.cd[key]===0){
                        const owner = ABIL[key][0];
                        const cand = CHAR_REGISTRY[owner]?.cands?.[key];
                        if(cand && (!cand.guard || cand.guard(sim, sim.T, sim._t))){
                          if(ABIL[key][2]>=2) return false;
                        }
                      }
                    }
                    return true;
                  },
                  exec:(sim,T,ord)=>{ for(const k of Object.keys(sim.cd)) if(k!=='ifishant'&&sim.cd[k]>0) sim.cd[k]--; sim.use('ifishant',T,ord); }},
    },
    def: {
      burst_coef_a: 5, burst_coef_b: 3000,  // エジソン: a=5.0 b=3000
      gmax: 100,  // =BG.other_max（即時評価のためリテラル。ロード順不変条件・冒頭注記参照）
      keigyoGain: 3,
      // ロボ作動反応(エジソン固有): 全キャラのアビ使用毎に発火。攻撃ロボ(droid)=赤アビ反応 / 補助ロボ(banoshik_robot)=黄アビ反応。
      // 旧 Sim.use() のハードコードを移管。_naOwner は use() で発動アビ所有者に設定済のため反応ダメージ基準は不変。
      onAbility: (sim, name, color, T) => {
        if(color==='r' && sim.droid>0){
          T.ra++;
          // 攻撃ロボ反応: 赤アビ発動毎に敵全体へ反応ダメージ＋味方全体アビダメバフ付与(累積可)。
          // アンプリファ(3T): ロボ反応ダメージに固定+10万フラット加算(減衰外・ロボ反応のみ対象)。
          const ampFlat = sim.buf.amplifa_buf?.length ? DMG.amplifa_flat : 0;
          sim.dmg += sim._decay('abi', sim._naForAbi()*DMG.droid_react_mult, DMG.droid_react_cap) + ampFlat;
          (sim.buf.droid_buf??=[]).push(DMG.dur_droid_buf);
        }
        // バノーシク: 補助ロボ作動中の黄アビ毎にアサルトバフを独立付与(上限なし累積・各 dur_banoshik 持続)
        if(color==='y' && sim.banoshik_robot>0){ T.ra++; (sim.buf.banoshik??=[]).push(DMG.dur_banoshik); }
      },
      onBurst: (sim, atk) => {
        if(atk){ sim.cd.droid=Math.max(0,sim.cd.droid-1); sim.cd.banoshik=Math.max(0,sim.cd.banoshik-1); }
        // 英霊武器バースト追加ダメージ(ランチャータンクメイン時のみ有効・mult=0でOFF)
        // 英霊武器バースト追加ダメージ: アビ枠(有志確定)
        if(DMG.edison_burst_extra_mult > 0)
          sim.dmg += sim._decay('abi', sim._na()*DMG.edison_burst_extra_mult, DMG.edison_burst_extra_cap);
      },
      turnEnd: (sim) => { if(sim.cum>=80) sim.addG([LEADER],20); },
    },
  },

  yamato: {
    type: 'kamihime',
    jp: '[光醒の現神]ヤマトタケル', shortJp: 'ヤマト', gcls: 'gy', elem: 'light',
    favWeapon: ['剣','槍'], baseAtk: 10000, baseHp: 1100,
    // inori_p=現神の祈りの天矢乱舞解禁タイマー / yellow_acc=黄アビ累計(ターン跨ぎ・永続)
    // funki_recasts=同ターンの大和の奮起 即時解禁回数(0〜3・毎ターンリセット) / funki_carryover=4回目契機の翌ターン頭復活予約
    state: { inori_p: null, yellow_acc: 0, funki_recasts: 0, funki_carryover: false },
    abilities: {
      inori: ['y', 14, 0],
      tenya: ['r', 12, 0],
      funki: ['y', 5, 0],
      // 天矢乱舞 再発動(C12-④b): 探索が3発の間に他アビを挟めるよう「初回tenya」と分離した独立候補。
      // cd=0/cost=0。実体は40消費の追加バースト(sim.use非経由＝アビ計数・onAbilityを増やさない＝旧atomic挙動と同一)。
      tenya_re: ['r', 0, 0],
    },
    labelSuffix: { inori:'(ヤ+100)', funki:'(+10)' },
    cdShow: { inori:"現神の祈り", tenya:"天矢乱舞", funki:"大和の奮起", tenya_re:"天矢乱舞(再)" },
    cands: {
      funki: { s:150, atkBuf:true, partyBG:true, exec:(sim,T,ord)=>{ sim.ycount++; sim.addG(CHARS,BG.funki);
        // 大和の奮起: ヤマト自身のバースト性能UP(+15%/上限+10%・3T累積可) → burstBonusで参照
        (sim.buf.funki_burst??=[]).push(DMG.dur_funki_burst);
        if(sim.ycount%3===0) sim.cd.inori=Math.max(0,sim.cd.inori-1); sim.use('funki',T,ord); }},
      // 現神の祈り: 自分ゲージ+100 ＋ バースト性能大幅UP(倍率5→10・3T・burstBonusで参照) ＋ 2T後に天矢乱舞解禁。
      // 旧版はFB可否のlookaheadガードで実質発火しなかったが、本体は純火力(バースト倍率2倍)のためガード撤廃。
      // CD14で実質1回・最適化器(ビーム/ルート分散)に開幕タイミングを委ねる。
      inori: { s:160, atkBuf:true,
        exec:(sim,T,ord)=>{ sim.addG([ownerOf('inori')],BG.inori); sim.inori_p=0;
          (sim.buf.inori_burst??=[]).push(DMG.dur_inori_burst); sim.use('inori',T,ord); }},
      // 天矢乱舞: ゲージ消費なしでバースト(初回1発)。+40消費で2回まで再発動(最大3回)＝別候補 tenya_re。
      // inoriが2T後にCDリセットして解禁する。旧版はg<100ガードで実質発火しなかった(全員毎ターン100開始)。
      // C12-④b: 旧実装は while で3発を atomic 一括発火していたが、探索が3発間に他アビを挟めず最適を取りこぼしていた
      // (実測+12%)。初回tenya(本候補)＋再発動(tenya_re)へ分割し interleave 可能化。本候補は cd を設定する初回のみ。
      tenya: { s:90, burstTrigger:true,
        guard:(sim,T,t)=>t>=TENYA_FROM,
        exec:(sim,T,ord,bset)=>{
          const me=ownerOf('tenya');
          sim.use('tenya',T,ord); sim.burst(me,bset,T); T.tenya=1;
        }},
      // 天矢乱舞 再発動(C12-④b): 初回tenya後に T.tenya<3 かつ g>=40 で発動可。40消費＋追加バースト。
      // sim.use は呼ばず(=アビ計数/onAbility/CD設定なし＝旧atomic re-fireと同一挙動)、ord へ専用エントリを push。
      // cd=0 のまま guard(T.tenya<3) で同ターン最大2回に頭打ち。T.tenya はターン頭に0初期化(T init)。
      // refireOf/refireSuffix: リプレイ往復用の宣言。この候補は sim.use 非経由で「初回tenyaのラベル＋接尾辞」
      // を表示チップに出すため、末尾()剥がしのトークン照合では別キー(tenya)へ化ける。buildReplayNameMap が
      // ここから完全一致「ヤマト2(再-40)」→tenya_re を登録し、表示は変えずに正しく往復させる(exec の push と一致必須)。
      tenya_re: { s:90, burstTrigger:true, refireOf:'tenya', refireSuffix:'(再-40)',
        guard:(sim,T,t)=>(T.tenya||0)>=1 && (T.tenya||0)<3 && sim.g[ownerOf('tenya')]>=40,
        exec:(sim,T,ord,bset)=>{
          const me=ownerOf('tenya');
          sim.g[me]-=40; sim.burst(me,bset,T); T.tenya++;
          ord.push({text:`${LABEL.tenya}(再-40)`,color:'r'});
        }},
    },
    def: {
      burst_coef_a: 5, burst_coef_b: 2500,  // ヤマト: a=5.0 b=2500
      gmax: 200,  // =BG.yamato_max（即時評価のためリテラル。ロード順不変条件・冒頭注記参照）
      keigyoGain: 1,
      // バースト効果: 味方全体の光属性攻撃+5%(3T累積可)。自バースト毎にスタック(天矢乱舞の複数発動も各々付与)。
      onBurst: (sim) => {
        (sim.buf.yamato_elem??=[]).push(DMG.dur_yamato_elem);
        // 追加ダメージ: ヤマト固有・現神の祈り中のみ発動(スクショ確定: 3倍/50万・アビ枠)。
        if((sim.buf.inori_burst?.length||0)>0)
          sim.dmg += sim._decay('abi', sim._na()*DMG.burst_followup_mult, DMG.burst_followup_cap);
      },
      // 1アシ(集いし願い): バーストダメージプラス(+10万/stack)は【味方全体】のバーストが対象(C8・実機確定)。
      // 全員のバーストに乗るため burstPartyPassive(=全バースト共通の減衰外フラット加算・index.html burst())に集約。
      // yamato_bplus は onAbility(ヤマトのアビ使用毎)でpush・3T累積。旧実装はyamato自バーストのみ加算する誤りだった。
      burstPartyPassive: (sim) => { const n=sim.buf.yamato_bplus?.length||0; return n?{flat:n*DMG.bplus_yamato}:null; },
      // 自バースト性能バフ(現神の祈り倍率UP＋大和の奮起累積)をオーナー限定で burst係数に加算。
      burstBonus: (sim) => (sim.buf.inori_burst?.length?DMG.burst_inori:0)
                         + (sim.buf.funki_burst?.length||0)*DMG.burst_funki,
      // 大和の奮起: バースト上限+10%/stack(自分のみ・burstCapBonusフック)
      burstCapBonus: (sim) => (sim.buf.funki_burst?.length||0)*DMG.burst_cap_funki,
      // 1アシ(集いし願い): ① ヤマトがアビリティを使用した時にバーストダメージプラスバフを付与(3T累積可)。
      // ② 黄色アビの使用回数をターンを跨いで集計し、4回毎に大和の奮起を「使用可能」にする(最大3回=12回時点)。
      //    3回使用可能にした後さらに4回(計16)使用すると、ターン終了時に集計を初期化し再度使用可能になる(ループ)。
      //    黄アビ累計 yellow_acc は【ターン跨ぎで持ち越し】、4回毎(=黄アビ4回)に大和の奮起を解禁する。
      //    同ターン最大3回まで即時解禁(funki_recasts・毎ターンリセット)、4回目以降の解禁契機は翌ターン頭で1回復活
      //    (funki_carryover→turnEndで反映=実機バグ挙動・ユーザー実機確認 2026-07-02)。C14/C15。
      onAbility: (sim, name, color) => {
        if(ABIL[name]?.[0]==='yamato') (sim.buf.yamato_bplus??=[]).push(DMG.dur_bplus_yamato);
        if(color==='y'){
          sim.yellow_acc++;
          if(sim.yellow_acc % 4 === 0){
            if(sim.funki_recasts < 3){ sim.funki_recasts++; sim.cd.funki = 0; }  // 同ターン最大3回まで即時
            else sim.funki_carryover = true;                                     // 4回目契機は翌ターン頭へ
          }
        }
      },
      // 1アシ再発動: 同ターン即時解禁カウント funki_recasts は毎ターンリセット。yellow_acc(黄アビ累計)はリセットしない。
      // funki_carryover(4回目契機)が立っていれば翌ターン頭で funki CD=0 に復活させる(実機バグ挙動)。
      // 天矢乱舞解禁(現神の祈り): inori_p は解禁タイマー。現神の祈り使用で0に、2ターン後に天矢乱舞CDをリセット(解禁)。
      // 旧 Sim._endBookkeep() のハードコードを移管(keigyo+5 と独立のため順序前倒し無害)。
      turnEnd: (sim) => {
        sim.funki_recasts = 0;
        if(sim.funki_carryover){ sim.cd.funki = 0; sim.funki_carryover = false; }
        if(sim.inori_p!=null){ sim.inori_p++; if(sim.inori_p===2){ sim.cd.tenya=0; sim.inori_p=null; } }
      },
    },
  },

  hecate: {
    type: 'kamihime',
    jp: '[愛情と友情]ヘカテー', shortJp: 'ヘカテー', gcls: 'gh', elem: 'light',
    favWeapon: ['杖','魔導具'], baseAtk: 7800, baseHp: 1850,
    // mobius_bcount: ヘカテー自身のバースト累計(4回毎に特殊攻撃UP) / mooncode: ムーンコード残T / mburst: パーティバースト累計(モビウス5回毎にCDリセット)
    // moon_acc: ヘカテー自身のアビ使用回数の戦闘通算(C18実機仕様: 12回毎にムーンコード再発動・累積カウンタは残らない周期制)
    // mooncode初期0: 戦闘開始発動は onBattleStart(tick後・T1のみ)で2を付与＝T1,T2の2ターンをカバー。
    // constructor初期値2だとT1頭のtickで-1されT2で切れる(実機はT2もON=sim02試行2 T2#12/#13 judg成立が証拠)。
    state: { mobius_bcount: 0, mooncode: 0, mburst: 0, moon_acc: 0 },
    tickStates: ['mooncode'],  // ムーンコード残Tを毎ターン自動デクリメント
    abilities: {
      puvoir: ['y', 2, 0],
      effond: ['r', 3, 0],
      sleur:  ['y', 3, 0],
    },
    labelSuffix: { sleur:'(+15)' },
    cdShow: { puvoir:"プヴワール", effond:"エフォンド", sleur:"スリール" },
    cands: {
      // モビウスムーンズ最適化: 発動まで3バースト以内(mburst%5>=2)は最高優先。
      // バースト誘発系アビより先に使い切ることで、リキャストを有効活用する。
      // puvoir: 上限なしで独立累積(各スタックが dur_puvoir ターン持続)。光属性攻撃UP(無条件)。
      // 急所攻撃確率UPは「ムーンコード発動時のみ追加」(累積可)→ puvoir_acuteへ別管理(mooncode時のみpush)。
      puvoir: { s:(sim)=>sim.mburst%5>=2?9999:140, atkBuf:true, exec:(sim,T,ord)=>{
                  (sim.buf.puvoir??=[]).push(DMG.dur_puvoir);
                  if(sim.mooncode>0) (sim.buf.puvoir_acute??=[]).push(DMG.dur_puvoir);
                  sim.use('puvoir',T,ord); }},
      // スリール: 防壁(累積可・3T)＋リジェネ＋BG。防壁はbuffCount精度用にbuf計上(ダメージ無寄与)。
      sleur:  { s:(sim)=>sim.mburst%5>=2?9999:140, atkBuf:true, partyBG:true, exec:(sim,T,ord)=>{
                  (sim.buf.sleur_def??=[]).push(DMG.dur_sleur_def); sim.addG(CHARS,BG.sleur); sim.use('sleur',T,ord); }},
      // エフォンド: 敵全体に光属性ダメージ(3倍/35万・アビ枠)＋攻撃防御DOWN(10%/stack・最大40%・6T累積可)。
      // ムーンコード発動時のみ即座にゲージ消費なしでバースト発動(burstはmooncode条件・ダメ/DOWNは常時)。
      effond: { s:70, burstTrigger:true,
                exec:(sim,T,ord,bset)=>{ const db=sim._droidAbiBuf();
                  // C18r2: ムーンコード判定は押下時点の状態で行う(実機=アビ終了後にmoon_acc判定のため、
                  // 12回目押下がeffond自身の場合その押下のバーストには効かない。use()フックがmooncodeを
                  // 立てる前にここで捕捉する)。
                  const mcAtPress = sim.mooncode>0;
                  sim.dmg += sim._decay('abi', sim._naForAbi()*DMG.effond_mult*(1+GEAR.abi_dmg+db.dmg), DMG.effond_cap*(1+db.cap));
                  // C12-案C: 定石性報酬 — divinus(防御DOWN)先行中にeffondを撃てたら加点(divinus→effondの定石・ランキング用のみ)。
                  T.orthodoxy=(T.orthodoxy||0)+(sim.buf.divinus_def?.length?1:0);
                  (sim.buf.effond_def??=[]).push(DMG.dur_effond_def);
                  sim.use('effond',T,ord);
                  if(mcAtPress) sim.burst(ownerOf('effond'),bset,T); }},
    },
    def: {
      burst_coef_a: 5, burst_coef_b: 2500,  // ヘカテー: a=5.0 b=2500
      gmax: 100,  // =BG.other_max（即時評価のためリテラル。ロード順不変条件・冒頭注記参照）
      keigyoGain: 1,
      // ムーンコード(ヘカテー2アシ・C18実機較正 2026-07-07): 「戦闘開始時または自分がアビリティ12回使用する毎に発動・持続2T」。
      // カウントはヘカテー自身のアビのみ・戦闘通算(moon_acc)。判定は**アビ終了後**(C18r2実機仕様)＝12回目の
      // 押下自身には効かず、同一ターンの後続ヘカテーアビから有効(effond側はmcAtPressで押下時点の状態を捕捉)。
      // 旧実装(パーティ全体T.ability%12・毎ターンリセット)は誤り＝実質常時ONとなり実機のON/OFF交互パターン
      // (sim02試行1 raw: T4/T6ヘカテー2バースト無し)を再現できなかった。根拠 CALIBRATION_ANALYSIS.md C18。
      onAbility: (sim, name, color, T) => {
        if(ABIL.puvoir && ownerOf(name)===ownerOf('puvoir')){
          sim.moon_acc++;
          if(sim.moon_acc%12===0) sim.mooncode=2;
        }
      },
      // 戦闘開始時発動(持続2T=T1,T2)。_beginTurnはtick→onBattleStartの順のためT1のtickに食われない。
      onBattleStart: (sim) => { sim.mooncode=2; },
      // モビウスムーンズ(ヘカテー固有): パーティバースト5回毎にヘカテー自身の全アビCDをリセット。
      // 旧 Sim.burst() のハードコードを移管。mburst の加算(累積)も含めヘカテー側で完結。
      // mburst++ を %5 判定の前に置くことで旧エンジン(burst()の加算→判定)と同順序を保持。
      onPartyBurst: (sim, owner, T, atk) => {
        sim.mburst++;
        if(ABIL.puvoir && sim.mburst%5===0){
          const ho=ownerOf('puvoir');  // =ヘカテー(自キー参照)
          for(const k of Object.keys(ABIL)) if(ownerOf(k)===ho) sim.cd[k]=0;
          T.mobius=(T.mobius||0)+1;
        }
      },
      // バースト効果: ムーンコード発動時、追加ダメージ(倍率3倍・減衰50万・アビ枠)。自バーストのみ(onBurst)。
      onBurst: (sim) => {
        if(sim.mooncode>0)
          sim.dmg += sim._decay('abi', sim._na()*DMG.hecate_extra_mult, DMG.hecate_extra_cap);
        // モビウスムーンズ: ヘカテー自身のバースト4回毎に光属性キャラの特殊攻撃+5%(4T累積可)を付与。
        sim.mobius_bcount = (sim.mobius_bcount||0)+1;
        if(sim.mobius_bcount % DMG.mobius_burst_cycle === 0)
          (sim.buf.mobius_spec??=[]).push(DMG.dur_mobius);
      },
    },
  },

  tetra: {
    type: 'kamihime',
    jp: '[HELIX]テトラ', shortJp: 'テトラ', gcls: 'gt', elem: 'light',
    favWeapon: ['杖','魔導具'], baseAtk: 10110, baseHp: 1100, lvCap: 90, // Lv90解放(+3900 ATK)
    state: { helix_done: false, helix_abil_used: false },  // HELIX解禁済み / 使用済み
    abilities: {
      judg:     ['r', 10, 0],
      absolute: ['y', 10, 0],
      divinus:  ['b', 10, 0],
      helix:    ['y', 10, 0],  // テトラ4: [HELIX]テトラ / 連理魔力30以上・戦闘中1回のみ
    },
    labelSuffix: { absolute:'(+20)' },
    cdShow: { judg:"ジャッジメント", absolute:"アブソ", divinus:"ディウィヌス", helix:"HELIX" },
    cands: {
      // judg動的スコア: deploysRobot候補がCD=0で未起動なら低スコア(ロボ先行を_stepStaticで優先)。
      // ロボ起動後はdroid_buf/banoshikがjudg ph0ダメージに乗るため起動順に依存する(use()内でbuf積後に即参照)。
      judg:     { s:(sim,T)=>{ if(T.ju>=T.judgCap) return 0;
        const robotReady=Object.entries(ABIL).some(([k])=>CHAR_REGISTRY[ABIL[k][0]]?.cands?.[k]?.deploysRobot&&sim.cd[k]===0);
        return robotReady ? 30 : 80; }, guard:(sim,T)=>T.ju<T.judgCap,
                  exec:(sim,T,ord,bset)=>{ const ph=T.ju%3; sim.use('judg',T,ord); T.ju++;
                    // ジャッジ循環: ph0=敵全体10回ダメージ / ph1=バースト発動 / ph2=通常攻撃
                    if(ph===0){ const royAbi=sim.buf.roy?.length ? 10*sim._na()*DMG.roy_abi_frac[sim.roy_tier??0] : 0;
                      // アビダメ枠: ×(1+abi_dmg+droid)、1ヒット減衰 基準judg_cap×(1+droid)(超過は1/25で逓減)
                      // amplifa(+10万)はロボ反応ダメージ専用のためジャッジには加算しない。
                      const db0=sim._droidAbiBuf();
                      const hit=sim._decay('abi', sim._naForAbi()*DMG.judg_mult*(1+GEAR.abi_dmg+db0.dmg), DMG.judg_cap*(1+db0.cap));
                      sim.dmg += 10*hit + royAbi;
                      // C12-案C: 定石性報酬 — judgダメージ(ph0)が防御DOWN有効中なら加点(ランキング用のみ・火力不関与)。
                      T.orthodoxy=(T.orthodoxy||0)+(sim.buf.divinus_def?.length?1:0)+(sim.buf.effond_def?.length?1:0); }
                    else if(ph===1) sim.burst(ownerOf('judg'),bset,T);
                    else sim.dmg += sim._decay('na', sim._na()*(1+GEAR.na_dmg)); }},
      absolute: { s:130, atkBuf:true, partyBG:true, exec:(sim,T,ord)=>{ if(!sim.buf.absolute)sim.buf.absolute=[]; sim.buf.absolute.push(DMG.dur_absolute); sim.addG(CHARS,BG.absolute); sim.use('absolute',T,ord); }},
      // ディウィヌス: 敵防御-30%(defdown・後続全攻撃を底上げ)＋DOT4種(順序非依存・turnEndでtick)。
      divinus:  { s:90, atkBuf:true, exec:(sim,T,ord)=>{
                  (sim.buf.divinus_def??=[]).push(DMG.dur_divinus_def);
                  (sim.buf.divinus_dot??=[]).push(DMG.dur_divinus_dot); sim.use('divinus',T,ord); }},
      // HELIX(テトラ4): 全体BG+100＋1アシ(ゴッド・オムニポンテス=spec+30%)を再発動(refresh)。連理魔力30以上・戦闘中1回のみ。
      helix:    { s:400, atkBuf:true, partyBG:true,
                  guard:(sim)=>sim.renri>=30&&!sim.helix_abil_used,
                  exec:(sim,T,ord)=>{ sim.helix_abil_used=true; sim.addG(CHARS,100);
                    sim.buf.omni=[DMG.dur_omni]; sim.use('helix',T,ord); }},
    },
    def: {
      gmax: 100,  // =BG.other_max（即時評価のためリテラル。ロード順不変条件・冒頭注記参照）
      burst_coef_a: 5, burst_coef_b: 2500,  // テトラ: a=5.0 b=2500(スクショ確定)
      keigyoGain: 1,
      // コヴァレント・アルカナ(連理魔力・テトラ固有): アビ12回毎/バースト2回毎にproc発火。
      // 1procで連理魔力+1(RENRI_MAXで頭打ち)＆ジャッジCD即0(CD中のみ・非蓄積)。同ターン上限RENRI_CAP。
      // 旧 Sim.procR() のハードコードを移管。チャネル別: アビ=onAbility(T.ability%12) / バースト=onPartyBurst(T.burst%2)。
      // T.proc は use()/burst() でカウンタ++済の T.ability/T.burst を読むため発火条件は不変。
      onAbility: (sim, name, color, T) => {
        if(T.ability>0 && T.ability%12===0 && T.proc<RENRI_CAP){
          T.proc++; if(sim.renri<RENRI_MAX) sim.renri++;
          if(sim.cd.judg>0) sim.cd.judg=0;
        }
      },
      onPartyBurst: (sim, owner, T, atk) => {
        if(T.burst>0 && T.burst%2===0 && T.proc<RENRI_CAP){
          T.proc++; if(sim.renri<RENRI_MAX) sim.renri++;
          if(sim.cd.judg>0) sim.cd.judg=0;
        }
      },
      // テトラ1アシ(ゴッド・オムニポンテス): クエスト開始時に光パーティへ特殊攻撃+30%(omni)を自動付与。
      onBattleStart: (sim) => { (sim.buf.omni??=[]).push(DMG.dur_omni); },
      // HELIX(テトラ4)は連理魔力30で解禁。目的関数は renri をここまで評価し超過分は追わない。
      milestones: { renri: 30 },
      // HELIX解禁検出(初回到達ターン表示用)。doneKeyは自前state。
      helix: { reached: s=>s.renri>=30, doneKey: 'helix_done' },
      onBurst: (sim, atk, owner) => {
        // バースト追加ダメージ(スクショ確定・アビ枠): HELIX前=3倍/50万、HELIX後=6倍/100万(おそらく)。
        const helix = !!sim.helix_done;
        const naB_t = sim._na();
        const mult = helix ? DMG.tetra_burst_mult2 : DMG.tetra_burst_mult;
        const cap  = helix ? DMG.tetra_burst_cap2  : DMG.tetra_burst_cap;
        sim.dmg += sim._decay('abi', naB_t * mult, cap);
        // CD短縮: 自バーストのみ全アビCD-1(自然分)。HELIX後はCD-2(CT短縮効果)。
        const cdDec = helix ? 2 : 1;
        const skip = atk ? [] : ['judg'];
        for(const k of Object.keys(sim.cd)){
          if(ABIL[k]?.[0] !== owner) continue;
          if(skip.includes(k)) continue;
          if(sim.cd[k]>0) sim.cd[k] = Math.max(0, sim.cd[k]-cdDec);
        }
      },
      // ディウィヌスDOT: 有効ターン毎に4種×min(敵最大HP×10%, 上限10万)を概算加算(順序非依存)。
      turnEnd: (sim) => { if(sim.buf.divinus_dot?.length)
        sim.dmg += DMG.divinus_dot_types*Math.min(DMG.enemy_max_hp*0.10, DMG.divinus_dot_cap); },
    },
  },

  elaine: {
    type: 'kamihime',
    jp: 'エレイン[契晶]', shortJp: 'エレイン', gcls: 'gl', elem: 'light',
    favWeapon: ['剣','特殊剣'], baseAtk: 10500, baseHp: 1820,
    abilities: {
      alone:    ['r', 0, 4],
      legend:   ['y', 0, 0],
      knights:  ['b', 0, 3],
      pactcore: ['w', 0, 12],
    },
    labelSuffix: { legend:'(+10)' },
    cdShow: {},
    cands: {
      alone:    { s:40, burstTrigger:true, guard:(sim,T)=>(T.alone||0)<2,
                  exec:(sim,T,ord,bset)=>{ T.alone=(T.alone||0)+1; sim.use('alone',T,ord); sim.burst(ownerOf('alone'),bset,T); }},
      legend:   { s:120, atkBuf:true, partyBG:true,
                  guard:(sim,T)=>{ let lu=sim.cum>=1?2:1; for(const thr of [26,51,71,80]) if(sim.cum>=thr) lu++; return (T.legend||0)<lu; },
                  exec:(sim,T,ord)=>{ T.legend=(T.legend||0)+1; (sim.buf.legend??=[]).push(DMG.dur_legend);
                    // アシスト閾値バフ(契晶獲得数cum依存・3T・refresh単発: 累積可ではない)
                    if(sim.cum>=10) sim.buf.leg_aslt=[DMG.dur_legend];
                    if(sim.cum>=70) sim.buf.leg_vigor=[DMG.dur_legend];
                    if(sim.cum>=80) sim.buf.leg_spec=[DMG.dur_legend];
                    const lead100=sim.g[LEADER]>=100; sim.addG(lead100?CHARS:[LEADER,ownerOf('legend')],BG.legend); sim.use('legend',T,ord); }},
      // ナイツサプレス: 敵バースト攻撃耐性-20% ≒ 全バースト(誘発含む)+20%。契晶3消費。
      // 【非累積・refresh】(C11・実機確認2026-06-28): -20%は重ねがけ不可で2T持続するだけ。
      // guardで「nights有効中は再発動しない」を課し、2T毎(隔ターン)発動＝連続+20%・無駄な毎ターン連発を抑止。
      knights:  { s:85, atkBuf:true, guard:(sim,T)=>!T.knightsUsed && !(sim.buf.nights?.length),
                  exec:(sim,T,ord)=>{ T.knightsUsed=true; (sim.buf.nights??=[]).push(DMG.dur_nights); sim.use('knights',T,ord); }},
      pactcore: { s:(sim)=>{ const lk=Object.keys(ABIL).filter(k=>ownerOf(k)===LEADER); const n=lk.filter(k=>sim.cd[k]>0).length; return n>=3?150:n===2?110:n===1?70:20; }, atkBuf:true, partyBG:true,
                  guard:(sim,T)=>{ if(T.pactcoreUsed||sim.g[LEADER]<100) return false; return Object.keys(ABIL).filter(k=>ownerOf(k)===LEADER).some(k=>sim.cd[k]>0); },
                  exec:(sim,T,ord)=>{ T.pactcoreUsed=true; const lk=Object.keys(ABIL).filter(k=>ownerOf(k)===LEADER); for(const k of lk) if(sim.cd[k]>0) sim.cd[k]=Math.max(0,sim.cd[k]-1); sim.addG(CHARS,BG.pactcore); sim.use('pactcore',T,ord,'(全+100)'); }},
    },
    def: {
      burst_coef_a: 5.5, burst_coef_b: 3000,  // エレイン: a=5.5 b=3000(スクショ確定)
      gmax: 100,  // =BG.other_max（即時評価のためリテラル。ロード順不変条件・冒頭注記参照）
      keigyoGain: 1,
      // ARRIVE(3アシスト): パーティ全員が光属性のとき永続発動(消去不可)。
      // バーストダメージ+20% & バーストダメージプラス+50万(減衰外)を全員のバーストに付与。
      // 会心発動率+20%(crit_rate_arrive)は _na() に常時反映済み。
      burstPartyPassive: (sim) => CHARS.every(c=>ELEM[c]==='light')
        ? { dmg: DMG.burst_dmg_arrive, flat: DMG.bplus_arrive } : null,
      // バースト追加ダメージ(スクショ確定・アビ枠・2倍/30万): 常時1回、契晶80個以上で3回発動。
      onBurst: (sim) => {
        const naB_e = sim._na();
        const hits = sim.cum >= 80 ? 3 : 1;
        for(let i=0; i<hits; i++)
          sim.dmg += sim._decay('abi', naB_e * DMG.elaine_burst_extra_mult, DMG.elaine_burst_extra_cap);
      },
    },
  },

  napoleon: {
    type: 'hero',
    jp: 'ナポレオン', gcls: 'ge', elem: null,
    favWeapon: ['剣','銃'], lvUpAtk: 400,
    // aura: 英雄の闘気(エキープ・ベニフィッシで蓄積、ベタイアがターン終了時に消費)
    // betaia2: ファクター・ディシジフによるベタイア2回発動状態の残ターン
    state: { aura: 0, betaia2: 0, roy_tier: 0 },
    abilities: {
      roy:     ['y', 3, 0],
      pike:    ['y', 3, 0],
      consort: ['r', 3, 0],
      factor:  ['y', 9, 0],
    },
    labelSuffix: { factor:'(全CD-1)' },
    cdShow: { roy:"ロワ・クモンド", pike:"パイク", consort:"アーティオリ", factor:"ディシジフ" },
    cands: {
      // ロワ・クモンド: バフ数tierに応じ全攻撃ダメージプラス(2T)。tier確定後にbuf追加。
      roy:     { atkBuf:true, exec:(sim,T,ord)=>{ const bc=buffCount(sim);
                   sim.roy_tier = bc>=16?3:bc>=11?2:bc>=6?1:0;
                   (sim.buf.roy??=[]).push(DMG.dur_roy); sim.use('roy',T,ord); }},
      // パイク: 旺盛・防壁(2T)。自身のバフ2個を含めてバフ15以上で急所・会心付与追加。
      pike:    { atkBuf:true, exec:(sim,T,ord)=>{ (sim.buf.pike??=[]).push(DMG.dur_pike);
                   (sim.buf.pike_def??=[]).push(DMG.dur_pike);
                   if(buffCount(sim)>=15) (sim.buf.pike_crit??=[]).push(DMG.dur_pike);
                   sim.use('pike',T,ord); }},
      // アーティオリ: (2+0.5×バフ数)倍のダメージ(上限250万)。防御DOWN(6T累積可)。バフ20以上で2回。
      consort: { exec:(sim,T,ord)=>{ sim._naOwner=ownerOf('consort'); const bc=buffCount(sim); const hits=bc>=20?2:1;
                   const mult=2+0.5*bc;
                   // アビダメ枠: ×(1+abi_dmg+droid)、減衰 基準consort_cap×(1+droid)(超過は1/25で逓減)
                   const dbc=sim._droidAbiBuf();
                   for(let i=0;i<hits;i++) sim.dmg+=sim._decay('abi', sim._naForAbi()*mult*(1+GEAR.abi_dmg+dbc.dmg), DMG.consort_cap*(1+dbc.cap));
                   for(let i=0;i<hits;i++) (sim.buf.consort_def??=[]).push(DMG.dur_consort_def);
                   sim.use('consort',T,ord,hits===2?'(×2)':''); }},
      // ディシジフ: ベタイア2回発動化(2T)。バフ10以上で全体アビCD-1・BG+30追加。
      factor:  { partyBG:true, exec:(sim,T,ord)=>{ sim.betaia2=DMG.dur_factor;
                   if(buffCount(sim)>=10){
                     for(const k of Object.keys(sim.cd)) if(k!=='factor'&&sim.cd[k]>0) sim.cd[k]--;
                     sim.addG(CHARS,DMG.factor_bg);
                   }
                   sim.use('factor',T,ord); }},
    },
    def: {
      burst_coef_a: 5, burst_coef_b: 3000,  // ナポレオン: a=5.0 b=3000(エジソンと同英霊クラス)
      gmax: 100,  // =BG.other_max（即時評価のためリテラル。ロード順不変条件・冒頭注記参照）
      keigyoGain: 3,
      // 英霊武器「レス・ボナパルト」メイン装備時: バースト発動時に自身の全アビCD-1短縮。
      onBurst: (sim, atk, owner) => {
        if(!DMG.napo_burst_cd_reduce) return;
        for(const k of Object.keys(sim.cd)){
          if(ABIL[k]?.[0] !== owner) continue;
          if(sim.cd[k] > 0) sim.cd[k] = Math.max(0, sim.cd[k]-1);
        }
      },
      // エキープ・ベニフィッシ: 味方の強化系アビ(atkBufタグ)毎に闘気+1
      onAbility: (sim, name) => { if(CHAR_REGISTRY[ownerOf(name)]?.cands?.[name]?.atkBuf) sim.aura++; },
      // ベタイア・コンヴェフティ: ターン終了時に闘気を消費(闘気1個=1ヒット×3倍・上限50万)
      // ファクター発動中(betaia2>0)は2回発動。BG+3×闘気も同様。
      turnEnd: (sim) => {
        const times = sim.betaia2>0 ? 2 : 1;
        if(sim.aura>0){
          sim.addG(CHARS, DMG.betaia_bg_per_aura*sim.aura*times);
          for(let i=0;i<sim.aura*times;i++)
            sim.dmg += Math.min(sim._na()*DMG.betaia_mult, DMG.betaia_cap);
          sim.aura=0;
        }
        if(sim.betaia2>0) sim.betaia2--;
      },
    },
  },

  freyja_christmas: {
    type: 'kamihime',
    jp: '[聖夜の約束]フレイヤ', shortJp: 'フレイヤ', gcls: 'gfy', elem: 'light',
    favWeapon: ['弓', '銃'], baseAtk: 8020, baseHp: 1750,
    state: {
      freyja_used: false,
      freyja_bp_edison: 0, freyja_bp_yamato: 0, freyja_bp_hecate: 0, freyja_bp_tetra: 0, freyja_bp_elaine: 0, freyja_bp_freyja: 0,
      freyja_a_edison: 0,  freyja_a_yamato: 0,  freyja_a_hecate: 0,  freyja_a_tetra: 0,  freyja_a_elaine: 0,  freyja_a_freyja: 0
    },
    abilities: {
      promise:    ['g', 6, 0],
      wish:       ['y', 3, 0],
      happiness:  ['y', 8, 0],
      holiday:    ['y', 1, 0]
    },
    labelSuffix: { wish: '(バプラス100万)', happiness: '(全+100)', holiday: '(全体化)' },
    cdShow: { promise: "ミルキーウェイ", wish: "ウィッシュ", happiness: "ハピネス", holiday: "カインドネス" },
    cands: {
      holiday: { s: 500, guard: (sim) => !sim.freyja_used, exec: (sim, T, ord) => {
        sim.freyja_used = true;
        sim.T.freyja_all = true;
        const me = ownerOf('holiday');
        sim['freyja_a_' + me] = (sim['freyja_a_' + me] || 0) + 0.07;
        sim.use('holiday', T, ord);
      }},
      happiness: { s: (sim) => sim.T.freyja_all ? 490 : 170, partyBG: true, exec: (sim, T, ord) => {
        const me = ownerOf('happiness');
        const target = CHARS.includes('yamato') ? 'yamato' : LEADER;
        const tgs = sim.T.freyja_all ? CHARS : [target, me];
        sim.addG(tgs, 100);
        for (const c of tgs) sim['freyja_a_' + c] = (sim['freyja_a_' + c] || 0) + 0.07;
        sim.use('happiness', T, ord);
      }},
      wish: { s: (sim) => sim.T.freyja_all ? 480 : 150, atkBuf: true, exec: (sim, T, ord) => {
        const me = ownerOf('wish');
        const target = CHARS.includes('yamato') ? 'yamato' : LEADER;
        const tgs = sim.T.freyja_all ? CHARS : [target, me];
        for (const c of tgs) {
          sim['freyja_bp_' + c] = (sim['freyja_bp_' + c] || 0) + 1;
          sim['freyja_a_' + c] = (sim['freyja_a_' + c] || 0) + 0.07;
        }
        sim.use('wish', T, ord);
      }},
      promise: { s: 80, exec: (sim, T, ord) => {
        const me = ownerOf('promise');
        const target = CHARS.includes('yamato') ? 'yamato' : LEADER;
        const tgs = sim.T.freyja_all ? CHARS : [target, me];
        (sim.buf.freyja_regen ??= []).push(4);
        for (const c of tgs) sim['freyja_a_' + c] = (sim['freyja_a_' + c] || 0) + 0.07;
        sim.use('promise', T, ord);
      }}
    },
    def: {
      burst_coef_a: 5, burst_coef_b: 2500,
      gmax: 100,  // =BG.other_max（即時評価のためリテラル。ロード順不変条件・冒頭注記参照）
      keigyoGain: 1,
      onBurst: (sim) => { (sim.buf.freyja_bg_up ??= []).push(4); },
      onPartyBurst: (sim, owner) => {
        const k = 'freyja_bp_' + owner;
        if (sim[k] > 0) {
          sim.dmg += 1000000;
          sim[k]--;
        }
      }
    },
    subAssists: {
      streak_dmgup: 1.1
    }
  },

  artemis: {
    type: 'kamihime',
    jp: 'アルテミス[神想真化]', shortJp: 'アルテミス', gcls: 'gar', elem: 'light',
    favWeapon: ['銃','ハンマー'], baseAtk: 12440, baseHp: 3120,
    // artemis_link_used: LinkSkill(4アビ・戦闘中1回のみ)使用済みフラグ / kyosho_amp: 恐傷の被ダメUP量(_naで参照)
    state: { artemis_link_used: false, kyosho_amp: 0 },
    abilities: {
      enchant:    ['r', 7, 0],  // エンチャントアロー: ゲージ消費の段階ダメージ
      refine:     ['y', 8, 0],  // リファインメントエイド: 急所＋追撃付与
      manapolite: ['y', 2, 0],  // マナポライトオペレーション: 全体BG＋ストリークUP
      linkskill:  ['y', 1, 0],  // LinkSkill[アルテミス]: 特殊攻撃UP＋全体BG100(戦闘中1回)
    },
    labelSuffix: { manapolite:'(全+10)', linkskill:'(全+100)' },
    cdShow: { enchant:"エンチャントアロー", refine:"リファインメント", manapolite:"マナポライト", linkskill:"リンクスキル" },
    cands: {
      // エンチャントアロー: バーストゲージ消費量の入る帯で段階(倍率/減衰)を決定するアビ枠ダメージ。下位帯は上位に内包。
      // ゲージ消費=FB(攻撃フェイズの100消費)と競合し、目的関数(総ダメージ)が両者を比較し選択する。s低め＝静的greedyでは
      // 選ばれずビーム(火力駆動)に委ねる。guardで最低帯(消費26)に届く時のみ候補化。
      // 【部分消費探索】variants で各帯の「最小消費量」を1候補ずつ展開(同一CD・use('enchant')で共有)。帯内でそれ以上
      //   消費は同tier・残ゲージ減で常に劣るため下限消費のみ。残ゲージを翌ターンのFBへ温存する押し順を探索できる。
      // 消費100(tier5)で恐傷(被ダメUP=状態異常数×2%・上限30%・冥闇+恐傷+ディウィヌスDOT4種を計上)を付与=後続全攻撃を底上げ。
      // ※_artemisKyosho相当の恐傷処理は base/variant 双方に必要だが、characters.jsトップレベル関数はWorkerへ非伝播のためインライン。
      enchant: { s:55, guard:(sim)=>sim.g[ownerOf('enchant')]>=26,
                 variants:(sim)=>{ const g=sim.g[ownerOf('enchant')];
                   const tiers=[[1,1],[26,2],[51,3],[76,4],[100,5]]; // [帯下限消費, tier番号]
                   return tiers.filter(([need])=>g>=need).map(([need,ti])=>({
                     key:'enchant_t'+ti, s:50+ti, // 高tierほど僅かに先頭(同点タイブレーク用・選択は火力駆動)
                     exec:(sim,T,ord)=>{ sim._spendGaugeAbi('enchant',need,DMG['arrow_mult'+ti],DMG['arrow_cap'+ti],T,ord);
                       if(need>=100){ const ail=2+(sim.buf.divinus_dot?.length?DMG.divinus_dot_types:0);
                         sim.kyosho_amp=Math.min(ail*DMG.kyosho_per_ailment,DMG.kyosho_cap); (sim.buf.kyosho??=[]).push(DMG.dur_kyosho); } }
                   })); },
                 exec:(sim,T,ord)=>{ const g=sim.g[ownerOf('enchant')];
                   const ti=g>=100?5:g>=76?4:g>=51?3:g>=26?2:1;
                   sim._spendGaugeAbi('enchant',g,DMG['arrow_mult'+ti],DMG['arrow_cap'+ti],T,ord);
                   if(g>=100){ const ail=2+(sim.buf.divinus_dot?.length?DMG.divinus_dot_types:0);
                     sim.kyosho_amp=Math.min(ail*DMG.kyosho_per_ailment,DMG.kyosho_cap); (sim.buf.kyosho??=[]).push(DMG.dur_kyosho); } }},
      // リファインメントエイド: 味方全体に急所(refine_acute・_naで参照)＋追撃(refine_followup・burstで参照)を付与(refresh/dur3)。
      refine: { s:155, atkBuf:true, exec:(sim,T,ord)=>{
                  sim.buf.refine_acute=[DMG.dur_refine];
                  sim.buf.refine_followup=[DMG.dur_refine];
                  sim.use('refine',T,ord); }},
      // マナポライトオペレーション: 全体BG+10 ＋ ストリークダメージ+2%/stack(累積可・dur10・_attackPhaseで参照)。
      manapolite: { s:140, atkBuf:true, partyBG:true, exec:(sim,T,ord)=>{
                  (sim.buf.manapolite??=[]).push(DMG.dur_manapolite);
                  sim.addG(CHARS, DMG.bg_manapolite); sim.use('manapolite',T,ord); }},
      // LinkSkill: 光属性キャラ特殊攻撃+30%(dur1) ＋ 全体BG+100。戦闘中1回のみ。BG100の開幕加速が強く高スコア。
      linkskill: { s:300, atkBuf:true, partyBG:true, guard:(sim)=>!sim.artemis_link_used,
                  exec:(sim,T,ord)=>{ sim.artemis_link_used=true;
                    (sim.buf.artemis_spec??=[]).push(DMG.dur_artemis_spec);
                    sim.addG(CHARS, 100); sim.use('linkskill',T,ord); }},
    },
    def: {
      burst_coef_a: 5.5, burst_coef_b: 3000,  // アルテミス: a=5.5 b=3000(ユーザー提供)
      gmax: 100,  // =BG.other_max（即時評価のためリテラル。ロード順不変条件・冒頭注記参照）
      keigyoGain: 1,
      // バースト効果: 自身のアビリティ再使用間隔1ターン短縮(自バーストのみ・全アビCD-1)。
      onBurst: (sim, atk, owner) => {
        for(const k of Object.keys(sim.cd)){
          if(ABIL[k]?.[0] !== owner) continue;
          if(sim.cd[k] > 0) sim.cd[k] = Math.max(0, sim.cd[k]-1);
        }
      },
      // アシスト1 リンクスフェロー: 味方バースト毎にアルテミスへ BG+15 ＆ バーストダメージプラス+15万バフ(自バーストのみ対象・3T累積可)。
      onPartyBurst: (sim, owner, T, atk) => {
        const me = ownerOf('refine');  // =artemis(自キー参照)
        sim.addG([me], 15);
        (sim.buf.artemis_bplus??=[]).push(DMG.dur_artemis_bplus);
      },
      // 編成パッシブのバースト寄与(全バーストに乗る・メイン編成時のみ。アシスト2はサブ対応のため subAssits 側へ集約):
      //  ・リファイン追撃: 有効中は全バーストにアビ枠追加ダメ(3倍/30万・減衰外フラット近似)。
      //  ・リンクスフェロー bplus: アルテミス自身のバーストのみ +15万/stack(_naOwner判定)。
      burstPartyPassive: (sim) => {
        let flat = 0;
        if(sim.buf.refine_followup?.length)
          flat += Math.min(sim._na()*DMG.refine_followup_mult, DMG.refine_followup_cap);
        if(sim._naOwner===ownerOf('refine'))
          flat += (sim.buf.artemis_bplus?.length||0)*DMG.bplus_artemis;
        return flat ? { flat } : null;
      },
    },
    // アシスト2 AnotherLink: サブメンバー時にも発動する編成パッシブ。全員光属性編成で
    //   バーストダメージ+25% / バースト上限+10% / 最終ダメージ+10%。buildFormationが集約し
    //   sub_burst_dmg / sub_burst_cap / final_dmg へ反映（メイン編成でも同経路で1回だけ適用）。
    subAssists: { burst_dmg: 0.25, burst_cap: 0.10, final_dmg: 0.10 },
  }
};
export { CHAR_REGISTRY, DEBUFF_KEYS, buffCount };
