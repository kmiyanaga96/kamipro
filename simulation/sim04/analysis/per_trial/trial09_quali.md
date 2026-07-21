# trial09_quali — 単trial定性分析（trial09・言語のみ）

> **責務（per_trial 層）**: trial09.md の所感整理。**M2a judg単独・N=2（droid→alone→effond→judg）**。

## 1. ユーザー実機所感（出典=trial09 §3）
- **effond の正確な発動順（実機）**: アビリティ ⇒ **デバフ（敵防御DOWN）** ⇒（ムーンコード有効時は即座にバースト＆追加ダメージ）⇒ ロボ追撃。
  - ∴ **デバフがバースト・ロボ追撃に乗る**（effond自身の後続ダメに自前defdownが反映）。
  - **本測定への含意**: effond後に押したjudgにも effond_def が乗る＝**N=2走(trial09/10)はclean droid点にならず、droid+2とdefdownの二重変化**。rollupでdefdown寄与を分離。

## 2. 観測メモ
- effondアビ単発hit ≒72万（アビ枠）。ヘカテーはムーンコード経由で即バースト（本体3.51M/追加2.16M）。

## 3. 仮説の種
- effond_def の**発動タイミング（アビ直後・後続に反映）**はシムのモデル化（effond_def を damage 乗算に入れているか）の要確認点＝C31/C30 fit時に defdown 係数の帰属を確認。

## 4. 逸脱・特記
- M走・押し順自由。effondを反応源に使った代償としてdefdown confoundが入った（設計上の許容・分離可能）。
