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

// ── 14. digest（貼る用サマリ） ──────────────────────────────
console.log('\n[14] digest（★診断は畳まない・生データの本体だけ畳む）');
{
  const { digest } = await import('../src/transcribe/digest.js');
  const { Diag: D } = await import('../src/transcribe/diag.js');

  const d = new D('T1', '9.9.9');
  d.setInput({ file: 'x.mp4', resolution: '2288x1440', scannedSeconds: 119.9, wallClockSeconds: 600 });
  d.add('T1-ROI-008', 'WARN', { got: 'ドット列の周期性が弱い', hint: 'h' });
  d.add('T1-DEDUP-004', 'WARN', { got: 'J ごとに食い違う', hint: 'h' });
  d.add('T1-DETECT-002', 'INFO', { got: '採用率 61.8%', hint: 'h' });
  // ★実走と同じ形にする＝`downsample()` が出すのは**3桁小数**（"5" のような整数ではない）。
  //   ⚠ 整数だけの縮小フィクスチャで畳み率を測ると、**実際より小さく見積もる**（実走は約 1/25）。
  const big = Array.from({ length: 120 }, (_, i) =>
    (i === 40 || i === 44 ? 90 : +(4.5 + ((i * 37) % 100) / 100).toFixed(3)));
  const out = d.emit({
    sampling: { frames: 3506, sampledFps: 29.237 },
    dedup: { droppedDuplicates: 225 },
    hp: { firstRatio: 0.8891, lastRatio: 0.7703, violations: 5, frames: 3083,
          skipCauses: { flash: 107, noEmptyRegion: 316 },
          violationSample: [{ t: 12.33, from: 0.159, to: 0.889 }] },
    hpProfileSample: big,
    hpSkipSamples: [{ t: 16.68, cause: 'flash', peak: 0.09, redFraction: 0.02,
                      bands: [[3, 14], [40, 51]], colProfile: big }],
    ctGeometry: { found: false, decor: true, bestPeriod: { period: 21, score: 0.48 },
                  searchRange: { width: 687, min: 17, max: 171 },
                  // ★2026-08-18 追加の生データも実走と同じ形で持たせる（畳み率を正しく測るため）
                  rawProfile: big, sigmaProfile: big,
                  humps: { count: 5, centers: [17.4, 33.65, 49.98, 66.38, 82.59], spacing: 16.297, cv: 0.0045,
                           level: { min: 56, max: 133, mid: 94.5 } },
                  humpSeries: [{ center: 17.4, p05: 120, p25: 126, p50: 127, p75: 128, p95: 131, max: 210, brightFrac: 0.012 }],
                  humpColors: [{ center: 17.4, r: 180, g: 130, b: 60, chroma: 120 }],
                  chroma: big,
                  humpChroma: [{ center: 17.4, p05: 2, p25: 3, p50: 4, p75: 140, p95: 150,
                                 series: Array.from({ length: 40 }, (_, i) => (i < 20 ? 3 : 140)), bucketSeconds: 3 }],
                  chromaSamples: Array.from({ length: 4 }, (_, k) => ({ t: k * 20, profile: big })),
                  chromaSplit: 47.5,
                  chromaSplitLevels: { commonModeRemoved: true, split: 47.5, troughs: [12, 34, 56] },
                  litIntervals: [1, 2, 3, 4, 5].map((i) => ({
                    runs: [{ from: 51.2, to: 57.0, seconds: 5.8, frames: 170, mean: 118, max: 133, bg: -1.5, coincident: 1 }],
                    count: 1, totalSeconds: 5.8 })),
                  sampleProfiles: Array.from({ length: 8 }, (_, k) => ({ t: k * 15, profile: big })),
                  reason: 'r',
                  // ★実走にある大きな配列も持たせる（無いと完全JSON を過小に見積もる）
                  meanProfile: big,
                  periodScan: Array.from({ length: 40 }, (_, k) => ({ period: k + 4, score: 0.1234 })),
                  windowScan: Array.from({ length: 12 }, (_, k) => ({ from: k * 10, to: k * 10 + 40, period: 21, score: 0.4 })),
                  // ★実走と同じ形にする（8帯 × 120値のプロファイル）＝
                  //   ⚠ 縮小したフィクスチャで「畳めている」を測ると**畳み率を過小評価する**。
                  bandScan: Array.from({ length: 8 }, (_, b) => ({
                    band: [+(b / 8).toFixed(3), +((b + 1) / 8).toFixed(3)],
                    best: { period: 21, score: 0.48, from: 320, to: 480 },
                    peakRun: { count: 4, spacing: 17.2, cv: 0.03, from: 57, to: 109, meanHeight: 80.2, prominence: 210.4, baseline: 22.1 },
                    decor: b === 0, profile: big,
                  })) },
    ctSeries: { prefixChanges: 3, prefixChangesPerSecond: 0.025, prefixHistogram: { 2: 100 } },
    panelSeries: { rawTransitions: 12, stableTransitions: 8, debounced: 4,
                   transitions: [{ t: 10.58, to: 'detail' }, { t: 12.81, to: 'list' }] },
    lagProfile: { eventContrast: 6.19, lifetimeFrames: null,
                  freezeRuns: [{ label: 'cellP90', j: 48, p50: 3 }],
                  cellDeltas: { p50: 2, p90: 48, zeroFraction: 0.37 },
                  lags: Array.from({ length: 20 }, (_, k) => ({ k: k + 1, p10: 1, p50: 2, p90: 3 })) },
    modeGeometry: { roi: 'modebar', rawProfile: big, sigmaProfile: big, chroma: big,
                    fillSeries: { frames: 2100,
                      fill: { p05: 0.01, p25: 0.02, p50: 0.5, p75: 0.94, p95: 0.95 },
                      step: { p05: 1.2, p50: 60.4, p95: 105.1 },
                      series: Array.from({ length: 40 }, (_, i) => +(i / 40).toFixed(3)), bucketSeconds: 3 },
                    humps: { count: 1, centers: [40], spacing: null, cv: null, level: { min: 4, max: 90, mid: 47 } } },
    keptSample: Array.from({ length: 60 }, (_, i) => ({ t: i, dist: i, reason: 'change' })),
    hpViolationSamples: Array.from({ length: 4 }, (_, i) => ({
      t: 12.33 + i, from: 0.159, to: 0.889, peak: 0.42, leftMean: 0.4, rightMean: 0.01,
      redFraction: 0.31, colProfile: big })),
  }, true);

  const dg = digest(out);
  // ★★これが本テストの主眼: **診断は1件も落とさない**
  for (const code of ['T1-ROI-008', 'T1-DEDUP-004', 'T1-DETECT-002']) {
    check(`★診断 ${code} は digest に必ず残る（畳んでよいのは生データだけ）`, dg.includes(code));
  }
  check('severity も残る', dg.includes('[WARN]') && dg.includes('[INFO]'));
  check('版と入力が残る', dg.includes('T1 v9.9.9') && dg.includes('x.mp4'));

  // 判断に効く数値が残っていること
  for (const [label, needle] of [['HP first→last', '0.8891'], ['HP 違反数', '違反 5'],
                                 ['CT found', 'found=false'], ['CT decor', 'decor=true'],
                                 ['除振', '生 12 → 除振後 8'], ['寿命', 'lifetimeFrames=null'],
                                 ['出来事', 'eventContrast=6.19']]) {
    check(`　　${label} が残る`, dg.includes(needle), needle);
  }

  // ★プロファイルは「山の位置」に畳まれ、120個の生値は載らない
  const rawRun = [10, 11, 12, 13].map((i) => big[i]).join(',');
  check('★プロファイルは山の位置に畳まれる（120個の生値は載せない）',
    dg.includes('山:') && dg.includes('40:90') && !dg.includes(rawRun), rawRun);
  check('★keptSample（60件）は載せない', !dg.includes("reason: 'change'") && !dg.includes('"reason"'));

  // ★★サイズ: 完全な JSON より桁で小さいこと
  const fullLen = JSON.stringify(out).length;
  check('★★digest は完全な JSON より桁で小さい', dg.length < fullLen / 5,
    `digest ${dg.length}文字 / 完全 ${fullLen}文字（${(fullLen / dg.length).toFixed(1)}倍）`);
  // ★★**絶対量の番人**（2026-08-18f 新設）。
  //   ⚠ 比だけだと、**完全 JSON が大きくなれば digest も一緒に膨らめてしまう**。
  //     digest の存在理由は「**貼れること**」なので、絶対量そのものを縛る。
  //   ★実測の見積り（実走に近い桁で合成）＝**約 8,800 字**。上限はその 1.4 倍に置く。
  //   ⏳ CT が確定したら、昇格させた生配列（rawProfile / chroma / 標本）は畳み直してよい。
  check('★★digest は貼れる大きさに収まる（12,000字以下）', dg.length <= 12000, `${dg.length}文字`);
  check('★「完全版を見よ」という逃げ道が明記されている', dg.includes('完全な診断 JSON'));

  // ★★測定器の可視範囲を、測定結果と同じ画面に出す（2026-08-18）
  //   ⚠ v0.18.0 の digest は探索範囲を載せていなかったので、**上限 43px に潰れていたことが見えず**、
  //     「どの帯も低い＝CT は ROI の外」という誤った結論に進みかけた。
  check('★★探索できる周期の範囲が digest に出る（範囲外の「無し」は情報ではない）',
    dg.includes('探索できる周期') && dg.includes('171'), dg.split('\n').find(l => l.includes('探索できる周期')));
  // ★2026-08-18f: 帯ごとの探索は**要約1行**に畳んだ（採寸方式へ移行して役目を終えたため）。
  //   ⚠ **役目を終えた出力を出し続けると、判断に効く行が埋もれる**＝digest の趣旨に反する。
  //   生データは完全 JSON の `bandScan` に全部残る（捨ててはいない）。
  check('★帯ごとの探索は要約1行に畳まれる（詳細は完全JSONへ）',
    dg.includes('帯ごとの探索') && dg.includes('完全JSON の bandScan')
    && !dg.includes('列: 4個'), dg.split('\n').find(l => l.includes('帯ごとの探索')));
  // ★★捨てたフレームの中身が digest に出ること（2026-08-18 に無くて推測に頼った）
  check('★★捨てたフレームの中身（原因・peak・帯）が digest に出る',
    dg.includes('捨てたフレームの中身') && dg.includes('flash') && dg.includes('peak='),
    dg.split('\n').find(l => l.includes('flash') && l.includes('peak=')));

  // ★★専用 ROI で「どの数字を信じるか」が digest に書いてあること
  check('★★生の輝度と時間σが digest に出る（要素の正体を決める生データ）',
    dg.includes('生の輝度') && dg.includes('時間σ'));
  // ★★この2本だけは全値を出す＝上位10山に畳んだら CT の枠数が決められなかった（2026-08-18b）
  check('★★生の輝度は全120値が digest に出る（判断に効く桁は落とさない）',
    dg.includes('生の輝度・全120値') && dg.includes(String(Math.round(big[7]))),
    (dg.split('\n').find(l => l.includes('全120値')) ?? '').slice(0, 80));
  check('★時間σも全値が出る', dg.includes('時間σ・全120値'));
  // ★★山は「どれだけ高いか」で数える（上位N山の抽出は背景のノイズを山と数える）
  check('★★山の数・間隔・水準が digest に出る（局所最大ではなく振幅でしきる）',
    dg.includes('★山（振幅の中点でしきい・重心）: 5個') && dg.includes('中点 94.5'),
    (dg.split('\n').find(l => l.includes('振幅の中点')) ?? '').slice(0, 90));
  // ★2026-08-18g: 輝度の分布は**点灯を説明しないと確定した**ので1行に畳んだ（生値は完全JSON）。
  check('★輝度の分布は1行に畳まれ、「点灯を表していない」と明記される',
    dg.includes('（参考）山ごとの輝度 p50') && dg.includes('輝度は点灯を表していない'),
    dg.split('\n').find(l => l.includes('参考）山ごとの輝度')));
  check('★★色づいた区間・切れ目・差し引いた画面全体の色が digest に出る（＝CT の値そのもの）',
    dg.includes('色づいた区間') && dg.includes('画面全体の色を差し引いた後')
    && dg.includes('谷') && dg.includes('bg') && dg.includes('coin'),
    dg.split('\n').find(l => l.includes('色づいた区間')));
  check('★★モードゲージの塗り率とその時系列が digest に出る（＝与ダメージの観測値）',
    dg.includes('塗り率（色みの階段フィット') && dg.includes('塗り率の時系列'));
  check('★★モードゲージの節が digest に出る（未モデル化メカニクスの観測経路その2）',
    dg.includes('## モードゲージ') && dg.includes('roi=modebar'));
  check('★★山ごとの色と色み（R−B）が digest に出る（輝度で点灯を説明できなかったため）',
    dg.includes('山ごとの色') && dg.includes('R−B'));
  check('★★山ごとの色みの分布と時系列が digest に出る（立ち上がりの時刻＝CT の値）',
    dg.includes('山ごとの色みの分布') && dg.includes('山ごとの色みの時系列') && dg.includes('3秒ごと'));
  check('★★found/bestPeriod を当てにしない旨が明記される（|高域通過|は縁に山が立つ）',
    dg.includes('found/bestPeriod は当てにしない'));
  check('★生プロファイルの標本も出る（どの形からどの形へ変わったか）',
    dg.includes('生プロファイルの標本'));
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

  /**
   * 走を1本作る（★HP は単調に減らす＝バーの段差は動き、ドットは動かない）。
   * ⚠ `knownDecorX` を**無効化**して呼ぶ＝合成はドットをバー全域に置くので、
   *   実データ由来の「既知の装飾の位置」規則とぶつかる。**幾何の検査と装飾ガードの検査は分ける**。
   */
  const NO_DECOR = { knownDecorX: [2, 3] };   // ありえない範囲＝ガードを実質無効化
  function run({ frames = 120, n = 5, litOf = () => 1, litFirst = true } = {}) {
    const tr = new ChargeDotTracker(NO_DECOR);
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
    const tr = new ChargeDotTracker(NO_DECOR);
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
    const trHard = new ChargeDotTracker(NO_DECOR);
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

  // ★★装飾の抑止は「機構としては残すが、既定では何も抑止しない」（2026-08-18 に方針変更）
  //   ⚠⚠ 2026-08-17 に登録した `knownDecorX: [0.50, 0.72]` は**撤回した**＝
  //     2026-08-18 に `ct` を直接採寸したら canvas x 693〜855 で、
  //     「目盛り」と判定した6山（x 700〜802）は**その中に完全に入っていた＝あれは CT だった**。
  //   ⭐⭐ **1つの回答から恒久的な抑止規則を作らない**＝静かで恒久的なブロッカーになる。
  {
    const mk = () => {
      const img = makeImage(640, 54, [45, 40, 50]);
      return img;
    };
    const build = (opts) => {
      const tr = new ChargeDotTracker(opts);
      for (let i = 0; i < 120; i++) {
        const img = mk();
        fillRect(img, 0, 8, Math.round(640 * (0.95 - 0.6 * i / 120)), 32, [205, 35, 55]);
        for (let k = 0; k < 6; k++) fillRect(img, 341 + k * 21 - 5, 18, 10, 18, [200, 200, 205]);
        tr.push(i / 30, img);
      }
      return tr.solveGeometry();
    };

    // ★★回帰の本体: **既定では抑止しない**（＝2026-08-17 の抑止が復活していないこと）
    const gDefault = build();
    check('★★既定では中央付近の構造も抑止しない（撤回した knownDecorX が復活していない）',
      gDefault.found === true && gDefault.decor === false,
      `found=${gDefault.found} decor=${gDefault.decor} / ${gDefault.reason ?? ''}`);
    check('　　CT_DEFAULTS.knownDecorX は既定で null（何も抑止しない）',
      CT_DEFAULTS.knownDecorX === null, JSON.stringify(CT_DEFAULTS.knownDecorX));

    // 機構自体は残す＝**確認できた装飾は呼び出し側が明示的に渡せる**
    const g = build({ knownDecorX: [0.50, 0.72] });
    check('★明示的に渡した装飾範囲では found=false（機構は残っている）',
      !g.found && g.decor === true, `found=${g.found} decor=${g.decor} / ${g.reason ?? ''}`);
    check('★そのとき理由に位置が出る',
      typeof g.reason === 'string' && g.reason.includes('%'), g.reason);
    check('★★縦の帯ごとの探索結果を返す（どの行に構造があるか）',
      Array.isArray(g.bandScan) && g.bandScan.length === 8
      && g.bandScan.every(b => Array.isArray(b.band) && Array.isArray(b.profile)),
      `bandScan ${g.bandScan?.length} 本`);
    check('★帯ごとに装飾かどうかも印がつく',
      g.bandScan.some(b => b.decor === true), JSON.stringify(g.bandScan.map(b => b.decor)));
  }

  // ★★★2026-08-18: **実走 v0.18.0 が「見つからない」と答えた真因を回帰に固定する** ─────
  //   帯探索（v0.17.0）は**固定幅 0.25W の窓**の中で自己相関を測っていたので、
  //   「窓に4周期入ること」と掛かって **探せる周期が W/16 で頭打ち**（`hp` 687px なら 43px）だった。
  //   ∴ **バー全幅に散らばるドット列は原理的に見えなかった**。
  //   ⚠ 一次情報の観測は「**バー上の丸ドット5個**」＝640px のバーなら間隔 ≈107px＝**上限の外**。
  //   ★指紋: 実走の帯探索は **8帯中5帯が上限側の 43/43/43/41** を報告していた。
  {
    const { scanPeriodMultiScale, evenlySpacedRun, CT_DEFAULTS: CD }
      = await import('../src/transcribe/charge_dots.js');

    // `hp` ROI の実寸（687×127）で、バー（縦 0.283〜0.709）の上にドットを散らす合成
    function hpFrame({ fill = 0.8, n = 5, lit = 2 } = {}) {
      const W = 687, H = 127, img = makeImage(W, H, [30, 28, 36]);
      const by0 = Math.round(H * 0.283), bh = Math.round(H * (0.709 - 0.283));
      fillRect(img, 34, by0, Math.round(640 * fill), bh, [205, 35, 55]);
      const P = Math.floor(640 / (n + 1));
      for (let i = 0; i < n; i++) {
        const v = i < lit ? 230 : 150;
        fillRect(img, 34 + P * (i + 1) - 9, by0 + Math.round(bh / 2) - 9, 18, 18, [v, v, v]);
      }
      return { img, P };
    }
    const wide = (n) => {
      const tr = new ChargeDotTracker(NO_DECOR);
      let P = 0;
      for (let i = 0; i < 120; i++) { const f = hpFrame({ fill: 0.95 - 0.6 * i / 120, n }); P = f.P; tr.push(i / 30, f.img); }
      return { g: tr.solveGeometry(), P };
    };

    // ① 検出器の上限そのもの＝**もう W/16 で頭打ちにならない**
    {
      const W = 687;
      const oldCeil = Math.floor(Math.round(W * CD.windowRatio) / CD.minRepeats);   // = 43
      const prof = new Float64Array(W);
      for (let x = 0; x < W; x++) prof[x] = 20 + 60 * Math.cos(2 * Math.PI * x / 106);
      const r = scanPeriodMultiScale(prof, {});
      check('★★探せる周期が窓の固定幅で頭打ちにならない（旧上限 43px の穴）',
        r.best && r.best.period > oldCeil && Math.abs(r.best.period - 106) / 106 < 0.1,
        `旧上限=${oldCeil}px / best=${JSON.stringify(r.best && { p: r.best.period, s: r.best.score })}`);
    }

    // ② 帯探索が**バー全幅に散らばるドット列**の周期を報告できる
    {
      const { g, P } = wide(5);
      const hit = g.bandScan.filter(b => b.best && Math.abs(b.best.period - P) / P < 0.1);
      check('★★帯探索がバー全幅のドット列（間隔 ≈107px）を見つける（v0.18.0 は原理的に不可能だった）',
        hit.length >= 1, `真P=${P} / 各帯=${JSON.stringify(g.bandScan.map(b => b.best?.period))}`);
      check('★★そのとき個数も正しい（窓の外にはみ出したドットを落とさない）',
        g.found && g.dotCount === 5, `found=${g.found} dotCount=${g.dotCount} period=${g.period}`);
    }

    // ③ **少数ドット**でも数を外さない（自己相関には出にくい条件）
    for (const n of [3, 4]) {
      const { g } = wide(n);
      check(`　　広い ROI でドット ${n} 個を ${n} 個と数える`,
        g.found && g.dotCount === n, `found=${g.found} dotCount=${g.dotCount} / ${g.reason ?? ''}`);
    }

    // ④ ★何も写っていない帯は score 0（**平坦を標準化して偽の周期性を作らない**）
    {
      const { g } = wide(5);
      const flat = g.bandScan[0];      // ROI 上端＝合成では一様な背景
      check('★★空の帯は score 0（浮動小数の残差を「分散1」に引き伸ばさない）',
        flat.best != null && flat.best.score === 0,
        `score=${flat.best?.score}＝**0.99 が返るなら平坦ガードが壊れている**`);
    }

    // ⑤ ★等間隔の山の列は「数」ではなく「目立ちの総量」で選ぶ
    //    ⚠ 背景のさざ波は**数だけは多い**＝数で順位をつけると本物の少数ドット列が必ず負ける。
    {
      const W = 600, prof = new Float64Array(W).fill(10);
      for (let k = 0; k < 4; k++) prof[60 + k * 120] = 100;          // 本物＝4個・高い・間隔120
      for (let k = 0; k < 20; k++) prof[300 + k * 12] += 6;          // さざ波＝20個・低い・間隔12
      const run = evenlySpacedRun(prof, {});
      check('★★山の列は「数」ではなく「目立ちの総量」で選ぶ（さざ波に負けない）',
        run && run.count === 4 && Math.abs(run.spacing - 120) < 1,
        `count=${run?.count} spacing=${run?.spacing} prominence=${run?.prominence}`);
      check('★間隔のばらつき（CV）を生値で返す＝判定は読む側がする',
        run && typeof run.cv === 'number', JSON.stringify(run));
    }

    // ⑥ ★少数の山は自己相関では出ないが `peakRun` には出る（帯探索の交差検査）
    {
      const { g } = wide(5);
      const withRun = g.bandScan.filter(b => b.peakRun && b.peakRun.count >= 3);
      check('★帯ごとに peakRun（等間隔の山の列）が付く＝自己相関に依らない交差検査',
        withRun.length >= 1,
        JSON.stringify(g.bandScan.map(b => b.peakRun && { n: b.peakRun.count, sp: b.peakRun.spacing })));
    }
  }

  // ★★色の抽出（2026-08-18e）＝**輝度で点灯を説明できなかったので次に見る手掛かり**
  //   ⚠ 実測: 5つのピップは p25/p50/p75 がすべて **120±0.5**、明るいフレームの割合も
  //     2〜5個目が 0.084/0.087/0.086/0.088 と横並び＝**単調に減る階段になっていない**
  //     ＝輝度は充電の状態を表していない。★残る仮説＝**点灯は色で表されている**。
  //   ∴ 「**輝度がほぼ同じでも色が違えば区別できる**」ことを合成で固定する。
  {
    const tr = new ChargeDotTracker(NO_DECOR);
    for (let i = 0; i < 60; i++) {
      const img = makeImage(200, 40, [40, 40, 44]);
      // ★2つの山を置く。**輝度はほぼ同じだが、片方は暖色・片方は灰色**。
      //   暖色 (200,120,40) の輝度 ≈ 137.6 ／ 灰色 (137,137,137) の輝度 = 137
      fillRect(img, 40 - 8, 12, 16, 16, [200, 120, 40]);
      fillRect(img, 120 - 8, 12, 16, 16, [137, 137, 137]);
      tr.push(i / 30, img);
    }
    const g = tr.solveGeometry();
    check('★色（R/G/B）の走全体平均を返す', !!g.rgb && g.rgb.frames === 60, JSON.stringify(g.rgb?.frames));
    check('★色み（R−B）の配列を返す', Array.isArray(g.chroma) && g.chroma.length === 120);
    check('★山ごとの色を返す', Array.isArray(g.humpColors) && g.humpColors.length === 2,
      JSON.stringify(g.humpColors));
    const [warm, gray] = g.humpColors ?? [];
    // ★★これが本テストの主眼＝**輝度がほぼ同じでも色で分かれる**
    // ⚠ 山ごとの色は**中心 ±間隔/4 の平均**なので背景で薄まる（素の R−B=160 → 実測 60）。
    //   ∴ 固定するのは「**桁で分かれる**」という性質であって、絶対値ではない。
    check('★★輝度がほぼ同じ2つの山を、色（R−B）が区別する（灰は≈0・暖色は桁で大きい）',
      warm && gray && warm.chroma > 30 && Math.abs(gray.chroma) < 10
      && warm.chroma > 5 * Math.abs(gray.chroma),
      `暖色 R−B=${warm?.chroma} / 灰色 R−B=${gray?.chroma}`);
    check('　　灰色の山は R≈G≈B', gray && Math.abs(gray.r - gray.b) < 10 && Math.abs(gray.g - gray.b) < 10,
      JSON.stringify(gray));
  }

  // ★★色みの時系列＝**いつ点いたか**（2026-08-18f）
  //   ★ユーザー確定情報: **CT はターン1回につき1つ蓄積**・**オレンジ**・**M3-1.mp4 でも点灯を観測済み**。
  //   ∴ 「録画中に必ず変化している」＝時系列が取れれば CT の値そのものが読める。
  //   ここでは**途中でオレンジに変わる山**を作り、**立ち上がりの時刻が出る**ことを固定する。
  {
    const tr = new ChargeDotTracker(NO_DECOR);
    const N = 120, LIT_AT = 60;      // 後半だけ点灯（2秒目から）
    for (let i = 0; i < N; i++) {
      const img = makeImage(200, 40, [40, 40, 44]);
      const lit = i >= LIT_AT;
      fillRect(img, 40 - 8, 12, 16, 16, lit ? [220, 130, 40] : [130, 130, 132]);
      fillRect(img, 120 - 8, 12, 16, 16, [130, 130, 132]);   // こちらは最後まで消灯
      tr.push(i / 30, img);
    }
    const g = tr.solveGeometry();
    const [a, b] = g.humpChroma ?? [];
    check('★山ごとの色みの分布と時系列を返す', !!a && Array.isArray(a.series), JSON.stringify(a?.p50));
    // ★★点いた山は分布が二峰＝p25 と p75 が離れる／消灯のままの山は離れない
    check('★★点灯した山は色みの分布が割れる（p25≪p75）・消灯のままの山は割れない',
      a && b && (a.p75 - a.p25) > 20 && Math.abs(b.p75 - b.p25) < 10,
      `点灯側 p25=${a?.p25} p75=${a?.p75} / 消灯側 p25=${b?.p25} p75=${b?.p75}`);
    // ★★立ち上がりの時刻が時系列に出る
    const s = a?.series ?? [];
    const half = Math.floor(s.length / 2);
    const early = s.slice(0, half).filter((v) => v != null);
    const late = s.slice(half).filter((v) => v != null);
    const avg = (v) => v.reduce((x, y) => x + y, 0) / Math.max(1, v.length);
    check('★★時系列が立ち上がりを示す（前半 ≈0 → 後半で大きい）',
      avg(late) - avg(early) > 20 && Math.abs(avg(early)) < 15,
      `前半 ${avg(early).toFixed(1)} → 後半 ${avg(late).toFixed(1)}`);
    check('★色みプロファイルの標本も返る', Array.isArray(g.chromaSamples) && g.chromaSamples.length >= 2,
      String(g.chromaSamples?.length));
  }

  // ★★区間の切り出し・大津法・塗り率（2026-08-18g）
  //   ⭐ 実測で分かった2つの信号を、合成でそのまま再現して固定する:
  //     **全ピップ同時 13〜20**＝画面全体のオレンジ演出／**1個だけ 104〜130**＝そのピップの点灯。
  {
    const { otsuSplit, otsuSplit2, litIntervals, chromaFillSeries }
      = await import('../src/transcribe/charge_dots.js');

    // ① ★★大津法は2クラス法＝**3層あると一度では足りない**（実測の色みは 灰/演出/点灯 の3層）
    const vals = [...Array(500).fill(-1.5), ...Array(60).fill(17), ...Array(40).fill(120)];
    const one = otsuSplit(vals);
    check('★★1段だけだと切れ目が「灰とそれ以外」に落ちる（＝演出が点灯側に混ざる）',
      one != null && one < 17, `1段目=${one}`);
    const lv = otsuSplit2(vals);
    const split = lv.high;
    check('★★2段掛けなら演出（17）と点灯（120）の間に入る',
      split != null && split > 17 && split < 120, `1段目=${lv.low} / 2段目=${lv.high}`);
    check('★どちらの切れ目も返す（どこで切ったかを隠さない）',
      typeof lv.low === 'number' && typeof lv.high === 'number', JSON.stringify(lv));
    check('★上位クラスが乏しければ2段目は作らない（無いものを作らない）',
      otsuSplit2([...Array(500).fill(-1.5), ...Array(3).fill(120)]).high === null);

    // ② 区間の切り出し＝**短い点灯もバケット平均で薄まらない**
    const nF = 300, times = Array.from({ length: nF }, (_, i) => i / 30);
    const mk = (spans, base = -1.5) => {
      const a = new Array(nF).fill(base);
      for (const [s, e, v] of spans) for (let i = s; i < e; i++) a[i] = v;
      return a;
    };
    // 1個目＝t 3.0〜5.0 に点灯／全体演出は t 1.0〜1.5 に全山で 17
    const perHump = [
      mk([[30, 45, 17], [90, 150, 125]]),
      mk([[30, 45, 17]]),
      mk([[30, 45, 17], [200, 206, 90]]),   // ★**0.2秒だけの短い点灯**
    ];
    const iv = litIntervals(perHump, times, split);
    check('★★1個目の点灯区間が時刻つきで出る', iv[0].runs.length === 1
      && Math.abs(iv[0].runs[0].from - 3.0) < 0.1 && Math.abs(iv[0].runs[0].to - 4.97) < 0.1,
      JSON.stringify(iv[0].runs));
    check('　　演出（切れ目より下）は区間にならない', iv[1].count === 0, JSON.stringify(iv[1]));
    check('★★0.2秒の短い点灯も消えない（3秒バケットの平均なら薄まって見えなくなる）',
      iv[2].count === 1 && iv[2].runs[0].frames === 6, JSON.stringify(iv[2].runs));
    check('★同時に超えた本数（coin）を併記する＝全体演出と個別点灯を読み分けられる',
      iv[0].runs[0].coincident === 1, String(iv[0].runs[0].coincident));

    // ③ ★★★共通モード除去＝**画面全体の演出は何段階あっても消える／点灯だけ残る**
    //   ⚠ 実測でこれを外した＝色みの層が4つ（灰/演出/点灯/強い演出）あり、
    //     大津法の多段掛けは **CT の点灯を切り捨てて強い演出だけ**を拾った（出た区間の 7/8 が coin=5）。
    //   ⭐ 正しい切り分けは**大きさではなく「どこが色づいたか」**＝
    //     全体演出は**谷も**色づけるが、点灯は**ピップだけ**を色づける。
    {
      const { subtractCommonMode } = await import('../src/transcribe/charge_dots.js');
      const W2 = 120, centers = [20, 45, 70, 95], sp = 25;
      const frames = [];
      const paint = (pipVals, bgVal) => {
        const p = new Float32Array(W2).fill(bgVal);
        centers.forEach((c, k) => { for (let x = c - 6; x <= c + 6; x++) p[x] = bgVal + pipVals[k]; });
        return p;
      };
      frames.push(paint([0, 0, 0, 0], -2));          // 何も無い
      frames.push(paint([0, 0, 0, 0], 17));          // ★弱い全体演出（谷も 17）
      frames.push(paint([0, 0, 0, 0], 190));         // ★★強い全体演出（谷も 190）
      frames.push(paint([130, 0, 0, 0], -2));        // ★1個目だけ点灯
      frames.push(paint([130, 130, 130, 130], -2));  // ★★全部点灯（他ピップ参照だと消える例）
      const cm = subtractCommonMode(frames, centers, sp, W2);
      const r = (i, h) => Math.round(cm.excess[h][i]);
      check('★★弱い全体演出は差し引きで消える', Math.abs(r(1, 0)) < 5, `残差 ${r(1, 0)}`);
      check('★★★強い全体演出も消える（大きさで切ろうとして外した当のもの）',
        Math.abs(r(2, 0)) < 5, `残差 ${r(2, 0)}`);
      check('★1個だけの点灯は残る', r(3, 0) > 100 && Math.abs(r(3, 1)) < 5,
        `1個目 ${r(3, 0)} / 2個目 ${r(3, 1)}`);
      check('★★全部点灯しても残る（★他のピップを参照にしていたら消えていた）',
        [0, 1, 2, 3].every((h) => r(4, h) > 100), [0, 1, 2, 3].map((h) => r(4, h)).join(','));
      check('★参照に使った谷の位置を返す（どこを引いたかを隠さない）',
        Array.isArray(cm.troughs) && cm.troughs.length >= 3, JSON.stringify(cm.troughs));
    }

    // ④ 塗り率＝色みの階段フィットが境界の移動に追随する
    const W = 100;
    const frames = [], ts = [];
    for (let i = 0; i < 40; i++) {
      const edge = Math.round(W * (0.2 + 0.6 * i / 40));
      const prof = new Float32Array(W);
      for (let x = 0; x < W; x++) prof[x] = x < edge ? 100 : -2;
      frames.push(prof); ts.push(i / 30);
    }
    const fs = chromaFillSeries(frames, ts, 8);
    check('★★塗り率が境界の移動に追随する（0.2 → 0.8 へ増える）',
      fs && fs.series[0] < 0.3 && fs.series.at(-1) > 0.7,
      `${fs?.series[0]} → ${fs?.series.at(-1)}`);
    check('★段差の大きさも返す（小さければ境界が無い＝塗り率を信じない、と判断できる）',
      fs && fs.step.p50 > 50, JSON.stringify(fs?.step));
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
  // ★2026-08-18: 要素ごとに人が採寸する方式へ（ユーザー提案）＝4枠とも採寸済み。
  for (const k of ['hpbar', 'modebar', 'ct', 'debuff']) {
    check(`　　${k} が採寸済み（値が入っている）`, !!ROIS[k], JSON.stringify(ROIS[k]));
  }
  // ★★`ct` は 2026-08-17 に「目盛り」と判定した6山（canvas x 700〜802）を含むこと。
  //   ⚠ これが崩れたら、あの構造が CT だったという同定の根拠が消える＝採寸のやり直しが要る。
  {
    const box = { x: 290, y: 198, w: 1684, h: 1129 };
    const cx0 = ROIS.ct.x * box.w, cx1 = cx0 + ROIS.ct.w * box.w;
    check('★★ct は 2026-08-17 の「等間隔6山」(canvas x 700〜802) を含む＝あれは CT だった',
      cx0 <= 700 && cx1 >= 802, `ct: x ${cx0.toFixed(0)}〜${cx1.toFixed(0)}`);
  }
}

// ── 14. ★★ページ配線の健全性（2026-08-18c 新設）─────────────
//   ⚠⚠ **なぜ要るか（実際に起きた事故）**: `src/transcribe/main.js` が
//     **0 バイトに切り詰められたまま2コミット出荷された**。原因は書き換えスクリプトの評価順のバグで、
//     `open(path,'w')` が先に評価されてファイルを空にしてから、その空ファイルを読んで書き戻していた。
//   ★**そして 190 件のテストが全部通った**＝`main.js` は DOM 依存で import できないため、
//     **唯一「全部を配線しているファイル」だけが無検査だった**。
//   ∴ import せずに検査できることだけを検査する＝**存在・構文・配線**。
//   ⭐ 「壊れたら気づける」より弱い保証でも、**気づけない箇所をゼロにする**ほうが効く。
console.log('\n[14] ページ配線の健全性（★main.js は import できないので、存在・構文・配線を検査する）');
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const root = new URL('../', import.meta.url).pathname;

  const dir = root + 'src/transcribe/';
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  check('★src/transcribe/ に .js が期待どおり在る（11本以上）', files.length >= 11, `${files.length}本`);

  for (const f of files) {
    const body = readFileSync(dir + f, 'utf8');
    // ★★切り詰め検出＝**空でないこと**。事故はここだけで捕まえられた。
    check(`　　${f} が空でない`, body.length > 500, `${body.length} 字`);
    // 構文が壊れていないこと（ESM として parse できるか）
    let ok = true, err = '';
    try {
      execFileSync(process.execPath, ['--input-type=module', '--check'], { input: body, stdio: 'pipe' });
    } catch (e) { ok = false; err = String(e.stderr ?? e).split('\n').slice(0, 2).join(' '); }
    check(`　　${f} が ESM として構文エラーなく parse できる`, ok, err);
  }

  // ★配線＝main.js が触る DOM の id が index.html に実在すること
  const main = readFileSync(dir + 'main.js', 'utf8');
  const html = readFileSync(root + 'transcribe/index.html', 'utf8');
  const used = [...new Set([...main.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]))];
  check('★main.js が DOM の id を参照している（10個以上）', used.length >= 10, `${used.length}個`);
  const missing = used.filter((id) => !html.includes(`id="${id}"`));
  check('★★main.js が触る id はすべて index.html に実在する', missing.length === 0,
    `index.html に無い id: ${JSON.stringify(missing)}`);

  // ★逆向き＝index.html のボタンが main.js から配線されていること（押しても無反応を防ぐ）
  const buttons = [...html.matchAll(/<button[^>]*id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
  const unwired = buttons.filter((id) => !main.includes(`'${id}'`));
  check('★★index.html のボタンはすべて main.js から配線されている（押しても無反応を作らない）',
    unwired.length === 0, `配線が無いボタン: ${JSON.stringify(unwired)}`);

  // ★★★`fit.○○.toFixed(` を `main.js` に直書きしない（2026-08-21 の出荷事故）。
  //   ⚠ `fitTaughtGrid` の返り値は**設計が変われば欄が消える**（実際「合致度」が消えた）。
  //     画面側に書式を直書きすると、**押した瞬間に落ちる**のに全テストが通ってしまう。
  //   ★書式は `teachSummary()` を通す＝検査できる場所に置く。
  {
    const bad = [...main.matchAll(/fit\.[A-Za-z]+\.toFixed\(/g)].map((m) => m[0]);
    check('★★★fit の欄を main.js で直接 toFixed しない（teachSummary を通す）',
      bad.length === 0, `直書き: ${JSON.stringify(bad)}`);
    check('  この検査は実際に効く（旧コードの書き方なら落ちる）',
      /fit\.[A-Za-z]+\.toFixed\(/.test("+ `（格子の合致度 ${fit.contrast.toFixed(3)} / `"));
  }

  // ★★切り抜きは **JSON で保存**すること（2026-08-20b）。
  //   ⚠ PNG で保存するとチャットに貼ったとき「画像」として扱われ、**画素を読めない**
  //     （ユーザー報告）。JSON はファイルとして届く＝**Claude が実画素で検証できる唯一の経路**。
  check('★★教えた切り抜きは JSON（PNG を data URL で内包）で保存する',
    /saveTeachCrop[\s\S]{0,1200}toDataURL\('image\/png'\)/.test(main)
    && /saveTeachCrop[\s\S]{0,1400}\.json`/.test(main),
    '切り抜き保存が JSON 経路になっていない（PNG 直保存に戻っていないか）');

  // ★版が刻まれていること（provenance＝どの版の出力かが分からないと走が無駄になる）
  const ver = main.match(/const VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'/);
  check('★main.js に VERSION が刻まれている', !!ver, ver?.[1] ?? '見つからない');
}

// ── 15. ★★★ページの初期化スモーク（2026-08-18i 新設）───────────
//   ⚠⚠ **2回続けて「ボタンが全部効かない」を出した**のに、そのたびセルフテストは全部通っていた。
//     [14] は「空でない・ESM として parse できる・id が index.html に在る」までしか見ておらず、
//     ★**parse できることと、実行して初期化が通ることは別**だから。
//   ∴ **最小の DOM スタブで main.js を実際に読み込む**（別プロセス＝globalThis を汚さない）。
console.log('\n[15] ページの初期化スモーク（★main.js を DOM スタブで実際に実行する）');
{
  const { execFileSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const root = new URL('../', import.meta.url).pathname;
  let out = '', failed = false;
  try {
    out = execFileSync(process.execPath, [root + 'tools/t1_page_smoke.mjs'], { encoding: 'utf8' });
  } catch (e) { failed = true; out = String(e.stdout ?? '') + String(e.stderr ?? ''); }
  check('★★★main.js が例外なく初期化される（import 解決・初期化中の例外を含む）',
    !failed && out.includes('INIT_OK'), out.split('\n')[0]);
  check('★★全ボタンにハンドラが付く（＝押しても無反応、を作らない）',
    out.includes('BUTTONS_OK'), out.split('\n').find((l) => l.startsWith('DEAD_BUTTONS')) ?? '');
  check('★初期化完了の合図（window.__t1Ready）が立つ', out.includes('READY_OK'), out);
  // ★★★2026-08-19c 追加＝**実際に全ボタンを押して例外が出ないこと**。
  //   ⚠⚠ これが無くて出荷した: リファクタで `rois` の宣言を消してしまい、
  //     「このフレームを解析」を押した瞬間に `ReferenceError: rois is not defined`。
  //     **294件のセルフテストは全部通っていた**（初期化は通り、ハンドラも付いていたため）。
  //   ★**ハンドラが付いていることと、押して動くことは別**。
  //   ✅ 採用前に**バグを戻して落ちること**を確認済（`CLICK_ERRORS copyRois: ReferenceError`）。
  check('★★★全ボタンを実際に押しても例外が出ない（未定義参照をここで捕まえる）',
    out.includes('CLICKS_OK'),
    out.split('\n').find((l) => l.startsWith('CLICK_ERRORS')) ?? out);

  // ★★壊れたときに**画面が黙らない**こと（2回とも画面は無反応なだけだった）
  const html = readFileSync(root + 'transcribe/index.html', 'utf8');
  check('★★module の読み込みエラーを画面に出す番人が index.html に在る',
    html.includes("addEventListener('error'") && html.includes('id="fatal"'));
  check('★★読み込み自体が起きなかった場合も「初期化されていません」と言う',
    html.includes('__t1Ready') && html.includes('初期化されていません'));
  check('★その番人は classic script（module が壊れていても動く）',
    /<script>[\s\S]*__t1Ready[\s\S]*<\/script>/.test(html));
}

// ── 16. ★★グリフ照合（P3-1）─────────────────────────────────
//   ★何を固定するか: **実物で確認済みの制約**（`glyph.js` 冒頭①〜⑥）に対して、
//     照合器が満たすべき**性質**を合成で固定する。
//   ⚠ 合成フォントは**実機のフォントではない**（実機グリフは録画からしか得られない＝P3-1 の採取）。
//     ∴ ここで通っても「実機で読める」証明にはならない。**仕組みの回帰**として置く。
//   ★★本節で最も重要なのは最後の [16-9]＝**誤った数字を出さないこと**。
//     読めない（`?`）は次工程が拾えるが、**もっともらしい誤読は較正を静かに汚染する**。
console.log('\n[16] グリフ照合（P3-1）＝縁取りで読む・遮蔽に強い・間違えるくらいなら読まない');
{
  const G = await import('../src/transcribe/glyph.js');

  // 合成ビットマップフォント（5×7）。★実機と同じ**構造**（一定の送り幅・縁取り＋塗り）だけを模す。
  const FONT = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    ',': ['00000', '00000', '00000', '00000', '00000', '00110', '00100'],
  };
  const GW = 5, GH = 7, SBASE = 3, ADV = 8;   // ADV: 送り（フォントセル）
  const S = SBASE;

  /** 1文字を描く。★塗りは**上下でグラデ**（実機＝金グラデ）／縁取りは暗い。 */
  function drawGlyph(img, x, y, ch, opt = {}) {
    const pat = FONT[ch];
    const S = opt.s ?? SBASE;   // ★字の大きさ（実機のダメージ数字は 100px 級＝背景より遥かに大きい）
    const top = opt.fillTop ?? 250, bot = opt.fillBottom ?? 150, outline = opt.outline ?? 15;
    const on = (cx, cy) => cy >= 0 && cy < GH && cx >= 0 && cx < GW && pat[cy][cx] === '1';
    for (let cy = -1; cy <= GH; cy++) {
      for (let cx = -1; cx <= GW; cx++) {
        let c = null;
        if (on(cx, cy)) {
          const v = Math.round(top + (bot - top) * (cy / (GH - 1)));
          c = [v, Math.round(v * 0.86), Math.round(v * 0.42)];      // 金っぽい塗り
        } else if (on(cx - 1, cy) || on(cx + 1, cy) || on(cx, cy - 1) || on(cx, cy + 1)) {
          c = [outline, outline, outline];
        }
        if (c) fillRect(img, x + cx * S, y + cy * S, S, S, c);
      }
    }
  }
  function drawText(img, x, y, text, opt = {}) {
    const adv = (opt.adv ?? ADV) * (opt.s ?? SBASE);
    const truth = [];
    let cx = x;
    for (const ch of text) { drawGlyph(img, cx, y, ch, opt); truth.push({ ch, x: cx, y }); cx += adv; }
    return truth;
  }
  /** 半透明合成（実機の重なりは**半透明**＝両方が部分的に残る＝制約③）。 */
  function blendRect(img, x, y, w, h, c, alpha) {
    for (let yy = Math.max(0, y); yy < Math.min(img.height, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(img.width, x + w); xx++) {
        const i = (yy * img.width + xx) * 4;
        for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(img.data[i + k] * (1 - alpha) + c[k] * alpha);
      }
    }
  }
  /** 4条星（キラキラ＝制約②）。 */
  function drawStar(img, cx, cy, r, alpha = 0.8) {
    blendRect(img, cx - r, cy - 1, 2 * r, 3, [255, 255, 240], alpha);
    blendRect(img, cx - 1, cy - r, 3, 2 * r, [255, 255, 240], alpha);
  }
  const fieldOf = (img) => G.edgeField(G.luminanceField(img, { x: 0, y: 0, w: img.width, h: img.height }));
  const DARK = [25, 20, 55], MID = [110, 105, 120], BRIGHT = [200, 190, 120];

  /** 参照ストリップを1本描いて署名を採る（＝採取→ラベル付けの結果に相当）。 */
  function strip(chars, bg, opt = {}) {
    const img = makeImage(chars.length * ADV * S + 20, 60, bg);
    drawText(img, 8, 12, chars, opt);
    const edge = fieldOf(img);
    const row = G.segmentRows(edge).rows[0];
    const seg = G.segmentGlyphs(edge, row);
    return { img, edge, row, seg, scale: G.fieldScale(edge, row), chars };
  }
  /** 条件のリストからアトラスを作る（★1字に複数の見え方を持たせられる）。 */
  function atlasFrom(conds, chars = '0123456789,') {
    const glyphs = {};
    for (const c of conds) {
      const st = strip(chars, c.bg ?? DARK, c.opt ?? {});
      st.seg.boxes.forEach((b, i) => {
        if (i < chars.length) (glyphs[chars[i]] ||= []).push(G.packSignature(G.signature(st.edge, b, { scale: st.scale })));
      });
    }
    return { version: 1, cell: { ...G.GLYPH_DEFAULTS.cell }, provenance: { synthetic: true }, glyphs, labels: {} };
  }

  let drawTaught;   // ★[16-12] で定義し [16-13] でも使う（同じフォントで測るため）
  const base = strip('0123456789,', DARK);
  const atlas1 = atlasFrom([{ bg: DARK }]);
  check('★参照ストリップから 11 文字（0〜9とカンマ）が切り出せる',
    base.seg.boxes.length === 11, `${base.seg.boxes.length} 個 / method=${base.seg.method}`);
  check('アトラスの健全性検査が通る', G.validateAtlas(atlas1).ok,
    JSON.stringify(G.validateAtlas(atlas1).problems));

  // ── [16-1] ★★等間隔の格子で割る（谷で切る方式は背景で壊れた）──
  {
    const counts = [DARK, MID, BRIGHT].map((bg) => strip('0123456789', bg).seg.boxes.length);
    check('★★背景が暗くても明るくても 10 文字に割れる（等間隔の格子で割っているから）',
      counts.every((n) => n === 10), `切り出し数 ${JSON.stringify(counts)}`);
    // ⚠ 退避路（谷で切る＋幅で分割）は同じ入力で壊れることを**回帰として固定する**
    //   ＝格子をやめて閾値方式に戻したらここが落ちる。
    const fallback = [DARK, MID, BRIGHT].map((bg) => {
      const st = strip('0123456789', bg);
      return G.segmentGlyphs(st.edge, st.row, { gridContrastFloor: 2 }).boxes.length;  // 格子を必ず不採用にする
    });
    check('★退避路（谷で切る）は背景を変えると同じ入力で壊れる＝格子が要る理由の記録',
      !fallback.every((n) => n === 10), `退避路の切り出し数 ${JSON.stringify(fallback)}`);
  }

  // ── [16-2] 塗りが変わっても読める（金グラデ＝制約④）──────────
  {
    const img = makeImage(420, 80, DARK);
    const text = '6,012,442';
    drawText(img, 10, 20, text, { fillTop: 180, fillBottom: 255, outline: 30 }); // グラデを逆向きに
    const edge = fieldOf(img);
    const rows = G.segmentRows(edge);
    check('行がちょうど1つ見つかる', rows.rows.length === 1, `${rows.rows.length} 行`);
    const r = G.readRow(edge, rows.rows[0], atlas1);
    check('★★塗りのグラデが逆でも同じ文字列を読む（縁取りで照合しているから）',
      r.number.text === text, `読み=${r.number.text}`);
    check('数値とカンマ文法が通る', r.number.ok && r.number.value === 6012442,
      `${r.number.value} / ${r.number.reason}`);
  }

  // ── [16-3] 星（キラキラ）が重なっても数字が動かない（制約②）───
  {
    const img = makeImage(420, 80, DARK);
    const truth = drawText(img, 10, 20, '6,012,442');
    const t = truth[2];
    drawStar(img, t.x + (GW * S) / 2, t.y + (GH * S) / 2, 16, 0.8);
    const edge = fieldOf(img);
    const r = G.readRow(edge, G.segmentRows(edge).rows[0], atlas1);
    const digits = r.tokens.map((x) => x.key).join('');
    check('★★星が乗ったヒットでも、乗った字以外は誤らない（受け入れ検査に星を必ず含める＝P1 発見⑫）',
      /^6,0[12?]2,442/.test(digits) || digits.startsWith('6,0'), `読み=${digits}`);
    check('★星で潰れた字は「読めない」か正解のどちらかで、別の数字にはならない',
      r.tokens.every((x, i) => x.key === '?' || x.key === '6,012,442'[i] || i >= 9),
      `読み=${digits}`);
  }

  // ── [16-4] 半透明ラベルの重なりは「マスクすれば票を持たない」（制約①③）
  {
    const img = makeImage(420, 80, DARK);
    const truth = drawText(img, 10, 20, '6,012,442');
    // ★上のヒットのラベルが**この行の上半分に重なる**（P1 発見①＝縦ピッチ < ラベル高+数値高）
    const band = { x: 0, y: 20, w: img.width, h: Math.round((GH * S) / 2) };
    blendRect(img, band.x, band.y, band.w, band.h, [255, 60, 60], 0.5);
    const edge = fieldOf(img);
    const row = G.segmentRows(edge).rows[0];
    const box = { x: truth[0].x - 6, y: 20, w: ADV * S, h: GH * S };
    const scale = G.fieldScale(edge, row);
    const sig = G.signature(edge, box, { scale });
    const tmpl = G.templatesOf(atlas1.glyphs['6'], atlas1.cell)[0];
    const bare = G.matchSignature(sig, tmpl);
    const mask = G.maskFromRects(box, [band], atlas1.cell);
    const masked = G.matchSignature(sig, tmpl, { mask });
    check('★★ラベルで潰した画素をマスクすると、正解グリフの score が上がる（＝汚染が票を持たなくなる）',
      masked.score > bare.score, `mask あり ${masked.score.toFixed(3)} / なし ${bare.score.toFixed(3)}`);
    check('マスクは「隠れた場所」だけを 0 にする（全部 0 にしない）',
      mask.some((v) => v === 1) && mask.some((v) => v === 0),
      `1 の数=${mask.filter((v) => v === 1).length} / 0 の数=${mask.filter((v) => v === 0).length}`);
  }

  // ── [16-5] 字がくっついても文字数を落とさない（格子の効き目）───
  {
    const img = makeImage(420, 80, DARK);
    const truth = drawText(img, 10, 20, '1,234,567');
    // ★4文字目と5文字目の字間を演出で埋めて「1つの塊」にする（実機の重なりと同じ効果）
    const bx = truth[3].x + GW * S;
    blendRect(img, bx, 20, ADV * S - GW * S + 2, GH * S, [255, 240, 200], 0.9);
    const edge = fieldOf(img);
    const seg = G.segmentGlyphs(edge, G.segmentRows(edge).rows[0]);
    check('★★字間が演出で埋まっても 9 文字のまま（格子は塊の切れ目を見ていない）',
      seg.boxes.length === 9 && seg.method === 'grid',
      `${seg.boxes.length} 個 / method=${seg.method} / pitch=${seg.pitch?.toFixed(2)}`);
  }

  // ── [16-6] `8` の罠＝cover だけでは何にでも一致する（2項に分けた根拠）
  {
    const t8 = G.templatesOf(atlas1.glyphs['8'], atlas1.cell)[0];
    const t1 = G.templatesOf(atlas1.glyphs['1'], atlas1.cell)[0];
    const m = G.matchSignature(t8, t1);        // 標本='8' をテンプレ='1' で見る
    check('★★cover だけなら 8 は 1 のテンプレを満たしてしまう（だから alien 項が要る）',
      m.cover > 0.6 && m.score < 0.8, `cover=${m.cover.toFixed(3)} score=${m.score.toFixed(3)}`);
    check('分類は 8 を選ぶ（1 ではない）', G.classify(t8, atlas1).best.key === '8');
  }

  // ── [16-7] カンマ文法＝その場でできる検算 ─────────────────
  {
    check('カンマ文法: 正しい表記が通る', G.checkCommaGrammar('6,012,442').ok);
    check('★カンマ文法: 中の桁が1つ落ちると落とせる', !G.checkCommaGrammar('6,01,442').ok,
      G.checkCommaGrammar('6,01,442').reason ?? '');
    check('★カンマ文法: 桁が1つ増えても落とせる', !G.checkCommaGrammar('6,0125,442').ok);
    check('⚠ 先頭グループの欠けは文法では捕まらない（検算⑦の担当）と明示できている',
      G.checkCommaGrammar('012,442').ok === true);
    const r = G.readNumber([{ key: '1', score: 1 }, { key: '?', score: 0 }], { minDigits: 1, maxDigits: 9 });
    check('★読めない文字があれば「読めない」と言う（推測で埋めない）',
      !r.ok && /未一致/.test(r.reason), JSON.stringify(r));
  }

  // ── [16-8] 採取＝「同じ形が何回も出た」までが機械の仕事 ───────
  //   ★★狙いは「10 クラスタにまとめる」ことでは**ない**（`clusterSimilarity` の注記＝実測で棄却）。
  //     狙いは**純度**＝1つのクラスタに2つの字を混ぜないこと。ラベルは人が1回付けるので、
  //     **数が増えるのは手間が増えるだけ**だが、**混ざると誤ったテンプレートにラベルが付く**。
  {
    const h = new G.GlyphHarvest();
    for (let i = 0; i < 3; i++) {
      const st = strip('0123456789', DARK);
      for (const b of st.seg.boxes) h.push(G.signature(st.edge, b, { scale: st.scale }), i, b);
    }
    const rep = h.report();
    check('★同じ条件の繰り返しは1つにまとまる（30 標本 → 10 クラスタ）',
      rep.seen === 30 && rep.clusters === 10, `標本 ${rep.seen} / クラスタ ${rep.clusters}`);
    check('代表は出現回数の多い順に並ぶ', rep.representatives[0].count === 3);

    // ★★純度＝条件を9通りに散らしても、1つのクラスタに2つの字が入らないこと
    const h2 = new G.GlyphHarvest();
    const seen = new Map();
    for (const bg of [DARK, MID, BRIGHT]) {
      for (const opt of [{}, { fillTop: 160, fillBottom: 255 }, { fillTop: 255, fillBottom: 90 }]) {
        const st = strip('0123456789', bg, opt);
        st.seg.boxes.forEach((b, i) => {
          const cl = h2.push(G.signature(st.edge, b, { scale: st.scale }), 0, b);
          if (!cl) return;
          if (!seen.has(cl)) seen.set(cl, new Set());
          seen.get(cl).add('0123456789'[i]);
        });
      }
    }
    const mixed = [...seen.values()].filter((s2) => s2.size > 1).length;
    check('★★★条件を散らしても「別の字が混ざったクラスタ」は0（＝ラベルが誤ったテンプレに付かない）',
      mixed === 0, `混ざったクラスタ ${mixed} / 全 ${h2.clusters.length}`);
    check('⚠ 1つの字が条件ごとに複数クラスタになるのは想定どおり（それが variants になる）',
      h2.clusters.length > 10, `クラスタ ${h2.clusters.length}（90 標本）`);

    const h3 = new G.GlyphHarvest({ maxClusters: 3 });
    const st3 = strip('0123456789', DARK);
    for (const b of st3.seg.boxes) h3.push(G.signature(st3.edge, b, { scale: st3.scale }), 0, b);
    const diag2 = new Diag('T1', 'test');
    G.reportHarvest(diag2, h3.report(), { ok: true });
    check('★クラスタ数が上限に張り付いたら診断で鳴る（閾値が緩すぎる/箱がずれている合図）',
      diag2.items.some((i) => i.code === 'T1-DETECT-006'), JSON.stringify(diag2.items.map((i) => i.code)));
  }

  // ── [16-9] ★★★本節の主眼＝**誤った数字を出さない** ────────────
  //   ⚠ 実測（合成 3背景 × 3塗り × 10字 = 90 標本）で確立した設計判断:
  //     - **誤読は 100% `ambiguous`（1位と2位の差 < margin）だった**
  //     - **score の絶対値では分けられない**（誤読 0.564〜0.632 が正解 0.539〜0.999 と重なる）
  //     ∴ 採否は score ではなく**1位と2位の差**で決める（`rejectAmbiguous`）。
  //   ★あわせて「アトラスに**条件ごとの見え方**を足すと読める率が上がる」ことも固定する。
  {
    const chars = '0123456789';
    const conds = [];
    for (const bg of [DARK, MID, BRIGHT]) for (const opt of [{}, { fillTop: 160, fillBottom: 255 }, { fillTop: 255, fillBottom: 90 }]) conds.push({ bg, opt });
    const score = (atlas, opts = {}) => {
      let read = 0, wrong = 0, unread = 0;
      for (const c of conds) {
        const st = strip(chars, c.bg, c.opt);
        const r = G.readRow(st.edge, st.row, atlas, opts);
        r.tokens.forEach((t, i) => {
          if (t.key === '?') unread++;
          else if (t.key === chars[i]) read++;
          else wrong++;
        });
      }
      return { read, wrong, unread };
    };
    const one = score(atlasFrom([{ bg: DARK }], chars));
    const three = score(atlasFrom([{ bg: DARK }, { bg: MID }, { bg: BRIGHT }], chars));
    // ⚠⚠ **合成と実機で結論が割れた**（2026-08-21c）＝**合成では**マージンを広げると誤りがゼロになるが、
    //   **実画素（切り抜き10枚・73点）ではマージンを上げても誤りが1件も減らない**
    //   （margin 0.04 で 正58/曖昧7/誤8 ／ 0.12 で 正33/曖昧32/**誤8**）。
    //   ★**実機の誤読は「自信のある誤読」**＝マージンは安全網ではなく歩留まりを削るだけ。
    //   ∴ 既定は 0.04（実測）にし、**安全網は検算（§5）に置く**。
    //   ここでは「機構としては効く」ことだけを固定する（広いマージンを明示して渡す）。
    check('★機構としてのマージンは効く（合成・広いマージンを明示すれば誤りゼロ）',
      score(atlasFrom([{ bg: DARK }], chars), { ambiguityMargin: 0.20 }).wrong === 0,
      JSON.stringify(score(atlasFrom([{ bg: DARK }], chars), { ambiguityMargin: 0.20 })));
    check('⚠ 実機ではマージンで誤りは減らない（既定 0.04・安全網は検算）＝この記述が残っている',
      /実画素ではマージンを上げても誤りが1件も減らない/.test(
        readFileSync(new URL('../src/transcribe/glyph.js', import.meta.url), 'utf8')));
    check('★★★条件を増やしたアトラスでも誤りゼロのまま、読める率が上がる',
      three.wrong === 0 && three.read > one.read,
      `1条件 ${one.read}/90 → 3条件 ${three.read}/90（誤り ${three.wrong}）`);
    check('★曖昧さの拒否を切ると誤読が出る＝この policy が効いていることの裏取り',
      (() => {
        let wrong = 0;
        for (const c of conds) {
          const st = strip(chars, c.bg, c.opt);
          const r = G.readRow(st.edge, st.row, atlasFrom([{ bg: DARK }], chars), { rejectAmbiguous: false });
          r.tokens.forEach((t, i) => { if (t.key !== '?' && t.key !== chars[i]) wrong++; });
        }
        return wrong > 0;
      })(), 'rejectAmbiguous=false で誤読が出ること');
  }

  // ── [16-11] ★★人に見せるのは「実画素」──────────────────────
  //   ⚠⚠ **初版はここで事故った**（ユーザー報告 2026-08-19b）＝代表シートに
  //     **署名（12×20 の縁取りの強さ）**を描いていて、「荒すぎる・白黒・一部分」で**何も判別できない**。
  //   ★署名は**機械が照合するための表現**であって**人が見るための表現ではない**。
  //     人に判断を頼むなら、**人が判断できる形**（色つき・元の解像度の画素）で見せる。
  //   ∴ 採取器は署名と**実画素の両方**を持ち、画面には実画素を描く。ここはその回帰。
  {
    const img = makeImage(40, 30, [10, 20, 30]);
    fillRect(img, 10, 5, 6, 8, [200, 100, 50]);
    const patch = G.cropPatch(img, { x: 10, y: 5, w: 6, h: 8 });
    check('★切り出しは実画素をそのまま返す（色が保たれる）',
      patch.w === 6 && patch.h === 8 && patch.data[0] === 200 && patch.data[1] === 100 && patch.data[2] === 50,
      `${patch.w}×${patch.h} 先頭=${[...patch.data.slice(0, 3)]}`);
    const edgeCrop = G.cropPatch(img, { x: 38, y: 28, w: 10, h: 10 });
    check('画面の外へはみ出しても落ちない（内側だけ返す）',
      edgeCrop.w === 2 && edgeCrop.h === 2, `${edgeCrop.w}×${edgeCrop.h}`);

    const h = new G.GlyphHarvest();
    const st = strip('0123456789', DARK);
    // 同じ字を5回入れて、実画素の保持数に上限があること（記憶が膨らまない）も見る
    for (let k = 0; k < 5; k++) {
      st.seg.boxes.forEach((b) => h.push(G.signature(st.edge, b, { scale: st.scale }), k,
        b, G.cropPatch({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, b)));
    }
    const st2 = strip('0123456789', DARK);
    const h2 = new G.GlyphHarvest();
    st2.seg.boxes.forEach((b) => h2.push(G.signature(st2.edge, b, { scale: st2.scale }), 0, b,
      G.cropPatch(st2.img ?? makeImage(4, 4, [0, 0, 0]), b)));
    const rep2 = h2.report();
    check('★★代表から実画素が取り出せる（シートに描くのはこれ）',
      h2.patchAt(0) !== null, `patchAt(0)=${h2.patchAt(0) ? 'あり' : 'なし'}`);
    check('★代表には箱の実寸が付く（字の一部しか入っていないことに人が気づける）',
      rep2.representatives[0].box && rep2.representatives[0].box.w > 0,
      JSON.stringify(rep2.representatives[0].box));
    // ★診断 JSON に実画素を混ぜない（桁違いに膨らむ）
    check('★実画素は診断 JSON には載らない（digest/JSON が膨らまない）',
      !JSON.stringify(rep2).includes('"data"') && !JSON.stringify(rep2).includes('patches'),
      `JSON 長 ${JSON.stringify(rep2).length}`);
    h.report();
    check('保持する実画素はクラスタあたり3枚まで（記憶が膨らまない）',
      h.clusters.every((c) => c.patches.length <= 3),
      `最大 ${Math.max(...h.clusters.map((c) => c.patches.length))} 枚`);
  }

  // ── [16-12] ★★★「教わって格子を合わせる」（実機で採取が破綻した件の答え）──
  //   ⚠⚠ **実機（M3-1.mp4）で採取＋クラスタリングは破綻した**（2026-08-19c）:
  //     `dmg` ROI はキャラ絵・床グリッド・光でエッジが埋まり、**行の射影は文字行を切り出さない**
  //     （実測: 行の高さ p50 32 / p90 230 / max 561、「TOTAL / STING! / 数字」が **1帯 h=308** に潰れ、
  //      背景のグリッド線が行として出た）。集まった代表の大半が**背景の模様**だった。
  //   ★∴ **人が「ここに 5,044,282 と出ている」と教える**経路にする（憲法そのもの）。
  //     文字数が既知になり、ラベルも自動で付き、**カンマの送り幅比まで測れる**。
  {
    // カンマだけ送り幅が狭いフォント（実機の見た目に合わせる）
    drawTaught = function (img, x, y, text, commaRatio = 0.5, opt = {}) {
      const SZ = opt.s ?? 6;   // ★実機のダメージ数字は背景の模様より遥かに大きい（125px 級）
      const adv = ADV * SZ;
      const truth = [];
      let cx = x;
      for (const ch of text) {
        const a = ch === ',' ? adv * commaRatio : adv;
        // ★インクを送り幅の中央に置く（実フォントのサイドベアリング）。
        //   ⚠ ここを手抜きして左詰めで描いたら、**真値の定義がずれて**テストだけが落ちた
        //     （2026-08-19c＝「測定器（フィクスチャ）の性質を観測対象の性質と取り違えない」の小型版）。
        drawGlyph(img, Math.round(cx + (a - GW * SZ) / 2), y, ch, { ...opt, s: SZ });
        truth.push({ ch, x: cx, w: a, center: cx + a / 2 });
        cx += a;
      }
      return { truth, width: cx - x };
    };
    // ★背景を「エッジだらけ」にする＝実機の `dmg`（キャラ絵・床グリッド）を模す
    function busyBackground(img) {
      for (let y = 0; y < img.height; y += 7) fillRect(img, 0, y, img.width, 2, [120, 40, 160]);
      for (let x = 0; x < img.width; x += 11) fillRect(img, x, 0, 2, img.height, [90, 30, 130]);
    }

    const SZ = 6;
    const text = '5,044,282';
    const img = makeImage(1000, 140, [40, 20, 70]);
    busyBackground(img);
    const drawn = drawTaught(img, 40, 30, text, 0.5);
    const edge = fieldOf(img);
    const box = { x: 40, y: 30, w: drawn.width, h: GH * SZ };
    const fit = G.fitTaughtGrid(edge, box, text);
    check('★★教わった文字数どおりに割れる（文字数が既知＝探索の自由度が1つ消える）',
      fit.ok && fit.boxes.length === text.length, `${fit.boxes.length} 個 / ${text.length} 文字`);
    const errs = fit.boxes.map((b, i) => Math.abs(b.center - drawn.truth[i].center));
    check('★★各文字の中心が真値に乗る（誤差 < 送り幅の 20%）',
      Math.max(...errs) < fit.pitch * 0.2,
      `最大ずれ ${Math.max(...errs).toFixed(1)}px / pitch ${fit.pitch.toFixed(1)}`);
    check('★カンマの送り幅比を**測って**返す（フォントの寸法そのもの・真値 0.50）',
      Math.abs(fit.commaRatio - 0.5) <= 0.15, `commaRatio=${fit.commaRatio.toFixed(2)}`);
    // ⚠⚠ **「合致度」はもう無い**（2026-08-21）＝**探索そのものを捨てた**ので当てはめの良し悪しが無い。
    //   ★代わりに固定されるべき性質は「**囲みの幅と文字列だけから幾何が決まる**」こと。
    check('★★★探索なしで幾何が決まる（送り幅 = 囲みの幅 ÷ (数字数 + カンマ比×カンマ数)）',
      Math.abs(fit.pitch - box.w / (7 + 0.5 * 2)) < 0.01 && fit.commaRatio === 0.5,
      `送り幅 ${fit.pitch.toFixed(2)} / カンマ比 ${fit.commaRatio}`);

    // ★端から端まで通す＝**教わった数字から作ったアトラスで、別の数字が読めるか**
    const teach = (img0, x0, y0, str) => {
      const e = fieldOf(img0);
      const d = drawTaughtInfo.get(str);
      const f = G.fitTaughtGrid(e, { x: x0, y: y0, w: d.width, h: GH * SZ }, str);
      const sc = G.fieldScale(e, { from: y0, to: y0 + GH * SZ });
      return f.boxes.map((b) => ({ ch: b.ch, sig: G.packSignature(G.signature(e, b, { scale: sc })) }));
    };
    const mkAtlas = (entries) => {
      const glyphs = {};
      for (const e of entries) (glyphs[e.ch] ||= []).push(e.sig);
      return { version: 1, cell: { ...G.GLYPH_DEFAULTS.cell }, provenance: { taught: true },
               glyphs, labels: {}, metrics: { commaRatio: fit.commaRatio } };
    };
    const drawTaughtInfo = new Map([[text, drawn]]);
    const a1 = mkAtlas(teach(img, 40, 30, text));

    // 2本目を教える（別の数字）＝variants が増える
    const imgB = makeImage(1000, 140, [40, 20, 70]);
    busyBackground(imgB);
    const textB = '9,617,300';
    drawTaughtInfo.set(textB, drawTaught(imgB, 40, 30, textB, 0.5));
    const a2 = mkAtlas([...teach(img, 40, 30, text), ...teach(imgB, 40, 30, textB)]);

    const target = '4,285,204';
    const imgT = makeImage(1000, 140, [40, 20, 70]);
    busyBackground(imgT);
    drawTaughtInfo.set(target, drawTaught(imgT, 40, 30, target, 0.5));
    const edgeT = fieldOf(imgT);
    const fitT = G.fitTaughtGrid(edgeT, { x: 40, y: 30, w: drawTaughtInfo.get(target).width, h: GH * SZ }, target);
    const scaleT = G.fieldScale(edgeT, { from: 30, to: 30 + GH * SZ });
    const readWith = (atlas) => fitT.boxes.map((b) => {
      const c = G.classify(G.signature(edgeT, b, { scale: scaleT }), atlas);
      return c.best && !c.ambiguous && c.best.score >= G.GLYPH_DEFAULTS.minScore ? c.best.key : '?';
    }).join('');
    const r1 = readWith(a1), r2 = readWith(a2);
    const wrong = (r) => [...r].filter((ch, i) => ch !== '?' && ch !== target[i]).length;
    check('★★★教わったアトラスで別の数字を読んでも「誤った文字」は出ない',
      wrong(r1) === 0 && wrong(r2) === 0, `1本教え=${r1} / 2本教え=${r2}`);
    // ⚠⚠ **測って分かったこと（2026-08-19c）＝variants は多ければ良いわけではない**。
    //   同じ条件で撮った別の数字を足すと、**読める文字が 8 → 7 に減った**（誤りは 0 のまま）。
    //   ★理屈: `classify` は key ごとに variants の**最良**を採るので各 key の score は上がるが、
    //     **競合する key の score も上がる**＝1位と2位の差（margin）が縮み、「読めない」に倒れる。
    //   ∴ **効くのは「条件が違う variants」**（[16-9] の 54/90 → 88/90 は背景・塗りを散らした場合）。
    //     **同じ条件の水増しは逆効果になりうる**＝アトラスは闇雲に太らせない。
    check('⚠ 同じ条件で variants を足しても読める率は上がるとは限らない（誤りは増えない）',
      wrong(r2) === 0, `1本教え=${r1} / 2本教え=${r2}`);
    check('★1本教えただけでも大半は読める（残りは「読めない」に倒れる）',
      [...r1].filter((c) => c !== '?').length >= target.length - 2, `読み=${r1}`);
  }

  // ── [16-13] ★★★囲みが測定そのもの（探索は捨てた）─────────────────
  //   ⚠⚠⚠ **ここは3回作り直し、3回とも「機械が位置を当てる」方向で実機に外された**:
  //     ①谷で切る（背景で 10文字が 10/4/3 に化ける）②等間隔格子＋合致度の最大化
  //     （合成では完璧・**実画素では送り幅 73.5 の真値に対し 54〜68**）③明るさへ特徴量変更
  //     （**金グラデで字の下半分が消える**）。
  //   ★実画素で分かった決定的な事実＝**背景に数字と同じ明るさ・同じ色のキャラ絵がいる**＝
  //     **どんな画素特徴でも数字と背景は分離できない**。分離しているのは「そこに数字がある」と
  //     知っている**人**だけ。∴ **囲みを測定として受け取り、等分に置くだけにした**。
  //   ⭐ `rois.js` の採寸と同じ規律＝**位置は当てにいかず、人が測る**。
  {
    const cases = [
      { text: '5,044,101', w: 588 },      // 実切り抜きの実寸（2026-08-21 ユーザー提供）
      { text: '7,880,627', w: 590 },
      { text: '10,301,906', w: 898 },     // バーストストリーク＝表示が大きい
    ];
    for (const c of cases) {
      const chars = [...c.text];
      const nC = chars.filter((x) => x === ',').length, nW = chars.length - nC;
      const fit = G.fitTaughtGrid(null, { x: 0, y: 0, w: c.w, h: 100 }, c.text);
      const want = c.w / (nW + 0.5 * nC);
      check(`★★★「${c.text}」＝囲みの幅と文字列だけで送り幅が決まる（${want.toFixed(1)}px）`,
        fit.ok && Math.abs(fit.pitch - want) < 1e-9 && fit.boxes.length === chars.length,
        `送り幅 ${fit.pitch?.toFixed(2)} / 箱 ${fit.boxes.length}`);
      // 箱は隙間なく並び、全体で囲みをちょうど覆う
      const last = fit.boxes[fit.boxes.length - 1];
      check(`  箱が隙間なく並び、囲みをちょうど覆う`,
        Math.abs(last.x + last.w - c.w) < 1e-6
        && fit.boxes.every((b, i) => i === 0 || Math.abs(b.x - (fit.boxes[i - 1].x + fit.boxes[i - 1].w)) < 1e-9),
        `右端 ${(last.x + last.w).toFixed(2)} / 囲み ${c.w}`);
    }
    // ★カンマは数字より狭い（実測 0.5）＝**フォント定数**であって推定値ではない
    const f2 = G.fitTaughtGrid(null, { x: 0, y: 0, w: 800, h: 100 }, '1,234');
    const digitW = f2.boxes[0].w, commaW = f2.boxes[1].w;
    check('★カンマの送り幅は数字の 0.5 倍（実切り抜きに格子を重ねて目視で確定）',
      Math.abs(commaW / digitW - 0.5) < 1e-9, `${commaW.toFixed(1)} / ${digitW.toFixed(1)}`);
    // ⚠⚠ **囲みが測定そのもの**＝囲みが 10% 広ければ送り幅も 10% 広くなる。
    //   これは欠陥ではなく契約。**だから画面は必ず箱を描いて人に見せる**。
    const tight = G.fitTaughtGrid(null, { x: 0, y: 0, w: 588, h: 100 }, '5,044,101');
    const loose = G.fitTaughtGrid(null, { x: 0, y: 0, w: 647, h: 100 }, '5,044,101');
    check('⚠ 囲みが 10% 広ければ送り幅も 10% 広くなる（＝囲みが測定・人が見て直す）',
      Math.abs(loose.pitch / tight.pitch - 1.1) < 0.01,
      `${tight.pitch.toFixed(1)} → ${loose.pitch.toFixed(1)}`);
    // ★グリフ画素のマスク（白い縁取り ∪ 金の芯）＝金グラデの上下どちらでも拾えること
    const im = makeImage(6, 3, [60, 30, 90]);
    fillRect(im, 0, 0, 1, 1, [245, 243, 236]);   // 白い縁取り
    fillRect(im, 1, 0, 1, 1, [235, 188, 82]);    // 金（明るい側）
    fillRect(im, 2, 0, 1, 1, [150, 118, 52]);    // 金（暗い側＝グラデの下）
    const m = G.glyphMask(im);
    check('★★白い縁取りも、金グラデの明るい側も暗い側も、同じく「字」と判定する',
      m.mag[0] === 1 && m.mag[1] === 1 && m.mag[2] === 1 && m.mag[3] === 0,
      `[${m.mag[0]},${m.mag[1]},${m.mag[2]},${m.mag[3]}]`);
  }

  // ── [16-13b] ★★教えた回の要約は純関数（画面に直書きしない）──────────
  //   ⚠⚠ **ここを `main.js` に直書きしていて出荷事故**（2026-08-21）＝探索を捨てて
  //     `fitTaughtGrid` から「合致度」を無くしたのに、画面側が `contrast.toFixed()` を呼び続け、
  //     **「この数字を教える」を押した瞬間に落ちた**。**319件は全部通っていた**
  //     （`main.js` は import できず、押した先の書式まで検査できていなかった）。
  //   ★∴ **書式を検査できる場所へ移す**＝本 Phase で繰り返し効いた規律。
  {
    const fit = G.fitTaughtGrid(null, { x: 0, y: 0, w: 588, h: 134 }, '5,044,101');
    const sum = G.teachSummary(fit, '5,044,101', 20);
    check('★教えた回の要約が数値と1行の文字列を返す',
      Math.abs(sum.pitch - 73.5) < 0.01 && sum.bandH === 134
      && /送り幅 73\.5px \/ 字高 134px \/ 比 1\.82/.test(sum.line), sum.line);
    check('★台帳に残す記録は比まで持つ（囲み方が揃っているかの検査に使う）',
      sum.record.ratio > 1.8 && sum.record.ratio < 1.83 && sum.record.text === '5,044,101',
      JSON.stringify(sum.record));
    // ★壊れた fit を渡しても**例外を投げない**（画面が落ちない）
    const bad = G.teachSummary({ pitch: 0, band: null, commaRatio: null }, '', null);
    check('★★値が欠けていても落ちず「—」を出す（画面を落とさない）',
      typeof bad.line === 'string' && bad.line.includes('—'), bad.line);
  }

  // ── [16-13c] ★★★照合はずらしを許す／カンマは覚えない（実画素で決めた2つ）──
  //   ⚠⚠ **実画素で判明**（2026-08-21）＝同じ字を別の切り抜きから採ると**横に 1〜3 格子ずれる**。
  //     ずらさずに重ねると**同字 0.35〜0.50 / 異字 0.70 で順序が逆転**していた。
  //     ★実測（実切り抜き3枚・数字12点の1枚抜き）＝**ずらし無し 正2/誤10 → ±2格子 正6/誤3**。
  //   ⚠ カンマは**セルの8割以上が背景**で、誤りの過半がカンマ絡みだった（`,→1` ×3 など）。
  //     ★**桁区切りは文法で決まる**ので形として覚えない＝**読めないものを無理に覚えない**。
  {
    const cell = G.GLYPH_DEFAULTS.cell;
    const base = new Float32Array(cell.w * cell.h);
    base[5 * cell.w + 4] = 1; base[5 * cell.w + 5] = 1;
    const moved = G.shiftSignature(base, 2, 1, cell);
    check('★署名を格子ぶんずらせる（外に出た分は 0）',
      moved[6 * cell.w + 6] === 1 && moved[6 * cell.w + 7] === 1 && moved[5 * cell.w + 4] === 0,
      '2格子右・1格子下へ動くこと');
    // ★ずれた標本でも、ずらし許容の照合なら正しい字を選ぶ
    const atlas = { cell, provenance: {}, glyphs: { A: [Array.from(base, (v) => v * 255)],
                                                    B: [Array.from(G.shiftSignature(base, 5, 0, cell), (v) => v * 255)] } };
    const sample = { cell, data: G.shiftSignature(base, 2, 0, cell) };
    check('★★★横に 2 格子ずれた標本でも正しい字を選ぶ（ずらし許容）',
      G.classify(sample, atlas).best.key === 'A', JSON.stringify(G.classify(sample, atlas).best));
    check('  ずらしを 0 にすると選べなくなる＝この許容が効いていることの裏取り',
      G.classify(sample, atlas, { shift: { x: 0, y: 0 } }).best.score
      < G.classify(sample, atlas).best.score);
    // ★カンマはアトラスの必須項目ではない（文法で決まる）
    const noComma = { cell, provenance: {}, glyphs: {} };
    // ⚠ 字ごとに違うテンプレートにする（同一だと「別ラベルで画素が同一」の関門に引っかかる）
    '0123456789'.split('').forEach((d, i) => {
      noComma.glyphs[d] = [Array.from(G.shiftSignature(base, i % 4, (i / 4) | 0, cell), (v) => v * 255)];
    });
    check('★★カンマが無くてもアトラスの関門は通る（桁区切りは文法で決まる）',
      G.validateAtlas(noComma).ok, JSON.stringify(G.validateAtlas(noComma).problems));
  }

  // ── [16-14] ★★アトラスは「保存できた」ではなく「自分を読めるか」で見る ──
  {
    const good = atlasFrom([{ bg: DARK }, { bg: MID }], '0123456789,');
    const gv = G.validateAtlas(good);
    check('★健全なアトラスは自己検査を通る', gv.ok, JSON.stringify(gv.problems));
    check('自己検査は1枚しか無い字を「検査できない」と数える（誤りに数えない）',
      G.selfCheckAtlas(atlasFrom([{ bg: DARK }], '0123456789,')).unchecked === 11,
      JSON.stringify(G.selfCheckAtlas(atlasFrom([{ bg: DARK }], '0123456789,'))));

    // ★★実機で起きた事故そのもの＝**同じ画素が別のラベルで2回入る**
    const dup = JSON.parse(JSON.stringify(good));
    dup.glyphs['7'] = [...dup.glyphs['7'], dup.glyphs['3'][0]];
    const dv = G.validateAtlas(dup);
    check('★★★別のラベルどうしで画素が同一なら関門で止まる（教え方の事故を捕まえる）',
      !dv.ok && dv.problems.some((p) => /画素が同一/.test(p)), JSON.stringify(dv.problems));

    // ★★もう1つの事故＝**歪んだテンプレートが混ざり、自分自身を読めない**
    const broken = JSON.parse(JSON.stringify(good));
    broken.glyphs['8'] = [...broken.glyphs['8'], broken.glyphs['0'][0].map((v) => Math.min(255, v + 3))];
    const bv = G.validateAtlas(broken);
    check('⚠ 自己読み（leave-one-out）は関門にしない＝**健全なアトラスも落とす**ので情報に留める',
      bv.ok === true && G.selfCheckAtlas(broken).wrong > 0,
      `ok=${bv.ok} / 自己読みの誤り ${G.selfCheckAtlas(broken).wrong}`);

    // ★★もう1つの関門＝**教えるたびの寸法が揃っているか**（フォントは固定＝送り幅と字高は一定）
    const mixed = JSON.parse(JSON.stringify(good));
    mixed.provenance.teachings = [{ at: 1, text: 'a', pitch: 100, bandH: 120 },
                                  { at: 2, text: 'b', pitch: 140, bandH: 121 }];
    check('★★★「字高/送り幅」の比が揃っていなければ関門で止まる（切り出しが安定していない）',
      !G.validateAtlas(mixed).ok
      && G.validateAtlas(mixed).problems.some((p) => /比が揃っていない/.test(p)),
      JSON.stringify(G.validateAtlas(mixed).problems).slice(0, 120));
    // ★★**大きさ自体は変わってよい**（実機は個別ヒットとバースト TOTAL で送り幅 72〜113px）
    const scaled = JSON.parse(JSON.stringify(good));
    scaled.provenance.teachings = [{ at: 1, text: 'a', pitch: 72, bandH: 104 },
                                   { at: 2, text: 'b', pitch: 113, bandH: 161 }];
    check('★大きさが 1.6倍違っても、比が揃っていれば通る（表示サイズは変わるもの）',
      G.validateAtlas(scaled).ok, JSON.stringify(G.validateAtlas(scaled).problems).slice(0, 120));

    // ★★★教示回ごとに抜いて読む＝アトラスの本当の品質指標
    const t1 = [{ ch: '1', sig: good.glyphs['1'][0], ti: 0 }, { ch: '2', sig: good.glyphs['2'][0], ti: 0 },
                { ch: '1', sig: good.glyphs['1'][1], ti: 1 }, { ch: '2', sig: good.glyphs['2'][1], ti: 1 }];
    const loto = G.leaveOneTeachingOut(t1, good.cell);
    check('★教示回を1つ抜いて残りで読む指標が出る（1枚抜きより厳しい＝実際の読み取りに近い）',
      loto.total === 4 && typeof loto.rate === 'number', JSON.stringify(loto));
  }

  // ── [16-10] ★アトラスが無いうちは読み取りを始めない（関門）─────
  {
    const v = G.validateAtlas(G.EMPTY_ATLAS);
    check('★★空のアトラスは関門で止まる（推測テンプレを同梱しない）',
      !v.ok && v.problems.some((p) => /1つも登録されていない/.test(p)), JSON.stringify(v.problems));
    const diag = new Diag('T1', 'test');
    G.reportHarvest(diag, { seen: 0, clusters: 0, overflow: 0, representatives: [] }, v);
    check('関門は診断コードで鳴る（T1-MATCH-006 / T1-MATCH-001）',
      diag.items.some((i) => i.code === 'T1-MATCH-006' && i.sev === 'ERROR')
      && diag.items.some((i) => i.code === 'T1-MATCH-001'),
      JSON.stringify(diag.items.map((i) => i.code)));
    const half = { ...atlas1, glyphs: { '0': atlas1.glyphs['0'], ',': atlas1.glyphs[','] } };
    check('★数字が欠けているアトラスも関門で止まる（部分的に読めてしまうのを防ぐ）',
      !G.validateAtlas(half).ok, JSON.stringify(G.validateAtlas(half).problems));
    check('provenance が無いアトラスは通さない（E1＝測定条件を併記する）',
      !G.validateAtlas({ cell: atlas1.cell, glyphs: atlas1.glyphs }).ok);
  }

  // ── [16-15] ★★★実データ回帰（合成ではなく**実機のグリフ**で照合器を固定する）────
  //   フィクスチャ＝`tools/fixtures/t1_glyph_atlas_M3-1.json`。
  //     由来: M3-1.mp4 の「この数字を教える」切り抜き **14枚**（ユーザー提供・2026-08-19〜21）から
  //           オフラインで再構築。**署名（数値グリッド）だけ**で画像は入っていない＝§10.3 に抵触しない。
  //   ⚠⚠ **本テストで唯一「実機のグリフを読めるか」を測る節**。[16-1〜14] は合成＝性質しか見ていない。
  //      本 Phase で合成が実機を裏切った型は 3 つあった（明るさ特徴／帯の推定／曖昧マージンの安全網）。
  //      ∴ 実データの数値をここに焼いて、**次の「改善」が実は劣化だったら落ちる**ようにする。
  //   ★閾値は「良い」ではなく「これ以上悪くしない」床。改善したら締め直す（E1＝測定条件を併記）。
  {
    const fx = JSON.parse(readFileSync(join(HERE, 'fixtures/t1_glyph_atlas_M3-1.json'), 'utf8'));
    const fv = G.validateAtlas(fx);
    check('★実データのアトラスが関門を通る（validateAtlas）', fv.ok, JSON.stringify(fv.problems));
    check('寸法が実装の既定と同じ（cell 16×26）＝フィクスチャと実装がずれたら気づく',
      fx.cell.w === G.GLYPH_DEFAULTS.cell.w && fx.cell.h === G.GLYPH_DEFAULTS.cell.h,
      `${JSON.stringify(fx.cell)} vs ${JSON.stringify(G.GLYPH_DEFAULTS.cell)}`);
    check('カンマは覚えていない（送り幅から位置で決める＝実画素で決めた方針）',
      !fx.glyphs[','] && Object.keys(fx.glyphs).length === 10,
      Object.keys(fx.glyphs).join(''));
    check('10字すべてに複数枚ある（1枚しかない字は照合が不安定）',
      Object.values(fx.glyphs).every((v) => v.length >= 6),
      JSON.stringify(Object.fromEntries(Object.entries(fx.glyphs).map(([k, v]) => [k, v.length]))));

    // ★★★本丸＝**教えた回ごと抜いて読む**（まだ見ていない表示を読むのに一番近い指標）
    const loto = G.leaveOneTeachingOut(fx.samples, fx.cell);
    check('標本数が台帳どおり（14回・101点）＝フィクスチャの取りこぼしを検出',
      loto.total === 101, JSON.stringify(loto));
    check('★★★実データの誤読が 6件以下（2026-08-22 の実測＝正80/曖昧15/誤6）',
      loto.wrong <= 6, JSON.stringify(loto));
    check('★★実データの正読が 80件以上（曖昧に逃がして誤りを減らす退化を防ぐ）',
      loto.correct >= 80, JSON.stringify(loto));
    // ⚠ 曖昧は**誤りではない**（読まずに人へ返す）が、増えすぎたら自動化にならない
    check('曖昧が 20件以下（「全部曖昧」にすれば誤読ゼロになってしまうのを防ぐ）',
      loto.ambiguous <= 20, JSON.stringify(loto));
  }

// ═══════════════════════════════════════════════════════════════
// [17] ★★★読み取り＋検算（Phase 9 P3-1b）
// ═══════════════════════════════════════════════════════════════
//   ★本節が守るもの＝**照合器の外に置いた安全網**。
//   ⚠⚠ 設計前提（P3-1 実測）＝**マージンは安全網にならない**（margin 0.04→誤8 / 0.12→誤8）。
//     ∴ 誤読を止めるのは `ambiguityMargin` ではなく**検算**＝ここが落ちたら止める側が無い。
{
  console.log('\n── [17] 読み取り＋検算（P3-1b）──');
  const V = await import('../src/transcribe/verify.js');

  // ── [17-1] 先頭ゼロは在りえない ────────────────────────────
  check('先頭が 0 の多桁は棄却する（`0,044,101` は表示として在りえない）',
    !V.checkNoLeadingZero('0,044,101').ok && !V.checkNoLeadingZero('05').ok);
  check('単独の `0` は棄却しない（在りうる形まで潰さない）', V.checkNoLeadingZero('0').ok);

  // ── [17-2] ★★値域は「シムの cap」ではなく構造から採る（C41 の再発防止）──
  //   ⚠⚠ `DMG.betaia_cap = 800,000` は**較正対象そのもの**で、実機1ヒットは 206〜247万。
  //     シムの cap を値域に使えば**正しい読みを片端から棄却する**（しかも「検算が通らない」顔で）。
  check('★★実機で観測された 2,470,000（シムの betaia_cap 80万を超える）を棄却しない＝C41 の再発防止',
    V.checkValueRange(2_470_000).ok, JSON.stringify(V.checkValueRange(2_470_000)));
  check('敵の全 HP 相当（9.8億）を超える値は棄却する＝桁を1つ多く読んだ疑い',
    !V.checkValueRange(1_200_000_000).ok);
  check('参考帯の外は**知らせるだけで棄却しない**（corpus は「在りうる値」を定義しない）',
    V.checkValueRange(120_000).ok && V.checkValueRange(120_000).unusual);

  // ── [17-3] 検算⑦の判定（合計が合うか・不足は取りこぼしか）────
  check('合計が一致すれば通る', V.checkTotal([600_000, 601_000], 1_201_000).ok);
  {
    const t = V.checkTotal([600_000, 601_000], 1_801_000);
    check('★不足が「1ヒットとして在りうる大きさ」なら取りこぼしを疑う',
      !t.ok && t.missingHitLikely && t.residual === 600_000, JSON.stringify(t));
    const u = V.checkTotal([600_000, 601_000], 1_201_002);
    check('★食い違いが小さすぎる（1ヒットに満たない）なら誤読を疑う',
      !u.ok && !u.missingHitLikely && u.residual === 2, JSON.stringify(u));
  }

  // ── [17-4] ★★検算⑦の本体＝残差から誤読を逆算して直す ────────
  //   ⚠ 全列挙（3^21）は成立しないので、**残差に一致する差し替えだけを直接引き当てる**。
  const tok = (key, alt) => ({ key, score: 0.6, accepted: true, ambiguous: false,
    candidates: [{ key, score: 0.6 }, ...(alt ? [{ key: alt, score: 0.55 }] : [])] });
  const rowOf = (read, alts = {}) => ({ tokens: [...read].map((c, i) => tok(c, alts[i])) });
  {
    // 真 5,044,101 ＋ 4,968,966 を、1文字目のあとの `0` を `8` と読み違えた状態から直す
    const rows = [rowOf('5844101', { 1: '0' }), rowOf('4968966')];
    const total = 5_044_101 + 4_968_966;
    const rec = V.reconcileWithTotal(rows, total);
    check('★★残差から誤読を1文字特定して直せる（候補の中に真値がある場合）',
      rec.ok && rec.solutions[0].rows[0].text === '5044101',
      JSON.stringify({ ok: rec.ok, got: rec.solutions[0]?.rows.map((r) => r.text) }));
  }
  {
    const rows = [rowOf('5044101'), rowOf('4968966')];
    const rec = V.reconcileWithTotal(rows, 5_044_101 + 4_968_966);
    check('合っている読みには手を触れない（残差 0 なら差し替え無しで通す）',
      rec.ok && rec.solutions[0].swaps.length === 0 && rec.baseline.residual === 0);
  }
  {
    // ★取りこぼし（ヒットが1つ足りない）は「直せない」と言う＝でっちあげない
    const rows = [rowOf('5044101')];
    const rec = V.reconcileWithTotal(rows, 5_044_101 + 4_968_966);
    check('★ヒットの取りこぼしは差し替えでは説明できない＝「直せない」と言う',
      !rec.ok && /説明できない|取りこぼし/.test(rec.reason), rec.reason);
  }

  // ── [17-5] ★★★打ち消し合いを「一意に直せた」と言わない（実データで見つけた事故）──
  //   実データの機構（`tools/t1_verify_probe.mjs` が観測）:
  //     真 4957011 + 5553703 ／ 読 4957711 + 5553005
  //     ＝ **+700 と −700 が打ち消し合い**、残差には残りの誤り（+2）しか出ない。
  //   ∴ 「残差 −2 を1文字で説明する」直し方が**一意に**見つかり、**合計は合うのに中身は誤ったまま**通る。
  //   ★★これを止めるのが「**採用より深く探す**」（`searchSwaps > acceptSwaps`）。
  {
    const rows = [rowOf('4957711', { 4: '0' }), rowOf('5553005', { 4: '7', 6: '3' })];
    const total = 4_957_011 + 5_553_703;
    const rec = V.reconcileWithTotal(rows, total);
    check('★★★打ち消し合った誤読を「一意に直せた」と言わない（合計だけ合う偽の訂正を出さない）',
      !rec.ok, JSON.stringify({ ok: rec.ok, reason: rec.reason,
        got: rec.solutions.map((s) => s.rows.map((r) => r.text).join('+')) }));
    const shallow = V.reconcileWithTotal(rows, total, { acceptSwaps: 1, searchSwaps: 1 });
    check('★★深く探さなければ、まさにその偽の訂正が通ってしまう（＝この関門が効いている証拠）',
      shallow.ok && shallow.solutions[0].rows.map((r) => r.text).join('+') !== '4957011+5553703',
      JSON.stringify({ ok: shallow.ok, got: shallow.solutions[0]?.rows.map((r) => r.text) }));
  }

  // ── [17-6] ラベルは**未登録なら検出しない**（数字と同じ関門）─────
  {
    const img = makeImage(200, 60, DARK);
    const edge = fieldOf(img);
    const d = G.detectLabels(edge, [{ from: 30, to: 50 }], { labels: {} });
    check('★ラベルのテンプレが無いうちは検出しない（推測テンプレで動かさない）',
      d.labels.length === 0 && /未登録/.test(d.reason ?? ''), d.reason);
  }

  // ── [17-7] ラベルを探す帯は「数値行の真上」（幾何・ユーザー確定情報）──
  {
    const b = G.labelBandAbove({ from: 100, to: 140 }, { w: 400, h: 300 });
    check('帯は数値行の**上**にあり、行に食い込まない', b.to <= 100 && b.from < b.to, JSON.stringify(b));
    const top = G.labelBandAbove({ from: 5, to: 45 }, { w: 400, h: 300 });
    check('ROI の上端でも負の座標を作らない', top.from >= 0 && top.to >= 0, JSON.stringify(top));
  }

  // ── [17-8] ★教えたラベルを、上の帯から見つけてマスク矩形にする（機構）──
  //   ⚠ **これは機構の検査であって「実機のラベルを読めるか」ではない**
  //     （本 Phase で合成が実機を裏切った型が3つ＝[16-15] の注記）。実データ確認は👤教示待ち。
  //   ⚠ ラベルの代役は**小さく描いた文字列**にする＝一様な塗り矩形は**内側にエッジが立たない**ので
  //     行の射影に山が出ず、候補にすら上がらない（実際に一度そう書いて落ちた）。実機のラベルは文字。
  {
    const img = makeImage(420, 120, DARK);
    drawText(img, 10, 70, '6,012,442');                    // 数値行
    drawText(img, 40, 30, '707', { s: 2 });                // ★ラベルの代役（小さい文字列）
    const edge = fieldOf(img);
    const lbox = { x: 40 - 2, y: 30 - 2, w: 2 * 8 * 2 + 5 * 2 + 4, h: 7 * 2 + 4 };
    const taught = G.teachLabel(edge, lbox, 'STING!');
    const atlasL = { labels: { 'STING!': { aspect: taught.aspect, variants: [taught.sig] } } };
    const rows = G.segmentRows(edge).rows.filter((r) => r.from > 60);
    const d = G.detectLabels(edge, rows, atlasL);
    check('★教えたラベルを、数値行の上の帯から見つける', d.labels.length === 1 && d.labels[0].key === 'STING!',
      JSON.stringify({ n: d.labels.length, best: d.labels[0]?.score?.toFixed(3), rows: rows.length }));
    check('見つけた位置は教えた位置の近く（当てずっぽうに拾っていない）',
      d.labels.length === 1 && Math.abs(d.labels[0].rect.x - lbox.x) <= 12
        && Math.abs(d.labels[0].rect.y - lbox.y) <= 12,
      JSON.stringify(d.labels[0]?.rect));
    check('★マスク用の矩形は教えた箱より**広い**（半透明の縁が数字側に残るため＝制約③）',
      d.occluders.length === 1 && d.occluders[0].w > d.labels[0].rect.w && d.occluders[0].h > d.labels[0].rect.h,
      JSON.stringify(d.occluders[0]));
  }

  // ── [17-10] ★実使用で届いた打ち間違いを弾く（`5,,553,703`）──────
  //   ⚠ **実際に届いた**（2026-08-23）。`/^[0-9,]+$/` は通ってしまうので文法検査が要る。
  //     弾かないと**囲みが誤った文字数で割られ**、ずれたテンプレートに正しいラベルが付く＝
  //     アトラスが静かに壊れる（`validateAtlas` は綴りの誤りまでは見ない）。
  {
    check('★カンマが連続した打ち間違いを弾く（実使用で届いた `5,,553,703`）',
      !G.checkCommaGrammar('5,,553,703').ok, JSON.stringify(G.checkCommaGrammar('5,,553,703')));
    check('正しい桁区切りは通す', G.checkCommaGrammar('5,553,703').ok);
  }

  // ── [17-11] ★ラベルは語まるごと1枚＝正準キーで持つ ────────────
  {
    check('ラベルの正準キーが3語（自由入力にしない＝綴り違いでアトラスが分裂しない）',
      G.LABEL_KEYS.length === 3 && G.LABEL_KEYS.includes('STING!') && G.LABEL_KEYS.includes('TOTAL'),
      G.LABEL_KEYS.join(' / '));
    const img = makeImage(200, 60, DARK);
    drawText(img, 20, 24, '707', { s: 2 });
    const edge = fieldOf(img);
    const e = G.teachLabel(edge, { x: 18, y: 22, w: 44, h: 18 }, 'STING!');
    check('教えたラベルは縦横比と囲み寸法を持つ（検出時の箱の形に使う）',
      e.key === 'STING!' && e.box.w === 44 && e.box.h === 18 && Math.abs(e.aspect - 44 / 18) < 1e-6,
      JSON.stringify({ aspect: e.aspect, box: e.box }));
    // ★書式は純関数側（`main.js` は import できず検査できない＝teachSummary で事故った型）
    const sum = G.labelTeachSummary(e, { ok: false, reason: '上の縁に字が載っている' });
    check('★要約は純関数で作る（画面に直書きしない）＝落ちずに警告も載る',
      /STING!/.test(sum.line) && sum.ok === false && /縁に字/.test(sum.warn ?? ''), JSON.stringify(sum));
    check('要約は空入力でも落ちない', !!G.labelTeachSummary(null).line);
  }

  // ── [17-13] ★★production 経路＝ラベル検出 → マスク → 読み取り（機構）──
  //   ⚠ **これは機構の検査**＝「マスクすると誤読が減る」は**実機では未測定**（`t1_scene_probe.mjs` が測る）。
  //     ここで見るのは「順序どおりに繋がっていて、マスク有無の**両方**を返すか」だけ。
  {
    const img = makeImage(460, 160, DARK);
    drawText(img, 20, 100, '6,012,442');                  // 数値行
    drawText(img, 60, 60, '707', { s: 2 });               // ★ラベルの代役（数値の真上）
    const edge = fieldOf(img);
    const lbox = { x: 58, y: 58, w: 2 * 8 * 2 + 5 * 2 + 4, h: 7 * 2 + 4 };
    const taught = G.teachLabel(edge, lbox, 'STING!');
    const atlasS = { ...atlas1, labels: { 'STING!': { aspect: taught.aspect, variants: [taught.sig] } } };

    const sc = G.readScene(edge, atlasS);
    check('★行の候補とラベルの両方が返る（順序＝ラベル検出 → マスク → 読み取り）',
      sc.rows.length >= 1 && sc.labels.length === 1 && sc.occluders.length === 1,
      JSON.stringify({ rows: sc.rows.length, labels: sc.labels.length, occ: sc.occluders.length }));
    check('★★マスク有無の**両方**を返す（片方だけだと「効いたか」を比べられない）',
      sc.readings.length >= 1 && sc.readings.every((r) => r.bare && r.masked),
      JSON.stringify(sc.readings.map((r) => ({ bare: !!r.bare, masked: !!r.masked }))));
    const numRow = sc.readings.find((r) => r.bare.number.ok || r.bare.tokens.length >= 9);
    check('数値行が読み取り対象として拾われている', !!numRow,
      JSON.stringify(sc.readings.map((r) => r.bare.tokens.map((t) => t.key).join(''))));
  }
  {
    // ★ラベルが未登録なら**マスク側は null**（＝「マスクした」と嘘をつかない）
    const img = makeImage(460, 160, DARK);
    drawText(img, 20, 100, '6,012,442');
    const sc = G.readScene(fieldOf(img), atlas1);
    check('★ラベル未登録のときはマスク側を返さない（比較対象が無いことを黙らせない）',
      sc.occluders.length === 0 && sc.readings.every((r) => r.masked === null) && /未登録/.test(sc.reason ?? ''),
      sc.reason);
  }

  // ── [17-12] ★★★実データ回帰＝ラベル3語（👤 2026-08-23 受領）──────
  //   ⚠⚠ **合成では「見分けられる」と言えない**（本 Phase で合成が実機を裏切った型が3つ）＝
  //     ここが**ラベルについて唯一の実機データの検査**。
  //   測定条件: `CRITICAL!` 303×99 ／ `TOTAL` 172×77 ／ `STING!` 175×69（M3-1.mp4・実切り抜き各1枚）。
  {
    const fx = JSON.parse(readFileSync(join(HERE, 'fixtures/t1_glyph_atlas_M3-1.json'), 'utf8'));
    const keys = Object.keys(fx.labels ?? {});
    check('★実データのラベルが3語とも入っている（CRITICAL! / STING! / TOTAL）',
      G.LABEL_KEYS.every((k) => keys.includes(k)), keys.join(' / '));
    check('`labels` は**語のテンプレ表**（旧形式＝数字キーの配列 ではない）',
      !Array.isArray(fx.labels) && typeof fx.labels === 'object');
    check('ラベルの格子が実装の既定と同じ（48×16）＝フィクスチャと実装がずれたら気づく',
      fx.provenance?.labelCell?.w === G.LABEL_DEFAULTS.cell.w
        && fx.provenance?.labelCell?.h === G.LABEL_DEFAULTS.cell.h,
      JSON.stringify(fx.provenance?.labelCell));

    // ★★互いに見分けられるか（実画素・**他者との差**が本体＝自己一致は同じ画素なので自明）
    const cell = G.LABEL_DEFAULTS.cell;
    const opts = { ...G.GLYPH_DEFAULTS, ...G.LABEL_DEFAULTS };
    let worstSelf = 1, bestCross = 0;
    for (const a of G.LABEL_KEYS) {
      const sample = G.templatesOf(fx.labels[a], cell)[0];
      for (const b of G.LABEL_KEYS) {
        const t = G.templatesOf(fx.labels[b], cell)[0];
        const sc = G.matchSignature(sample, t, opts).score;
        if (a === b) worstSelf = Math.min(worstSelf, sc); else bestCross = Math.max(bestCross, sc);
      }
    }
    check('★★★ラベルは実画素で明確に分かれる（自己 ≧0.9 / 他者 ≦0.5・2026-08-23 実測 0.999 vs 0.37）',
      worstSelf >= 0.9 && bestCross <= 0.5,
      `自己 min ${worstSelf.toFixed(3)} / 他者 max ${bestCross.toFixed(3)}`);
    check('★判定のしきい（LABEL_DEFAULTS.minScore）が自己と他者の**あいだ**にある',
      G.LABEL_DEFAULTS.minScore > bestCross && G.LABEL_DEFAULTS.minScore < worstSelf,
      `${bestCross.toFixed(3)} < ${G.LABEL_DEFAULTS.minScore} < ${worstSelf.toFixed(3)}`);
  }

  // ── [17-9] ★★★実データ回帰＝検算⑦が実際の誤読に効くか ────────
  //   ⚠ 実データ＝グリフの署名と誤読の起き方（101点・14回）。**束ね方と TOTAL はこちらで組み立てる**
  //     （k 枚を1押下と見なし TOTAL＝真値の和）＝答えるのは「同じ誤読に TOTAL を与えたら直るか」。
  //   測定条件: `tools/t1_verify_probe.mjs`（採用 ≤2 / 探索 ≤3・k=2,3 の**全束**）・2026-08-23。
  {
    const m = await import('./t1_verify_probe.mjs');
    const r = m.measure({ ks: [2, 3] });
    const k2 = r.results.find((x) => x.k === 2), k3 = r.results.find((x) => x.k === 3);
    check('元データが台帳どおり（14枚・101文字・完全に読めた 11枚）',
      r.base.crops === 14 && r.base.glyphs === 101 && r.base.cropsExact === 11, JSON.stringify(r.base));
    check('★★★偽の訂正が 0（TOTAL に一意一致したのに真値と違う＝静かに較正を汚す唯一の型）',
      k2.falseFix === 0 && k3.falseFix === 0, JSON.stringify({ k2: k2.falseFix, k3: k3.falseFix }));
    check('★★誤読を含む束を 100% 検出する（残差≠0 で人に知らせられる）',
      k2.detected === k2.dirty && k3.detected === k3.dirty && k2.silent === 0 && k3.silent === 0,
      JSON.stringify({ k2, k3 }));
    check('★訂正の歩留まりが落ちていない（k=2 で 6件以上を一意に直す＝2026-08-23 の実測）',
      k2.fixed >= 6, JSON.stringify({ fixed: k2.fixed, dirty: k2.dirty }));
  }
}
}
console.log('\n' + '='.repeat(60));
console.log(`結果: ${pass} passed / ${fail} failed`);
if (fail) {
  console.log('\n失敗:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('✅ T1 canvas 正規化 セルフテスト 全通過');
