// T1 録画転記ページの配線（PHASE9_PLAN.md §10.1＝ブラウザで動く・動画は PC から出ない）
//
// ⚠ シム本体（src/app.js）とは一切結線しない。共有するのは将来 src/sim.js を import する形だけ。
//    ∴ golden / 既存 UI に非干渉（§10.1 の配置決定）。
// ⚠ Claude はこの画面を見られない＝すべての結果は診断 JSON に落とす（§10.5）。

import { detectCanvas, roiToPixels, pixelsToRoi, reportDetection, DEFAULTS } from './canvas_detect.js';
import { detectPanelMode, reportPanelMode, listSlotRects, PANEL_DEFAULTS,
         PanelModeSeries, reportPanelSeries, PANEL_DEBOUNCE_SECONDS } from './panel_mode.js';
import { roiSignature, FrameSelector, reportSelection, SELECT_DEFAULTS } from './frame_select.js';
import { goldenFractions, PopupProbe, reportProbe, PROBE_GRID } from './popup_probe.js';
import { analyzeHpBar, HpSeries, reportHp, HP_DEFAULTS } from './hp_bar.js';
import { LagProfile, EventDeduper, reportDedup, DEDUP_DEFAULTS } from './dedup.js';
import { ChargeDotTracker, ChargeSeries, reportChargeDots, CT_DEFAULTS } from './charge_dots.js';
import { ROIS } from './rois.js';
import { Diag } from './diag.js';
import { digest } from './digest.js';

const VERSION = '0.19.0';

const $ = (id) => document.getElementById(id);
const video = document.createElement('video');
video.muted = true;
video.playsInline = true;
// ⚠ requestVideoFrameCallback は「フレームが提示されたとき」に発火する。
//    DOM から切り離した video では提示が起きず発火しないブラウザがあるため、
//    画面外に配置して DOM に載せる（display:none は不可＝提示自体が止まる）。
video.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0.01;';
document.body.appendChild(video);

let lastBox = null;      // 検出された canvas 矩形（表示画素系）
let lastRoi = null;      // 直近にドラッグで採寸した正規化 ROI
let lastRect = null;     // 同上の画素矩形（PNG 切り出しに使う）
let lastDiag = null;     // 直近の診断 JSON
let walkStats = null;    // フレーム間隔の実測結果
let lastPanel = null;    // 右パネルのモード判定結果
const rois = {};         // 登録済み ROI（name → 正規化座標）
// ★★**起動時に `rois.js` の採寸済み ROI を読み込む**（2026-08-18）。
//   ⚠ これが無いと、**既に採寸済みの枠が画面に出ない**＝
//     ①重なりを目で確認できない ②採り直しの基準が見えない
//     ③どの名前を埋めればよいのか分からない、の3つが同時に起きる（実際に起きた）。
//   ★採寸は「白紙から始める作業」ではなく「**既にある定義を確認・更新する作業**」。
const roiOrigin = {};    // name → 'rois.js' | 'measured'（provenance＝どちらの由来か）
for (const [k, v] of Object.entries(ROIS)) {
  if (v) { rois[k] = { ...v }; roiOrigin[k] = 'rois.js'; }
}

// ── ファイル読み込み ────────────────────────────────────────
$('file').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  video.src = URL.createObjectURL(f);
  video.addEventListener('loadedmetadata', () => {
    $('meta').innerHTML = `<span class="kv">${f.name} / `
      + `${video.videoWidth}×${video.videoHeight} / ${video.duration.toFixed(3)}s</span>`;
    seek(parseFloat($('t').value) || 0);
  }, { once: true });
});

function seek(t) {
  if (!video.duration) return;
  video.currentTime = Math.max(0, Math.min(video.duration - 0.001, t));
  $('t').value = video.currentTime.toFixed(3);
}

$('prev').onclick = () => seek((parseFloat($('t').value) || 0) - 1 / 30);
$('next').onclick = () => seek((parseFloat($('t').value) || 0) + 1 / 30);
$('t').addEventListener('change', () => seek(parseFloat($('t').value) || 0));

// ── フレーム取得 → canvas 検出 ─────────────────────────────
$('grab').onclick = () => {
  if (!video.videoWidth) { alert('先に録画ファイルを開いてください'); return; }
  const diag = new Diag('T1', VERSION);
  diag.setInput({
    file: $('file').files?.[0]?.name ?? '(none)',
    resolution: `${video.videoWidth}x${video.videoHeight}`,
    duration: video.duration,
    at: video.currentTime,
  }).setConfig({ detect: DEFAULTS });

  diag.stage('DECODE', 0, 1);
  const view = $('view');
  view.width = video.videoWidth;
  view.height = video.videoHeight;
  const ctx = view.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0);

  let img;
  try {
    img = ctx.getImageData(0, 0, view.width, view.height);
  } catch (err) {
    diag.add('T1-DECODE-001', 'FATAL', {
      where: { at: video.currentTime },
      expected: 'フレームの画素取得',
      got: String(err),
      hint: 'ローカルファイル以外（別オリジンの動画）を読ませていないか確認する',
    });
    finish(diag, null);
    return;
  }

  diag.stage('ROI', 0, 1);
  const det = detectCanvas(img);
  const ok = reportDetection(diag, det);
  lastBox = ok ? det.box : null;
  diag.stage('ROI', ok ? 1 : 0, 1);   // 完了件数を反映（「0/1 完了」という矛盾表示を避ける）

  // ★右パネルのモード判定（list / detail）。
  //   同じ画面領域が2状態を行き来するため、ROI を解釈する前に必ず通す関門（PHASE9_PLAN §4 P2 ⑮）。
  let panel = null;
  if (ok) {
    panel = detectPanelMode(img, roiToPixels(det.box, ROIS.gauge));
    reportPanelMode(diag, panel);
    lastPanel = panel;
  }

  drawOverlay();
  $('det').innerHTML = ok
    ? `<span class="ok">canvas 検出 OK</span> — box = `
      + `x:${det.box.x} y:${det.box.y} w:${det.box.w} h:${det.box.h} `
      + `/ アスペクト ${det.aspect.toFixed(3)} / 面積比 ${(det.areaRatio * 100).toFixed(1)}%`
      + `<br>右パネル = <b>${panel.mode}</b>（周期スコア ${panel.score.toFixed(3)}`
      + `${panel.period ? ` / 周期 ${panel.period}px` : ''}）`
    : `<span class="bad">canvas 検出 NG</span> — ${det.reason}`;

  finish(diag, {
    canvas: ok ? det.box : null,
    aspect: det.aspect ?? null,
    areaRatio: det.areaRatio ?? null,
    panelMode: panel,
    frameIntervals: walkStats,
    rois: Object.keys(rois).length ? rois : null,
  }, ok);
};

function finish(diag, result, completed = false) {
  lastDiag = diag.emit(result, completed);
  // ★出力を2本に分ける（ユーザー指摘 2026-08-17＝完全な JSON を貼るとトークンが嵩む）:
  //   ①`diag` textarea … **digest（貼る用）**。意思決定に要る数値だけ
  //   ②ダウンロード … **完全な診断 JSON**（provenance・後から掘れる）
  $('diag').value = digest(lastDiag);
  const s = lastDiag.summary;
  const cls = s.FATAL ? 'bad' : (s.ERROR || s.WARN) ? 'warn' : 'ok';
  $('line').innerHTML = `<span class="${cls}">${lastDiag.line}</span>`;
}

/** 完全な診断 JSON をファイルへ落とす（版と時刻をファイル名に刻む＝走の取り違え防止）。 */
function downloadDiag() {
  if (!lastDiag) { alert('先に解析または走査を実行してください'); return; }
  const name = `t1-v${lastDiag.version}-${lastDiag.ranAt.replace(/[:.]/g, '-')}.json`;
  const blob = new Blob([JSON.stringify(lastDiag, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ── オーバーレイ（検出枠＋ドラッグ矩形） ────────────────────
let drag = null;
function drawOverlay() {
  const view = $('view'), ovl = $('ovl');
  const r = view.getBoundingClientRect();
  ovl.width = view.width; ovl.height = view.height;
  ovl.style.width = r.width + 'px'; ovl.style.height = r.height + 'px';
  const c = ovl.getContext('2d');
  c.clearRect(0, 0, ovl.width, ovl.height);
  if (lastBox) {
    c.strokeStyle = '#1aa179'; c.lineWidth = Math.max(2, view.width / 500);
    c.strokeRect(lastBox.x, lastBox.y, lastBox.w, lastBox.h);
  }
  // 登録済み ROI（正規化座標→画素）を薄く重ねる＝採寸のやり直しと確認がしやすい
  if (lastBox) {
    c.strokeStyle = '#5b6ef5'; c.lineWidth = Math.max(1, view.width / 900);
    c.font = `${Math.round(view.width / 90)}px sans-serif`;
    c.fillStyle = '#5b6ef5';
    for (const [name, r] of Object.entries(rois)) {
      const p = roiToPixels(lastBox, r);
      c.strokeRect(p.x, p.y, p.w, p.h);
      c.fillText(name, p.x + 4, p.y - 4);
    }
  }
  if (lastBox && lastPanel?.mode === 'list' && lastPanel.period) {
    const g = roiToPixels(lastBox, ROIS.gauge);
    c.strokeStyle = '#e08a00'; c.lineWidth = Math.max(1, view.width / 1200);
    for (const s of listSlotRects(g, lastPanel.period)) c.strokeRect(s.x, s.y, s.w, s.h);
  }
  if (drag && drag.rect) {
    c.strokeStyle = '#e0392b'; c.lineWidth = Math.max(2, view.width / 600);
    c.strokeRect(drag.rect.x, drag.rect.y, drag.rect.w, drag.rect.h);
  }
}
window.addEventListener('resize', drawOverlay);

function toImageXY(ev) {
  const view = $('view');
  const r = view.getBoundingClientRect();
  return {
    x: Math.round((ev.clientX - r.left) * (view.width / r.width)),
    y: Math.round((ev.clientY - r.top) * (view.height / r.height)),
  };
}

$('view').addEventListener('pointerdown', (ev) => {
  const p = toImageXY(ev);
  drag = { x0: p.x, y0: p.y, rect: null };
  $('view').setPointerCapture(ev.pointerId);
});
$('view').addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = toImageXY(ev);
  drag.rect = {
    x: Math.min(drag.x0, p.x), y: Math.min(drag.y0, p.y),
    w: Math.abs(p.x - drag.x0), h: Math.abs(p.y - drag.y0),
  };
  drawOverlay();
});
$('view').addEventListener('pointerup', () => {
  if (!drag?.rect || drag.rect.w < 3 || drag.rect.h < 3) { drag = null; return; }
  if (!lastBox) {
    $('roi').innerHTML = '<span class="bad">先に「このフレームを解析」で canvas を検出してください</span>';
    drag = null; return;
  }
  lastRoi = pixelsToRoi(lastBox, drag.rect);
  lastRect = drag.rect;
  const f = (v) => v.toFixed(5);
  $('roi').innerHTML = `正規化 ROI = <b>{ x: ${f(lastRoi.x)}, y: ${f(lastRoi.y)}, `
    + `w: ${f(lastRoi.w)}, h: ${f(lastRoi.h)} }</b>`
    + ` <span style="color:#6b7280">（画素 ${lastRect.x},${lastRect.y} ${lastRect.w}×${lastRect.h}）</span>`;
  $('addRoi').disabled = false;
  $('cropRoi').disabled = false;
  drag = null;
});

// ── ROI の登録・書き出し ────────────────────────────────────
function renderRoiTable() {
  const tb = $('roiTable').querySelector('tbody');
  tb.innerHTML = '';
  // ★**未採寸のスロットも行として出す**＝「あと何を測ればよいか」が画面で分かる。
  //   ⚠ 出さないと、名前を知っている人にしか採寸できない（＝私が口頭で伝えるしかない）。
  const names = [...new Set([...Object.keys(ROIS), ...Object.keys(rois)])];
  $('roiTable').style.display = names.length ? '' : 'none';
  $('copyRois').disabled = !Object.keys(rois).length;
  for (const n of names) {
    const r = rois[n];
    const tr = document.createElement('tr');
    if (!r) {
      tr.innerHTML = `<td style="text-align:left"><b>${n}</b></td>`
        + '<td colspan="4" style="opacity:.7">⏳ 未採寸 — この要素は走査で読めません</td><td></td>';
    } else {
      const tag = roiOrigin[n] === 'measured' ? '（今回採寸）' : '';
      tr.innerHTML = `<td style="text-align:left"><b>${n}</b><span class="note">${tag}</span></td>`
        + ['x', 'y', 'w', 'h'].map(k => `<td>${r[k].toFixed(5)}</td>`).join('')
        + `<td><button class="btn sec" data-del="${n}" style="padding:2px 8px">削除</button></td>`;
    }
    tb.appendChild(tr);
  }
  tb.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => {
      delete rois[b.dataset.del]; delete roiOrigin[b.dataset.del];
      renderRoiTable(); drawOverlay();
    };
  });
}

$('addRoi').onclick = () => {
  if (!lastRoi) return;
  const name = $('roiName').value;
  rois[name] = lastRoi;
  roiOrigin[name] = 'measured';      // ★今回測ったものか、ファイル由来かを分けて残す
  renderRoiTable();
  drawOverlay();
};

$('copyRois').onclick = () => {
  navigator.clipboard.writeText(JSON.stringify({
    measuredAt: new Date().toISOString(),
    source: {
      file: $('file').files?.[0]?.name ?? null,
      at: video.currentTime,
      resolution: `${video.videoWidth}x${video.videoHeight}`,
      canvas: lastBox,
    },
    rois,
    /** ★どれを今回測り、どれが `rois.js` 由来かを残す（E1＝測定条件を併記する）。 */
    origin: roiOrigin,
  }, null, 2));
};

// ★ROI クロップの PNG 保存（§10.3＝Claude へのデバッグ経路はフル画面ではなくこれ）
$('cropRoi').onclick = () => {
  if (!lastRect) return;
  const cv = document.createElement('canvas');
  cv.width = lastRect.w; cv.height = lastRect.h;
  cv.getContext('2d').drawImage($('view'), lastRect.x, lastRect.y, lastRect.w, lastRect.h,
    0, 0, lastRect.w, lastRect.h);
  cv.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `roi_${$('roiName').value}_${Math.round(video.currentTime * 1000)}ms.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
};
// ★コピーするのは **digest（貼る用）**。完全な JSON はダウンロードで受け取る。
$('copyDiag').onclick = () => {
  if (lastDiag) navigator.clipboard.writeText(digest(lastDiag));
};
$('saveDiag').onclick = downloadDiag;

// ── ★フレーム間隔の実測（P1 発見⑧ / VFR の飛び） ───────────
// requestVideoFrameCallback は「実際に表示されたフレーム」ごとに mediaTime を返す。
// ∴ ffprobe を使わずブラウザ内で間隔分布が取れる＝ユーザーの手数が減る。
$('walk').onclick = async () => {
  if (!video.videoWidth) { alert('先に録画ファイルを開いてください'); return; }
  if (!video.requestVideoFrameCallback) {
    $('walkNote').innerHTML = '<span class="bad">このブラウザは requestVideoFrameCallback 非対応です</span>';
    return;
  }
  $('walk').disabled = true;
  $('walkNote').textContent = '計測中…（動画を3秒ぶん再生します）';
  const times = [];
  const start = video.currentTime;
  let timedOut = false;
  await new Promise((resolve) => {
    // 保険: 再生が始まらない／rVFC が発火しない場合に固まらないようにする
    const guard = setTimeout(() => { timedOut = true; video.pause(); resolve(); }, 15000);
    // ⚠ 動画が要求秒数より短いと rVFC が発火しなくなり guard まで固まる＝終端を明示的に拾う
    const onEnded = () => done();
    const done = () => {
      clearTimeout(guard);
      video.removeEventListener('ended', onEnded);
      video.pause(); resolve();
    };
    video.addEventListener('ended', onEnded);
    const cb = (_now, meta) => {
      times.push(meta.mediaTime);
      if (meta.mediaTime - start >= 3 || times.length > 400) { done(); return; }
      video.requestVideoFrameCallback(cb);
    };
    video.requestVideoFrameCallback(cb);
    video.play().catch(() => done());
  });

  if (times.length < 2) {
    const diag = new Diag('T1', VERSION);
    diag.setInput({ file: $('file').files?.[0]?.name ?? '(none)', at: start }).stage('DECODE', 0, 0);
    diag.add('T1-DECODE-002', 'ERROR', {
      where: { at: start },
      expected: '3秒ぶんのフレーム提示（requestVideoFrameCallback）',
      got: `${times.length} フレームしか取れなかった${timedOut ? '（15秒でタイムアウト）' : ''}`,
      hint: 'タブが背景にあると再生が抑制される。タブを前面にして再実行する。',
    });
    finish(diag, { frameIntervals: null }, false);
    $('walkNote').innerHTML = '<span class="bad">計測できませんでした（診断JSONを参照）</span>';
    $('walk').disabled = false;
    return;
  }

  const d = [];
  for (let i = 1; i < times.length; i++) d.push(times[i] - times[i - 1]);
  d.sort((a, b) => a - b);
  const hist = new Map();
  for (const v of d) {
    const k = Math.round(v * 1000);            // ms 単位に丸めて分布を見る
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  walkStats = {
    frames: times.length,
    span: times.at(-1) - times[0],
    fps: (times.length - 1) / (times.at(-1) - times[0]),
    minMs: d.length ? d[0] * 1000 : null,
    maxMs: d.length ? d.at(-1) * 1000 : null,
    medianMs: d.length ? d[Math.floor(d.length / 2)] * 1000 : null,
    histogramMs: Object.fromEntries([...hist].sort((a, b) => a[0] - b[0])),
  };
  $('walkNote').innerHTML = `<span class="ok">${walkStats.frames} フレーム</span> / `
    + `実効 ${walkStats.fps.toFixed(3)} fps / `
    + `間隔 中央 ${walkStats.medianMs.toFixed(1)}ms・<b>最大 ${walkStats.maxMs.toFixed(1)}ms</b>`;

  // ★結果をその場で診断 JSON に落とす。
  //   （旧 v0.2.0 は「このフレームを解析」を押し直さないと JSON に載らず、取り逃しやすかった）
  const diag = new Diag('T1', VERSION);
  diag.setInput({
    file: $('file').files?.[0]?.name ?? '(none)',
    resolution: `${video.videoWidth}x${video.videoHeight}`,
    duration: video.duration,
    at: start,
  }).stage('DECODE', walkStats.frames, walkStats.frames);
  if (walkStats.maxMs > 100) {
    diag.add('T1-DECODE-003', 'WARN', {
      where: { at: start },
      expected: 'フレーム間隔 100ms 未満',
      got: `最大 ${walkStats.maxMs.toFixed(1)}ms`,
      hint: 'この長さのギャップがあるとポップアップを取りこぼしうる（PHASE9_PLAN §4 P1 発見⑧）',
    });
  }
  finish(diag, { frameIntervals: walkStats, rois: Object.keys(rois).length ? rois : null }, true);

  $('walk').disabled = false;
  seek(start);
};


// ── ★走の通し走査（P2-2 / P2-5 の土台） ────────────────────
//
// ⚠ **v0.7.0 までの再生ベース走査は2つの点で壊れていた**（2026-08-14・M3-1.mp4 で実測）:
//   ① **全フレームの約1/3しか見ていなかった**（実効 9.8〜10.6fps ／ 動画は 29.72fps）。
//      原因は再生ではなく、**1フレームあたりの処理が 33ms に間に合っていない**こと
//      （処理なしの間隔実測ループは 29.3fps 取れていた）。
//   ② **同じ入力で結果が変わる**（1275 vs 1174 フレーム＝7.9% 差）。
//      ∴ **受入基準 §9.1-3「同じ録画を2回処理したら同じ結果」に違反する**。
//
// ★対策: **再生ではなく seek で1フレームずつ歩く**。実時間より遅くなるが、
//   **全フレームを漏れなく・決定的に**踏む。intake は無人実行なので速度より再現性を採る。
// ★あわせて **ROI だけを小さい canvas へ描く**（フル 2288×1440 の getImageData は 3.3M 画素で重い）。

/** 指定時刻へ seek し、実際に提示されたフレームの mediaTime を返す。 */
function seekAndPresent(video, t) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (m) => { if (!settled) { settled = true; resolve(m); } };
    video.requestVideoFrameCallback((_now, meta) => finish(meta.mediaTime));
    // rVFC が発火しない環境向けの保険（currentTime で代用する）
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      setTimeout(() => finish(video.currentTime), 120);
    };
    video.addEventListener('seeked', onSeeked);
    try { video.currentTime = t; } catch { finish(null); }
  });
}

/**
 * ★決定的なフレーム走査。
 * 歩幅は「公称フレーム間隔の少し上」から始め、**進まなかったら広げる**
 * （VFR のスリップで次フレームが 50ms 先にいることがあるため）。
 */
async function walkFrames(video, startT, endT, onFrame, onProgress) {
  const nominal = 1 / 29.72;
  let step = nominal * 1.01;
  let t = startT, last = -1, n = 0, stalls = 0;
  while (t < endT && n < 20000) {
    const m = await seekAndPresent(video, t);
    if (m === null) break;
    if (m >= endT) break;
    if (m <= last) {                 // 進まなかった＝歩幅が足りない
      if (++stalls > 12) break;      // 動画終端などで永久に進まない場合の保険
      step *= 1.5;
      t = last + step;
      continue;
    }
    stalls = 0; step = nominal * 1.01;
    last = m;
    await onFrame(m);
    n++;
    if (n % 50 === 0) onProgress?.(n, m - startT);
    t = m + step;
  }
  return n;
}

$('scan').onclick = async () => {
  if (!video.videoWidth) { alert('先に録画ファイルを開いてください'); return; }
  const secs = Math.max(3, parseFloat($('scanSec').value) || 30);
  $('scan').disabled = true;

  const diag = new Diag('T1', VERSION);
  diag.setInput({
    file: $('file').files?.[0]?.name ?? '(none)',
    resolution: `${video.videoWidth}x${video.videoHeight}`,
    duration: video.duration,
    scanSeconds: secs,
    method: 'seek（決定的・全フレーム）',
  }).setConfig({ detect: DEFAULTS, select: SELECT_DEFAULTS, panel: PANEL_DEFAULTS, probe: PROBE_GRID,
                 dedup: DEDUP_DEFAULTS, hp: HP_DEFAULTS, ct: CT_DEFAULTS,
                 panelDebounceSeconds: PANEL_DEBOUNCE_SECONDS })
    .stage('DETECT', 0, 0);

  // canvas は先頭1フレームで確定させて使い回す（録画中にウィンドウは動かない）
  const full = document.createElement('canvas');
  full.width = video.videoWidth; full.height = video.videoHeight;
  const fctx = full.getContext('2d', { willReadFrequently: true });
  const start = video.currentTime;
  await seekAndPresent(video, start);
  fctx.drawImage(video, 0, 0);
  const det = detectCanvas(fctx.getImageData(0, 0, full.width, full.height));
  if (!reportDetection(diag, det)) { finish(diag, { canvas: null }, false); $('scan').disabled = false; return; }
  const box = det.box;
  const dmgRect = roiToPixels(box, ROIS.dmg);
  const gaugeRect = roiToPixels(box, ROIS.gauge);
  const hpRect = ROIS.hpbar ? roiToPixels(box, ROIS.hpbar) : null;
  // ★CT の入力 ROI。**`ct` が採寸されていればそれを使い、無ければ広い `hp` を探索する**。
  //   ⚠⚠ 2026-08-18 の方針転換（ユーザー提案）＝**どの行にあるかは人が採寸して与える**。
  //     幾何で「探す」機構は 2026-08-17 に偽陽性（バーの目盛りを CT と誤認）、
  //     2026-08-18 に偽陰性（探索上限 43px の外＝見えなかった）を1回ずつ出した。
  //     ★1分の採寸で確定することを、機械に当てさせようとしていたのが誤り（憲法＝観測はユーザー）。
  //   ∴ `ct` 採寸後は探索ではなく**読み取り**が仕事になる（個数を数える／塗り率を測る）。
  const ctSource = ROIS.ct ? 'ct' : (ROIS.hp ? 'hp' : null);
  const hpWideRect = ROIS.ct ? roiToPixels(box, ROIS.ct)
    : (ROIS.hp ? roiToPixels(box, ROIS.hp) : null);

  // ROI だけを切り出す小さい canvas（フル解像度の getImageData を毎フレームやらないため）
  const mk = (r) => { const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
    return { c, x: c.getContext('2d', { willReadFrequently: true }), r }; };
  const cutDmg = mk(dmgRect), cutGauge = mk(gaugeRect);
  const cutHp = hpRect ? mk(hpRect) : null;
  const cutHpWide = hpWideRect ? mk(hpWideRect) : null;
  const cut = (o) => {
    o.x.drawImage(video, o.r.x, o.r.y, o.r.w, o.r.h, 0, 0, o.r.w, o.r.h);
    return o.x.getImageData(0, 0, o.r.w, o.r.h);
  };
  const local = (r) => ({ x: 0, y: 0, w: r.w, h: r.h });   // 切り出し後は原点基準

  const sel = new FrameSelector();
  // ★P2-4: 持続性の実測（発見⑧）と、保証付きの間引き。選別（P2-2）とは独立に走らせる。
  const lag = new LagProfile();
  const dedup = new EventDeduper();
  const probe = new PopupProbe();
  const modes = { list: 0, detail: 0 };
  // ★P2-1b 追補: モード遷移は**除振してから使う**（3走で 18/14/12 とぶれた＝⑮に直撃）
  const panelSeries = new PanelModeSeries();
  const hpSeries = new HpSeries();
  // ★P2-5b: CT ドット。幾何は走全体から決めるので、ここでは中央帯プロファイルを溜めるだけ。
  const ctTracker = new ChargeDotTracker();
  let lastHp = null;
  // ★違反フレームの生プロファイルを持ち帰る（クロップを人に頼まずに原因を特定するため）
  const hpViolationSamples = [];
  let prevRatio = null;
  const t0 = performance.now();

  const total = await walkFrames(video, start, start + secs, async (m) => {
    const dImg = cut(cutDmg), gImg = cut(cutGauge);
    const dSig = roiSignature(dImg, local(dmgRect));
    sel.push(m, dSig);
    // ★CT は広い `hp` ROI で縦方向にも探す（hp_bar とは別の crop＝互いに非干渉）
    if (cutHpWide) ctTracker.push(+m.toFixed(4), cut(cutHpWide));
    lag.push(dSig);            // ★署名は1回だけ作って両方へ渡す（走査コストを増やさない）
    dedup.push(m, dSig);
    probe.push(goldenFractions(dImg, local(dmgRect)));
    const pm = detectPanelMode(gImg, local(gaugeRect));
    modes[pm.mode]++;
    panelSeries.push(m, pm.mode);

    // ★P2-5: HPバーの塗り率。単調減少するはずなので、それ自体が抽出の健全性検査になる。
    if (cutHp) {
      const hpImg = cut(cutHp);
      const hr = analyzeHpBar(hpImg);
      // ⚠ visible=false（演出フラッシュ）のときは fillRatio が null＝系列側で skip に計上される
      if (hr.ok) { hpSeries.push(+m.toFixed(4), hr.fillRatio, hr.cause); if (hr.visible) lastHp = hr; }
      if (!lastHp) lastHp = hr;

      // ★単調性違反が起きたフレームのプロファイルを保存する。
      //   「違反した」だけでは直せない。**そのフレームで画素が何を返したか**が要る（§10.5 の思想）。
      if (hr.ok && hr.visible && prevRatio != null
          && hr.fillRatio > prevRatio + 0.01 && hpViolationSamples.length < 4) {
        hpViolationSamples.push({
          t: +m.toFixed(4), from: +prevRatio.toFixed(4), to: +hr.fillRatio.toFixed(4),
          peak: hr.peak, leftMean: hr.leftMean, rightMean: hr.rightMean,
          redFraction: +hr.redFraction.toFixed(4),
          colProfile: hr.colProfile,
        });
      }
      if (hr.ok && hr.visible) prevRatio = hr.fillRatio;
    }
  }, (n, elapsed) => {
    $('scanNote').textContent = `走査中… ${n} フレーム / ${elapsed.toFixed(1)}秒ぶん`;
  });

  const wall = (performance.now() - t0) / 1000;
  const sum = sel.summary();
  const covered = sel.kept.length ? (sel.kept.at(-1).t - start) : 0;
  const sampledFps = covered > 0 ? total / covered : 0;

  diag.setInput({ scannedSeconds: +covered.toFixed(3), wallClockSeconds: +wall.toFixed(1) });
  diag.stage('DETECT', sum.keptFrames, sum.totalFrames);
  reportSelection(diag, sum);
  const lagReport = lag.report();
  const dedupSum = dedup.summary();
  reportDedup(diag, dedupSum, lagReport);
  const probeBest = reportProbe(diag, probe);
  const panelSum = panelSeries.summary();
  reportPanelSeries(diag, panelSum);
  const ctGeom = cutHpWide ? ctTracker.solveGeometry() : null;
  // ★どの ROI を見た結果なのかを必ず残す（provenance＝E1）。
  if (ctGeom) ctGeom.roi = ctSource;
  const ctSum = ctGeom ? new ChargeSeries().ingest(ctTracker.readSeries(ctGeom)).summary(covered) : null;
  if (cutHp) reportHp(diag, lastHp, hpSeries);
  if (cutHpWide) reportChargeDots(diag, ctGeom, ctSum);
  else diag.add('T1-ROI-004', 'ERROR', {
    where: { roi: 'hpbar' }, expected: '`ROIS.hpbar` が採寸済であること', got: '未採寸(null)',
    hint: 'T1 ページで hpbar をドラッグ登録し、rois.js に反映する',
  });

  // ★取りこぼしの検査（v0.7.0 の失敗を二度と黙って通さない）
  if (sampledFps < 29.72 * 0.9) {
    diag.add('T1-DETECT-005', 'ERROR', {
      where: { sampledFps: +sampledFps.toFixed(2), videoFps: 29.72 },
      expected: '動画のフレームレートとほぼ同じ実効サンプリング（取りこぼし無し）',
      got: `${sampledFps.toFixed(2)} fps＝全フレームの ${(sampledFps / 29.72 * 100).toFixed(0)}%`,
      hint: '歩幅か seek が失敗している。この値が低いと分布も採用率も信用できない。',
    });
  }

  $('scanNote').innerHTML = `<span class="${sampledFps >= 26 ? 'ok' : 'bad'}">`
    + `${total} フレーム / ${covered.toFixed(1)}秒 ＝ 実効 ${sampledFps.toFixed(1)} fps</span>`
    + ` / 実時間 ${wall.toFixed(0)}秒 / list ${modes.list}・detail ${modes.detail}`
    + ` / モード遷移 ${panelSum.stableTransitions} 回（生 ${panelSum.rawTransitions}）`
    // ★P2-4: 発見⑧の材料は走査のたびに目に入るようにする（stride を決める根拠）
    + ` / <b>寿命 L=${lagReport.lifetimeFrames ?? '決まらず'}</b>`
    + `（出来事 ${lagReport.eventContrast ?? '-'} / 凍結長 `
    + `${lagReport.freezeRuns?.map(r => r.p50).join('・') ?? '-'}）`
    + (hpSeries.summary()
      ? ` / <b>HP ${(hpSeries.summary().firstRatio * 100).toFixed(1)}% → `
        + `${(hpSeries.summary().lastRatio * 100).toFixed(1)}%</b>`
        + `（単調 ${hpSeries.summary().monotonic ? 'OK' : 'NG'}）`
      : '');

  finish(diag, {
    sampling: { frames: total, coveredSeconds: +covered.toFixed(3), sampledFps: +sampledFps.toFixed(3),
                wallClockSeconds: +wall.toFixed(1) },
    selection: sum,
    // ★P2-4: 発見⑧（ポップアップの寿命）の実測。**lags の p50 が立ち上がるラグが L の候補**。
    lagProfile: lagReport,
    dedup: dedupSum,
    // ★P2-5: HP 系列。monotonic が false なら抽出が壊れている（敵HPは戦闘中に増えない）。
    hp: hpSeries.summary(),
    hpProfileSample: lastHp?.colProfile ?? null,
    hpNormal: lastHp ? { peak: lastHp.peak, leftMean: lastHp.leftMean, rightMean: lastHp.rightMean,
                         redFraction: +lastHp.redFraction.toFixed(4) } : null,
    // ★違反フレームの生プロファイル（正常フレームと並べれば何が違うか分かる）
    hpViolationSamples,
    // ★P2-5b: CT ドット。**meanProfile が実物の見え方を答える生データ**（点灯判定は未較正）。
    ctGeometry: ctGeom,
    ctSeries: ctSum,
    popupProbe: { best: probeBest, all: probe.report() },
    keptSample: sel.kept.slice(0, 60),
    panelModes: modes,
    // ★除振後が本命。生（`rawSample`）も併記＝**何を落としたかが見えないと検証できない**
    panelSeries: panelSum,
    canvas: box,
  }, total > 0);

  $('scan').disabled = false;
  seek(start);
};
