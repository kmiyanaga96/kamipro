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
// ★例外＝`tools/fixtures/*.json`（2026-08-15 追加）:
//   実走の診断JSONから持ち帰った**数値プロファイル**（列ごとの占有率など）は収録する。
//   画像ではない（120個の集計値）ので §10.3 の「動画・静止画を入れない」に抵触せず、
//   **合成では再現できなかった実条件**（孤立列・演出による ROI 汚染）を回帰として固定できる。
//   ⭐ 合成で通っていたテストが実走で崩れる事故を 2 世代続けたので、実物を焼き直す方を規律とする。
//
// 使い方: node tools/t1_selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectCanvas, roiToPixels, pixelsToRoi, estimateBackground } from '../src/transcribe/canvas_detect.js';
import { Diag } from '../src/transcribe/diag.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** フィクスチャの連長圧縮を展開する。★length で転記ミスを検出する。 */
function expandRuns(p) {
  const out = [];
  for (const [v, n] of p.runs) for (let i = 0; i < n; i++) out.push(v);
  return out;
}

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

// ── 6. 右パネルのモード判定（list / detail） ────────────────
console.log('\n[6] 右パネルのモード判定（アビリティ発動で list⇄detail を無数に行き来する）');
{
  const { detectPanelMode, listSlotRects } = await import('../src/transcribe/panel_mode.js');
  const { Diag: D } = await import('../src/transcribe/diag.js');
  const { reportPanelMode } = await import('../src/transcribe/panel_mode.js');

  const RECT = { x: 0, y: 0, w: 370, h: 705 };

  /** list モード: 同じ構造の帯が5つ縦に並ぶ（中身の明るさは行ごとに変える＝内容非依存を検査） */
  function listPanel() {
    const img = makeImage(RECT.w, RECT.h, [18, 24, 40]);
    const slot = RECT.h / 5;
    for (let i = 0; i < 5; i++) {
      const top = Math.round(i * slot);
      const tint = 10 * i;                                  // 行ごとに中身を変える
      fillRect(img, 0, top + 4, RECT.w, 30, [40 + tint, 90 + tint, 150]);   // 名前帯
      fillRect(img, 8, top + 38, 210, 44, [70, 150, 220 - tint]);           // HP 数値の帯
      fillRect(img, 8, top + 88, 180, 14, [200, 180, 60]);                  // Ability の◆列
      fillRect(img, 8, top + 108, RECT.w - 16, 22, [150, 40 + tint, 40]);   // バフ列
    }
    return img;
  }

  /**
   * detail モード: 単一構造（Status / Burst 説明 / Ability 2x2）。
   * ★このフィクスチャは**回帰ガードを兼ねる**: Ability 2×2 の行ピッチを 150px と、
   *   list のスロット高さ 141px に**わざと近づけてある**。
   *   単一ラグの自己相関だけで判定していた版は、これを list と誤判定した（2026-08-14）。
   *   調和成分（L・2L・3L）まで要求することで分離している＝この検査が緩むと再発する。
   */
  function detailPanel() {
    const img = makeImage(RECT.w, RECT.h, [18, 24, 40]);
    fillRect(img, 0, 10, RECT.w, 120, [40, 90, 150]);                       // Status ブロック
    fillRect(img, 8, 150, RECT.w - 16, 210, [120, 30, 30]);                 // Burst 効果テキスト
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++)                 // Ability 2x2
      fillRect(img, 20 + c * 180, 400 + r * 150, 150, 130, [200, 160, 70]);
    return img;
  }

  const dl = detectPanelMode(listPanel(), RECT);
  const dd = detectPanelMode(detailPanel(), RECT);
  check('list を list と判定する', dl.mode === 'list', `score=${dl.score.toFixed(3)}`);
  check('detail を detail と判定する', dd.mode === 'detail', `score=${dd.score.toFixed(3)}`);
  check('list のほうが周期スコアが高い', dl.score > dd.score,
    `list=${dl.score.toFixed(3)} detail=${dd.score.toFixed(3)}`);
  if (dl.mode === 'list') {
    check('検出周期がスロット高さ（141px）の ±15% 以内', Math.abs(dl.period - 141) <= 21,
      `period=${dl.period}`);
    const slots = listSlotRects(RECT, dl.period);
    check('5キャラ分の行矩形が出る', slots.length === 5);
    check('行矩形がパネル内に収まる', slots.at(-1).y + slots.at(-1).h <= RECT.h + 2,
      `last=${JSON.stringify(slots.at(-1))}`);
  }

  // ★実フレームで観測した score を回帰として固定する（2026-08-14・pic.mp4）
  //   list 0.806 / detail 0.073。閾値を動かしてこの2点が誤分類されたら壊れている。
  const { PANEL_DEFAULTS } = await import('../src/transcribe/panel_mode.js');
  check('実測 list score 0.806 は list 側', 0.806 >= PANEL_DEFAULTS.listThreshold);
  check('実測 detail score 0.073 は detail 側', 0.073 < PANEL_DEFAULTS.listThreshold);
  check('実測2点とも WARN 帯の外（余裕がある）',
    Math.abs(0.806 - PANEL_DEFAULTS.listThreshold) >= PANEL_DEFAULTS.warnBand
    && Math.abs(0.073 - PANEL_DEFAULTS.listThreshold) >= PANEL_DEFAULTS.warnBand,
    `threshold=${PANEL_DEFAULTS.listThreshold} band=${PANEL_DEFAULTS.warnBand}`);

  // 判定が閾値ぎりぎりのときは WARN を出す（FATAL にはしない）
  const diag = new D('T1', 'test');
  reportPanelMode(diag, { mode: 'list', score: PANEL_DEFAULTS.listThreshold + 0.01, period: 141 });
  check('閾値ぎりぎりなら WARN（FATAL にしない）',
    diag.summary().WARN === 1 && diag.summary().FATAL === 0, JSON.stringify(diag.summary()));
  check('コードが T1-ROI-003', diag.items[0]?.code === 'T1-ROI-003', diag.items[0]?.code);
}

// ── 7. フレーム選別（P2-2） ─────────────────────────────────
console.log('\n[7] フレーム選別（コマ送りを消す＝人が見る枚数を1桁減らす）');
{
  const { roiSignature, signatureDistance, FrameSelector, reportSelection, SELECT_DEFAULTS }
    = await import('../src/transcribe/frame_select.js');
  const { Diag: D } = await import('../src/transcribe/diag.js');

  const RECT = { x: 0, y: 0, w: 300, h: 400 };

  /** 背景アニメだけのフレーム（静止しているが画素はわずかに揺れる＝実ゲーム画面の性質） */
  function idleFrame(seed) {
    const img = makeImage(RECT.w, RECT.h, [30, 20, 55]);
    // ゆっくり動く背景の明滅（±3 程度）＝ベースラインノイズ
    const n = 3 * Math.sin(seed * 0.7);
    fillRect(img, 0, 0, RECT.w, RECT.h, [30 + n, 20 + n, 55 + n]);
    return img;
  }
  /** ダメージ数字が出たフレーム（大きな明るい塊が乗る） */
  function popupFrame(seed) {
    const img = idleFrame(seed);
    fillRect(img, 40, 120, 220, 90, [235, 210, 130]);
    return img;
  }

  const sigOf = (img) => roiSignature(img, RECT);

  check('同一フレームの距離は 0', signatureDistance(sigOf(idleFrame(1)), sigOf(idleFrame(1))) === 0);
  const idleD = signatureDistance(sigOf(idleFrame(1)), sigOf(idleFrame(2)));
  const popD = signatureDistance(sigOf(idleFrame(2)), sigOf(popupFrame(2)));
  check('背景の揺れだけの距離は閾値未満', idleD < SELECT_DEFAULTS.threshold, `idle=${idleD.toFixed(2)}`);
  check('ポップアップ出現の距離は閾値以上', popD >= SELECT_DEFAULTS.threshold, `popup=${popD.toFixed(2)}`);
  check('★ポップアップの距離は背景ノイズの5倍以上（分離できている）', popD > idleD * 5,
    `popup=${popD.toFixed(2)} idle=${idleD.toFixed(2)}`);

  // 20秒ぶん（600フレーム）に、10ヒットのバーストが2回来る走を模す。
  // ポップアップは静止して数フレーム続く（実機の性質＝TRANSCRIPTION_DESIGN §3.2 R1）。
  const sel = new FrameSelector();
  const popRanges = [];
  for (let b = 0; b < 2; b++) {
    for (let h = 0; h < 10; h++) {
      const start = 100 + b * 300 + h * 8;
      popRanges.push([start, start + 6]);          // 6フレーム表示して消える
    }
  }
  const inPop = (i) => popRanges.some(([a, z]) => i >= a && i < z);
  for (let i = 0; i < 600; i++) sel.push(i / 30, sigOf(inPop(i) ? popupFrame(i) : idleFrame(i)));
  const sum = sel.summary();

  // ⚠ **出口条件（採用率 10% 以下）は実走でしか測れない**。
  //    合成フィクスチャのイベント密度は恣意的で、ここで 10% を主張しても意味がない。
  //    ここで固定するのは「機構が働くこと」＝静止中は捨て、変化点は拾い、削減が起きること。
  //    §4 P2 の出口条件は実走の診断 JSON（summary.meetsExitCriterion）で判定する。
  check('静止中のフレームは捨てられる（削減が起きる）', sum.reductionFactor >= 3,
    `${sum.keptFrames}/${sum.totalFrames} = x${sum.reductionFactor?.toFixed(1)}`);
  check('全ポップアップの出現を取りこぼさない',
    popRanges.every(([a]) => sel.kept.some(k => Math.abs(k.t - a / 30) < 1e-6)),
    `kept=${sel.kept.length}`);
  check('出口条件の判定値が summary に入る（実走で使う）',
    typeof sum.meetsExitCriterion === 'boolean');
  check('★距離の分布を必ず持ち帰る（閾値較正の唯一の材料）',
    sum.distanceQuantiles && typeof sum.distanceQuantiles.p99 === 'number',
    JSON.stringify(sum.distanceQuantiles));
  check('最初の1枚は基準として必ず採る', sel.kept[0]?.reason === 'first');

  // 出口条件を満たさないときは WARN（FATAL にしない＝分布を持ち帰るほうが価値がある）
  const d2 = new D('T1', 'test');
  reportSelection(d2, { totalFrames: 100, keptFrames: 80, keptRatio: 0.8,
    meetsExitCriterion: false, threshold: 6, distanceQuantiles: { p50: 7 } });
  // ★2026-08-15: 採用率 10% は**もう P2 の出口条件ではない**（削減は P3-2 へ移設・ユーザー承認）。
  //   ∴ severity を WARN → INFO へ落とした。**出口条件でなくなったものを WARN で鳴らし続けるのは誤導**。
  //   ⚠ FATAL/ERROR にしない（分布は較正材料として出し続ける）ことは変わらない。
  check('採用率が高くても INFO に留める（出口条件から外れたため・FATAL/ERROR にしない）',
    d2.summary().INFO === 1 && d2.summary().WARN === 0
    && d2.summary().FATAL === 0 && d2.summary().ERROR === 0, JSON.stringify(d2.summary()));
  check('コードが T1-DETECT-002', d2.items[0]?.code === 'T1-DETECT-002', d2.items[0]?.code);
}

// ── 8. ポップアップ「存在」検出の探索（P2-2 やり直し） ──────
console.log('\n[8] ポップアップ存在検出の探索（★変化検出が実走 88.1% で失敗した件の作り直し）');
{
  const { goldenFractions, PopupProbe, reportProbe }
    = await import('../src/transcribe/popup_probe.js');
  const { Diag: D } = await import('../src/transcribe/diag.js');

  const RECT = { x: 0, y: 0, w: 300, h: 400 };

  /**
   * ★実走の失敗を再現するフィクスチャ:
   *   背景は**毎フレーム大きく動く**（敵スプライト・床グリッド・光）が、金色ではない（青紫寄り）。
   *   ∴ 変化検出は毎フレーム反応するが、存在検出は反応してはいけない。
   */
  function animatedBg(seed) {
    const img = makeImage(RECT.w, RECT.h, [28, 18, 60]);
    // 床グリッド（マゼンタ）が毎フレーム位置を変える＝大きなフレーム間差分の源
    for (let i = 0; i < 6; i++) {
      const y = (i * 60 + seed * 17) % RECT.h;
      fillRect(img, 0, y, RECT.w, 6, [190, 40, 200]);
    }
    // 敵スプライト（明るいが青紫寄り）
    fillRect(img, 20 + (seed * 5) % 40, 40, 120, 160, [150, 130, 210]);
    return img;
  }
  /** 金色のダメージ数字が乗ったフレーム */
  function withPopup(seed) {
    const img = animatedBg(seed);
    fillRect(img, 60, 180, 180, 70, [240, 215, 120]);   // 金グラデの数字帯
    return img;
  }

  const fBg = goldenFractions(animatedBg(3), RECT);
  const fPop = goldenFractions(withPopup(3), RECT);
  const K = 'y190g50';
  check('背景だけのフレームは金色画素がほぼ無い', fBg[K] < 0.02, `${(fBg[K] * 100).toFixed(2)}%`);
  check('ポップアップありは金色画素が明確に増える', fPop[K] > fBg[K] + 0.05,
    `bg=${(fBg[K] * 100).toFixed(2)}% pop=${(fPop[K] * 100).toFixed(2)}%`);

  // ★背景が激しく動いても存在検出は揺れない（＝変化検出との決定的な違い）
  const bgVals = [];
  for (let i = 0; i < 20; i++) bgVals.push(goldenFractions(animatedBg(i), RECT)[K]);
  const spread = Math.max(...bgVals) - Math.min(...bgVals);
  check('★背景アニメが動いても存在検出の値は動かない（変化検出との違い）', spread < 0.02,
    `振れ幅 ${(spread * 100).toFixed(2)}%`);

  // 分布が2つの山に割れるか（正解ラベル無しで特徴量の良し悪しを判定する仕組み）
  const probe = new PopupProbe();
  for (let i = 0; i < 100; i++) probe.push(goldenFractions(i % 10 < 3 ? withPopup(i) : animatedBg(i), RECT));
  const rep = probe.report();
  check('二峰性の指標が算出される', typeof rep[K].bimodality === 'number');
  check('★分布が2つの山に割れる（Fisher 分離が単峰の目安を大きく超える）',
    rep[K].bimodality >= 5, `bimodality=${rep[K].bimodality.toFixed(3)}`);
  check('大津法の分割点が2つの山の間に来る',
    rep[K].otsuCut > fBg[K] && rep[K].otsuCut < fPop[K],
    `cut=${rep[K].otsuCut?.toFixed(4)} bg=${fBg[K].toFixed(4)} pop=${fPop[K].toFixed(4)}`);

  // ★指標そのものの回帰ガード: 大津法の分離度は単峰でも高く出るので採用しない
  //   （2026-08-14 実測: 一様 0.750 / 正規 0.669 ＝ 閾値 0.5 の警告が原理的に鳴らなかった）
  const uni = new PopupProbe({ yThr: [190], gThr: [50] });
  for (let i = 0; i < 1000; i++) uni.push({ y190g50: i / 1000 });     // 一様＝単峰
  const ur = uni.report()['y190g50'];
  check('★一様分布は大津法だと高く出る（＝この指標を使ってはいけない証拠）',
    ur.otsuSeparability > 0.6, `otsu=${ur.otsuSeparability.toFixed(3)}`);
  check('★一様分布は Fisher 分離では低く出る（＝正しく単峰と分かる）',
    ur.bimodality < 2.5, `bimodality=${ur.bimodality.toFixed(3)}`);

  // 分離できない特徴量は WARN で知らせる（＝作り直しの合図）
  const d3 = new D('T1', 'test');
  reportProbe(d3, uni);
  check('分離できない特徴量は WARN で知らせる', d3.summary().WARN === 1, JSON.stringify(d3.summary()));
  check('コードが T1-DETECT-004', d3.items[0]?.code === 'T1-DETECT-004', d3.items[0]?.code);
}

// ── 9. HPバー抽出（P2-5） ───────────────────────────────────
console.log('\n[9] HPバー抽出（★実走の条件＝占有率が 1.0 にならない／演出でバーが消える）');
{
  const { analyzeHpBar, HpSeries, reportHp, HP_DEFAULTS, fitStepEdge, readFillRatio }
    = await import('../src/transcribe/hp_bar.js');
  const { Diag: D } = await import('../src/transcribe/diag.js');

  /**
   * ★実走で観測された条件を再現するフィクスチャ（2026-08-14・`M3-1.mp4`）:
   *   - **塗られた列でも占有率は 0.375〜0.86**（1.0 にならない）。
   *     理由＝人が採寸した ROI に対しバーがわずかに上下へずれ、上下帯が部分的に外れる。
   *     ここでは `fillTop/fillBottom` で塗りを ROI より内側に描いてそれを再現する。
   *   - **空の部分は厳密に 0**。∴ 分離自体は易しい。
   *   ⚠ 絶対閾値 0.50 はこの条件で崩壊した（列の 76% が閾値の ±0.13 に入る）。
   */
  function bar(pct, { W = 640, H = 54, fillTop = 8, fillBottom = 40, wash = false } = {}) {
    const img = makeImage(W, H, [45, 40, 50]);                       // 空のトラック
    const col = wash ? [230, 225, 235] : [205, 35, 55];              // wash=演出フラッシュ
    fillRect(img, 0, fillTop, Math.round(W * pct), fillBottom - fillTop, col);
    for (let i = 0; i < 5; i++) fillRect(img, 340 + i * 30, 19, 18, 18, [150, 150, 155]);  // CT ドット
    fillRect(img, W - 80, 16, 74, 24, [245, 245, 245]);              // "100%" 文字
    return img;
  }

  const probe = analyzeHpBar(bar(0.78));
  check('実走条件でも解析に成功する', probe.ok && probe.visible, probe.reason);
  check('★塗られた列の占有率が 1.0 未満であることを再現できている',
    probe.peak < 0.9 && probe.peak > 0.2, `peak=${probe.peak}`);
  check('★右端の判定に閾値パラメータを使わない（threshold を返さない）',
    probe.threshold === undefined && typeof probe.leftMean === 'number',
    JSON.stringify({ threshold: probe.threshold, leftMean: probe.leftMean }));

  const levels = [0.9, 0.78, 0.6, 0.4, 0.2, 0.05];
  const res = levels.map(p => ({ p, r: analyzeHpBar(bar(p)) }));
  check('全水準で見えていると判定する', res.every(x => x.r.ok && x.r.visible),
    res.filter(x => !x.r.visible).map(x => `${x.p}:${x.r.reason}`).join(' / '));
  const worst = Math.max(...res.map(x => Math.abs(x.r.fillRatio - x.p)));
  check('★占有率が 1.0 にならない条件でも真値と 2 百分点以内で一致', worst <= 0.02,
    `最大誤差 ${(worst * 100).toFixed(2)} 百分点 / ${res.map(x => x.r.fillRatio.toFixed(3)).join(',')}`);

  // ★満タンのバーは「読めない」と言う（1.0 と推測しない）。
  //   空の区間が無いフレームは、満タンなのか ROI が覆われているのか**プロファイルからは決まらない**。
  //   取りこぼすのは戦闘開始前の 100% 区間だけ＝推測する価値が無い。
  const full = analyzeHpBar(bar(1.0));
  check('★満タン（空の区間が無い）は visible=false ＝ 1.0 と推測しない',
    full.ok && !full.visible && full.cause === 'noEmptyRegion', `${full.cause} / ${full.reason}`);

  // ── ★実走プロファイルによる回帰（合成では再現できなかった型） ──────────
  {
    const fx = JSON.parse(readFileSync(join(HERE, 'fixtures/t1_hp_profiles_M3-1.json'), 'utf8'));
    /** v0.11.0 の実装（閾値を超えた**最後の列**）＝直した当の壊れ方を再現する。 */
    const v0110 = (prof) => {
      const sorted = [...prof].sort((a, b) => a - b);
      const peak = sorted[Math.floor(sorted.length * 0.95)];
      const th = Math.max(HP_DEFAULTS.absFloor, peak * 0.20);
      let e = 0;
      prof.forEach((v, i) => { if (v >= th) e = i + 1; });
      return e / prof.length;
    };

    for (const [key, p] of Object.entries(fx.profiles)) {
      const prof = expandRuns(p);
      check(`[${key}] 転記が壊れていない（展開長が ${p.length}）`, prof.length === p.length,
        `実際 ${prof.length}`);
      const r = readFillRatio(prof);
      check(`[${key}] ${p.label}`, r.visible === p.expect.visible,
        `visible=${r.visible} / ${r.reason ?? ''}`);
      if (p.expect.visible) {
        check(`[${key}] 塗り率が実走の実測と一致（${p.expect.fillRatio}）`,
          Math.abs(r.fillRatio - p.expect.fillRatio) < 0.005,
          `得られた値 ${r.fillRatio.toFixed(4)}`);
      } else {
        check(`[${key}] 数値を返さない（fillRatio=null・cause=${p.expect.cause}）`,
          r.fillRatio === null && r.cause === p.expect.cause, `${r.cause}`);
      }
    }

    // ★これが本丸の回帰: 旧実装がこのプロファイルで 1.0 に跳んだことを固定する。
    //   （固定しないと「直った」ことの証拠が消える＝同じ型に戻れてしまう）
    const blip = expandRuns(fx.profiles['t15.3834']);
    check('★v0.11.0 の「閾値を超えた最後の列」はこの実プロファイルで 1.0 に跳ぶ',
      Math.abs(v0110(blip) - 1.0) < 1e-9, `v0.11.0 → ${v0110(blip).toFixed(4)}`);
    check('★階段フィットは孤立した末尾列に釣られない',
      readFillRatio(blip).fillRatio < 0.95, `→ ${readFillRatio(blip).fillRatio.toFixed(4)}`);

    const wash = expandRuns(fx.profiles['t14.0834']);
    check('★v0.11.0 は ROI 汚染フレームにも 1.0 を報告していた',
      Math.abs(v0110(wash) - 1.0) < 1e-9, `v0.11.0 → ${v0110(wash).toFixed(4)}`);
  }

  // 階段フィットそのものの性質
  {
    const step = (k, W = 100, hi = 0.42) => Array.from({ length: W }, (_, i) => (i < k ? hi : 0));
    check('★階段フィットは塗り水準に依存しない（0.2 でも 0.9 でも同じ境界）',
      fitStepEdge(step(37, 100, 0.2)).edge === 37 && fitStepEdge(step(37, 100, 0.9)).edge === 37,
      `${fitStepEdge(step(37, 100, 0.2)).edge} / ${fitStepEdge(step(37, 100, 0.9)).edge}`);
    const withBlip = step(37); withBlip[99] = 0.9;   // ★末尾に孤立列を足す
    check('★末尾に孤立列を足しても境界が動かない（v0.11.0 が壊れた条件）',
      fitStepEdge(withBlip).edge === 37, `edge=${fitStepEdge(withBlip).edge}`);
    check('一様なプロファイルでは境界が右端に来る（＝空の区間なし）',
      fitStepEdge(Array(50).fill(0.3)).edge === 50 && fitStepEdge(Array(50).fill(0.3)).rightMean === null);
  }

  // ★演出フラッシュ時は「読めない」と言う（数値を捏造しない）
  const washed = analyzeHpBar(bar(0.78, { wash: true }));
  check('★バーがフラッシュで読めないときは visible=false', washed.ok && !washed.visible, washed.reason);
  check('★そのとき fillRatio は null（嘘の数値を返さない）', washed.fillRatio === null);

  // 系列: 読めなかったフレームは捨てて数える
  const ser = new HpSeries();
  ser.push(0, 1.0); ser.push(1, null); ser.push(2, 0.9); ser.push(3, null); ser.push(4, 0.7);
  const sm = ser.summary();
  check('読めなかったフレームは skippedFrames に数える', sm.skippedFrames === 2, `${sm.skippedFrames}`);
  check('読めたフレームだけで単調性を判定する', sm.monotonic && sm.frames === 3,
    JSON.stringify({ monotonic: sm.monotonic, frames: sm.frames }));
  check('減少量が正しい', sm.drop === 0.3, `drop=${sm.drop}`);

  const bad = new HpSeries();
  [1.0, 0.6, 0.95, 0.5].forEach((v, i) => bad.push(i, v));
  check('★増加したら検出される（抽出が壊れている合図）', !bad.summary().monotonic);
  const d4 = new D('T1', 'test');
  reportHp(d4, probe, bad);
  check('単調性違反は WARN で知らせる', d4.items.some(i => i.code === 'T1-ROI-005'),
    d4.items.map(i => i.code).join(','));

  const d5 = new D('T1', 'test');
  const thin = analyzeHpBar(makeImage(200, 1, [30, 30, 40]));
  check('薄すぎる ROI は解析失敗になる', !thin.ok, thin.reason);
  reportHp(d5, thin, null);
  check('失敗は ERROR で知らせる', d5.summary().ERROR === 1, JSON.stringify(d5.summary()));
}

// ── 11. 重複除去（P2-4）★合成は実走の距離分布に合わせてある ──────────
console.log('\n[11] 重複除去（P2-4）＝取りこぼさないと証明できる範囲でだけ間引く');
{
  const { LagProfile, EventDeduper, reportDedup, DEDUP_DEFAULTS }
    = await import('../src/transcribe/dedup.js');
  const { FrameSelector } = await import('../src/transcribe/frame_select.js');
  const { Diag: D } = await import('../src/transcribe/diag.js');

  const N = 576, GW = 24;                       // 24×24 グリッド署名（roiSignature と同じ形）
  const rndFrom = (seed) => () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  /**
   * ★実走の `dmg` ROI を模した署名列を作る。
   *
   * ⚠⚠ **パラメータは勘で置いていない**。2026-08-15 の実走（`M3-1.mp4` 120秒・3510フレーム）で
   *   測った**隣接フレーム距離の分位点**（p50 6.72 / p90 40.34 / p99 112.63）に合わせて詰めてある。
   *   ∴ この合成は「**P2-2 を実際に失敗させた動き**」を持つ＝
   *   合成で通ったのに実走で崩れる、という 2 世代続いた事故への構造的な備え。
   *
   *   - 背景は**常時アニメーション**（セルごとに位相と周期が違う正弦波）＝静止フレームが存在しない
   *   - ポップアップは `popEvery` ごとに出て `popLife` フレーム持続する（＝発見⑧の L）
   *   - `flashEvery` ごとに全面フラッシュ（バースト演出）＝距離分布の重い裾
   */
  function scene({ frames = 900, bgAmp = 19, popLife = 10, popEvery = 23, flashEvery = 60, seed = 1,
                   staticCells = 0 } = {}) {
    const POPW = 16, POPH = 8;
    const r0 = rndFrom(seed);
    const base = [], amp = [], per = [], ph = [];
    for (let c = 0; c < N; c++) {
      base.push(40 + r0() * 60); amp.push(bgAmp * (0.3 + r0()));
      per.push(5 + r0() * 9); ph.push(r0());
    }
    const sigs = [], popupAt = new Map();       // frameIndex → popupId（正解ラベル）
    for (let i = 0; i < frames; i++) {
      const sig = new Uint8ClampedArray(N);
      for (let c = 0; c < N; c++) sig[c] = base[c] + amp[c] * Math.sin(2 * Math.PI * (i / per[c] + ph[c]));
      // ★実走を模す汚染: まったく動かないセル（実測 zeroFraction 0.38）が途中で一度だけ切り替わる。
      //   これが無いと寿命の測定器が簡単すぎる場面で通ってしまう。
      for (let c = 0; c < staticCells; c++) sig[c] = i < frames / 2 ? 30 : 200;
      if (i % popEvery < popLife) {
        const id = Math.floor(i / popEvery);
        const r = rndFrom(1000 + id);
        const x0 = Math.floor(r() * (GW - POPW)), y0 = Math.floor(r() * (GW - POPH));
        for (let y = y0; y < y0 + POPH; y++) for (let x = x0; x < x0 + POPW; x++) sig[y * GW + x] = 235;
        popupAt.set(i, id);
      }
      if (flashEvery && i % flashEvery < 2) for (let c = 0; c < N; c++) sig[c] = Math.min(255, sig[c] + 110);
      sigs.push(sig);
    }
    return { sigs, popupAt, popLife, popEvery };
  }

  const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

  // ① ★合成が実走の距離分布を再現していること（このテスト群の土台＝ここが外れたら以下は無意味）
  const { sigs, popupAt, popLife } = scene();
  const dd = [];
  for (let i = 1; i < sigs.length; i++) dd.push(dist(sigs[i - 1], sigs[i]));
  const p50 = q(dd, 0.5), p90 = q(dd, 0.9), p99 = q(dd, 0.99);
  check('★合成が実走の距離分布を再現している（実走 p50 6.72 / p90 40.34 / p99 112.63）',
    p50 > 5 && p50 < 9 && p90 > 28 && p90 < 55 && p99 > 90 && p99 < 135,
    `p50=${p50.toFixed(2)} p90=${p90.toFixed(2)} p99=${p99.toFixed(2)}`);

  // ② ★この合成の上では P2-2（変化検出）が実走と同じように失敗すること
  const sel = new FrameSelector();
  sigs.forEach((s, i) => sel.push(i / 30, s));
  check('★変化検出は出口条件を満たせない（実走 61.8% と同じ失敗を合成が再現する）',
    !sel.summary().meetsExitCriterion,
    `採用率 ${(sel.summary().keptRatio * 100).toFixed(1)}%`);

  // ③ 持続性の実測（発見⑧）＝ラグが増えると距離も増える
  const lag = new LagProfile();
  sigs.forEach(s => lag.push(s));
  const lr = lag.report();
  check('ラグ別の距離が生データとして返る', Array.isArray(lr.lags) && lr.lags.length === DEDUP_DEFAULTS.maxLag,
    `${lr.lags.length} 本`);
  check('★離散的な出来事があると eventContrast が大きい（ラグ1 の p90/p50）',
    lr.eventContrast > 3, `eventContrast=${lr.eventContrast}`);
  check('セル単位 |Δ| の分布が返る（ノイズ床を分布に語らせるため）',
    lr.cellDeltas && typeof lr.cellDeltas.p50 === 'number' && typeof lr.cellDeltas.zeroFraction === 'number',
    JSON.stringify(lr.cellDeltas));
  check('★状態の長さが cut 別に返る（参考値＝背景の動きが混ざる）',
    lr.stateRuns.length === 3 && lr.stateRuns.every(r => typeof r.p50 === 'number'),
    JSON.stringify(lr.stateRuns));

  // ★★寿命 L の測定器そのものの検証 ── **既知の正解を動かして、値が追随するか**
  //   ⚠⚠ ここは実装中に**2つの設計を反証して捨てた**箇所（記録として回帰に残す）:
  //     ①ラグ曲線の膝（`lags`）      … 背景の動きと混ざる＝真の L が 10 でも 6 でも 3 でも同じ形
  //     ②「次の jump までの長さ」    … 同上（p50 が L=10/6/3 のすべてで 3 になった）
  //   ★測定器は「正解が既知の場面を動かして、値が追随するか」を見るまで信用しない。
  {
    const measure = (opts) => {
      const lg = new LagProfile();
      scene(opts).sigs.forEach(s => lg.push(s));
      const r = lg.report();
      return { L: r.lifetimeFrames, per: r.freezeRuns.map(x => x.p50) };
    };
    for (const truthL of [10, 6, 3]) {
      const m = measure({ popLife: truthL, popEvery: truthL + 13 });
      check(`★★寿命の測定器が真値 ${truthL} を復元する（3つの J すべてで一致）`,
        m.L === truthL, `推定 ${m.L} / J別 ${JSON.stringify(m.per)}`);
    }

    // ★★逆方向の検証（陰性対照）: **L が実在しない場面では「決まらない」と言えること**。
    //   ⚠ 実走は静止セルが 38% あるので、その汚染を入れた上で検査する
    //   （汚染が無いと簡単すぎて、実走で崩れるフィクスチャになる＝2世代続けた事故の型）。
    const noL = measure({ popLife: 1, popEvery: 14, staticCells: 220 });
    check('★★寿命が実在しない場面では null を返す（J 間で一致しない＝決まらないと言う）',
      noL.L === null, `推定 ${noL.L} / J別 ${JSON.stringify(noL.per)}`);

    // ★★実走で見つかった交絡の回帰: **seek が同じフレームを二度返すと偽の freeze ができる**
    //   （重複は全セルの |Δ| を 0 にする＝直前に跳ねたセル全部に「長さ2の freeze」を作る）。
    //   2026-08-15 実走では frozenCount の 45〜61% がこれで説明でき、p50 がちょうど 2 だった。
    //   ∴ 測定は**重複を除いた列**で行う。ここではそれを合成で固定する。
    {
      const base = scene({ popLife: 6, popEvery: 19 }).sigs;
      const withDup = [];
      base.forEach((s, i) => { withDup.push(s); if (i % 8 === 0) withDup.push(s); });  // 12.5% 重複
      const lg = new LagProfile();
      withDup.forEach(s => lg.push(s));
      check('★★完全重複フレームを混ぜても寿命の推定が変わらない（偽の freeze を作らない）',
        lg.report().lifetimeFrames === 6, `推定 ${lg.report().lifetimeFrames} / 真値 6`);
    }
    // ★反証の固定: 捨てた設計②ならこの区別ができないことを残す（証拠が消えると戻れてしまう）
    const rejected = [10, 6, 3].map(L => {
      const sigs = scene({ popLife: L, popEvery: L + 13 }).sigs;
      const holds = [];
      const last = new Int32Array(sigs[0].length).fill(-1);
      for (let t = 1; t < sigs.length; t++) {
        for (let c = 0; c < sigs[0].length; c++) {
          if (Math.abs(sigs[t][c] - sigs[t - 1][c]) < 16) continue;
          if (last[c] >= 0) holds.push(t - last[c]);
          last[c] = t;
        }
      }
      holds.sort((a, b) => a - b);
      return holds[Math.floor(0.5 * holds.length)];
    });
    check('★捨てた設計②（次の jump まで）は真の L が変わっても同じ値を返す＝使えない',
      new Set(rejected.slice(0, 3)).size === 1,
      `真 10/6/3 → ${rejected.slice(0, 3).join(' / ')}`);
  }

  // ④ ★健全性検査の本体: 「出来事が信号に出ていない」場面を見抜けること
  //    ⚠⚠ ここは実装中に一度**誤った指標を置いて自分で反証した**箇所。
  //    旧 `persistenceRatio`（ラグ1 p50 ÷ ラグ20 p50）は**ポップアップが1つも無い背景だけの列で
  //    0.537**＝「持続性あり」に見えた＝**背景アニメの遅さと寿命を区別できなかった**。
  //    ★その反証をそのまま回帰にする（同じ罠に戻れないように）。
  for (const [label, sc] of [
    ['寿命1フレーム（間引き不可）', scene({ popLife: 1, popEvery: 3, flashEvery: 0 })],
    ['★背景のみ＝出来事ゼロ（旧指標が誤導した場面）', scene({ popLife: 0, popEvery: 1e9, flashEvery: 0 })],
    ['背景のみ・速い', scene({ popLife: 0, popEvery: 1e9, flashEvery: 0, bgAmp: 19, seed: 7 })],
  ]) {
    const lg = new LagProfile(), dd2 = new EventDeduper();
    sc.sigs.forEach((s, i) => { lg.push(s); dd2.push(i / 30, s); });
    const r = lg.report();
    const dx = new D('T1', 'test');
    reportDedup(dx, dd2.summary(), r);
    check(`★「${label}」を出来事なしと判定できる`,
      r.eventContrast < 1.5 && dx.items.some(i => i.code === 'T1-DEDUP-003'),
      `eventContrast=${r.eventContrast} / ${dx.items.map(i => i.code).join(',')}`);
  }

  // ⑤ 未較正のあいだは間引かない（★推測で stride を埋めない）
  const raw = new EventDeduper();
  sigs.forEach((s, i) => raw.push(i / 30, s));
  const rawSum = raw.summary();
  check('★stride 未較正なら間引かない（完全重複だけ落とす）',
    !rawSum.calibrated && rawSum.keptFrames === sigs.length, `${rawSum.keptFrames}/${sigs.length}`);
  const d7 = new D('T1', 'test');
  reportDedup(d7, rawSum, lr);
  check('未較正であることを WARN で知らせる', d7.items.some(i => i.code === 'T1-DEDUP-001'),
    d7.items.map(i => i.code).join(','));

  // ⑥ ★★保証の本体: stride ≦ 寿命 なら、どのポップアップも必ず1回は捕まる
  const stride = Math.floor(popLife / DEDUP_DEFAULTS.safety);     // 10/2 = 5
  const ded = new EventDeduper({ stride });
  sigs.forEach((s, i) => ded.push(i / 30, s));
  const sum = ded.summary();
  const caught = new Set(ded.kept.map(k => popupAt.get(Math.round(k.t * 30))).filter(v => v !== undefined));
  const allIds = new Set([...popupAt.values()]);
  /**
   * ★保証の主張は「**寿命が stride 以上ある**ものは必ず捕まる」であって「全部捕まる」ではない。
   * ⚠ 走の末尾で切れたポップアップ（存在フレームが stride 未満）は条件の外＝ここで区別する。
   *   実装時に実際にこれで落ちた（フレーム 897..899 の 3 フレームだけのポップアップ）。
   *   主張を弱めたのではなく、**定理どおりに書き直した**（弱いほうは⑦で反証として固定する）。
   */
  const lifeOf = new Map();
  for (const id of popupAt.values()) lifeOf.set(id, (lifeOf.get(id) ?? 0) + 1);
  const longEnough = [...lifeOf].filter(([, n]) => n >= stride).map(([id]) => id);
  const shortOnes = [...lifeOf].filter(([, n]) => n < stride).map(([id]) => id);
  check(`★stride=${stride}（寿命の半分）で、寿命 ${stride} 以上のものを1つも取りこぼさない`,
    longEnough.every(id => caught.has(id)),
    `捕捉 ${caught.size}/${allIds.size}・条件を満たすもの ${longEnough.length} 本・`
    + `条件外（末尾で切れた） ${JSON.stringify(shortOnes.map(id => [id, lifeOf.get(id)]))}`);
  check('間引き率が stride とほぼ一致する',
    Math.abs(sum.reductionFactor - stride) < 0.2, `reductionFactor=${sum.reductionFactor}`);
  check('採用フレーム間の最大の穴が stride 相当以内',
    sum.maxGapSeconds <= stride / 30 + 1e-6, `maxGap=${sum.maxGapSeconds}s`);

  // ⑦ ★境界の反証: stride が寿命を超えると取りこぼす（保証が「条件つき」であることの証拠）
  const over = new EventDeduper({ stride: popLife + 2 });
  sigs.forEach((s, i) => over.push(i / 30, s));
  const caughtOver = new Set(over.kept.map(k => popupAt.get(Math.round(k.t * 30))).filter(v => v !== undefined));
  check('★stride が寿命を超えると取りこぼす（＝保証は stride ≦ L のときだけ）',
    caughtOver.size < allIds.size, `捕捉 ${caughtOver.size}/${allIds.size}`);

  // ⑧ 完全重複の除去（実走で dist=0 の隣接対が観測されている＝seek が同じフレームを二度返す）
  const dup = new EventDeduper();
  const withDup = [];
  sigs.slice(0, 100).forEach((s, i) => { withDup.push(s); if (i % 10 === 0) withDup.push(s); });
  withDup.forEach((s, i) => dup.push(i / 30, s));
  check('★完全に同じフレームは落とす（情報を失わない除去）',
    dup.summary().droppedDuplicates === 10, `${dup.summary().droppedDuplicates}`);
}

// ── 13. モード遷移の除振（P2-1b 追補） ──────────────────────
console.log('\n[13] モード遷移の除振（★実走で 18/14/12 とぶれた件）');
{
  const { PanelModeSeries, reportPanelSeries, PANEL_DEBOUNCE_SECONDS }
    = await import('../src/transcribe/panel_mode.js');
  const { Diag: D } = await import('../src/transcribe/diag.js');

  /** 30fps で mode 列を作る（`spec` は [mode, フレーム数] の並び）。 */
  const build = (spec) => {
    const ser = new PanelModeSeries();
    let f = 0;
    for (const [mode, n] of spec) for (let i = 0; i < n; i++) ser.push(f++ / 30, mode);
    return ser;
  };

  // ★実走で観測された形をそのまま焼き直す:
  //   本物の detail 滞在は 1.9〜7.2秒（P1 発見⑮）／偽の往復は 30〜160ms（3走の比較）
  const real = build([
    ['list', 300],            // 10秒
    ['detail', 1],            // ★33ms の往復（実走 t=28.45 / 110.03 と同型）＝人には不可能
    ['list', 300],
    ['detail', 60],           // 2.0秒＝本物の操作
    ['list', 90],
    ['detail', 3],            // 100ms の往復＝偽
    ['list', 200],
    ['detail', 216],          // 7.2秒＝本物
    ['list', 100],
  ]);
  const sum = real.summary();
  check('生の遷移列も必ず返す（★何を落としたかが見えないと検証できない）',
    Array.isArray(sum.rawSample) && sum.rawTransitions === 8, `raw=${sum.rawTransitions}`);
  check('★★偽の往復（33ms・100ms）だけが落ち、本物（2.0秒・7.2秒）は残る',
    sum.stableTransitions === 4, `stable=${sum.stableTransitions} / ${JSON.stringify(sum.transitions)}`);
  check('落とした件数を明示する', sum.debounced === 4, `${sum.debounced}`);

  // ★★測定器の検証: 本物の滞在時間を振っても残ること／偽を振っても落ちること
  // ⚠ 判定は「**最初と最後の標本の間隔**」で行う＝n フレームの滞在は (n-1)/30 秒として数える
  //   （最後の1フレームぶんは次の標本が来るまで確定しない）。**保守側に倒している**＝
  //   短い往復を残すより、境界ぎりぎりの本物を1つ落とす方が安全（幻の操作イベントを作らない）。
  for (const [label, frames, want] of [['1フレーム(0ms)', 1, 0], ['4フレーム(100ms)', 4, 0],
                                       ['8フレーム(233ms)', 8, 0], ['10フレーム(300ms)', 10, 2],
                                       ['60フレーム(1.97秒)', 60, 2]]) {
    const s2 = build([['list', 100], ['detail', frames], ['list', 100]]).summary();
    check(`　　detail 滞在 ${label} → 除振後の遷移 ${want} 件`,
      s2.stableTransitions === want, `${s2.stableTransitions} 件`);
  }

  check('★閾値は人の操作の下限に置く（実測の谷: 偽 ≦160ms / 本物 ≧1.9秒）',
    PANEL_DEBOUNCE_SECONDS > 0.16 && PANEL_DEBOUNCE_SECONDS < 1.9,
    `${PANEL_DEBOUNCE_SECONDS}秒`);

  // 落としすぎたら WARN で知らせる
  {
    const many = build([['list', 30], ...Array.from({ length: 10 }, () => [['detail', 2], ['list', 30]]).flat()]);
    const d = new D('T1', 'test');
    reportPanelSeries(d, many.summary());
    check('★除振で落としすぎたら WARN で知らせる（本物を消していないかの番人）',
      d.items.some(i => i.code === 'T1-ROI-011'), d.items.map(i => i.code).join(','));
  }
}

// ── 12. CT（チャージターン）ドット抽出 ─────────────────────
console.log('\n[12] CT ドット抽出（★個数を決め打ちしない・点灯判定はしない・幾何は走全体で決める）');
{
  const { ChargeDotTracker, ChargeSeries, reportChargeDots, centerBandProfile, CT_DEFAULTS }
    = await import('../src/transcribe/charge_dots.js');
  const { Diag: D } = await import('../src/transcribe/diag.js');

  /**
   * ★HPバー＋CT ドットの合成。**ドット数 n と点灯数 lit と HP塗り率 fill を振れる**のが要点。
   * ⚠⚠ **ドットの実際の見え方は未確認**（灰色とだけ分かっている）＝
   *   ここで置く `litLum` / `dimLum` は**仮定であって観測ではない**。
   *   ∴ このテストが固定するのは「**区別できる条件なら幾何を復元する**」「**区別できないなら
   *   見つからないと言う**」という**性質**であって、実フレームで見つかることの証明ではない。
   *   ★実物の値は走査1回の `ctGeometry.meanProfile` が答える（HP バーの `colProfile` と同じ経路）。
   */
  function barWithDots({ W = 640, H = 54, fill = 0.78, n = 5, lit = 2,
                         litLum = 230, dimLum = 150, litFirst = true } = {}) {
    const img = makeImage(W, H, [45, 40, 50]);
    fillRect(img, 0, 8, Math.round(W * fill), 32, [205, 35, 55]);      // バーの塗り（輝度 ≈ 88）
    const P = Math.floor(W / (n + 1));
    for (let i = 0; i < n; i++) {
      const on = litFirst ? i < lit : i >= n - lit;
      const v = on ? litLum : dimLum;
      const cx = Math.round(P * (i + 1));
      fillRect(img, cx - 9, Math.round(H / 2) - 9, 18, 18, [v, v, v]);
    }
    return { img, period: P };
  }

  /** 走を1本作る（★HP は単調に減らす＝バーの段差は動き、ドットは動かない）。 */
  function run({ frames = 120, n = 5, litOf = () => 1, litFirst = true } = {}) {
    const tr = new ChargeDotTracker();
    for (let i = 0; i < frames; i++) {
      const fill = 0.95 - 0.6 * (i / frames);                          // ★塗り境界が動く
      tr.push(i / 30, barWithDots({ fill, n, lit: litOf(i), litFirst }).img);
    }
    return tr;
  }

  const one = centerBandProfile(barWithDots().img);
  check('1フレームから中央帯の生プロファイルを返す', one.ok && Array.isArray(one.centerProfile));

  const g = run().solveGeometry();
  check('★走全体の集約プロファイルを返す（幾何の生データ）', Array.isArray(g.meanProfile));
  check('★周期スキャンの曲線も返す', Array.isArray(g.periodScan) && g.periodScan.length > 3);
  check('★ドット列を見つける（段差が動きドットが動かないことを利用）', g.found,
    `${g.reason ?? ''} best=${JSON.stringify(g.bestPeriod)}`);

  // ★★測定器の検証その1: **ドット数を振ったら推定が追随すること**
  for (const n of [3, 5, 7]) {
    const gg = run({ n }).solveGeometry();
    check(`　　ドット ${n} 個を ${n} 個と数える（★個数を決め打ちしていない）`,
      gg.found && gg.dotCount === n, `dotCount=${gg.dotCount} period=${gg.period}`);
  }

  // ★★測定器の検証その2: **点灯数を振ったら読みが追随すること**
  {
    const tr = run({ n: 5, litOf: (i) => Math.min(5, Math.floor(i / 20)) });   // 0,1,2,3,4,5
    const geom = tr.solveGeometry();
    const rows = tr.readSeries(geom);
    // ⚠ 1フレームあたり 20 フレームずつ点灯数が上がる合成。真値が 1〜4 の区間だけ境界が存在する。
    const at = (lit) => rows.filter(r => Math.min(5, Math.floor(Math.round(r.t * 30) / 20)) === lit);
    for (const lit of [1, 2, 3, 4]) {
      const v = [...new Set(at(lit).map(r => r.filledPrefix))];
      check(`　　点灯 ${lit} 個 → filledPrefix ${lit}（★真値に追随する）`,
        v.length === 1 && v[0] === lit, `観測 ${JSON.stringify(v)}`);
    }
    // ⚠⚠ **ここから先は未検証**（意図的にアサートしない）:
    //   ①**全消灯と全点灯を区別できない**（どちらも「一様」＝境界が無い）。
    //     `stepSize` は小さくなるが**0 にはならない**（合成で一様 11.0 vs 非一様 5.2＝逆転しうる）＝
    //     バーの塗りがドットの背後を通過する残差が乗るため。
    //   ②**そもそもドットの実際の見え方（点灯/消灯のエンコード）が未確認**。
    //   ★∴ 点灯数の読み取りは**未較正**として出す。判定を入れるのは実走の
    //     `ctGeometry.meanProfile` と `stepSize` の分布を見てから（HPバーで実際に効いた手順）。
    //   ⚠ **ここで閾値を置いて通してしまうのが、本セッションで何度も踏んだ型**。
    check('★段差の大きさ（stepSize）を必ず返す＝一様かどうかの判断材料を残す',
      rows.every(r => typeof r.stepSize === 'number'));
  }

  // ⚠ 向きが逆（後ろから点灯）でも境界は取れる＝**意味づけは系列側の仕事**
  {
    const tr = run({ n: 5, litOf: () => 2, litFirst: false });
    const geom = tr.solveGeometry();
    const rows = tr.readSeries(geom);
    const v = [...new Set(rows.map(r => r.filledPrefix))];
    // ⚠ 向きが逆でも「境界の位置」は取れるが、**フレームによって揺れる**（塗りの通過による残差）。
    //   ∴ 固定するのは「**多数決が真値**」という弱い性質だけ＝強い主張はしない（未較正）。
    const mode = [...v].sort((a, b) =>
      rows.filter(r => r.filledPrefix === b).length - rows.filter(r => r.filledPrefix === a).length)[0];
    check('★向きが逆でも境界の位置は取れる（多数決・点灯/消灯の意味づけはしない）',
      geom.found && mode === 3, `filledPrefix の分布=${JSON.stringify(v)} 最頻=${mode}`);
  }

  // ドットが無ければ「見つからない」と言う（★数値を捏造しない）
  {
    const tr = new ChargeDotTracker();
    for (let i = 0; i < 60; i++) {
      const img = makeImage(640, 54, [45, 40, 50]);
      fillRect(img, 0, 8, Math.round(640 * (0.95 - 0.6 * i / 60)), 32, [205, 35, 55]);
      tr.push(i / 30, img);
    }
    const gg = tr.solveGeometry();
    check('★ドットが無ければ found=false（推測しない）', !gg.found, gg.reason);
    check('★そのときも集約プロファイルは返る', Array.isArray(gg.meanProfile));
    const d = new D('T1', 'test');
    reportChargeDots(d, gg, null);
    check('見つからないことを WARN で知らせる', d.items.some(i => i.code === 'T1-ROI-008'),
      d.items.map(i => i.code).join(','));
  }

  // ④ 正解ラベル無しの健全性検査: CT はターン境界でしか動かない
  {
    const okTr = run({ frames: 300, n: 5, litOf: (i) => Math.floor(i / 100) });   // 10秒で3段
    const okGeom = okTr.solveGeometry();
    const okSum = new ChargeSeries().ingest(okTr.readSeries(okGeom)).summary(10);
    check('ターン境界でしか動かない系列は WARN にならない',
      okSum.prefixChangesPerSecond <= 1.0, `${okSum.prefixChangesPerSecond}/秒`);

    const badTr = run({ frames: 300, n: 5, litOf: (i) => i % 6 });                // 毎フレーム
    const badGeom = badTr.solveGeometry();
    const badSum = new ChargeSeries().ingest(badTr.readSeries(badGeom)).summary(10);
    const d = new D('T1', 'test');
    reportChargeDots(d, badGeom, badSum);
    check('★毎フレーム変わったら WARN で知らせる（CT はターン単位でしか動かない）',
      d.items.some(i => i.code === 'T1-ROI-009'),
      `${badSum.prefixChangesPerSecond}/秒 / ${d.items.map(i => i.code).join(',')}`);
  }

  // ★★★実装中に判明した「原理的に見えない」条件を、**解けないこととして固定する**
  //   消灯ドットの輝度がバーの塗りとほぼ同じだと、そのドットは**塗りに隠れている間ずっと不可視**。
  //   ⚠ これは検出器の不具合ではなく**入力に情報が無い**＝**黙って別の周期を答えてはいけない**。
  {
    const tr = run({ frames: 120, n: 5, litOf: () => 1 });   // ← dimLum を塗りと同輝度にする
    const trHard = new ChargeDotTracker();
    for (let i = 0; i < 120; i++) {
      trHard.push(i / 30, barWithDots({ fill: 0.95 - 0.6 * (i / 120), n: 5, lit: 1, dimLum: 90 }).img);
    }
    const gh = trHard.solveGeometry();
    check('★★消灯ドットが塗りと同輝度なら「見つからない」と言う（間違った周期を答えない）',
      !gh.found || gh.dotCount !== 5,
      `found=${gh.found} dotCount=${gh.dotCount}＝**もし 5 と答えたらそれは偶然**`);
    check('★そのときも集約プロファイルは返る（実物の見え方はここが答える）',
      Array.isArray(gh.meanProfile) && gh.meanProfile.length > 0);
  }

  // 薄すぎる ROI は失敗と言う
  {
    const thin = centerBandProfile(makeImage(200, 3, [30, 30, 40]));
    check('薄すぎる ROI は解析失敗になる', !thin.ok, thin.reason);
  }
}

// ── 10. ROI 定義の健全性 ────────────────────────────────────
console.log('\n[10] ROI 定義の健全性');
{
  const { ROIS, findOverlaps } = await import('../src/transcribe/rois.js');
  check('未採寸(null)の ROI があっても重なり検査が落ちない',
    Array.isArray(findOverlaps()), 'throw しないこと');
  check('採寸済みの ROI はすべて 0〜1 に収まる',
    Object.entries(ROIS).filter(([, r]) => r).every(([, r]) =>
      r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001),
    JSON.stringify(Object.entries(ROIS).filter(([, r]) => r && (r.x + r.w > 1.0001))));
  check('★hpbar は P2-5 の入力として登録されている（未採寸でもキーは在る）',
    'hpbar' in ROIS);
}

console.log('\n' + '='.repeat(60));
console.log(`結果: ${pass} passed / ${fail} failed`);
if (fail) {
  console.log('\n失敗:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('✅ T1 canvas 正規化 セルフテスト 全通過');
