# 編成最適化エンジン — Phase 3 高速化＆バイトコードVM設計書

> [!NOTE]
> 本ドキュメントは、探索エンジンのボトルネックを抜本的に解消するための「差分エミュレーター（Undo型）」および「アビリティの宣言的バイトコード（VM型）実行」の具体的なアーキテクチャ設計書です。次回 Claude Code が Phase 3 を実装する際のリファレンスとなります。

---

## 1. 差分エミュレーター (Apply/Revert アーキテクチャ)

### 1.1 背景と課題
現行エンジンは探索ノード評価時に `clone()` を毎ステップ呼び出しています。`clone()` は JavaScript オブジェクトの生成、プロパティのディープコピーを伴い、これが大量の GC（Garbage Collection）のオーバーヘッドと CPU 実行時間を引き起こしています。

### 1.2 解決策: Apply/Revert（Undo）エンジン
状態の「コピー」を廃止し、**ただ一つのグローバルな `Sim` 状態インスタンス**を維持します。探索の前進時にアビリティを「適用（Apply）」し、バックトラック（探索の戻り）時にアビリティの影響を「復元（Revert / Undo）」します。

#### 変更履歴ログ（Change Log）の記録
アビリティの実行に伴う状態の変化は、すべて「変更ログオブジェクト」の配列に記録されます。
```js
// 変更ログレコードの例
const changeLog = [
  { type: 'CD_CHANGE', key: 'inori', oldVal: 0, newVal: 14 },
  { type: 'GAUGE_CHANGE', char: 'yamato', oldVal: 20, newVal: 120 },
  { type: 'DMG_ADD', amount: 5000000 },
  { type: 'BUF_PUSH', key: 'absolute', duration: 2 },
  { type: 'KEIGYO_CHANGE', oldVal: 4, newVal: 10 }
];
```

#### 逆シミュレーションによる復元（Revert）
探索をバックトラックするときは、この `changeLog` を**後ろから逆順に再生**し、状態を完全に元に戻します。
```js
function revertChange(sim, log) {
  switch (log.type) {
    case 'CD_CHANGE':
      sim.cd[log.key] = log.oldVal;
      break;
    case 'GAUGE_CHANGE':
      sim.g[log.char] = log.oldVal;
      break;
    case 'DMG_ADD':
      sim.dmg -= log.amount;
      break;
    case 'BUF_PUSH':
      sim.buf[log.key].pop(); // 直近に積んだバフスタックを除去
      if (!sim.buf[log.key].length) delete sim.buf[log.key];
      break;
    case 'KEIGYO_CHANGE':
      sim.keigyo = log.oldVal;
      break;
    // ...
  }
}
```
これにより、オブジェクトの生成コストが完全にゼロになり、探索の処理速度が劇的に（数十倍）向上します。

---

## 2. 状態のフラット化 (Flat State / Float64Array)

さらなる高速化として、`Sim` 内の全状態変数を1つのフラットな型付き配列（`Float64Array`）にシリアライズします。

### 2.1 メモリマップの設計案
| インデックス | 変数名 | 説明 |
|---|---|---|
| `0` | `dmg` | 累積総ダメージ |
| `1` | `keigyo` | 現在契晶値 |
| `2` | `cum` | 累積獲得契晶 |
| `3` | `renri` | 連理魔力値 |
| `4` | `mooncode` | ムーンコード残ターン |
| `5 - 9` | `g[char]` | キャラクター5人のバーストゲージ |
| `10 - 29` | `cd[ability]` | 各アビリティの残りクールダウン（最大20アビ） |
| `30 - 45` | `state[key]` | キャラ固有状態（droid, ycount 等フラット変数） |
| `50 - 150` | `buf[key]` | バフ状態（固定長スロット） |

#### フラット化によるクローンの高速化
状態がフラットな `Float64Array(150)` になることで、Apply/Revert を実装せずとも、単なる型付き配列のコピー `new Float64Array(oldState)`（または `state.set(oldState)`）だけで状態の複製が極めて高速に実行できるようになります。

---

## 3. アビリティのバイトコード化 (仮想マシン型実行)

`cands.*.exec` に記述された JavaScript の命令的なロジックを、中間コード表現（バイトコード）に変更し、エンジンの VM ループで実行します。

### 3.1 バイトコード命令（Opcodes）の仕様案
アビリティの挙動を、以下の単純なデータ表現の配列で定義します。

```js
// ヤマト現神の祈りアビの宣言的バイトコード化の例
inori: {
  s: 160,
  exec: [
    { op: 'USE_ABIL', key: 'inori' },                     // CDをセット、T.ability++、CD中アビ反応
    { op: 'ADD_G', target: 'owner', amount: 100 },         // 自分自身のゲージを+100
    { op: 'SET_STATE', key: 'inori_p', value: 0 },         // inori_p = 0
    { op: 'ADD_BUF', key: 'inori_burst', duration: 'dur_inori_burst' } // 祈りバフ付与
  ]
}
```

### 3.3 仮想マシン実行ループ（VM Execution Loop）
シムエンジン内でのアビリティ実行は、コールスタックを作らずに単純な `switch-case` の繰り返しで行われます。
```js
function runByteCode(sim, instructions) {
  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    switch (inst.op) {
      case 'USE_ABIL':
        sim.use(inst.key, sim.T, sim.ord);
        break;
      case 'ADD_G':
        const target = inst.target === 'owner' ? ownerOf(inst.key) : inst.target;
        sim.addG([target], inst.amount);
        break;
      case 'SET_STATE':
        sim[inst.key] = inst.value;
        break;
      case 'ADD_BUF':
        (sim.buf[inst.key] ??= []).push(DMG[inst.duration]);
        break;
      // ...
    }
  }
}
```
これにより、JavaScriptのコンパイラや最適化（JIT）に依存せず、常に極めて安定した高速なシミュレーションループがブラウザ上で動作可能になります。

---

## 4. 実測によるボトルネック再評価（2026-06・Claude Code）

> [!IMPORTANT]
> 本セクションは §1〜3 の設計（clone除去/Flat State/Bytecode VM）に**優先度補正**を加えるもの。
> Node 実測により「clone/GC がボトルネック」という前提が否定されたため、Phase 3 の主標的を
> **ホットパス（`_candidates`/`_stepStatic`）のアロケーション削減**へ転換する。

### 4.1 計測方法
- 環境: Node 単体。`index.html` のエンジン領域 + `data/*.js` を eval 連結（CLAUDE.md 検証ワンライナーと同方式）。
- 対象形成: `edison + [yamato, hecate, tetra, elaine]`（基準形成・FB 10/10・91,723,594）。
- 計測: フル探索1回（`takeTurn(1..10)`）の総時間、メソッド呼出回数（ラッパ計装）、主要メソッドの単体スループット（μs/op）。

### 4.2 主要結果
- **フル探索1回 = 約12.6秒**（Node・基準形成）。
- **clone() は全体のわずか 2.8%（約356ms / 56,286回 × 6.335μs）。** → §1 Apply/Revert・§2 Flat State の費用対効果は極めて低い。
- **`_candidates()` が全体の約43%（約5,406ms / 2,971,405回 × 1.819μs）。** → 最大のボトルネック。

#### メソッド呼出回数（フル探索1回）
| メソッド | 呼出回数 |
|---|---|
| `_decay` | 4,421,444 |
| `_na` | 3,845,423 |
| `_candidates` | 2,971,405 |
| `_stepStatic` | 2,936,126 |
| `use` | 2,821,555 |
| `burst` | 1,349,412 |
| `_attackPhase` | 142,937 |
| `greedyTakeTurn` | 114,794 |
| `clone` | 56,286 |
| `_objective` | 28,143 |
| `_finishStatic` | 28,143 |
| `_beamSearch` | 10 |
| `_primeLookaheads` | 10 |

（探索定数: `BEAM_W=32` / `BEAM_W_INNER=4`）

#### 単体コストと推定総時間
| メソッド | μs/op | × 呼出回数 | 推定総時間 | 全体比 |
|---|---|---|---|---|
| `_candidates` | 1.819 | 2,971,405 | **5,406 ms** | **~43%** |
| `_na` | 0.078 | 3,845,423 | 300 ms | ~2.4% |
| `_decay` | 0.046 | 4,421,444 | 202 ms | ~1.6% |
| `clone` | 6.335 | 56,286 | 357 ms | ~2.8% |
| 残り(use/burst本体・制御フロー等) | — | — | ~6,300 ms | ~50% |

### 4.3 根本原因 — なぜ `_candidates()` が突出するか
`_candidates()` は呼出毎に以下を**全て新規アロケート**する（現行 index.html）:
1. `Object.entries(ABIL)` … 全アビ分の `[key,[...]]` 配列を毎回生成。
2. 合法候補ごとに候補オブジェクト `{s,key,col,exec,deploysRobot,prelude}` を生成。
3. 候補ごとに `exec` **クロージャ**を生成（`()=>cand.exec(...)` / `()=>sim.use(...)`）。

これが約297万回 → 数百万のオブジェクト/クロージャ/配列が生成・破棄され、確保コストと GC が累積。
さらに `_stepStatic`（294万回）は `_candidates()` の結果を `reduce` で**最大s 1件だけ**選んで実行しており、
**候補配列の完全生成は本質的に不要**（最大1件を選ぶだけならアロケーション不要で走査可能）。
`_candidates` 297万回のうち約99%が `_stepStatic` 由来（残りは beam/`_execKey`/root 列挙）。

### 4.4 補正後の Phase 3 主標的（優先度順）
1. **【最優先】`_stepStatic` のアロケーションフリー化**（挙動完全保存・ゴールデン値検証可）:
   - `buildFormation` 時に以下を事前計算（キャラ名リテラル不使用・Phase2フック方針と整合）:
     - `ABIL_KEYS = Object.keys(ABIL)`（毎回の `Object.entries` を排除）
     - `ABIL_CANDS[key] = CHAR_REGISTRY[owner]?.cands?.[key]`（毎回のネスト参照を排除）
     - `ABIL_BASE_S[key]`: `cand.s` が定数/未定義のものは `computeBaseScore` 結果を事前確定（関数 `s` は従来どおり走査時評価）。
   - `_stepStatic` を「候補配列を作らず ABIL_KEYS を1パス走査して最大s候補を直接実行」する形へ書換え。
     - タイブレーク厳密一致: 現行 `reduce((a,b)=>b.s>a.s?b:a)` は**先頭最大**を残す。`if(s>bestS)`（厳密 `>`）も先頭最大を残すため**選択は完全同一**。`Object.keys` の順序＝`Object.entries` の順序（挿入順）で走査順も同一。
   - 期待効果: `_candidates` 由来コスト(~5.4s)の大半を削減 → 全体 **~30-40% 高速化**見込み。
2. **【次点】`_candidates()`（beam用・フル候補列挙）の軽量化**: 事前計算マップ(ABIL_KEYS/ABIL_CANDS/ABIL_BASE_S)を共用し `Object.entries`/`computeBaseScore` 再計算を排除。beam由来は呼出数が少ない(~万)ため副次的。
3. **【任意・将来】§3 Bytecode VM**: `use`/`burst` 本体（~280万/~135万回）の per-op 削減には有効でありうるが、`data/characters.js` 全面書換えで規模・リスク大。1.が効いた後に再計測して要否判断。
4. **【非推奨化】§1 Apply/Revert・§2 Flat State**: clone は実測2.8%のため費用対効果が低く、リグレッションリスク（全mutation点のログ化/buf可変長スタックのフラット化）が見合わない。**当面棚上げ**。

### 4.5 再現方法
- 計測スクリプトは scratchpad に保存（`bench2.js`=フル探索1回+clone計数、`bench3.js`=メソッド呼出計数、`bench4.js`=_na/_candidates/_decay 単体μs）。
- 高速化実装時の回帰検証は Phase2 と同じゴールデン値方式（4形成: 全機構/Hecate無/Tetra無/Edison無 + Tetra入り8形成のターン毎詳細一致）。`_stepStatic` 書換えは**選択完全同一**が条件のため、基準値 91,723,594 を含む全形成一致をアサート。
