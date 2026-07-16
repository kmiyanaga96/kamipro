// sim03 per_trial パーサ／生成器（P3: 再現可能な集計器）。
//   実行: node simulation/sim03/analysis/parse_trials.mjs            → 5 trial を集計しサマリ表示
//         node simulation/sim03/analysis/parse_trials.mjs --emit     → per_trial/trialNN_quant.md を生成
//
// 成分↔値の対応規則: 成分を "/" 分割・値を "+" 分割し、各成分は 三段=3値/二段=2値/他=1値 を消費。
// (攻撃フェイズ)行は特別処理: 値を "/" でchar群に分割、末尾(＋を含まぬ単値)=ストリーク、各char群= "burst + extra"。
// 会心/急所はフラット値ごとにマーク計数（"すべて"=全hit・"あり/なし"=個別）。**単trialのみ**を集計（trial横断はrollup）。
import fs from 'fs';
const DIR = 'simulation/sim03/data';
const OUT = 'simulation/sim03/analysis/per_trial';
const num = s => Number(String(s).replace(/[, ]/g,'')) || 0;
const nums = s => (String(s).match(/\d[\d,]*/g)||[]).map(num);
const jp = { normal:'通常攻撃', ability:'アビリティ(judg ph0/effond等)', burst:'バースト本体(メイン)', extra:'追加ダメージ(メイン)',
  robo:'ロボ追撃', atk_burst:'攻撃フェイズ・バースト本体', atk_extra:'攻撃フェイズ・追加ダメージ', streak:'バーストストリーク',
  tsuigeki:'追撃', eng:'エジソン英霊武器追撃', other:'その他' };
const ORDER = ['normal','ability','burst','extra','robo','atk_burst','atk_extra','streak','tsuigeki','eng','other'];
const fmt = n => (n||0).toLocaleString();
const norm = c => { c=c.trim();
  if(c.includes('通常')) return 'normal'; if(c.includes('アビリティ')) return 'ability';
  if(c.includes('バースト本体')) return 'burst'; if(c.includes('追加ダメージ')) return 'extra';
  if(c.includes('ロボ')) return 'robo'; if(c.includes('英霊')) return 'eng';
  if(c.includes('ストリーク')) return 'streak'; if(c.includes('追撃')) return 'tsuigeki'; return 'other'; };
const consume = c => c.includes('三段')?3 : c.includes('二段')?2 : 1;

function parseTurn(lines){
  const t={ comp:{}, critMarks:0, critTot:0, acuteMarks:0, acuteTot:0, hitTotal:0, dot:0, counter:0 };
  const add=(k,v)=>{ t.comp[k]=(t.comp[k]||0)+v; t.hitTotal+=v; };
  for(const ln of lines){
    if(!ln.startsWith('|')) continue;
    const c=ln.split('|').map(s=>s.trim());
    if(c.length<7) continue;
    const idx=c[1]; if(idx==='押下#'||idx.startsWith('---')) continue;
    const compCell=c[3], valCell=c[4], critCell=c[5], acuteCell=c[6];
    if(valCell==='なし'||!/\d/.test(valCell)) continue;
    const countMarks=(cell,n)=>{ if(cell.includes('すべて')) return n; return (cell.match(/あり/g)||[]).length; };
    if(idx.includes('攻撃フェイズ')){
      const groups=valCell.split('/').map(s=>s.trim());
      let cg=groups;
      if(!groups[groups.length-1].includes('+')){ add('streak',num(groups[groups.length-1])); cg=groups.slice(0,-1); }
      for(const g of cg){ const p=nums(g); if(p[0])add('atk_burst',p[0]); if(p[1])add('atk_extra',p[1]); }
      const v=nums(valCell); t.critTot+=v.length; t.acuteTot+=v.length;
      t.critMarks+=countMarks(critCell,v.length); t.acuteMarks+=countMarks(acuteCell,v.length); continue;
    }
    const comps=compCell.split('/').map(s=>s.trim()); const vals=nums(valCell); let vi=0;
    for(const cc of comps){ const n=consume(cc); let s=0; for(let k=0;k<n&&vi<vals.length;k++) s+=vals[vi++]; add(norm(cc),s); }
    t.critTot+=vals.length; t.acuteTot+=vals.length;
    t.critMarks+=countMarks(critCell,vals.length); t.acuteMarks+=countMarks(acuteCell,vals.length);
  }
  return t;
}
const line=(seg,inc)=>seg.find(l=>l.includes(inc))||'';
function parseTrial(name){
  const path=`${DIR}/trial${name}.md`; const lines=fs.readFileSync(path,'utf8').split('\n');
  const secIdx=k=>lines.findIndex(l=>l.startsWith(`## ${k} 記録`));
  const bounds=[['T1',secIdx('T1')],['T2',secIdx('T2')],['T3',secIdx('T3')]].filter(b=>b[1]>=0);
  const meta={};
  const hdr=k=>{ const l=lines.find(x=>x.startsWith(k)); return l? l.split(':').slice(1).join(':').trim() : ''; };
  meta.date=hdr('- 日付'); meta.dispAtk=hdr('- UI装備パネル一致確認');
  const turns={};
  for(let i=0;i<bounds.length;i++){
    const [tn,st]=bounds[i]; const en=i+1<bounds.length?bounds[i+1][1]:lines.length; const seg=lines.slice(st,en);
    const t=parseTurn(seg);
    t.hpStart=num((line(seg,'開始時ボスHP%').match(/(\d+)/)||[])[1]);
    const he=line(seg,'終了時ボスHP%'); t.hpEnd = he? num((he.match(/(\d+)\s*%/)||[])[1]) : null;
    const d=line(seg,'DOTダメージ').match(/(\d+)万×(\d+)/); t.dot=d?num(d[1])*10000*num(d[2]):0;
    const cl=line(seg,'反撃ダメージ'); t.counter = (cl&&!/:\s*なし/.test(cl)) ? ((cl.split(':')[1]||'').match(/\d[\d,]{3,}/g)||[]).reduce((a,b)=>a+num(b),0) : 0;
    t.realTotal=t.hitTotal+t.dot+t.counter;
    t.judg=((line(seg,'C23').split(':').pop()||'').match(/ph\d/)||[''])[0];  // 凡例(ph0アビ…)でなく最後の":"以降の実値
    t.mainStart=(line(seg,'メイン開始').split(':')[1]||'').trim();
    t.mainEnd=(line(seg,'メイン終了').split(':')[1]||'').trim();
    t.gauge=(line(seg,'バーストゲージ5人分').split(':')[1]||'').trim();
    t.robogauge=(line(seg,'ロボ反応のゲージ').split(':').pop()||'').trim();
    t.enemy=(line(seg,'敵行動名').split(':')[1]||'').trim();
    t.kill=(line(seg,'撃破ターン').split(':')[1]||'').trim();
    turns[tn]=t;
  }
  return {name, meta, turns};
}
function maxhp(r){
  const {T1,T2,T3}=r.turns; const e=[];
  if(T1&&T1.hpEnd!=null) e.push(['T1', Math.round(T1.realTotal/((100-T1.hpEnd)/100))]);
  if(T2&&T1&&T2.hpEnd!=null) e.push(['T2', Math.round(T2.realTotal/((T1.hpEnd-T2.hpEnd)/100))]);
  let t3bound=null; if(T3&&T2&&T2.hpEnd) t3bound=Math.round(T3.realTotal/(T2.hpEnd/100));
  return {e, t3bound};
}
function emit(r){
  const {name,turns}=r; const tk=Object.keys(turns);
  const comps=ORDER.filter(k=>tk.some(tn=>turns[tn].comp[k]));
  const compRows=comps.map(k=>`| ${jp[k]} | ${tk.map(tn=>fmt(turns[tn].comp[k])).join(' | ')} | ${fmt(tk.reduce((a,tn)=>a+(turns[tn].comp[k]||0),0))} |`).join('\n');
  const grand=tk.reduce((a,tn)=>a+turns[tn].realTotal,0);
  const mh=maxhp(r);
  const md=`# trial${name}_quant — 単trial定量分析（trial${name}・数値のみ）

> **責務（per_trial 層・中間集計）**: **data/trial${name}.md 1本のみ**を入力にそのtrial内の定量集計。**trial横断（平均/分散/決定性/max_hp収束）は上位 \`../quantitative_analysis.md\` へ**。所感/統合は書かない。
> **自動生成**: \`simulation/sim03/analysis/parse_trials.mjs --emit\`（成分↔値対応=三段3値/二段2値/他1値・攻撃フェイズは char群/streak 分離）。手集計せず再現可能。

## 0. 入力・メタ
- 入力: \`data/trial${name}.md\`（本trialのみ）／ config: \`data/configA.json\`（総ダメ1,644,858,119・override{judg:200,pactcore:1}）
- 撃破: ${turns.T3?turns.T3.kill||'(T3内)':'—'}／ 表示ATK: ${r.meta.dispAtk||'—'}

## 1. 成分別集計（全hit・単位: 表示ダメージ）
| 成分＼ターン | ${tk.join(' | ')} | 計 |
|---|${tk.map(()=>'--:').join('|')}|--:|
${compRows}
| **ターン hit合計** | ${tk.map(tn=>`**${fmt(turns[tn].hitTotal)}**`).join(' | ')} | **${fmt(tk.reduce((a,tn)=>a+turns[tn].hitTotal,0))}** |

## 2. ターン別 実ダメージ合計（全hit ＋ DOT ＋ 反撃）
| ターン | hit合計 | DOT | 反撃(ヘカテー) | **実ダメ合計** | ボスHP% |
|---|--:|--:|--:|--:|:--:|
${tk.map(tn=>{const t=turns[tn];return `| ${tn} | ${fmt(t.hitTotal)} | ${fmt(t.dot)} | ${fmt(t.counter)} | **${fmt(t.realTotal)}** | ${t.hpStart}→${t.hpEnd==null?'撃破':t.hpEnd+'%'} |`;}).join('\n')}
| **GRAND** | | | | **${fmt(grand)}** | 100→0% |

## 3. このtrialの max_hp 点推定（HP%差 ÷ 実ダメ合計）
${mh.e.map(([k,v])=>`- **${k}区間**: real_${k} ÷ ${k==='T1'?`(100−${turns.T1.hpEnd})%`:`(${turns.T1.hpEnd}−${turns.T2.hpEnd})%`} = **${fmt(v)}**`).join('\n')}
${mh.t3bound?`- **T3(撃破・上界)**: real_T3 ÷ ${turns.T2.hpEnd}% = ${fmt(mh.t3bound)}（オーバーキルのため上界）`:''}
> ※収束評価（5走の集約）は rollup 専用。ここは本trialの点推定のみ。

## 4. 会心/急所率（マーク計数）
| ターン | 会心 | 急所 |
|---|:--:|:--:|
${tk.map(tn=>{const t=turns[tn];return `| ${tn} | ${t.critMarks}/${t.critTot} | ${t.acuteMarks}/${t.acuteTot} |`;}).join('\n')}
- full-crit想定＝会心はほぼ全hit。急所は一部 なし（tetra/edison等の混在）。

## 5. 予実・チェックポイント
| ターン | judgフェーズ(C23) | メイン開始 契晶/累計/連理 | メイン終了 | ゲージ(前/後) | ロボ反応ゲージ | 敵行動 |
|---|:--:|---|---|---|:--:|---|
${tk.map(tn=>{const t=turns[tn];return `| ${tn} | ${t.judg||'—'} | ${t.mainStart||'—'} | ${t.mainEnd||'—'} | ${t.gauge||'—'} | ${t.robogauge||'—'} | ${t.enemy||'—'} |`;}).join('\n')}

## 6. 本trialの欠測・異常値（確度タグ付き・上位rollupへ申し送り）
-
`;
  fs.writeFileSync(`${OUT}/trial${name}_quant.md`, md);
  return md;
}

const names=['01','02','03','04','05'];
const doEmit=process.argv.includes('--emit');
for(const n of names){
  const r=parseTrial(n);
  if(doEmit){ emit(r); console.log(`emitted ${OUT}/trial${n}_quant.md`); continue; }
  const mh=maxhp(r);
  console.log(`\n== trial${n} ==`);
  for(const [tn,t] of Object.entries(r.turns)) console.log(`${tn}: real=${fmt(t.realTotal)} HP ${t.hpStart}→${t.hpEnd} judg ${t.judg} crit ${t.critMarks}/${t.critTot} acute ${t.acuteMarks}/${t.acuteTot}`);
  console.log(`max_hp: ${mh.e.map(([k,v])=>`${k}=${fmt(v)}`).join(' / ')}${mh.t3bound?` / T3上界 ${fmt(mh.t3bound)}`:''}`);
}
