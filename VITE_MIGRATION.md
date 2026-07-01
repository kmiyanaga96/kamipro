# VITE_MIGRATION.md — Vite移行アーキテクチャ記録（次エージェント向け一次情報）

> **このファイルは Phase 5 S5（Vite導入・A案）の唯一の作業記録・引継ぎ書である。**
> 次の Claude Code エージェントは **S5 に着手する前に必ず本ファイルを通読**すること。
> 計画の背景・リスク台帳は [PHASE5_PLAN.md](./PHASE5_PLAN.md) §6.2、火力モデル/エンジンの地図は [CLAUDE.md](./CLAUDE.md)。
> **不変ルール（S5全期間）**: ゴールデン値 **175,023,298 / FullBurst 10/10** を各サブステップで必ず維持。
> ロジックは**純機械的に移設**するだけ（アルゴリズム・数値・タイブレーク順を変えない）。

---

## 0. 現在地（ステータス）

| サブステップ | 内容 | 状態 |
|---|---|---|
| **S5a** | Vite足場（分割せず現 index.html をビルド可能に） | ✅ **完了（2026-06-30）** |
| S5b | `data/*.js` を ESM 化（export/import） | ⬜ 未着手 |
| S5c | `src/constants.js` + `src/state.js`（可変グローバル集約）抽出 | ⬜ 未着手 |
| S5d | `src/sim.js`（class Sim 等）抽出 | ⬜ 未着手 |
| S5e | `src/worker.js` へ移行し `_buildWorkerCode` 撤廃・**minify有効化** | ⬜ 未着手 |
| S5f | `src/replay.js`/`ui.js`/`main.js` 抽出・INIT配線 | ⬜ 未着手 |

**採用案**: A案（フルVite・bundler+build）。「ビルド不要・index.html直開き」原則は放棄済み
（将来 `vite-plugin-singlefile` で直開き性を回復する逃げ道は残る）。

---

## 1. いま何ができるか（コマンド）

```bash
npm install          # Vite 等 devDependencies を導入（node_modules は gitignore）
npm run dev          # Vite dev server（開発時）
npm run build        # dist/ を生成（現状 minify:false）
npm run preview      # dist/ を静的配信して確認
```

- **ビルド成果物 `dist/` は gitignore**（生成物はコミットしない）。
- **一次ソースは依然 `index.html`**（S5f 完了まで）。dist は index.html から生成される。

## 2. S5a で実際にやったこと（と、なぜ）

1. `package.json`（vite devDep＋dev/build/preview スクリプト）と `vite.config.mjs` を追加。
   - `package.json` に `"type":"module"` は**付けない**（`node -e` のゴールデン検証を CommonJS のまま保つため）。設定は `.mjs` で明示ESM。
2. `vite.config.mjs`:
   - `base: './'`（相対パス出力＝dist を任意パス/静的ホストで配信可）。
   - **`build.minify: false`**（⚠重要・後述の落とし穴1）。
   - **インライン copy プラグイン**で `data/*.js` を `dist/data/` へコピー（⚠落とし穴2）。
3. モジュール分割は**一切していない**。index.html は現行のまま（inline `<script id="engine-code">` ＋ classic `<script src="data/*.js">`）。

### S5a で判明した落とし穴（次段で解消する暫定ブリッジ）

- **落とし穴1: minify がコメントを消す → slice Worker が壊れる。**
  現行 Worker は `_buildWorkerCode()` が inline script の `textContent` を取得し
  **`// ===== ゲーム定数` 〜 `// ===== UI HELPERS` のコメントマーカーで `slice`** している。
  minify するとコメントが除去されマーカー消失 → Worker 構築失敗 → 探索フリーズ。
  → **`minify:false` で回避。S5e（worker を ESM 化し slice を撤廃）完了後に `minify:'esbuild'` へ戻す。**
- **落とし穴2: classic `<script src="data/*.js">` は Vite がバンドルしない。**
  build 時に `"can't be bundled without type=module"` 警告が出て、data ファイルが dist に出力されない
  （dist に index.html しか無い＝実行時に data 未ロードで壊れる）。
  → **暫定 copy プラグインで `dist/data/` へ静的コピー。S5b で data を ESM 化しバンドルしたら copy プラグインは撤去。**

## 3. 検証（S5a で通したゲート・以降も必須）

- **ソースのゴールデン（現行の一次検証・S5f まで有効）**: CLAUDE.md「検証方法」のワンライナー
  （`index.html` を slice eval）。S5a では index.html 不変のため当然パス。
- **built dist の実機検証（S5a で追加）**: Chromium(Playwright) で `dist/index.html` を開き
  (a) ページ内で `buildFormation('edison',['yamato','hecate','tetra','elaine'])`→`Sim`→10T の総ダメージ = **175,023,298 / FB10**、
  (b) 実 `runSim`（Blob worker 経路）が結果描画・エラー無し。→ **両方パス確認済み**。
  - 参考スクリプト: `scratchpad/dist_smoke.js`（file:// で dist を開きページ内 golden＋runSim）。
- **Worker 再現**: `document` 無しサンドボックスで slice エンジンの `init→root→baseline` = 175,023,298
  （S5e で worker を ESM 化するまでこの slice 経路が本番）。

## 4. これから（S5b〜S5f）の設計と順序

詳細は PHASE5_PLAN.md §6.2。要点のみ再掲（次段の指針）:

### 目標 `src/` 構成
```
src/constants.js  // 葉(import無し): BG/DMG/GEAR/GEAR_BOXES/各種上限
src/state.js      // 可変クロス状態の唯一の所有者: CHARS/ABIL/CHAR_DEF/ABIL_KEYS/GEAR_K…
                  //   ＋ミューテータ buildFormation/applyGear/recalcGearK。読み手は live binding を import のみ
src/data/{characters,weapons,summons,enemies}.js  // export const REGISTRY。フック内は constants/state を遅延参照
src/sim.js        // class Sim, cmpVec, enumerateRootPrefixes, _runRootPlan, _runBaselinePlan
src/worker.js     // Worker entry。new Worker(new URL('./worker.js',import.meta.url),{type:'module'})
src/{replay,ui,main}.js
index.html        // 薄いシェル: <script type="module" src="/src/main.js">
```

### 中核リスクと鉄則（S5c が最重要）
- **R1 可変グローバル → ESM live binding**: `buildFormation`/`applyGear` の**再代入は所有モジュール（state.js）内でのみ**行う。
  他モジュールは import した live binding を**読むだけ（再代入禁止）**。ESM のライブバインディングは
  所有側の再代入を読み手へ反映するので現行挙動を保てる。
- **R2 循環import**: `sim.js`↔`data/characters.js` は相互依存。被参照（`DMG/BG`=constants、`ownerOf/ABIL/CHARS`=state）を
  **葉側に寄せ**、フック内参照は**遅延（呼出時）**に限定（＝現行のロード順不変条件と同一規律）。
  **トップレベルでの即時参照は厳禁**（ReferenceError/循環死の原因）。
- **各サブステップの受入ゲート**: ①ソース golden（該当時）②built dist golden ③Worker 再現 ④ブラウザスモーク。
  1段ずつ・**純機械的移設**・parity 確認まで旧 index.html を残す＝いつでも巻き戻し可。

### S5e で必ずやる後始末
- `_buildWorkerCode`（slice＋`__FUNC__` serialize/deserialize）を**全廃**。
- `vite.config.mjs` の **`minify:false` を `'esbuild'` に戻す**（落とし穴1が解消するため）。
- **copy プラグイン**（落とし穴2）は S5b で data を ESM 化した時点で撤去。

### S5f 完了（Definition of Done）
- `npm run build`→`dist` 実機（Chromium）で探索動作・エラー無し。
- vitest（または Node-ESM）golden = 175,023,298 / FB10、Worker再現（built）= 175,023,298。
- `_buildWorkerCode` 全廃・`__FUNC__` serialize 消滅・minify 有効。
- CLAUDE.md /.agents/AGENTS.md の**単一ファイル前提の不変条件を更新**
  （Worker slice 不変条件は**削除**、ロード順→import graph 規律へ、検証方法を vitest へ差替）。本ファイルも最終更新。

## 5. ロールバック
S5 は作業ブランチ上で進行。各段は純機械的移設で、index.html を parity 確認まで一次ソースとして保持するため、
問題時はブランチを戻すか、該当サブステップのコミットを revert すれば単一ファイル構成へ即復帰できる。
`dist/` は生成物（gitignore）なので破棄して再ビルドすればよい。
