#!/usr/bin/env node
// T1 状態ダンプ診断ツール（実機較正用・本体 index.html は不変更）
//
// index.html からシムエンジンを抽出し、_decay / burst を計装して T1 を実行する。
// 出力: 押し順 / ロボ状態(droid/banoshik_robot) / 全バフスタック / フレーム別ダメージ /
//        per-char バースト内訳(本体+追撃) / Effond・JD・ロボ反応 のダメージ。
//
// 用途: 実機ログと並べて突き合わせ、Effond -82% 等の乖離が
//        「ロボ未起動」か「係数不足」かを即判定する。
//
// 使い方:
//   node tools/t1_dump.js            # T1 のみダンプ
//   node tools/t1_dump.js 1 2 3      # 指定ターンまで順にダンプ
//
// 注意: applyGear/GEAR_K_C(UIセクション)は抽出範囲外のため base_atk=1500 の
//       抽象スケール値になる(CLAUDE.md「検証方法」と同じ前提)。実機絶対値較正には
//       per-char ATK の配線が別途必要だが、ロボ起動有無/バフスタック/相対寄与の
//       構造診断は抽象スケールでも有効。

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// 本体の検証ハーネスと同じ抽出範囲(ゲーム定数 〜 UI HELPERS 直前)。
let code = html.slice(html.indexOf('// ===== ゲーム定数'), html.indexOf('// ===== UI HELPERS'));
code += '\nglobalThis.Sim=Sim;globalThis.buildFormation=buildFormation;globalThis.DMG=DMG;'
      + 'globalThis.CHARS=CHARS;globalThis.ABIL=ABIL;globalThis.LABEL=LABEL;'
      + 'globalThis.CHAR_SIM_STATES=CHAR_SIM_STATES;';
(0, eval)(code);

buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);

// ===== 計装: _decay をフレーム別に集計 =====
const frameLog = {}; // {frame: {count, raw, out}}
const _decayOrig = Sim.prototype._decay;
let capture = false;
let realSim = null; // 実コミット対象のみ捕捉(ビームのクローンは除外)
Sim.prototype._decay = function (frame, raw, base, up) {
  const out = _decayOrig.call(this, frame, raw, base, up);
  if (capture && this === realSim) {
    // abi フレームは cap(base)値で発生源を分類: Effond / JD / コンソート / ドロイド反応。
    let label = frame;
    if (frame === 'abi') {
      const tag = [
        ['droid', DMG.droid_react_cap], ['effond', DMG.effond_cap],
        ['judg', DMG.judg_cap], ['consort', DMG.consort_cap],
      ].map(([n, c]) => [n, Math.abs((base || 0) - c) / (c || 1)])
        .sort((a, b) => a[1] - b[1])[0];
      label = tag && tag[1] < 0.6 ? `abi:${tag[0]}` : 'abi:?';
    }
    const f = (frameLog[label] ??= { count: 0, raw: 0, out: 0 });
    f.count++; f.raw += raw; f.out += out;
  }
  return out;
};

// ===== 計装: burst を per-owner で集計(本体+追撃) =====
const burstLog = []; // [{owner, atk, delta}]
const _burstOrig = Sim.prototype.burst;
Sim.prototype.burst = function (owner, bset, T, atk = false) {
  const before = this.dmg;
  _burstOrig.call(this, owner, bset, T, atk);
  if (capture && this === realSim) burstLog.push({ owner, atk, delta: Math.round(this.dmg - before) });
};

const fmt = n => Math.round(n).toLocaleString('en-US');

function dumpTurn(sim, t) {
  // 計装はこのターンの分だけ集計
  for (const k of Object.keys(frameLog)) delete frameLog[k];
  burstLog.length = 0;
  capture = true;
  const dmgBefore = sim.dmg;
  const r = sim.greedyTakeTurn(t);
  capture = false;
  const turnDmg = r.dmg - dmgBefore;

  console.log('\n' + '='.repeat(64));
  console.log(`T${t}  FB:${r.atk.length}/5  J:${r.ju}  renri:${r.renri}  ` +
    `cum:${r.keigyo != null ? '' : ''}keigyo:${r.keigyo}`);
  console.log('='.repeat(64));

  // 押し順
  console.log('押し順(ord):');
  console.log('  ' + (r.ord.length ? r.ord.map(o => `[${o.color}]${o.text}`).join(' → ') : '(なし)'));

  // ロボ状態
  console.log(`ロボ: 攻撃ロボ(droid)=${r.droid}  補助ロボ(banoshik_robot)=${r.banoshik_robot}`);

  // バフ全スタック(ターン終了時点)
  const buf = r.state.buf;
  const active = Object.entries(buf).filter(([, v]) => v.length);
  console.log('バフスタック(残ターン):');
  if (active.length) {
    for (const [k, v] of active) console.log(`  ${k.padEnd(16)} x${v.length}  [${v.join(',')}]`);
  } else console.log('  (なし)');

  // フレーム別ダメージ
  console.log('フレーム別ダメージ(out / raw / 回数):');
  const order = ['na', 'abi:judg', 'abi:effond', 'abi:droid', 'abi:consort', 'abi:?', 'burst', 'streak', 'hard'];
  const frames = Object.keys(frameLog).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  for (const f of frames) {
    const x = frameLog[f];
    console.log(`  ${f.padEnd(8)} out=${fmt(x.out).padStart(14)}  raw=${fmt(x.raw).padStart(14)}  n=${x.count}`);
  }

  // per-char バースト内訳
  console.log('バースト内訳(owner / 本体+追撃合算delta):');
  if (burstLog.length) {
    for (const b of burstLog) {
      const jp = (typeof CHAR_SIM_STATES === 'object') ? b.owner : b.owner;
      console.log(`  ${b.owner.padEnd(10)} ${b.atk ? '(攻撃)' : '(誘発)'}  delta=${fmt(b.delta).padStart(12)}`);
    }
  } else console.log('  (バーストなし)');

  console.log(`ターン総ダメージ: ${fmt(turnDmg)}   累計: ${fmt(r.dmg)}`);
  return r;
}

const turns = process.argv.slice(2).map(Number).filter(n => n >= 1);
const maxT = turns.length ? Math.max(...turns) : 1;
const showSet = new Set(turns.length ? turns : [1]);

const sim = new Sim();
realSim = sim;
for (let t = 1; t <= maxT; t++) {
  if (showSet.has(t)) dumpTurn(sim, t);
  else { capture = false; sim.greedyTakeTurn(t); } // 状態を進めるだけ
}
console.log('');
