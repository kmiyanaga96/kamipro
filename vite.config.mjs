// Vite 設定（Phase5 S5・A案＝フルVite / ESM モジュール構成）。
// ⚠ 本設定は VITE_MIGRATION.md を一次情報とする。次エージェントは着手前に必ず同ファイルを読むこと。
//
// S5b〜f 完了: index.html は薄いシェル（<script type="module" src="/src/app.js">）。
//   エンジン＝src/app.js、Worker＝src/worker.js（new URL(...,import.meta.url)でVite自動バンドル）、
//   gamedata/*.js は ESM。旧 slice+Blob worker（_buildWorkerCode）は撤廃済み。
//   → コメント slice 依存が無くなったため minify は既定(esbuild)で有効。data copy プラグインも不要。
//
// Phase 9 P2: マルチページ化。transcribe/index.html（T1 録画転記）を追加した。
//   ⚠ シム本体（index.html / src/app.js）とは独立したエントリで、結線しない（PHASE9_PLAN.md §10.1）。
//   ∴ golden と既存 UI に非干渉。
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: '.',
  base: './',            // 相対パス出力（dist を任意パス/静的ホストで配信可能に）
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // minify は既定(esbuild)で有効。
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        transcribe: resolve(process.cwd(), 'transcribe/index.html'),
      },
    },
  },
});
