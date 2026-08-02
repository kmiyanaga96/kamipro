// 2×2 比較: {ユーザーcacheの順, 再抽出の順} × {stale ATK, 正しいATK} を同一エンジンでリプレイ。
// これで「ATK修正がダメージにどれだけ効くか」と「正しいATK下でどちらの順が優れるか」を分離して見る。
import { buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG,
         displayAtkOverrideFor, setStaticOverride, _replayResult } from '/home/user/kamipro/src/app.js';
import fs from 'fs';

const GEAR_C = { assault:3.06, elem:0.54, vigor:0.6876, spec:0, dmgup:0, acute:0.144, crit_rate:0.405,
                 other:0, na_dmg:1.116, abi_dmg:2.52, burst_dmg:5.22, na_cap:0.36, abi_cap:0.99, burst_cap:2.016 };
const STALE = { napoleon:30041, hecate:73727, tetra:81887, arianrhod:31737, elaine:82248 };
const CORRECT = displayAtkOverrideFor('napoleon');

// ユーザーキャッシュの順
const cache = JSON.parse(fs.readFileSync('/home/user/kamipro/archive/caches/sim05_sukuna.json','utf8'));
const userOrder = cache.entries[0][1].turnsKeys;
const userDmgRecorded = cache.entries[0][1].dmg;

// 再抽出の順（b4htr06s3 出力から手写ではなく、同条件で再現するのは高コスト＝出力ログのキー列を使う）
const mineOrder = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));

function setup(atkMap){
  buildFormation('napoleon', ['hecate','tetra','arianrhod','elaine']);
  applyEnemy('ryomen_sukuna');
  for(const k of Object.keys(GEAR)) GEAR[k] = GEAR_C[k] ?? 0;
  recalcGearK();
  recalcGearKCFromDispAtk(atkMap);
  setStaticOverride({ pactcore:1, effond:120 });
}
const hp = 980000000;
function killTurn(rows){ let k=null; rows.forEach((r,i)=>{ if(k===null && (r.dmg??0)>=hp) k=i+1; }); return k; }

console.log('順\\ATK基準            stale ATK              正しい configC ATK');
for(const [name,order] of [['ユーザーcache順', userOrder], ['再抽出順      ', mineOrder]]){
  const out=[];
  for(const [lbl,atk] of [['stale',STALE], ['correct',CORRECT]]){
    setup(atk);
    const rep=_replayResult(order, order.length);
    out.push(`${Math.round(rep.dmg).toLocaleString().padStart(15)} (T${killTurn(rep.rows)}撃破)`);
  }
  console.log(`${name}  ${out.join('   ')}`);
}
console.log(`\n（参考）ユーザーcacheの記録値: ${Math.round(userDmgRecorded).toLocaleString()}`);
