// m2_aggregate.mjs — sim04 M2a(judg単独) trial04〜10 の集計ヘルパ。
// judg ph0 = テトラのアビ枠10hit。会心は全hit true(実機観測)。acute=急所有無(true=あり)。
// 実行: node simulation/sim04/analysis/m2_aggregate.mjs
// 注意: 実機データの集計のみ。加算/乗算判別(C31)のスカラfitは構造修正後(README §3)。ここは絶対値・スロープ・cap飽和の観測まで。

// N = judg押下時の droid_buf スタック(=ロボ反応回数)。confound列に判別を汚す同時付与を明記。
const JUDG = {
  // N=0（戦闘開始#1・droidなし。omni/mooncode有効）
  '04': { N:0, hits:[444600,441564,427519,437009,439286,438527,429417,444600,440045,427519],
          acute:[1,1,0,1,1,1,0,1,1,0], confound:'なし(素のN=0)' },
  '05': { N:0, hits:[426886,437009,443082,440804,440045,443082,440804,442323,442323,437009],
          acute:[0,1,1,1,1,1,1,1,1,1], confound:'なし(素のN=0)' },
  '06': { N:0, hits:[438527,425621,441564,437009,441564,443841,437768,431315,443082,438527],
          acute:[1,0,1,1,1,1,1,0,1,1], confound:'なし(素のN=0)' },
  // N=1（droid→alone(赤反応1)→judg。defdownなし＝clean droid+1）
  '07': { N:1, hits:[442215,447535,441435,443735,429422,435122,446775,446775,446015,436056],
          acute:null, confound:'なし(alone=赤反応のみ・defdown無)。※急所列が11個で1個過剰＝acute分割から除外' },
  '08': { N:1, hits:[442215,447535,441455,443735,429422,435122,446775,446775,446015,436056],
          acute:null, confound:'なし。※trial07とほぼ同値(hit3のみ441435→441455)＝独立走か要確認' },
  // N=2（droid→alone→effond(赤反応2)→judg。effondがデバフ(敵防御DOWN)を付与＝judgに乗る＝confound）
  '09': { N:2, hits:[458078,462300,458922,457233,459767,446818,462300,442595,459767,462300],
          acute:[1,1,1,1,1,0,1,0,1,1], confound:'⚠effond_def(敵防御DOWN)有効＝droid+2とデバフの二重変化' },
  '10': { N:2, hits:[461454,461454,455543,446113,462298,461454,454698,460609,457232,458076],
          acute:[1,1,1,0,1,1,1,1,1,1], confound:'⚠effond_def(敵防御DOWN)有効' },
};

// 付随データ(M2aの副産物・C5/C3追撃・burst-with-omniの一次記録)
const INCIDENTAL = {
  '07': { alone:{body:3494968, extra:1589815, robo:1438795} },
  '08': { alone:{body:3494968, extra:1589815, robo:1438795} },
  '09': { alone:{body:3480464, extra:1570524, robo:1462293}, effond:{abi:721934, body:3514788, extra:2160930, robo:1486790} },
  '10': { alone:{body:3516724, extra:1587400, robo:1454384}, effond:{abi:721151, body:3538211, extra:2117277, robo:1494094} },
};

const sum=a=>a.reduce((x,y)=>x+y,0), mean=a=>sum(a)/a.length;
const pct=x=>(x*100).toFixed(2)+'%';
const stat=a=>{const m=mean(a);return{mean:m,min:Math.min(...a),max:Math.max(...a),rngPct:(Math.max(...a)-Math.min(...a))/m,cv:Math.sqrt(sum(a.map(v=>(v-m)**2))/a.length)/m};};

console.log('===== per-trial judg ph0 =====');
for(const id of Object.keys(JUDG)){
  const d=JUDG[id]; const s=stat(d.hits);
  let na='—', ac='—';
  if(d.acute){ const nonac=d.hits.filter((_,i)=>d.acute[i]===0), acu=d.hits.filter((_,i)=>d.acute[i]===1);
    na=nonac.length?Math.round(mean(nonac)).toLocaleString()+`(${nonac.length}hit)`:'なし';
    ac=acu.length?Math.round(mean(acu)).toLocaleString()+`(${acu.length}hit)`:'なし'; }
  console.log(`trial${id} N=${d.N}: 合計=${sum(d.hits).toLocaleString()} mean=${Math.round(s.mean).toLocaleString()} 幅=${pct(s.rngPct)} CV=${pct(s.cv)} | 非急所mean=${na} 急所mean=${ac} | ${d.confound}`);
}

console.log('\n===== N水準別プール =====');
const byN={};
for(const id of Object.keys(JUDG)){const d=JUDG[id];(byN[d.N]??=[]).push(id);}
const Nmean={}, Nnonac={};
for(const N of Object.keys(byN)){
  const ids=byN[N]; const allhits=[].concat(...ids.map(id=>JUDG[id].hits));
  Nmean[N]=mean(allhits);
  const nonac=[].concat(...ids.filter(id=>JUDG[id].acute).map(id=>JUDG[id].hits.filter((_,i)=>JUDG[id].acute[i]===0)));
  Nnonac[N]=nonac.length?mean(nonac):null;
  console.log(`N=${N}: trials[${ids.join(',')}] 全hit mean=${Math.round(Nmean[N]).toLocaleString()} (${allhits.length}hit) | 非急所プールmean=${Nnonac[N]?Math.round(Nnonac[N]).toLocaleString()+`(${nonac.length}hit)`:'算出不可(acute欠)'}`);
}

console.log('\n===== droidスロープ / defdown寄与 =====');
console.log(`全hit mean: N0=${Math.round(Nmean[0]).toLocaleString()} N1=${Math.round(Nmean[1]).toLocaleString()} N2=${Math.round(Nmean[2]).toLocaleString()}`);
console.log(`  N0→N1(clean droid+1・defdown無): ${pct((Nmean[1]-Nmean[0])/Nmean[0])} /反応`);
console.log(`  N0→N2(droid+2 ＋ effond_defdown): ${pct((Nmean[2]-Nmean[0])/Nmean[0])}`);
const droidExpectN2=2*(Nmean[1]-Nmean[0])/Nmean[0];
console.log(`  ⇒ N2からdroid線形分(2×${pct((Nmean[1]-Nmean[0])/Nmean[0])}=${pct(droidExpectN2)})を差引いた残差≒effond_defdown寄与: ${pct((Nmean[2]-Nmean[0])/Nmean[0]-droidExpectN2)}`);
console.log(`非急所anchor(cap飽和検証・N0): mean=${Math.round(Nnonac[0]).toLocaleString()} ＝この編成でのjudg ph0の"素のcap高さ"アンカー`);

console.log('\n===== 付随データ(C5/C3追撃・burst-with-omni) =====');
for(const id of Object.keys(INCIDENTAL)){const x=INCIDENTAL[id];
  let s=`trial${id}: alone[body ${x.alone.body.toLocaleString()} / 追加 ${x.alone.extra.toLocaleString()} / ロボ追撃 ${x.alone.robo.toLocaleString()}]`;
  if(x.effond) s+=` | effond[abi ${x.effond.abi.toLocaleString()} / body ${x.effond.body.toLocaleString()} / 追加 ${x.effond.extra.toLocaleString()} / ロボ追撃 ${x.effond.robo.toLocaleString()}]`;
  console.log(s);
}
const robos=[1438795,1438795,1462293,1486790,1454384,1494094];
console.log(`ロボ追撃プール(6発): mean=${Math.round(mean(robos)).toLocaleString()} 範囲 ${Math.min(...robos).toLocaleString()}〜${Math.max(...robos).toLocaleString()}`);
