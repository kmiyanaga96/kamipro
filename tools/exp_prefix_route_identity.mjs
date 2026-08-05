// C1: 実験1 §2 の「中位7本（総ダメ完全同値 1,939,037,920）は同一ルートへ合流しているか」を確認する。
//   実験1ではキー列を保存していなかったため「推定」のまま未検証だった主張を潰す。
//   手続き: 中位prefix の複数本を再探索し、キー列を厳密比較（ターン毎・位置毎）。
// 条件: napoleon/configC/両面宿儺（実験1 と同一・cap=19）・BW64・n=10
// ★リポジトリ非改変
//
// ⚠ 旧版は config を**最古 GEAR でハードコード**していた（2026-08-05 に台帳駆動へ移行＝REPO_STANDARDS §6 E10）。
//   ∴ TARGETS の「中位7本」という分類も**旧 config での順位**＝現行 config では中位の顔ぶれが変わりうる。要再取得。
import { _runRootPlan } from '../src/app.js';
import { loadConfigC, verifyE2, configBanner } from './lib/config_c.mjs';
const n=10, log=s=>process.stdout.write(s+'\n');
// 中位7本のうち代表3本（空prefix・puvoir・knights）＋対照として上位1本（factor）★旧 config での分類
const TARGETS=[[], ['puvoir'], ['knights'], ['factor']];
const cfg=loadConfigC(); log(configBanner(cfg)); verifyE2(cfg);

log('C1: 中位7本は同一ルートか（キー列の厳密比較）');
const res=[];
for(const p of TARGETS){
  const t0=Date.now();
  const r=_runRootPlan(p,n);
  const keys=r.rows.map(x=>x.keys);
  res.push({p, dmg:r.dmg, keys, sig:JSON.stringify(keys)});
  log(`  [${p.join(',')||'(空)'}] dmg=${Math.round(r.dmg).toLocaleString()} (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}
log('\n=== キー列の一致判定（基準=(空)prefix）===');
const base=res[0];
for(const r of res.slice(1)){
  const same = r.sig===base.sig;
  let detail='';
  if(!same){
    // どのターンで最初に食い違うか
    let firstDiff=-1, posSame=0, tot=0;
    for(let t=0;t<n;t++){
      const x=base.keys[t]||[], y=r.keys[t]||[], L=Math.max(x.length,y.length);
      for(let i=0;i<L;i++){ tot++; if(x[i]&&y[i]&&x[i]===y[i]) posSame++; }
      if(firstDiff<0 && JSON.stringify(x)!==JSON.stringify(y)) firstDiff=t+1;
    }
    detail=` / 最初の相違=T${firstDiff} / 同位置一致${(posSame/tot*100).toFixed(1)}%`;
  }
  const dmgSame = Math.round(r.dmg)===Math.round(base.dmg);
  log(`  [${r.p.join(',')||'(空)'}] : キー列${same?'★完全同一':'相違あり'} / 総ダメ${dmgSame?'同値':'相違'}${detail}`);
}
log('\n=== 結論 ===');
const mid=res.slice(0,3);
const allSame=mid.every(r=>r.sig===mid[0].sig);
log(`  中位3本（空/puvoir/knights）: ${allSame?'★キー列まで完全同一＝同一ルートへ合流を確認（推定が正しかった）'
   :'キー列は異なる＝総ダメ同値だが別ルート（「合流」の推定は誤り＝プラトー上の別解が同値だった）'}`);
