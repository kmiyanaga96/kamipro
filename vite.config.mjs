// Vite 設定（Phase5 S5a・A案＝フルVite の足場）。
// ⚠ 本設定は VITE_MIGRATION.md を一次情報とする。次エージェントは着手前に必ず同ファイルを読むこと。
//
// S5a の狙い: モジュール分割はまだ行わず、現行の単一 index.html
//   （inline <script id="engine-code"> ＋ <script src="data/*.js">）を Vite 経由で
//   dev/build できる状態にする。ゴールデン値 175,023,298 は不変。
//
// ⚠ minify:false の理由（重要・S5e まで解除禁止）:
//   現行 Worker は _buildWorkerCode() が inline script の textContent を取得し、
//   「// ===== ゲーム定数」〜「// ===== UI HELPERS」の【コメントマーカー】で slice する。
//   minify するとコメントが除去されマーカーが消失 → Worker 構築失敗 → 探索フリーズ。
//   worker を ESM 化して slice を撤廃する S5e 完了後に minify を再有効化する。
import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';

export default defineConfig({
  root: '.',
  base: './',            // 相対パス出力（dist を任意パス/静的ホストで配信可能に）
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,       // S5a: slice worker のコメントマーカー保護。S5e 後に 'esbuild' へ。
  },
  plugins: [{
    // S5a 暫定ブリッジ: data/*.js は現状クラシック <script>（グローバル定義）で Vite がバンドルしない
    // （"can't be bundled without type=module" 警告）。S5b で ESM 化してバンドルするまで、
    // dist/data/ へ静的コピーして現行の実行時構成（inline script が data のグローバルを参照）を保つ。
    // ⚠ S5b 完了時にこのプラグインは撤去する（VITE_MIGRATION.md 参照）。
    name: 'copy-classic-data-scripts-s5a',
    closeBundle() { cpSync('data', 'dist/data', { recursive: true }); },
  }],
});
