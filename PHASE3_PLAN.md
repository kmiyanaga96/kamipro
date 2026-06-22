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
