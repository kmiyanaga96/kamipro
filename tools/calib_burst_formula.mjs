// バースト本体の式を実機から推定する。★リポジトリ非改変
//
// 目的: 「バースト本体がシムで過大」（C44）が **スカラ1個の問題か、式の形の問題か** を判定し、
//   前者なら係数を、後者なら壊れている項を特定する。
//
// 方式:
//   ①`tools/calib_replay_compare.mjs` と同じ config（受領キャッシュの `_configSig`）で実機の押し順を強制リプレイ。
//   ②`burst()` を包んで内部量（naB / raw / 実効cap / core）を採取し、**加算点 sim.js:204 の増分だけ**を
//     「バースト本体」として拾う（`burst()` は本体加算のあとに `onBurst` で追加ダメージ等を足すため、
//      素朴に `this.dmg` の前後差を取ると追加ダメージが混入する）。
//   ③実機の本体値と **キーとオーナーで厳密に対応付ける**（インデックス順だと judg フェーズや FB 順の差でズレる）。
//   ④どの内部量に対して実機比が安定するかを見て、式の形を判定する。
//
// ⚠ 使えるのは **T1 だけ**。T2 以降は実機が T1 末にアビ上限超過でバフを消去されており（C43）、
//   シムはそれを持たないので**バフ状態が別物**＝残差 CV が 37% まで悪化して fit に使えない。
//
// 実行:
//   node tools/calib_burst_formula.mjs           # 現行モデルで診断
//   node tools/calib_burst_formula.mjs --fix     # 推定値（calib_burst 1.66 / arian_cap_boost 0.30）を当てて検証
import fs from 'node:fs';
import { Sim, buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG,
         setCurrentSubs, setStaticOverride } from '/home/user/kamipro/src/app.js';

const log = s => process.stdout.write(s + '\n');
const f = n => Math.round(n).toLocaleString('en-US');
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => Math.sqrt(mean(a.map(v => (v - mean(a)) ** 2)));
const FIX = process.argv.includes('--fix');

// ══ config（受領キャッシュから復元・ハードコードしない）══
const CACHE = JSON.parse(fs.readFileSync('/home/user/kamipro/simulation/sim05/data/configC_cache_20260803.json', 'utf8'));
const SIG = JSON.parse(CACHE.entries[0][0].split('|').slice(1).join('|'));
const [HERO, KAMI, G, SUBS, E_DEF, E_HP, E_BM, E_BC, , E_BAR] = SIG;
setCurrentSubs(SUBS); buildFormation(HERO, KAMI); applyEnemy('ryomen_sukuna');
for (const k of Object.keys(GEAR)) GEAR[k] = G[k] ?? 0;
DMG.enemy_def = E_DEF; DMG.enemy_max_hp = E_HP; DMG.enemy_barrier = E_BAR;
DMG.edison_burst_extra_mult = E_BM; DMG.edison_burst_extra_cap = E_BC;
DMG.betaia_mult = 3.5; DMG.betaia_cap = 800000; DMG.napo_burst_cd_reduce = true; DMG.enemy_abil_cap = null;
if (FIX) { DMG.calib_burst = 1.66; DMG.arian_cap_boost = 0.30; }
// 表示ATK は trial md ヘッダの実機値（`src/app.js` の override は golden 都合で未更新＝走行時点より古い）
const src = fs.readFileSync('/home/user/kamipro/simulation/sim05/data/pre-trial.md', 'utf8').split('\n');
const DISP = {};
{ const m = src.find(l => /表示ATK5人分/.test(l));
  for (const [, k, v] of m.matchAll(/([a-z_]+)=([\d,]+)/g)) DISP[k] = +v.replace(/,/g, ''); }
recalcGearK(); recalcGearKCFromDispAtk(DISP);
setStaticOverride({ pactcore: 1, effond: 120 });

// ══ 採取 ══
let CUR = 0, CURKEY = 'FB', BODY = 0; const rec = [];
const oe = Sim.prototype._execKey;
Sim.prototype._execKey = function (k) { if (this.planDepth === 0) CURKEY = k; const r = oe.call(this, k); if (this.planDepth === 0) CURKEY = 'FB'; return r; };
const od = Sim.prototype._decay;
Sim.prototype._decay = function (fr, raw, base, nc) { if (this.planDepth === 0 && fr === 'burst') { this.__raw = raw; this.__cap = base; } return od.call(this, fr, raw, base, nc); };
const ob = Sim.prototype.burst;
Sim.prototype.burst = function (owner, bset, T, atk) {
  if (this.planDepth !== 0) return ob.call(this, owner, bset, T, atk);
  const naB = this._na(), b = this.buf;
  BODY = 0;
  const core = ob.call(this, owner, bset, T, atk);
  rec.push({ t: CUR, key: CURKEY, owner, naB, raw: this.__raw, cap: this.__cap, core, body: BODY,
             flat: BODY - core * DMG.calib_burst, nPuv: b.puvoir?.length || 0 });
  return core;
};
const KEYS = {};
{ let t = null, e = 0;
  for (const ln of src) {
    if (!ln.startsWith('|')) continue;
    const c = ln.split('|').slice(1, -1).map(s => s.trim());
    if (c.length !== 11 || c[0] === 'T' || /^-+$/.test(c[0])) continue;
    if (c[0]) { if (+c[0] !== t) e = 0; t = +c[0]; }
    if (!t || c[1] === '(攻撃フェイズ)') continue;
    const k = c[2].replace(/\(.*\)$/, '').trim(); if (!k) continue;
    (KEYS[t] ??= []).push(k === 'elegant' ? (e++ ? 'elegant_re' : 'elegant') : k); } }
const sim = new Sim(); sim.totalTurns = 10;
{ let _d = sim.dmg;
  Object.defineProperty(sim, 'dmg', { configurable: true, enumerable: true, get() { return _d; }, set(v) {
    const dd = v - _d; _d = v; if (!dd) return;
    for (const l of new Error().stack.split('\n').slice(2)) {
      const m = l.match(/(characters|sim)\.js:(\d+):/);
      if (m) { if (m[1] === 'sim' && m[2] === '204') BODY += dd; break; } } } }); }
for (const t of [1, 2, 3]) { CUR = t; sim.greedyTakeTurn(t, KEYS[t]); }

// ══ 実機のバースト本体（pre-trial.md §1 から手写し＝行内の第1値）══
const REAL = {
  1: { press: [['hecate', 6147458], ['tetra', 6539050], ['arianrhod', 9640546], ['arianrhod', 9629984],
               ['arianrhod', 10082624], ['hecate', 7494372], ['tetra', 8258534], ['arianrhod', 15177635],
               ['elaine', 11763033], ['elaine', 9967021], ['hecate', 11104675], ['elaine', 11231301]],
       fb: { napoleon: 12104981, hecate: 11240495, tetra: 10969021, arianrhod: 16510400, elaine: 10498890 } },
  2: { press: [['hecate', 6029526], ['elaine', 6439836], ['tetra', 6325352], ['hecate', 6328902]],
       fb: { napoleon: 7563254, hecate: 7914852, tetra: 7738253, arianrhod: 11297809, elaine: 7630635 } },
  3: { press: [['hecate', 7964429], ['tetra', 9932186], ['arianrhod', 14889099]],
       fb: { napoleon: 15466414, hecate: 9498062, tetra: 9958936, arianrhod: 14030039, elaine: 10371419 } } };
const pairs = [];
for (const t of [1, 2, 3]) {
  const byO = {}; REAL[t].press.forEach(([o, v]) => { (byO[o] ??= []).push(v); }); const idx = {};
  for (const x of rec.filter(x => x.t === t && x.key !== 'FB')) {
    const v = byO[x.owner]?.[idx[x.owner] || 0]; if (v === undefined) continue;
    idx[x.owner] = (idx[x.owner] || 0) + 1; pairs.push({ ...x, real: v, phase: 'press' }); }
  for (const x of rec.filter(x => x.t === t && x.key === 'FB')) pairs.push({ ...x, real: REAL[t].fb[x.owner], phase: 'fb' });
}
const T1 = pairs.filter(x => x.t === 1), T1n = T1.filter(x => x.owner !== 'arianrhod'), T1a = T1.filter(x => x.owner === 'arianrhod');

log(`\n■ config: calib_burst=${DMG.calib_burst} / arian burstCapSpecial=+${DMG.arian_cap_boost * 100}%${FIX ? '  ← --fix 適用' : ''}\n`);

log('■ ① 同一 FB 内のキャラ間比（同時刻＝パーティバフ完全同一＝交絡ゼロ）\n');
log('| T | シム アリアン/他平均(core) | 実機 アリアン/他平均 |');
log('|---|---|---|');
for (const t of [1, 2, 3]) {
  const fb = pairs.filter(x => x.t === t && x.phase === 'fb');
  const o = fb.filter(x => x.owner !== 'arianrhod'), a = fb.find(x => x.owner === 'arianrhod'); if (!a) continue;
  log(`| ${t} | ×${(a.core / mean(o.map(x => x.core))).toFixed(3)} | ×${(a.real / mean(o.map(x => x.real))).toFixed(3)} |`);
}

log('\n■ ② どの内部量に対して実機が安定するか（T1・非アリアン n=' + T1n.length + '）\n');
log('| 指標 | 平均 | CV |');
log('|---|---|---|');
for (const [lab, fn] of [['実機/シム本体（現行モデル出力）', x => x.real / x.body],
                         ['実機/core（減衰後・calib前）', x => x.real / x.core],
                         ['実機/raw（減衰前・素点）', x => x.real / x.raw],
                         ['実機/naB（通常攻撃ダメ）', x => x.real / x.naB]]) {
  const v = T1n.map(fn); log(`| ${lab} | ${mean(v).toFixed(3)} | **${(sd(v) / mean(v) * 100).toFixed(1)}%** |`); }

log('\n■ ③ キャラ別 残差（T1）\n');
log('| owner | n | 実機/シム本体 | CV |');
log('|---|---|---|---|');
for (const o of ['hecate', 'tetra', 'elaine', 'napoleon', 'arianrhod']) {
  const a = T1.filter(x => x.owner === o); if (!a.length) continue;
  const e = a.map(x => x.real / x.body);
  log(`| ${o} | ${a.length} | ${mean(e).toFixed(3)} | ${(sd(e) / mean(e) * 100).toFixed(1)}% |`); }

log('\n■ ④ 減衰外フラット項（royBurst + passiveFlat）が本体に占める割合\n');
for (const t of [1, 2, 3]) { const a = pairs.filter(x => x.t === t);
  log(`  T${t}: ${f(mean(a.map(x => x.flat)))}（実機本体の ${(mean(a.map(x => x.flat / x.real)) * 100).toFixed(0)}%）`); }
log('  ⚠ この項は減衰の外＝cap/slope をどう直しても動かない。`roy_burst_frac[3]=1.00`（na の100%）が特に大きく未検証。');

if (!FIX) {
  log('\n■ ⑤ 推定（T1・非アリアンのバイアスのみ除去 → calib_burst / アリアンは cap 係数を解く）\n');
  const bias = mean(T1n.map(x => x.real / x.body));
  log(`  非アリアン 実機/シム本体 = ${bias.toFixed(3)}  →  calib_burst ${DMG.calib_burst} × ${bias.toFixed(3)} = **${(DMG.calib_burst * bias).toFixed(2)}**`);
  let best = null;
  for (let k = 0.30; k <= 1.60; k += 0.005) {
    // cap を k 倍したときの core: 深い減衰域なので core = cap*k + (raw − cap*k)*slope
    const e = T1a.map(x => { const c = x.cap * k, co = x.raw <= c ? x.raw : c + (x.raw - c) * DMG.decay_burst.slope;
                             return x.real / (co * DMG.calib_burst * bias + x.flat); });
    const b = Math.abs(mean(e) - 1); if (!best || b < best.b) best = { k, b, m: mean(e), cv: sd(e) / mean(e) }; }
  log(`  アリアン cap 係数 k=${best.k.toFixed(3)}（残差平均 ${best.m.toFixed(3)} / CV ${(best.cv * 100).toFixed(1)}%）`);
  log(`  → 現行 cap は ×${1 + DMG.arian_cap_boost}（burstCapSpecial +${DMG.arian_cap_boost * 100}%）。実効 ×${((1 + DMG.arian_cap_boost) * best.k).toFixed(2)} ＝ **特別減衰 +${(((1 + DMG.arian_cap_boost) * best.k - 1) * 100).toFixed(0)}%**`);
  log('\n  → `node tools/calib_burst_formula.mjs --fix` で当てて検証できる。');
}
