# Phase 4 シミュレーション試行ディレクトリ

Phase 4（実機較正の反復・押し順優先）は今後も繰り返し行うため、1試行=1サブフォルダで
データと分析を蓄積する。一次方針は [PHASE4_PLAN.md](../PHASE4_PLAN.md)、確定値は
[CALIBRATION_ANALYSIS.md](../CALIBRATION_ANALYSIS.md)、開発不変条件は [CLAUDE.md](../CLAUDE.md)。

## 命名規約
- 試行フォルダ: `simNN/`（ゼロ埋め2桁・連番）。例: `sim01`, `sim02`, …
- 新規試行は `TEMPLATE/` を `simNN/` へコピーして開始する。

```bash
cp -r simulation/TEMPLATE simulation/sim02   # 次の試行を開始
```

## 各試行フォルダの構成
| ファイル | 役割 | 書く人 |
|---|---|---|
| `raw_data.txt` | 実機の実測値（**加工しない原本**）。整形・解釈は禁止、measurement の真実を保全。 | ユーザー / 測定者 |
| `replay_screenshots.md` | リプレイモードのカード表示をテキスト転記（押し順・内訳・累計）。画像バイナリは保存しない。 | エージェント |
| `report_design.md` | 設計担当（Antigravity 等）の原因分析・実装申し送り（任意）。 | 設計担当 |
| `analysis.md` | 実装担当（Claude Code 等）の検証・較正案・回帰影響・結論。 | 実装担当 |
| `README.md` | その試行の1ページ要約（結論と次アクションへのインデックス）。 | エージェント |

## データ成型の原則（再利用性）
- **生データ（`raw_data.txt`）は不可侵**: 実機測定の原本。後から係数を変えても測定値は変わらないため verbatim 保全。
- **スクショは転記する**: 画像はリポジトリ肥大化と grep 不能のため保存しない。押し順・内訳・累計を
  `replay_screenshots.md` にテキスト化すると、diff・序数フィクスチャ化・他試行との比較が可能になる。
- **序数で語る**: 絶対値一致ではなく「ルートA vs B どちらが上か」の符号（PHASE4_PLAN §2）を主指標にする。

## ワークフロー（1試行の流れ）
1. `TEMPLATE/` をコピーして `simNN/` を作成。
2. 実機測定を `raw_data.txt` に貼り、リプレイ結果を `replay_screenshots.md` に転記。
3. （任意）設計担当が `report_design.md` で原因分析・実装申し送り。
4. 実装担当が `analysis.md` で検証 → 較正案 → **ゴールデン値（92,031,195）への影響を scratchpad で実測** → 結論。
5. 確定した較正は `DMG` / `CHAR_REGISTRY` の宣言的記述として実装し、`CALIBRATION_ANALYSIS.md` のバックログ（Cx）を更新。
6. `simNN/README.md` に結論を1ページ要約。

## 試行一覧
| 試行 | 形成 | 主題 | 結論 / 状態 |
|---|---|---|---|
| [sim01](sim01/README.md) | エジソン＋ヤマト/ヘカテー/テトラ/エレイン（vs 84M木人） | シム推奨 vs 実機勘の優劣＋バースト追撃減衰上限の較正（C5） | 分析完了・C5実装を推奨（[analysis](sim01/analysis.md)） |
