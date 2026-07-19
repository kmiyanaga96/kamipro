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
