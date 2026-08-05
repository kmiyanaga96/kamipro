# gamedata/md — 一次情報・基礎データ（md）

`gamedata/` は **md（根拠・一次情報）** と **js（シムが読む現在値）** に大別する。

- **`gamedata/js/`** … ランタイムが読む蒸留済みデータ（`characters.js` / `summons.js` / `weapons.js` / `enemies.js`）。**現在値の唯一の正**。
- **`gamedata/md/`** … 実機詳細・根拠・基礎データを保全する **source of record**。カテゴリ別サブフォルダで管理する。

## サブフォルダ
| フォルダ | 対象 | 対応する js（現在値） |
|---|---|---|
| [`神姫/`](神姫/) | 神姫（プレイアブルキャラ）の一次情報 | `gamedata/js/characters.js`（`CHAR_REGISTRY`） |
| [`英霊/`](英霊/) | 英霊武器の一次情報 | `gamedata/js/weapons.js`（`burstHeroExtra` 等） |
| [`幻獣/`](幻獣/) | 幻獣の一次情報 | `gamedata/js/summons.js`（`SUMMON_REGISTRY`） |
| [`敵/`](敵/) | 敵の実機詳細（intake） | `gamedata/js/enemies.js`（`ENEMY_REGISTRY`） |
| [`その他/`](その他/) | 上記に分類されない一次情報・基礎データ | — |

## 原則（md と js の分離）
- md は**根拠**、js は**現在値**。値の変更履歴は git で追う（別途の履歴 md は作らない）。
- ファイル追加・分類の判断は [REPO_STANDARDS.md](../../REPO_STANDARDS.md) の振り分け表に従う。

---

## 更新履歴

<!-- 直近5件のみ（それ以前は git log）。「波及確認」列が本体＝git が持たない情報はここだけ。 -->

| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-05 | 末尾ブロックを新設（DOC_RELATION_PLAN S4・種別=規定） | 参照関係は `npm run doc:check` がグリーン |

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 1）

- [CLAUDE.md](../../CLAUDE.md)
<!-- doc_refs:end -->
