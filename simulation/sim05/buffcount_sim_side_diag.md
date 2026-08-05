# buffCount 過大の sim側分解 — 実機 tier 照合の前提（sim05 ①ブロッカー）

> **種別**: 分析（sim側 pre-calibration・実機trial前）
> **ゴール**: TODO① の「シム `buffCount` 過大＝閾値（pike15/consort20/roy6/11/16/factor10）がトリビアル到達で実質無効化」を、**どの buf キーが何個で膨らむか**まで数値分解し、実機 tier 挙動との照合（buffCount 差替 or 閾値再スケールの決定）を即実行できる状態にする。
> **完了条件**: 実機側の tier 実発動ターン（pike会心・consort2hit 等）が sim05 較正走で取得され、本書の sim側内訳と照合して buffCount 定義 or 閾値が確定・実装されたら archive/SESSION_LOG へ畳む。
> **状態**: sim側 確定（下表）／実機側 データ待ち（sim05 較正走ゲート）
> 作成 2026-07-27 ／ 関連: TODO① buffCount 項・sim05 README §4.1（ナポ押し順 cands.s）・`gamedata/js/characters.js`（`buffCount` 定義 L4・napoleon/arianrhod cands）

---

## 入力・方法

- **入力**: napoleon 編成（`buildFormation('napoleon', ['hecate','tetra','arianrhod','elaine'])`）を**静的greedy 10T**（golden napoleon/static と同経路）で走らせ、各ターン終了時の `sim.buf` を全キー分解。
- **buffCount 定義（現行 `characters.js` L4）**: `Σ v.length（DEBUFF_KEYS 除外）`。DEBUFF_KEYS = `consort_def / divinus_def / effond_def / nights / divinus_dot`。
- 診断スクリプトは scratchpad（再現可能・コミット対象外）。**コードは未改修**（修正は実機照合ゲート）。

## 結果: buffCount 推移と tier ゲート到達

| ターン | buffCount | 到達している tier ゲート |
|---|---|---|
| T1 | **34** | pike≥15 / consort≥20 / roy6・11・16 / factor10 — **全ゲート到達** |
| T2 | 66 | 全ゲート |
| T3 | 80 | 全ゲート |
| T4 | 97 | 全ゲート |
| T5 | 99 | 全ゲート |
| T6–T10 | 88–100 | 全ゲート |

**⇒ 全 tier ゲートが T1 から恒常的に到達＝閾値による押し順の分岐が完全に無効化されている**（TODO① の懸念「T2以降トリビアル到達」より更に早く、T1 から。pike の確実会心・consort の2hit・roy の最上位 tier・factor の全体CD-1 が初手から常時ON 扱い）。

## 膨張の主犯（"1効果の N スタック" であって "N個の別バフ" ではないもの）

buffCount を押し上げている上位キー（T1→ピーク）:

| buf キー | 個数 T1→ピーク | 正体 | tier が数えるべき「別バフ」か |
|---|---|---|---|
| `arian_bplus` | 12 → **41** | アリアン1アビ バーストダメージプラス+10万・味方光・5T累積（`burstPartyPassive` の flat 加算源） | ✗ ダメージ量アキュムレータ（1効果の累積スタック） |
| `legend` | 2 → **18** | エレイン legend アサルト累積 | ✗ 同上 |
| `puvoir` / `puvoir_acute` | 各 2 → **12** | cap-UP 累積（プヴワール）＋急所 | ✗ 同上 |
| `arian_bcap` | 4 → **11** | アリアン2アシ バースト上限+8%/stack・3T累積 | ✗ 同上 |
| `sleur_def` `mobius_spec` `effond_def`(債務) 他 | 各 数個 | 各種累積・DEBUFF | 一部は DEBUFF（既に除外） |

**単独で `arian_bplus` が buffCount の約4割**を占める。これらは「バフ効果が N 回スタックした内部表現」であり、ゲームの tier ゲートが数える「キャラに付いている**別種のバフ効果（アイコン）数**」（旺盛・防壁・会心・急所・攻撃UP…）とは意味が異なる公算が大きい ← TODO① 仮説（`arian_bplus` 44 等の内部スタック総和で過大）を数値で裏付け。

## 実機側で照合すべき点（sim05 較正走ゲート）

修正の方向（buffCount 定義差替 or 閾値再スケール）を決めるには、以下を実機で取得して本書と照合する:

1. **tier の実発動ターン**: pike の「確実会心」・consort の「2hit」・roy の最上位 tier・factor の「全体CD-1」が**実機で最初に発動するターン**。sim が全て T1 なら過大確定。
2. **実機のバフ数え方**: tier ゲート（15/20 等）は「別種バフ効果の数」か「スタック込みの総数」か。実機 UI のバフアイコン数と照合。
3. これを受けて **(a) buffCount を『別種バフ数』へ差替**（`arian_bplus`/`legend`/`puvoir` 等の累積系を1カウントに畳む）**か、(b) 閾値を sim の膨張スケールへ再スケール**かを決定 → `characters.js` の `buffCount` or 各 cands.s の閾値を修正 → golden napoleon/static 再fit。

**⚠ どちらもゲームの一次情報（tier の数え方）が正**。sim側は本書で確定済みなので、実機データ到着後は照合→実装のみ。

---

## 追記（2026-07-28）: ナポアビの「予測探索」要件と実装先の特定

> ユーザー提起（2026-07-28・意図の要約）: ナポのアビは精密な**予測探索**が要る。
> **1アビ(roy)**: 強化効果数に「階級」があるので、ターン中の強化効果数の予測が立てば**その階級に達した時点で即発動が最効率**（例: 予測8なら6で撃つ＝6〜10は効果不変、かつ後続の赤アビを最速でバフできる）。
> **2アビ(pike)**: ターン内に15を超えない予測なら**最速で打つのが最効率**（15を境に効果不変）。
> **3アビ(consort)**: **20を超え次第最速**で打てば防御デバフが後続の赤アビに貢献。
> **4アビ(factor)**: 強化効果数も関係するが、CD短縮という重要アビゆえ**別軸評価**。

### 判明1: ターン内の順序はすでに全探索されている（`s` は候補ゲートではない）

`_beamSearch`（src/sim.js）は各ステップで **`_candidates()` の全候補を展開**し（`s` による足切りをしない）、各枝を `clone→_finishStatic()→_objective()`＝**ターン完遂＋以降のロールアウトで実採点**し、上位 `BEAM_W=64` ＋ 多様性枠 `BEAM_DIVERSITY_K=24` を残す。∴「roy を bc=6 で撃つ枝」と「bc=10 で撃つ枝」は**両方が実際に試され、ダメージで比較されている**。

`cands.s` が効くのは **(a) `_stepStatic`＝ロールアウト方策**（各枝を採点する際に残りを埋める代理方策）と **(b) `_selectRootPrefixes`＝prefix 粗選抜**のみ。∴ **`s` は「枝を選ぶゲート」ではなく「枝を評価するための代理方策」**＝ここが歪むと探索が正しい枝を選べない。ユーザー提起のルールは `s`（＝ロールアウト方策の質）に入れる価値がある、という位置づけになる。

### 判明2: 現状 tier ロジックは死んでいる（宿儺config・実推奨順で実測）

`config_sukuna_v2.json`（現 `archive/caches/sim05_sukuna_v2.json`）の推奨順をリプレイし、各ターン開始時の buffCount を実測:

| ターン | 開始 bc | tier 到達 |
|---|---|---|
| T1 | 0 | 未到達（唯一まともなターン） |
| T2 | 25 | roy最上/pike15/consort20 **全到達** |
| T3–T10 | 47–92 | **全到達のまま** |

∴ T2 以降は `roy`=70 / `pike`=92 / `consort`=115 の**定数に張り付き**＝tier 切替が一度も起きない。**「6で撃つか10で撃つか」という判断がシムに存在しない**（常に最上位 tier 扱い）。

### 実装案（⚠**検討のみ・未実装・未承認**＝ユーザー指示 2026-07-28。着手は buffCount 確定後に改めて判断）

> **勝手に実装しないこと**。本節は「重要な実装指針」として記録するもので、着手の承認ではない。

`s` はホットパスゆえ毎回クローン不可 → **ターン開始時に一度だけ**「そのターンの最終 buffCount」を静的ロールアウトで予測し `T.predBuff` に保持、各 `s` がそれを読む:

- **roy**: `tierOf(bc) === tierOf(T.predBuff)` になった瞬間に高スコア（これ以上 tier が上がらないなら即撃ち）
- **pike**: `T.predBuff < 15` なら常時高スコア（最速）／`>=15` なら `bc>=15` で高スコア
- **consort**: `bc>=20` で高スコア（防御DOWN を後続の赤に乗せる）
- **factor**: 現行の CD中アビ数`²` を維持（ユーザー提起の「別軸」と一致＝変更不要）

### 着手順の結論

**この構造は buffCount が何を数えるかと独立**なので先行実装は可能だが、**今入れても挙動はほぼ変わらない**（全 tier 常時到達ゆえ、どのルールも「即撃ち」に縮退する）。∴ **試走で tier 実発動データを取り buffCount を確定 → その後に実装**が正順（逆順だと直した効果が測れない）。

---

## 更新履歴

<!-- 直近5件のみ（それ以前は git log）。「波及確認」列が本体＝git が持たない情報はここだけ。 -->

| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-05 | 末尾ブロックを新設（DOC_RELATION_PLAN S4・種別=規定・台帳） | 参照関係は `npm run doc:check` がグリーン |

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 4）

- [CALIBRATION_ANALYSIS.md](../../CALIBRATION_ANALYSIS.md)
- [DOC_RELATION_PLAN.md](../../DOC_RELATION_PLAN.md)
- [simulation/sim05/README.md](./README.md)
- [tools/README.md](../../tools/README.md)

_他に 凍結sim/archive/essays から 1 件（更新対象外）_
<!-- doc_refs:end -->
