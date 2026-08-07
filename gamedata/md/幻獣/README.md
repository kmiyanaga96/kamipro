# 幻獣 — 一次情報

幻獣の実機詳細・スロット区分別効果（メイン/サポート/サブ・加護＝weapon_amp 等）の根拠を保全する置き場。**source of record**。

- **現在値（シムが読む唯一の正）**: `gamedata/js/summons.js` の `SUMMON_REGISTRY`。
- 幻獣システムの拡張方針は [ROADMAP.md](../../../ROADMAP.md)（Phase 6）を参照。
- md は**根拠**、js は**現在値**。値の変更履歴は git で追う（別途の履歴 md は作らない）。

## 登録済み
| md | 幻獣名 | registry キー | シムへの効き方 |
|---|---|---|---|
| [`haggith`](haggith.md) | ハギト（守護天使） | `shugo` | メイン=加護 `weapon_amp:0.40`（スキル「ルミナ/シャイン/レイ/セイクリッド」効果量40%UP）。召喚攻撃は未モデル化 |
| [`rasiel`](rasiel.md) | ラジエル（160幻獣） | `rasiel` | **メイン=属性値枠 +1.60**（光属性攻撃160%UP）／**サブ=+0.50・条件付き**（サブ幻獣が全て光属性のとき）。召喚攻撃は未モデル化 |
| [`caesar_god_dragoon`](caesar_god_dragoon.md) | カイザーゴッドドラグーン（カイザー） | `caesar_god_dragoon` | **常時効果なし**（メイン=回復力／サブ=防御＝いずれも与ダメ無関与）。**採用理由は ATK/HP の高さ**＝効果目的ではない（ユーザー 2026-07-31）。⚠ATK寄与はUIの手動合計入力 |
| [`catas`](catas.md) | カタス | `catas` | **メイン/サポート=加護 `weapon_amp:0.50` ＋ 攻撃枠 `box:{assault:1.0}`**。★**configC（sim05 の較正編成）はメイン・サポートともにカタス**＝加護 1.0・assault +2.00（ユーザー申告 2026-08-07・台帳 GEAR の逆算で裏取り済＝catas.md §2.3）。⚠ **§1 一次情報が未受領**＝registry の値に根拠が無い（`atk`/`hp` は placeholder） |

> `SUMMON_REGISTRY` にはこのほか `oni`（鬼）が登録済み（対応する一次情報 md は未作成）。

## 未対応の機構
- **召喚攻撃（`onSummon`）は全幻獣で未実装**（ROADMAP Phase 6）。シムは召喚を発動しないため、召喚時のダメージ・バフは一切乗らない。
  実装時は各 md §2 を必ず更新すること。
- **⚠ 加護（`weapon_amp`）は全ウェポンスキルに一律適用している**（`applyGear`）。しかし一次情報では
  効果量UPの**対象スキルが限定される**ことがある（ハギト＝「ルミナ/シャイン/レイ/セイクリッド」限定）。
  ＝**モデルの既知の簡略化**。起票済＝[CALIBRATION_ANALYSIS.md](../../../CALIBRATION_ANALYSIS.md) **C50**。
- **registry の `atk`/`hp` はダメージ計算に使われない**（表示攻撃力への幻獣寄与はUIの手動合計入力 `summonAtkTotal`）。
  ATK/HP 目的で採用する幻獣（例: カイザーゴッドドラグーン）は、**UI側の合計値に含めて入力する**必要がある。
- **条件付き効果**は `condition` で宣言的に表現する（現在の対応キー: `{allSubSummonsElem:'<elem>'}`）。判定は `src/app.js` の `applyGear`。

---

## 更新履歴

<!-- 直近5件のみ（それ以前は git log）。「波及確認」列が本体＝git が持たない情報はここだけ。 -->

| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-07 | **`catas.md` を新設して登録済み表に追加**（configC はメイン・サポートともにカタス＝ユーザー申告）／「未対応の機構」に**加護の一律適用（C50）**を追記 | **数値の変更は無い**（台帳 GEAR に既に畳み込み済＝逆算と E2 bit 一致で確認。検算は `catas.md` §2.3）。⚠ **catas.md §1 は未受領**＝registry の `weapon_amp:0.50`/`assault:1.0`/`atk:0`/`hp:0` に一次情報の裏づけがまだ無い |
| 2026-08-05 | 末尾ブロックを新設（DOC_RELATION_PLAN S4・種別=規定） | 参照関係は `npm run doc:check` がグリーン |

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 1）

- [workspace/HANDOFF.md](../../../workspace/HANDOFF.md)
<!-- doc_refs:end -->
