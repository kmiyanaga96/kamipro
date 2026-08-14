// T1 canvas 正規化のセルフテスト（Node・ブラウザ不要）
//
// ★なぜ合成フィクスチャか:
//   ①実フレーム（ゲーム画面）は**リポジトリに入れない**（PHASE9_PLAN §10.3＝動画も静止画も原則入れない）。
//   ②Claude はブラウザを見られない（§10.1）＝**Node で回る回帰が唯一の検証経路**。
//   ∴ 幾何だけを模した合成画像で「検出器が満たすべき性質」を固定する。
//      画素の見た目ではなく **性質**（スクロール/ズーム不変性）を検査するのが本テストの主眼。
//
//   ⚠ 本テストが通っても「実フレームで検出できる」ことの証明にはならない。
//      実フレームでの確認は P2 の受け入れ（PHASE9_PLAN §4 P2 の出口条件）で行う。
//
// 使い方: node tools/t1_selftest.mjs

import { detectCanvas, roiToPixels, pixelsToRoi, estimateBackground } from '../src/transcribe/canvas_detect.js';
import { Diag } from '../src/transcribe/diag.js';

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

/** ImageData 互換のオブジェクトを作る。 */
function makeImage(w, h, bg = [255, 255, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

function fillRect(img, x, y, w, h, c) {
  for (let yy = Math.max(0, y); yy < Math.min(img.height, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(img.width, x + w); xx++) {
      const i = (yy * img.width + xx) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
}

/**
 * 録画1フレームの幾何を模した合成画像。
 *   [ブラウザ chrome（全幅・濃色）] → [白い余白] → [ゲーム canvas] → [白] → [下部バナー]
 * canvas 内の既知の正規化位置にマーカーを置き、ROI 不変性の検査に使う。
 */
function synthFrame({ W = 2288, H = 1440, chromeH = 150, cx, cy, cw, ch, withBanner = true }) {
  const img = makeImage(W, H, [255, 255, 255]);
  fillRect(img, 0, 0, W, chromeH, [58, 58, 62]);                  // ブラウザ chrome（全幅）
  fillRect(img, cx, cy, cw, ch, [24, 14, 46]);                    // canvas 本体（宇宙背景＝濃色）
  fillRect(img, cx, cy, cw, Math.max(2, Math.round(ch * 0.012)), [214, 176, 92]); // 金の外枠（上）
  fillRect(img, cx, cy + ch - Math.max(2, Math.round(ch * 0.012)), cw, Math.max(2, Math.round(ch * 0.012)), [214, 176, 92]);
  if (withBanner) {
    // 下部バナー（canvas より背が低く、幅も狭い＝最長 run を奪わないこと自体が検査対象）
    fillRect(img, cx + 10, cy + ch + 40, cw - 20, Math.round(ch * 0.18), [198, 54, 48]);
  }
  // マーカー: canvas 左上から (0.30, 0.20)、大きさ (0.10, 0.06)
  const MK = { x: 0.30, y: 0.20, w: 0.10, h: 0.06 };
  fillRect(img, Math.round(cx + MK.x * cw), Math.round(cy + MK.y * ch),
    Math.round(MK.w * cw), Math.round(MK.h * ch), [0, 220, 255]);
  return { img, truth: { x: cx, y: cy, w: cw, h: ch }, marker: MK };
}

console.log('T1 canvas 正規化 セルフテスト');
console.log('='.repeat(60));

// ── 1. 背景推定 ──────────────────────────────────────────
console.log('\n[1] 背景推定（ページの白を拾えるか）');
{
  const { img } = synthFrame({ cx: 300, cy: 200, cw: 1700, ch: 1140 });
  const bg = estimateBackground(img);
  check('ページ背景を白と推定する', bg[0] > 240 && bg[1] > 240 && bg[2] > 240, `got [${bg}]`);
}

// ── 2. 基本検出 ───────────────────────────────────────────
console.log('\n[2] canvas 矩形の検出（chrome とバナーに惑わされないこと）');
{
  const { img, truth } = synthFrame({ cx: 300, cy: 200, cw: 1700, ch: 1140 });
  const det = detectCanvas(img);
  check('検出に成功する', det.ok, det.reason);
  if (det.ok) {
    const e = ['x', 'y', 'w', 'h'].map(k => Math.abs(det.box[k] - truth[k]));
    check('矩形が真値と ±2px 以内で一致', Math.max(...e) <= 2,
      `box=${JSON.stringify(det.box)} truth=${JSON.stringify(truth)}`);
    check('ブラウザ chrome を掴んでいない', det.box.y > 150, `y=${det.box.y}`);
  }
}

// ── 3. ★スクロール/ズーム不変性（本テストの主眼） ───────────
console.log('\n[3] ★正規化 ROI の不変性（スクロール・ズーム・録画解像度が変わっても同じ物を指すか）');
{
  const cases = [
    { name: '基準',                 W: 2288, H: 1440, cx: 300, cy: 200, cw: 1700, ch: 1140 },
    { name: 'スクロール（y=-120）', W: 2288, H: 1440, cx: 300, cy: 180, cw: 1700, ch: 1140 },
    { name: '横位置ずれ（x=+90）',  W: 2288, H: 1440, cx: 390, cy: 200, cw: 1700, ch: 1140 },
    { name: 'ズーム 80%',           W: 2288, H: 1440, cx: 420, cy: 210, cw: 1360, ch: 912 },
    { name: '別解像度 1920x1200',   W: 1920, H: 1200, cx: 250, cy: 170, cw: 1430, ch: 959 },
  ];
  const recovered = [];
  for (const c of cases) {
    const { img, truth, marker } = synthFrame(c);
    const det = detectCanvas(img);
    if (!det.ok) { check(`${c.name}: 検出に成功する`, false, det.reason); continue; }
    check(`${c.name}: 検出に成功する`, true);

    // 正規化 ROI → 画素 に戻したとき、マーカーの実位置と一致するか
    const rect = roiToPixels(det.box, marker);
    const want = {
      x: Math.round(truth.x + marker.x * truth.w),
      y: Math.round(truth.y + marker.y * truth.h),
      w: Math.round(marker.w * truth.w),
      h: Math.round(marker.h * truth.h),
    };
    const err = Math.max(...['x', 'y', 'w', 'h'].map(k => Math.abs(rect[k] - want[k])));
    check(`${c.name}: 正規化 ROI がマーカーを ±3px で指す`, err <= 3,
      `rect=${JSON.stringify(rect)} want=${JSON.stringify(want)}`);

    // 逆変換: 実マーカー画素矩形 → 正規化 ROI が、条件によらず同じ値になるか
    recovered.push({ name: c.name, roi: pixelsToRoi(det.box, want) });
  }
  // ★これが「正規化」の本質: 条件が違っても同じ正規化座標が出ること
  if (recovered.length >= 2) {
    const base = recovered[0].roi;
    let worst = 0, who = '';
    for (const r of recovered.slice(1)) {
      for (const k of ['x', 'y', 'w', 'h']) {
        const d = Math.abs(r.roi[k] - base[k]);
        if (d > worst) { worst = d; who = `${r.name}.${k}`; }
      }
    }
    check('全条件で同じ正規化座標に落ちる（ばらつき < 0.005）', worst < 0.005,
      `最大ずれ ${worst.toFixed(5)} @ ${who}`);
  }
}

// ── 4. 失敗経路と部分成功の保全（§10.5） ────────────────────
console.log('\n[4] 失敗時の診断（§10.5＝部分成功を必ず保全する）');
{
  const img = makeImage(800, 600, [255, 255, 255]); // canvas が無い（真っ白）
  const det = detectCanvas(img);
  check('canvas が無いフレームは検出失敗になる', !det.ok, JSON.stringify(det.box || {}));

  const diag = new Diag('T1', '0.1.0');
  diag.setInput({ file: 'synthetic', frames: 1 }).stage('ROI', 0, 1);
  const { reportDetection } = await import('../src/transcribe/canvas_detect.js');
  reportDetection(diag, det);
  const out = diag.emit({ frames: [] }, false);

  check('FATAL が1件立つ', out.summary.FATAL === 1, JSON.stringify(out.summary));
  check('コードが T1-ROI-001', out.diagnostics[0]?.code === 'T1-ROI-001', out.diagnostics[0]?.code);
  check('★部分成功の result を必ず含む', out.result !== null && out.result !== undefined);
  check('人が読む1行サマリがある', typeof out.line === 'string' && out.line.includes('T1 v0.1.0'), out.line);
  check('stage が記録されている', out.progress.stage === 'ROI');
}

// ── 5. アスペクト比の WARN（FATAL にしないこと＝E1） ─────────
console.log('\n[5] アスペクト比が想定外でも処理を止めない（未再測の暫定値で止めない＝E1）');
{
  const { img } = synthFrame({ cx: 200, cy: 200, cw: 1900, ch: 700 }); // AR 2.71＝想定外
  const det = detectCanvas(img);
  const diag = new Diag('T1', '0.1.0');
  const { reportDetection } = await import('../src/transcribe/canvas_detect.js');
  const cont = reportDetection(diag, det);
  check('処理を続行する（false を返さない）', cont === true);
  check('WARN が立つ', diag.summary().WARN === 1, JSON.stringify(diag.summary()));
  check('コードが T1-ROI-002', diag.items[0]?.code === 'T1-ROI-002', diag.items[0]?.code);
  check('FATAL は立たない', diag.summary().FATAL === 0);
}

console.log('\n' + '='.repeat(60));
console.log(`結果: ${pass} passed / ${fail} failed`);
if (fail) {
  console.log('\n失敗:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('✅ T1 canvas 正規化 セルフテスト 全通過');
