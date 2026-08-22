// T1 録画転記 — ★★ページの初期化スモークテスト（2026-08-18i 新設）
//
// ⚠⚠ **なぜ要るか（2回踏んだ）**:
//   ①2026-08-18c: `main.js` が 0 バイトで出荷され、**ボタンが全部効かなくなった**。
//   ②2026-08-18i: 再び「ボタンが効かない」の報告。
//   ★どちらも **190〜249 件のセルフテストが全部通っていた**。理由は、
//     `main.js` は DOM に触れるので **Node から import できず、唯一無検査だった**こと。
//   ①のあと [14] で「空でない・ESM として parse できる・id が index.html に在る」を検査したが、
//   ★**parse できることと、実行して初期化が通ることは別**＝
//     import の解決エラーや初期化中の例外は依然として素通りする。
//
// ∴ **最小の DOM スタブを置いて main.js を実際に読み込み**、
//   ①例外が出ないこと ②全ボタンにハンドラが付くこと ③初期化完了の合図が立つこと を確かめる。
//
// ⚠ 別プロセスで走らせる（globalThis を汚すため）。`npm run test:t1` から呼ばれる。

const ids = new Map();
const mkEl = (id) => {
  const el = {
    id, style: {}, dataset: {}, files: [], value: '', textContent: '', innerHTML: '',
    width: 0, height: 0, disabled: false, checked: false, duration: 0, currentTime: 0,
    videoWidth: 0, videoHeight: 0, _handlers: {}, _onclick: null,
    addEventListener(t, f) { (this._handlers[t] ??= []).push(f); },
    removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    querySelector: () => mkEl('q'), querySelectorAll: () => [],
    appendChild() {}, remove() {}, click() {}, focus() {},
    play() { return Promise.resolve(); }, pause() {}, load() {}, toBlob(cb) { cb({}); },
    getContext: () => ({
      drawImage() {}, clearRect() {}, strokeRect() {}, fillRect() {}, fillText() {},
      getImageData: () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
      putImageData() {}, save() {}, restore() {}, beginPath() {}, stroke() {},
      measureText: () => ({ width: 1 }),
    }),
  };
  Object.defineProperty(el, 'onclick', { get() { return this._onclick; }, set(v) { this._onclick = v; } });
  return el;
};
globalThis.document = {
  getElementById: (id) => { if (!ids.has(id)) ids.set(id, mkEl(id)); return ids.get(id); },
  createElement: (tag) => mkEl('<' + tag + '>'),
  addEventListener() {}, body: mkEl('body'),
};
globalThis.window = {
  addEventListener() {}, devicePixelRatio: 1,
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
};
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async () => {} } }, configurable: true,
});
globalThis.alert = () => {};

const out = [];
let ok = true;
try {
  await import(new URL('../src/transcribe/main.js', import.meta.url).href);
  out.push('INIT_OK');
} catch (e) {
  ok = false;
  out.push('INIT_FAIL ' + String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '));
}
if (ok) {
  // ★★ボタンの一覧は **index.html から採る**（ハードコードだと新しいボタンが素通りする）。
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../transcribe/index.html', import.meta.url), 'utf8');
  const buttons = [...html.matchAll(/<button[^>]*id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
  const dead = buttons.filter((b) => {
    const e = ids.get(b);
    return !e || (!e._onclick && !(e._handlers.click && e._handlers.click.length));
  });
  out.push(dead.length ? 'DEAD_BUTTONS ' + dead.join(',') : 'BUTTONS_OK');
  out.push(globalThis.window.__t1Ready === true ? 'READY_OK' : 'READY_MISSING');
  out.push('VERSION ' + (globalThis.window.__t1Version ?? '?'));

  // ★★★**実際に全部押す**（2026-08-19c 追加）。
  //   ⚠⚠ **ここが無くて事故った**: `rois` の宣言をリファクタで消してしまい、
  //     「このフレームを解析」を押した瞬間に `ReferenceError: rois is not defined`。
  //     **294 件のセルフテストは全部通っていた**＝初期化は通り、ハンドラも付いていたから。
  //   ★**ハンドラが付いていることと、押して動くことは別**（[14]→[15] で1度学んだのと同じ形）。
  //   ⚠ 動画も canvas 実体も無いスタブなので、多くのハンドラは早期 return する。
  //     それでよい＝**押した経路で未定義参照や構文的な壊れが出ないこと**を見るための検査。
  const errs = [];
  for (const b of buttons) {
    const e = ids.get(b);
    const fns = [e?._onclick, ...(e?._handlers?.click ?? [])].filter(Boolean);
    for (const fn of fns) {
      try {
        const r = fn.call(e, { preventDefault() {}, stopPropagation() {}, clientX: 1, clientY: 1, button: 0 });
        if (r && typeof r.catch === 'function') r.catch((err) => errs.push(`${b}: ${err}`));
      } catch (err) {
        errs.push(`${b}: ${err}`);
      }
    }
  }
  await new Promise((r) => setTimeout(r, 50));   // 非同期ハンドラの reject を拾う
  out.push(errs.length ? 'CLICK_ERRORS ' + errs.join(' ｜ ') : 'CLICKS_OK');
}
console.log(out.join('\n'));
process.exit(ok ? 0 : 1);
