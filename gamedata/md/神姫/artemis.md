# アルテミス[神想真化] #

## 1. 一次情報 (Claude Code編集不可) ##

### §1.1 基本スペック ####

- 神姫名: アルテミス[神想真化]
- 属性: 光
- 得意武器: 銃・ハンマー
- タイプ: アタック
- Lv1ATK: 1688
- Lv1HP: 324
- Lv80ATK: 12440
- Lv80HP: 3120

### §1.2 バースト/アビリティ ###

- バースト - **アルカディアコメット**
  - **テキスト原文**: 光属性ダメージ(極大)/自身のアビリティ再使用間隔1T短縮
  - **バースト倍率**: 5.5 **バースト基礎値**: 3000
  - **有志検証データ**: なし

- アビリティ1 - **エンチャントアロー** (**赤**)
  - **テキスト原文**: 敵単体に魔力のこもった矢を放つ※バーストゲージを消費して、消費量に応じたダメージと様々な効果を付与(最大100消費)
  - **使用間隔/効果ターン**: 7T/なし
  - **効果対象**: 敵単体
  - **有志検証データ**: ダメージ倍率3倍、減衰30万。次の効果(必中、効果3T)を付与。1~25：状態異常耐性、連続攻撃確率DOWN、3倍、減衰30万 ~50：冥闇、5倍、減衰50万 ~75：闇属性攻撃DOWN(25%、専用)、7倍、減衰70万 ~99：与ダメージDOWN(30%)、10倍、減衰100万 ~100：恐傷、12倍、減衰150万。

- アビリティ2 - **リファインメントエイド** (**黄**)
  - **テキスト原文**: 味方全体の急所攻撃確率UP・追撃付与
  - **使用間隔/効果ターン**: 8T/3T
  - **効果対象**: 味方全体
  - **有志検証データ**: 急所倍率1.3倍。追撃はバースト追加ダメージを付与。アビダメ扱いで、ダメージ倍率3倍、減衰30万。

- アビリティ3 - **マナポライトオペレーション** (**黄**)
  - **テキスト原文**: 味方全体のバーストゲージ・バーストストリークダメージUP(累積可)
  - **使用間隔/効果ターン**: 2T/1oT
  - **効果対象**: 味方全体
  - **有志検証データ**: バーストゲージ+10、ストリークダメージ+2%。

- アビリティ4 - **LinkSkill[アルテミス]** (**黄**)
  - **テキスト原文**: 光属性キャラの特殊攻撃UP・バーストゲージ100UP※戦闘中1回のみ使用可能
  - **使用間隔/効果ターン**: 1T/1T
  - **効果対象**: 味方全体
  - **有志検証データ**: 特殊攻撃+30%。

- アシスト1 - **リンクスフェロー**
  - **テキスト原文**: 味方のバースト発動時、自身のバーストゲージUP・バーストダメージプラス(累積可)
  - **有志検証データ**: バーストゲージ+15、バーストダメージプラス15万(効果3T)。自分のバーストにも反応。

- アシスト2 - **AnotherLink[アルテミス]**
  - **テキスト原文**: パーティ全体が光属性キャラの場合、バースト性能・最終ダメージUP◆サブメンバー時にも発動
  - **有志検証データ**: バーストダメージ+25%、バースト上限+10%、最終ダメージ+10%。



## 2. シムデータ (Claude Code編集可) ##

### §2.1 各データのシム内呼称 ###

- **エンチャントアロー**: `enchant`（部分消費探索の variants 合成キー `enchant_t1`〜`enchant_t5`・恐傷バフキー `kyosho`＋state `kyosho_amp`）
- **リファインメントエイド**: `refine`（バフキー `refine_acute`/`refine_followup`）
- **マナポライトオペレーション**: `manapolite`（バフキー `manapolite`）
- **LinkSkill[アルテミス]**: `linkskill`（バフキー `artemis_spec`・state `artemis_link_used`）
- **リンクスフェロー**: `def.onPartyBurst`（バフキー `artemis_bplus`）
- **AnotherLink[アルテミス]**: `subAssists`（`burst_dmg`/`burst_cap`/`final_dmg`＝buildFormationが `DMG.sub_burst_dmg`/`sub_burst_cap`/`final_dmg` へ集約）

### §2.2 シム判明データ ###

> 出所: `gamedata/js/characters.js`（`artemis` エントリ）＋ `src/constants.js`（`DMG`）に現在エンコード済みの値・挙動を配置（新規導出はしない）。

#### 基本 ####

- 定義キー: `artemis`（`type:'kamihime'` / `elem:'light'` / `gcls:'gar'`）
- `baseAtk`/`baseHp`: 12440 / 3120
- バースト係数: `burst_coef_a=5.5` / `burst_coef_b=3000`（ユーザー提供）
- 得意武器: 銃・ハンマー / `keigyoGain=1` / `gmax=100`
- state: `artemis_link_used`（4アビ戦闘中1回フラグ）/ `kyosho_amp`（恐傷の被ダメUP量・`_na` 参照）

#### バースト（アルカディアコメット・`def.onBurst`） ####

- 自身の全アビCD−1（自バーストのみ）

#### エンチャントアロー（`enchant`・赤） ####

- 定義: `['r', 7, 0]`・静的スコア `s=55`（低め＝火力駆動のビーム選択に委ねる）・guard: 自ゲージ26以上
- ゲージ消費の段階ダメージ（`_spendGaugeAbi`・アビ枠・×(1+`GEAR.abi_dmg`+攻撃ロボバフ)）:
  - tier1（消費1〜）: `arrow_mult1=3` / `arrow_cap1=30万`
  - tier2（消費26〜）: `arrow_mult2=5` / `arrow_cap2=50万`
  - tier3（消費51〜）: `arrow_mult3=7` / `arrow_cap3=70万`
  - tier4（消費76〜）: `arrow_mult4=10` / `arrow_cap4=100万`
  - tier5（消費100）: `arrow_mult5=12` / `arrow_cap5=150万`
- 部分消費探索: `variants` で各帯の**最小消費量**を1候補ずつ展開（帯内の過剰消費は常に劣るため下限のみ・CDは共有）
- tier5（消費100）で恐傷付与: `kyosho_amp = min(状態異常数×kyosho_per_ailment(0.02), kyosho_cap(0.30))`・状態異常数=2（冥闇+恐傷）+ディウィヌスDOT有効時4・`dur_kyosho=3`。`_na()` で全枠の外側に乗算（敵被ダメUP）
- ※tier1〜4の付与効果（状態異常耐性/連続攻撃確率DOWN・冥闇・闇属性攻撃DOWN・与ダメージDOWN）は現状シム未モデル化（ダメージ段階と恐傷のみ）

#### リファインメントエイド（`refine`・黄） ####

- 定義: `['y', 8, 0]`・静的スコア `s=155`
- `refine_acute`: 急所 `acute_refine=+0.09`（急所倍率1.3倍換算・refresh・`dur_refine=3`）
- `refine_followup`: 追撃＝有効中は全バーストへ減衰外フラット `min(na×refine_followup_mult(3), refine_followup_cap(30万))`（`burstPartyPassive` 実装・アビ枠追加ダメの近似）

#### マナポライトオペレーション（`manapolite`・黄） ####

- 定義: `['y', 2, 0]`・静的スコア `s=140`
- 味方全体ゲージ+10（`bg_manapolite`）＋ ストリークダメージ `streak_manapolite=+0.02`/stack（累積可・`dur_manapolite=10`・`_attackPhase` のストリーク係数に加算）

#### LinkSkill[アルテミス]（`linkskill`・黄） ####

- 定義: `['y', 1, 0]`・静的スコア `s=300`・guard: 戦闘中1回（`artemis_link_used`）
- 特殊攻撃 `spec_artemis=+0.30`（`dur_artemis_spec=1`）＋ 味方全体ゲージ+100

#### リンクスフェロー（1アシ・`def.onPartyBurst`） ####

- 味方バースト毎（自分含む）: 自分ゲージ+15 ＋ `artemis_bplus` push（`bplus_artemis=+15万`/stack・`dur_artemis_bplus=3`・累積可）
- バーストダメージプラスは**アルテミス自身のバーストのみ**加算（`burstPartyPassive` 内 `_naOwner` 判定）

#### AnotherLink[アルテミス]（2アシ・`subAssists`） ####

- `subAssists: { burst_dmg: 0.25, burst_cap: 0.10, final_dmg: 0.10 }`
- buildFormation が**全員光属性編成のとき**に `DMG.sub_burst_dmg`（バーストダメ+25%）/ `DMG.sub_burst_cap`（バースト上限+10%）/ `DMG.final_dmg`（最終ダメージ×1.10・`_na` 最外殻）へ集約。サブメンバー時にも同経路で適用（メイン/サブ共通・1回だけ）

