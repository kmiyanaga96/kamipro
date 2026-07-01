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

> ⚠ **重要な再スコープ（2026-06-30 実測で確定）**: 当初想定の「S5b=data ESM化だけ」等の**細分は不可能**。
> **共有グローバル結合**のため、data/worker/UI のどれか一つを ESM 化すると芋づる式に全部必要になる。
> → **S5b〜S5f は「1つの協調 ESM 化コミット（core externalization）」として実施**する。
>
> **実測事実**:
> - `data/weapons.js`/`summons.js`/`enemies.js` の DMG/GEAR 参照は**全てコメント**＝純データ（`export` 追加のみ）。
> - `data/characters.js` のみ実コードで外部参照: `DMG,BG,GEAR,CHARS,ABIL,ownerOf,ELEM,LEADER,RENRI_CAP,RENRI_MAX,TENYA_FROM,IFISHANT_MIN_CD,LABEL`。ただし**全て関数本体内＝遅延参照**（ロード順不変条件が保証）＝ESM循環でもTDZに当たらず安全。
> - HTMLのインラインハンドラ（**window 公開必須**）: `runSim,clearSim,cancelSim,toggleCard,toggleReplayPanel,runReplay,saveTokenAndInit,loadSlotById,overwriteSlotById,deleteSlotById,saveNewSlot,syncSlots`。
> - Worker init は `CURRENT_SUBS = …` を**再代入**する→ESM import 束縛には代入不可。`export function setCurrentSubs(v)` を用意して worker から呼ぶ。他（`GEAR[k]=`/`DMG.x=`/`GEAR_K_C[k]=`）はプロパティ変更でESM importでも合法。

### 推奨実施形（coarse-first：まず粗く外部化して slice-worker を撤廃）
細粒度 constants/state/sim 分割は**後回し**（純内部リファクタ・低リスク）。まず:
1. `data/*.js` を ESM 化: weapons/summons/enemies は末尾に `export {…}` 追加のみ。characters は先頭に
   `import { DMG,BG,GEAR,CHARS,ABIL,ownerOf,ELEM,LEADER,RENRI_CAP,RENRI_MAX,TENYA_FROM,IFISHANT_MIN_CD,LABEL } from '../src/app.js';`
   ＋末尾 `export { CHAR_REGISTRY, DEBUFF_KEYS, buffCount };`。
2. `src/app.js` = 現 inline script（ゲーム定数〜INIT）を `sed -n '310,〜p'` で丸ごと移設。編集:
   先頭で data を import／末尾で worker・characters・test・window が要る記号を `export`／
   UI関数を `Object.assign(window,{…})`／最終 INIT を `if(typeof document!=='undefined')` でガード／
   `_buildWorkerCode` を削除／runSim の worker 生成を
   `new Worker(new URL('./worker.js',import.meta.url),{type:'module'})` に変更／`setCurrentSubs` を export。
3. `src/worker.js` = 現 worker entry(self.onmessage・progress postMessage 込み) を移植。
   `import { buildFormation,recalcGearK,_runRootPlan,_runBaselinePlan,GEAR,DMG,GEAR_K_C,setCurrentSubs } from './app.js';`
4. `index.html` = data classic scripts＋inline engine-code を削除し `<script type="module" src="/src/app.js"></script>`。
5. `vite.config.mjs` = copy プラグイン削除・`minify` 有効化（slice 撤廃後）。
6. **後日（低リスク・純内部）**: `app.js` を `constants.js`/`state.js`/`sim.js`/`ui.js` に内部分割（下記「目標構成」へ）。

### 循環importの安全性（確認済みの理屈）
`app.js` ⇄ `data/characters.js` は相互 import になるが、
- characters.js の**トップレベルは外部記号を触らない**（`gmax:100` 等リテラルのみ）。
- app.js の**トップレベルも `CHAR_REGISTRY` を触らない**（`buildFormation` は INIT/runSim のみ・`recalcGearK()` の top-level 呼びは DMG/GEAR のみ）。
∴ 双方トップレベル評価が外部束縛に触れず TDZ 回避＝循環は安全に解決。

### 検証（この協調ステップの受入ゲート）
- **新 golden（ハーネス移行 R6）**: `node test/golden.mjs`（`import {Sim,buildFormation} from '../src/app.js'`）＝175,023,298/FB10。
  ※旧 slice ワンライナーは data ESM化で無効（`export` により eval 不可）＝**同時置換必須**。CLAUDE.md 検証方法も更新。
- **built dist（Chromium）**: ページ内 golden＝175,023,298・実 runSim（ESM worker）動作・console/pageエラー無し・**UIボタン反応**（window公開確認）。
- **Worker 再現**: ESM worker が init→root→baseline＝175,023,298。

### 目標 `src/` 構成（最終形・後日の内部分割で到達）
```
src/constants.js  // 葉(import無し): BG/DMG/GEAR/GEAR_BOXES/各種上限
src/state.js      // 可変クロス状態の唯一の所有者: CHARS/ABIL/CHAR_DEF/ABIL_KEYS/GEAR_K…＋buildFormation/applyGear/recalcGearK
src/data/{characters,weapons,summons,enemies}.js
src/sim.js  src/worker.js  src/{replay,ui,main}.js
index.html        // 薄いシェル
```

### 中核リスクと鉄則
- **R1 可変グローバル → ESM live binding**: 再代入は所有モジュール内でのみ。読み手は live binding を import して**読むだけ**。
- **R2 循環import**: 被参照を葉へ寄せ・フック内は遅延参照のみ・**トップレベル即時参照厳禁**（＝ロード順不変条件）。
- **純機械的移設**（ロジック・数値・タイブレーク順を変えない）。parity 確認まで巻き戻し可能に保つ。

### ⚠ 環境メモ（2026-06-30）
リモートコンテナがターン間で**ローカルブランチを過去commitへリセットする事象**を確認。
push 済みは origin に安全。**大きな未コミット変更は避け、緑になり次第 commit+push**すること。
リセット時は `git fetch && git reset --hard origin/<branch>` で復旧。

### S5e で必ずやる後始末（協調ステップに含める）
- `_buildWorkerCode`（slice＋`__FUNC__` serialize/deserialize）を**全廃**。
- `vite.config.mjs` の **`minify:false` を `'esbuild'` に戻す**。
- **copy プラグイン**（S5a 落とし穴2）撤去（data がバンドルされるため）。

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
