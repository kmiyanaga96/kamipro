// sim03 rollup 用 trial横断突合スクリプト（P3: 再現可能な集計器・rollup層専用）。
//   実行: node simulation/sim03/analysis/rollup_xtrial.mjs        （リポジトリルートから）
// 責務: data/trial01〜05.md を押下(slot)・hit レベルで機械照合し、rollup（quantitative_analysis.md）
//   に載せる markdown 表を stdout へ出す。per_trial 層(parse_trials.mjs)がターン集計なのに対し、
//   本スクリプトは trial横断ならではの分析（決定性・急所層別・max_hp区間・急所倍率の自然実験）を担当。
// 出力:
//   A) slot×hit 全数表（5走の値・急所マーク・スプレッド）
//   B) 決定性サマリ（急所マーク一致群 vs 不一致群のスプレッド分布）
//   C) 急所倍率の自然実験（同一hitで あり/なし が混在するslotの比）
//   D) max_hp 区間（HP%丸め幅 + 撃破オーバーキル上下界 + 交差）
//   E) 反撃・DOT・通常攻撃連撃(hit数)の横断表
import fs from 'fs';
const DIR = 'simulation/sim03/data';
const NAMES = ['01','02','03','04','05'];
const num = s => Number(String(s).replace(/[, ]/g,'')) || 0;
const nums = s => (String(s).match(/\d[\d,]*/g)||[]).map(num);
const fmt = n => n==null?'—':Math.round(n).toLocaleString();
const consume = c => c.includes('三段')?3 : c.includes('二段')?2 : 1;

// マークセルを hit数 n に展開（'すべて'→全あり／'なし'のみ→全なし／'あり + なし'等→列挙）
function marks(cell, n){
  cell=cell.trim();
  if(cell.includes('すべて')) return Array(n).fill(true);
  const toks=(cell.match(/あり|なし/g)||[]);
  if(toks.length===0) return Array(n).fill(null);
  if(toks.length===1) return Array(n).fill(toks[0]==='あり');
  const a=toks.map(t=>t==='あり');
  while(a.length<n) a.push(null);
  return a.slice(0,n);
}

// 1 trial を slot/hit レベルへ分解
function parseTrial(name){
  const lines=fs.readFileSync(`${DIR}/trial${name}.md`,'utf8').split('\n');
  const secIdx=k=>lines.findIndex(l=>l.startsWith(`## ${k} 記録`));
  const bounds=[['T1',secIdx('T1')],['T2',secIdx('T2')],['T3',secIdx('T3')]].filter(b=>b[1]>=0);
  const turns={};
  for(let i=0;i<bounds.length;i++){
    const [tn,st]=bounds[i]; const en=i+1<bounds.length?bounds[i+1][1]:lines.length;
    const seg=lines.slice(st,en);
    const slots=[]; const meta={};
    for(const ln of seg){
      if(!ln.startsWith('|')) continue;
      const c=ln.split('|').map(s=>s.trim());
      if(c.length<7) continue;
      const idx=c[1]; if(idx==='押下#'||idx.startsWith('---')) continue;
      const keyCell=c[2], compCell=c[3], valCell=c[4], critCell=c[5], acuteCell=c[6];
      if(valCell==='なし'||!/\d/.test(valCell)) continue;
      const hits=[];
      if(idx.includes('攻撃フェイズ')){
        const chars=keyCell.split('/').map(s=>s.trim());
        const groups=valCell.split('/').map(s=>s.trim());
        const critGroups=critCell.split('/').map(s=>s.trim());
        const acuteGroups=acuteCell.split('/').map(s=>s.trim());
        let cg=groups, streakVal=null;
        if(!groups[groups.length-1].includes('+')){ streakVal=num(groups[groups.length-1]); cg=groups.slice(0,-1); }
        cg.forEach((g,gi)=>{
          const p=nums(g); const ch=chars[gi]||`grp${gi}`;
          const cm=marks(critGroups[gi]||'',p.length), am=marks(acuteGroups[gi]||'',p.length);
          p.forEach((v,hi)=>hits.push({label:`${ch}:${hi===0?'burst':'extra'}`, v, crit:cm[hi], acute:am[hi]}));
        });
        if(streakVal!=null) hits.push({label:'streak', v:streakVal, crit:true, acute:true});
        slots.push({press:'ATK', key:'(攻撃フェイズ)', hits});
        continue;
      }
      const comps=compCell.split('/').map(s=>s.trim()); const vals=nums(valCell);
      const nAll=vals.length;
      const cm=marks(critCell,nAll), am=marks(acuteCell,nAll);
      let vi=0;
      for(const cc of comps){
        const n=consume(cc);
        for(let k=0;k<n&&vi<vals.length;k++){
          hits.push({label:n>1?`${cc}[${k+1}]`:cc, v:vals[vi], crit:cm[vi], acute:am[vi]}); vi++;
        }
      }
      slots.push({press:num(idx), key:keyCell.replace(/\s+/g,' '), hits});
    }
    const line=(inc)=>seg.find(l=>l.includes(inc))||'';
    meta.hpStart=num((line('開始時ボスHP%').match(/(\d+)/)||[])[1]);
    const he=line('終了時ボスHP%'); meta.hpEnd = he? num((he.match(/(\d+)\s*%/)||[])[1]) : null;
    const d=line('DOTダメージ').match(/(\d+)万×(\d+)/); meta.dot=d?num(d[1])*10000*num(d[2]):0;
    const cl=line('反撃ダメージ'); meta.counter=(cl&&!/:\s*なし/.test(cl))?((cl.split(':')[1]||'').match(/\d[\d,]{3,}/g)||[]).reduce((a,b)=>a+num(b),0):0;
    meta.kill=(line('撃破ターン').split(':')[1]||'').trim();
    turns[tn]={slots, meta};
  }
  return turns;
}

const trials=Object.fromEntries(NAMES.map(n=>[n,parseTrial(n)]));

// ===== A) slot×hit 全数表 =====
// slot 対応付け: (turn, press#, key) は固定押し順のため全 trial で一致。hit は同 index で対応。
// 通常攻撃の連撃(単発/三段)は hit数が trial 間で異なる＝slot単位で hit数も出す。
console.log('## A. slot×hit 全数表（5走・値/急所・スプレッド）\n');
const detRows=[];  // 決定性集計用 {allAcuteEqual, spreadRel, ...}
const acuteExp=[]; // 急所自然実験用
for(const tn of ['T1','T2','T3']){
  console.log(`### ${tn}\n`);
  console.log('| slot | hit | '+NAMES.map(n=>'tr'+n).join(' | ')+' | 急所(5走) | max−min | spread% |');
  console.log('|---|---|'+NAMES.map(()=>'--:').join('|')+'|:--:|--:|--:|');
  // press 集合（全trialの和集合・出現順）
  const order=[]; const seen=new Set();
  for(const n of NAMES) for(const s of (trials[n][tn]?.slots||[])){ const id=String(s.press); if(!seen.has(id)){seen.add(id); order.push({press:s.press, key:s.key});} }
  for(const o of order){
    const per=NAMES.map(n=>(trials[n][tn]?.slots||[]).find(s=>String(s.press)===String(o.press))||null);
    // hit 整列: 連撃数が trial 間で異なる押下（通常攻撃 単発/三段）があるため、index でなく
    // 正規化ラベル（通常→'通常[k]'・他は成分名[k]）＋出現順で対応付ける。
    const normHits=p=>{ if(!p) return {}; const cnt={}, out={};
      for(const h of p.hits){ const base=h.label.includes('通常')?'通常':h.label.replace(/\[\d+\]$/,'');
        cnt[base]=(cnt[base]||0)+1; out[`${base}[${cnt[base]}]`]=h; } return out; };
    const dicts=per.map(normHits);
    const labels=[]; const lseen=new Set();
    for(const d of dicts) for(const l of Object.keys(d)) if(!lseen.has(l)){ lseen.add(l); labels.push(l); }
    for(const label of labels){
      const hs=dicts.map(d=>d[label]||null);
      const vs=hs.map(h=>h?h.v:null);
      const as=hs.map(h=>h?h.acute:null);
      // v=0 はオーバーキル切断（撃破後の空hit）＝ダメージ観測ではないため統計から除外
      const present=vs.filter(v=>v!=null&&v>0);
      const mn=Math.min(...present), mx=Math.max(...present);
      const spread=present.length>1?(mx-mn)/mn*100:null;
      const aTxt=as.map((a,i)=>vs[i]===0?'0':a==null?'·':a?'あ':'×').join('');
      console.log(`| ${tn}#${o.press} ${o.key} | ${label} | ${vs.map(fmt).join(' | ')} | ${aTxt} | ${present.length>1?fmt(mx-mn):'—'} | ${spread!=null?spread.toFixed(2):'—'} |`);
      if(present.length>1){
        const marksPresent=as.filter((a,i)=>vs[i]!=null&&vs[i]>0);
        const allEq=marksPresent.every(a=>a===marksPresent[0]&&a!=null);
        detRows.push({slot:`${tn}#${o.press}`, label, allAcuteEqual:allEq, spread, n:present.length});
        // 急所 あり/なし 混在 → 倍率の自然実験
        const yes=vs.filter((v,i)=>v!=null&&v>0&&as[i]===true), no=vs.filter((v,i)=>v!=null&&v>0&&as[i]===false);
        if(yes.length&&no.length){
          const r=(yes.reduce((a,b)=>a+b,0)/yes.length)/(no.reduce((a,b)=>a+b,0)/no.length);
          acuteExp.push({slot:`${tn}#${o.press}`, label, yes:yes.length, no:no.length, ratio:r});
        }
      }
    }
    // hit数不一致（連撃RNG）の検出
    const counts=per.map(p=>p?p.hits.length:null).filter(c=>c!=null);
    if(new Set(counts).size>1) console.log(`| ${tn}#${o.press} ${o.key} | **hit数不一致** | ${per.map(p=>p?p.hits.length:'—').join(' | ')} |  |  |  |`);
  }
  console.log('');
}

// ===== B) 決定性サマリ =====
console.log('## B. 決定性サマリ（急所マーク層別スプレッド）\n');
const grp=(rows)=>{ if(!rows.length) return '—';
  const s=rows.map(r=>r.spread).sort((a,b)=>a-b);
  const q=p=>s[Math.min(s.length-1,Math.floor(p*s.length))];
  return `n=${s.length} / median=${q(0.5).toFixed(2)}% / p90=${q(0.9).toFixed(2)}% / max=${s[s.length-1].toFixed(2)}%`; };
console.log(`- 急所マーク5走一致のhit: ${grp(detRows.filter(r=>r.allAcuteEqual))}`);
console.log(`- 急所マーク不一致(混在)のhit: ${grp(detRows.filter(r=>!r.allAcuteEqual))}`);
console.log(`- 全hit: ${grp(detRows)}\n`);

// ===== C) 急所倍率の自然実験 =====
console.log('## C. 急所倍率の自然実験（同一hitの あり平均/なし平均）\n');
console.log('| slot | hit | あり n | なし n | 比 |');
console.log('|---|---|--:|--:|--:|');
for(const e of acuteExp) console.log(`| ${e.slot} | ${e.label} | ${e.yes} | ${e.no} | ${e.ratio.toFixed(4)} |`);
const rs=acuteExp.map(e=>e.ratio);
if(rs.length) console.log(`\n幾何平均: ${Math.exp(rs.reduce((a,b)=>a+Math.log(b),0)/rs.length).toFixed(4)}（n=${rs.length}）\n`);

// ===== D) max_hp 区間推定 =====
// HP% は整数表示。表示規約が不明のため floor([p,p+1)) と round([p−0.5,p+0.5)) の両仮定で区間を出す。
// 撃破オーバーキル: GRAND−(撃破押下の合計) < max_hp ≦ GRAND（DOT/反撃は撃破ターンはなし）。
console.log('## D. max_hp 区間推定（trial毎の上下界と全trial交差）\n');
console.log('| trial | T1端HP% | T2端HP% | GRAND実ダメ | 撃破押下値 | OK下界(GRAND−撃破押下) | OK上界(GRAND) |');
console.log('|---|--:|--:|--:|--:|--:|--:|');
let lo=-Infinity, hi=Infinity;
const ratioEst=[];
for(const n of NAMES){
  const t=trials[n];
  const sum=tn=>((t[tn]?.slots||[]).reduce((a,s)=>a+s.hits.reduce((x,h)=>x+h.v,0),0))+(t[tn]?.meta.dot||0)+(t[tn]?.meta.counter||0);
  const g=sum('T1')+sum('T2')+sum('T3');
  const t3=t.T3.slots, last=t3[t3.length-1];
  const lastV=last.hits.reduce((a,h)=>a+h.v,0);
  lo=Math.max(lo,g-lastV); hi=Math.min(hi,g);
  console.log(`| tr${n} | ${t.T1.meta.hpEnd} | ${t.T2.meta.hpEnd} | ${fmt(g)} | ${fmt(lastV)} (${last.key}#${last.press}) | ${fmt(g-lastV)} | ${fmt(g)} |`);
  // HP%比ベース（floor/round 両仮定の区間）
  for(const [tn,hpFrom,hpTo] of [['T1',100,t.T1.meta.hpEnd],['T2',t.T1.meta.hpEnd,t.T2.meta.hpEnd]]){
    const real=sum(tn);
    ratioEst.push({n,tn,real,hpFrom,hpTo});
  }
}
console.log(`\n**オーバーキル交差（全trial）**: max_hp ∈ ( ${fmt(lo)} , ${fmt(hi)} ]\n`);
// HP%表示規約3仮定: floor（残p ∈ [p,p+1)）/ round（[p−0.5,p+0.5)）/ ceil（(p−1,p]・HPバーは0でない限り切上げが通例）。
console.log('| trial | 区間 | 実ダメ | 点推定(表示値そのまま) | floor仮定区間 | round仮定区間 | ceil仮定区間 |');
console.log('|---|---|--:|--:|---|---|---|');
for(const e of ratioEst){
  const pt=e.real/((e.hpFrom-e.hpTo)/100);
  // 消化割合 = (T開始残) − (T終了残)。T1開始100%は正確・T2開始はT1端の丸め幅を引き継ぐ。
  const iv=(w)=>{ // w=[lo,hi]: 真の残割合が 表示p に対し [p+w0, p+w1) にあるとする
    const fromLo=e.tn==='T2'?e.hpFrom+w[0]:100, fromHi=e.tn==='T2'?e.hpFrom+w[1]:100;
    const toLo=e.hpTo+w[0], toHi=e.hpTo+w[1];
    const dLo=fromLo-toHi, dHi=fromHi-toLo; // 消化割合の幅
    return [e.real/(dHi/100), e.real/(Math.max(0.01,dLo)/100)];
  };
  const f=iv([0,1]), r=iv([-0.5,0.5]), c=iv([-1,0]);
  console.log(`| tr${e.n} | ${e.tn} | ${fmt(e.real)} | ${fmt(pt)} | [${fmt(f[0])}, ${fmt(f[1])}) | [${fmt(r[0])}, ${fmt(r[1])}) | [${fmt(c[0])}, ${fmt(c[1])}) |`);
}
// ceil仮定 × オーバーキルの全交差
let cl=lo, ch=hi;
for(const e of ratioEst){ const fromLo=e.tn==='T2'?e.hpFrom-1:100, fromHi=e.tn==='T2'?e.hpFrom:100;
  const dLo=fromLo-e.hpTo, dHi=fromHi-(e.hpTo-1);
  cl=Math.max(cl, e.real/(dHi/100)); ch=Math.min(ch, e.real/(dLo/100)); }
console.log(`\n**ceil仮定×オーバーキルの全交差**: max_hp ∈ ( ${fmt(cl)} , ${fmt(ch)} ]`);

// ===== E) 反撃・DOT・連撃 =====
console.log('\n## E. 反撃・DOT・通常攻撃連撃の横断表\n');
console.log('| trial | T1 DOT | T2 DOT | T2 反撃(ヘカテー) | 撃破 | 通常攻撃hit数 T2#1/T2#13/T3#12 |');
console.log('|---|--:|--:|--:|---|---|');
for(const n of NAMES){
  const t=trials[n];
  const nh=(tn,press)=>{ const s=(t[tn]?.slots||[]).find(x=>String(x.press)===String(press)); return s? s.hits.filter(h=>h.label.includes('通常')).length : '—'; };
  console.log(`| tr${n} | ${fmt(t.T1.meta.dot)} | ${fmt(t.T2.meta.dot)} | ${fmt(t.T2.meta.counter)} | ${t.T3.meta.kill} | ${nh('T2',1)} / ${nh('T2',13)} / ${nh('T3',12)} |`);
}
