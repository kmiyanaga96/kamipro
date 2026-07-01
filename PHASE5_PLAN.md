# Phase 5 計画 — 探索UX刷新 ＆ 開発環境の近代化 (Vite導入・モジュール分割)

> Phase 4（C9）でビーム幅を BW32→128 に拡張し探索量が約4倍になった。装備の充実で探索コストはさらに増大しうる（C9で実証＝強ギアほど最適枝が深い）。本フェーズは**探索中のユーザー体験**を本格的に作り直し、「重い探索でも待てる／状況が分かる／中断できる」UIを整える。
>
> さらに、演算スピードの改善およびコード改修コストの劇的削減を目指し、これまでの「単一ファイル完結」の制約を解除し、**Viteによるビルドプロセスの導入と複数JSモジュールへのファイル分割（モジュール化）**を本フェーズの後半ステップとして同時実行する。
>
> 旧 Phase 5（敵行動・味方生存）は **Phase 6** にリネーム（ROADMAP §1）。

---

## 1. WASM (WebAssembly) の再検討と無期限凍結の再確認

過去に [PERF_NOTES.md](file:///c:/Users/Kanta%20Miyanaga/kamipro/archive/PERF_NOTES.md) §5 等で降格・却下された **WASM化** について、探索処理能力を極限まで引き上げるアプローチとして改めて技術的な再評価を行いました。

### 1.1 WASM化の技術的メリット
*   **演算スピードの圧倒的向上 (3〜10倍速化)**:
    JavaScript（V8エンジン）の動的なメモリ割り当てやGC（ガベージコレクション）によるオーバーヘッドを完全に排除できます。状態データ構造（Sim）を Linear Memory 上のフラットな固定長バッファとして扱い、クローン処理を極めて高速なメモリコピーとして実装できるため、ビーム幅128の探索でも瞬時に応答する爆速の探索エンジンが構築可能です。

### 1.2 凍結を維持する決定打 (リスク・運用コストのトレードオフ)
*   **仕様変更・較正ごとの莫大な改修・同期コスト**:
    WASMの性能をフルに引き出すには、`Sim` エンジン本体だけでなく、`data/characters.js` に含まれる大量のキャラクター固有アビリティフック（`onAbility`, `exec` 等）もすべて Rust/C++ に移植する必要があります。実機との乖離を較正するたびに Rust/C++ 側のコード変更とコンパイル・ビルドが必要になり、開発効率が著しく低下します。
*   **二重実装の不整合バグリスク**:
    もしエンジンをJS/WASMで二重実装（探索はWasm、表示や簡易検証はJSなど）する場合、ゴールデン値（`175,023,298`）の挙動完全保存を異なる言語間で恒常的に担保し続けることは、実質的に不可能に近い保守コストを要します。

**結論**: WASM化によるスピード向上メリットよりも、開発俊敏性や仕様較正コストにおけるデメリットが圧倒的に勝るため、**WASM化は「無期限凍結」を維持**します。

---

## 2. Vite導入による開発環境・アーキテクチャの刷新

WASMを凍結する代わりに、**「Viteによるビルドプロセスの導入とモジュール分割（複数ファイル化）」**を推進し、開発・保守の改修コストを劇的に引き下げます。

```mermaid
graph LR
    subgraph 現行 (index.html単一)
        A[index.html] -- "string.slice()抽出" --> B[Blob URL] --> C[Web Worker]
    end
    subgraph Vite導入後 (モジュール分割)
        D[src/main.js] --> E[src/sim/Sim.js]
        D --> F[src/data/characters.js]
        G[src/sim/worker.js] -- "ES Module import" --> E
        G --> F
    end
    style D fill:#f9f,stroke:#333,stroke-width:2px
    style G fill:#bbf,stroke:#333,stroke-width:2px
```

### 2.1 課題解決: スライス職人芸（`_buildWorkerCode`）の撤廃
*   **現状の課題**:
    単一HTMLファイル完結の制約を満たすため、メインスレッドのJSから `<script id="engine-code">` の `textContent` を取得し、`// ===== ゲーム定数` から `// ===== UI HELPERS` の間を文字列として `slice` で強引に切り出し、Blob URLに変換して Worker に食わせています。
    少しでもマーカーの位置がズレたり、切り出し領域内にUI依存コード（`document` 参照等）が混入したりすると、Worker が `ReferenceError` でクラッシュしてページが永久にフリーズするリスクと常に隣り合わせでした。
*   **Vite導入による解決**:
    シミュレーションのロジック、データ、Worker用のエントリポイントを完全にファイル分割（`src/` 配下へモジュール化）します。Worker 側は通常の ES Module として `import { Sim } from './Sim.js'` などと綺麗に読み込めるようになり、ビルド時に Vite/Rollup が最適化（Minify / バンドル）された単一の Worker ファイルを安全に出力します。

### 2.2 演算スピードと改修コストのトレードオフ
*   **演算スピードへの影響 (1〜5%程度)**:
    JavaScriptモジュールの解体と再結合は、ブラウザの V8 エンジンによる JIT 最適化やGCの発生効率を根本的に変えるわけではないため、純粋な演算速度自体の改善は微小です。
*   **改修コストの削減 (極めて大)**:
    ファイルが細かくクリーンに分割されるため、特定のキャラクターの挙動（`characters.js`）や評価関数（`BeamSearch.js`）を書き換える際の可読性が劇的に向上します。また、ビルド時に静的解析（TypeScriptの型アサーションや ESLint による検証）を挟むことが容易になるため、バグをリリース前に確実に検知できます。

---

## 3. 目標と非目標

*   **目標**: 
    1. 探索（runSim）実行中の待機画面を刷新し、(a) 進捗の可視化、(b) 残り時間の見通し、(c) 中断可能性、(d) 体感を保つ演出 を提供する。
    2. Viteによる複数ファイル構成の開発環境を構築し、Worker起動の安全性を飛躍的に高める。
*   **非目標**: 
    探索アルゴリズム・ビーム幅・火力モデル・ゴールデン値（`175,023,298`）には触れない。**挙動・数値は完全保存**。
    - ∴ 本フェーズの全コミットで検証ワンライナー（[CLAUDE.md](file:///c:/Users/Kanta%20Miyanaga/kamipro/CLAUDE.md) §検証方法）が **`175,023,298` 不変**であることをアサートする。

---

## 4. 現状（C10 起点）

*   **実行入口**: `runSim()`。Worker プールで `_selectRootPrefixes()` の各 prefix を `_runRootPlan(prefix, n)` に投げ並列実行。フォールバックは `_fallbackRunSim()`（非並列・メインスレッド）。
*   **待機UI**: `#sim-loading` ＝スピナー＋「最適押し順を計算中…」＋ `#spin-progress`。
*   **進捗の粒度**: **prefix（ルート）単位のみ**。各 `_runRootPlan` は 10ターンを一気に完遂して初めて結果を返すため、ターン単位の細かな進捗やETA、確定的プログレスバーを出すことができない。

---

## 5. スコープと設計方針

### 5.1 進捗モデル（粒度の引き上げ）
*   **総作業量の定義**: `総ステップ = 採用prefix本数 × ターン数(n)`（＝ルート×ターンのグリッド）。
*   **per-turn 進捗イベント**: `_runRootPlan` のターンループ（`for t…`）末でコールバック/postMessage を発火し、`{rootId, t}` を通知。
*   **Worker 経路**: `_runRootPlan` 内から `self.postMessage({type:'progress', rootId, t})` を送れるよう、**進捗通知をフック関数として注入**する。
*   **フォールバック経路**: 同じフック関数をメインスレッド版に渡し、`requestAnimationFrame` で UI 更新（同期ループでも描画されるよう yield する）。

### 5.2 UI コンポーネント（本格版）
1. **プログレスバー**: 総ステップに対する完了率（ルート×ターン）。
2. **ターン別インジケータ**: T1..Tn のチップ列。代表ルート（baseline/空prefix）の到達ターンをハイライト。
3. **経過/推定残時間**: ETA は「完了ステップ数あたりの平均所要 × 残ステップ」で算出。
4. **キャンセル**: 「中断」ボタン。Worker 経路は `worker.terminate()` でプール破棄。

---

## 6. 段階実装ステップ

### 6.1 前半：待機UXの刷新 ✅ **実装済み（2026-06-30・main反映）**
*   **S1（足場・低リスク）** ✅: 進捗フックの配管。`_runRootPlan`/`_runBaselinePlan` に副作用専用 `onTurn(t)`（省略時=戻り値不変）を追加、Worker entry が `postMessage({type:'progress',rootId,t})` を注入。本体に self/document 参照を置かず slice 不変条件を維持。
*   **S2（可視化）** ✅: プログレスバー＋ターン別チップ（代表ルート=baseline到達で done）＋経過/ETA を `#sim-loading` に追加。総ステップ=タスク数×n。
*   **S3（中断）** ✅: 「中断」ボタン＋`cancelSim()`（`_simCancelled`→プール破棄→clearSim復帰）。worker/フォールバックに遅延メッセージ無視ガード。
*   **S4（演出）** ✅: `role=progressbar`+`aria-valuenow`同期、バーのシマー演出、`aria-live`。
*   **検証**: golden=175,023,298 不変 / Worker再現 / インラインJS `node --check` / ブラウザ実機(Chromium)スモーク（進捗更新・結果描画・中断復帰・エラー無し）。

### 6.2 後半：開発環境のモジュール化刷新 (Vite導入) — **本設計（A案採用・2026-06-30）**

> **決定**: 3案（A=フルVite／B=素のESM無バンドラ／C=Vite+singlefile）から **A案（フルVite・bundler+build）を採用**（ユーザー決定 2026-06-30）。
> **原則転換**: 「外部ビルド不要・index.html直開き」を放棄し、開発は Vite dev server、配布は `vite build`→`dist/`（静的ホスト or `vite preview`）とする。
> 直開き性が将来必要になれば `vite-plugin-singlefile`（単一自己完結HTML出力）を後付けでき、逃げ道は残る（今回は非採用）。
> **非目標厳守**: 探索アルゴリズム・火力モデル・ゴールデン値（`175,023,298`）は不変。全 S5 サブステップで回帰アサート。

#### 6.2.1 目標モジュール構成（`src/`）
```
src/
  constants.js   // 葉モジュール(import無し): 定数 BG / DMG / GEAR / GEAR_BOXES / 各種上限
  state.js       // 可変クロス状態の唯一の所有者: CHARS/LEADER/ABIL/CHAR_DEF/ABIL_KEYS…と
                 //   ミューテータ buildFormation()/applyGear()/recalcGearK()。読み手は live binding を import のみ
  data/
    characters.js // export const CHAR_REGISTRY(フック内で constants/state を遅延参照)
    weapons.js  summons.js  enemies.js
  sim.js         // class Sim, cmpVec, enumerateRootPrefixes, _runRootPlan, _runBaselinePlan
  worker.js      // Worker entry: import {Sim,_runRootPlan…}。new Worker(new URL(...),{type:'module'})で起動
  replay.js  ui.js  main.js  // UI/INIT。DOM依存はここに隔離
index.html       // Viteエントリ(薄いシェル): <script type="module" src="/src/main.js">
vite.config.js  package.json
test/golden.test.js // vitest: src を import して 175,023,298 をアサート
```

#### 6.2.2 中核設計：可変グローバル → ESM live binding（R1/R2）
現行の「`buildFormation`/`applyGear` が module-level `let` を再代入し `Sim`/`_na`/フックがグローバル参照」を ESM へ写す要:
- **再代入は所有モジュール内のみ**: `CHARS/ABIL/CHAR_DEF/ABIL_KEYS/GEAR_K/GEAR_K_C…` は `state.js` が `export let` で所有し、`buildFormation`/`applyGear` も `state.js` に置く。他モジュールは **import した live binding を読むだけ（再代入禁止）**。ESMのライブバインディングは所有側の再代入を読み手へ反映するため現行の挙動を保てる。
- **循環importの回避/無害化**: `sim.js`↔`data/characters.js` の相互依存（simはCHAR_REGISTRY要／charactersはDMG/BG/ownerOf/ABIL要）は、参照される側（`DMG/BG`=constants、`ownerOf/ABIL/CHARS`=state）を**葉側に寄せ**、フック内参照は**遅延（呼出時）**に限定する（＝現行のロード順不変条件と同一規律）。トップレベル即時参照は厳禁。

#### 6.2.3 Worker移行（slice職人芸・関数serialize の撤廃）
- `_buildWorkerCode`（textContent slice＋`__FUNC__`serialize/deserialize）を**全廃**。`worker.js` が `Sim`/registry を通常 import。
- 起動は `new Worker(new URL('./worker.js', import.meta.url), {type:'module'})`。
- init で渡すのは**実行時設定のみ**（`GEAR`値/enemy/`GEAR_K_C`/`dmgBase`）。registry はモジュール共有のため**関数の受け渡し不要**＝serialize不整合リスクが消滅。

#### 6.2.4 段階サブステップ（各段で golden＋Worker再現＋ブラウザスモークを必須ゲート）
- **S5a**: Vite足場のみ。分割せず現 index.html を Vite 経由でビルド/起動でき golden が通ることを確認（ツールチェーン確立）。
- **S5b**: `data/*.js` を ESM 化（export/import）。
- **S5c**: `constants.js` + `state.js`（可変状態集約）抽出（R1/R2の要・最重要）。
- **S5d**: `sim.js` 抽出。
- **S5e**: `worker.js` へ移行し `_buildWorkerCode` 撤廃。
- **S5f**: `replay.js`/`ui.js`/`main.js` 抽出。INIT配線。
- 各段はブランチ上・**純機械的移設（ロジック改変ゼロ）**・parity確認まで旧 index.html を参照保持＝**いつでも中断/巻き戻し可能**。

#### 6.2.5 リスクと対策（本設計の要約）
| # | リスク | 対策 |
|---|---|---|
| R1 | 可変グローバル→ESM binding で stale/undefined | 可変状態＋ミューテータを `state.js` に集約、読み手は live binding import のみ。Sim が再代入後の状態を見るスモーク |
| R2 | 循環import（sim↔characters） | 被参照を葉(constants/state)へ寄せ、フック内は遅延参照のみ。トップレベル即時参照禁止 |
| R3 | golden ドリフト（移設で順序/タイブレーク変化） | 純機械的移設。移行前に vitest golden を整備し各段で実行。ABIL挿入順・`>`タイブレークを厳守 |
| R4 | Worker parity | worker再現テストを built `dist` で実行し init→root→baseline=175,023,298 |
| R5 | 直開き性喪失（原則転換） | A案の既定として受容（dist配布/preview）。必要時 singlefile プラグインで回復可 |
| R6 | 検証ワークフロー破壊（slice ワンライナー無効） | vitest/Node-ESM golden へ置換。移行中は旧slice併存（inline撤去まで） |
| R7 | コンテナ/proxy（npm install・dev serverポート） | dev server依存を避け `vite build`→静的dist を Playwright 検証（再現性） |
| R8 | 単一ファイル前提の不変条件（CLAUDE.md/AGENTS.md） | S5で更新: **Worker slice不変条件は削除**、load順→import graph規律へ、検証方法を vitest へ差替。Antigravity と同期 |

#### 6.2.6 完了条件（Definition of Done）
- `npm run build` で `dist/` 生成、`dist` 実機（Chromium）で探索が動作しエラー無し。
- vitest golden = **175,023,298 / FullBurst 10/10**、Worker再現（built）= 175,023,298。
- `_buildWorkerCode` 全廃・`__FUNC__` serialize 消滅。
- CLAUDE.md / .agents/AGENTS.md の該当不変条件・検証方法を更新済み。

---

## 7. 検証

*   **回帰**: 全段で検証ワンライナー＝175,023,298・FullBurst 10/10。
*   **Worker 再現**: `document` 無しサンドボックスで `init`→`root`→`baseline` が 175,023,298 を返すこと。
*   **手動UX確認**: 強ギア（exp12設定＝重い探索）で待機画面の進捗・ETA・中断が機能するかブラウザで実機確認。
