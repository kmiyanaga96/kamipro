# キャラ立ち絵（待機演出 B2 用）

C16 体感改善 B1 の「較正中にキャラが順に光る」演出で使うキャラ画像の格納先。
**画像を置くだけで名前バッジから立ち絵へ自動切替**（`_renderProgChars`・`src/app.js`）。
画像が無いキャラは名前バッジにフォールバックするので、部分的に用意しても壊れない。

## 規約
- **配置**: 本ディレクトリ `public/portraits/`（Vite が静的配信し `dist/portraits/` へコピー。参照は相対 `portraits/<key>.png`）。
- **ファイル名**: `<キャラkey>.png`（`data/characters.js` の `CHAR_REGISTRY` のキー・小文字そのまま）。
- **形式**: PNG・**透過背景**推奨（点灯グロー/丸枠が活きる）。WebP を使う場合は `src/app.js` の拡張子指定を合わせて変更。
- **サイズ**: 正方形 **240×240px 推奨**（表示は ~48–56px なので 2x〜3x で綺麗）。顔〜胸のバストアップ推奨。
- **容量**: 各 <100KB 目安。

## 現ロスターのファイル名
| key | ファイル名 | キャラ |
|---|---|---|
| edison | `edison.png` | エジソン（英霊） |
| yamato | `yamato.png` | [光醒の現神]ヤマトタケル |
| hecate | `hecate.png` | [愛情と友情]ヘカテー |
| tetra | `tetra.png` | [HELIX]テトラ |
| elaine | `elaine.png` | エレイン[契晶] |
| napoleon | `napoleon.png` | ナポレオン |
| freyja_christmas | `freyja_christmas.png` | [聖夜の約束]フレイヤ |
| artemis | `artemis.png` | アルテミス[神想真化] |

新キャラ追加時は `CHAR_REGISTRY` のキーに合わせて `<key>.png` を追加するだけ。
