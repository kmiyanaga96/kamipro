// Phase5 S5: golden 回帰テスト（旧 index.html slice ワンライナーの後継・R6）。
// src/app.js を ESM import し、既定編成の10ターン総ダメージ = 175,023,298 / FullBurst 10/10 をアサート。
// 実行: npm run test:golden  （node test/golden.mjs）
import { Sim, buildFormation } from '../src/app.js';

buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);
const sim = new Sim();
let fb = 0;
for (let t = 1; t <= 10; t++) { const r = sim.takeTurn(t); if (r.full) fb++; }
const dmg = Math.round(sim.dmg);
const ok = dmg === 175023298 && fb === 10;
console.log(`[golden] dmg=${dmg} FB=${fb}/10 => ${ok ? 'OK' : 'MISMATCH (expect 175023298 / 10)'}`);
process.exit(ok ? 0 : 1);
