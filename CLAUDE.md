# 神姫PROJECT R — 光属性バーストトラッカー

単一ファイル(`index.html`)で完結する、光属性バースト編成のシミュレーター＆最適押し順トラッカー。
ビルド不要・外部依存なし（HTML+CSS+vanilla JS）。ブラウザで直接開いて動作する。

現行編成: 英霊エジソン + ヤマト / ヘカテー / テトラ / エレイン

## コード地図（index.html / 約1009行）

セクション編集時は該当範囲だけを Read すればトークンを節約できる。

| 範囲(行) | 内容 |
|---|---|
| 7–159 | CSS（`<style>`、Material白基調UI） |
| 161–217 | HTML構造（ヘッダ/サイドバー/メイン） |
| 219–230 | ゲーム定数（確定仕様・後述） |
| 231–250 | **`DMG`**（概算火力モデル定数・後述） |
| 251–430 | **`CHAR_REGISTRY`**（全キャラ定義の唯一の集約先） |
| 431–489 | 編成グローバル構築（`buildFormation`/`CHAR_SIM_STATES`/`MILESTONES`/`computeBaseScore`） |
| 490–722 | `class Sim` エンジン（tick/procR/burst/use/`_na`/beam等） |
| 770–828 | UI helpers（gaugesHTML/ordChipsHTML/ACOL等） |
| 829–921 | 自動シミュレーション描画（runSim/renderSim/cardHTML） |
| 922–992 | 編成選択UI |
| 993–末尾 | INIT |

最適化の最上位目標は**概算総ダメージ**（`DMG` モデル）。FB回数/総バースト/総ジャッジ/連理魔力
は補助指標として目的関数の下位次元に残る。詳細は「概算火力モデル」節を参照。

## アーキテクチャ原則

**`CHAR_REGISTRY` が唯一の編集先。** エンジン本体（`class Sim`）にキャラ名リテラルを書かない。

### CHAR_REGISTRY エントリの構造

```
CHAR_REGISTRY[charKey] = {
  type: 'hero'|'kamihime',
  jp, gcls,                        // 表示名・ゲージCSSクラス
  state: { key: initVal, ... },    // キャラ固有sim状態変数（自動管理）
  abilities: { key:[col,cd,kc] },  // [色, CD, 契晶コスト]
  labelSuffix: { key: '...' },
  cdShow: { key: '表示名' },
  cands: {                         // 押し順エンジンが参照する候補定義
    key: {
      s: 数値|関数,                 // 静的スコア（デフォルト50）
      guard?: (sim,T,t)=>bool,
      exec?: (sim,T,ord,bset,t)=>void,  // 省略時: sim.use(key,T,ord)
      lookahead?: (sim,t)=>bool,   // ターン先読みガード（_primeLookaheadsで計算）
      atkBuf?: true,               // 攻撃/防御バフ系の分類タグ
      burstTrigger?: true,         // 誘発バースト系の分類タグ
    }
  },
  def: {
    gmax: 数値,                    // BG上限（省略時 other_max=100）
    keigyoGain: 数値,
    onBurst?: (sim, atk, owner)=>void,
    turnEnd?: (sim)=>void,
  },
}
```

### 新キャラ追加・編成差し替えは CHAR_REGISTRY 1箇所だけ

1. `CHAR_REGISTRY` に新エントリを追加（上記構造に従う）
2. `buildFormation(heroKey, [kamihimeKeys...])` の引数を変更
3. `CHAR_SIM_STATES` は `buildFormation` が自動構築 → Sim の init/snap/clone も自動

### state フィールドの規約

キャラ固有のバトル持続変数（一度限りフラグ・独自タイマー等）を宣言する。
`buildFormation()` が全キャラの state を集約し、Sim が自動管理する。
エンジン共通変数（renri/mooncode/mburst/keigyo/cum/dmg/aslt/elem/bdmg）はここに含めない。

## 概算火力モデル（`DMG` 定数・231行付近）

`damageCalculator.txt` の実機ダメージ式は乗算ボックスが多数あり、全変数の厳密追跡は非現実的。
そこで**押し順で動く加算枠のみ追跡し、押し順非依存の枠は概算定数 `DMG.misc` に一括で畳む**。

### 追跡する加算スタック（エンジン共通変数）

| 変数 | 枠 | 加算元（cands の exec で `DMG.*` を加算） |
|---|---|---|
| `aslt` | アサルト | バノーシク(ロボ作動中の黄アビ毎+0.10) / アブソ(+0.30) |
| `elem` | 属性値 | プヴワール(+0.15) |
| `bdmg` | バーストダメージUP | アブソ(+0.30) |
| `dmg`  | 総ダメージ累計 | burst()/judg exec/通常攻撃で加算 |

- 通常攻撃概算 `_na()` = `base_atk × (1+aslt) × (1+elem) × misc / enemy_def`
- バースト = `_na() × (burst_coef_a + bdmg)`、フルバースト5人時は攻撃フェイズ合計に `×(1+burst_streak)`
- ジャッジ循環: ph0=10ヒット(`min(_na()×3, judg_cap)`＋アンプリファ作動中は`amplifa_flat`) / ph1=バースト / ph2=通常攻撃

### 値の所在と原則

値は**全て `DMG` 定数に集約**し、各キャラの加算ロジックは `CHAR_REGISTRY[*].cands[*].exec` 内で
`DMG.*` を参照する（エンジン本体・キャラ定義のどちらにも数値リテラルを散らさない）。
非有利属性も一括シミュするため属性相性倍率は考慮しない（ベース1.0）。
火力は**プランのランキング（相対比較）**用途であり、絶対値の厳密性は問わない。

目的関数 `_objective()` は `[総ダメージ(整数), FB数, 総バースト, 総ジャッジ, renri, cum, keigyo]` を
辞書式で返す（**総ダメージが最上位**、以降は補助指標／タイブレーク）。

## 変更禁止スペック（確定ゲーム定数）

`index.html` 219行付近の定数。値の変更は実機仕様と乖離するため不可。

- `RENRI_CAP=5`（コヴァレントproc 同ターン発動上限＝連理魔力獲得＆ジャッジ再発動の共通カウンタ）
- `JUDG_REACT=RENRI_CAP`（ジャッジ再発動はprocと同一カウンタ。初回自然分を含め最大6回）
- `TENYA_FROM=2`（天矢乱舞 使用可能開始ターン）
- `FB_THR=100`（フルバースト閾値。カスケード+10で90/80…でも連鎖発火）
- `MACH_BG=5`（マシーンタクトゥ ロボ作動1回あたりBG増加）
- `KEIGYO_MAX=15`（契晶最大値）

### 設計上の不変条件（壊さない）

- **ジャッジ即発動**: CD=0になり次第即発動。同ターン上限 `judgCap = JUDG_REACT + (開始時cd.judg===0?1:0)` = 最大6。
- **コヴァレント・アルカナ(renri＆ジャッジ再発動)**: abi/12・burst/2 の2チャネルでprocが発火し、
  「連理魔力+1」＆「ジャッジ即使用可(arm: cd.judg=0)」を同時付与。proc は同ターン5回上限。
  通常攻撃チャネル(9回)はフルバースト前提では未到達のため未実装。
- **arm非蓄積**: proc arm は cd.judg>0 の時のみ有効（cd=0ならスキップ）。二値制御。
- **テトラのバースト効果(onBurst)**: 自バーストのみ対象。誘発バーストではjudgを除外してCD短縮。
- **モビウスムーンズ**: partyバースト5回毎にヘカテー(puvoir所有者)の全アビCDリセット。
- **天矢乱舞**: ゲージ不足キャラが存在するターン(T2以降)のみ使用可。
- **proc機会損失の最小化**: alone・judg が攻撃バフより先に発動するのは意図的最適化。
  alone→judg→攻撃バフ の順でburst-2 procとabi-12 procの両方を同一ターンで取得できる。

## 検証方法

リファクタ後は FB10/10 維持＆概算総ダメージが基準と一致するか確認する。
目的関数の最上位が総ダメージのため、押し順は火力最大化方向に決まる（renriは線形ではない）。

```bash
node -e '
const html=require("fs").readFileSync("index.html","utf8");
let code=html.slice(html.indexOf("// ===== ゲーム定数"), html.indexOf("// ===== UI HELPERS"));
code+="\nglobalThis.Sim=Sim;globalThis.buildFormation=buildFormation;";
(0,eval)(code);
globalThis.buildFormation("edison",["yamato","hecate","tetra","elaine"]);
const sim=new globalThis.Sim();
let fb=0;
for(let t=1;t<=10;t++){const r=sim.takeTurn(t); if(r.full)fb++;
  console.log("T"+t,"FB:"+r.atk.length,"J:"+r.ju,"renri:"+r.renri,"dmg:"+Math.round(r.dmg));}
console.log("FullBurst:",fb+"/10","TotalDmg:",Math.round(sim.dmg));
'
```

期待値（基準・DMG定数が現行値の場合）:
```
T1  FB:5 J:1 renri:4  dmg:128,238     T6  FB:5 J:4 renri:29 dmg:1,354,822
T2  FB:5 J:4 renri:9  dmg:388,941     T7  FB:5 J:4 renri:34 dmg:1,615,670
T3  FB:5 J:4 renri:14 dmg:616,993     T8  FB:5 J:4 renri:39 dmg:1,874,209
T4  FB:5 J:4 renri:19 dmg:865,921     T9  FB:5 J:5 renri:44 dmg:2,102,261
T5  FB:5 J:5 renri:24 dmg:1,126,770   T10 FB:5 J:4 renri:49 dmg:2,363,110
```
（FullBurst:10/10、TotalDmg:2,363,110。`DMG` 定数を変えると数値も変わる＝この基準も更新する。
エンジン: BEAM_W=24/BEAM_W_INNER=4、目的関数最上位=概算総ダメージ。）

## 開発ルール

- 開発ブランチ: `claude/wizardly-dirac-JIdyw`
- 火力は `DMG` 概算モデルで算出（押し順依存の加算枠のみ追跡・残りは misc に概算）。
- 単一ファイル構成を維持する（JS/CSSの外部ファイル分割はしない方針）。
