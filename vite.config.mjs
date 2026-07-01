// Vite 設定（Phase5 S5・A案＝フルVite / ESM モジュール構成）。
// ⚠ 本設定は VITE_MIGRATION.md を一次情報とする。次エージェントは着手前に必ず同ファイルを読むこと。
//
// S5b〜f 完了: index.html は薄いシェル（<script type="module" src="/src/app.js">）。
//   エンジン＝src/app.js、Worker＝src/worker.js（new URL(...,import.meta.url)でVite自動バンドル）、
//   data/*.js は ESM。旧 slice+Blob worker（_buildWorkerCode）は撤廃済み。
//   → コメント slice 依存が無くなったため minify は既定(esbuild)で有効。data copy プラグインも不要。
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',            // 相対パス出力（dist を任意パス/静的ホストで配信可能に）
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // minify は既定(esbuild)で有効。
  },
});
