---
name: verify-transcribe-pipeline
description: Phase 9 T1（録画転記）の精度回帰。src/transcribe/ を触ったときに tools/fixtures/ の実走フィクスチャ（t1_glyph_atlas_M3-1.json / t1_hp_profiles_M3-1.json）で文字起こし・領域検出を回し、ベースラインからの精度低下・パースエラー・検査の消滅を原因箇所つきで報告する。
---

# verify-transcribe-pipeline

## いつ使うか

`src/transcribe/`・`transcribe/index.html`・`tools/t1_*.mjs`・`tools/fixtures/` を触ったとき。
**シム本体とは非結線**＝`npm run test:golden` は不要（golden に干渉しない）。

## 手順

### 1. 走らせる

```bash
node tools/skills/verify_transcribe_pipeline.mjs                  # 検証（ベースライン比較つき・約15秒）
node tools/skills/verify_transcribe_pipeline.mjs --skip-selftest  # フィクスチャ側だけ（1秒未満）
node tools/skills/verify_transcribe_pipeline.mjs --update-baseline  # 現在値を新ベースラインに（退行があると拒否）
```

見るもの:

| 区分 | 中身 |
|---|---|
| `[glyph]` | `leaveOneTeachingOut`（**教えた回ごと抜いて読む**＝未知の表示に一番近い指標）＋ `validateAtlas` |
| `[hp_bar]` | 実走プロファイル4本を `readFillRatio` に通し、visible / 塗り率 / 拒否理由を期待値と突合 |
| `[rois]` | 採寸済み 9 枠（`hp`/`hpbar`/`modebar`/`ct`/`debuff`/`dmg`/`abil`/`turn`/`gauge`）の存在 |
| `[selftest]` | `tools/t1_selftest.mjs` を**検査名ごと**に採り、ベースラインと突合 |

ベースライン＝`tools/skills/baselines/t1_baseline.json`。レポート＝`tools/skills/.reports/transcribe_*.json`。

### 2. 差分を読む

- **誤読が増えた / 正読が減った** → 照合パラメータ（ずらし許容・正規化）を戻して二分する。
  混同が特定の対（`3`/`5` 等）へ偏るなら、**照合器ではなく個体（緩い囲み）の疑い**＝教え直しが本筋。
- **曖昧が増えて誤りが減った** → 退化。「全部曖昧」にすれば誤読はゼロになるが自動化にならない。
- **検査が消滅した** → 回帰の穴。意図した整理なら理由を `tools/README.md` §4 に残してからベースラインを更新する。
- **パースエラー** → フィクスチャは手編集しない。`node tools/t1_teach_probe.mjs --atlas <path> --source <由来> <切り抜き>.json …` で作り直す。

### 3. 判断（ツールはここまで踏み込まない）

- **閾値を緩めて通すのは退行**。`tools/t1_selftest.mjs` の関門 `[16-15]`（誤≦6 / 正≧80 / 曖昧≦20）は
  実測へ**締め直す**方向にだけ動かす。
- 新しい切り抜きを受領してフィクスチャを作り直したら、`--update-baseline` でベースラインを更新し、
  関門の数値も実測へ締め直す（**両方やる** — 片方だけだと次のセッションで基準が二重になる）。
- ⚠ **合成で通っても実機で通る証明にはならない**（PHASE9_PLAN §4.3.0d/e/h＝実際に3回裏切られた）。
  実フレームでの確認はユーザーの観測（P2 出口条件）に委ねる — ここで「実機でも動く」と結論しない。

## 制約

- 実画像・動画はリポジトリに入れない（PHASE9_PLAN §10.3）。フィクスチャは**署名の数値だけ**という例外扱い。
- ユーザー手元の古い世代のアトラス JSON はそのまま使わない（cell 寸法が違う）。正は `tools/fixtures/` のもの。
