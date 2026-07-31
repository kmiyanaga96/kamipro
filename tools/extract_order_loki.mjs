// sim05 G3 v3: 推奨押し順の再抽出（ロキ条件・configC placeholder）。
//   v2（2026-07-28）は 敵=両面宿儺／サブ=[freyja_christmas, artemis]／LS 導入前 で取得したため全面的に無効。
//   本ハーネスは **production と同じ経路**（`_runRootPlan` ＝ ビーム + C37 局所探索）で再取得する。
//
// 条件（`simulation/sim05/README.md` §4.4.2 の placeholder 定義に対応）:
//   敵          = walpurgis_loki（barrier / abilCapPerTurn なし）
//   メイン編成  = napoleon + [hecate, tetra, arianrhod, elaine]
//   サブ        = [metatron, artemis]   ← メタトロンはサブ運用（ユーザー明言 2026-07-31）
//   幻獣        = メイン/サポート 守護 据え置き（weapon_amp 0.8 は GEAR_C に織り込み済み）
//                 ＋ サブにラジエル ⇒ 属性値枠 +0.50 ⇒ elem 0.54 → 1.04
//   ATK         = DISPLAY_ATK_OVERRIDE_BY_FORMATION.napoleon（**暫定**・proper configC 未受領）
//
// ⚠ コスト: 1ルート = ビーム約143s ＋ 局所探索（maxPress42 ゆえ edison より重い）。
//   実験5c の「探索直後の質と LS 後の質は相関しない」を踏まえ、**prefix を1本に絞ってから LS を掛けない**。
//   2段構成にする: ①全 prefix をビームのみで採点（安価）→ ②上位 N 本に LS を掛けて最終比較。
//   N は引数で変えられる（既定3）。★リポジトリ非改変（src/* を import するだけ）
//
// 使い方: node tools/extract_order_loki.mjs [LS対象本数]
import { Sim, buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, _selectRootPrefixes, _localSearchRoute, _replayResult,
         LABEL } from '/home/user/kamipro/src/app.js';
import fs from 'fs';

const n = 10;
const TOPN = parseInt(process.argv[2] || '3', 10);
const OUT = (process.env.SCRATCH || '/tmp') + '/g3_v3_loki.json';
const log = s => process.stdout.write(s + '\n');

// configC GEAR（§4.4.2）。elem のみ v2 から変更＝ラジエル サブ効果 +0.50。
const GEAR_C = { assault:3.06, elem:1.04, vigor:0.6876, spec:0, dmgup:0, acute:0.144, crit_rate:0.405, other:0,
                 na_dmg:1.116, abi_dmg:2.52, burst_dmg:5.22, na_cap:0.36, abi_cap:0.99, burst_cap:2.016 };

setCurrentSubs(['metatron','artemis']);
buildFormation('napoleon', ['hecate','tetra','arianrhod','elaine']);
applyEnemy('walpurgis_loki');
for(const k of Object.keys(GEAR)) GEAR[k] = GEAR_C[k] ?? 0;
DMG.betaia_mult = 3.5; DMG.betaia_cap = 800000; DMG.napo_burst_cd_reduce = true;   // 英霊武器
recalcGearK();
recalcGearKCFromDispAtk(displayAtkOverrideFor('napoleon'));
setStaticOverride({ pactcore:1, effond:120 });

log(`敵=walpurgis_loki  def=${DMG.enemy_def} hp=${DMG.enemy_max_hp.toLocaleString()} affinity=${DMG.affinity} barrier=${DMG.enemy_barrier} abilCap=${DMG.enemy_abil_cap}`);
log(`サブアシスト集約: streak=${DMG.streak_dmgup} burst_dmg=${DMG.sub_burst_dmg} burst_cap=${DMG.sub_burst_cap} `
  + `na_dmg=${DMG.sub_na_dmg} na_cap=${DMG.sub_na_cap} abi_dmg=${DMG.sub_abi_dmg} abi_cap=${DMG.sub_abi_cap} final=${DMG.final_dmg}`);

// ── ①全 prefix をビームのみで採点 ────────────────────────────────
const prefixes = _selectRootPrefixes(n);
log(`\n① ビーム採点（${prefixes.length} prefix・LS なし）`);
const scored = [];
for(const prefix of prefixes){
  const t0 = Date.now();
  const sim = new Sim(); sim.totalTurns = n;
  if(prefix.length){ sim._forcePrefix = prefix; sim._forceTurn = 1; }
  const rows = []; for(let t=1;t<=n;t++) rows.push(sim.greedyTakeTurn(t));
  const keys = rows.map(r => r.keys);
  scored.push({ prefix, beamDmg: sim.dmg, keys,
                fb: rows.filter(r=>r.full).length, maxPress: Math.max(...rows.map(r=>r.ability)) });
  log(`   [${prefix.join(',')||'(空)'}] ${Math.round(sim.dmg).toLocaleString()}  FB=${rows.filter(r=>r.full).length}/10 maxPress=${Math.max(...rows.map(r=>r.ability))}  (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}
scored.sort((a,b) => b.beamDmg - a.beamDmg);

// ── ②上位 N 本に局所探索 ────────────────────────────────────────
log(`\n② 局所探索（上位 ${TOPN} 本）⚠実験5c: ビーム順位と LS 後の順位は相関しない＝複数本に掛ける`);
const results = [];
for(const c of scored.slice(0, TOPN)){
  const t0 = Date.now();
  const ls = _localSearchRoute(c.keys, n, (i)=>{ if(i.evals % 20000 === 0)
    process.stdout.write(`      … sweep${i.sweep} 評価${i.evals.toLocaleString()} 改善${i.accepted}件\n`); });
  const rep = _replayResult(ls.turnsKeys, n);
  results.push({ prefix:c.prefix, beamDmg:c.beamDmg, lsDmg:ls.dmg, keys:rep.rows.map(r=>r.keys),
                 fb:rep.rows.filter(r=>r.full).length, maxPress:Math.max(...rep.rows.map(r=>r.ability)), evals:ls.evals });
  log(`   [${c.prefix.join(',')||'(空)'}] ${Math.round(c.beamDmg).toLocaleString()} → ${Math.round(ls.dmg).toLocaleString()}`
    + `  (+${((ls.dmg-c.beamDmg)/c.beamDmg*100).toFixed(3)}% / 評価${ls.evals.toLocaleString()} / ${((Date.now()-t0)/1000).toFixed(0)}s)`);
}
results.sort((a,b) => b.lsDmg - a.lsDmg);

const best = results[0];
log(`\n=== 採用ルート ===`);
log(`prefix = [${best.prefix.join(',')||'(空)'}]   総ダメージ = ${Math.round(best.lsDmg).toLocaleString()}   FB=${best.fb}/10  maxPress=${best.maxPress}`);
for(let t=0;t<n;t++)
  log(`  T${String(t+1).padStart(2)}: ${best.keys[t].map(k=>LABEL[k]||k).join(' → ')}`);

fs.writeFileSync(OUT, JSON.stringify({ meta:{ enemy:'walpurgis_loki', hero:'napoleon',
  party:['hecate','tetra','arianrhod','elaine'], subs:['metatron','artemis'], gear:GEAR_C,
  override:{pactcore:1,effond:120}, n, note:'configC placeholder（ATK 暫定・§4.4.2）' },
  beamScored: scored.map(x=>({prefix:x.prefix, dmg:x.beamDmg})), results }, null, 1));
log(`\n保存: ${OUT}`);
