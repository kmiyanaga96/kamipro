// M3 設計支援: `puvoir` 1 stack が cap 拘束成分の出力を何% 動かすかを成分別に見積もる。
//
// なぜ要るか: `puvoir` は **cap（`cap_puvoir` +6%/stack）と raw（`elem_puvoir` +15%/stack・光属性攻撃）の
//   両方**を持つ＝純粋な cap レバーではない（一次情報 `gamedata/md/神姫/hecate.md` §1 アビ1）。
//   ただし **cap はほぼ等倍・raw は slope 倍**に潰れて効くので、**cap/raw 比が違う成分には違う配合で載る**
//   ＝2成分以上を読めば `cap_puvoir` と `elem_puvoir` を連立で分離できる。本スクリプトはその設計行列を出す。
//
// ⚠ 入力（素cap/実効cap/raw/decay出力）は **trial01 の `--cap-probe` 実測値**をそのまま置いている
//   ＝**config が変わったら取り直すこと**（`node tools/calib_replay_compare.mjs --src trial01.md --cap-probe`）。
// ⚠ 本スクリプトは**見積り専用**（production も trial データも読まない）。実測の代わりにはならない。
//
// 実行: node tools/exp_puvoir_lever.mjs
const s = 0.04;                      // decay_abi_slope
const E = 1.5 + 3*0.15 + 1.1;        // trial01 の elemBox = affinity + puvoir×3 + GEAR.elem
const a = 0.06, b = 0.15;            // cap_puvoir / elem_puvoir
const comp = [                       // [名前, 素cap C0, 実効cap, raw, decay出力, 実機hit数]
  ['holy 8hit',      80_000,   190_720,  1_509_337,   243_465, 8],
  ['judg ph0',      350_000,   826_000,  4_514_507,   973_540, 10],
  ['consort',     2_500_000, 6_200_000, 20_585_638, 6_775_426, 2],
];
const pct = x => (x*100).toFixed(2)+'%';
console.log('| 成分 | Δout（1 puvoir stack） | 内 cap 由来 | 内 raw(elem) 由来 | cap 由来の割合 | 実機hit/押下 | 1押下のSE(per-hit CV 1%) |');
console.log('|---|---|---|---|---|---|---|');
for (const [n, C0, cap, raw, out, hits] of comp) {
  const dC = a*C0, dR = raw*b/E;
  const capOnly = dC*(1-s), rawOnly = dR*s;
  const tot = capOnly + rawOnly;
  console.log(`| ${n} | **+${pct(tot/out)}** | +${pct(capOnly/out)} | +${pct(rawOnly/out)} | ${pct(capOnly/tot)} | ${hits} | ${pct(0.01/Math.sqrt(hits))} |`);
}
// 分離可能性: 設計行列 [C0(1-s), raw*s/E] の条件数
const M = comp.map(([,C0,,raw]) => [C0*(1-s), raw*s/E]);
console.log('\n設計行列（列= cap係数 / elem係数 への感度）:');
for (let i=0;i<comp.length;i++) console.log(`  ${comp[i][0].padEnd(10)} [${M[i][0].toFixed(0).padStart(9)}, ${M[i][1].toFixed(0).padStart(7)}]  比 elem/cap = ${(M[i][1]/M[i][0]).toFixed(3)}`);
console.log('→ 比が 0.11〜0.26 で散る＝2成分以上を読めば cap 係数と elem 係数を分離できる');
