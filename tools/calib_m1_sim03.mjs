// M1 ── sim03 の D走（固定押し順・全深撃破）を現行エンジンで強制リプレイし、成分別に突合する。★リポジトリ非改変
//
// 目的（sim05 README §4.8 / §4.8.1）:
//   ① **環境妥当性検査**: sim03/sim04 当時の一致が C37（押し順）・C39（`_naOwner`）後も保たれているか。
//      ズレるならハーネスか現行モデルの問題で、ナポ/アリアンの話に入る前に潰す。
//   ② **バースト式の構造パラメータ**: sim03 は **configA**（GEAR `burst_cap` 1.98 / `burst_dmg` 4.86）で、
//      sim05 の configC v3（2.34 / 7.10）と**別の cap 水準**＝pre-trial 単独では共線性で分離できなかった
//      「cap 構成 vs slope vs calib」を切り分けられる**唯一の在庫**。
//      さらに **同一 FB 内のキャラ間比**はパーティバフが約分されるので**バフ量を知らなくても使える**。
//
// データ: `simulation/sim03/data/trial01〜05.md`（6列様式。sim04/sim05 の11列様式とは別物）
//   - 押し順は「## 固定押し順」節から（`**` と `(赤)` の装飾を落とす）
//   - 成分値は「## TN 記録」表から（`発生hit（成分・キャラ）` 列の並び順に `値` 列が対応する）
//
// 実行:
//   node tools/calib_m1_sim03.mjs            # 現行モデル
//   node tools/calib_m1_sim03.mjs --fix      # configC で推定した calib_burst=1.66 を当てて検証
//                                            #   （アリアン不在なので arian_cap_boost は無関係）
import fs from 'node:fs';
import { Sim, buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG,
         setCurrentSubs, setStaticOverride } from '/home/user/kamipro/src/app.js';

const log = s => process.stdout.write(s + '\n');
const f = n => Math.round(n).toLocaleString('en-US');
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const sd = a => Math.sqrt(mean(a.map(v => (v - mean(a)) ** 2)));
const nums = s => (s.match(/\d[\d,]*/g) || []).map(x => +x.replace(/,/g, ''));
const FIX = process.argv.includes('--fix');

// ══ config（sim03 の受領キャッシュから復元・ハードコードしない）══
const CFG = JSON.parse(fs.readFileSync('/home/user/kamipro/simulation/sim03/data/configA.json', 'utf8'));
const SIG = JSON.parse(CFG.entries[0][0].split('|').slice(1).join('|'));
const [HERO, KAMI, G, SUBS, , , E_BM, E_BC] = SIG;          // 旧署名: barrier/abilCap 無し
const OVERRIDE = CFG.entries[0][1].override || {};

// ══ trial のパース ══
const JP2KEY = { 'edison': 'edison', 'yamato': 'yamato', 'hecate': 'hecate', 'tetra': 'tetra', 'elaine': 'elaine' };
function parseTrial(path) {
  const src = fs.readFileSync(path, 'utf8').split('\n');
  // 表示ATK（メタヘッダ）
  const disp = {};
  { const m = src.find(l => /UI装備パネル一致確認/.test(l));
    for (const [, k, v] of m.matchAll(/([a-z_]+)\s*=\s*([\d,]+)/g)) disp[k] = +v.replace(/,/g, ''); }
  // 押し順
  const keys = {};
  for (const l of src) {
    const m = l.match(/^\*\*T(\d)（[^）]*）\*\*:\s*(.*)$/);
    if (!m) continue;
    keys[+m[1]] = m[2].split('→').map(s => s.replace(/\*\*/g, '').replace(/\(.*?\)/g, '').trim()).filter(Boolean);
  }
  // 成分値（## TN 記録 の表）
  const comp = {};   // comp[t] = { press:[{key, parts:{成分:値[]}}], fb:{owner:{成分:値}} , streak }
  let t = null;
  for (const l of src) {
    const h = l.match(/^## T(\d) 記録/); if (h) { t = +h[1]; comp[t] = { press: [], fb: {}, streak: null }; continue; }
    if (/^## /.test(l)) { if (!/記録/.test(l)) t = null; continue; }
    if (!t || !l.startsWith('|')) continue;
    const c = l.split('|').slice(1, -1).map(s => s.trim());
    if (c.length !== 6 || c[0] === '押下#' || /^-+$/.test(c[0])) continue;
    if (c[0] === '(攻撃フェイズ)') {
      const owners = c[1].split('/').map(s => s.trim());
      const comps = c[2].split('/').map(s => s.trim());
      const groups = c[3].split('/').map(s => nums(s));
      // 先頭 owners.length グループが各キャラ、最後の余りがストリーク
      owners.forEach((o, i) => { const g = groups[i] || []; const e = {};
        comps.forEach((cm, j) => { if (cm !== 'バーストストリーク' && g[j] !== undefined) e[cm] = g[j]; });
        comp[t].fb[JP2KEY[o] || o] = e; });
      if (groups.length > owners.length) comp[t].streak = groups[owners.length][0];
      continue;
    }
    if (!/^\d+$/.test(c[0])) continue;
    const key = c[1].replace(/\(.*?\)/g, '').trim();
    const comps = c[2].split('/').map(s => s.trim());
    const vals = nums(c[3]);
    const parts = {};
    comps.forEach((cm, j) => { if (vals[j] !== undefined) parts[cm] = vals[j]; });
    comp[t].press.push({ key, ph: (c[1].match(/ph(\d)/) || [])[1], parts });
  }
  return { disp, keys, comp };
}

// ══ 1 trial を走らせて突合 ══
function runTrial(path) {
  const { disp, keys, comp } = parseTrial(path);
  setCurrentSubs(SUBS); buildFormation(HERO, KAMI); applyEnemy('cath_palug');
  for (const k of Object.keys(GEAR)) GEAR[k] = G[k] ?? 0;
  DMG.edison_burst_extra_mult = E_BM; DMG.edison_burst_extra_cap = E_BC;
  DMG.enemy_barrier = null; DMG.enemy_abil_cap = null;
  if (FIX) DMG.calib_burst = 1.66;
  recalcGearK(); recalcGearKCFromDispAtk(disp);
  setStaticOverride(OVERRIDE);

  let CUR = 0, CURKEY = 'FB', BODY = 0;
  const bursts = [], totals = {};
  const oe = Sim.prototype._execKey;
  Sim.prototype._execKey = function (k) { if (this.planDepth === 0) CURKEY = k; const r = oe.call(this, k); if (this.planDepth === 0) CURKEY = 'FB'; return r; };
  const ob = Sim.prototype.burst;
  Sim.prototype.burst = function (owner, bset, T, atk) {
    if (this.planDepth !== 0) return ob.call(this, owner, bset, T, atk);
    const naB = this._na(); BODY = 0;
    const core = ob.call(this, owner, bset, T, atk);
    bursts.push({ t: CUR, key: CURKEY, owner, naB, raw: this.__raw, cap: this.__cap, core, body: BODY, phase: CURKEY === 'FB' ? 'fb' : 'press' });
    return core;
  };
  const od = Sim.prototype._decay;
  Sim.prototype._decay = function (fr, raw, base, nc) { if (this.planDepth === 0 && fr === 'burst') { this.__raw = raw; this.__cap = base; } return od.call(this, fr, raw, base, nc); };

  const sim = new Sim(); sim.totalTurns = 10;
  { let _d = sim.dmg;
    Object.defineProperty(sim, 'dmg', { configurable: true, enumerable: true, get() { return _d; }, set(v) {
      const dd = v - _d; _d = v; if (!dd) return;
      for (const l of new Error().stack.split('\n').slice(2)) {
        const m = l.match(/(characters|sim)\.js:(\d+):/);
        if (m) { if (m[1] === 'sim' && m[2] === '204') BODY += dd; break; } } } }); }
  let prev = 0;
  const rej = {};
  for (const t of [1, 2, 3]) {
    if (!keys[t]) break;
    CUR = t;
    const r = sim.greedyTakeTurn(t, keys[t]);
    const cnt = a => a.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {});
    const a = cnt(keys[t]), b = cnt(r.keys), miss = [];
    for (const k of Object.keys(a)) { const d = a[k] - (b[k] || 0); if (d > 0) miss.push(`${k}×${d}`); }
    rej[t] = { used: r.keys.length, want: keys[t].length, miss };
    totals[t] = sim.dmg - prev; prev = sim.dmg;
  }
  Sim.prototype._execKey = oe; Sim.prototype.burst = ob; Sim.prototype._decay = od;

  // 実機のバースト本体を「キー＋オーナー」で対応付ける
  const OWNER_OF = { effond: 'hecate', alone: 'elaine', judg: 'tetra', tenya: 'yamato', tenya_re: 'yamato' };
  const pairs = [];
  for (const t of [1, 2, 3]) {
    if (!comp[t]) continue;
    const realPress = comp[t].press.filter(p => p.parts['バースト本体'] !== undefined);
    const byO = {}; realPress.forEach(p => { const o = OWNER_OF[p.key] || p.key; (byO[o] ??= []).push(p.parts['バースト本体']); });
    const idx = {};
    for (const x of bursts.filter(x => x.t === t && x.phase === 'press')) {
      const v = byO[x.owner]?.[idx[x.owner] || 0]; if (v === undefined) continue;
      idx[x.owner] = (idx[x.owner] || 0) + 1; pairs.push({ ...x, real: v });
    }
    for (const x of bursts.filter(x => x.t === t && x.phase === 'fb')) {
      const v = comp[t].fb[x.owner]?.['バースト本体']; if (v === undefined) continue;
      pairs.push({ ...x, real: v });
    }
  }
  return { disp, rej, totals, pairs, comp, bursts };
}

// ══ 実行 ══
log(`\n■ M1: sim03 D走 × 現行エンジン（calib_burst=${FIX ? 1.66 : DMG.calib_burst}${FIX ? '  ← --fix' : ''}）`);
log(`  config: ${HERO} / ${JSON.stringify(KAMI)} / subs ${JSON.stringify(SUBS)} / cath_palug`);
log(`  GEAR: burst_dmg=${G.burst_dmg} burst_cap=${G.burst_cap}（configC v3 は 7.10 / 2.34）`);
log(`  override(cache): ${JSON.stringify(OVERRIDE)}\n`);

const ALL = [];
log('| trial | T | 実機押下 | シム実行 | 却下 |');
log('|---|---|---|---|---|');
for (let i = 1; i <= 5; i++) {
  const p = `/home/user/kamipro/simulation/sim03/data/trial0${i}.md`;
  const r = runTrial(p); ALL.push({ i, ...r });
  for (const t of [1, 2, 3]) if (r.rej[t]) log(`| ${i} | ${t} | ${r.rej[t].want} | ${r.rej[t].used} | ${r.rej[t].miss.join(' ') || '—'} |`);
}
const P = ALL.flatMap(a => a.pairs);
log(`\n■ バースト本体の突合（n=${P.length}・sim03 configA）\n`);
log('| owner | n | 実機/シム本体 | CV |');
log('|---|---|---|---|');
for (const o of ['edison', 'yamato', 'hecate', 'tetra', 'elaine']) {
  const a = P.filter(x => x.owner === o); if (!a.length) continue;
  const e = a.map(x => x.real / x.body);
  log(`| ${o} | ${a.length} | ${mean(e).toFixed(3)} | ${(sd(e) / mean(e) * 100).toFixed(1)}% |`); }
{ const e = P.map(x => x.real / x.body);
  log(`| **全体** | ${P.length} | **${mean(e).toFixed(3)}** | **${(sd(e) / mean(e) * 100).toFixed(1)}%** |`); }

log('\n■ 同一 FB 内のキャラ間比（パーティバフが約分される＝バフ量を知らなくても使える）\n');
log('| trial | T | キャラ | シム core 比 | 実機 比 | ズレ |');
log('|---|---|---|---|---|---|');
for (const a of ALL) for (const t of [1, 2, 3]) {
  const fb = a.pairs.filter(x => x.t === t && x.phase === 'fb'); if (fb.length < 3) continue;
  const mc = mean(fb.map(x => x.core)), mr = mean(fb.map(x => x.real));
  for (const x of fb) log(`| ${a.i} | ${t} | ${x.owner} | ×${(x.core / mc).toFixed(3)} | ×${(x.real / mr).toFixed(3)} | ${((x.core / mc) / (x.real / mr)).toFixed(3)} |`);
}
log('\n■ ★configC で推定した係数はここでも成立するか');
{ const e = P.map(x => x.real / x.body);
  log(`  sim03(configA) 実機/シム本体 = ${mean(e).toFixed(3)}  →  真の calib_burst ≈ ${(DMG.calib_burst * mean(e)).toFixed(2)}`);
  log(`  （configC v3 の pre-trial では 0.800 → 1.66。**両者が一致するなら calib_burst は config 非依存の1個のスカラ**）`); }

// ══════════════════════════════════════════════════════════════════
// ★ M1 の本命: **configA と configC の2水準**で cap/slope/calib を同時 fit する
//   （pre-trial 単独では cap と raw が同時にしか動かず共線性で分離できなかった＝§4.8.1）
// ══════════════════════════════════════════════════════════════════
log('\n\n■ ★ 2 config 同時 fit（configA cap 1.98 / configC v3 cap 2.34）\n');

// configC + pre-trial を同一プロセスで続けて走らせる（GEAR/DMG はミュータブルなグローバル）
const C5 = JSON.parse(fs.readFileSync('/home/user/kamipro/simulation/sim05/data/configC_cache_20260803.json', 'utf8'));
const S5 = JSON.parse(C5.entries[0][0].split('|').slice(1).join('|'));
const [H5, K5, G5, SUB5, D5, HP5, BM5, BC5, , BAR5] = S5;
const PT = fs.readFileSync('/home/user/kamipro/simulation/sim05/data/pre-trial.md', 'utf8').split('\n');
const REAL5 = { 1: { press: [['hecate', 6147458], ['tetra', 6539050], ['arianrhod', 9640546], ['arianrhod', 9629984],
                             ['arianrhod', 10082624], ['hecate', 7494372], ['tetra', 8258534], ['arianrhod', 15177635],
                             ['elaine', 11763033], ['elaine', 9967021], ['hecate', 11104675], ['elaine', 11231301]],
                     fb: { napoleon: 12104981, hecate: 11240495, tetra: 10969021, arianrhod: 16510400, elaine: 10498890 } } };
function runPreTrialT1() {
  setCurrentSubs(SUB5); buildFormation(H5, K5); applyEnemy('ryomen_sukuna');
  for (const k of Object.keys(GEAR)) GEAR[k] = G5[k] ?? 0;
  DMG.enemy_def = D5; DMG.enemy_max_hp = HP5; DMG.enemy_barrier = BAR5;
  DMG.edison_burst_extra_mult = BM5; DMG.edison_burst_extra_cap = BC5;
  DMG.betaia_mult = 3.5; DMG.betaia_cap = 800000; DMG.napo_burst_cd_reduce = true; DMG.enemy_abil_cap = null;
  const disp = {}; { const m = PT.find(l => /表示ATK5人分/.test(l));
    for (const [, k, v] of m.matchAll(/([a-z_]+)=([\d,]+)/g)) disp[k] = +v.replace(/,/g, ''); }
  recalcGearK(); recalcGearKCFromDispAtk(disp); setStaticOverride({ pactcore: 1, effond: 120 });
  const keys = {}; { let t = null, e = 0;
    for (const ln of PT) { if (!ln.startsWith('|')) continue;
      const c = ln.split('|').slice(1, -1).map(s => s.trim());
      if (c.length !== 11 || c[0] === 'T' || /^-+$/.test(c[0])) continue;
      if (c[0]) { if (+c[0] !== t) e = 0; t = +c[0]; }
      if (!t || c[1] === '(攻撃フェイズ)') continue;
      const k = c[2].replace(/\(.*\)$/, '').trim(); if (!k) continue;
      (keys[t] ??= []).push(k === 'elegant' ? (e++ ? 'elegant_re' : 'elegant') : k); } }
  let CUR = 1, CURKEY = 'FB', BODY = 0; const bursts = [];
  const oe = Sim.prototype._execKey;
  Sim.prototype._execKey = function (k) { if (this.planDepth === 0) CURKEY = k; const r = oe.call(this, k); if (this.planDepth === 0) CURKEY = 'FB'; return r; };
  const od = Sim.prototype._decay;
  Sim.prototype._decay = function (fr, raw, base, nc) { if (this.planDepth === 0 && fr === 'burst') { this.__raw = raw; this.__cap = base; } return od.call(this, fr, raw, base, nc); };
  const ob = Sim.prototype.burst;
  Sim.prototype.burst = function (owner, bset, T, atk) {
    if (this.planDepth !== 0) return ob.call(this, owner, bset, T, atk);
    BODY = 0; const core = ob.call(this, owner, bset, T, atk);
    bursts.push({ owner, raw: this.__raw, cap: this.__cap, core, body: BODY, phase: CURKEY === 'FB' ? 'fb' : 'press' });
    return core; };
  const s = new Sim(); s.totalTurns = 10;
  { let _d = s.dmg; Object.defineProperty(s, 'dmg', { configurable: true, enumerable: true, get() { return _d; }, set(v) {
      const dd = v - _d; _d = v; if (!dd) return;
      for (const l of new Error().stack.split('\n').slice(2)) { const m = l.match(/(characters|sim)\.js:(\d+):/);
        if (m) { if (m[1] === 'sim' && m[2] === '204') BODY += dd; break; } } } }); }
  s.greedyTakeTurn(1, keys[1]);
  Sim.prototype._execKey = oe; Sim.prototype.burst = ob; Sim.prototype._decay = od;
  const out = []; const byO = {}; REAL5[1].press.forEach(([o, v]) => { (byO[o] ??= []).push(v); }); const idx = {};
  for (const x of bursts.filter(x => x.phase === 'press')) { const v = byO[x.owner]?.[idx[x.owner] || 0];
    if (v === undefined) continue; idx[x.owner] = (idx[x.owner] || 0) + 1; out.push({ ...x, real: v }); }
  for (const x of bursts.filter(x => x.phase === 'fb')) out.push({ ...x, real: REAL5[1].fb[x.owner] });
  return out;
}
const P5 = runPreTrialT1().filter(x => x.owner !== 'arianrhod');   // アリアンは固有バグ（C44②）なので除く
const CAL = FIX ? 1.66 : 2.07;
const rowsA = P.map(x => ({ cfg: 'A', cap: x.cap, raw: x.raw, y: x.real - (x.body - x.core * CAL) }));
const rowsC = P5.map(x => ({ cfg: 'C', cap: x.cap, raw: x.raw, y: x.real - (x.body - x.core * CAL) }));
function fit2(rows) {
  let Saa = 0, Sab = 0, Sbb = 0, Say = 0, Sby = 0;
  for (const r of rows) { Saa += r.cap * r.cap; Sab += r.cap * r.raw; Sbb += r.raw * r.raw; Say += r.cap * r.y; Sby += r.raw * r.y; }
  const det = Saa * Sbb - Sab * Sab, al = (Say * Sbb - Sby * Sab) / det, be = (Sby * Saa - Say * Sab) / det;
  const e = rows.map(r => r.y / (al * r.cap + be * r.raw));
  return { al, be, A: al + be, s: be / (al + be), cv: sd(e) / mean(e), m: mean(e), e };
}
log('| 対象 | n | cap 平均 | raw/cap 平均 | A(=calib相当) | s(=slope相当) | 残差CV |');
log('|---|---|---|---|---|---|---|');
for (const [lab, rows] of [['configA のみ', rowsA], ['configC のみ', rowsC], ['**両方（共線性が破れる）**', rowsA.concat(rowsC)]]) {
  const F = fit2(rows);
  log(`| ${lab} | ${rows.length} | ${f(mean(rows.map(r => r.cap)))} | ${(mean(rows.map(r => r.raw / r.cap))).toFixed(2)} | ${F.A.toFixed(3)} | ${F.s.toFixed(3)} | ${(F.cv * 100).toFixed(1)}% |`);
}
log(`\n  現行モデル: A=calib_burst ${CAL} / s=decay_burst.slope ${DMG.decay_burst.slope}`);
log('\n■ 現行モデル（cap/slope 固定）の残差を config 別に見る\n');
log('| config | n | 実機/シム本体 | CV | → 真の calib_burst |');
log('|---|---|---|---|---|');
for (const [lab, arr] of [['configA (sim03)', P], ['configC v3 (pre-trial T1・非アリアン)', P5]]) {
  const e = arr.map(x => x.real / x.body);
  log(`| ${lab} | ${arr.length} | ${mean(e).toFixed(3)} | ${(sd(e) / mean(e) * 100).toFixed(1)}% | ${(CAL * mean(e)).toFixed(2)} |`);
}

// ══════════════════════════════════════════════════════════════════
// ★ slope 掃引: 2 config の「実機/シム本体」が一致する slope を探す
//   現行の s=0.10 では configA 0.707 / configC 0.800 と **13% 食い違う**＝
//   「cap + s×超過」の形が cap 水準を変えると系統的にズレている。
//   両者が一致する s があれば、**calib_burst は config 非依存の単一スカラに戻せる**。
// ══════════════════════════════════════════════════════════════════
if (process.argv.includes('--slope')) {
  log('\n\n■ ★ slope 掃引（両 config の残差平均が一致する点を探す）\n');
  log('| slope | configA 実機/シム | configC 実機/シム | 差 | 共通 calib 候補 |');
  log('|---|---|---|---|---|');
  const base = DMG.decay_burst.slope;
  let best = null;
  for (const s of [0.05, 0.08, 0.10, 0.13, 0.16, 0.20, 0.25, 0.30, 0.40, 0.50]) {
    DMG.decay_burst.slope = s;
    DMG.calib_burst = 2.07;
    const a = [];
    for (let i = 1; i <= 5; i++) a.push(...runTrial(`/home/user/kamipro/simulation/sim03/data/trial0${i}.md`).pairs);
    const c = runPreTrialT1().filter(x => x.owner !== 'arianrhod');
    const ea = mean(a.map(x => x.real / x.body)), ec = mean(c.map(x => x.real / x.body));
    const d = Math.abs(ea - ec) / ((ea + ec) / 2);
    if (!best || d < best.d) best = { s, d, ea, ec };
    log(`| ${s.toFixed(2)} | ${ea.toFixed(3)} | ${ec.toFixed(3)} | ${(d * 100).toFixed(1)}% | ${(2.07 * (ea + ec) / 2).toFixed(2)} |`);
  }
  DMG.decay_burst.slope = base;
  log(`\n  → 最も食い違いが小さいのは **slope=${best.s}**（差 ${(best.d * 100).toFixed(1)}%）・共通 calib ≈ ${(2.07 * (best.ea + best.ec) / 2).toFixed(2)}`);
}

// ══ 検証: slope 候補で残差が「減衰の深さ (raw/cap)」と無相関になるか ══
//   slope が誤っていれば、残差は深さと系統的に相関する（深いほどズレる）。
//   正しい slope では相関が消えるはず＝config を跨がなくても効く内部検証。
if (process.argv.includes('--verify')) {
  const S = +(process.argv[process.argv.indexOf('--verify') + 1] || 0.30);
  const C = +(process.argv[process.argv.indexOf('--verify') + 2] || 1.28);
  log(`\n\n■ ★ 検証: slope=${S} / calib_burst=${C}\n`);
  DMG.decay_burst.slope = S;
  const A = []; for (let i = 1; i <= 5; i++) { DMG.calib_burst = C; A.push(...runTrial(`/home/user/kamipro/simulation/sim03/data/trial0${i}.md`).pairs); }
  DMG.calib_burst = C;
  const Cc = runPreTrialT1().filter(x => x.owner !== 'arianrhod');
  const corr = rows => { const x = rows.map(r => r.raw / r.cap), y = rows.map(r => r.real / r.body);
    const mx = mean(x), my = mean(y);
    return x.map((v, i) => (v - mx) * (y[i] - my)).reduce((p, q) => p + q, 0) /
           Math.sqrt(x.map(v => (v - mx) ** 2).reduce((p, q) => p + q, 0) * y.map(v => (v - my) ** 2).reduce((p, q) => p + q, 0)); };
  log('| 対象 | n | 実機/シム本体 | CV | 残差 vs 減衰の深さ(raw/cap) の相関 |');
  log('|---|---|---|---|---|');
  for (const [lab, rows] of [['configA (sim03)', A], ['configC v3 (pre-trial)', Cc], ['**両方**', A.concat(Cc)]]) {
    const e = rows.map(x => x.real / x.body);
    log(`| ${lab} | ${rows.length} | ${mean(e).toFixed(3)} | ${(sd(e) / mean(e) * 100).toFixed(1)}% | r=${corr(rows).toFixed(3)} |`); }
  log('\n| owner | n | 実機/シム本体 | CV |');
  log('|---|---|---|---|');
  for (const o of ['edison', 'yamato', 'hecate', 'tetra', 'elaine', 'napoleon']) {
    const a = A.concat(Cc).filter(x => x.owner === o); if (!a.length) continue;
    const e = a.map(x => x.real / x.body);
    log(`| ${o} | ${a.length} | ${mean(e).toFixed(3)} | ${(sd(e) / mean(e) * 100).toFixed(1)}% |`); }
}

// ══ 細かい slope 掃引: 残差と「減衰の深さ」の相関がゼロになる点を探す（＝系統誤差が消える点）══
if (process.argv.includes('--fine')) {
  log('\n\n■ ★ slope 細掃引（残差×深さの相関がゼロになる点＝系統誤差が消える点）\n');
  log('| slope | 実機/シム(全体) | CV | r(残差×深さ) | 共通 calib 候補 |');
  log('|---|---|---|---|---|');
  const corr = rows => { const x = rows.map(r => r.raw / r.cap), y = rows.map(r => r.real / r.body);
    const mx = mean(x), my = mean(y);
    return x.map((v, i) => (v - mx) * (y[i] - my)).reduce((p, q) => p + q, 0) /
           Math.sqrt(x.map(v => (v - mx) ** 2).reduce((p, q) => p + q, 0) * y.map(v => (v - my) ** 2).reduce((p, q) => p + q, 0)); };
  let best = null;
  for (const s of [0.26, 0.28, 0.30, 0.32, 0.34, 0.36, 0.38, 0.40]) {
    DMG.decay_burst.slope = s; DMG.calib_burst = 2.07;
    const A = []; for (let i = 1; i <= 5; i++) A.push(...runTrial(`/home/user/kamipro/simulation/sim03/data/trial0${i}.md`).pairs);
    const Cc = runPreTrialT1().filter(x => x.owner !== 'arianrhod');
    const all = A.concat(Cc), e = all.map(x => x.real / x.body), r = corr(all);
    if (!best || Math.abs(r) < Math.abs(best.r)) best = { s, r, m: mean(e), cv: sd(e) / mean(e) };
    log(`| ${s.toFixed(2)} | ${mean(e).toFixed(3)} | ${(sd(e) / mean(e) * 100).toFixed(1)}% | ${r.toFixed(3)} | ${(2.07 * mean(e)).toFixed(2)} |`);
  }
  log(`\n  → r≈0 は **slope=${best.s}**（r=${best.r.toFixed(3)}・CV ${(best.cv * 100).toFixed(1)}%）／共通 calib_burst ≈ **${(2.07 * best.m).toFixed(2)}**`);
}
