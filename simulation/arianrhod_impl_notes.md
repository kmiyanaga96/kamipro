# アリアンロッド[健美端麗] 実装メモ（スペック解釈・仮定）

> 2026-07-11 Claude Code。新神姫`arianrhod`のDB追加（ヤマトタケル互換＝バースト加速＋バーストバフ）。
> スペックに曖昧・重複があり、いくつか**解釈で確定した仮定**を置いた。実機と照合したら本メモを更新すること。
> 実装: `data/characters.js`（`arianrhod`エントリ＋`arianHolyFire`ヘルパー）／`src/constants.js`（`アリアンロッド`定数ブロック）／
> `src/sim.js`（`_na`にarian_spec/arian_acute項・T初期化にholy/elegant）／`index.html`（`.gan`色）。golden不変・build成功・編成投入で10T無クラッシュを確認。

## スロット対応
| ゲーム | キー | 色/CD/コスト | 実装 |
|---|---|---|---|
| 1アビ ホーリーターボ | `holy` | 黄・実CD1・0 | cd0+quota(T.holy<2)で「同ターン2回可」を表現 |
| 2アビ ミティゲートペイン | `miti` | 黄・CD2・0 | spec+8%/acute+0.10(3T累積) |
| 3アビ エレガントルミナス | `elegant`(+`elegant_re`) | 赤・CD8・0 | ヤマト tenya/tenya_re と同型のオートバースト＋再発動 |
| バースト セイアッドショット | （通常バースト） | a5/b2500 | onBurstで追撃＋自動1アビ |

## 確定した仮定（要実機確認）
1. **追撃は1つ（重複なし）**: バースト効果「追加ダメージ3倍/50万」と1アシ「追撃3倍/50万」は**同一の追撃**と解釈し、onBurstで**1回だけ**加算（HP80%以上＝シムは常時フルHP前提で常時発動）。両者が別枠で**2重**なら onBurst を2回加算に変更。
2. **1アビ即発動の上限**: バースト効果「登場〜5T 自バースト毎に1アビ即発動」＋1アシ「登場〜5T ターン終了時に1アビ即発動」を、**手動含め同ターン最大2回**（`arianHolyFire`内 `T.holy<2`）に制限。「即発動はクォータ無制限」なら上限を撤廃。現状は暴走防止で2回上限。
3. **1アビ自動発動はアビ計数しない**: `arianHolyFire`はバフ/ゲージ/8hitダメを適用するのみで、`use()`/`_countAbilityUse`を呼ばない（proc/ムーンコード等への計上なし）。ヘカテー/テトラと同編成にした際の proc 連鎖は未モデル。
4. **3アビ再発動はアビ計数しない**: `elegant_re`は`_countAbilityUse`を呼ばない（ヤマト`tenya_re`はC19実機確定で呼ぶが、arianは未確認）。実機で赤アビ計数されるなら追加。
5. **2アビの自分/味方全体（奇数回目）区別なし**: シムの spec/acute バフは全体適用（`_na`が全オーナー参照）のため、`arian_miti_uses`は数えるが**挙動は常に全体扱い**（偶数回=自分のみ の局所化は未モデル＝既存エンジン簡略化と同じ）。
6. **バーストゲージ付与の対象**: 1アビ+10=味方全体(`CHARS`)、2アシ+40=自分のみ(`[arianrhod]`)と解釈。
7. **1アビ バーストダメージプラス（味方光）** は全編成光前提で全バースト共通の減衰外フラット（`burstPartyPassive`）として全体近似。
8. **急所倍率1.1倍 → acute+0.10**（`_na`は`(1+acute)`加算枠のため。「倍率1.1」を+10%として反映）。
9. **HP80%以上条件**: シムは敵行動・味方HP未実装（常時フルHP）＝**常時true**扱い（1アシ追撃・バースト性能UPは常に発動）。味方生存モデル（ROADMAP §4-i）実装時に条件化。

## 数値（`src/constants.js` アリアンロッドブロック）
- 追撃 3倍/50万（`arian_followup_mult/cap`）／登場〜5T バースト係数+5（`burst_arian`）・特別減衰+100%（`arian_cap_boost`）
- 1アビ bplus+10万/5T（`bplus_arian`/`dur_bplus_arian`）・ゲージ+10（`arian_holy_bg`）・8hit 0.8倍/8万（`holy_hit_mult`/`holy_hit_cap`/`holy_hits`）
- 2アビ spec+8%・acute+0.10/3T（`spec_arian`/`acute_arian`/`dur_arian_miti`）
- 2アシ 3バースト毎に 全アビCD-1・ゲージ+40（`arian_overcome_bg`）・バースト上限+8%/3T（`bcap_arian`/`dur_arian_bcap`）
- 「登場から5ターン目まで」の境界 = `arian_last_turn`(5)

## 検証
- `npm run test:golden` → **raw 203,723,485 / calibrated 218,902,146 不変**（arianrhod非編成＝inert）。
- 編成 `edison+arianrhod+hecate+tetra+elaine` で10T＝201,654,712・FB10/10（無クラッシュ）。`npm run build` 成功（Worker伝播OK）。
- ⚠ arianrhodは実機較正データ未取得＝**絶対値/押し順の実機一致は未検証**。上記仮定の妥当性は実機取得後に確認。
