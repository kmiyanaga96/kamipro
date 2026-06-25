# AGENTS.md — エージェント共通の最低限ルール

このリポジトリで作業する全エージェント（Claude Code / Antigravity / その他）向けの共通エントリポイント。

> **一次情報は [CLAUDE.md](./CLAUDE.md)。** コード地図・確定仕様・開発フロー・実機較正は CLAUDE.md が常に正。
> 本書は「これを破るとアプリ全体が壊れる」ハード不変条件と検証ゲートだけを抜粋する（重複は最小限に保ち、
> 詳細・経緯は CLAUDE.md / `archive/*_PLAN.md` を参照）。

## 構成（30秒サマリ）
- `index.html`（UI＋エンジン）＋ `data/{weapons,summons,enemies,characters}.js`（外部DB）。外部ビルド不要・ブラウザ直動作。
- エンジンは `<script id="engine-code">` 内。並列探索は Web Worker プール（`_buildWorkerCode` がエンジン領域を抽出し Blob 化）。
- 唯一の編集先はキャラ＝`data/characters.js` の `CHAR_REGISTRY`。エンジン本体にキャラ名リテラルを書かない。

## ⚠ ハード不変条件（破るとUI全消失 or フリーズ）
1. **ロード順**: `data/*.js` は `BG`/`DMG`/`GEAR` より前に読まれる。オブジェクトリテラルの**即時評価フィールド**で
   `BG`/`DMG`/`GEAR` を参照しない（`ReferenceError`→`CHAR_REGISTRY` 未定義→**UI全消失**）。関数本体内の参照は遅延評価で安全。
2. **Workerコード抽出 slice**: `_buildWorkerCode` は `<script id="engine-code">` の **`textContent`** を取得し
   （`innerHTML` は `<`/`>`/`&` をHTMLエスケープし Worker 構文エラーになるため不可）、**必ず
   `// ===== ゲーム定数` 〜 `// ===== UI HELPERS` 直前へ slice** して Worker へ渡す。slice を外して全文を渡すと
   UI/INIT の `document` 参照が Worker 読込時に `ReferenceError` を投げ、`onerror`→メインスレッド同期フォールバックで
   **ページがフリーズ**する。Worker が使う関数（`recalcGearK`/`buildFormation`/`Sim`/`enumerateRootPrefixes`/
   `_runRootPlan`/`_runBaselinePlan` 等）は全て `UI HELPERS` マーカーより前＝エンジン領域内に置くこと。
3. **探索の走査順／タイブレーク（Phase3-1 事前計算マップ）**: `_stepStatic`/`_candidates` は `ABIL_KEYS`（=`ABIL` 挿入順）を
   1パス走査し、タイブレークは厳密 `>`（先頭最大）。走査順や比較を崩すと**最適押し順がズレる**。

## 検証ゲート（必須）
変更後は CLAUDE.md「検証方法」のワンライナーを実行し、基準形成 `edison + [yamato, hecate, tetra, elaine]` で
**FullBurst 10/10・TotalDmg 91,723,594** を確認する。Worker 周りを触った場合は `document` 無しサンドボックスで
`init`→`root`→`baseline` が 91,723,594 を返すか（scratchpad の worker 再現スクリプト）も併せて確認する。

## Git ワークフロー（要約・詳細は CLAUDE.md §3）
`main` を最新化 → 作業ブランチで開発 → 検証通過 → コミット → `main` へマージ（競合は自律解決）→ 再検証 → `git push origin main`。
