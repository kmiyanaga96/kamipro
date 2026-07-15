// ============================================================================
// ml_fit_static.mjs — Phase 7 レベルA(A2) PoC: 静的スコア s の連続最適化 上限測定
// ----------------------------------------------------------------------------
// 一次情報: PHASE7_ML_PLAN.md §4。**オフライン専用・配布バンドル非対象**。src/* は無改変。
//
// 何をするか: per-key スカラー静的スコア s（constant/derived な key + prodOverride の key）を
//   決定変数 θ とし、(1+λ)-ES（derivative-free・エリート・1/5成功則）で proxy 総ダメージを最大化する。
//   初期点 θ0 = 現行 production 較正（各 config の prodOverride を含む）＝**単調安全の錨**。
//   ESはエリート選抜のため訓練集約 fitness は θ0 以上でのみ更新＝**訓練上は退行しない**。
//
// 目的（Go/No-go 判定）:
//   G1（上積み）: 訓練 config で現行比 実ダメージ +Δ%（有意閾は運用で設定・既定表示のみ）。
//   G2（汎化）:   hold-out config で現行以上（退行なし）。
//   G3（性能）:   JSホットパス不変（A2は定数読み出しのみ＝自明満足・本harnessでは非測定）。
//
// 評価器は src/app.js の内部 _calProxyDmg/_calFullDmg と同一手順を Sim から再構成（export 差異を回避）。
//   proxy = 静的greedy(planDepth=2) / full = 単一ビーム(takeTurn) / prod = golden同型(takeTurn+_refineRoute)。
//
// 環境変数: POC_N(10) POC_GEN(40) POC_LAMBDA(12) POC_SEED(1) POC_SIGMA(1.0)
// 実行:     node archive/tools/ml_fit_static.mjs  （= npm run poc:ml）
// ============================================================================
import {
  Sim, buildFormation, recalcGearK, recalcGearKCFromDispAtk,
  setStaticOverride, GEAR, DMG,
  ABIL_KEYS, ABIL_BASE_S, _refineRoute, _replayResult,
} from '../../src/app.js';

const N       = +(process.env.POC_N ?? 10);
const GEN     = +(process.env.POC_GEN ?? 40);
const LAMBDA  = +(process.env.POC_LAMBDA ?? 12);
const SEED    = +(process.env.POC_SEED ?? 1);
const SIGMA0  = +(process.env.POC_SIGMA ?? 1.0);
const fmt = x => Math.round(x).toLocaleString();
const pct = (a, b) => ((a / b - 1) * 100);

// 決定的 PRNG（結果再現のため）＋標準正規（Box-Muller）。
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const rng = mulberry32(SEED);
function gauss(){ let u=0,v=0; while(u===0)u=rng(); while(v===0)v=rng(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

// ============================================================================
// config 定義。gear=GEARボックス値(post-applyGear相当・直代入)。enemy=DMGの敵/英霊武器フィールド。
// dispAtk=per-char表示ATK(→GEAR_K_C)。prodOverride=現行 production 較正（θ0 の錨）。
// ⚠ サブメンバーアシスト(freyja/artemis 等)は headless では未配線（GEARに畳めない CHAR_DEF フック由来のため）。
//   これは configA の絶対ダメージを実機/production から一定量ずらすが、比較は**同一config内(θ0 vs θ*)**で
//   行うため系統オフセットは相殺し、「s最適化が較正を上回るか」の結論には影響しない（PHASE7_ML_PLAN §4.4 注記）。
// ============================================================================
const DEF = { // 起動時 DMG 既定値のスナップ（golden config 復元用）
  enemy_def: DMG.enemy_def, enemy_max_hp: DMG.enemy_max_hp, affinity: DMG.affinity,
  edison_burst_extra_mult: DMG.edison_burst_extra_mult, edison_burst_extra_cap: DMG.edison_burst_extra_cap,
};
// configA(キャスパリーグ)の GEARボックス（sim03/data/configA.json の cache キーより）。
const GEAR_A = {assault:2.826,elem:0,vigor:0.6876,spec:0,dmgup:0.09,acute:0.144,crit_rate:0.3708,
  other:0,na_dmg:0.972,abi_dmg:2.16,burst_dmg:4.86,na_cap:0.36,abi_cap:0.954,burst_cap:1.98};
const DISP_A = {edison:92873,yamato:72865,hecate:70087,tetra:76297,elaine:73365};
const scaleGear = (g,f)=>Object.fromEntries(Object.entries(g).map(([k,v])=>[k, v*f]));

const KAMI = ['yamato','hecate','tetra','elaine'];
const CONFIGS = [
  { name:'golden',       hold:false, hero:'edison', kami:KAMI, gear:null, dispAtk:null,
    enemy:{...DEF}, prodOverride:{judg:160, pactcore:1} },
  { name:'configA',      hold:false, hero:'edison', kami:KAMI, gear:GEAR_A, dispAtk:DISP_A,
    enemy:{enemy_def:10, enemy_max_hp:1e8, affinity:1.5, edison_burst_extra_mult:2.5, edison_burst_extra_cap:8e5},
    prodOverride:{judg:200, pactcore:1} },
  // hold-out（学習に使わない）: configA のギアを ±スケールした汎化テスト config。
  { name:'holdout_lo',   hold:true,  hero:'edison', kami:KAMI, gear:scaleGear(GEAR_A,0.7), dispAtk:scaleGear(DISP_A,0.85),
    enemy:{enemy_def:10, enemy_max_hp:1e8, affinity:1.5, edison_burst_extra_mult:2.5, edison_burst_extra_cap:8e5},
    prodOverride:{judg:200, pactcore:1} },
  { name:'holdout_hi',   hold:true,  hero:'edison', kami:KAMI, gear:scaleGear(GEAR_A,1.3), dispAtk:scaleGear(DISP_A,1.15),
    enemy:{enemy_def:10, enemy_max_hp:1e8, affinity:1.5, edison_burst_extra_mult:2.5, edison_burst_extra_cap:8e5},
    prodOverride:{judg:200, pactcore:1} },
];

// config を headless 適用（buildFormation → GEAR/DMG/GEAR_K/GEAR_K_C を確定）。
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
  recalcGearK();
  recalcGearKCFromDispAtk(cfg.dispAtk||{});
}

// 評価器（src/app.js 内部関数と同一手順）。呼び出し前に applyConfig 済み・override は各所で設定する。
function proxyDmg(){ const s=new Sim(); s.totalTurns=N; s.planDepth=2; for(let t=1;t<=N;t++) s.greedyTakeTurn(t); return s.dmg; }
function fullDmg(){  const s=new Sim(); s.totalTurns=N; for(let t=1;t<=N;t++) s.takeTurn(t); return s.dmg; }
function prodDmg(){  // golden同型: 単一ビーム探索 + C27リファインの production 一致デリバラブル
  const s=new Sim(); const keys=[]; for(let t=1;t<=N;t++) keys.push(s.takeTurn(t).keys);
  const ref=_refineRoute(keys,N); const rep=_replayResult(ref.turnsKeys,N);
  return {dmg:rep.dmg, fb:rep.rows.filter(r=>r.full).length};
}

// θ（決定変数）: config ごとに constant/derived な s の key ∪ prodOverride の key。
// θ0[key] = prodOverride[key] があればそれ、無ければ自然ベース s（ABIL_BASE_S・override空時の値）。
// ⚠ 各 config で ABIL_KEYS が同一（同一編成）である前提。config 横断で共通の θ を張るため union をとる。
function buildTheta(){
  const keySet=new Set(); const nat={};
  // θ = constant/derived な s の key のみ（config横断で共通・structural ゆえ config非依存）。
  // prodOverride の key（judg/pactcore 等）は **config別の固定アンカー**として overrideFor で後付けするため θ に含めない
  // （関数 s ＝ ABIL_BASE_S=null で自然に除外されるが、prodOverride で config毎に別値を張る＝共有θでは表現不能なため）。
  for(const cfg of CONFIGS){
    applyConfig(cfg); setStaticOverride({});               // 自然ベース s を露出
    for(const k of ABIL_KEYS){ if(ABIL_BASE_S[k]!==null){ keySet.add(k); nat[k]=ABIL_BASE_S[k]; } }
  }
  const keys=[...keySet];
  // θ0: 各 config の prodOverride を優先（config 間で prodOverride が異なる場合は「自然 s」を共通初期とし、
  //   config固有の prodOverride は評価時に上書きマージする＝下 evalConfig 参照）。ここでは共通初期=自然 s。
  const theta0 = keys.map(k => nat[k] ?? 100);
  return {keys, theta0, nat};
}

// θ(config横断共通ベクトル) を、その config の prodOverride とマージして override を作り評価。
// prodOverride は θ より優先（judg/pactcore は config 別の production 錨・ES はそれ以外の枠を動かす）。
// ★これにより θ0=自然 s のとき override は現行 production（prodOverride 適用）に厳密一致＝単調安全の錨。
function overrideFor(cfg, keys, theta){
  const ov={}; for(let i=0;i<keys.length;i++) ov[keys[i]] = Math.max(1, Math.round(theta[i]));
  Object.assign(ov, cfg.prodOverride);   // production 錨キーは固定（θで動かさない）
  return ov;
}

// 訓練集約 fitness: 訓練 config の proxy比(θ/θ0) の平均（最悪保護に min も併記）。
function fitness(keys, theta, base, evalFn){
  const ratios=[];
  for(const cfg of CONFIGS){ if(cfg.hold) continue;
    applyConfig(cfg); setStaticOverride(overrideFor(cfg, keys, theta));
    ratios.push(evalFn() / base[cfg.name]);
  }
  const mean=ratios.reduce((a,b)=>a+b,0)/ratios.length;
  return {mean, min:Math.min(...ratios)};
}

// ============================================================================
// 実行
// ============================================================================
// ⚠ 計測事実（本harness起票時）: proxy(静的greedy)≈11ms / full(単一ビーム)≈4.5s(N=3)〜38s(N=10)。
//   ∴ ES の内側ループは **proxy のみ実用**（full を内側に置くと数百eval×数十sで非現実的）。full/prod は
//   **勝者と baseline の最終verifyだけ**に使う。これは PHASE7_ML_PLAN §4.8「proxyとfullの不一致」を実測で
//   検証する構図そのもの: 「proxyで上がった s が full/prod(=production代表)へ転移するか」を Go/No-go が判定する。
//   POC_VERIFY=0 で最終 prod verify を省略し proxy 比のみの高速スモークにできる。
const VERIFY = (process.env.POC_VERIFY ?? '1') !== '0';
const t0=Date.now();
const {keys, theta0} = buildTheta();
const d=keys.length;
// per-座標 変異スケール（s値のオーダーに比例）。
const scale = theta0.map(v => Math.max(2, 0.15*Math.abs(v)));

console.log(`[ml-fit A2] N=${N} dim=${d} gen=${GEN} λ=${LAMBDA} seed=${SEED} verify=${VERIFY}`);
console.log(`  θ keys(${d}): ${keys.join(',')}`);

// baseline（θ0=自然 s＋prodOverride）の各 config proxy。ES正規化の分母。
const baseProxy={};
for(const cfg of CONFIGS){ applyConfig(cfg); setStaticOverride(overrideFor(cfg, keys, theta0)); baseProxy[cfg.name]=proxyDmg(); }

// (1+λ)-ES（エリート・1/5成功則）で proxy 集約 fitness を最大化。
let parent=theta0.slice();
let fParent=fitness(keys, parent, baseProxy, proxyDmg).mean;
let sigma=SIGMA0;
for(let g=0; g<GEN; g++){
  let succ=0, best=null;
  for(let i=0;i<LAMBDA;i++){
    const x=parent.map((m,k)=>Math.max(1, m + sigma*scale[k]*gauss()));
    const f=fitness(keys, x, baseProxy, proxyDmg).mean;
    if(f>fParent) succ++;
    if(!best||f>best.f) best={x,f};
  }
  if(best && best.f>fParent){ parent=best.x; fParent=best.f; }   // エリート更新（訓練上退行しない）
  const ps=succ/LAMBDA;                                          // 1/5成功則
  sigma *= ps>0.2 ? 1.5 : (ps<0.2 ? 0.85 : 1.0);
  if((g+1)%5===0 || g===GEN-1) console.log(`    gen ${String(g+1).padStart(3)}/${GEN}: proxy fitness=${fParent.toFixed(5)}  σ=${sigma.toFixed(3)}  succ=${succ}/${LAMBDA}`);
}
console.log(`  proxy集約 fitness: baseline=1.00000 → fitted=${fParent.toFixed(5)} (訓練mean比)  σ_final=${sigma.toFixed(3)}`);

// 勝者 θ* のうち θ0 から動いた枠（本採用時の override 素案・以降の判定にも使う）。
const diff={};
for(let i=0;i<keys.length;i++){ const a=Math.round(theta0[i]), b=Math.max(1,Math.round(parent[i])); if(a!==b) diff[keys[i]]=`${a}→${b}`; }

// 最終 verify: production 代表 prod（golden同型・単一ビーム+C27リファイン）で base vs fit を全 config 比較。
const rows=[];
if(VERIFY){
  console.log(`  ---- 最終verify（prod=production代表・各評価≈${N>=10?'~38s':'数s'}）----`);
  for(const cfg of CONFIGS){
    applyConfig(cfg);
    setStaticOverride(overrideFor(cfg, keys, theta0)); const bP=prodDmg();
    setStaticOverride(overrideFor(cfg, keys, parent));  const fP=prodDmg();
    rows.push({cfg:cfg.name, hold:cfg.hold, bProd:bP.dmg, fProd:fP.dmg, bFb:bP.fb, fFb:fP.fb});
    console.log(`    ${cfg.name} verify 済 (base FB=${bP.fb} fit FB=${fP.fb})`);
  }
}
setStaticOverride({});

console.log(`  θ* diff(θ0→θ*): ${Object.keys(diff).length?JSON.stringify(diff):'(なし＝θ0=baseline・proxyで改善見つからず)'}`);

if(!VERIFY){
  console.log(`  (POC_VERIFY=0: 最終 prod verify 省略。proxy 訓練 fitness=${fParent.toFixed(5)} のみ・Go/No-go 未判定)`);
  console.log(`  => スモーク完了   (${((Date.now()-t0)/1000).toFixed(1)}s)`);
} else {
  const pad=(s,n)=>String(s).padEnd(n); const padL=(s,n)=>String(s).padStart(n);
  console.log(`  ---- 最終verify結果（prod=production代表）----`);
  console.log(`  ${pad('config',12)} ${pad('set',9)} ${padL('base(prod)',16)} ${padL('fit(prod)',16)} ${padL('Δ%',8)}  FB(b→f)`);
  for(const r of rows){
    console.log(`  ${pad(r.cfg,12)} ${pad(r.hold?'HOLD-OUT':'train',9)} ${padL(fmt(r.bProd),16)} ${padL(fmt(r.fProd),16)} ${padL(pct(r.fProd,r.bProd).toFixed(3),8)}  ${r.bFb}→${r.fFb}`);
  }
  // Go/No-go ゲート判定。
  const train=rows.filter(r=>!r.hold), holdo=rows.filter(r=>r.hold);
  const trainMinΔ=Math.min(...train.map(r=>pct(r.fProd,r.bProd)));
  const trainMaxΔ=Math.max(...train.map(r=>pct(r.fProd,r.bProd)));
  const holdMinΔ = holdo.length?Math.min(...holdo.map(r=>pct(r.fProd,r.bProd))):0;
  const fbOk = rows.every(r=>r.fFb>=r.bFb);
  const G1 = trainMaxΔ > 0.0001;               // 訓練で有意な上積みがあるか（閾は運用判断・ここでは>0）
  const G2 = holdo.every(r=>pct(r.fProd,r.bProd) >= -1e-6);  // hold-out 退行なし
  console.log(`  ---- ゲート ----`);
  console.log(`  G1 訓練上積み: train Δ% = [min ${trainMinΔ.toFixed(3)}, max ${trainMaxΔ.toFixed(3)}]  → ${G1?'上積みあり':'上積みなし'}`);
  console.log(`  G2 汎化(hold-out非退行): hold-out min Δ% = ${holdMinΔ.toFixed(3)}  → ${G2?'OK(退行なし)':'NG(退行!)'}`);
  console.log(`  G3 FB非退行: ${fbOk?'OK':'NG'}`);
  const verdict = (G1 && G2 && fbOk) ? 'GO（本採用検討: θ*反映→Cx再fit→golden更新）' :
                  (!G1 ? 'NO-GO（proxy最適解がfull/prodへ非転移 or 既存較正で飽和＝本Phaseクローズ or 別surrogate要）' : 'HOLD（訓練は改善するが汎化/FBで退行＝config拡充・正則化要）');
  console.log(`  => 判定: ${verdict}   (${((Date.now()-t0)/1000).toFixed(1)}s)`);
}
