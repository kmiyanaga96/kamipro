// LS インクリメンタル replay（`_LSReplay`・2026-08-01）の**結果不変性**検証＋速度実測。★リポジトリ非改変
//
// 検証すること:
//   ①`_LSReplay.dmgOf(cand)` が full replay `_replayResult(cand,n).dmg` と **ビット一致**すること
//     （LS の全近傍種＝ターン内move / ターン内swap / ターン跨ぎswap を網羅サンプリング）。
//   ②受理直後（rebase 後）も①が保たれること＝スナップショット張り直しの正しさ。
//   ③1評価あたりの実測コスト比（= 期待できる高速化倍率）。
//
// 実行: node tools/exp_ls_incremental_verify.mjs
import { Sim, buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG,
         setCurrentSubs, displayAtkOverrideFor, setStaticOverride,
         _replayResult, _LSReplay } from '/home/user/kamipro/src/app.js';

const n=10, log=s=>process.stdout.write(s+'\n');
let fails=0;

// 10T の基準ルートをビーム（production と同じ planDepth=0 経路）で取る。
function beamRoute(label){
  const s=new Sim(); const keys=[]; const t0=Date.now();
  for(let t=1;t<=n;t++) keys.push(s.takeTurn(t).keys);
  log(`${label} ビーム 10T: ${((Date.now()-t0)/1000).toFixed(1)}s  dmg=${Math.round(s.dmg)}`);
  return keys;
}

function neighborhood(cur){
  const out=[];
  for(let t=0;t<n;t++){
    const L=cur[t].length;
    for(let i=0;i<L;i++) for(let j=0;j<L;j++){ if(i===j) continue;
      const c=cur.map(a=>a.slice()); const [k]=c[t].splice(i,1); c[t].splice(j,0,k); out.push(['move',t,c]); }
    for(let i=0;i<L;i++) for(let j=i+1;j<L;j++){
      const c=cur.map(a=>a.slice()); [c[t][i],c[t][j]]=[c[t][j],c[t][i]]; out.push(['swap',t,c]); }
  }
  for(let t1=0;t1<n;t1++) for(let t2=t1+1;t2<n;t2++)
    for(let i=0;i<cur[t1].length;i++) for(let j=0;j<cur[t2].length;j++){
      if(cur[t1][i]===cur[t2][j]) continue;
      const c=cur.map(a=>a.slice()); [c[t1][i],c[t2][j]]=[c[t2][j],c[t1][i]]; out.push(['xswap',t1,c]); }
  return out;
}

// 決定的な間引き（毎回同じ部分集合を見る＝再現性）。
function stride(arr, want){
  if(arr.length<=want) return arr;
  const step=arr.length/want, out=[];
  for(let i=0;i<want;i++) out.push(arr[Math.floor(i*step)]);
  return out;
}

function verify(label, route, sample){
  log(`\n── ${label} ──`);
  const rc=new _LSReplay(n);
  const baseDmg=rc.rebase(route);
  const full0=_replayResult(route, n).dmg;
  log(`  base dmg  incr=${baseDmg}  full=${full0}  ${baseDmg===full0?'一致':'★不一致'}`);
  if(baseDmg!==full0) fails++;

  const cands=stride(neighborhood(route), sample);
  const byKind={};
  let mismatch=0, tIncr=0, tFull=0;
  for(const [kind,,c] of cands){
    const a=Date.now(); const di=rc.dmgOf(c); tIncr+=Date.now()-a;
    const b=Date.now(); const df=_replayResult(c, n).dmg; tFull+=Date.now()-b;
    byKind[kind]=(byKind[kind]||0)+1;
    if(di!==df){ mismatch++; if(mismatch<=3) log(`  ★不一致 kind=${kind} incr=${di} full=${df} diff=${di-df}`); }
  }
  log(`  候補 ${cands.length} 件（${Object.entries(byKind).map(([k,v])=>`${k}:${v}`).join(' / ')}）`);
  log(`  一致 ${cands.length-mismatch}/${cands.length}${mismatch?' ★NG':' ✅'}`);
  if(mismatch) fails++;
  log(`  実測 incr=${(tIncr/cands.length).toFixed(2)}ms/eval  full=${(tFull/cands.length).toFixed(2)}ms/eval  → ×${(tFull/Math.max(tIncr,1)).toFixed(2)}`);

  // ②受理を模して rebase し直し、その直後も一致することを確認する。
  const accepted=cands[Math.floor(cands.length/2)][2];
  rc.rebase(accepted);
  let m2=0;
  for(const [,,c] of stride(neighborhood(accepted), Math.min(200, sample))){
    if(rc.dmgOf(c)!==_replayResult(c, n).dmg) m2++;
  }
  log(`  rebase 後の一致: ${m2===0?'✅ 全一致':`★NG ${m2} 件不一致`}`);
  if(m2) fails++;
}

// ── config A: edison（golden 編成・default gear）──
buildFormation('edison', ['yamato','hecate','tetra','elaine']);
setStaticOverride({});
verify('edison / raw / default gear', beamRoute('edison'), 600);

// ── config C: napoleon（両面宿儺・abilCapPerTurn=19 を含む条件）──
const GEAR_C={assault:3.06,elem:0.54,vigor:0.6876,spec:0,dmgup:0,acute:0.144,crit_rate:0.405,other:0,
              na_dmg:1.116,abi_dmg:2.52,burst_dmg:5.22,na_cap:0.36,abi_cap:0.99,burst_cap:2.016};
setCurrentSubs(['freyja_christmas','artemis']);
buildFormation('napoleon',['hecate','tetra','arianrhod','elaine']);
applyEnemy('ryomen_sukuna');
for(const k of Object.keys(GEAR)) GEAR[k]=GEAR_C[k]??0;
DMG.betaia_mult=3.5; DMG.betaia_cap=800000; DMG.napo_burst_cd_reduce=true;
recalcGearK(); recalcGearKCFromDispAtk(displayAtkOverrideFor('napoleon'));
setStaticOverride({pactcore:1,effond:120});
verify('napoleon / configC / 両面宿儺（abilCap19）', beamRoute('napoleon'), 400);

log(`\n[結果] ${fails===0?'✅ 全検証パス（結果不変）':`★ ${fails} 項目 NG`}`);
process.exit(fails===0?0:1);
