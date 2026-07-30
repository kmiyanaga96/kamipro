// ============================================================================
// search_validate.mjs — 探索が出した押し順を独立replayで検証（2026-07-02 作成）
// ----------------------------------------------------------------------------
// 目的: takeTurn の探索 order（chip text）を採取し、別Simで _execKeyNoGuard により
//   忠実再生して「探索dmg == replay dmg」かつ「skip=0（往復ロスなし）」を確認する。
//   突出した実験値（例 JUDG_S=130 の 191,141,005）が本物の合法orderか検証するのに使う。
//   point-2（tenya_re の refireOf 往復）は committed 済みのため追加スキャフォールド不要。
//   ※ POC_* env は search_probe と同じくスキャフォールド編集時のみ有効。
//
// 実行例: POC_JUDG_S=130 node tools/search_validate.mjs
//   （JUDG_S=130 は data/characters.js に judg-s env スキャフォールドを当てた状態で）
// ============================================================================
import { Sim, buildFormation, LABEL, CHARS, CHAR_DEF, CHAR_REGISTRY } from '../../src/app.js';
buildFormation('edison', ['yamato', 'hecate', 'tetra', 'elaine']);

const N = +(process.env.POC_N ?? 10);

// 探索 order 採取
const bs = new Sim(); bs.totalTurns = N;
const order = []; let searchDmg = 0;
for (let t = 1; t <= N; t++) { const r = bs.takeTurn(t); order.push(r.ord.map(c => c.text)); searchDmg = r.dmg; }

// replay 用 name map（runReplay/buildReplayNameMap と同一ロジック・refireOf 込み）
function buildMap() {
  const m = {};
  for (const [k, v] of Object.entries(LABEL)) { if (!m[v]) m[v] = k; const b = v.replace(/\([^)]*\)/g, '').trim(); if (!m[b]) m[b] = k; }
  for (const c of CHARS) { const d = CHAR_DEF[c], s = d.shortJp || d.jp, ks = Object.keys(d.abilities || {}); for (let i = 0; i < ks.length; i++) { const a = s + (i + 1); if (!m[a]) m[a] = ks[i]; } }
  for (const c of CHARS) { const cd = CHAR_REGISTRY[c].cands || {}; for (const [key, cand] of Object.entries(cd)) if (cand.refireOf) m[`${LABEL[cand.refireOf]}${cand.refireSuffix || ''}`] = key; }
  return m;
}
const nm = buildMap();
const parse = t => { t = t.replace(/^\d+\./, '').trim(); if (nm[t]) return nm[t]; const b = t.replace(/\([^)]*\)$/, '').trim(); return nm[b] ?? null; };

const rs = new Sim(); rs.totalTurns = N; let skip = 0;
for (let t = 1; t <= N; t++) {
  rs._beginTurn(t);
  order[t - 1].map(parse).forEach(k => { if (k != null && !rs._execKeyNoGuard(k)) skip++; });
  rs._attackPhase(); rs._endBookkeep(t);
}
const ok = Math.round(searchDmg) === Math.round(rs.dmg) && skip === 0;
console.log(`[search_validate] JUDG_S=${process.env.POC_JUDG_S ?? 'dyn'} FUNKI_S=${process.env.POC_FUNKI_S ?? 150} ROLLOUT_BW=${process.env.POC_ROLLOUT_BW ?? 1}`);
console.log(`  探索dmg   = ${Math.round(searchDmg).toLocaleString()}`);
console.log(`  replay dmg = ${Math.round(rs.dmg).toLocaleString()}   skip = ${skip}`);
console.log(`  => ${ok ? 'OK（合法order・往復忠実）' : 'NG（不一致 or skipあり）'}`);
