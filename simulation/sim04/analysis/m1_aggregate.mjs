// m1_aggregate.mjs — sim04 M1(無アビ素走) trial01〜03 の中間集計/横断集計ヘルパ。
// 目的: per_trial(trialNN_quant) と rollup(quantitative_analysis) の数値を手計算に頼らず再現可能に導出する。
// 入力: 下記 DATA（data/trial01-03.md の §1/§2 から転記した実機値・加工なし）。
// 実行: node simulation/sim04/analysis/m1_aggregate.mjs
// 注意: これは実機データの「集計」のみ。シム値との突合・スカラfitは構造修正(C31〜C35)後に別途行う(README §3)。

const MAX_HP = 400_000_000; // 敵DB確定値(cath_palug)

// acute: 各hitの急所有無(true=あり)。会心は全hit true(実機観測・ユーザー確定)。
const DATA = {
  '01': {
    T1: { // 通常攻撃(会心=全hit)
      edison: [[663445,1],[661359,1],[671790,1]],
      yamato: [[591417,1],[528999,0],[578721,1]],
      hecate: [[639904,1],[657016,1],[597034,0]],
      tetra:  [[618758,1],[622383,1],[566813,0]],
      elaine: [[638048,1],[558669,0],[623505,1]],
    },
    T2: { // フルバースト: body=本体, extra=追加(edisonのextraは英霊武器追撃)
      edison: { body:[3489346,1], extra:[2867354,1] },
      yamato: { body:[3015010,1] },
      hecate: { body:[3432953,1], extra:[2089250,1] },
      tetra:  { body:[3423699,1], extra:[2077453,1] },
      elaine: { body:[3443794,1], extra:[1502742,0] },
      streak: 9044777,
    },
    T3: {
      edison: [[544098,0],[569986,0],[544098,0]],
      yamato: [[438152,0]],
      hecate: [[505443,1]],
      tetra:  [[568485,1],[486048,0],[571492,1]],
      elaine: [[575406,1]],
    },
    counter: [ {char:'hecate', T:2, val:2877682, crit:1, acute:1} ],
    hp: { T1:98, T2:89, T3:88 },
  },
  '02': {
    T1: {
      edison: [[663445,1],[671790,1],[675962,1]],
      yamato: [[604110,1],[594588,1],[600936,1]],
      hecate: [[647331,1],[647331,1],[584583,0]],
      tetra:  [[633231,1],[618735,1],[651350,1]],
      elaine: [[564690,0],[641635,1],[561660,0]],
    },
    T2: {
      edison: { body:[3229329,0], extra:[2761445,1] },
      yamato: { body:[2920571,1] },
      hecate: { body:[3421605,1], extra:[2073365,1] },
      tetra:  { body:[3423783,1], extra:[2066480,1] },
      elaine: { body:[3431693,1], extra:[1531501,1] },
      streak: 8967890,
    },
    T3: {
      edison: [[569349,0]],
      yamato: [[498900,1]],
      hecate: [[412181,0]],
      tetra:  [[574146,1],[568140,1],[565137,1]],
      elaine: [[556960,1]],
    },
    counter: [ {char:'hecate', T:2, val:2865242, crit:1, acute:0},
               {char:'hecate', T:2, val:2883611, crit:1, acute:1} ], // 二段攻撃への反撃2発
    hp: { T1:98, T2:88, T3:87 },
  },
  '03': {
    T1: {
      edison: [[611597,0],[622028,0],[628982,0]],
      yamato: [[545948,0],[588272,1],[572400,1]],
      hecate: [[625023,1],[572207,0],[647392,1]],
      tetra:  [[578929,0],[563827,0],[618799,1]],
      elaine: [[564772,0],[619921,1],[649011,1]],
    },
    T2: {
      edison: { body:[3459816,1], extra:[2734412,1] },
      yamato: { body:[2849683,1] },
      hecate: { body:[2976733,0], extra:[2087170,1] },
      tetra:  { body:[2971954,0], extra:[2075521,1] },
      elaine: { body:[3435021,1], extra:[1543850,1] },
      streak: 8818567,
    },
    T3: {
      edison: [[606125,1],[626864,1],[602669,1]],
      yamato: [[510651,1]],
      hecate: [[490713,1]],
      tetra:  [[574866,1]],
      elaine: [[588141,1]],
    },
    counter: [ {char:'hecate', T:2, val:2891122, crit:1, acute:1} ],
    hp: { T1:98, T2:89, T3:88 },
  },
};

const CHARS = ['edison','yamato','hecate','tetra','elaine'];
const sum = a => a.reduce((x,y)=>x+y,0);
const pct = x => (x*100).toFixed(2)+'%';

function normalHits(turn){ // -> [{char,val,acute}]
  const out=[];
  for(const c of CHARS) for(const [v,a] of turn[c]) out.push({char:c,val:v,acute:a});
  return out;
}

console.log('===== per-trial 集計 =====');
const perTrialTurnTotals = {};
for(const id of Object.keys(DATA)){
  const d = DATA[id];
  const t1 = sum(normalHits(d.T1).map(h=>h.val));
  const t2body = sum(CHARS.map(c=>d.T2[c].body[0]));
  const t2extra = sum(CHARS.filter(c=>d.T2[c].extra).map(c=>d.T2[c].extra[0]));
  const t2 = t2body + t2extra + d.T2.streak;
  const t3 = sum(normalHits(d.T3).map(h=>h.val));
  const counterByTurn = {};
  for(const cc of d.counter) counterByTurn[cc.T]=(counterByTurn[cc.T]||0)+cc.val;
  perTrialTurnTotals[id] = {t1,t2,t3,t2body,t2extra,streak:d.T2.streak,counterByTurn};
  console.log(`\n--- trial${id} ---`);
  console.log(`T1通常合計=${t1.toLocaleString()}  (${normalHits(d.T1).length}hit)`);
  console.log(`T2バースト: 本体計=${t2body.toLocaleString()} 追加計=${t2extra.toLocaleString()} streak=${d.T2.streak.toLocaleString()} → 攻撃phase計=${t2.toLocaleString()}`);
  console.log(`T3通常合計=${t3.toLocaleString()}  (${normalHits(d.T3).length}hit)`);
  console.log(`反撃(敵phase,対ボス): ${JSON.stringify(counterByTurn)}`);

  // HP%整合(累積damage / MAX_HP, 表示=ceil(remaining))
  let cum=0; const rows=[];
  for(const T of [1,2,3]){
    const player = T===1? t1 : T===2? t2 : t3;
    const ctr = counterByTurn[T]||0;
    cum += player + ctr;
    const remaining = 100 - cum/MAX_HP*100;
    rows.push(`T${T}: 累積被ダメ=${cum.toLocaleString()} → 残${remaining.toFixed(3)}% ceil→${Math.ceil(remaining)}% (実測${d.hp['T'+T]}%) ${Math.ceil(remaining)===d.hp['T'+T]?'✓':'✗'}`);
  }
  console.log('HP%整合(max_hp=400M・ceil規約):'); rows.forEach(r=>console.log('  '+r));

  // 会心/急所率
  const n1=normalHits(d.T1), n3=normalHits(d.T3);
  const ac = hs => `${sum(hs.map(h=>h.acute))}/${hs.length}=${pct(sum(hs.map(h=>h.acute))/hs.length)}`;
  console.log(`急所率 T1=${ac(n1)}  T3=${ac(n3)}  (会心=全hit100%)`);

  // アンカー候補(会心あり・急所なし の通常hit)
  const anch = hs => hs.filter(h=>h.acute===0).map(h=>`${h.char}:${h.val.toLocaleString()}`);
  console.log('非急所通常hit(=会心のみアンカー) T1:', anch(n1).join(' , ')||'なし');
  console.log('  同 T3:', anch(n3).join(' , ')||'なし');
}

console.log('\n\n===== 横断(rollup) =====');
// バースト本体・streak の slot別 分散(決定性)
function spread(vals){ const m=sum(vals)/vals.length; const sd=Math.sqrt(sum(vals.map(v=>(v-m)**2))/vals.length);
  return {mean:m, min:Math.min(...vals), max:Math.max(...vals), rng:(Math.max(...vals)-Math.min(...vals)), rngPct:(Math.max(...vals)-Math.min(...vals))/m, cv:sd/m}; }
const ids=Object.keys(DATA);
console.log('\nバースト本体 slot別(3走):');
for(const c of CHARS){
  const vals=ids.map(id=>DATA[id].T2[c].body[0]);
  const s=spread(vals);
  console.log(`  ${c}: [${vals.map(v=>v.toLocaleString()).join(', ')}] mean=${Math.round(s.mean).toLocaleString()} 幅=${pct(s.rngPct)} CV=${pct(s.cv)}`);
}
{ const vals=ids.map(id=>DATA[id].T2.streak); const s=spread(vals);
  console.log(`  streak: [${vals.map(v=>v.toLocaleString()).join(', ')}] mean=${Math.round(s.mean).toLocaleString()} 幅=${pct(s.rngPct)} CV=${pct(s.cv)}`); }
console.log('\nバースト追加 slot別(3走):');
for(const c of CHARS){ if(!DATA['01'].T2[c].extra) { console.log(`  ${c}: 追加なし`); continue; }
  const vals=ids.map(id=>DATA[id].T2[c].extra[0]); const s=spread(vals);
  console.log(`  ${c}: [${vals.map(v=>v.toLocaleString()).join(', ')}] mean=${Math.round(s.mean).toLocaleString()} 幅=${pct(s.rngPct)} CV=${pct(s.cv)}`); }

// ターン合計の横断
console.log('\nターン攻撃phase合計(3走):');
for(const T of ['t1','t2','t3']){ const vals=ids.map(id=>perTrialTurnTotals[id][T]); const s=spread(vals);
  console.log(`  ${T.toUpperCase()}: [${vals.map(v=>v.toLocaleString()).join(', ')}] mean=${Math.round(s.mean).toLocaleString()} 幅=${pct(s.rngPct)}`); }

// 反撃(ヘカテー)横断
console.log('\nヘカテー反撃(全発・3走):');
for(const id of ids) console.log(`  trial${id}: ${DATA[id].counter.map(c=>c.val.toLocaleString()+(c.acute?'(急所)':'')).join(' + ')}`);
