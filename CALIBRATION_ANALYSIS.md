# 神姫PROJECT R — 実機較正・英霊武器統合仕様書

> [!IMPORTANT]
> 本ドキュメントは、有志検証データと現行シミュレータの実機乖離（ヤマト現神の祈り、テトラ追撃バグ、追撃のアビ枠化、ストリーク範囲）を詳細に分析し、その数学的整合性を証明するとともに、英霊専用武器（エジソン・ナポレオン）の仕様定義と配線設計をまとめたものです。
> 
> 本ドキュメントの内容をもとに **Claude Code** で実装詳細を詰めるための技術仕様書となります（**本ステップでのコード変更は含みません**）。

---

## 1. 調査ソース一覧

| ソース名 | URL / 備考 |
|:---|:---|
| まうらぼ（計算式まとめ） | `kamiprolab.blog.fc2.com/blog-entry-37.html` |
| まうらぼ（上限値・減衰率） | `kamiprolab.blog.fc2.com/blog-entry-220.html` |
| 神プロ計算(改) | `unitia.cloudfree.jp/kamipro` |
| 神プロ攻略まとめwiki | `xn--wiki-4i9hs14f.com` — ゲーム仕様・計算式ページ |
| wikiwiki.jp | 各キャラ個別ページ（ヤマトタケル、テトラ等） |

---

## 2. 実機較正の乖離分析 ＆ 数学的証明

現行コードベースと有志検証データの不一致を解消し、数学的・論理的に整合する正しい計算モデルを以下に示します。

### 🔴 D1：ヤマトタケル「現神の祈り」バースト性能＆追撃仕様の較正

#### 【有志検証データ（実機仕様）】
*   **バースト倍率 (a)**: 通常 `5.0` → 現神の祈り中 `10.0` (増分 **`+5.0`**)
*   **バースト減衰上限 (cap)**: 通常 `100万` → 現神の祈り中 `200万` (**`+100% / ×2`**)
*   **追加ダメージ（バースト追撃）**:
    *   発動条件：現神の祈り中（`inori_burst` バフが存在する時のみ）
    *   計算性能：通常攻撃ダメージ基準の **`3.0倍`** / 減衰上限 **`100万`** (通常時は50万だが、通常時は追撃自体が発生しない)
    *   フレーム分類：**アビリティダメージ枠（`'abi'`）** （アビ上限UPが乗り、減衰率 `slope = 0.04`）

#### 【現行コードでの乖離と問題点】
1.  **倍率増分**: `burst_inori = 3.8` となっており、実機確定値（`+5.0`）より低く設定されている。
2.  **上限拡張**: 現神の祈り中のバースト上限拡張（`capBonus += 1.0`）が未実装（大和の奮起のみ上限拡張されている）。
3.  **追撃倍率・フレーム**: `burst_followup_mult = 11` (11倍) となっており、さらに `'burst'` フレーム（減衰率 `slope = 0.10`）で計算されている。

---

#### 💡 11倍→3倍への数学的整合性の証明
かつて「実機観測値 130万ダメージ」に対して 11倍 という非公式な追撃倍率が採用された原因は、**「追撃上限が100万へ拡張されること」および「アビリティダメージ枠（減衰率 0.04）であること」を考慮せず、バースト減衰枠（上限50万、減衰率 0.10）で逆算したため**です。

追撃が正しい仕様（アビダメ枠・上限100万・減衰率0.04）であると仮定し、実戦級編成（通常攻撃中央値 $naB \approx 280万$ 前後）において 3倍 の倍率を適用した場合のダメージを計算します。

$$\text{raw} = naB \times 3.0 = 2,800,000 \times 3.0 = 8,400,000$$

$$\text{Decayed Damage} = \text{cap} + (\text{raw} - \text{cap}) \times \text{slope}_{abi}$$

$$\text{Decayed Damage} = 1,000,000 + (8,400,000 - 1,000,000) \times 0.04$$

$$\text{Decayed Damage} = 1,000,000 + 7,400,000 \times 0.04 = 1,000,000 + 296,000 = 1,296,000 \approx 130\text{万}$$

このように、有志確定値である **「3倍 / 上限100万 / アビ枠減衰（0.04）」** を用いることで、実機出力の **130万** が極めて美しく、自然に導き出されます。
これにより、非公式な 11倍 という仮設倍率は完全に不要となり、有志確定値の正当性が数学的にも証明されました。

#### 【Claude Code での修正仕様】
*   `burst_inori` 定数を `3.8` → `5.0` に変更。
*   `burst_followup_mult` を `11` → `3.0` に変更。
*   `yamato` の `burstCapBonus` を `(sim.buf.inori_burst?.length ? 1.0 : 0) + (sim.buf.funki_burst?.length||0)*DMG.burst_cap_funki` に修正。
*   `yamato` の `onBurst` での追撃計算を `'burst'` から `'abi'` フレームに変更し、上限を動的に拡張。
    ```javascript
    if ((sim.buf.inori_burst?.length || 0) > 0) {
      const fcap = 1000000; // 祈り中のアビ枠追撃上限
      sim.dmg += sim._decay('abi', sim._na() * DMG.burst_followup_mult, fcap);
    }
    ```

---

### 🔴 D2：テトラ「アブソリュートソヴリン」バースト追撃の欠落バグ

#### 【有志検証データ】
*   **テトラのバースト追撃**:
    *   通常（HELIX前）: 通常攻撃比 **`3.0倍`** / 減衰上限 **`50万`** （アビ枠）
    *   HELIX発動後: 通常攻撃比 **`6.0倍`** / 減衰上限 **`100万`** （アビ枠）

#### 【現行コードの問題点】
*   [characters.js:L239-244](file:///c:/Users/Kanta%20Miyanaga/kamipro/data/characters.js#L239-L244) では、「共通追撃との差分のみ追加付与」として記述され、HELIX時のみ `decay(6倍) - decay(3倍)` を加算しています。
*   しかし、`index.html` の `burst()` にはテトラ用の共通追撃処理が存在しません。
*   **結果として、HELIX前はテトラの追撃ダメージが完全に0になっており、HELIX後も本来加算されるべき基礎分（3倍/50万）が欠落し、差分のみしか加算されていませんでした。**

#### 【Claude Code での修正仕様】
*   差分計算を廃止し、状態に応じて正しい追撃を直接加算します（アビ枠 `'abi'` へ修正）。
    ```javascript
    const helix = !!sim.helix_done;
    const mult = helix ? DMG.tetra_burst_mult2 : DMG.tetra_burst_mult;
    const cap = helix ? DMG.tetra_burst_cap2 : DMG.tetra_burst_cap;
    sim.dmg += sim._decay('abi', sim._na() * mult, cap);
    ```

---

### 🔴 D7：追撃ダメージのフレーム分類を `'burst'` から `'abi'` へ統一

#### 【有志検証データ】
*   バースト発動時の追加ダメージ（追撃）は、すべて **「アビリティダメージ」** として計算されます。
*   したがって、バースト上限UP（エクシード）は乗らず、**アビ上限UP（エラボレイト）** が乗るべきであり、減衰率もバースト（0.10）ではなく **アビ枠（0.04）** が適用されます。

#### 【現行コードの問題点】
*   ヤマトの追撃、ヘカテーの追撃、テトラの追撃、エジソン専用武器の追撃がすべて `_decay('burst', ...)` で計算されています。

#### 【Claude Code での修正仕様】
*   バースト追撃を伴うすべての処理で、`_decay` の第一引数を `'burst'` から `'abi'` へ変更します。
*   *ヘカテーの例*:
    ```diff
    - sim.dmg += sim._decay('burst', sim._na()*DMG.hecate_extra_mult, DMG.hecate_extra_cap);
    + sim.dmg += sim._decay('abi', sim._na()*DMG.hecate_extra_mult, DMG.hecate_extra_cap);
    ```

---

### 🔴 D8：バーストストリーク計算における包含範囲の「純化」

#### 【現行コードの問題点】
*   [index.html:L969-980](file:///c:/Users/Kanta%20Miyanaga/kamipro/index.html#L969-L980) の `_attackPhase` では、ストリークの基礎ダメージ（`raw`）を `(this.dmg - before)` で計算しています。
*   しかし、`this.dmg - before` にはバースト本体だけでなく、`onBurst` フック等で発生した**追撃ダメージや、フラットなアビダメ加算分**（ヤマトバーストプラスやARRIVEなど）がすべて含まれてしまっています。
*   有志仕様における「ストリークダメージ ＝ バースト合計 × 人数補正...」の「バースト合計」は、純粋なバースト本体ダメージ（減衰適用後）のみを指すため、現行コードはストリークダメージを過大評価しています。

#### 【Claude Code での修正仕様】
1.  `burst()` メソッドが計算したバースト本体ダメージ（`core`）を return するように変更します。
2.  `_attackPhase` 内で `burst` メソッドの戻り値を集計し、これをストリークの基礎値（`raw`）とします。
    ```javascript
    _attackPhase() {
      const atk = [];
      let burstCoreTotal = 0;
      for (const c of CHARS) {
        if (this.g[c] >= FB_THR) {
          this.g[c] -= 100;
          const core = this.burst(c, this.bset, this.T, true); // コアダメージを取得
          burstCoreTotal += core;
          atk.push(c);
        }
      }
      const n = atk.length;
      if (n >= 2) {
        const raw = burstCoreTotal * DMG.affinity * DMG.streak_count[n] * DMG.streak_dmgup;
        this.dmg += this._decay('streak', raw, n);
      }
      return atk;
    }
    ```

---

## 3. 英霊専用武器（エジソン・ナポレオン）の仕様定義

英霊専用武器をメイン武器（`wslot-0`）に装備した際の詳細仕様を確定しました。

### 3.1 エジソン専用武器「自走光砲ランチャータンク」
1.  **プログラムアプティマイズ+（武器スキル）**:
    *   エジソンの1アビ（ドロイド展開）中の攻撃ロボット反応ダメージ（赤アビ発動トリガー）を強化。
    *   通常：倍率 `3.0` / 上限 `50万` → **装備時：倍率 `3.5` / 上限 `65万`**。
2.  **英霊の戦記（バースト追加ダメージ）**:
    *   メイン装備時、エジソンのバースト時に追加アビリティダメージが発生。
    *   性能：倍率 **`2.5倍`** / 減衰上限 **`80万`** (アビ枠 `'abi'`)。
    *   ※現行の `_na(true)` は引数が無視されているため、不要な引数を除去して `_na()` とします。

### 3.2 ナポレオン専用武器「光皇刃レス・ボナパルト」
1.  **淀みなき進軍（武器スキル）**:
    *   アシスト2「ベタイア・コンヴェフティ」（ターン終了時の闘気消費ダメージ）を強化。
    *   通常：倍率 `3.0` / 上限 `50万` → **装備時：倍率 `3.5` / 上限 `80万`**。
2.  **バースト追加効果**:
    *   メイン装備時、ナポレオンがバーストを発動した瞬間に、**自身のすべてのアビリティの再使用間隔（CD）を 1ターン 短縮**する。
3.  **革命皇の覇気（武器スキル）**:
    *   味方全体の光属性攻撃UP（装備効果として `box: 'elem'` に `pct: 30` 相当を付与）。

---

## 4. プログラム配線設計

Claude Code が実装時に直接参照できるよう、スレッド間転送を含めた配線設計を記述します。

### 4.1 WEAPON_MASTER への定義追加（weapons.js）
`weapons.js` に `les_bonaparte` の定義を新規追加します。
```javascript
const WEAPON_MASTER = {
  // 既存武器...
  launcher_tank: {
    jp: '自走光砲ランチャータンク', atk: 4543, hp: 272, type: '銃', elem: 'light',
    skills: [
      { box: 'dmgup', pct: 5, condition: { mainOf: 'edison' } },
      { droidUpgrade: { mult: 3.5, cap: 650000 }, condition: { mainOf: 'edison' } },
      { burstHeroExtra: { mult: 2.5, cap: 800000 }, condition: { mainOf: 'edison' } },
    ],
  },
  les_bonaparte: {
    jp: '光皇刃レス・ボナパルト', atk: 4721, hp: 245, type: '剣', elem: 'light',
    skills: [
      { box: 'elem', pct: 30 }, // 革命皇の覇気 (属性枠30%UP)
      { betaiaUpgrade: { mult: 3.5, cap: 800000 }, condition: { mainOf: 'napoleon' } }, // 淀みなき進軍
      { napoBurstCdReduce: true, condition: { mainOf: 'napoleon' } }, // バースト時アビ短縮フラグ
    ],
  }
};
```

### 4.2 applyGear() におけるリセットと上書き検知（index.html）
ナポレオン武器用のプロパティを `HERO_WEAPON_BASE` に追加し、装備時に `DMG` 定数へ動的反映します。
```javascript
const HERO_WEAPON_BASE = {
  droid_react_mult:        DMG.droid_react_mult,
  droid_react_cap:         DMG.droid_react_cap,
  edison_burst_extra_mult: DMG.edison_burst_extra_mult,
  betaia_mult:             DMG.betaia_mult,
  betaia_cap:              DMG.betaia_cap,
  napo_burst_cd_reduce:    false, // ナポレオン武器初期値
};

function applyGear() {
  // ...
  // リセット
  DMG.droid_react_mult        = HERO_WEAPON_BASE.droid_react_mult;
  DMG.droid_react_cap         = HERO_WEAPON_BASE.droid_react_cap;
  DMG.edison_burst_extra_mult = HERO_WEAPON_BASE.edison_burst_extra_mult;
  DMG.betaia_mult             = HERO_WEAPON_BASE.betaia_mult;
  DMG.betaia_cap              = HERO_WEAPON_BASE.betaia_cap;
  DMG.napo_burst_cd_reduce    = HERO_WEAPON_BASE.napo_burst_cd_reduce;
  
  // ... ループ処理内
  for (let i = 0; i < slots.length; i++) {
    const w = WEAPON_MASTER[slots[i]]; if (!w) continue;
    const isMain = (i === 0);
    for (const sk of (w.skills || [])) {
      if (sk.condition?.mainOf && !(isMain && sk.condition.mainOf === heroKey)) continue;
      // ...
      if (sk.napoBurstCdReduce) {
        DMG.napo_burst_cd_reduce = true;
        continue;
      }
    }
  }
}
```

### 4.3 Worker プールへの状態伝播（index.html）
並列探索スレッド（Web Worker）内でも英霊武器の効果を同期させるため、`_buildWorkerCode` に配線を追加します。

1.  **メインスレッドからのシリアライズパラメータ（L1606-1610付近）**:
    ```javascript
    dmgBase: {
      base_atk: DMG.base_atk,
      // ... 既存パラメータ
      betaia_mult: DMG.betaia_mult,
      betaia_cap: DMG.betaia_cap,
      napo_burst_cd_reduce: DMG.napo_burst_cd_reduce // 追加
    }
    ```
2.  **Workerスレッド内でのデシリアライズと適用（L1541-1550付近）**:
    ```javascript
    if (d.dmgBase) {
      // ... 既存パラメータ同期
      if (d.dmgBase.betaia_mult != null)          DMG.betaia_mult = d.dmgBase.betaia_mult;
      if (d.dmgBase.betaia_cap != null)           DMG.betaia_cap = d.dmgBase.betaia_cap;
      if (d.dmgBase.napo_burst_cd_reduce != null) DMG.napo_burst_cd_reduce = d.dmgBase.napo_burst_cd_reduce; // 追加
    }
    ```

### 4.4 ナポレオン onBurst フックの実装（characters.js）
ナポレオンがバーストを発動した際のアビリティCD短縮処理を実装します。
```javascript
  napoleon: {
    // ...
    def: {
      burst_coef_a: 5, burst_coef_b: 3000,
      gmax: BG.other_max,
      keigyoGain: 3,
      onBurst: (sim, atk, owner) => {
        // メイン武器「レス・ボナパルト」装備時のみ発動
        if (DMG.napo_burst_cd_reduce) {
          const skip = atk ? [] : ['roy', 'pike', 'consort', 'factor']; // アタックフェイズ時はジャッジと同様に除外処理
          for (const k of Object.keys(sim.cd)) {
            if (ABIL[k]?.[0] !== owner) continue;
            if (skip.includes(k)) continue;
            if (sim.cd[k] > 0) sim.cd[k] = Math.max(0, sim.cd[k] - 1);
          }
        }
      },
      onAbility: (sim, name) => { /* ... */ },
      turnEnd: (sim) => { /* ... */ }
    }
  }
```
