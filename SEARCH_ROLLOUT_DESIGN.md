# 探索ロールアウト設計レポート — rollout ポリシー脆弱性の診断と自己適応化（C13）

> 対象: 押し順探索が真の最適を取りこぼす「rollout（将来ターンの静的greedy価値推定）の質」問題。
> 索引: `CALIBRATION_ANALYSIS.md` C13。関連: BEAM_SEARCH_DESIGN.md（C9・幅の崖）/ ORDER_OPTIMIZATION_DESIGN.md（C12・定石順）。
> 作成: 2026-07-02 セッション（①funki解禁バグ発見 → 探索抜本改善の原因究明まで）。**STEP1=本diagnosis記録（済）／STEP2=lookaheadロールアウトPoC（次セッション）**。

---

## 0. このセッションの経緯（3指摘の切り分け結果）

ユーザー指摘（sim2 シム推奨押し順の非最適点）:
1. **① funki(ヤマト3=大和の奮起)連打が T2/T5 で不発** → **モデルの funki 解禁機構バグと判明**（下記§2）。
2. **② 「スキップ」表示多発** → **リプレイ往復バグ**。tenya_re のチップ往復ロス。**修正済み・commit 済み**（コミット `fix(replay): tenya_re…`）。
3. **③ ヘカテーのリキャスト無駄撃ち（mobius空振り）** → 現象は実在（generic gear で mobius 20回中 空振り2回=sleur）。**本セッションは扱わず次回**（実ギア待ち）。

①の深掘りが**探索エンジンの準最適性（C13）**という本丸に到達した。以下はその原因究明の完全記録。

---

## 1. 検証環境（再現の土台）

- **編成**: `buildFormation('edison', ['yamato','hecate','tetra','elaine'])`（= golden 編成 / generic gear）。
- **現行 golden**: **175,023,298**（FB 10/10）。`npm run test:golden`。
- **計測器（本セッションで追加・commit 済み）**:
  - `archive/tools/search_probe.mjs` … N ターン探索の総ダメージ・時間・per-turn 使用回数（funki/judg/puvoir/sleur/effond）。
  - `archive/tools/search_validate.mjs` … 探索 order を独立replay で忠実再生し `探索dmg==replay dmg` & `skip=0` を検証。
  - 環境変数: `POC_N`（ターン数）/ `POC_FUNKI_S` / `POC_JUDG_S` / `POC_ROLLOUT_BW`。**下記§1.1 のスキャフォールド編集を当てた時のみ有効**。
- **実行時間の目安**: 10T 探索 ≈ 45–75s（単スレッド Node）。重い掃引は background 実行推奨。

### 1.1 再現用スキャフォールド編集（一時・実験後は必ず revert）

これらは**実験専用の一時編集**。commit しない（golden を変える A と、素の挙動を汚す B–D のため）。`git checkout` で戻す。

**A. ① funki 解禁修正（毎ターン化・実機仕様）** — `data/characters.js` yamato:
```js
// state（funki_cycle/funki_recharge を置換）:
state: { inori_p: null, yellow_acc: 0, funki_recasts: 0, funki_carryover: false },

// def.onAbility の color==='y' ブロック:
if(sim.yellow_acc % 4 === 0){
  if(sim.funki_recasts < 3){ sim.funki_recasts++; sim.cd.funki = 0; }
  else sim.funki_carryover = true;
}

// def.turnEnd 冒頭（funki_recharge 分岐を置換）:
sim.funki_recasts = 0;                               // 同ターン解禁回数を毎ターンリセット
if(sim.funki_carryover){ sim.cd.funki = 0; sim.funki_carryover = false; }  // 4回目契機は翌ターン頭へ
```
※ 実機仕様（ユーザー確認済 2026-07-02）: 黄アビ累計 yellow_acc は**ターン跨ぎ持ち越し**、**同ターン最大3回まで即時**解禁（このカウンタ funki_recasts は毎ターンリセット）、4回目以降の解禁契機は**翌ターン頭で1回復活**（実機バグ挙動）。funki は「アビ12回」proc（連理魔力/ムーンコード）に**カウントされる**（実機確認済）。

**B. funki 静的スコア env 化** — `data/characters.js` yamato.cands.funki:
```js
funki: { s:+(globalThis.process?.env?.POC_FUNKI_S ?? 150), atkBuf:true, partyBG:true, exec:(sim,T,ord)=>{ ...
```

**C. judg 静的スコア env 化** — `data/characters.js` tetra.cands.judg の s 関数内、`return robotReady…` の直前に一行:
```js
const _js=globalThis.process?.env?.POC_JUDG_S; if(_js!=null) return +_js;
```

**D. rollout 浅ビーム env 化** — `src/sim.js` greedyTakeTurn の planDepth 分岐を置換:
```js
const _rbw = +(globalThis.process?.env?.POC_ROLLOUT_BW ?? 1);
if(this.planDepth>=2 && !(this.planDepth===2 && _rbw>1)){
  for(let i=0;i<300;i++) if(!this._stepStatic()) break;          // 従来 or terminal(pd>=3)
} else if(this.planDepth===2){
  const keys=this._beamSearch(_rbw); for(const key of keys) this._execKey(key);  // 浅ビームrollout
} else {
  // …従来の planDepth=0 フルビーム分岐（_primeLookaheads + _beamSearch(BEAM_W)）…
```

---

## 2. ① funki 解禁バグ（モデル修正・実装は次段で確定）

**バグ**: 旧モデルの funki_cycle（大和の奮起の解禁回数）は**バトル永続**で `funki_recharge`（4回目）でしか 0 に戻らない。そのため T2/T5 が `cd.funki=4 & funki_cycle=3(上限)` で開始し、ターン中ずっと再解禁できず **funki=0 のブラックアウト**が発生（`search_probe` 素の状態で funki/turn=`[4,0,4,4,0,4,4,4,4,4]` で再現）。

**実機仕様**: §1.1-A のとおり「毎ターン最大3回まで解禁可能（カウンタは毎ターンリセット）」。修正で funki/turn=`[2,3,3,3,3,3,3,4,4,4]`（ブラックアウト解消）。

**⚠ ただし単独適用は golden を下げる**（下記§3 参照・修正後 174,253,492 = −0.44%）。**探索改善（STEP2）と必ずセットで**確定・golden 更新・ユーザー承認すること。修正コード自体はダメージ計算を一切変えない（旧order を新モデルで再生すると 175,023,298 に完全一致＝検証済）。

---

## 3. 探索準最適性の検証結果（C13 本体・全データ）

全て generic gear・10T・`archive/tools/search_probe.mjs`（突出値は `search_validate.mjs` で合法性検証済み）。

| # | モデル | パラメータ | 10T総ダメージ | 判定 |
|---|---|---|---|---|
| a | 現行(blackout) | 既定 | **175,023,298** | 現行 golden |
| b | ①修正 | 既定(judg dyn) | 174,253,492 | **−0.44%（退行）** |
| c | ①修正 | FUNKI_S=30 | 186,831,345 ✓検証 | +6.7% |
| d | ①修正 | **JUDG_S=130** | **191,141,005** ✓検証 | **+9.6%（最良）** |
| e | ①修正 | JUDG_S=160/200/250 | 〜183,628,849 | +5%前後（プラトー） |
| f | ①修正 | ROLLOUT_BW=2/3（浅ビーム） | 174,253,492 | **±0（効果なし）** |
| g | ①修正 | BEAM_W=384/DIVERSITY_K=128 | 174,134,134 | ほぼ不変（幅は無効） |
| h | **blackout** | JUDG_S=130 | **163,590,435** | **−6.5%（悪化！）** |
| i | blackout | JUDG_S=160 | 164,559,401 | 悪化 |

funki_s 掃引（①修正・非単調＝乱高下）: s=150→174.25M / 120→168.19M / 90→**133.82M** / 60→163.70M / 30→**186.83M**。

### 3.1 成分分解（なぜ funki連打が損か・`factor_breakdown` 相当）
①修正下で A=旧order(funki控えめ) vs B=新beam(funki過多) の 10T 内訳差 (B−A):

| 成分 | 差(B−A) |
|---|---|
| burst | **+259,462**（funki連打の得） |
| judg | **−550,820**（最大の損） |
| effond | −208,574 |
| other_abi | −160,508 |
| streak | −109,368 |
| **合計** | **−769,806** |

funki は黄アビ＝`use()` で `T.ability` を+1 → `T.ability%12` の proc（テトラ連理魔力＋judg-CD即0 / ヘカテー・ムーンコード）発火位置がズレ → **高火力な judg 再発動・ムーンコード発動が減る**。＝funki連打は「バースト微増」と引き換えに「proc整列」を崩し**ネットで損**（実機でも proc がアビ回数駆動である以上成立しうる実在のトレードオフ）。

---

## 4. 根本原因の確定分析

1. **幅ではない**: 浅ビームrollout(f) も BEAM_W=384(g) も改善ゼロ。理由＝どちらも**採点が同じ静的greedy価値推定器**。greedy は既にその推定器の argmax を選ぶので、枝を増やしても同じ枝が勝つ。→ **ボトルネックは rollout の価値推定器の質**。

2. **効くのは rollout ポリシー（静的スコア s）**: funki↓(c) / judg↑(d) で ±6〜10% 動く。s は greedyロールアウトの行動選択を決め、それが実ターンビームの候補採点（＝将来価値推定）を左右する。

3. **決定的＝静的スコアはモデル固有に手調整されている**（実験 d vs h）:
   - JUDG_S=130 は **①修正モデルで +9.6%**、**blackout モデルで −6.5%**。**同一変更が正反対**。
   - ∴ 現行の s 値は**現行(blackout)モデルに最適化**されており、モデル（funki 可用性）が変わると最適ポリシーもズレ、固定 s が miscalibrated になって探索が退行する。特定の魔法数値（judg=130 / funki=30）は **overfit**＝汎化しない（ギア変更でも崩れる公算大）。

**結論**: 探索の準最適性の根本は「**greedyロールアウトが手調整の静的スコアに依存し、モデル/ギア変更に脆い**」こと。C9（幅の崖）・C12（定石順）とは別軸の、価値推定器そのものの問題。

---

## 5. 頑健な解の方向（STEP2・次セッションの本丸）

**静的スコアの手調整に依存しない自己適応ロールアウト**にする。候補＝**lookahead ロールアウト**:
- 各ロールアウトステップで候補を「静的 s」でなく**実シミュレーション結果（候補実行→ターン完遂まで回した turn-end 実ダメージ等）**で採点して選ぶ。buff の価値が実ダメージに現れるため、モデル/ギアが変わっても自動追従する。

### 5.1 設計上の核心課題（引継ぎ注意）
- **単純な「即時ダメージ最大」greedy は不可**: buff/デバフは即時ダメージ0のため決して選ばれず、探索が崩壊する。現状の静的 s はまさに「buff先・ダメージ後」を手動エンコードしている。
- **浅ビーム(f)がなぜ効かなかったか**: `_beamSearch` の evalEntry が `_finishStatic()+_objective()`＝**静的greedy採点**を使うため、幅を増やしても同じ静的推定に支配された。→ **lookahead は「採点関数」を静的スコアから実シミュレーション turn-end dmg へ替えるのが肝**（幅ではなく採点の付替え）。
- **コスト**: 実シミュ採点は乗算的に重くなる。ユーザー了承済（「無視できないダメージ増加ゆえ探索コスト増は許容」）。ただし Phase5 待機UX と要バランス。まず PoC で「効果（±%）× 時間」を計測し、production 可否を判断する。
- **ゴールデン**: STEP2 で探索が変われば golden 値が動く。①修正とセットで新基準を確定し**ユーザー承認**を得る（既存規律どおり）。

### 5.2 STEP2 の進め方（推奨）
1. lookahead ロールアウトの最小PoC（採点を turn-end 実ダメージ化）を env-gate で実装し、`search_probe`/`search_validate` で ①修正モデルの golden が **手調整なしで ≥186〜191M に届くか**を計測（届けば「自己適応で真の最適に到達」を実証）。
2. **blackout モデルでも同PoC を回し、現行 golden(175.02M) を割らない（=汎化する）ことを確認**（実験 h の轍を踏まないため必須の回帰）。
3. 効果とコストが見合えば production 実装 → golden 更新（①修正込み）→ ユーザー承認。

---

## 6. 未確定・持ち越し
- **① funki 修正の本実装**: STEP2 の探索改善とセットで確定（単独適用は golden 退行のため保留）。
- **③ ヘカテー mobius 空振り**: 次セッション・**実ギア（ユーザーのスクショ編成の GEAR 設定）待ち**で切り分け。
- **overfit 注意**: 本レポートの数値は全て generic gear。実ギアでは最適 order も改善幅も異なる。STEP2 は「特定 s 値」ではなく「自己適応の仕組み」を目指すこと。
