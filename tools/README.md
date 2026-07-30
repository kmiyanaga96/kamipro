# tools/ — 較正・探索ハーネス（現役）

> **種別**: 規定（置き場所の説明・生きた台帳）
> **ゴール**: 較正/探索の計測ハーネスを1か所に集約し、**台帳に載った数値がすべて再現可能**な状態を保つ。
> **完了条件**: なし（生きた台帳）
> 作成 2026-07-28（`archive/tools/` から**ルートへ昇格**＝現役ツールが歴史台帳配下にあり見つけにくかったため。ユーザー承認済み・REPO_STANDARDS §2 の体系変更）

---

## 使い方の原則

- **すべて production 非改変**（`src/*` を import するだけ）。実行しても golden に影響しない。
- 実験を回す前に **REPO_STANDARDS §6「実験・計測を回すときの作法」E1〜E8** を通すこと。とくに **E2（config 再現は既知値との bit 一致を先に確認）** と **E8（1条件=1プロセス）**。
- **実測コストは CLAUDE.md「実測コスト」表が正**（napoleon 1ルート ~127s 等）。コード内の古い性能記述を前提にしないこと（E1）。

## 1. 較正・探索ハーネス（従来から現役）

| スクリプト | 用途 |
|---|---|
| `search_calibrate.mjs` | 静的スコア自動較正の再fit（**ダメージモデルを変えたら必ず実行**） |
| `search_calibrate_e2e.mjs` | 較正phase→本探索phase の2段配線を単一プロセスで検証 |
| `search_probe.mjs` | N ターン探索の総ダメージ・時間・per-turn 使用回数 |
| `search_validate.mjs` | 探索 order を独立replay で再生し `探索dmg==replay dmg` & `skip=0` を検証 |
| `search_autocal.mjs` | 静的 s の掃引（C15 案(c) の原型） |
| `search_lever_scan.mjs` / `search_lever_verify.mjs` | 較正レバー候補の proxy 掃引 → full 検証（C17） |
| `search_gear_probe.mjs` | ギア別の較正適応を確認（C15 §6.10） |
| `c27_refine_probe.mjs` | C27 定石リファインの上限測定・冪等/後出し検証・キャッシュ復元 |
| `ml_fit_static{,_v2}.mjs` | Phase 7 静的スコアML化 PoC（`npm run poc:ml`・**クローズ済だが再開用に温存**） |

## 2. 探索品質の実験ハーネス（2026-07-28 追加）

**C37/C38 の根拠となった数値を出したスクリプト。結果と解釈は `simulation/sim05/search_quality_experiments.md` が正**（本表は「どの数値がどのスクリプト由来か」の対応のみ）。

| スクリプト | 出した数値（→ 実験記録の節） |
|---|---|
| `exp_beam_width_sweep.mjs` | BW 64〜512 掃引＝BW64 が最悪点・非単調（§1） |
| `exp_prefix_sweep.mjs` | 全17prefix 掃引＝`PREFIX_TOPK=8` は転移・損失0.017%・3層構造（§2） |
| `exp_atk_sensitivity_napoleon.mjs` | ナポ ATK感度＝押し順7割変化・**ダメージ非単調**（§3） |
| `exp_atk_sensitivity_edison.mjs` | A1 エジソン対照＝**厳密単調・一致99.2〜100%**（§6） |
| `exp_local_search.mjs` | 局所探索（近傍3種）＝+3.024%（§5・実験5b） |
| `exp_local_search_multistart.mjs` | 多点スタート＝`pike` 起点 +6.88%（§5・実験5c） |
| `exp_local_search_control.mjs` | **対照**＝BW384+LS が多点LSを上回る（§5・実験5d） |
| `exp_abilcap_isolation.mjs` | B1＝**不安定性の原因は abilCap 19 で確定**（§6b） |
| `exp_horizon_sensitivity.mjs` | B2＝押し順は3分の2変わるが累積は不変（§6d） |
| `exp_buffcount_diag.mjs` | buffCount の buf キー別分解＝全tier が T1 から到達（C38・`buffcount_sim_side_diag.md`） |
| `exp_order_compare.mjs` | 2×2 比較（順×ATK基準）でリプレイ突合＝**G3 v1 撤回の発見に使用** |
| `exp_c27_vs_localsearch.mjs` | B3＝C27 リファインは局所探索に包含されるか（refine無し+LS vs refine有り+LS）＋C27 単独の寄与（§6e） |
| `exp_c27_vs_localsearch_edison.mjs` | B3b＝**エジソン**で C27 単独の改善を LS が包含するか（(a)素/(b)C27単独/(c)素+LS/(d)refine+LS の4点。B3 はナポ編成で C27 が発火せず判定不能だったため）（§6f） |
| `exp_prefix_route_identity.mjs` | C1＝実験1 の「中位7本（総ダメ完全同値）は同一ルートか」をキー列で厳密比較（未検証だった推定を潰す）（§6g） |

### 共通の注意

- **config は各スクリプト冒頭にハードコード**（GEAR/サブ枠/英霊武器/敵/override）。**編成や config を変えるときは、まず既知値との bit 一致を確認してから**回すこと（E2。`napo_burst_cd_reduce`・`betaia_*`・`CURRENT_SUBS` は `_configSig` に含まれないため、キャッシュJSONを読むだけでは検出できない）。
- `exp_atk_sensitivity_*` / `exp_abilcap_isolation` / `exp_horizon_sensitivity` は **引数でスケール/ホライズンを指定し、1条件=1プロセス**で回す設計（E8）。基準条件の押し順を JSON に落として次の条件が読む。
- 出力先の JSON パスが `/tmp/.../scratchpad` を指しているものがある。**恒久的に使うなら書き換えること**（scratchpad はセッション毎に消える）。
