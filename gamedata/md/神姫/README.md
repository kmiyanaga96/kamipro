# 神姫（プレイアブルキャラ）— 一次情報

神姫（キャラ）の実機詳細・スキル仕様・較正根拠を保全する置き場。**source of record**。

- **現在値（シムが読む唯一の正）**: `gamedata/js/characters.js` の `CHAR_REGISTRY`。
- md は**根拠**、js は**現在値**。値の変更履歴は git で追う（別途の履歴 md は作らない）。
- キャラ登録較正の運用は [REPO_STANDARDS.md](../../../REPO_STANDARDS.md)・[CHARACTER_ANALYSIS.md](../../../CHARACTER_ANALYSIS.md) を参照。

## 登録済み
| md | キャラ | registry キー | 備考 |
|---|---|---|---|
| [`yamato`](yamato.md) | ヤマトタケル | `yamato` | |
| [`hecate`](hecate.md) | ヘカテー | `hecate` | ムーンコード（C18） |
| [`tetra`](tetra.md) | テトラ | `tetra` | ジャッジメント3フェーズ（C23） |
| [`elaine`](elaine.md) | エレイン | `elaine` | |
| [`arianrhod`](arianrhod.md) | アリアンロッド[健美端麗] | `arianrhod` | §3 に A0〜A9 の登録較正記録 |
| [`artemis`](artemis.md) | アルテミス[神想真化] | `artemis` | AnotherLink（サブ枠アシスト） |
| [`freyja`](freyja.md) | フレイヤ[聖夜の約束] | `freyja_christmas` | サブ枠アシスト（ストリーク） |
| [`metatron`](metatron.md) | メタトロン[神想真化] | `metatron` | **2026-07-31 登録**。**アルテミスと並べて“サブ運用”が前提**＝意味を持つのは AnotherLink（`subAssists`）のみで**アビリティ実装は凍結**。★**A7（AnotherLink の重複規則）が最優先の要実機**。HP依存機構は `反逆` 編成のものでスコープ外（§3.4） |

> 英霊（エジソン／ナポレオン）は [`../英霊/`](../英霊/) 配下。

## 様式
各 md は **§1 一次情報（Claude Code 編集不可・原文ママ）** / **§2 シムデータ（Claude Code 編集可）** の2部構成。
登録較正を伴うキャラは **§3 登録較正記録** に Ax（要検証項目）を起票する（ROADMAP §5 手順②）。
⚠ **一次情報にありシム未モデル化の項目は §2 に「未モデル化」と明記してよいが、実装したら必ず §2 を更新すること**（CLAUDE.md §1）。
