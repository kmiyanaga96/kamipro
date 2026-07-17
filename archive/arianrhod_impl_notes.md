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

## 確定した仮定（実機照合 2026-07-17・ARIANROD_REGISTRATION.md §3 参照）
1. ~~**追撃は1つ（重複なし）**~~ → **【refute・確定/A1】**: バースト効果「追加ダメージ」と1アシ「追撃」は**別枠2本**（クリーン編成でバースト本体＋追加ダメージ＋アビリティダメージ＋アシスト追撃の4本表記を確認・前回の「謎の追加ダメージ」はエジソン由来と判明）。`onBurst` を**追撃2回加算**（3倍/50万・アビ枠×2）へ修正済み。個別倍率/capはsim04後の絶対値fitで確定。
2. ~~**1アビ即発動の上限（手動+自動 共通2回）**~~ → **【部分refute・確定/A2】**: **手動のみ**同ターン2回上限。自動発動（自バースト効果/アシスト）は**上限なし＆手動クォータ非消費**。`arianHolyFire(sim,T,manual)` で分岐（manual時のみ `T.holy<2`）へ修正済み。
3. ~~**1アビ自動発動はアビ計数しない**~~ → **【refute・確定/A3】**: 自動発動も**アビ使用扱い**（テトラ同編成で連理魔力+を確認）。`arianHolyFire` 自動経路で `sim._countAbilityUse('holy','y')` を発火へ修正済み（手動は `use()` が計数）。
4. ~~**3アビ再発動はアビ計数しない**~~ → **【refute・確定/A4】**: `elegant_re` も**赤アビ計数**（再発動直後の連理+を確認）。`sim._countAbilityUse('elegant_re','r')` を追加済み（ヤマト`tenya_re`/C19と同型）。
5. **2アビの自分/味方全体（奇偶）区別なし** → **【refute・A5・未反映】**: **偶数回=自分のみ / 奇数回=全体**を実機確認。ただし現エンジンは spec/acute を全オーナー共有バフ（`sim.buf.arian_spec`）で**常時全体近似**。局所化は per-owner バフscoping の横断改修＝**要ユーザー判断で保留**。
6. **バーストゲージ付与の対象** → **【confirm・A6】**: 1アビ+10=味方全体(`CHARS`)、2アシ+40=自分のみ(`[arianrhod]`)。修正なし。
7. **1アビ バーストダメージプラス（味方光）の全体近似** → **【confirm・A7】**: 味方光の他キャラバーストにも適用を確認。修正なし。
8. **急所倍率1.1倍 → acute+0.10** → **【未取得・A8保留】**: 非会心急所hitを分離できず≈1.1比を未取得。現行 acute+0.10 を維持し、将来のアリアン入り統計的較正で取得。
9. **HP80%以上条件** → **【confirm・A9】**: HP<80%で追撃・バースト性能UPが消失を確認＝ゲートは実在。シムは常時フルHP=常時true維持（味方生存モデル ROADMAP §4-i 実装時に条件化）。

## 数値（`src/constants.js` アリアンロッドブロック）
- 追撃 3倍/50万（`arian_followup_mult/cap`）／登場〜5T バースト係数+5（`burst_arian`）・特別減衰+100%（`arian_cap_boost`）
- 1アビ bplus+10万/5T（`bplus_arian`/`dur_bplus_arian`）・ゲージ+10（`arian_holy_bg`）・8hit 0.8倍/8万（`holy_hit_mult`/`holy_hit_cap`/`holy_hits`）
- 2アビ spec+8%・acute+0.10/3T（`spec_arian`/`acute_arian`/`dur_arian_miti`）
- 2アシ 3バースト毎に 全アビCD-1・ゲージ+40（`arian_overcome_bg`）・バースト上限+8%/3T（`bcap_arian`/`dur_arian_bcap`）
- 「登場から5ターン目まで」の境界 = `arian_last_turn`(5)

## 検証
- 初版(2026-07-11): `npm run test:golden` raw 203,723,485 / cal 218,902,146 不変・`edison+arianrhod+hecate+tetra+elaine` 10T=201,654,712・FB10/10。
- **A1〜A4 反映後(2026-07-17)**: `npm run test:golden` → **raw 187,186,834 / calibrated 208,689,608 不変**（arianrhod非編成＝inert・現行C27ゴールデン値）。
  - 編成 `edison+arianrhod+hecate+tetra+elaine` 10T＝**299,564,655・FB10/10（無クラッシュ）**。旧201.6Mからの増分は追撃別枠2重＋自動1アビ/再発動のアビ計数化（proc/robot反応の追加）が主因＝実機確定挙動の反映。
- ⚠ 絶対値/押し順の実機一致は**未検証**（A8保留・絶対値fitはsim04後）。A5局所化は未反映（ユーザー判断待ち）。
