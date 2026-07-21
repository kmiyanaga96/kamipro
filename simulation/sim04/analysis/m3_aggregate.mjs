// m3_aggregate.mjs — sim04 M3(旺盛) trial11〜13 の集計ヘルパ。
// 設計: T1捨て→T2通常(ムーンコードON・omni失効)→T3通常(ムーンコードOFF)。ヘカテーのT2/T3比で旺盛(mooncode)を分離。
// 会心=全hit(実効100%)。acute=急所(true=あり)。比較は同一急所層でマッチ(急所倍率相殺)。
// 実行: node simulation/sim04/analysis/m3_aggregate.mjs
// 注意: 実機集計のみ。cap判別(C32)の確定はfit段。ここは比の実測まで。

const CHARS=['edison','yamato','hecate','tetra','elaine'];
// 各trial: T2/T3 の [値,急所] を全hit（T1は参考=omniチェック用に一部のみ）
const D = {
 '11':{
   T2:{edison:[[612001,1]], yamato:[[411869,0]], hecate:[[570211,1],[573175,1],[474245,0]], tetra:[[494615,0]], elaine:[[545655,1],[545655,1]]},
   T3:{edison:[[593504,1]], yamato:[[496314,1]], hecate:[[506254,1]], tetra:[[566100,1],[543167,1]], elaine:[[549864,1]]},
 },
 '12':{
   T2:{edison:[[618601,1]], yamato:[[411838,0]], hecate:[[570189,1]], tetra:[[564969,1]], elaine:[[545860,1],[468011,0],[496960,0]]},
   T3:{edison:[[616687,1]], yamato:[[516560,1]], hecate:[[397681,0],[409855,0],[462609,1]], tetra:[[551686,1]], elaine:[[547038,1]]},
 },
 '13':{
   T2:{edison:[[602080,1]], yamato:[[489227,1]], hecate:[[555389,1],[561317,1],[579101,1]], tetra:[[550304,1]], elaine:[[565868,1],[551406,1],[571653,1]]},
   T3:{edison:[[616332,1]], yamato:[[516030,1]], hecate:[[481593,1]], tetra:[[458353,0],[568773,1]], elaine:[[546828,1],[572701,1],[549702,1]]},
 },
};
const ids=Object.keys(D);
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const pct=x=>(x*100).toFixed(2)+'%';
const acuteHits=(turn,ch,ac)=>turn[ch].filter(h=>h[1]===ac).map(h=>h[0]);

// 期待比（configB Gv=0.6876, vigor_mooncode=0.3552）
const Gv=0.6876, Dm=0.3552;
const r_flat=(1+Math.min(Gv+Dm,1.0))/(1+Gv);   // 一律100%cap（現行sim）
const r_two =(1+Math.min(Gv+Dm,2.0))/(1+Gv);    // 2段cap（C32）
console.log(`期待比: 一律cap=${r_flat.toFixed(4)}(+${pct(r_flat-1)}) / 2段cap=${r_two.toFixed(4)}(+${pct(r_two-1)})\n`);

// ヘカテー T2/T3（急所層マッチ・プール）
console.log('===== ヘカテー T2(mooncodeON) vs T3(OFF) =====');
for(const ac of [1,0]){
  const t2=[].concat(...ids.map(id=>acuteHits(D[id].T2,'hecate',ac)));
  const t3=[].concat(...ids.map(id=>acuteHits(D[id].T3,'hecate',ac)));
  const lbl=ac?'急所':'非急所';
  if(t2.length&&t3.length)
    console.log(`  ${lbl}: T2 mean=${Math.round(mean(t2)).toLocaleString()}(${t2.length}hit) / T3 mean=${Math.round(mean(t3)).toLocaleString()}(${t3.length}hit) → 比=${(mean(t2)/mean(t3)).toFixed(4)} (+${pct(mean(t2)/mean(t3)-1)})`);
  else console.log(`  ${lbl}: サンプル不足 (T2 ${t2.length}hit / T3 ${t3.length}hit)`);
}

// per-trial ヘカテー急所比（参考）
console.log('\n  per-trial（急所層）ヘカテー T2/T3:');
for(const id of ids){
  const t2=acuteHits(D[id].T2,'hecate',1), t3=acuteHits(D[id].T3,'hecate',1);
  if(t2.length&&t3.length) console.log(`   trial${id}: T2 ${Math.round(mean(t2)).toLocaleString()} / T3 ${Math.round(mean(t3)).toLocaleString()} = ${(mean(t2)/mean(t3)).toFixed(4)}`);
  else console.log(`   trial${id}: 急所層サンプル不足`);
}

// 内蔵対照: 他4人 T2/T3（急所層・mooncode非対象なら≒1.0のはず）
console.log('\n===== 内蔵対照（mooncode専用検証）他4人 T2/T3 急所層 =====');
for(const ch of CHARS.filter(c=>c!=='hecate')){
  const t2=[].concat(...ids.map(id=>acuteHits(D[id].T2,ch,1)));
  const t3=[].concat(...ids.map(id=>acuteHits(D[id].T3,ch,1)));
  if(t2.length&&t3.length) console.log(`  ${ch}: T2 ${Math.round(mean(t2)).toLocaleString()}(${t2.length}) / T3 ${Math.round(mean(t3)).toLocaleString()}(${t3.length}) = ${(mean(t2)/mean(t3)).toFixed(4)} (+${pct(mean(t2)/mean(t3)-1)})`);
  else console.log(`  ${ch}: 急所層サンプル不足(T2 ${t2.length}/T3 ${t3.length})`);
}

// 急所倍率の目安（T3・非mooncode・ヘカテー以外プールで acute/non-acute）
console.log('\n===== 参考: 通常の急所倍率（T3プール・全キャラ） =====');
{ const ac=[], nac=[];
  for(const id of ids) for(const ch of CHARS){ acuteHits(D[id].T3,ch,1).forEach(v=>ac.push(v)); acuteHits(D[id].T3,ch,0).forEach(v=>nac.push(v)); }
  if(ac.length&&nac.length) console.log(`  急所 mean=${Math.round(mean(ac)).toLocaleString()}(${ac.length}) / 非急所 mean=${Math.round(mean(nac)).toLocaleString()}(${nac.length}) → 急所寄与 +${pct(mean(ac)/mean(nac)-1)}（※DA/TA混在の粗い目安）`);
}
