# sim02 — テトラHELIX後追撃の減衰上限の確定（C1）

- **主題**: C1（CALIBRATION_ANALYSIS.md）。テトラ4アビ(HELIX)発動後のバースト追撃のベース減衰上限を確定する。
- **状態**: **データ待ち**（C1特化フォーム用意済み）。実機値が `raw_data.txt` に埋まり次第、分析・実装に進む。

## 進め方（トークン・ハルシネーション・整理ミス回避の設計）
7ターン全分解はしない。C1 は「HELIX後追撃の1値」から減衰式で cap を逆算できる:
- **測定対象は HELIX後バーストの1ターン分のみ**。T1〜前段は「連理魔力がHELIX閾値に到達したか」の前提確認だけ。
- 逆算: `実ダメ = ベース上限×(1+U) + (naB×6.0 − ベース上限×(1+U)) × 0.04`。既知（実ダメ・naB・1+U）から未知（ベース上限）を解く。
- **転記と計算を分離**: 実機値は `raw_data.txt`/`replay_screenshots.md` に逐語、算術は `integrated_analysis.md` で式を明示。

## ファイル
| ファイル | 状態 |
|---|---|
| [raw_data.txt](raw_data.txt) | **C1特化記入フォーム**（ユーザーが数値を埋める） |
| [replay_screenshots.md](replay_screenshots.md) | リプレイ転記（データ受領後） |
| [design_report.md](design_report.md) | 設計レポート（必要なら設計担当が5節で作成） |
| [integrated_analysis.md](integrated_analysis.md) | 統合分析（データ受領後・実装担当） |

## 必要データ（raw_data.txt フォーム参照）
1. メタ：編成 / 装備（**アビ上限UP合計 1+U**）/ 初期契晶 / 敵HP
2. 前提：測定ターンT・テトラ連理魔力スタック数・HELIX発動YES/NO
3. 測定値：**テトラ後HELIX追撃の単体値** ＋ **テトラ通常攻撃1発(naB)**
4. （任意）序数A/B
