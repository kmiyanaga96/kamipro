// sim05 G3 v4: 推奨押し順の抽出（ロキ条件・**proper configC**）。
//   v2（2026-07-28）は 敵=両面宿儺／サブ=[freyja_christmas, artemis]／LS 導入前 で取得したため全面的に無効。
//   本ハーネスは **production と同じ経路**（`_runRootPlan` ＝ ビーム + C37 局所探索）で再取得する。
//
// 条件（proper configC・2026-07-31 受領キャッシュを E2 リプレイ bit 一致で検証した実値）:
//   敵          = walpurgis_loki（barrier / abilCapPerTurn なし）
//   メイン編成  = napoleon + [hecate, tetra, arianrhod, elaine]
//   サブ        = [metatron, artemis]   ← メタトロンはサブ運用（ユーザー明言 2026-07-31）
//   幻獣        = メイン/サポート 守護 据え置き（weapon_amp 0.8 は GEAR_C に織り込み済み）
//                 ＋ サブにラジエル ⇒ 属性値枠 +0.50 ⇒ elem 1.04（受領実値と一致）
//   ATK         = DISPLAY_ATK_OVERRIDE_BY_FORMATION.napoleon（**proper 値**・2026-07-31 更新）
//   override    = {judg:130, pactcore:1}（受領キャッシュで自動較正が採用した値）
// ⚠ v3（同日午前・暫定 ATK / 旧 GEAR / 宿儺時代の override 流用）は無効。
//
// ⚠ コスト: 1ルート = ビーム約143s ＋ 局所探索（maxPress42 ゆえ edison より重い）。
//   実験5c の「探索直後の質と LS 後の質は相関しない」を踏まえ、**prefix を1本に絞ってから LS を掛けない**。
//   2段構成にする: ①全 prefix をビームのみで採点（安価）→ ②上位 N 本に LS を掛けて最終比較。
//   N は引数で変えられる（既定3）。★リポジトリ非改変（src/* を import するだけ）
//
// ── ✅ 並列化（2026-08-02）──
//   ①の prefix 間・②のルート間はいずれも**完全に独立**なので `tools/lib/parallel_map.mjs` で子プロセスへ分散する。
//   逐次だと node 単一スレッド＝コアを1つしか使わない（実測 1時間）。**結果は不変**（各タスクは決定的で、
//   親が宣言順に整列し直してから sort するため tie-break まで一致する）。並列度は既定でコア数。
//   環境変数 `PMAP_LIMIT` で上限を変えられる（例: 他ジョブと同居させたい時＝E5）。
//
// ⚠⚠ **この config は陳腐化している**（2026-08-02 時点）。再実行する前に必ず更新すること:
//   ・敵が **walpurgis_loki** のまま＝較正ボスは **両面宿儺（ryomen_sukuna）に確定済み**（sim05 README §4.4）
//   ・override {judg:130,pactcore:1} は **C37 世代**の自動較正値
//   ・**C39（2026-08-02）でダメージモデルが変わった**＝ここで得た数値は現行エンジンと一致しない
//
// 使い方: node tools/extract_order_loki.mjs [LS対象本数]
import { Sim, buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG, setCurrentSubs,
         displayAtkOverrideFor, setStaticOverride, _selectRootPrefixes, _localSearchRoute, _replayResult,
         LABEL } from '/home/user/kamipro/src/app.js';
import fs from 'fs';
import { parallelMap, pmapTask, pmapRecv, PMAP_CORES } from './lib/parallel_map.mjs';

const n = 10;
const TOPN = parseInt(process.argv[2] || '3', 10);
const OUT = (process.env.SCRATCH || '/tmp') + '/g3_v4_loki_proper.json';
const LIMIT = Number(process.env.PMAP_LIMIT) || PMAP_CORES;
const log = s => process.stdout.write(s + '\n');

// ✅ proper configC の GEAR（2026-07-31 受領キャッシュから抽出・E2 リプレイ bit 一致で検証済み）。
// 旧 placeholder との差: assault 3.06→3.204 / vigor 0.6876→0.9666 / acute 0.144→0.288 /
//   abi_dmg 2.52→**1.8（減）** / burst_dmg 5.22→6.39 / abi_cap 0.99→0.9 / burst_cap 2.016→2.106。
//   ⚠ elem 1.04 は placeholder の推定（0.54＋ラジエル0.50）と**実値が一致**していた。
const GEAR_C = { assault:3.204, elem:1.04, vigor:0.9666, spec:0, dmgup:0, acute:0.288, crit_rate:0.405, other:0,
                 na_dmg:1.116, abi_dmg:1.8, burst_dmg:6.39, na_cap:0.36, abi_cap:0.9, burst_cap:2.106 };

setCurrentSubs(['metatron','artemis']);
buildFormation('napoleon', ['hecate','tetra','arianrhod','elaine']);
applyEnemy('walpurgis_loki');
for(const k of Object.keys(GEAR)) GEAR[k] = GEAR_C[k] ?? 0;
DMG.betaia_mult = 3.5; DMG.betaia_cap = 800000; DMG.napo_burst_cd_reduce = true;   // 英霊武器
recalcGearK();
recalcGearKCFromDispAtk(displayAtkOverrideFor('napoleon'));
// ⚠ override は受領キャッシュで自動較正が採用した値。旧 v3 は宿儺時代の {pactcore:1, effond:120} を
//    流用しており誤りだった。⚠これは**旧ATKで較正された値**＝proper ATK では最適 override が動きうる（follow-up）。
setStaticOverride({ judg:130, pactcore:1 });

// ── タスク本体（親も子も同じ関数を使う＝挙動の二重管理を避ける）──
function beamOne(prefix){
  const t0 = Date.now();
  const sim = new Sim(); sim.totalTurns = n;
  if(prefix.length){ sim._forcePrefix = prefix; sim._forceTurn = 1; }
  const rows = []; for(let t=1;t<=n;t++) rows.push(sim.greedyTakeTurn(t));
  return { prefix, beamDmg: sim.dmg, keys: rows.map(r => r.keys),
           fb: rows.filter(r=>r.full).length, maxPress: Math.max(...rows.map(r=>r.ability)),
           sec: (Date.now()-t0)/1000 };
}
function lsOne(c){
  const t0 = Date.now();
  const tag = `[${c.prefix.join(',')||'(空)'}]`;
  const ls = _localSearchRoute(c.keys, n, (i)=>{ if(i.evals % 20000 === 0)
    process.stdout.write(`      ${tag} sweep${i.sweep} 評価${i.evals.toLocaleString()} 改善${i.accepted}件\n`); });
  const rep = _replayResult(ls.turnsKeys, n);
  return { prefix:c.prefix, beamDmg:c.beamDmg, lsDmg:ls.dmg, keys:rep.rows.map(r=>r.keys),
           fb:rep.rows.filter(r=>r.full).length, maxPress:Math.max(...rep.rows.map(r=>r.ability)),
           evals:ls.evals, sec:(Date.now()-t0)/1000 };
}

// ── 子プロセス: 担当タスクだけ実行して返す ──
const _task = pmapTask();
if(_task){
  const payload = await pmapRecv();
  process.send(_task.kind === 'beam' ? beamOne(payload) : lsOne(payload));
  process.exit(0);
}

log(`敵=walpurgis_loki  def=${DMG.enemy_def} hp=${DMG.enemy_max_hp.toLocaleString()} affinity=${DMG.affinity} barrier=${DMG.enemy_barrier} abilCap=${DMG.enemy_abil_cap}`);
log(`サブアシスト集約: streak=${DMG.streak_dmgup} burst_dmg=${DMG.sub_burst_dmg} burst_cap=${DMG.sub_burst_cap} `
  + `na_dmg=${DMG.sub_na_dmg} na_cap=${DMG.sub_na_cap} abi_dmg=${DMG.sub_abi_dmg} abi_cap=${DMG.sub_abi_cap} final=${DMG.final_dmg}`);

// ── ①全 prefix をビームのみで採点 ────────────────────────────────
const prefixes = _selectRootPrefixes(n);
log(`\n① ビーム採点（${prefixes.length} prefix・LS なし）── 並列度 ${Math.min(LIMIT, prefixes.length)}`);
const wall1 = Date.now();
const scored = await parallelMap(import.meta.url, 'beam', prefixes, { limit: LIMIT });
// ⚠ 出力は**宣言順に整列してから**表示・sort する（並列でも逐次時と完全に同じ順序・同じ tie-break）。
for(const c of scored)
  log(`   [${c.prefix.join(',')||'(空)'}] ${Math.round(c.beamDmg).toLocaleString()}  FB=${c.fb}/10 maxPress=${c.maxPress}  (${c.sec.toFixed(0)}s)`);
log(`   ⇒ 実時間 ${((Date.now()-wall1)/1000).toFixed(0)}s（逐次相当 ${scored.reduce((a,c)=>a+c.sec,0).toFixed(0)}s）`);
scored.sort((a,b) => b.beamDmg - a.beamDmg);

// ── ①-b 重複除去の実測（2段実行が実際に効くかの検証を兼ねる）───────────────
// ⚠ §12 は「総ダメージが同値」を観測しただけで、同値=同一キー列とは限らない（divinus が反例）。
//    ここでキー列そのもので数え、2段実行の重複除去が実際に効くのかを確定させる。
const sigs = new Map();
for(const c of scored){ const sig = JSON.stringify(c.keys);
  if(!sigs.has(sig)) sigs.set(sig, []); sigs.get(sig).push(c.prefix.join(',') || '(空)'); }
log(`\n①-b 重複除去: ビーム ${scored.length}本 → 一意キー列 ${sigs.size}本`);
{ let i=0; for(const [,mem] of sigs) log(`     群${++i}: ${mem.join(' / ')}`); }
const cut = scored.length - sigs.size;
log(`     ⇒ 2段実行で LS を ${cut}本 削減（${(cut/scored.length*100).toFixed(0)}%減）${cut===0?' ❌効果なし':' ✅効果あり'}`);

// ── ②上位 N 本に局所探索 ────────────────────────────────────────
const lsTargets = scored.slice(0, TOPN);
log(`\n② 局所探索（上位 ${TOPN} 本）⚠実験5c: ビーム順位と LS 後の順位は相関しない＝複数本に掛ける`
  + ` ── 並列度 ${Math.min(LIMIT, lsTargets.length)}`);
const wall2 = Date.now();
const results = await parallelMap(import.meta.url, 'ls', lsTargets, { limit: LIMIT });
for(const r of results)
  log(`   [${r.prefix.join(',')||'(空)'}] ${Math.round(r.beamDmg).toLocaleString()} → ${Math.round(r.lsDmg).toLocaleString()}`
    + `  (+${((r.lsDmg-r.beamDmg)/r.beamDmg*100).toFixed(3)}% / 評価${r.evals.toLocaleString()} / ${r.sec.toFixed(0)}s)`);
log(`   ⇒ 実時間 ${((Date.now()-wall2)/1000).toFixed(0)}s（逐次相当 ${results.reduce((a,r)=>a+r.sec,0).toFixed(0)}s）`);
results.sort((a,b) => b.lsDmg - a.lsDmg);

const best = results[0];
log(`\n=== 採用ルート ===`);
log(`prefix = [${best.prefix.join(',')||'(空)'}]   総ダメージ = ${Math.round(best.lsDmg).toLocaleString()}   FB=${best.fb}/10  maxPress=${best.maxPress}`);
for(let t=0;t<n;t++)
  log(`  T${String(t+1).padStart(2)}: ${best.keys[t].map(k=>LABEL[k]||k).join(' → ')}`);

fs.writeFileSync(OUT, JSON.stringify({ meta:{ enemy:'walpurgis_loki', hero:'napoleon',
  party:['hecate','tetra','arianrhod','elaine'], subs:['metatron','artemis'], gear:GEAR_C,
  override:{judg:130,pactcore:1}, n, note:'proper configC（2026-07-31 受領・E2 bit一致検証済み）' }, dedupe:{ beam:scored.length, unique:sigs.size },
  beamScored: scored.map(x=>({prefix:x.prefix, dmg:x.beamDmg})), results }, null, 1));
log(`\n保存: ${OUT}`);
