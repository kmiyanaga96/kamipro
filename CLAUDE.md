# 神姫PROJECT R — 光属性バーストトラッカー

単一ファイル(`index.html`)で完結する、光属性バースト編成のシミュレーター＆最適押し順トラッカー。
ビルド不要・外部依存なし（HTML+CSS+vanilla JS）。ブラウザで直接開いて動作する。

現行編成: 英霊エジソン + ヤマト / ヘカテー / テトラ / エレイン

## コード地図（index.html / 約935行）

セクション編集時は該当範囲だけを Read すればトークンを節約できる。

| 範囲(行) | 内容 |
|---|---|
| 7–159 | CSS（`<style>`、Material白基調UI） |
| 161–217 | HTML構造（ヘッダ/サイドバー/メイン） |
| 219–230 | ゲーム定数（確定仕様・後述） |
| 231–402 | **`CHAR_REGISTRY`**（全キャラ定義の唯一の集約先） |
| 403–436 | 編成グローバル構築（`buildFormation`/`CHAR_SIM_STATES`） |
| 437–697 | `class Sim` エンジン（tick/procR/burst/use/beam等） |
| 698–756 | UI helpers（gaugesHTML/ordChipsHTML/ACOL等） |
| 757–847 | 自動シミュレーション描画（runSim/renderSim/cardHTML） |
| 848–918 | 編成選択UI |
| 919–末尾 | INIT |

火力・バフ追跡は廃止済み（バースト回数で概算する方針）。最適化対象は
「10ターン連続5人フルバースト」と各種カウンタ（連理/ジャッジ/契晶/ムーンコード）。

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
エンジン共通変数（renri/mooncode/mburst/keigyo/cum）はここに含めない。

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

リファクタ後は必ずベースラインと一致するか確認する（10ターン全て5人フルバースト＝10/10）。

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
  console.log("T"+t,"FB:"+r.atk.length,"J:"+r.ju,"renri:"+r.renri);}
console.log("FullBurst:",fb+"/10");
'
```

期待値（基準）:
```
T1 FB:5 J:3 renri:5    T6  FB:5 J:4 renri:30
T2 FB:5 J:6 renri:10   T7  FB:5 J:6 renri:35 [HELIX発動]
T3 FB:5 J:3 renri:15   T8  FB:5 J:3 renri:40
T4 FB:5 J:4 renri:20   T9  FB:5 J:3 renri:45
T5 FB:5 J:5 renri:25   T10 FB:5 J:6 renri:50
```
（FullBurst:10/10。renriは毎ターン+5で完全線形。HELIX解禁T6・テトラ4(HELIX)発動T7。
エンジン: BEAM_W=24/BEAM_W_INNER=4、planDepth整数管理、lookaheadガード汎用化。）

## 開発ルール

- 開発ブランチ: `claude/wizardly-dirac-JIdyw`
- 火力指数・バフ/デバフ追跡は廃止済み。火力はバースト回数で概算する方針。
- 単一ファイル構成を維持する（JS/CSSの外部ファイル分割はしない方針）。
