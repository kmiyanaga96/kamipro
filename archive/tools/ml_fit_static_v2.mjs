// ============================================================================
// ml_fit_static_v2.mjs — Phase 7 PoC-phase-2: (a) per-config 連続較正 × (b) 浅ビーム整合サロゲート
// ----------------------------------------------------------------------------
// 一次情報: PHASE7_ML_PLAN.md §6.5(a)(b)。オフライン専用・src/* は §6.5(b) の beamW 注入フックのみ（inert-by-default）。
//
// 第1回PoC(§6)の学び:
//   ・共有θは異種config同時最適化不能 → 本harnessは **config別 θ**（per-config 較正）に切替。
//   ・proxy(静的greedy)は s に不感かつ full と乖離 → **浅ビーム(beamW小)を目的**に（s感応・full より桁安）。
//
// 手順（config 毎に独立）:
//   1) θ = constant/derived な s の14キー（judg/pactcore は per-config アンカーで固定）。θ0=現行 production 較正。
//   2) (1+λ)-ES で **surrogate**（既定=浅ビーム beamW=SURR_W・N=SURR_N）総ダメージを最大化。
//   3) 勝者 θ* を **full prod(N=10・BEAM_W=64・C27リファイン)** で baseline と比較（＝production 代表デリバラブル）。
//   4) surrogate Δ% と full Δ% の符号一致で **(b) の整合性**を検証（proxy より良い代理か）。
//
// SURR_MODE: 'shallow'(既定・beamW=SURR_W) / 'fulln'(BEAM_W維持・N短縮のみ・より整合だが高価)。
// 環境変数: POC_N(10) SURR_N(6) SURR_W(8) POC_GEN(6) POC_LAMBDA(5) POC_SEED(1) POC_SIGMA(1.0) SURR_MODE(shallow)
// 実行:     node archive/tools/ml_fit_static_v2.mjs   （≈15分・background 推奨）
// ============================================================================
import {
  Sim, buildFormation, recalcGearK, recalcGearKCFromDispAtk,
  setStaticOverride, GEAR, DMG, ABIL_KEYS, ABIL_BASE_S, _refineRoute, _replayResult,
} from '../../src/app.js';

const N        = +(process.env.POC_N ?? 10);
const SURR_N   = +(process.env.SURR_N ?? 6);
const SURR_W   = +(process.env.SURR_W ?? 8);
const GEN      = +(process.env.POC_GEN ?? 6);
const LAMBDA   = +(process.env.POC_LAMBDA ?? 5);
const SEED     = +(process.env.POC_SEED ?? 1);
const SIGMA0   = +(process.env.POC_SIGMA ?? 1.0);
const SURR_MODE= (process.env.SURR_MODE ?? 'shallow');
const fmt = x => Math.round(x).toLocaleString();
const pct = (a, b) => ((a / b - 1) * 100);

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const rng = mulberry32(SEED);
function gauss(){ let u=0,v=0; while(u===0)u=rng(); while(v===0)v=rng(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

// ---- config 定義（第1回PoCと同一・PHASE7_ML_PLAN §4.4 の注記どおりサブメンバーは未配線）----
const DEF = { enemy_def: DMG.enemy_def, enemy_max_hp: DMG.enemy_max_hp, affinity: DMG.affinity,
  edison_burst_extra_mult: DMG.edison_burst_extra_mult, edison_burst_extra_cap: DMG.edison_burst_extra_cap };
const GEAR_A = {assault:2.826,elem:0,vigor:0.6876,spec:0,dmgup:0.09,acute:0.144,crit_rate:0.3708,
  other:0,na_dmg:0.972,abi_dmg:2.16,burst_dmg:4.86,na_cap:0.36,abi_cap:0.954,burst_cap:1.98};
const DISP_A = {edison:92873,yamato:72865,hecate:70087,tetra:76297,elaine:73365};
const scaleGear = (g,f)=>Object.fromEntries(Object.entries(g).map(([k,v])=>[k, v*f]));
const KAMI = ['yamato','hecate','tetra','elaine'];
const CONFIGS = [
  { name:'golden',     hero:'edison', kami:KAMI, gear:null, dispAtk:null, enemy:{...DEF}, prodOverride:{judg:160, pactcore:1} },
  { name:'configA',    hero:'edison', kami:KAMI, gear:GEAR_A, dispAtk:DISP_A,
    enemy:{enemy_def:10, enemy_max_hp:1e8, affinity:1.5, edison_burst_extra_mult:2.5, edison_burst_extra_cap:8e5}, prodOverride:{judg:200, pactcore:1} },
  { name:'geartest_lo',hero:'edison', kami:KAMI, gear:scaleGear(GEAR_A,0.7), dispAtk:scaleGear(DISP_A,0.85),
    enemy:{enemy_def:10, enemy_max_hp:1e8, affinity:1.5, edison_burst_extra_mult:2.5, edison_burst_extra_cap:8e5}, prodOverride:{judg:200, pactcore:1} },
  { name:'geartest_hi',hero:'edison', kami:KAMI, gear:scaleGear(GEAR_A,1.3), dispAtk:scaleGear(DISP_A,1.15),
    enemy:{enemy_def:10, enemy_max_hp:1e8, affinity:1.5, edison_burst_extra_mult:2.5, edison_burst_extra_cap:8e5}, prodOverride:{judg:200, pactcore:1} },
];

function applyConfig(cfg){
  buildFormation(cfg.hero, cfg.kami);
  for(const k of Object.keys(GEAR)) GEAR[k]=0;
  if(cfg.gear) for(const [k,v] of Object.entries(cfg.gear)){ if(k in GEAR) GEAR[k]=v; }
  const e=cfg.enemy||{};
  DMG.enemy_def = e.enemy_def ?? DEF.enemy_def;
  DMG.enemy_max_hp = e.enemy_max_hp ?? DEF.enemy_max_hp;
  DMG.affinity = e.affinity ?? DEF.affinity;
  DMG.edison_burst_extra_mult = e.edison_burst_extra_mult ?? DEF.edison_burst_extra_mult;
  DMG.edison_burst_extra_cap  = e.edison_burst_extra_cap  ?? DEF.edison_burst_extra_cap;
  recalcGearK(); recalcGearKCFromDispAtk(cfg.dispAtk||{});
}

// surrogate（安価・s感応）: 浅ビーム or 短縮N full。verify（production代表）: full N=10 + C27リファイン。
function surrDmg(){
  const s=new Sim(); s.totalTurns=SURR_N;
  if(SURR_MODE==='shallow') s.beamW=SURR_W;   // fulln の場合は beamW 未設定＝BEAM_W(=production幅)
  for(let t=1;t<=SURR_N;t++) s.takeTurn(t); return s.dmg;
}
function prodDmg(){
  const s=new Sim(); const keys=[]; for(let t=1;t<=N;t++) keys.push(s.takeTurn(t).keys);
  const ref=_refineRoute(keys,N); const rep=_replayResult(ref.turnsKeys,N);
  return {dmg:rep.dmg, fb:rep.rows.filter(r=>r.full).length};
}

// θ（config別）。key集合は config横断で共通（structural）だが最適化は config 毎に独立。
function buildKeys(){
  const keySet=new Set(); const nat={};
  for(const cfg of CONFIGS){ applyConfig(cfg); setStaticOverride({});
    for(const k of ABIL_KEYS){ if(ABIL_BASE_S[k]!==null){ keySet.add(k); nat[k]=ABIL_BASE_S[k]; } } }
  const keys=[...keySet];
  return {keys, theta0: keys.map(k=>nat[k]??100)};
}
function overrideFor(cfg, keys, theta){
  const ov={}; for(let i=0;i<keys.length;i++) ov[keys[i]]=Math.max(1,Math.round(theta[i]));
  Object.assign(ov, cfg.prodOverride); return ov;
}

// per-config (1+λ)-ES（エリート・1/5成功則）で surrogate を最大化。返り値 θ*（config専用）。
function optimizeConfig(cfg, keys, theta0, scale){
  applyConfig(cfg);
  setStaticOverride(overrideFor(cfg, keys, theta0));
  let parent=theta0.slice();
  let fParent=surrDmg();
  const base=fParent;
  let sigma=SIGMA0;
  for(let g=0; g<GEN; g++){
    let succ=0, best=null;
    for(let i=0;i<LAMBDA;i++){
      const x=parent.map((m,k)=>Math.max(1, m + sigma*scale[k]*gauss()));
      setStaticOverride(overrideFor(cfg, keys, x));
      const f=surrDmg();
      if(f>fParent) succ++;
      if(!best||f>best.f) best={x,f};
    }
    if(best && best.f>fParent){ parent=best.x; fParent=best.f; }
    const ps=succ/LAMBDA; sigma *= ps>0.2?1.5:(ps<0.2?0.85:1.0);
  }
  return {theta:parent, surrBase:base, surrFit:fParent};
}

// ============================================================================
const t0=Date.now();
const {keys, theta0}=buildKeys();
const scale=theta0.map(v=>Math.max(2,0.15*Math.abs(v)));
console.log(`[ml-fit v2] per-config 連続較正 × ${SURR_MODE}サロゲート`);
console.log(`  surrogate=${SURR_MODE==='shallow'?`浅ビーム beamW=${SURR_W}`:'full(BEAM_W)'} N=${SURR_N} / verify=full prod N=${N}`);
console.log(`  dim=${keys.length} gen=${GEN} λ=${LAMBDA} seed=${SEED}`);
console.log(`  θ keys: ${keys.join(',')}`);

const results=[];
for(const cfg of CONFIGS){
  const opt=optimizeConfig(cfg, keys, theta0, scale);
  // verify: full prod で base(θ0) vs fit(θ*)。
  applyConfig(cfg);
  setStaticOverride(overrideFor(cfg, keys, theta0)); const bP=prodDmg();
  setStaticOverride(overrideFor(cfg, keys, opt.theta)); const fP=prodDmg();
  const diff={}; for(let i=0;i<keys.length;i++){ const a=Math.round(theta0[i]), b=Math.max(1,Math.round(opt.theta[i])); if(a!==b) diff[keys[i]]=`${a}→${b}`; }
  results.push({name:cfg.name, surrΔ:pct(opt.surrFit,opt.surrBase), fullΔ:pct(fP.dmg,bP.dmg),
    bProd:bP.dmg, fProd:fP.dmg, bFb:bP.fb, fFb:fP.fb, diff});
  console.log(`  [${cfg.name}] surrΔ=${pct(opt.surrFit,opt.surrBase).toFixed(3)}%  fullΔ=${pct(fP.dmg,bP.dmg).toFixed(3)}%  FB ${bP.fb}→${fP.fb}  (経過${((Date.now()-t0)/1000).toFixed(0)}s)`);
}
setStaticOverride({});

const pad=(s,n)=>String(s).padEnd(n), padL=(s,n)=>String(s).padStart(n);
console.log(`  ---- 結果（verify=full prod N=${N}）----`);
console.log(`  ${pad('config',12)} ${padL('base(prod)',16)} ${padL('fit(prod)',16)} ${padL('full Δ%',9)} ${padL('surr Δ%',9)}  FB  align`);
for(const r of results){
  const align = (Math.sign(r.surrΔ)===Math.sign(r.fullΔ) || (r.surrΔ<=0&&r.fullΔ<=0)) ? '○' : '✕';
  console.log(`  ${pad(r.name,12)} ${padL(fmt(r.bProd),16)} ${padL(fmt(r.fProd),16)} ${padL(r.fullΔ.toFixed(3),9)} ${padL(r.surrΔ.toFixed(3),9)}  ${r.bFb}→${r.fFb}  ${align}`);
}
// ゲート: per-config なので「各config自身で full が改善したか(退行なしか)」と「(b)サロゲート整合率」。
const wins=results.filter(r=>r.fullΔ>0.0001).length;
const regress=results.filter(r=>r.fullΔ<-1e-6).length;
const aligned=results.filter(r=>Math.sign(r.surrΔ)===Math.sign(r.fullΔ)||(r.surrΔ<=0&&r.fullΔ<=0)).length;
const fbOk=results.every(r=>r.fFb>=r.bFb);
console.log(`  ---- ゲート ----`);
console.log(`  per-config full改善: ${wins}/${results.length} 勝ち・退行 ${regress}/${results.length}・FB非退行 ${fbOk?'OK':'NG'}`);
console.log(`  (b)サロゲート整合(surrΔとfullΔ同符号): ${aligned}/${results.length}`);
const verdict = (wins>0 && regress===0 && fbOk) ? 'GO（per-config連続較正が退行なしで改善＝本採用検討）'
             : (wins>0 ? 'PARTIAL（一部config改善だが退行あり＝予算/正則化/サロゲート要調整）'
             : 'NO-GO（この予算では上積みなし＝既存グリッド較正で飽和・§6.5(c)クローズ検討）');
console.log(`  => 判定: ${verdict}   (${((Date.now()-t0)/1000).toFixed(1)}s)`);
for(const r of results) if(Object.keys(r.diff).length) console.log(`  θ*[${r.name}] diff: ${JSON.stringify(r.diff)}`);
