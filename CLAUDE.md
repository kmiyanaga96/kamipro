# 神姫PROJECT R — 光属性バーストトラッカー

単一ファイル(`index.html`)で完結する、光属性バースト編成のシミュレーター＆最適押し順トラッカー。
ビルド不要・外部依存なし（HTML+CSS+vanilla JS）。ブラウザで直接開いて動作する。

現行編成: 英霊エジソン + ヤマト / ヘカテー / テトラ / エレイン

## コード地図（index.html / 概700行）

セクション編集時は、まず該当範囲だけを Read すればトークンを節約できる。

| 範囲(行) | 内容 |
|---|---|
| 7–101 | CSS（`<style>`、Material白基調UI） |
| 103–158 | HTML構造（ヘッダ/サイドバー/自動Simメイン） |
| 160–173 | ゲーム定数（確定仕様・後述） |
| 174–197 | `ABIL`（[owner,color,cd,keigyo_cost]）/ `LABEL` / `ownerOf` |
| 198–332 | **`CHAR_DEF`**（各キャラ固有ロジックの集約先） |
| 333–339 | `CD_SHOW`（CT表示対象アビ） |
| 340–523 | `class Sim` エンジン（tick/procR/burst/use/takeTurn 等） |
| 420–523 | `takeTurn(t)` 押し順メインシーケンス |
| 525–583 | UI helpers（gaugesHTML/ordChipsHTML/`ACOL`色パレット 等） |
| 584–673 | 自動シミュレーション描画（runSim/renderSim/cardHTML） |
| 674–末尾 | INIT（renderParty/runSim） |

火力・バフ追跡は廃止済み（バースト回数で概算する方針）。最適化対象は
「10ターン連続5人フルバースト」と各種カウンタ（連理/ジャッジ/契晶/ムーンコード）。

## アーキテクチャ原則

- **キャラ固有ロジックは必ず `CHAR_DEF` に置く。** エンジン本体(`class Sim`/`takeTurn`)に
  キャラ名リテラル(`'edison'`等)を書かない。所有者解決は `ownerOf(abilityKey)` を使う。
- `CHAR_DEF[c]` のフック: `gmax` / `keigyoGain` / `onBurst` / `robotBuffs`(英霊のみ) /
  `drain`(リアクティブ自律発動) / `inori`･`tenya`･`legend`･`finisher`･`turnEnd`(戦略アクション)。
- 戦略フックには `ctx`（`bset/rdy/JPHASE/drainJudg/drainFunki/drainHecate/actY`）を渡す。
- 押し順シーケンスはアビリティ名で記述され、`rdy()` ガードで未所持アビは自動スキップされる。

### 編成を差し替えるときは3箇所だけ編集する
1. `CHARS`（編成メンバー配列）/ `LEADER`（英霊）/ `JP`（表示名）
2. `ABIL` / `LABEL`（そのキャラのアビリティ定義）
3. `CHAR_DEF`（gmax・契晶・onBurst・drain・戦略フック）

## 変更禁止スペック（確定ゲーム定数）

`index.html` 冒頭の定数。値の変更は実機仕様と乖離するため不可。

- `RENRI_CAP=5`（コヴァレントproc 同ターン発動上限＝連理魔力獲得＆ジャッジ再発動の共通カウンタ）
- `JUDG_REACT=RENRI_CAP`（ジャッジ再発動はprocと同一カウンタ。初回自然分を含め最大6回）
- `TENYA_FROM=2`（天矢乱舞 使用可能開始ターン）
- `FB_THR=100`（フルバースト閾値。カスケード+10で90/80…でも連鎖発火）
- `MACH_BG=5`（マシーンタクトゥ ロボ作動1回あたりBG増加）
- `KEIGYO_MAX=15`（契晶最大値）

### 設計上の不変条件（壊さない）
- **ジャッジ/奮起/ヘカテー3アビの「即使用可」フラグは非蓄積**。CDを0にリセットする二値制御で表現し、
  トークン蓄積による連続使用は不可。
- **ジャッジは温存せず使用可になり次第即発動**。同ターン発動上限は
  `judgCap = JUDG_REACT(5) + (開始時cd.judg===0なら1)` = 最大6。再発動はコヴァレントprocと
  同一カウンタに紐づき(下記)、armは`cd.judg=0`の二値制御で超過分は次ターンへ持ち越す。
- **コヴァレント・アルカナ(renri＆ジャッジ再発動)**: 同一ターンに光属性キャラが
  **アビリティ12回・バースト2回・通常攻撃9回**(=3チャネル合算)行う度に1proc発火し、
  **1procが「連理魔力+1」＆「ジャッジ即使用可(arm)」を同時付与**。procは同ターン**5回まで**
  (`RENRI_CAP=5`)。よってジャッジ実発動は再発動5回+初回自然分1回=最大6回。連理魔力目標30でHELIX解禁。
  通常攻撃チャネルは毎ターンフルバースト前提では未到達のため未実装。
- **テトラのバースト効果**は自身のバーストのみ対象。誘発バーストではジャッジ自体を除外。
- **モビウスムーンズ**: partyバースト5回毎にヘカテー(黄ドレイン所有者)の全アビCDリセット。
- **天矢乱舞**はゲージ枯渇時(shortCount>0)のみ・T2以降。

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
（FullBurst:10/10。攻撃フェイズでのアビ発動はなし。
Jはターンにより3〜6で変動（proc arm数＋メインフェイズのみのjudg発動機会に依存）。
renriは毎ターン+5で完全線形。HELIX解禁T6・テトラ4(HELIX)発動T7。
エンジン: BEAM_W=24/BEAM_W_INNER=4、planDepth整数管理、lookaheadガード汎用化。）

## 開発ルール

- 開発ブランチ: `claude/wizardly-dirac-JIdyw`
- 火力指数・バフ/デバフ追跡は廃止済み。火力はバースト回数で概算する方針
  （必要になればバーストダメージのみ別途追跡する）。
- 単一ファイル構成を維持する（JS/CSSの外部ファイル分割はしない方針）。
