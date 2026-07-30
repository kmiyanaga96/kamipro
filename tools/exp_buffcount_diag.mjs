// buffCount 過大構造の診断（実機データ不要・sim05 ①ブロッカーの前提固め）。
// napoleon 編成を静的greedy 10T で回し、各ターン終了時の sim.buf を「どのキーが何個か」で分解し、
// buffCount（DEBUFF_KEYS 除外の Σ v.length）に対する寄与を表示する。閾値 15/20/6/11/16 到達ターンも示す。
import { Sim, buildFormation, setStaticOverride } from '/home/user/kamipro/src/app.js';

const DEBUFF_KEYS = new Set(['consort_def','divinus_def','effond_def','nights','divinus_dot']);
const buffCount = buf => Object.entries(buf).reduce((a,[k,v])=>a+(DEBUFF_KEYS.has(k)?0:v.length),0);

buildFormation('napoleon', ['hecate','tetra','arianrhod','elaine']);
setStaticOverride({});

const s = new Sim(); s.totalTurns=10; s.planDepth=2;
console.log('T | buffCount | tier到達(pike15/consort20/roy6/11/16 factor10) | buf内訳(key:count, DEBUFF は[-])');
for(let t=1;t<=10;t++){
  s.greedyTakeTurn(t);
  const buf = s.buf;
  const bc = buffCount(buf);
  const entries = Object.entries(buf).map(([k,v])=>`${k}:${v.length}${DEBUFF_KEYS.has(k)?'[-]':''}`).sort();
  const gates = [
    bc>=15?'pike✓':'', bc>=20?'consort✓':'',
    bc>=6?'roy6':'', bc>=11?'roy11':'', bc>=16?'roy16':'', bc>=10?'factor10':''
  ].filter(Boolean).join(' ');
  console.log(`T${t} | bc=${bc} | ${gates}`);
  console.log(`     ${entries.join('  ')}`);
}
