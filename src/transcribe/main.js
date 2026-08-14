// T1 録画転記ページの配線（PHASE9_PLAN.md §10.1＝ブラウザで動く・動画は PC から出ない）
//
// ⚠ シム本体（src/app.js）とは一切結線しない。共有するのは将来 src/sim.js を import する形だけ。
//    ∴ golden / 既存 UI に非干渉（§10.1 の配置決定）。
// ⚠ Claude はこの画面を見られない＝すべての結果は診断 JSON に落とす（§10.5）。

import { detectCanvas, roiToPixels, pixelsToRoi, reportDetection, DEFAULTS } from './canvas_detect.js';
import { Diag } from './diag.js';

const VERSION = '0.3.0';

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
const rois = {};         // 登録済み ROI（name → 正規化座標）

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

  drawOverlay();
  $('det').innerHTML = ok
    ? `<span class="ok">canvas 検出 OK</span> — box = `
      + `x:${det.box.x} y:${det.box.y} w:${det.box.w} h:${det.box.h} `
      + `/ アスペクト ${det.aspect.toFixed(3)} / 面積比 ${(det.areaRatio * 100).toFixed(1)}%`
    : `<span class="bad">canvas 検出 NG</span> — ${det.reason}`;

  finish(diag, {
    canvas: ok ? det.box : null,
    aspect: det.aspect ?? null,
    areaRatio: det.areaRatio ?? null,
    frameIntervals: walkStats,
    rois: Object.keys(rois).length ? rois : null,
  }, ok);
};

function finish(diag, result, completed = false) {
  lastDiag = diag.emit(result, completed);
  $('diag').value = JSON.stringify(lastDiag, null, 2);
  const s = lastDiag.summary;
  const cls = s.FATAL ? 'bad' : (s.ERROR || s.WARN) ? 'warn' : 'ok';
  $('line').innerHTML = `<span class="${cls}">${lastDiag.line}</span>`;
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
  const names = Object.keys(rois);
  $('roiTable').style.display = names.length ? '' : 'none';
  $('copyRois').disabled = !names.length;
  for (const n of names) {
    const r = rois[n];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="text-align:left"><b>${n}</b></td>`
      + ['x', 'y', 'w', 'h'].map(k => `<td>${r[k].toFixed(5)}</td>`).join('')
      + `<td><button class="btn sec" data-del="${n}" style="padding:2px 8px">削除</button></td>`;
    tb.appendChild(tr);
  }
  tb.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => { delete rois[b.dataset.del]; renderRoiTable(); drawOverlay(); };
  });
}

$('addRoi').onclick = () => {
  if (!lastRoi) return;
  rois[$('roiName').value] = lastRoi;
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
$('copyDiag').onclick = () => {
  if (lastDiag) navigator.clipboard.writeText(JSON.stringify(lastDiag, null, 2));
};

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
    const done = () => { clearTimeout(guard); video.pause(); resolve(); };
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
